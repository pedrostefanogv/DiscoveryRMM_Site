import { vi } from "vitest";
import { natsSubjectMatches } from "@/utils/natsSubjects";

export interface RecordedPublish {
  subject: string;
  replyTo?: string;
  headersRaw?: string;
  payloadBytes: Uint8Array;
  payloadText: string;
  json: Record<string, unknown> | null;
}

export interface ConnectPayloadRecord {
  url: string;
  payload: Record<string, unknown>;
}

export type PublishHook = (pub: RecordedPublish, conn: MockNatsConnectionHandle) => void;

export interface MockNatsConnectionHandle {
  id: number;
  url: string;
  readyState: number;
  connectPayload: Record<string, unknown> | null;
  subscriptions: ReadonlyMap<string, string>;
  readonly pongsReceived: number;
  serverPublish: (
    subject: string,
    payload: string | Uint8Array | Record<string, unknown>,
    replyTo?: string,
  ) => void;
  serverPublishRawText: (rawNatsWireText: string) => void;
  serverPublishRawBytes: (bytes: Uint8Array) => void;
  serverPublishHeaders: (
    subject: string,
    headersText: string,
    payload: string | Uint8Array | Record<string, unknown>,
    replyTo?: string,
  ) => void;
  serverError: (message: string, closeCode?: number) => void;
  closeFromServer: (code?: number, reason?: string) => void;
}

export interface NatsWsMockOptions {
  serverInfo?: Record<string, unknown>;
  rejectAuthOnConnect?: (
    connectPayload: Record<string, unknown>,
    url: string,
    attemptIndex: number,
  ) => string | null;
}

export interface NatsWsMockController {
  connections: MockNatsConnectionHandle[];
  connectUrls: string[];
  connectPayloads: ConnectPayloadRecord[];
  published: RecordedPublish[];
  get lastConnection(): MockNatsConnectionHandle | undefined;
  onPublish: (hook: PublishHook) => () => void;
  serverPublish: (
    subject: string,
    payload: string | Uint8Array | Record<string, unknown>,
    replyTo?: string,
  ) => void;
  publishBinaryFileFrame: (
    subject: string,
    headerJson: Record<string, unknown>,
    rawBytes: Uint8Array,
  ) => void;
  publishTunnelFrame: (
    subject: string,
    opByte: number,
    streamId: number,
    rawPayload: Uint8Array,
  ) => void;
  restore: () => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b.slice();
  if (b.length === 0) return a.slice();
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function findCrlfIndex(buf: Uint8Array): number {
  for (let i = 0; i <= buf.length - 2; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

function encodePayload(payload: string | Uint8Array | Record<string, unknown>): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  if (typeof payload === "string") return encoder.encode(payload);
  return encoder.encode(JSON.stringify(payload));
}

export function buildBinaryFileFrame(
  headerJson: Record<string, unknown>,
  rawBytes: Uint8Array,
): Uint8Array {
  const headerBytes = encoder.encode(JSON.stringify(headerJson));
  const out = new Uint8Array(2 + 4 + headerBytes.length + rawBytes.length);
  out[0] = 0x44; // 'D'
  out[1] = 0x46; // 'F'
  const view = new DataView(out.buffer);
  view.setUint32(2, headerBytes.length, false);
  out.set(headerBytes, 6);
  out.set(rawBytes, 6 + headerBytes.length);
  return out;
}

export function buildTunnelFrame(
  opByte: number,
  streamId: number,
  rawPayload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const out = new Uint8Array(6 + rawPayload.length);
  out[0] = 0x01;
  out[1] = opByte & 0xff;
  const view = new DataView(out.buffer);
  view.setUint32(2, streamId >>> 0, false);
  out.set(rawPayload, 6);
  return out;
}

export function installNatsWsMock(options: NatsWsMockOptions = {}): NatsWsMockController {
  const originalWebSocket = globalThis.WebSocket;
  const originalTextEncoder = globalThis.TextEncoder;
  const probe = new originalTextEncoder().encode("a");
  if (!(probe instanceof globalThis.Uint8Array)) {
    class RealmAlignedTextEncoder extends originalTextEncoder {
      override encode(input?: string): Uint8Array<ArrayBuffer> {
        const raw = super.encode(input);
        const out = new globalThis.Uint8Array(raw.byteLength);
        out.set(raw);
        return out as Uint8Array<ArrayBuffer>;
      }
    }
    vi.stubGlobal("TextEncoder", RealmAlignedTextEncoder);
  }
  const connections: MockNatsConnectionHandle[] = [];
  const connectUrls: string[] = [];
  const connectPayloads: ConnectPayloadRecord[] = [];
  const published: RecordedPublish[] = [];
  const publishHooks = new Set<PublishHook>();
  let nextConnId = 0;

  class MockNatsWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readonly url: string;
    binaryType: BinaryType = "blob";
    readyState = MockNatsWebSocket.CONNECTING;
    protocol = "";
    extensions = "";
    bufferedAmount = 0;

    onopen: ((ev: Event) => unknown) | null = null;
    onmessage: ((ev: MessageEvent) => unknown) | null = null;
    onerror: ((ev: Event) => unknown) | null = null;
    onclose: ((ev: CloseEvent) => unknown) | null = null;

    private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    private recvBuf = new Uint8Array(0);
    private subs = new Map<string, string>(); // sid -> subject
    private subMax = new Map<string, number>();
    private connectPayload: Record<string, unknown> | null = null;
    private pongCount = 0;
    private closedFlag = false;
    private connHandle: MockNatsConnectionHandle;
    private attemptIndex: number;

    constructor(url: string | URL) {
      this.url = typeof url === "string" ? url : url.toString();
      this.attemptIndex = connections.length;
      const connId = ++nextConnId;
      connectUrls.push(this.url);

      const self = this;
      this.connHandle = {
        id: connId,
        url: this.url,
        get readyState() {
          return self.readyState;
        },
        get connectPayload() {
          return self.connectPayload;
        },
        subscriptions: this.subs,
        get pongsReceived() {
          return self.pongCount;
        },
        serverPublish: (subject, payload, replyTo) =>
          this.deliverMsg(subject, payload, replyTo),
        serverPublishRawText: (rawText) =>
          this.deliverRaw(encoder.encode(rawText)),
        serverPublishRawBytes: (bytes) => this.deliverRaw(bytes),
        serverPublishHeaders: (subject, headersText, payload, replyTo) =>
          this.deliverHmsg(subject, headersText, payload, replyTo),
        serverError: (message, closeCode = 4000) => {
          this.deliverRaw(encoder.encode(`-ERR '${message}'\r\n`));
          this.closeFromServer(closeCode, message, false);
        },
        closeFromServer: (code = 1006, reason = "") =>
          this.closeFromServer(code, reason, code === 1000),
      };
      connections.push(this.connHandle);

      queueMicrotask(() => {
        if (this.closedFlag) return;
        this.readyState = MockNatsWebSocket.OPEN;
        this.dispatch("open", new Event("open"));
        const info = {
          server_id: "E2E-MOCK-NATS",
          server_name: "e2e-mock-nats",
          version: "2.10.24",
          proto: 1,
          headers: true,
          max_payload: 1048576,
          client_id: connId,
          ...options.serverInfo,
        };
        this.deliverRaw(encoder.encode(`INFO ${JSON.stringify(info)}\r\n`));
      });
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (!listener) return;
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (!listener) return;
      this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
      this.dispatch(event.type, event);
      return true;
    }

    private dispatch(type: string, event: Event) {
      const handler =
        type === "open"
          ? this.onopen
          : type === "message"
            ? this.onmessage
            : type === "error"
              ? this.onerror
              : type === "close"
                ? this.onclose
                : null;
      if (typeof handler === "function") {
        handler.call(this, event as never);
      }
      const set = this.listeners.get(type);
      if (set) {
        for (const l of set) {
          if (typeof l === "function") l.call(this, event);
          else l.handleEvent(event);
        }
      }
    }

    private deliverRaw(bytes: Uint8Array) {
      if (this.closedFlag || this.readyState !== MockNatsWebSocket.OPEN) return;
      let data: ArrayBuffer | Blob;
      if (this.binaryType === "arraybuffer") {
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        data = ab;
      } else {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        data = new Blob([copy.buffer]);
      }
      this.dispatch("message", new MessageEvent("message", { data }));
    }

    private consumeSubMax(sid: string) {
      const max = this.subMax.get(sid);
      if (max !== undefined) {
        if (max <= 1) {
          this.subs.delete(sid);
          this.subMax.delete(sid);
        } else {
          this.subMax.set(sid, max - 1);
        }
      }
    }

    private deliverMsg(
      subject: string,
      payload: string | Uint8Array | Record<string, unknown>,
      replyTo?: string,
    ) {
      const payloadBytes = encodePayload(payload);
      for (const [sid, pattern] of this.subs.entries()) {
        if (!natsSubjectMatches(pattern, subject)) continue;
        const header = replyTo
          ? `MSG ${subject} ${sid} ${replyTo} ${payloadBytes.length}\r\n`
          : `MSG ${subject} ${sid} ${payloadBytes.length}\r\n`;
        const headerBytes = encoder.encode(header);
        const frame = new Uint8Array(headerBytes.length + payloadBytes.length + 2);
        frame.set(headerBytes, 0);
        frame.set(payloadBytes, headerBytes.length);
        frame[headerBytes.length + payloadBytes.length] = 13;
        frame[headerBytes.length + payloadBytes.length + 1] = 10;
        this.deliverRaw(frame);
        this.consumeSubMax(sid);
      }
    }

    private deliverHmsg(
      subject: string,
      headersText: string,
      payload: string | Uint8Array | Record<string, unknown>,
      replyTo?: string,
    ) {
      const hdrStr = headersText.endsWith("\r\n\r\n")
        ? headersText
        : `${headersText.replace(/\r?\n$/, "")}\r\n\r\n`;
      const hdrBytes = encoder.encode(hdrStr);
      const payloadBytes = encodePayload(payload);
      const total = hdrBytes.length + payloadBytes.length;
      for (const [sid, pattern] of this.subs.entries()) {
        if (!natsSubjectMatches(pattern, subject)) continue;
        const line = replyTo
          ? `HMSG ${subject} ${sid} ${replyTo} ${hdrBytes.length} ${total}\r\n`
          : `HMSG ${subject} ${sid} ${hdrBytes.length} ${total}\r\n`;
        const lineBytes = encoder.encode(line);
        const frame = new Uint8Array(lineBytes.length + total + 2);
        frame.set(lineBytes, 0);
        frame.set(hdrBytes, lineBytes.length);
        frame.set(payloadBytes, lineBytes.length + hdrBytes.length);
        frame[lineBytes.length + total] = 13;
        frame[lineBytes.length + total + 1] = 10;
        this.deliverRaw(frame);
        this.consumeSubMax(sid);
      }
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (this.closedFlag || this.readyState !== MockNatsWebSocket.OPEN) {
        return;
      }
      let chunk: Uint8Array;
      if (typeof data === "string") {
        chunk = encoder.encode(data);
      } else if (ArrayBuffer.isView(data)) {
        chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else if (
        data instanceof ArrayBuffer ||
        Object.prototype.toString.call(data) === "[object ArrayBuffer]"
      ) {
        chunk = new Uint8Array(data as ArrayBuffer);
      } else {
        chunk = new Uint8Array(0);
      }
      this.recvBuf = concatBytes(this.recvBuf, chunk);
      this.processIncomingBuffer();
    }

    private processIncomingBuffer() {
      while (!this.closedFlag) {
        const lineEnd = findCrlfIndex(this.recvBuf);
        if (lineEnd < 0) return;

        const line = decoder.decode(this.recvBuf.subarray(0, lineEnd));
        const trimmed = line.trim();
        if (!trimmed) {
          this.recvBuf = this.recvBuf.subarray(lineEnd + 2);
          continue;
        }
        const tokens = trimmed.split(/\s+/);
        const cmd = tokens[0]?.toUpperCase();

        if (cmd === "PUB") {
          // PUB <subject> [reply-to] <#bytes>
          const subject = tokens[1] ?? "";
          const replyTo = tokens.length === 4 ? tokens[2] : undefined;
          const byteLen = Number.parseInt(tokens[tokens.length - 1] ?? "0", 10);
          const payloadStart = lineEnd + 2;
          const payloadEnd = payloadStart + byteLen;
          if (this.recvBuf.length < payloadEnd + 2) return;
          const payloadBytes = this.recvBuf.slice(payloadStart, payloadEnd);
          this.recvBuf = this.recvBuf.subarray(payloadEnd + 2);
          this.recordPublish({ subject, replyTo, payloadBytes });
          continue;
        }

        if (cmd === "HPUB") {
          // HPUB <subject> [reply-to] <#header-bytes> <#total-bytes>
          const subject = tokens[1] ?? "";
          const hasReply = tokens.length === 5;
          const replyTo = hasReply ? tokens[2] : undefined;
          const hdrLen = Number.parseInt(tokens[hasReply ? 3 : 2] ?? "0", 10);
          const totalLen = Number.parseInt(tokens[hasReply ? 4 : 3] ?? "0", 10);
          const start = lineEnd + 2;
          const end = start + totalLen;
          if (this.recvBuf.length < end + 2) return;
          const headersRaw = decoder.decode(this.recvBuf.subarray(start, start + hdrLen));
          const payloadBytes = this.recvBuf.slice(start + hdrLen, end);
          this.recvBuf = this.recvBuf.subarray(end + 2);
          this.recordPublish({ subject, replyTo, headersRaw, payloadBytes });
          continue;
        }

        this.recvBuf = this.recvBuf.subarray(lineEnd + 2);

        if (cmd === "CONNECT") {
          const jsonText = line.slice(line.toUpperCase().indexOf("CONNECT") + 7).trim();
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(jsonText) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          this.connectPayload = parsed;
          connectPayloads.push({ url: this.url, payload: parsed });

          const rejectMsg = options.rejectAuthOnConnect?.(
            parsed,
            this.url,
            this.attemptIndex,
          );
          if (rejectMsg) {
            queueMicrotask(() => {
              this.deliverRaw(encoder.encode(`-ERR '${rejectMsg}'\r\n`));
              this.closeFromServer(4000, rejectMsg, false);
            });
            return;
          }
          if (parsed.verbose === true) {
            queueMicrotask(() => {
              this.deliverRaw(encoder.encode("+OK\r\n"));
            });
          }
          continue;
        }

        if (cmd === "PING") {
          queueMicrotask(() => {
            this.deliverRaw(encoder.encode("PONG\r\n"));
          });
          continue;
        }

        if (cmd === "PONG") {
          this.pongCount += 1;
          continue;
        }

        if (cmd === "SUB") {
          // SUB <subject> [queue group] <sid>
          const subject = tokens[1] ?? "";
          const sid = tokens[tokens.length - 1] ?? "";
          if (subject && sid) {
            this.subs.set(sid, subject);
          }
          continue;
        }

        if (cmd === "UNSUB") {
          const sid = tokens[1] ?? "";
          const max = tokens[2] ? Number.parseInt(tokens[2], 10) : undefined;
          if (!max || max <= 0) {
            this.subs.delete(sid);
            this.subMax.delete(sid);
          } else {
            this.subMax.set(sid, max);
          }
          continue;
        }
      }
    }

    private recordPublish(input: {
      subject: string;
      replyTo?: string;
      headersRaw?: string;
      payloadBytes: Uint8Array;
    }) {
      const payloadText = decoder.decode(input.payloadBytes);
      let json: Record<string, unknown> | null = null;
      if (payloadText.trimStart().startsWith("{")) {
        try {
          json = JSON.parse(payloadText) as Record<string, unknown>;
        } catch {
          json = null;
        }
      }
      const rec: RecordedPublish = {
        subject: input.subject,
        replyTo: input.replyTo,
        headersRaw: input.headersRaw,
        payloadBytes: input.payloadBytes,
        payloadText,
        json,
      };
      published.push(rec);
      for (const hook of publishHooks) {
        hook(rec, this.connHandle);
      }
    }

    close(code = 1000, reason = "") {
      if (this.closedFlag) return;
      this.closedFlag = true;
      this.readyState = MockNatsWebSocket.CLOSED;
      queueMicrotask(() => {
        this.dispatch(
          "close",
          new CloseEvent("close", {
            code,
            reason,
            wasClean: code === 1000,
          }),
        );
      });
    }

    closeFromServer(code = 1006, reason = "", wasClean = false) {
      if (this.closedFlag) return;
      this.closedFlag = true;
      this.readyState = MockNatsWebSocket.CLOSED;
      queueMicrotask(() => {
        this.dispatch(
          "close",
          new CloseEvent("close", {
            code,
            reason,
            wasClean,
          }),
        );
      });
    }
  }

  vi.stubGlobal("WebSocket", MockNatsWebSocket as unknown as typeof WebSocket);

  return {
    connections,
    connectUrls,
    connectPayloads,
    published,
    get lastConnection() {
      return connections[connections.length - 1];
    },
    onPublish(hook: PublishHook) {
      publishHooks.add(hook);
      return () => publishHooks.delete(hook);
    },
    serverPublish(subject, payload, replyTo) {
      for (const c of connections) {
        if (c.readyState === 1) c.serverPublish(subject, payload, replyTo);
      }
    },
    publishBinaryFileFrame(subject, headerJson, rawBytes) {
      const frame = buildBinaryFileFrame(headerJson, rawBytes);
      for (const c of connections) {
        if (c.readyState === 1) c.serverPublish(subject, frame);
      }
    },
    publishTunnelFrame(subject, opByte, streamId, rawPayload) {
      const frame = buildTunnelFrame(opByte, streamId, rawPayload);
      for (const c of connections) {
        if (c.readyState === 1) c.serverPublish(subject, frame);
      }
    },
    restore() {
      vi.stubGlobal("WebSocket", originalWebSocket);
      vi.stubGlobal("TextEncoder", originalTextEncoder);
    },
  };
}

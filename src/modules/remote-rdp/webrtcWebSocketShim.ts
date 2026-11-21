/**
 * Shim ref-counted de `WebSocket` para rotear o IronRDP WASM (RDCleanPath)
 * por um data channel WebRTC (`rdp-cleanpath`), sem alterar o binário WASM.
 *
 * Só substitui `globalThis.WebSocket` enquanto houver >= 1 rota virtual ativa;
 * qualquer URL não registrada é delegada diretamente ao `WebSocket` nativo,
 * e ao desregistrar a última rota o `globalThis.WebSocket` original é restaurado.
 */

import type { RemoteWebRtcPeer, WebRtcChannelLabel } from "@/modules/remote-shared/webrtcPeer";

interface RouteEntry {
  peer: RemoteWebRtcPeer;
  channel: WebRtcChannelLabel;
}

const activeRoutes = new Map<string, RouteEntry>();
let OriginalWebSocket: typeof WebSocket | null = null;

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

class WebRtcDataChannelWebSocket {
  static readonly CONNECTING = WS_CONNECTING;
  static readonly OPEN = WS_OPEN;
  static readonly CLOSING = WS_CLOSING;
  static readonly CLOSED = WS_CLOSED;

  readonly CONNECTING = WS_CONNECTING;
  readonly OPEN = WS_OPEN;
  readonly CLOSING = WS_CLOSING;
  readonly CLOSED = WS_CLOSED;

  readonly url: string;
  readonly protocol = "";
  readonly extensions = "";
  readonly bufferedAmount = 0;
  binaryType: BinaryType = "blob";

  readyState: number = WS_CONNECTING;

  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;

  private readonly route: RouteEntry;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private unsubMsg: (() => void) | null = null;
  private unsubClose: (() => void) | null = null;
  private disposed = false;

  constructor(url: string, route: RouteEntry) {
    this.url = url;
    this.route = route;

    this.unsubMsg = route.peer.addMessageListener(route.channel, (buf) => {
      if (this.disposed || this.readyState !== WS_OPEN) return;
      const payload: unknown = this.binaryType === "arraybuffer" ? buf : new Blob([buf]);
      const ev = new MessageEvent("message", { data: payload });
      this.dispatch("message", ev);
    });

    this.unsubClose = route.peer.addCloseListener(route.channel, () => {
      this.finishClose(1006, "webrtc-channel-closed", false);
    });

    queueMicrotask(() => {
      if (this.disposed) return;
      if (this.route.peer.isChannelOpen(this.route.channel)) {
        this.readyState = WS_OPEN;
        this.dispatch("open", new Event("open"));
      } else {
        this.finishClose(1006, "webrtc-channel-unavailable", false);
      }
    });
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== WS_OPEN) {
      throw new DOMException("WebSocket is not open.", "InvalidStateError");
    }

    if (typeof data === "string") {
      if (!this.route.peer.send(this.route.channel, data)) {
        this.finishClose(1006, "webrtc-send-failed", false);
      }
      return;
    }

    if (data instanceof Blob) {
      void data.arrayBuffer().then((buf) => {
        if (!this.disposed && this.readyState === WS_OPEN) {
          if (!this.route.peer.send(this.route.channel, buf)) {
            this.finishClose(1006, "webrtc-send-failed", false);
          }
        }
      });
      return;
    }

    if (ArrayBuffer.isView(data)) {
      const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (!this.route.peer.send(this.route.channel, view)) {
        this.finishClose(1006, "webrtc-send-failed", false);
      }
      return;
    }

    const buf = data instanceof ArrayBuffer ? data : new Uint8Array(data).slice().buffer;
    if (!this.route.peer.send(this.route.channel, buf)) {
      this.finishClose(1006, "webrtc-send-failed", false);
    }
  }

  close(code = 1000, reason = ""): void {
    this.finishClose(code, reason, true);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const set = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(ev: Event): boolean {
    this.dispatch(ev.type, ev);
    return true;
  }

  private finishClose(code: number, reason: string, wasClean: boolean): void {
    if (this.disposed || this.readyState === WS_CLOSED) return;
    this.disposed = true;
    this.readyState = WS_CLOSED;
    this.unsubMsg?.();
    this.unsubMsg = null;
    this.unsubClose?.();
    this.unsubClose = null;
    const ev =
      typeof CloseEvent !== "undefined"
        ? new CloseEvent("close", { code, reason, wasClean })
        : (Object.assign(new Event("close"), { code, reason, wasClean }) as CloseEvent);
    this.dispatch("close", ev);
    this.listeners.clear();
  }

  private dispatch(type: string, ev: Event): void {
    const propHandler =
      type === "open"
        ? this.onopen
        : type === "message"
          ? this.onmessage
          : type === "error"
            ? this.onerror
            : type === "close"
              ? this.onclose
              : null;
    if (typeof propHandler === "function") {
      try {
        propHandler.call(this as unknown as WebSocket, ev as never);
      } catch {
        // isola erro de listener
      }
    }
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of Array.from(set)) {
      try {
        if (typeof listener === "function") {
          listener.call(this as unknown as WebSocket, ev);
        } else {
          listener.handleEvent(ev);
        }
      } catch {
        // isola erro de listener
      }
    }
  }
}

function ensureGlobalShimInstalled(): void {
  if (OriginalWebSocket !== null) return;
  const Native = globalThis.WebSocket;
  if (!Native) return;
  OriginalWebSocket = Native;

  const WrappedWebSocket = function (
    this: unknown,
    url: string | URL,
    protocols?: string | string[],
  ) {
    const urlStr = typeof url === "string" ? url : url.toString();
    const route = activeRoutes.get(urlStr);
    if (route) {
      return new WebRtcDataChannelWebSocket(urlStr, route) as unknown as WebSocket;
    }
    return new Native(url, protocols);
  } as unknown as typeof WebSocket;

  WrappedWebSocket.prototype = Native.prototype;
  Object.defineProperties(WrappedWebSocket, {
    CONNECTING: { value: WS_CONNECTING },
    OPEN: { value: WS_OPEN },
    CLOSING: { value: WS_CLOSING },
    CLOSED: { value: WS_CLOSED },
  });

  globalThis.WebSocket = WrappedWebSocket;
}

function restoreGlobalWebSocketIfIdle(): void {
  if (activeRoutes.size > 0 || OriginalWebSocket === null) return;
  globalThis.WebSocket = OriginalWebSocket;
  OriginalWebSocket = null;
}

/**
 * Registra uma rota virtual `WebSocket` respaldada pelo data channel WebRTC.
 * Devolve uma função de limpeza idempotente que restaura o `WebSocket` nativo
 * quando nenhuma rota ativa restar.
 */
export function registerWebRtcWebSocketRoute(
  virtualUrl: string,
  peer: RemoteWebRtcPeer,
  channel: WebRtcChannelLabel,
): () => void {
  ensureGlobalShimInstalled();
  activeRoutes.set(virtualUrl, { peer, channel });

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    activeRoutes.delete(virtualUrl);
    restoreGlobalWebSocketIfIdle();
  };
}

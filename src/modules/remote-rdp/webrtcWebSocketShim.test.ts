import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteWebRtcPeer } from "@/modules/remote-shared/webrtcPeer";
import { registerWebRtcWebSocketRoute } from "./webrtcWebSocketShim";

describe("webrtcWebSocketShim", () => {
  const realWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = realWebSocket;
  });

  it("delega URLs normais ao WebSocket nativo e restaura globalThis.WebSocket ao desregistrar", () => {
    const nativeCalls: string[] = [];
    const MockNative = vi.fn(function (this: unknown, url: string | URL) {
      nativeCalls.push(String(url));
      return { url: String(url), native: true };
    }) as unknown as typeof WebSocket;
    (MockNative as unknown as Record<string, number>).CONNECTING = 0;
    (MockNative as unknown as Record<string, number>).OPEN = 1;
    (MockNative as unknown as Record<string, number>).CLOSING = 2;
    (MockNative as unknown as Record<string, number>).CLOSED = 3;
    globalThis.WebSocket = MockNative;

    const peer = new RemoteWebRtcPeer({
      config: { enabled: true, iceServers: [], relayOnly: false, fallbackToNats: true },
      channels: ["rdp-cleanpath"],
      sendSignal: () => {},
      onMessage: () => {},
    });

    const unregister = registerWebRtcWebSocketRoute("wss://webrtc-rdp.local/s1/1", peer, "rdp-cleanpath");
    expect(globalThis.WebSocket).not.toBe(MockNative);

    const other = new globalThis.WebSocket("wss://example.com/nats/") as unknown as { native?: boolean };
    expect(other.native).toBe(true);
    expect(nativeCalls).toEqual(["wss://example.com/nats/"]);

    unregister();
    expect(globalThis.WebSocket).toBe(MockNative);
  });

  it("roteia open, send, message e close pela rota virtual WebRTC", async () => {
    const sent: unknown[] = [];
    let msgHandler: ((ev: MessageEvent) => void) | null = null;
    const triggerMsg = (ev: MessageEvent) => {
      msgHandler?.(ev);
    };
    const mockDc = {
      label: "rdp-cleanpath",
      binaryType: "arraybuffer",
      readyState: "open" as RTCDataChannelState,
      set onmessage(fn: (ev: MessageEvent) => void) {
        msgHandler = fn;
      },
      onopen: null as (() => void) | null,
      onclose: null as (() => void) | null,
      send: vi.fn((d: unknown) => sent.push(d)),
      close: vi.fn(),
    };
    const mockPc = {
      iceGatheringState: "complete",
      connectionState: "connected",
      localDescription: { type: "offer", sdp: "v=0\r\n" },
      onicecandidate: null,
      onconnectionstatechange: null,
      createDataChannel: vi.fn(() => mockDc as unknown as RTCDataChannel),
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\n" })),
      setLocalDescription: vi.fn(async () => {}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };

    const peer = new RemoteWebRtcPeer({
      config: { enabled: true, iceServers: [], relayOnly: false, fallbackToNats: true },
      channels: ["rdp-cleanpath"],
      sendSignal: () => {},
      onMessage: () => {},
      peerConnectionFactory: () => mockPc as unknown as RTCPeerConnection,
    });
    await peer.start();

    const unregister = registerWebRtcWebSocketRoute("wss://webrtc-rdp.local/s2/1", peer, "rdp-cleanpath");
    const ws = new globalThis.WebSocket("wss://webrtc-rdp.local/s2/1");
    ws.binaryType = "arraybuffer";

    const opened = new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    await opened;
    expect(ws.readyState).toBe(1);

    const reqBytes = new Uint8Array([0x30, 0x01, 0x02]);
    ws.send(reqBytes);
    expect(sent).toHaveLength(1);

    const received: ArrayBuffer[] = [];
    ws.onmessage = (ev) => {
      received.push(ev.data as ArrayBuffer);
    };
    triggerMsg({ data: new Uint8Array([0x30, 0x03]).buffer } as MessageEvent);
    expect(received).toHaveLength(1);
    expect(new Uint8Array(received[0])).toEqual(new Uint8Array([0x30, 0x03]));

    let closed = false;
    ws.onclose = () => {
      closed = true;
    };
    ws.close(1000, "done");
    expect(closed).toBe(true);
    expect(ws.readyState).toBe(3);

    unregister();
    peer.close();
  });
});

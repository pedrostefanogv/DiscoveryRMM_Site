import { describe, expect, it, vi } from "vitest";
import { RemoteWebRtcPeer, type WebRtcSignalFrame } from "./webrtcPeer";

interface MockDataChannel {
  label: string;
  binaryType: string;
  readyState: RTCDataChannelState;
  sent: unknown[];
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: (() => void) | null;
  send: (data: unknown) => void;
  close: () => void;
}

function createMockPeerConnection() {
  const channels = new Map<string, MockDataChannel>();
  let localDescription: RTCSessionDescriptionInit | null = null;
  let remoteDescription: RTCSessionDescriptionInit | null = null;
  const addedCandidates: RTCIceCandidateInit[] = [];
  let closed = false;

  const pc = {
    iceGatheringState: "complete" as RTCIceGatheringState,
    connectionState: "new" as RTCPeerConnectionState,
    get localDescription() {
      return localDescription;
    },
    get remoteDescription() {
      return remoteDescription;
    },
    onicecandidate: null as ((ev: RTCPeerConnectionIceEvent) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    createDataChannel: vi.fn((label: string) => {
      const dc: MockDataChannel = {
        label,
        binaryType: "blob",
        readyState: "connecting",
        sent: [],
        onmessage: null,
        onclose: null,
        send(data: unknown) {
          dc.sent.push(data);
        },
        close() {
          dc.readyState = "closed";
          dc.onclose?.();
        },
      };
      channels.set(label, dc);
      return dc as unknown as RTCDataChannel;
    }),
    createOffer: vi.fn(async () => ({ type: "offer" as RTCSdpType, sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" })),
    setLocalDescription: vi.fn(async (desc: RTCSessionDescriptionInit) => {
      localDescription = desc;
    }),
    setRemoteDescription: vi.fn(async (desc: RTCSessionDescriptionInit) => {
      remoteDescription = desc;
    }),
    addIceCandidate: vi.fn(async (cand: RTCIceCandidateInit) => {
      addedCandidates.push(cand);
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(() => {
      closed = true;
      pc.connectionState = "closed";
    }),
    // Helpers de teste
    _channels: channels,
    _addedCandidates: addedCandidates,
    get _closed() {
      return closed;
    },
  };

  return pc;
}

describe("RemoteWebRtcPeer", () => {
  it("aplica iceTransportPolicy relay quando relayOnly=true e envia offer com canais", async () => {
    const signals: WebRtcSignalFrame[] = [];
    let capturedConfig: RTCConfiguration | null = null;
    const mockPc = createMockPeerConnection();

    const peer = new RemoteWebRtcPeer({
      config: {
        enabled: true,
        iceServers: [{ urls: ["turn:turn.exemplo.com:3478"], username: "u", credential: "p" }],
        relayOnly: true,
        fallbackToNats: true,
      },
      channels: ["media", "control"],
      sendSignal: (f) => signals.push(f),
      onMessage: () => {},
      peerConnectionFactory: (cfg) => {
        capturedConfig = cfg;
        return mockPc as unknown as RTCPeerConnection;
      },
    });

    await peer.start();

    expect(capturedConfig).toEqual({
      iceServers: [{ urls: ["turn:turn.exemplo.com:3478"], username: "u", credential: "p" }],
      iceTransportPolicy: "relay",
    });
    expect(mockPc._channels.has("media")).toBe(true);
    expect(mockPc._channels.has("control")).toBe(true);
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("offer");
    expect(signals[0].sdp).toContain("v=0");
  });

  it("drena candidatos locais acumulados com a generation recebida no answer", async () => {
    const signals: WebRtcSignalFrame[] = [];
    const mockPc = createMockPeerConnection();

    const peer = new RemoteWebRtcPeer({
      config: { enabled: true, iceServers: [], relayOnly: false, fallbackToNats: true },
      channels: ["media", "control"],
      sendSignal: (f) => signals.push(f),
      onMessage: () => {},
      peerConnectionFactory: () => mockPc as unknown as RTCPeerConnection,
    });

    await peer.start();

    // Candidato descoberto antes do answer fica em fila aguardando generation.
    mockPc.onicecandidate?.({
      candidate: { candidate: "candidate:1 1 UDP 2122252543 127.0.0.1 5000 typ host" },
    } as unknown as RTCPeerConnectionIceEvent);

    expect(signals.filter((s) => s.kind === "candidate")).toHaveLength(0);

    await peer.handleSignal(JSON.stringify({
      kind: "answer",
      sdp: "v=0\r\na=ice-ufrag:abc\r\n",
      generation: 2,
    }));

    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0\r\na=ice-ufrag:abc\r\n",
    });
    const candSignals = signals.filter((s) => s.kind === "candidate");
    expect(candSignals).toHaveLength(1);
    expect(candSignals[0].generation).toBe(2);
    expect(candSignals[0].candidate).toContain("127.0.0.1");
  });

  it("entrega mensagens recebidas no canal media e controla send() por readyState", async () => {
    const received: Array<{ label: string; bytes: number }> = [];
    const mockPc = createMockPeerConnection();

    const peer = new RemoteWebRtcPeer({
      config: { enabled: true, iceServers: [], relayOnly: false, fallbackToNats: true },
      channels: ["media", "control"],
      sendSignal: () => {},
      onMessage: (label, data) => received.push({ label, bytes: data.byteLength }),
      peerConnectionFactory: () => mockPc as unknown as RTCPeerConnection,
    });

    await peer.start();

    // Antes de abrir, send() retorna false para cair no NATS.
    expect(peer.send("control", '{"type":"mousemove"}')).toBe(false);

    const controlDc = mockPc._channels.get("control")!;
    controlDc.readyState = "open";
    expect(peer.send("control", '{"type":"mousemove"}')).toBe(true);
    expect(controlDc.sent).toEqual(['{"type":"mousemove"}']);

    const mediaDc = mockPc._channels.get("media")!;
    mediaDc.onmessage?.({ data: new Uint8Array([1, 2, 3, 4]).buffer } as MessageEvent);
    expect(received).toEqual([{ label: "media", bytes: 4 }]);

    peer.close();
    expect(peer.send("control", "x")).toBe(false);
    expect(mockPc._closed).toBe(true);
  });

  it("fecha o peer de forma limpa ao receber frame error", async () => {
    const mockPc = createMockPeerConnection();

    const peer = new RemoteWebRtcPeer({
      config: { enabled: true, iceServers: [], relayOnly: false, fallbackToNats: true },
      channels: ["media"],
      sendSignal: () => {},
      onMessage: () => {},
      peerConnectionFactory: () => mockPc as unknown as RTCPeerConnection,
    });

    await peer.start();
    await peer.handleSignal(JSON.stringify({ kind: "error", reason: "negotiation-failed" }));

    expect(mockPc._closed).toBe(true);
  });
});

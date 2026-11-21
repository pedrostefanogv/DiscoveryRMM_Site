/**
 * Cliente WebRTC P2P do console (viewer ↔ agente).
 *
 * A sinalização (offer/answer/candidate/error) trafega pelos subjects NATS
 * dedicados `.webrtc.in` / `.webrtc.out`. O canal `.control` e a liveness
 * permanecem sempre no NATS.
 *
 * Qualquer falha de ICE ou ausência de suporte no navegador fecha o peer e
 * devolve `false` em `send()`, permitindo fallback transparente para o NATS.
 */

export type WebRtcChannelLabel = "media" | "control" | "tunnel" | "files" | "rdp-cleanpath";

export interface WebRtcPeerConfig {
  enabled: boolean;
  iceServers: RTCIceServer[];
  relayOnly: boolean;
  fallbackToNats: boolean;
}

export interface WebRtcSignalFrame {
  kind: "offer" | "answer" | "candidate" | "error";
  sdp?: string;
  candidate?: string;
  generation?: number;
  reason?: string;
}

export interface RemoteWebRtcPeerOptions {
  config: WebRtcPeerConfig;
  channels: WebRtcChannelLabel[];
  sendSignal: (frame: WebRtcSignalFrame) => void;
  onMessage: (label: WebRtcChannelLabel, data: ArrayBuffer) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
  /** Injetável em testes unitários para substituir o RTCPeerConnection nativo. */
  peerConnectionFactory?: (config: RTCConfiguration) => RTCPeerConnection;
  /** Tempo máximo (ms) aguardando candidatos iniciais antes de enviar a oferta. */
  offerGatherWaitMs?: number;
}

const DEFAULT_OFFER_GATHER_WAIT_MS = 1200;
const MAX_PENDING_CANDIDATES = 64;

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return view.slice().buffer;
  }
  if (typeof data === "string") {
    return new TextEncoder().encode(data).slice().buffer;
  }
  return null;
}

export class RemoteWebRtcPeer {
  private readonly options: RemoteWebRtcPeerOptions;
  private pc: RTCPeerConnection | null = null;
  private readonly channels = new Map<WebRtcChannelLabel, RTCDataChannel>();
  private readonly messageListeners = new Map<WebRtcChannelLabel, Set<(data: ArrayBuffer) => void>>();
  private readonly openWaiters = new Map<WebRtcChannelLabel, Set<(ok: boolean) => void>>();
  private readonly closeListeners = new Map<WebRtcChannelLabel, Set<() => void>>();
  private readonly pendingLocalCandidates: string[] = [];
  private remoteGeneration = 0;
  private closed = false;
  private gatherTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RemoteWebRtcPeerOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.closed || !this.options.config.enabled) return;

    const createPc =
      this.options.peerConnectionFactory ??
      (typeof RTCPeerConnection !== "undefined"
        ? (cfg: RTCConfiguration) => new RTCPeerConnection(cfg)
        : null);

    if (!createPc) return;

    try {
      const rtcConfig: RTCConfiguration = {
        iceServers: this.options.config.iceServers,
        iceTransportPolicy: this.options.config.relayOnly ? "relay" : "all",
      };

      const pc = createPc(rtcConfig);
      this.pc = pc;

      for (const label of this.options.channels) {
        const dc = pc.createDataChannel(label, { ordered: true });
        dc.binaryType = "arraybuffer";
        dc.onopen = () => {
          this.resolveOpenWaiters(label, true);
        };
        dc.onmessage = (ev: MessageEvent) => {
          if (this.closed) return;
          const buf = toArrayBuffer(ev.data);
          if (buf) {
            try {
              this.options.onMessage(label, buf);
            } catch {
              // Isola falha de decodificação de um frame sem derrubar a sessão.
            }
            const listeners = this.messageListeners.get(label);
            if (listeners) {
              for (const fn of listeners) {
                try {
                  fn(buf);
                } catch {
                  // Isola erro de listener individual.
                }
              }
            }
          }
        };
        dc.onclose = () => {
          if (this.channels.get(label) === dc) {
            this.channels.delete(label);
          }
          this.resolveOpenWaiters(label, false);
          const closeCbs = this.closeListeners.get(label);
          if (closeCbs) {
            for (const fn of closeCbs) {
              try {
                fn();
              } catch {
                // best-effort
              }
            }
          }
        };
        this.channels.set(label, dc);
      }

      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (this.closed || !ev.candidate?.candidate) return;
        const cand = ev.candidate.candidate;
        if (this.remoteGeneration > 0) {
          this.options.sendSignal({
            kind: "candidate",
            candidate: cand,
            generation: this.remoteGeneration,
          });
        } else if (this.pendingLocalCandidates.length < MAX_PENDING_CANDIDATES) {
          this.pendingLocalCandidates.push(cand);
        }
      };

      pc.onconnectionstatechange = () => {
        if (this.closed) return;
        const state = pc.connectionState;
        this.options.onStateChange?.(state);
        if (state === "failed") {
          try {
            this.options.sendSignal({ kind: "error", reason: "ice-failed-viewer" });
          } catch {
            // best-effort
          }
          this.close();
        }
      };

      const offer = await pc.createOffer();
      if (this.closed) return;
      await pc.setLocalDescription(offer);
      if (this.closed) return;

      await this.waitInitialGathering(pc);
      if (this.closed) return;

      const sdp = pc.localDescription?.sdp ?? offer.sdp;
      if (!sdp) {
        throw new Error("Oferta SDP vazia");
      }

      this.options.sendSignal({ kind: "offer", sdp });
    } catch (err) {
      if (!this.closed) {
        try {
          this.options.sendSignal({
            kind: "error",
            reason: err instanceof Error ? err.message : "webrtc-start-failed",
          });
        } catch {
          // best-effort
        }
        this.close();
      }
    }
  }

  private waitInitialGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    const waitMs = this.options.offerGatherWaitMs ?? DEFAULT_OFFER_GATHER_WAIT_MS;
    if (waitMs <= 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.gatherTimer) {
          clearTimeout(this.gatherTimer);
          this.gatherTimer = null;
        }
        pc.removeEventListener?.("icegatheringstatechange", onState);
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === "complete" || this.closed) {
          finish();
        }
      };
      pc.addEventListener?.("icegatheringstatechange", onState);
      this.gatherTimer = setTimeout(finish, waitMs);
    });
  }

  async handleSignal(rawText: string): Promise<void> {
    if (this.closed || !this.pc) return;

    let frame: WebRtcSignalFrame;
    try {
      frame = JSON.parse(rawText) as WebRtcSignalFrame;
    } catch {
      return;
    }

    if (!frame || typeof frame.kind !== "string") return;

    switch (frame.kind) {
      case "answer": {
        if (!frame.sdp) return;
        const gen = typeof frame.generation === "number" && frame.generation > 0 ? frame.generation : 1;
        this.remoteGeneration = gen;
        try {
          await this.pc.setRemoteDescription({ type: "answer", sdp: frame.sdp });
          if (this.closed) return;
          while (this.pendingLocalCandidates.length > 0) {
            const cand = this.pendingLocalCandidates.shift();
            if (cand) {
              this.options.sendSignal({
                kind: "candidate",
                candidate: cand,
                generation: gen,
              });
            }
          }
        } catch {
          this.close();
        }
        break;
      }

      case "candidate": {
        if (!frame.candidate) return;
        try {
          await this.pc.addIceCandidate({ candidate: frame.candidate });
        } catch {
          // Candidato inválido ou peer já encerrado: ignora.
        }
        break;
      }

      case "error": {
        this.close();
        break;
      }
    }
  }

  send(label: WebRtcChannelLabel, data: string | ArrayBuffer | Uint8Array): boolean {
    if (this.closed) return false;
    const dc = this.channels.get(label);
    if (!dc || dc.readyState !== "open") return false;

    try {
      if (typeof data === "string") {
        dc.send(data);
      } else if (data instanceof ArrayBuffer) {
        dc.send(data);
      } else {
        dc.send(data.slice().buffer);
      }
      return true;
    } catch {
      return false;
    }
  }

  isChannelOpen(label: WebRtcChannelLabel): boolean {
    if (this.closed) return false;
    return this.channels.get(label)?.readyState === "open";
  }

  waitForChannelOpen(label: WebRtcChannelLabel, timeoutMs: number): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.isChannelOpen(label)) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const waiters = this.openWaiters.get(label) ?? new Set<(ok: boolean) => void>();
      this.openWaiters.set(label, waiters);

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        waiters.delete(finish);
        resolve(ok);
      };

      const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
      waiters.add(finish);
    });
  }

  addMessageListener(label: WebRtcChannelLabel, listener: (data: ArrayBuffer) => void): () => void {
    const set = this.messageListeners.get(label) ?? new Set<(data: ArrayBuffer) => void>();
    set.add(listener);
    this.messageListeners.set(label, set);
    return () => {
      set.delete(listener);
    };
  }

  addCloseListener(label: WebRtcChannelLabel, listener: () => void): () => void {
    const set = this.closeListeners.get(label) ?? new Set<() => void>();
    set.add(listener);
    this.closeListeners.set(label, set);
    return () => {
      set.delete(listener);
    };
  }

  private resolveOpenWaiters(label: WebRtcChannelLabel, ok: boolean): void {
    const waiters = this.openWaiters.get(label);
    if (!waiters) return;
    for (const fn of Array.from(waiters)) {
      fn(ok);
    }
    waiters.clear();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const label of Array.from(this.openWaiters.keys())) {
      this.resolveOpenWaiters(label, false);
    }
    for (const closeCbs of this.closeListeners.values()) {
      for (const fn of Array.from(closeCbs)) {
        try {
          fn();
        } catch {
          // best-effort
        }
      }
    }
    this.messageListeners.clear();
    this.closeListeners.clear();

    if (this.gatherTimer) {
      clearTimeout(this.gatherTimer);
      this.gatherTimer = null;
    }

    for (const dc of this.channels.values()) {
      try {
        dc.close();
      } catch {
        // best-effort
      }
    }
    this.channels.clear();
    this.pendingLocalCandidates.length = 0;

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // best-effort
      }
      this.pc = null;
    }
  }
}

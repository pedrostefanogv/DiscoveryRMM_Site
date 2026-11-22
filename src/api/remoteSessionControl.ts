/**
 * Codec do canal .control das sessoes de acesso remoto (tela, terminal,
 * arquivos, processos, proxy). O MESMO subject carrega liveness (ping/pong),
 * keyframe de tela e o aviso de encerramento do agente (closed).
 *
 * O nucleo de liveness do debug remoto e reutilizado; o que muda e a
 * allow-list de tipos. O viewer descarta o proprio `from` (eco no subject tem
 * pub+sub nos dois sentidos).
 */
export const REMOTE_SESSION_CONTROL_VERSION = 1;
export const REMOTE_SESSION_MAX_CONTROL_BYTES = 512;

export type RemoteSessionControlType =
  | "ping"
  | "pong"
  | "keyframe"
  | "closed"
  // KVM input lock: comando do viewer e estado autoritativo do agent.
  | "inputLock"
  | "inputLockChanged"
  /**
   * Estado do transporte da sessão publicado pelo agent (WebRTC vs NATS vs
   * fallback). Alimenta o selo do indicador no console.
   *
   * Cabe no teto de 512 bytes porque carrega apenas o ESTADO e o motivo — nunca
   * o SDP, que trafega nos subjects dedicados .webrtc.in/.webrtc.out.
   */
  | "transport_info"
  /**
   * Handshake de prontidão do viewer: avisa o agent que ele JÁ assinou
   * .webrtc.out e criou o peer, para o agent reenviar o estado do transporte
   * só quando houver quem escute.
   *
   * Sem isto o agent publicava o transport_info numa janela em que o viewer
   * ainda estava assinando: a mensagem (pub/sub sem retenção) caía no vazio e
   * o selo ficava preso em "NATS" mesmo com o peer connection conectado.
   */
  | "webrtcReady";
export type RemoteSessionControlRole = "viewer" | "agent" | "server";

export interface RemoteSessionControlEnvelope {
  v: number;
  type: RemoteSessionControlType;
  sessionId: string;
  from: RemoteSessionControlRole;
  sequence?: number;
  timestampUtc?: string;
  payload?: Record<string, unknown>;
}

const ALLOWED_TYPES: readonly RemoteSessionControlType[] = [
  "ping",
  "pong",
  "keyframe",
  "closed",
  "inputLock",
  "inputLockChanged",
  "transport_info",
  "webrtcReady",
];

const ALLOWED_ROLES = ["viewer", "agent", "server"] as const;

export function isRemoteSessionControlType(
  value: unknown,
): value is RemoteSessionControlType {
  return (
    typeof value === "string" &&
    (ALLOWED_TYPES as readonly string[]).includes(value)
  );
}

export function buildViewerRemoteControlEnvelope(
  type: RemoteSessionControlType,
  sessionId: string,
  sequence: number,
  payload?: Record<string, unknown>,
): RemoteSessionControlEnvelope {
  return {
    v: REMOTE_SESSION_CONTROL_VERSION,
    type,
    sessionId,
    from: "viewer",
    sequence,
    timestampUtc: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };
}

/** Serializa validando tipo e tamanho (defense in depth). */
export function encodeRemoteControlEnvelope(
  envelope: RemoteSessionControlEnvelope,
): Uint8Array {
  if (!isRemoteSessionControlType(envelope.type)) {
    throw new Error("tipo de controle invalido: " + String(envelope.type));
  }
  const raw = JSON.stringify(envelope);
  if (raw.length > REMOTE_SESSION_MAX_CONTROL_BYTES) {
    throw new Error(
      "envelope de controle excede " +
        REMOTE_SESSION_MAX_CONTROL_BYTES +
        " bytes (" +
        raw.length +
        ")",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Decodifica um frame do canal .control. Aceita o envelope tipado e o formato
 * legado de keyframe ({"action":"keyframe"}) de viewers antigos. Retorna null
 * para frame invalido: nada fora da allow-list e executado no viewer.
 */
export function decodeRemoteControlEnvelope(
  raw: unknown,
): RemoteSessionControlEnvelope | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  // Formato legado: {"action":"keyframe"}. Sem sessionId (chega no subject
  // literal da propria sessao).
  if (candidate.type === undefined && candidate.action === "keyframe") {
    return {
      v: REMOTE_SESSION_CONTROL_VERSION,
      type: "keyframe",
      sessionId: "",
      from: "viewer",
      timestampUtc:
        typeof candidate.timestamp === "string"
          ? candidate.timestamp
          : undefined,
    };
  }

  // Formato legado do transport_info: agentes JÁ IMPLANTADOS publicam
  // {"action":"transport_info",...} SEM o campo "type". O decoder tipado
  // rejeitava a mensagem — e era exatamente isso que prendia o selo em "NATS"
  // mesmo com o peer connection conectado e os data channels abertos. Esta
  // ponte mantém o indicador funcionando com agentes que ainda não receberam a
  // correção do envelope.
  if (candidate.type === undefined && candidate.action === "transport_info") {
    const rawTransport = candidate.transport;
    if (
      rawTransport &&
      typeof rawTransport === "object" &&
      !Array.isArray(rawTransport)
    ) {
      const legacySessionId =
        typeof candidate.sessionId === "string"
          ? candidate.sessionId.trim()
          : "";
      return {
        v: REMOTE_SESSION_CONTROL_VERSION,
        type: "transport_info",
        sessionId: legacySessionId,
        from: "agent",
        payload: { transport: rawTransport as Record<string, unknown> },
      };
    }
  }

  if (!isRemoteSessionControlType(candidate.type)) return null;
  if (
    typeof candidate.from !== "string" ||
    !(ALLOWED_ROLES as readonly string[]).includes(candidate.from)
  ) {
    return null;
  }

  const sessionId =
    typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  if (!sessionId) return null;

  return {
    v:
      typeof candidate.v === "number"
        ? candidate.v
        : REMOTE_SESSION_CONTROL_VERSION,
    type: candidate.type,
    sessionId,
    from: candidate.from as RemoteSessionControlRole,
    sequence:
      typeof candidate.sequence === "number" ? candidate.sequence : undefined,
    timestampUtc:
      typeof candidate.timestampUtc === "string"
        ? candidate.timestampUtc
        : undefined,
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? (candidate.payload as Record<string, unknown>)
        : undefined,
  };
}

/** true quando o frame foi emitido pelo proprio papel (eco). */
export function isOwnRemoteControlEnvelope(
  envelope: RemoteSessionControlEnvelope,
  role: RemoteSessionControlRole,
): boolean {
  return envelope.from === role;
}

/** Mapeia uma conexao NATS do dashboard para o estado aceito pela liveness. */
export function toLivenessConnectionState(
  state: "disconnected" | "connecting" | "connected" | "reconnecting" | "auth_error",
): "connecting" | "connected" | "reconnecting" | "closed" {
  switch (state) {
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "connecting":
      return "connecting";
    default:
      return "closed";
  }
}

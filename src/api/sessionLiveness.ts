import type { RemoteDebugControlEnvelope, RemoteDebugControlType } from "./types";

/**
 * Núcleo do canal único de controle do debug remoto. O MESMO subject carrega
 * liveness (ping/pong) e comandos (setLevel); o envelope é tipado e cada lado
 * descarta o próprio `from` (o subject tem pub+sub nos dois sentidos).
 */
export const CONTROL_PROTOCOL_VERSION = 1;
export const MAX_CONTROL_BYTES = 512;
export const CONTROL_ROLE_VIEWER = "viewer" as const;
export const CONTROL_ROLE_AGENT = "agent" as const;

const ALLOWED_CONTROL_TYPES: readonly RemoteDebugControlType[] = [
  "ping",
  "pong",
  "setLevel",
  "levelChanged",
  "closed",
];

const ALLOWED_ROLES = ["viewer", "agent", "server"] as const;

export function isControlType(value: unknown): value is RemoteDebugControlType {
  return (
    typeof value === "string" &&
    (ALLOWED_CONTROL_TYPES as readonly string[]).includes(value)
  );
}

export function buildViewerControlEnvelope(
  type: RemoteDebugControlType,
  sessionId: string,
  sequence: number,
  payload?: Record<string, unknown>,
): RemoteDebugControlEnvelope {
  return {
    v: CONTROL_PROTOCOL_VERSION,
    type,
    sessionId,
    from: CONTROL_ROLE_VIEWER,
    sequence,
    timestampUtc: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };
}

/** Serializa o envelope validando tipo e tamanho (defense in depth). */
export function encodeControlEnvelope(
  envelope: RemoteDebugControlEnvelope,
): Uint8Array {
  if (!isControlType(envelope.type)) {
    throw new Error("tipo de controle invalido: " + String(envelope.type));
  }
  const raw = JSON.stringify(envelope);
  if (raw.length > MAX_CONTROL_BYTES) {
    throw new Error(
      "envelope de controle excede " +
        MAX_CONTROL_BYTES +
        " bytes (" +
        raw.length +
        ")",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Decodifica e valida um frame recebido. Aceita objeto ja desserializado (o
 * NatsService entrega JSON.parse) ou string. Retorna null para frame invalido:
 * nada e executado no viewer fora da allow-list.
 */
export function decodeControlEnvelope(
  raw: unknown,
): RemoteDebugControlEnvelope | null {
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

  if (!isControlType(candidate.type)) return null;
  if (
    typeof candidate.from !== "string" ||
    !(ALLOWED_ROLES as readonly string[]).includes(candidate.from)
  ) {
    return null;
  }

  const sessionId =
    typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  if (!sessionId) return null;

  const sequence =
    typeof candidate.sequence === "number" ? candidate.sequence : undefined;

  return {
    v: typeof candidate.v === "number" ? candidate.v : CONTROL_PROTOCOL_VERSION,
    type: candidate.type,
    sessionId,
    from: candidate.from as RemoteDebugControlEnvelope["from"],
    sequence,
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

/** true quando o frame foi emitido pelo proprio papel (eco no subject unico). */
export function isOwnControlEnvelope(
  envelope: RemoteDebugControlEnvelope,
  role: RemoteDebugControlEnvelope["from"],
): boolean {
  return envelope.from === role;
}

/** Parametros de liveness resolvidos com defaults seguros. */
export interface ResolvedLivenessParams {
  pingIntervalMs: number;
  missedPingsBeforeClose: number;
  initialGraceMs: number;
  keepAliveMs: number;
}

export function resolveLivenessParams(params: {
  pingIntervalSeconds?: number;
  missedPingsBeforeClose?: number;
  initialGraceSeconds?: number;
  keepAliveSeconds?: number;
}): ResolvedLivenessParams {
  const positive = (value: number | undefined, fallback: number) =>
    typeof value === "number" && value > 0 ? value : fallback;

  return {
    pingIntervalMs: positive(params.pingIntervalSeconds, 5) * 1000,
    missedPingsBeforeClose: positive(params.missedPingsBeforeClose, 3),
    initialGraceMs: positive(params.initialGraceSeconds, 60) * 1000,
    keepAliveMs: positive(params.keepAliveSeconds, 60) * 1000,
  };
}

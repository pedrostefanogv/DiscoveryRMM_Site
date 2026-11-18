/**
 * Codec de frames do túnel multiplexado do Proxy LAN / WebRDP (R2/F22).
 *
 * Espelha o codec do agent (Discovery/src/app/core/remotesession/session_tunnel_codec.go):
 *   - Frame BINÁRIO: header de 6 bytes [0x01 versão][op][4B streamId big-endian] + payload;
 *   - Frame de CONTROLE: JSON iniciando com '{' (0x7B) — open/opened/data/close/error/preflight.
 *
 * Ops binários definidos pelo agent: TunnelOpData = 0x01, TunnelOpClose = 0x02.
 * O viewer entrega o payload de QUALQUER frame binário no canal de dados
 * (onTunnelData) — um CLOSE apenas sinaliza encerramento do stream além do
 * payload opcional de razão — mantendo o comportamento tolerante do protocolo.
 */

export const TUNNEL_FRAME_VERSION = 0x01;
export const TUNNEL_OP_DATA = 0x01;
export const TUNNEL_OP_CLOSE = 0x02;
export const TUNNEL_BINARY_HEADER_LEN = 6;
export const TUNNEL_JSON_LEADING_BYTE = 0x7b; // '{'

export interface TunnelFrame {
  streamId: number;
  /** Byte de op do header (0x01 data, 0x02 close). */
  op: number;
  /** Payload após o header de 6 bytes (view sem cópia). */
  payload: Uint8Array;
}

/** Msg de controle JSON do túnel (espelha TunnelControlMsg do agent). */
export interface TunnelControlMsg {
  streamId?: number;
  /** "open" | "opened" | "data" | "close" | "error" | "preflight". */
  op?: string;
  targetHost?: string;
  targetPort?: number;
  protocol?: string;
  dataB64?: string;
  error?: string;
  code?: string;
  rdpStatus?: string | Record<string, unknown> | null;
}

/** Codifica um frame binário do túnel: [0x01][op][4B streamId BE][payload]. */
export function encodeTunnelFrame(op: number, streamId: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(TUNNEL_BINARY_HEADER_LEN + payload.length);
  out[0] = TUNNEL_FRAME_VERSION;
  out[1] = op & 0xff;
  new DataView(out.buffer).setUint32(2, streamId >>> 0, false);
  out.set(payload, TUNNEL_BINARY_HEADER_LEN);
  return out;
}

/**
 * Decodifica um frame binário do túnel. Retorna null (sem lançar) para
 * buffers truncados, versão desconhecida ou op binário inválido.
 */
export function decodeTunnelFrame(raw: Uint8Array | null | undefined): TunnelFrame | null {
  if (!raw || raw.length < TUNNEL_BINARY_HEADER_LEN) return null;
  if (raw[0] !== TUNNEL_FRAME_VERSION) return null;
  const op = raw[1];
  if (op !== TUNNEL_OP_DATA && op !== TUNNEL_OP_CLOSE) return null;
  const streamId = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(2, false);
  return { streamId, op, payload: raw.subarray(TUNNEL_BINARY_HEADER_LEN) };
}

/** True quando o payload é um frame de controle JSON (começa com '{'). */
export function isTunnelControlPayload(raw: Uint8Array | null | undefined): boolean {
  if (!raw || raw.length === 0) return false;
  let i = 0;
  while (i < raw.length && (raw[i] === 0x20 || raw[i] === 0x09 || raw[i] === 0x0d || raw[i] === 0x0a)) i++;
  return i < raw.length && raw[i] === TUNNEL_JSON_LEADING_BYTE;
}

/** Faz o parse de um frame de controle JSON; null quando inválido (sem lançar). */
export function parseTunnelControl(raw: Uint8Array): TunnelControlMsg | null {
  if (!isTunnelControlPayload(raw)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as TunnelControlMsg;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Bytes <- base64 (payloads de proxy/control dataB64). */
export function bytesFromBase64(b64: string | undefined | null): Uint8Array {
  if (!b64) return new Uint8Array(0);
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

/** Bytes -> base64 (chunks de até 0x8000 evitam stack overflow no spread). */
export function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

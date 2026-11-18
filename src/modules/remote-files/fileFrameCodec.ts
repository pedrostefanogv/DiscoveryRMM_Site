/**
 * Codec de frames binários 'DF' para transferência de arquivos via NATS.
 *
 * Formato do frame:
 *   [0..1]   Magic: 0x44 0x46 ('D', 'F')
 *   [2..5]   headerLen (uint32 BigEndian)
 *   [6..6+headerLen)   JSON UTF-8 de metadados (sem campo `data`)
 *   [6+headerLen..)    Payload binário bruto do chunk (zero-copy subarray)
 */

const BINARY_FILE_MAGIC_0 = 0x44; // 'D'
const BINARY_FILE_MAGIC_1 = 0x46; // 'F'
const BINARY_FILE_PREFIX_LEN = 6;
const MAX_FILE_HEADER_BYTES = 65_536;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function isBinaryFileFrame(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= BINARY_FILE_PREFIX_LEN &&
    bytes[0] === BINARY_FILE_MAGIC_0 &&
    bytes[1] === BINARY_FILE_MAGIC_1
  );
}

export function encodeBinaryFileFrame(
  header: Record<string, unknown>,
  data?: Uint8Array,
): Uint8Array {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const payloadLen = data?.byteLength ?? 0;
  const frame = new Uint8Array(BINARY_FILE_PREFIX_LEN + headerBytes.byteLength + payloadLen);
  frame[0] = BINARY_FILE_MAGIC_0;
  frame[1] = BINARY_FILE_MAGIC_1;
  new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(
    2,
    headerBytes.byteLength,
    false,
  );
  frame.set(headerBytes, BINARY_FILE_PREFIX_LEN);
  if (data && payloadLen > 0) {
    frame.set(data, BINARY_FILE_PREFIX_LEN + headerBytes.byteLength);
  }
  return frame;
}

export function decodeBinaryFileFrame(
  bytes: Uint8Array,
): { header: Record<string, unknown>; data: Uint8Array } | null {
  if (!isBinaryFileFrame(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = view.getUint32(2, false);
  if (
    headerLen <= 0 ||
    headerLen > MAX_FILE_HEADER_BYTES ||
    BINARY_FILE_PREFIX_LEN + headerLen > bytes.byteLength
  ) {
    return null;
  }

  try {
    const headerJson = textDecoder.decode(
      bytes.subarray(BINARY_FILE_PREFIX_LEN, BINARY_FILE_PREFIX_LEN + headerLen),
    );
    const parsed: unknown = JSON.parse(headerJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      header: parsed as Record<string, unknown>,
      data: bytes.subarray(BINARY_FILE_PREFIX_LEN + headerLen),
    };
  } catch {
    return null;
  }
}

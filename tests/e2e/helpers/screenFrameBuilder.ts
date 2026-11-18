export function buildScreenFullFrame(opts: {
  seq?: number;
  ts: number;
  width?: number;
  height?: number;
  codec?: "jpeg" | "webp";
}): Uint8Array {
  const magic =
    opts.codec === "webp"
      ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00]) // "RIFF..."
      : new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]); // JPEG SOI
  const out = new Uint8Array(12 + magic.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, opts.seq ?? 1, false);
  view.setUint32(4, opts.ts >>> 0, false);
  view.setUint16(8, opts.width ?? 1280, false);
  view.setUint16(10, opts.height ?? 720, false);
  out.set(magic, 12);
  return out;
}

export function buildScreenTileFrame(opts: {
  seq?: number;
  ts: number;
  width?: number;
  height?: number;
  tiles: Array<{ x: number; y: number; data: Uint8Array }>;
}): Uint8Array {
  let payloadLen = 4;
  for (const t of opts.tiles) {
    payloadLen += 12 + t.data.length;
  }
  const out = new Uint8Array(12 + payloadLen);
  const view = new DataView(out.buffer);
  view.setUint32(0, opts.seq ?? 2, false);
  view.setUint32(4, opts.ts >>> 0, false);
  view.setUint16(8, opts.width ?? 1280, false);
  view.setUint16(10, opts.height ?? 720, false);

  // Tile header: numRects (2B), flags (2B)
  view.setUint16(12, opts.tiles.length, false);
  view.setUint16(14, 0, false);

  let offset = 16;
  for (const t of opts.tiles) {
    view.setUint16(offset, t.x, false);
    view.setUint16(offset + 2, t.y, false);
    view.setUint16(offset + 4, 64, false);
    view.setUint16(offset + 6, 64, false);
    view.setUint32(offset + 8, t.data.length, false);
    offset += 12;
    out.set(t.data, offset);
    offset += t.data.length;
  }
  return out;
}

export function buildScreenFragment(opts: {
  totalLen: number;
  offset: number;
  fragIndex: number;
  fragCount: number;
  chunk: Uint8Array;
}): Uint8Array {
  const out = new Uint8Array(12 + opts.chunk.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, opts.totalLen, false);
  view.setUint32(4, opts.offset, false);
  view.setUint16(8, opts.fragIndex, false);
  view.setUint16(10, opts.fragCount, false);
  out.set(opts.chunk, 12);
  return out;
}

export function buildCursorPosFrame(opts: {
  visible?: boolean;
  x: number;
  y: number;
}): Uint8Array {
  const out = new Uint8Array(6);
  const view = new DataView(out.buffer);
  view.setUint8(0, opts.visible === false ? 0 : 1);
  view.setInt16(1, opts.x, false);
  view.setInt16(3, opts.y, false);
  return out;
}

export function buildCursorImgFrame(opts: {
  width?: number;
  height?: number;
  hotX?: number;
  hotY?: number;
}): Uint8Array {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(16 + png.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, opts.width ?? 16, false);
  view.setUint32(4, opts.height ?? 16, false);
  view.setUint32(8, opts.hotX ?? 2, false);
  view.setUint32(12, opts.hotY ?? 2, false);
  out.set(png, 16);
  return out;
}

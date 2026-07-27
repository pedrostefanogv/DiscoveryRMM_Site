// Web Worker for JPEG/WebP frame decoding.
// Decoding is off-main-thread to keep UI responsive.

self.onmessage = async (e: MessageEvent<{ type: string; data: ArrayBuffer; id: number }>) => {
    const { type, data, id } = e.data;

    if (type === 'decode') {
        try {
            const header = new DataView(data).getUint8(0); // peek at header for codec detection
            const mime = header === 0x52 ? 'image/webp' : 'image/jpeg'; // RIFF = WebP

            const blob = new Blob([new Uint8Array(data, 12)], { type: mime });
            const bitmap = await createImageBitmap(blob);

            self.postMessage({ type: 'decoded', bitmap, id }, { transfer: [bitmap] });
        } catch (err) {
            self.postMessage({ type: 'error', error: String(err), id });
        }
    }
};

export { };

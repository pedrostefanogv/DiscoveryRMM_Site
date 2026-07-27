/// <reference lib="webworker" />

// Web Worker for H.264 decoding via WebCodecs API.
// H.264 decoding is hardware-accelerated on modern browsers (Chrome 94+, Edge 94+).
// Fallback for Firefox/Safari: returns error, caller should fall back to WebP/JPEG.

interface DecodeMessage {
    type: 'decode';
    data: ArrayBuffer;
    id: number;
    width: number;
    height: number;
}

interface DecodedMessage {
    type: 'decoded';
    bitmap: ImageBitmap;
    id: number;
}

interface ErrorMessage {
    type: 'error';
    error: string;
    id: number;
}

let decoder: VideoDecoder | null = null;

self.onmessage = async (e: MessageEvent<DecodeMessage>) => {
    const { type, data, id, width, height } = e.data;

    if (type !== 'decode') return;

    try {
        // WebCodecs API disponível?
        if (typeof VideoDecoder === 'undefined') {
            self.postMessage({ type: 'error', error: 'WebCodecs not available', id } satisfies ErrorMessage);
            return;
        }

        if (decoder === null) {
            decoder = new VideoDecoder({
                output: (frame: VideoFrame) => {
                    // Converte VideoFrame para ImageBitmap para postMessage com transfer
                    createImageBitmap(frame, { resizeWidth: width, resizeHeight: height })
                        .then((bitmap: ImageBitmap) => {
                            self.postMessage(
                                { type: 'decoded', bitmap, id } satisfies DecodedMessage,
                                { transfer: [bitmap] }
                            );
                            frame.close();
                        })
                        .catch((err: Error) => {
                            self.postMessage({ type: 'error', error: `Bitmap failed: ${err.message}`, id } satisfies ErrorMessage);
                            frame.close();
                        });
                },
                error: (err: Error) => {
                    self.postMessage({ type: 'error', error: `Decoder error: ${err.message}`, id } satisfies ErrorMessage);
                },
            });

            // Configura decoder para H.264
            const config: VideoDecoderConfig = {
                codec: 'avc1.640028', // H.264 High Profile Level 4.0
            };
            decoder.configure(config);
        }

        // Alimenta o decoder com encoded chunk
        const chunk = new EncodedVideoChunk({
            type: 'key',
            timestamp: 0,
            data: new Uint8Array(data).buffer,
        });
        decoder.decode(chunk);

    } catch (err) {
        self.postMessage({
            type: 'error',
            error: `H.264 decode: ${err instanceof Error ? err.message : String(err)}`,
            id,
        } satisfies ErrorMessage);
    }
};

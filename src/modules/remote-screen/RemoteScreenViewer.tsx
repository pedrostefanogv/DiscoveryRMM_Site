import { useCallback, useEffect, useRef, useState } from 'react';
import { fullscreenApi } from '@/utils/fullscreen';

interface FrameHeader {
  seq: number;
  ts: number;
  width: number;
  height: number;
}

interface RemoteScreenViewerProps {
  natsSubject?: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  quality: string;
  codec: string;
  onError?: (msg: string) => void;
  onLatency?: (rttMs: number) => void;
}

function decodeFrameHeader(data: ArrayBuffer): FrameHeader | null {
  if (data.byteLength < 12) return null;
  const view = new DataView(data);
  return {
    seq: view.getUint32(0, false),
    ts: view.getUint32(4, false),
    width: view.getUint16(8, false),
    height: view.getUint16(10, false),
  };
}

export default function RemoteScreenViewer({
  natsSubject,
  quality,
  codec,
  onError,
  onLatency,
}: RemoteScreenViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState<'fit' | '100%'>('fit');
  const [rtt, setRtt] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());

  // Decode JPEG/WebP off-main-thread via Image.decode()
  const decodeFrame = useCallback(async (data: ArrayBuffer): Promise<ImageBitmap | null> => {
    const header = decodeFrameHeader(data);
    if (!header) return null;

    const payload = new Uint8Array(data, 12);
    const blob = new Blob([payload], { type: codec === 'webp' ? 'image/webp' : 'image/jpeg' });

    try {
      const img = await createImageBitmap(blob, {
        resizeWidth: scale === '100%' ? header.width : undefined,
        resizeHeight: scale === '100%' ? header.height : undefined,
        resizeQuality: 'medium',
      });
      return img;
    } catch {
      return null;
    }
  }, [codec, scale]);

  // Placeholder: render frame in canvas
  const renderFrame = useCallback((bitmap: ImageBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // FPS counter
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastFpsUpdate.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsUpdate.current = now;
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (isFullscreen) {
      await fullscreenApi.exit();
    } else {
      await fullscreenApi.request(el);
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFullscreen]);

  // Placeholder NATS connection: will receive frames in Fase 5
  useEffect(() => {
    if (!natsSubject) return;
    frameCountRef.current = 0;
    lastFpsUpdate.current = Date.now();
  }, [natsSubject]);

  return (
    <div ref={containerRef} className="relative flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
      />

      {/* Info overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-3 text-xs bg-slate-900/70 rounded px-2 py-1 backdrop-blur-sm">
        <span className="text-emerald-400">{fps} FPS</span>
        <span className="text-slate-400">{rtt}ms</span>
        <span className="text-slate-500">{quality.toUpperCase()}</span>
        <span className="text-slate-500">{codec.toUpperCase()}</span>
      </div>

      {/* Fullscreen button */}
      <button
        className="absolute bottom-2 right-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded px-2 py-1 text-xs backdrop-blur-sm"
        onClick={toggleFullscreen}
        title="Fullscreen (Ctrl+F)"
      >
        {isFullscreen ? '⛶ Exit' : '⛶ Full'}
      </button>
    </div>
  );
}

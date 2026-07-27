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
  natsUrl,
  jwt,
  nkeySeed,
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
  const [isPaused, setIsPaused] = useState(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  // Decode JPEG/WebP off-main-thread via ImageBitmap
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

  // Render frame in canvas
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

  // NATS WebSocket: subscreve frames via subject específico
  useEffect(() => {
    if (!natsSubject || !natsUrl || !jwt) return;

    let cancelled = false;
    const wsUrl = natsUrl.replace(/^http/, 'ws') + '/nats';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Autentica com JWT
      ws.send(JSON.stringify({ type: 'auth', jwt }));
      // Subscreve ao stream de frames
      ws.send(JSON.stringify({ type: 'sub', subject: `${natsSubject}.frame` }));
    };

    ws.onmessage = (event) => {
      if (cancelled || isPaused) return;

      // Converte mensagem binária (MessagePack ou raw bytes)
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          if (cancelled || isPaused) return;
          decodeFrame(buffer).then((bitmap) => {
            if (bitmap && !cancelled) {
              renderFrame(bitmap);
              // RTT calculation from frame header timestamp
              const header = decodeFrameHeader(buffer);
              if (header && onLatency) {
                const lat = Date.now() - header.ts;
                setRtt(lat);
                onLatency(lat);
              }
            }
          });
        });
      }
    };

    ws.onerror = () => {
      onError?.('NATS WebSocket connection failed');
    };

    ws.onclose = () => {
      if (!cancelled) {
        onError?.('NATS connection closed');
      }
    };

    return () => {
      cancelled = true;
      ws.close();
    };
  }, [natsSubject, natsUrl, jwt, isPaused, decodeFrame, renderFrame, onError, onLatency]);

  // Input capture (mouse/keyboard) — B14 fix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wsRef.current) return;

    const sendInput = (type: string, data: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && natsSubject) {
        wsRef.current.send(JSON.stringify({
          type: 'pub',
          subject: `${natsSubject}.input`,
          data: JSON.stringify({ type, ...data, ts: Date.now() }),
        }));
      }
    };

    const onMouseDown = (e: MouseEvent) => sendInput('mousedown', { x: e.offsetX, y: e.offsetY, button: e.button });
    const onMouseUp = (e: MouseEvent) => sendInput('mouseup', { x: e.offsetX, y: e.offsetY, button: e.button });
    const onMouseMove = (e: MouseEvent) => sendInput('mousemove', { x: e.offsetX, y: e.offsetY });
    const onWheel = (e: WheelEvent) => sendInput('wheel', { deltaX: e.deltaX, deltaY: e.deltaY });
    const onKeyDown = (e: KeyboardEvent) => sendInput('keydown', { key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
    const onKeyUp = (e: KeyboardEvent) => sendInput('keyup', { key: e.key, code: e.code });
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [natsSubject]);

  // Pause on visibility change (M11)
  useEffect(() => {
    const onVisibility = () => {
      setIsPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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

  return (
    <div ref={containerRef} className="relative flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden h-full">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain cursor-crosshair"
        tabIndex={0}
      />

      {/* Info overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-3 text-xs bg-slate-900/70 rounded px-2 py-1 backdrop-blur-sm pointer-events-none">
        <span className="text-emerald-400">{fps} FPS</span>
        <span className="text-slate-400">{rtt}ms</span>
        <span className="text-slate-500">{quality.toUpperCase()}</span>
        <span className="text-slate-500">{codec.toUpperCase()}</span>
        {isPaused && <span className="text-amber-400">⏸</span>}
      </div>

      {/* Controls */}
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button
          className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded px-2 py-1 text-xs backdrop-blur-sm"
          onClick={() => setScale(scale === 'fit' ? '100%' : 'fit')}
          title="Toggle scale"
        >
          {scale === 'fit' ? '⊡ Fit' : '⊡ 1:1'}
        </button>
        <button
          className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded px-2 py-1 text-xs backdrop-blur-sm"
          onClick={toggleFullscreen}
          title="Fullscreen (Ctrl+F)"
        >
          {isFullscreen ? '⛶ Exit' : '⛶ Full'}
        </button>
      </div>
    </div>
  );
}

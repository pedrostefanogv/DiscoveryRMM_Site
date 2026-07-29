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
  nkeySeed: _nkeySeed,
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
  const reconnectAttemptsRef = useRef(0);
  // Stable refs para callbacks — evita que re-renders do pai (RemoteSession)
  // recriem o useEffect e resetem reconnectAttempts a cada render.
  const onErrorRef = useRef(onError);
  const onLatencyRef = useRef(onLatency);
  onErrorRef.current = onError;
  onLatencyRef.current = onLatency;

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

  // NATS WebSocket: conecta ao servidor NATS e subscreve ao stream de frames.
  // Protocolo NATS WebSocket nativo (nats-server websocket):
  //   - Auth: access_token como query param na URL
  //   - Subscribe: SUB <subject> <sid>\r\n
  //   - Publish (input): PUB <subject> <reply> <len>\r\n<payload>\r\n
  //   - Frames binários chegam como WebSocket binary frames
  useEffect(() => {
    if (!natsSubject || !natsUrl || !jwt) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    reconnectAttemptsRef.current = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

    const connect = () => {
      if (cancelled) return;

      const wsUrl = `${natsUrl}?access_token=${encodeURIComponent(jwt)}`;
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[RemoteScreenViewer] NATS WebSocket connected successfully');
        reconnectAttemptsRef.current = 0;
        ws!.send(`SUB ${natsSubject}.frame 1\r\n`);
      };

      ws.onmessage = (event) => {
        if (cancelled || isPaused) return;

        // NATS WebSocket: PING/PONG keepalive
        if (typeof event.data === 'string') {
          if (event.data.startsWith('PING')) {
            ws!.send('PONG\r\n');
          }
          // MSG headers, INFO, +OK, -ERR são ignorados
          return;
        }

        // Binary frame — dados brutos da captura de tela (JPEG/WebP/H.264)
        if (event.data instanceof ArrayBuffer) {
          const buffer = event.data as ArrayBuffer;
          decodeFrame(buffer).then((bitmap) => {
            if (bitmap && !cancelled) {
              renderFrame(bitmap);
              // RTT calculation from frame header timestamp
              const header = decodeFrameHeader(buffer);
              if (header) {
                const lat = Date.now() - header.ts;
                setRtt(lat);
                onLatencyRef.current?.(lat);
              }
            }
          });
        }
      };

      ws.onerror = () => {
        console.error('[RemoteScreenViewer] NATS WebSocket error', {
          url: natsUrl,
          readyState: ws?.readyState,
          reconnectAttempt: reconnectAttemptsRef.current,
        });
      };

      ws.onclose = (event) => {
        if (cancelled) return;

        console.warn('[RemoteScreenViewer] NATS WebSocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          reconnectAttempt: reconnectAttemptsRef.current,
        });

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS[reconnectAttemptsRef.current];
          console.log(`[RemoteScreenViewer] Tentativa de reconexão ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS} em ${delay}ms...`);
          reconnectTimer = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          console.error('[RemoteScreenViewer] Esgotadas tentativas de reconexão');
          onErrorRef.current?.('NATS connection closed — verifique se o servidor NATS está acessível.');
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [natsSubject, natsUrl, jwt, isPaused, decodeFrame, renderFrame]);

  // Input capture (mouse/keyboard) — B14 fix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wsRef.current) return;

    const sendInput = (type: string, data: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && natsSubject) {
        const payload = JSON.stringify({ type, ...data, ts: Date.now() });
        wsRef.current.send(`PUB ${natsSubject}.input ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`);
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

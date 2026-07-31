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

interface AgentMetrics {
  effectiveFps: number;
  profileFps: number;
  quality: string;
  imageQuality: number;
  resolution: string;
  compressionRatio: number;
  avgEncodeMs: number;
  frameBytesAvg: number;
  framesSent5s: number;
  framesSkipped5s: number;
  totalFrames: number;
}

const CRLF = new Uint8Array([13, 10]);

function appendBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

function findCrlf(data: Uint8Array<ArrayBufferLike>): number {
  for (let index = 0; index <= data.length - CRLF.length; index++) {
    if (data[index] === CRLF[0] && data[index + 1] === CRLF[1]) return index;
  }
  return -1;
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
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Stable refs para callbacks e codec — evita que re-renders do pai (RemoteSession)
  // recriem o useEffect e resetem reconnectAttempts a cada render.
  const onErrorRef = useRef(onError);
  const onLatencyRef = useRef(onLatency);
  const codecRef = useRef(codec);
  const scaleRef = useRef(scale);
  const isPausedRef = useRef(isPaused);
  onErrorRef.current = onError;
  onLatencyRef.current = onLatency;
  codecRef.current = codec;
  scaleRef.current = scale;
  isPausedRef.current = isPaused;

  // Decode JPEG/WebP off-main-thread via ImageBitmap.
  // Suporta dois formatos de payload:
  //   1. Frame completo (compat): JPEG/WebP único (header 12B + payload).
  //   2. Tiles (tile-mode): header 12B + [4B numRects+flags] + N×[tileHeader 12B + JPEG].
  //      O primeiro tile é o "key" (cobre a tela toda); os demais são patches.
  const decodeFrame = useCallback(
    async (data: ArrayBuffer): Promise<{ kind: 'full' | 'tiles'; header: FrameHeader; bitmaps: ImageBitmap[]; rects?: { x: number; y: number }[] } | null> => {
      const header = decodeFrameHeader(data);
      if (!header) return null;

      const currentCodec = codecRef.current;
      const payload = new Uint8Array(data, 12);
      // BlobPart exige Uint8Array<ArrayBuffer> — copia para um buffer próprio.
      const blob = (p: Uint8Array<ArrayBufferLike>, type?: string) =>
        new Blob([p.slice().buffer as ArrayBuffer], { type: type ?? (currentCodec === 'webp' ? 'image/webp' : 'image/jpeg') });

      // Detecta formato tile: primeiros 4 bytes do payload, numRects (uint16) seguido de flags (uint16).
      // Guard: numRects > 0 e < 512, e os 4 bytes não são o start code de um JPEG/WebP válido.
      const detectTiles = () => {
        if (payload.length < 4) return false;
        const numRects = (payload[0] << 8) | payload[1];
        // JPEG começa com 0xFFD8; WebP começa com 'RIFF'. Tiles não começam assim.
        const isJpeg = payload[0] === 0xff && payload[1] === 0xd8;
        const isRiff = payload[0] === 0x52 && payload[1] === 0x49; // 'R','I'
        if (isJpeg || isRiff) return false;
        return numRects >= 1 && numRects < 512;
      };

      try {
        if (detectTiles()) {
          // ── Decodifica tiles ──
          const view = new DataView(payload.buffer, payload.byteOffset);
          const numRects = payload[0] * 256 + payload[1];
          // flags no bytes 2-3 (reservado)
          let offset = 4;
          const bitmaps: ImageBitmap[] = [];
          const rects: { x: number; y: number }[] = [];
          for (let i = 0; i < numRects && offset + 12 <= payload.length; i++) {
            const x = view.getUint16(offset, false);
            const y = view.getUint16(offset + 2, false);
            const size = view.getUint32(offset + 8, false);
            offset += 12;
            if (offset + size > payload.length) break;
            const tileBlob = blob(payload.subarray(offset, offset + size), 'image/jpeg');
            offset += size;
            try {
              const bmp = await createImageBitmap(tileBlob);
              bitmaps.push(bmp);
              rects.push({ x, y });
            } catch {
              // tile corrompido — ignora
            }
          }
          if (bitmaps.length === 0) return null;
          return { kind: 'tiles', header, bitmaps, rects };
        }

        // ── Frame completo ──
        const currentScale = scaleRef.current;
        const img = await createImageBitmap(blob(payload), {
          resizeWidth: currentScale === '100%' ? header.width : undefined,
          resizeHeight: currentScale === '100%' ? header.height : undefined,
          resizeQuality: 'medium',
        });
        return { kind: 'full', header, bitmaps: [img] };
      } catch {
        return null;
      }
    },
    [],
  );

  // Render frame in canvas.
  // - 'full': desenha o frame completo (limpa e redimensiona o canvas).
  // - 'tiles': desenha cada tile no offset (x,y) sobre o canvas existente.
  //   O canvas mantém o tamanho da tela inteira (dimensionado pelo header do frame);
  //   cada tile é um patch na posição correspondente.
  const renderFrame = useCallback((
    bitmaps: ImageBitmap[],
    rects?: { x: number; y: number }[],
    frameHeader?: FrameHeader,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!rects || rects.length === 0 || bitmaps.length === 0) {
      // Frame completo — redimensiona e redesenha
      const bmp = bitmaps[0];
      if (bmp) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
      }
    } else {
      // Modo tiles — garante o canvas com as dimensões reais da tela (header)
      if (frameHeader && (canvas.width !== frameHeader.width || canvas.height !== frameHeader.height)) {
        canvas.width = frameHeader.width;
        canvas.height = frameHeader.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // Desenha os patches
      for (let i = 0; i < bitmaps.length; i++) {
        const bmp = bitmaps[i];
        const r = rects[i];
        if (r) {
          ctx.drawImage(bmp, r.x, r.y);
        } else {
          ctx.drawImage(bmp, 0, 0);
        }
        bmp.close();
      }
    }

    // FPS counter
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastFpsUpdate.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsUpdate.current = now;
    }
  }, []);

  // NATS WebSocket: executa o handshake NATS e subscreve ao stream de frames.
  useEffect(() => {
    if (!natsSubject || !natsUrl || !jwt) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    reconnectAttemptsRef.current = 0;
    let protocolBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let connectSent = false;
    let authenticated = false;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

    const sendProtocol = (command: string) => {
      ws?.send(new TextEncoder().encode(`${command}\r\n`));
    };

    const processScreenFrame = (buffer: ArrayBuffer) => {
      if (isPausedRef.current) return;
      decodeFrame(buffer).then((result) => {
        if (!result || cancelled) return;
        renderFrame(
          result.bitmaps,
          result.kind === 'tiles' ? result.rects : undefined,
          result.header,
        );
        // Reaplica o cursor (o novo frame pode ter coberto o anterior)
        drawCursorOverlay();
        const header = result.header ?? decodeFrameHeader(buffer);
        if (header) {
          const lat = Date.now() - header.ts;
          setRtt(lat);
          onLatencyRef.current?.(lat);
        }
      });
    };

    // ── Fragmentação JUMBO (frames > MaxPayloadBytes) ──
    // Protocolo: cada fragmento tem header [4B totalLen][4B offset][2B fragIndex][2B fragCount][payload].
    // Monta os fragmentos na ordem e, quando completos, decodifica o frame.
    let fragTotalLen = 0;
    let fragCount = 0;
    let fragBuffer: Uint8Array | null = null;
    let fragReceived = 0;

    const processScreenFrameFrag = (frag: ArrayBuffer) => {
      if (isPausedRef.current || frag.byteLength < 12) return;
      const view = new DataView(frag);
      const totalLen = view.getUint32(0, false);
      const offset = view.getUint32(4, false);
      const fragIdx = view.getUint16(8, false);
      const fragCnt = view.getUint16(10, false);
      const part = new Uint8Array(frag, 12);

      // Novo frame fragmentado (mudou totalLen ou fragCnt): reinicia reassembly
      if (totalLen !== fragTotalLen || fragCnt !== fragCount || fragReceived === 0) {
        fragTotalLen = totalLen;
        fragCount = fragCnt;
        fragBuffer = new Uint8Array(totalLen);
        fragReceived = 0;
      }
      if (!fragBuffer || fragIdx >= fragCnt) return;

      const end = Math.min(offset + part.length, totalLen);
      if (offset < totalLen && end > offset) {
        fragBuffer.set(part.subarray(0, end - offset), offset);
      }
      fragReceived++;

      if (fragReceived >= fragCnt) {
        const assembled = fragBuffer.buffer.slice(0, totalLen) as ArrayBuffer;
        fragBuffer = null;
        fragReceived = 0;
        processScreenFrame(assembled);
      }
    };

    const processEventMessage = (payloadText: string) => {
      try {
        const data = JSON.parse(payloadText);
        if (data?.eventType === 'metrics' && data?.data) {
          setAgentMetrics(data.data as AgentMetrics);
        }
      } catch {
        // ignora eventos mal formatados
      }
    };

    // ── Cursor separado (P2): posição/estado do cursor via subject .cursor ──
    // Formato: 6 bytes [flags(1)][x int16 BE][y int16 BE]. Flags: bit0=visible,
    // bit1=hand, bit2=ibeam, bit3=crosshair.
    let cursorPos: { x: number; y: number; visible: boolean } | null = null;

    const drawCursorOverlay = () => {
      const canvas = canvasRef.current;
      if (!canvas || !cursorPos || !cursorPos.visible) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Seta simples (triângulo + contorno)
      const x = cursorPos.x;
      const y = cursorPos.y;
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y + 20);
      ctx.lineTo(x + 7, y + 21);
      ctx.lineTo(x + 11, y + 28);
      ctx.lineTo(x + 8, y + 29);
      ctx.lineTo(x + 4, y + 22);
      ctx.lineTo(x, y + 26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const processCursorMessage = (buffer: ArrayBuffer) => {
      if (buffer.byteLength < 6) return;
      const view = new DataView(buffer);
      const flags = view.getUint8(0);
      const x = view.getInt16(1, false);
      const y = view.getInt16(3, false);
      cursorPos = {
        x: Math.max(0, x),
        y: Math.max(0, y),
        visible: (flags & 1) !== 0,
      };
      // Desenha o cursor sobre o último frame (canvas preserva o conteúdo)
      drawCursorOverlay();
    };

    const processProtocol = () => {
      const decoder = new TextDecoder();
      while (!cancelled) {
        const lineEnd = findCrlf(protocolBuffer);
        if (lineEnd < 0) return;

        const line = decoder.decode(protocolBuffer.slice(0, lineEnd));
        const tokens = line.trim().split(/\s+/);

        if (tokens[0] === 'MSG') {
          const subject = tokens[1] ?? '';
          const payloadLengthIndex = tokens.length === 5 ? 4 : 3;
          const payloadLength = Number.parseInt(tokens[payloadLengthIndex] ?? '', 10);
          if (!Number.isInteger(payloadLength) || payloadLength < 0) {
            onErrorRef.current?.(`NATS protocolo inválido: ${line}`);
            ws?.close(1002, 'Invalid MSG');
            return;
          }

          const payloadStart = lineEnd + 2;
          const payloadEnd = payloadStart + payloadLength;
          if (protocolBuffer.length < payloadEnd + 2) return;

          const payload = protocolBuffer.slice(payloadStart, payloadEnd);
          protocolBuffer = protocolBuffer.slice(payloadEnd + 2);

          // Roteia por tipo de subject
          if (subject.endsWith('.event')) {
            processEventMessage(decoder.decode(payload));
          } else if (subject.endsWith('.frame.frag')) {
            processScreenFrameFrag(payload.buffer);
          } else if (subject.endsWith('.cursor')) {
            processCursorMessage(payload.buffer);
          } else {
            // .frame (binário)
            processScreenFrame(payload.buffer);
          }
          continue;
        }

        protocolBuffer = protocolBuffer.slice(lineEnd + 2);

        if (tokens[0] === 'INFO') {
          const connect = JSON.stringify({
            lang: 'discovery-web',
            version: '1.0',
            protocol: 1,
            headers: true,
            verbose: true,
            auth_token: jwt,
          });
          sendProtocol(`CONNECT ${connect}`);
          connectSent = true;
          continue;
        }

        if (tokens[0] === '+OK') {
          if (connectSent && !authenticated) {
            authenticated = true;
            reconnectAttemptsRef.current = 0;
            sendProtocol(`SUB ${natsSubject}.frame 1`);
            sendProtocol(`SUB ${natsSubject}.frame.frag 3`);
            sendProtocol(`SUB ${natsSubject}.cursor 4`);
            sendProtocol(`SUB ${natsSubject}.event 2`);
          }
          continue;
        }

        if (tokens[0] === 'PING') {
          sendProtocol('PONG');
          continue;
        }

        if (tokens[0] === '-ERR') {
          const reason = line.replace(/^-ERR\s*/i, '').replace(/^['"]|['"]$/g, '');
          onErrorRef.current?.(`NATS: ${reason || 'falha de protocolo'}`);
          ws?.close(1008, reason || 'NATS protocol error');
          return;
        }

        if (tokens[0] === 'INFO' || tokens[0] === 'PONG') continue;
      }
    };

    const connect = () => {
      if (cancelled) return;

      const wsUrl = `${natsUrl}?access_token=${encodeURIComponent(jwt)}`;
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[RemoteScreenViewer] WebSocket aberto; aguardando INFO do NATS');
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        const bytes: Uint8Array<ArrayBufferLike> = typeof event.data === 'string'
          ? new Uint8Array(new TextEncoder().encode(event.data))
          : event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new Uint8Array();
        if (!bytes) return;

        protocolBuffer = appendBytes(protocolBuffer, bytes);
        processProtocol();
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
  }, [natsSubject, natsUrl, jwt, decodeFrame, renderFrame]);

  // Input capture (mouse/keyboard) — coordenadas corretas C2
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wsRef.current) return;

    const getFrameCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // canvas CSS size
      const cssW = rect.width;
      const cssH = rect.height;
      // actual bitmap size rendered
      const bmpW = canvas.width / dpr;
      const bmpH = canvas.height / dpr;
      if (cssW <= 0 || cssH <= 0 || bmpW <= 0 || bmpH <= 0) return null;

      const ratio = Math.min(cssW / bmpW, cssH / bmpH);
      const letterboxW = bmpW * ratio;
      const letterboxH = bmpH * ratio;
      const offsetX = (cssW - letterboxW) / 2;
      const offsetY = (cssH - letterboxH) / 2;

      const imgX = (clientX - rect.left - offsetX) / ratio;
      const imgY = (clientY - rect.top - offsetY) / ratio;
      if (imgX < 0 || imgY < 0 || imgX > bmpW || imgY > bmpH) return null; // bars
      return { x: Math.round(imgX), y: Math.round(imgY) };
    };

    let moveThrottle: ReturnType<typeof setTimeout> | null = null;
    let lastMove: MouseEvent | null = null;
    const THROTTLE_MS = 16; // ~60 fps

    const sendInput = (type: string, data: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && natsSubject) {
        const frameCoords = data.x !== undefined ? getFrameCoords(data.x as number, data.y as number) : null;
        const payload = JSON.stringify({
          type,
          ...data,
          ...(frameCoords ? { x: frameCoords.x, y: frameCoords.y } : {}),
          frameWidth: (canvas?.width ?? 1920) / (window.devicePixelRatio || 1),
          frameHeight: (canvas?.height ?? 1080) / (window.devicePixelRatio || 1),
          ts: Date.now(),
        });
        wsRef.current.send(`PUB ${natsSubject}.input ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`);
      }
    };

    const onMouseDown = (e: MouseEvent) => { canvas.focus(); sendInput('mousedown', { button: e.button }); };
    const onMouseUp = (e: MouseEvent) => { canvas.focus(); sendInput('mouseup', { button: e.button }); };
    const onMouseMove = (e: MouseEvent) => {
      lastMove = e;
      if (moveThrottle) return;
      moveThrottle = setTimeout(() => {
        if (lastMove) sendInput('mousemove', { x: lastMove.clientX, y: lastMove.clientY });
        moveThrottle = null;
      }, THROTTLE_MS);
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); sendInput('wheel', { deltaX: e.deltaX, deltaY: e.deltaY }); };
    const onKeyDown = (e: KeyboardEvent) => { if (document.activeElement === canvas) { e.preventDefault(); sendInput('keydown', { key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey }); } };
    const onKeyUp = (e: KeyboardEvent) => { if (document.activeElement === canvas) { sendInput('keyup', { key: e.key, code: e.code }); } };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (moveThrottle) clearTimeout(moveThrottle);
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

      {/* Info overlay — métricas locais + do agent */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 text-xs bg-slate-900/70 rounded px-2 py-1.5 backdrop-blur-sm pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-medium">{fps} FPS</span>
          <span className="text-slate-400">{rtt}ms</span>
          <span className="text-slate-500">{quality.toUpperCase()}</span>
          <span className="text-slate-500">{codec.toUpperCase()}</span>
          {isPaused && <span className="text-amber-400">⏸</span>}
        </div>
        {agentMetrics && (
          <div className="flex items-center gap-3 text-[10px] text-slate-600">
            <span title="Resolução">📐 {agentMetrics.resolution}</span>
            <span title="FPS do agent (efetivo/perfil)">🎯 {agentMetrics.effectiveFps}/{agentMetrics.profileFps}FPS</span>
            <span title="Qualidade JPEG">🖼 {agentMetrics.imageQuality}%</span>
            <span title={`Compressão ${agentMetrics.compressionRatio?.toFixed(1)}:1`}>
              🗜 {agentMetrics.compressionRatio?.toFixed(1)}:1
            </span>
            <span title={`Encode médio: ${agentMetrics.avgEncodeMs?.toFixed(1)}ms`}>
              ⚡ {agentMetrics.avgEncodeMs?.toFixed(1)}ms
            </span>
            <span title={`Frames (5s): ${agentMetrics.framesSent5s} enviados / ${agentMetrics.framesSkipped5s} pulados`}>
              📊 {agentMetrics.framesSent5s}/{agentMetrics.framesSkipped5s}
            </span>
            <span className="text-slate-500">#{agentMetrics.totalFrames}</span>
          </div>
        )}
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

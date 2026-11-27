import { useCallback, useEffect, useRef } from 'react';
import {
  ANNOTATION_MAGNIFIER_MAX_ZOOM,
  ANNOTATION_MAGNIFIER_MIN_ZOOM,
  buildAddAnnotationCommand,
  constrainShapePoint,
  drawPreviewShape,
  normalizePoint,
  type AnnotationCommand,
  type AnnotationPoint,
  type AnnotationSettings,
  type AnnotationTool,
  type RemoteAnnotationTool,
} from './types';

interface AnnotationCanvasProps {
  active: boolean;
  settings: AnnotationSettings;
  onCommit: (cmd: AnnotationCommand) => void;
  onUndo: () => void;
  onExit: () => void;
  sourceCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onChangeSettings?: (next: AnnotationSettings) => void;
  resetToken?: number;
}

interface PendingPreview {
  tool: RemoteAnnotationTool;
  color: string;
  width: number;
  points: AnnotationPoint[];
}

const TOOL_SHORTCUTS: Record<string, AnnotationTool> = {
  '1': 'arrow',
  '2': 'ellipse',
  '3': 'rect',
  '4': 'freehand',
  '5': 'laser',
  '6': 'magnifier',
};

const OPTIMISTIC_PREVIEW_MS = 220;

export default function AnnotationCanvas({
  active,
  settings,
  onCommit,
  onUndo,
  onExit,
  sourceCanvasRef,
  onChangeSettings,
  resetToken = 0,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<AnnotationPoint[]>([]);
  const pendingPreviewRef = useRef<PendingPreview | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cssSizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 1, h: 1, dpr: 1 });

  // Estado da lupa (coordenadas CSS relativas ao canvas)
  const lensPosRef = useRef<{ x: number; y: number } | null>(null);
  const lensPinnedRef = useRef(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onChangeSettingsRef = useRef(onChangeSettings);
  onChangeSettingsRef.current = onChangeSettings;

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPendingTimer(), [clearPendingTimer]);

  const clearPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    cssSizeRef.current = { w: cssW, h: cssH, dpr };
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => syncSize());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [syncSize]);

  useEffect(() => {
    pendingPreviewRef.current = null;
    clearPendingTimer();
    if (settings.tool !== 'magnifier') {
      clearPreview();
    }
  }, [resetToken, clearPendingTimer, clearPreview, settings.tool]);

  useEffect(() => {
    if (!active) {
      drawingRef.current = false;
      pointsRef.current = [];
      pendingPreviewRef.current = null;
      lensPosRef.current = null;
      lensPinnedRef.current = false;
      clearPendingTimer();
      clearPreview();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const currentSettings = settingsRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (currentSettings.tool === 'magnifier' && lensPinnedRef.current) {
          lensPinnedRef.current = false;
          return;
        }
        drawingRef.current = false;
        pointsRef.current = [];
        pendingPreviewRef.current = null;
        clearPendingTimer();
        clearPreview();
        onExit();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        pendingPreviewRef.current = null;
        clearPendingTimer();
        onUndo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT')
      ) {
        return;
      }

      const shortcutTool = TOOL_SHORTCUTS[e.key];
      const changeSettings = onChangeSettingsRef.current;
      if (shortcutTool && changeSettings) {
        e.preventDefault();
        e.stopPropagation();
        if (shortcutTool !== currentSettings.tool) {
          changeSettings({ ...currentSettings, tool: shortcutTool });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [active, clearPendingTimer, clearPreview, onExit, onUndo]);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w: cssW, h: cssH, dpr } = cssSizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pending = pendingPreviewRef.current;
    if (pending && pending.points.length >= 2) {
      drawPreviewShape(
        ctx,
        cssW,
        cssH,
        pending.tool,
        pending.color,
        pending.width,
        pending.points,
        0.85,
      );
    }

    if (settings.tool !== 'magnifier' && pointsRef.current.length >= 2) {
      drawPreviewShape(
        ctx,
        cssW,
        cssH,
        settings.tool,
        settings.color,
        settings.width,
        pointsRef.current,
      );
    }
  }, [settings.color, settings.tool, settings.width, syncSize]);

  // Loop de renderização em tempo real para a Lupa
  useEffect(() => {
    if (!active || settings.tool !== 'magnifier') {
      lensPosRef.current = null;
      lensPinnedRef.current = false;
      return;
    }

    let rafId = 0;
    const drawMagnifierFrame = () => {
      const pos = lensPosRef.current;
      const canvas = canvasRef.current;
      const src = sourceCanvasRef?.current;
      if (pos && canvas) {
        if (canvas.width <= 1 || canvas.height <= 1) {
          syncSize();
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { w: cssW, h: cssH, dpr } = cssSizeRef.current;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (src && src.width > 0 && src.height > 0 && cssW > 0 && cssH > 0) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const radius = Math.min(settings.magnifierSize / 2, Math.min(cssW, cssH) * 0.45);
            const zoom = Math.max(
              ANNOTATION_MAGNIFIER_MIN_ZOOM,
              Math.min(ANNOTATION_MAGNIFIER_MAX_ZOOM, settings.magnifierZoom),
            );
            const cx = Math.max(0, Math.min(cssW, pos.x));
            const cy = Math.max(0, Math.min(cssH, pos.y));
            const pinned = lensPinnedRef.current;

            // Sombra externa suave da lente
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetY = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#020617';
            ctx.fill();
            ctx.restore();

            // Conteúdo ampliado dentro do recorte circular
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();

            ctx.fillStyle = '#020617';
            ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

            const scaleX = src.width / cssW;
            const scaleY = src.height / cssH;
            const srcCenterX = cx * scaleX;
            const srcCenterY = cy * scaleY;
            const srcW = ((radius * 2) / zoom) * scaleX;
            const srcH = ((radius * 2) / zoom) * scaleY;
            const sx = srcCenterX - srcW / 2;
            const sy = srcCenterY - srcH / 2;

            // Interseção estrita com os limites do canvas fonte (evita artefatos fora da borda)
            const clipSrcX = Math.max(0, sx);
            const clipSrcY = Math.max(0, sy);
            const clipSrcRight = Math.min(src.width, sx + srcW);
            const clipSrcBottom = Math.min(src.height, sy + srcH);
            const clipSrcW = clipSrcRight - clipSrcX;
            const clipSrcH = clipSrcBottom - clipSrcY;

            if (clipSrcW > 0 && clipSrcH > 0) {
              const dstX = cx - radius + ((clipSrcX - sx) / srcW) * (radius * 2);
              const dstY = cy - radius + ((clipSrcY - sy) / srcH) * (radius * 2);
              const dstW = (clipSrcW / srcW) * (radius * 2);
              const dstH = (clipSrcH / srcH) * (radius * 2);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(src, clipSrcX, clipSrcY, clipSrcW, clipSrcH, dstX, dstY, dstW, dstH);
            }

            // Retículo sutil no centro com vão para não cobrir texto sob o cursor
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy);
            ctx.lineTo(cx - 4, cy);
            ctx.moveTo(cx + 4, cy);
            ctx.lineTo(cx + 10, cy);
            ctx.moveTo(cx, cy - 10);
            ctx.lineTo(cx, cy - 4);
            ctx.moveTo(cx, cy + 4);
            ctx.lineTo(cx, cy + 10);
            ctx.stroke();

            // Badge de zoom na base interna da lente
            const zoomLabel = Number.isInteger(zoom) ? `${zoom}×` : `${zoom.toFixed(1)}×`;
            const badgeText = pinned ? `${zoomLabel} · Fixo` : zoomLabel;
            ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
            const textWidth = ctx.measureText(badgeText).width;
            const pillW = textWidth + 14;
            const pillH = 18;
            const pillX = cx - pillW / 2;
            const pillY = cy + radius - pillH - 8;
            ctx.fillStyle = pinned ? 'rgba(37, 99, 235, 0.9)' : 'rgba(15, 23, 42, 0.85)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(pillX, pillY, pillW, pillH, 9);
            } else {
              ctx.rect(pillX, pillY, pillW, pillH);
            }
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, cx, pillY + pillH / 2 + 0.5);
            ctx.restore();

            // Anel duplo da lente
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.lineWidth = pinned ? 3 : 2;
            ctx.strokeStyle = pinned ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      rafId = requestAnimationFrame(drawMagnifierFrame);
    };

    rafId = requestAnimationFrame(drawMagnifierFrame);
    return () => cancelAnimationFrame(rafId);
  }, [active, settings.magnifierSize, settings.magnifierZoom, settings.tool, sourceCanvasRef, syncSize]);

  const getLocalCssPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (settings.tool === 'magnifier') {
      lensPosRef.current = getLocalCssPos(e);
      lensPinnedRef.current = !lensPinnedRef.current;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    pendingPreviewRef.current = null;
    clearPendingTimer();

    const pt = normalizePoint(e.clientX, e.clientY, canvas.getBoundingClientRect());
    drawingRef.current = true;
    pointsRef.current = [pt, pt];
    renderPreview();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;

    if (settings.tool === 'magnifier') {
      if (!lensPinnedRef.current) {
        lensPosRef.current = getLocalCssPos(e);
      }
      return;
    }

    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawPt = normalizePoint(e.clientX, e.clientY, rect);
    const aspect = rect.height > 0 ? rect.width / rect.height : 1;
    const pt = constrainShapePoint(settings.tool, pointsRef.current[0], rawPt, aspect, e.shiftKey);

    if (settings.tool === 'freehand' || settings.tool === 'laser') {
      pointsRef.current.push(pt);
    } else {
      pointsRef.current = [pointsRef.current[0], pt];
    }
    renderPreview();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    if (settings.tool === 'magnifier' || !drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (commit && settings.tool !== 'freehand' && settings.tool !== 'laser' && canvas) {
      const rect = canvas.getBoundingClientRect();
      const rawPt = normalizePoint(e.clientX, e.clientY, rect);
      const aspect = rect.height > 0 ? rect.width / rect.height : 1;
      const pt = constrainShapePoint(settings.tool, pointsRef.current[0], rawPt, aspect, e.shiftKey);
      pointsRef.current = [pointsRef.current[0], pt];
    }

    const pts = pointsRef.current;
    drawingRef.current = false;
    pointsRef.current = [];

    if (!commit || pts.length < 2) {
      clearPreview();
      return;
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    const moved = Math.hypot(last.x - first.x, last.y - first.y) > 0.002 || pts.length > 3;
    if (!moved) {
      clearPreview();
      return;
    }

    const cmd = buildAddAnnotationCommand(
      {
        tool: settings.tool,
        color: settings.color,
        width: settings.width,
        ttlMs: settings.ttlMs,
        magnifierZoom: settings.magnifierZoom,
        magnifierSize: settings.magnifierSize,
      },
      pts,
    );

    // Mantém preview otimista breve enquanto o frame do agente chega, evitando flicker
    pendingPreviewRef.current = {
      tool: settings.tool,
      color: settings.color,
      width: settings.width,
      points: cmd.points,
    };
    clearPendingTimer();
    renderPreview();
    pendingTimerRef.current = setTimeout(() => {
      pendingPreviewRef.current = null;
      pendingTimerRef.current = null;
      renderPreview();
    }, OPTIMISTIC_PREVIEW_MS);

    onCommit(cmd);
  };

  const handlePointerLeave = () => {
    if (settings.tool === 'magnifier' && !lensPinnedRef.current) {
      lensPosRef.current = null;
      clearPreview();
    }
  };

  // Listener wheel nativo com { passive: false } para permitir preventDefault()
  // sem warning/erro no Chrome/React 19 ao ajustar o zoom da lupa.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || settings.tool !== 'magnifier') return;

    const onWheel = (e: WheelEvent) => {
      const changeSettings = onChangeSettingsRef.current;
      if (!changeSettings) return;
      e.preventDefault();
      e.stopPropagation();
      const current = settingsRef.current;
      const step = e.deltaY < 0 ? 0.5 : -0.5;
      const nextZoom = Math.max(
        ANNOTATION_MAGNIFIER_MIN_ZOOM,
        Math.min(ANNOTATION_MAGNIFIER_MAX_ZOOM, Math.round((current.magnifierZoom + step) * 2) / 2),
      );
      if (nextZoom !== current.magnifierZoom) {
        changeSettings({ ...current, magnifierZoom: nextZoom });
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [active, settings.tool]);

  const cursorClass =
    settings.tool === 'magnifier' ? 'cursor-zoom-in' : 'cursor-crosshair';

  return (
    <canvas
      ref={canvasRef}
      data-testid="annotation-canvas"
      className={`absolute inset-0 h-full w-full ${
        active
          ? `pointer-events-auto ring-2 ring-inset ring-primary/50 ${cursorClass}`
          : 'pointer-events-none'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishStroke(e, true)}
      onPointerCancel={(e) => finishStroke(e, false)}
      onPointerLeave={handlePointerLeave}
    />
  );
}

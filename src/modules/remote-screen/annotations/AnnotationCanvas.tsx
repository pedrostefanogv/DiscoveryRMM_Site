import { useCallback, useEffect, useRef } from 'react';
import {
  buildAddAnnotationCommand,
  drawPreviewShape,
  normalizePoint,
  type AnnotationCommand,
  type AnnotationPoint,
  type AnnotationSettings,
} from './types';

interface AnnotationCanvasProps {
  active: boolean;
  settings: AnnotationSettings;
  onCommit: (cmd: AnnotationCommand) => void;
  onUndo: () => void;
  onExit: () => void;
}

export default function AnnotationCanvas({
  active,
  settings,
  onCommit,
  onUndo,
  onExit,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<AnnotationPoint[]>([]);

  const clearPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    const observer = new ResizeObserver(() => syncSize());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [syncSize]);

  useEffect(() => {
    if (!active) {
      drawingRef.current = false;
      pointsRef.current = [];
      clearPreview();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        drawingRef.current = false;
        pointsRef.current = [];
        clearPreview();
        onExit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        onUndo();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, clearPreview, onExit, onUndo]);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPreviewShape(
      ctx,
      canvas.width,
      canvas.height,
      settings.tool,
      settings.color,
      settings.width,
      pointsRef.current,
    );
  }, [settings.color, settings.tool, settings.width, syncSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = normalizePoint(e.clientX, e.clientY, canvas.getBoundingClientRect());
    drawingRef.current = true;
    pointsRef.current = [pt, pt];
    renderPreview();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || !drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = normalizePoint(e.clientX, e.clientY, canvas.getBoundingClientRect());
    if (settings.tool === 'freehand' || settings.tool === 'laser') {
      pointsRef.current.push(pt);
    } else {
      pointsRef.current = [pointsRef.current[0], pt];
    }
    renderPreview();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const pts = pointsRef.current;
    drawingRef.current = false;
    pointsRef.current = [];
    clearPreview();

    if (!commit || pts.length < 2) return;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const moved = Math.hypot(last.x - first.x, last.y - first.y) > 0.002 || pts.length > 3;
    if (!moved) return;

    onCommit(buildAddAnnotationCommand(settings, pts));
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="annotation-canvas"
      className={`absolute inset-0 h-full w-full ${
        active ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishStroke(e, true)}
      onPointerCancel={(e) => finishStroke(e, false)}
    />
  );
}

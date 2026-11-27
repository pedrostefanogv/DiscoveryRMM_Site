export type RemoteAnnotationTool = 'arrow' | 'ellipse' | 'rect' | 'freehand' | 'laser';

export type AnnotationTool = RemoteAnnotationTool | 'magnifier';

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationAddCommand {
  op: 'add';
  id: string;
  tool: RemoteAnnotationTool;
  color: string;
  width: number;
  ttlMs: number;
  points: AnnotationPoint[];
}

export interface AnnotationUndoCommand {
  op: 'undo';
  id?: string;
}

export interface AnnotationClearCommand {
  op: 'clear';
}

export type AnnotationCommand =
  | AnnotationAddCommand
  | AnnotationUndoCommand
  | AnnotationClearCommand;

export interface AnnotationSettings {
  tool: AnnotationTool;
  color: string;
  width: number;
  ttlMs: number;
  magnifierZoom: number;
  magnifierSize: number;
}

export const ANNOTATION_MAX_POINTS = 256;
export const ANNOTATION_LASER_TTL_MS = 3000;
export const ANNOTATION_MAGNIFIER_ZOOMS = [2, 3, 4] as const;
export const ANNOTATION_MAGNIFIER_MIN_ZOOM = 1.5;
export const ANNOTATION_MAGNIFIER_MAX_ZOOM = 5;
export const ANNOTATION_MAGNIFIER_SIZES = [
  { value: 160, label: 'Pequena', short: 'P' },
  { value: 220, label: 'Média', short: 'M' },
  { value: 280, label: 'Grande', short: 'G' },
] as const;

export const ANNOTATION_COLORS = [
  { value: '#FF3B30', label: 'Vermelho' },
  { value: '#FFCC00', label: 'Amarelo' },
  { value: '#34C759', label: 'Verde' },
  { value: '#0A84FF', label: 'Azul' },
  { value: '#FFFFFF', label: 'Branco' },
] as const;

export const ANNOTATION_WIDTHS = [
  { value: 3, label: 'Fina', short: 'P' },
  { value: 5, label: 'Média', short: 'M' },
  { value: 8, label: 'Grossa', short: 'G' },
] as const;

export const ANNOTATION_TTLS = [
  { value: 5000, label: '5s' },
  { value: 8000, label: '8s' },
  { value: 15000, label: '15s' },
  { value: 0, label: 'Fixo' },
] as const;

export const DEFAULT_ANNOTATION_SETTINGS: AnnotationSettings = {
  tool: 'arrow',
  color: '#FF3B30',
  width: 5,
  ttlMs: 8000,
  magnifierZoom: 2,
  magnifierSize: 220,
};

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function normalizePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): AnnotationPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function simplifyFreehandPoints(
  points: AnnotationPoint[],
  minDistNorm = 0.004,
  maxPoints = ANNOTATION_MAX_POINTS,
): AnnotationPoint[] {
  if (points.length <= 2) {
    return points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
  }

  const filtered: AnnotationPoint[] = [
    { x: clamp01(points[0].x), y: clamp01(points[0].y) },
  ];
  let last = filtered[0];

  for (let i = 1; i < points.length - 1; i++) {
    const pt = { x: clamp01(points[i].x), y: clamp01(points[i].y) };
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (dist >= minDistNorm) {
      filtered.push(pt);
      last = pt;
    }
  }

  const end = {
    x: clamp01(points[points.length - 1].x),
    y: clamp01(points[points.length - 1].y),
  };
  filtered.push(end);

  if (filtered.length <= maxPoints) {
    return filtered;
  }

  const downsampled: AnnotationPoint[] = [];
  const lastIdx = filtered.length - 1;
  for (let i = 0; i < maxPoints - 1; i++) {
    const idx = Math.floor((i * lastIdx) / (maxPoints - 1));
    downsampled.push(filtered[idx]);
  }
  downsampled.push(filtered[lastIdx]);
  return downsampled;
}

export function generateAnnotationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function constrainShapePoint(
  tool: RemoteAnnotationTool,
  start: AnnotationPoint,
  current: AnnotationPoint,
  aspectRatio: number,
  shiftKey: boolean,
): AnnotationPoint {
  if (!shiftKey || tool === 'freehand' || tool === 'laser' || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return current;
  }

  const dxVis = (current.x - start.x) * aspectRatio;
  const dyVis = current.y - start.y;

  if (tool === 'rect' || tool === 'ellipse') {
    const side = Math.max(Math.abs(dxVis), Math.abs(dyVis));
    const signX = dxVis < 0 ? -1 : 1;
    const signY = dyVis < 0 ? -1 : 1;
    return {
      x: clamp01(start.x + (signX * side) / aspectRatio),
      y: clamp01(start.y + signY * side),
    };
  }

  // arrow: snap a ângulos múltiplos de 45°
  const dist = Math.hypot(dxVis, dyVis);
  if (dist < 1e-6) return current;
  const angle = Math.atan2(dyVis, dxVis);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: clamp01(start.x + (Math.cos(snapped) * dist) / aspectRatio),
    y: clamp01(start.y + Math.sin(snapped) * dist),
  };
}

export function buildAddAnnotationCommand(
  settings: Omit<AnnotationSettings, 'tool'> & { tool: RemoteAnnotationTool },
  points: AnnotationPoint[],
  id = generateAnnotationId(),
): AnnotationAddCommand {
  const preparedPoints =
    settings.tool === 'freehand' || settings.tool === 'laser'
      ? simplifyFreehandPoints(points)
      : [
          { x: clamp01(points[0]?.x ?? 0), y: clamp01(points[0]?.y ?? 0) },
          {
            x: clamp01(points[points.length - 1]?.x ?? 0),
            y: clamp01(points[points.length - 1]?.y ?? 0),
          },
        ];

  return {
    op: 'add',
    id,
    tool: settings.tool,
    color: settings.color,
    width: settings.width,
    ttlMs: settings.tool === 'laser' ? ANNOTATION_LASER_TTL_MS : settings.ttlMs,
    points: preparedPoints,
  };
}

export function buildUndoAnnotationCommand(id?: string): AnnotationUndoCommand {
  return id ? { op: 'undo', id } : { op: 'undo' };
}

export function buildClearAnnotationsCommand(): AnnotationClearCommand {
  return { op: 'clear' };
}

/**
 * Desenha o preview instantâneo (0ms) no canvas local do viewer enquanto o
 * operador está arrastando o ponteiro. Após soltar, o preview é limpo e o
 * traço oficial vem renderizado no frame do desktop remoto.
 */
export function drawPreviewShape(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tool: RemoteAnnotationTool,
  color: string,
  strokeWidth: number,
  points: AnnotationPoint[],
  opacity = 1,
): void {
  if (points.length < 2 || width <= 0 || height <= 0) return;

  const p0 = { x: points[0].x * width, y: points[0].y * height };
  const pLast = {
    x: points[points.length - 1].x * width,
    y: points[points.length - 1].y * height,
  };

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPass = (passColor: string, passWidth: number, passAlpha?: number) => {
    ctx.save();
    if (passAlpha !== undefined) {
      ctx.globalAlpha = opacity * passAlpha;
    }
    ctx.strokeStyle = passColor;
    ctx.fillStyle = passColor;
    ctx.lineWidth = passWidth;

    switch (tool) {
      case 'rect': {
        const x = Math.min(p0.x, pLast.x);
        const y = Math.min(p0.y, pLast.y);
        const w = Math.abs(pLast.x - p0.x);
        const h = Math.abs(pLast.y - p0.y);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'ellipse': {
        const cx = (p0.x + pLast.x) / 2;
        const cy = (p0.y + pLast.y) / 2;
        const rx = Math.max(1, Math.abs(pLast.x - p0.x) / 2);
        const ry = Math.max(1, Math.abs(pLast.y - p0.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const dx = pLast.x - p0.x;
        const dy = pLast.y - p0.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) break;
        const ux = dx / dist;
        const uy = dy / dist;
        const px = -uy;
        const py = ux;
        const headLen = Math.min(dist * 0.75, Math.max(16, passWidth * 4.2));
        const headHalfW = Math.max(9, passWidth * 2.1);
        const baseX = pLast.x - ux * headLen;
        const baseY = pLast.y - uy * headLen;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pLast.x, pLast.y);
        ctx.lineTo(baseX + px * headHalfW, baseY + py * headHalfW);
        ctx.lineTo(baseX - px * headHalfW, baseY - py * headHalfW);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'freehand':
      case 'laser': {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x * width, points[i].y * height);
        }
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  };

  if (tool === 'laser') {
    drawPass(color, strokeWidth + 10, 0.28);
    drawPass('rgba(0, 0, 0, 0.45)', strokeWidth + 3);
    drawPass(color, strokeWidth);
    drawPass('rgba(255, 255, 255, 0.85)', Math.max(1.5, strokeWidth * 0.4));
  } else {
    // Halo escuro sutil para contraste + traço colorido principal
    drawPass('rgba(0, 0, 0, 0.45)', strokeWidth + 3);
    drawPass(color, strokeWidth);
  }
  ctx.restore();
}

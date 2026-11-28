import { useCallback, useEffect, useRef } from 'react';
import {
  ANNOTATION_MAGNIFIER_MAX_ZOOM,
  ANNOTATION_MAGNIFIER_MIN_ZOOM,
  buildAddAnnotationCommand,
  buildLaserCommand,
  buildMagnifierCommand,
  constrainShapePoint,
  drawPreviewShape,
  normalizePoint,
  type AnnotationCommand,
  type AnnotationLaserCommand,
  type AnnotationMagnifierCommand,
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
  clearToken?: number;
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
const MAGNIFIER_THROTTLE_MS = 33;
const LASER_THROTTLE_MS = 33;

export default function AnnotationCanvas({
  active,
  settings,
  onCommit,
  onUndo,
  onExit,
  sourceCanvasRef: _sourceCanvasRef,
  onChangeSettings,
  resetToken = 0,
  clearToken = 0,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<AnnotationPoint[]>([]);
  const pendingPreviewRef = useRef<PendingPreview | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cssSizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 1, h: 1, dpr: 1 });

  // Estado da lupa remota (coordenadas normalizadas [0..1])
  const lensNormPosRef = useRef<AnnotationPoint | null>(null);
  const lensPinnedRef = useRef(false);
  const remoteMagnifierActiveRef = useRef(false);
  const magThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const magLastSentAtRef = useRef(0);
  const magPendingCmdRef = useRef<AnnotationMagnifierCommand | null>(null);

  // Estado do apontador laser ao vivo (coordenadas normalizadas [0..1])
  const laserNormPosRef = useRef<AnnotationPoint | null>(null);
  const remoteLaserActiveRef = useRef(false);
  const laserThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laserLastSentAtRef = useRef(0);
  const laserPendingCmdRef = useRef<AnnotationLaserCommand | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onChangeSettingsRef = useRef(onChangeSettings);
  onChangeSettingsRef.current = onChangeSettings;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const clearMagThrottle = useCallback(() => {
    if (magThrottleTimerRef.current) {
      clearTimeout(magThrottleTimerRef.current);
      magThrottleTimerRef.current = null;
    }
    magPendingCmdRef.current = null;
  }, []);

  const computeNormalizedRadius = useCallback((magnifierSize: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0.15;
    const rect = canvas.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height);
    if (minDim <= 0) return 0.15;
    return Math.min(0.45, Math.max(0.05, magnifierSize / 2 / minDim));
  }, []);

  const sendMagnifierNow = useCallback(
    (cmd: AnnotationMagnifierCommand) => {
      clearMagThrottle();
      magLastSentAtRef.current = Date.now();
      remoteMagnifierActiveRef.current = cmd.active;
      onCommitRef.current(cmd);
    },
    [clearMagThrottle],
  );

  const sendMagnifierThrottled = useCallback(
    (cmd: AnnotationMagnifierCommand) => {
      const now = Date.now();
      const elapsed = now - magLastSentAtRef.current;
      if (elapsed >= MAGNIFIER_THROTTLE_MS) {
        sendMagnifierNow(cmd);
        return;
      }
      magPendingCmdRef.current = cmd;
      if (!magThrottleTimerRef.current) {
        magThrottleTimerRef.current = setTimeout(() => {
          magThrottleTimerRef.current = null;
          const pending = magPendingCmdRef.current;
          magPendingCmdRef.current = null;
          if (pending) {
            magLastSentAtRef.current = Date.now();
            remoteMagnifierActiveRef.current = pending.active;
            onCommitRef.current(pending);
          }
        }, MAGNIFIER_THROTTLE_MS - elapsed);
      }
    },
    [sendMagnifierNow],
  );

  const hideRemoteMagnifier = useCallback(() => {
    clearMagThrottle();
    if (remoteMagnifierActiveRef.current) {
      sendMagnifierNow(buildMagnifierCommand(false));
    }
  }, [clearMagThrottle, sendMagnifierNow]);

  const clearLaserThrottle = useCallback(() => {
    if (laserThrottleTimerRef.current) {
      clearTimeout(laserThrottleTimerRef.current);
      laserThrottleTimerRef.current = null;
    }
    laserPendingCmdRef.current = null;
  }, []);

  const sendLaserNow = useCallback(
    (cmd: AnnotationLaserCommand) => {
      clearLaserThrottle();
      laserLastSentAtRef.current = Date.now();
      remoteLaserActiveRef.current = cmd.active;
      onCommitRef.current(cmd);
    },
    [clearLaserThrottle],
  );

  const sendLaserThrottled = useCallback(
    (cmd: AnnotationLaserCommand) => {
      const now = Date.now();
      const elapsed = now - laserLastSentAtRef.current;
      if (elapsed >= LASER_THROTTLE_MS) {
        sendLaserNow(cmd);
        return;
      }
      laserPendingCmdRef.current = cmd;
      if (!laserThrottleTimerRef.current) {
        laserThrottleTimerRef.current = setTimeout(() => {
          laserThrottleTimerRef.current = null;
          const pending = laserPendingCmdRef.current;
          laserPendingCmdRef.current = null;
          if (pending) {
            laserLastSentAtRef.current = Date.now();
            remoteLaserActiveRef.current = pending.active;
            onCommitRef.current(pending);
          }
        }, LASER_THROTTLE_MS - elapsed);
      }
    },
    [sendLaserNow],
  );

  const hideRemoteLaser = useCallback(() => {
    clearLaserThrottle();
    if (remoteLaserActiveRef.current) {
      sendLaserNow(buildLaserCommand(false));
    }
  }, [clearLaserThrottle, sendLaserNow]);

  useEffect(
    () => () => {
      clearPendingTimer();
      hideRemoteMagnifier();
      hideRemoteLaser();
    },
    [clearPendingTimer, hideRemoteMagnifier, hideRemoteLaser],
  );

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
    clearPreview();
  }, [resetToken, clearPendingTimer, clearPreview]);

  useEffect(() => {
    clearMagThrottle();
    lensNormPosRef.current = null;
    lensPinnedRef.current = false;
    remoteMagnifierActiveRef.current = false;
    clearLaserThrottle();
    laserNormPosRef.current = null;
    remoteLaserActiveRef.current = false;
  }, [clearToken, clearMagThrottle, clearLaserThrottle]);

  useEffect(() => {
    if (!active) {
      drawingRef.current = false;
      pointsRef.current = [];
      pendingPreviewRef.current = null;
      lensNormPosRef.current = null;
      lensPinnedRef.current = false;
      laserNormPosRef.current = null;
      clearPendingTimer();
      clearPreview();
      hideRemoteMagnifier();
      hideRemoteLaser();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const currentSettings = settingsRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (currentSettings.tool === 'magnifier' && lensPinnedRef.current) {
          lensPinnedRef.current = false;
          const pos = lensNormPosRef.current;
          if (pos) {
            sendMagnifierNow(
              buildMagnifierCommand(true, {
                x: pos.x,
                y: pos.y,
                zoom: currentSettings.magnifierZoom,
                radius: computeNormalizedRadius(currentSettings.magnifierSize),
                pinned: false,
              }),
            );
          } else {
            hideRemoteMagnifier();
          }
          return;
        }
        drawingRef.current = false;
        pointsRef.current = [];
        pendingPreviewRef.current = null;
        clearPendingTimer();
        clearPreview();
        hideRemoteMagnifier();
        hideRemoteLaser();
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
  }, [
    active,
    clearPendingTimer,
    clearPreview,
    computeNormalizedRadius,
    hideRemoteLaser,
    hideRemoteMagnifier,
    onExit,
    onUndo,
    sendMagnifierNow,
  ]);

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

  // Sincronização da lupa remota ao trocar ferramenta ou ajustar zoom/tamanho
  useEffect(() => {
    if (!active || settings.tool !== 'magnifier') {
      lensNormPosRef.current = null;
      lensPinnedRef.current = false;
      hideRemoteMagnifier();
      return;
    }

    const pos = lensNormPosRef.current;
    if (pos) {
      sendMagnifierNow(
        buildMagnifierCommand(true, {
          x: pos.x,
          y: pos.y,
          zoom: settings.magnifierZoom,
          radius: computeNormalizedRadius(settings.magnifierSize),
          pinned: lensPinnedRef.current,
        }),
      );
    }
  }, [
    active,
    computeNormalizedRadius,
    hideRemoteMagnifier,
    sendMagnifierNow,
    settings.magnifierSize,
    settings.magnifierZoom,
    settings.tool,
  ]);

  // Sincronização do apontador laser ao vivo
  useEffect(() => {
    if (!active || settings.tool !== 'laser') {
      laserNormPosRef.current = null;
      hideRemoteLaser();
      return;
    }

    const pos = laserNormPosRef.current;
    if (pos) {
      sendLaserNow(
        buildLaserCommand(true, {
          x: pos.x,
          y: pos.y,
          color: settings.color,
          width: settings.width,
        }),
      );
    }
  }, [active, hideRemoteLaser, sendLaserNow, settings.color, settings.tool, settings.width]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (settings.tool === 'magnifier') {
      const pt = normalizePoint(e.clientX, e.clientY, rect);
      lensNormPosRef.current = pt;
      lensPinnedRef.current = !lensPinnedRef.current;
      sendMagnifierNow(
        buildMagnifierCommand(true, {
          x: pt.x,
          y: pt.y,
          zoom: settings.magnifierZoom,
          radius: computeNormalizedRadius(settings.magnifierSize),
          pinned: lensPinnedRef.current,
        }),
      );
      return;
    }

    if (settings.tool === 'laser') {
      const pt = normalizePoint(e.clientX, e.clientY, rect);
      laserNormPosRef.current = pt;
      sendLaserNow(
        buildLaserCommand(true, {
          x: pt.x,
          y: pt.y,
          color: settings.color,
          width: settings.width,
        }),
      );
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    pendingPreviewRef.current = null;
    clearPendingTimer();

    const pt = normalizePoint(e.clientX, e.clientY, rect);
    drawingRef.current = true;
    pointsRef.current = [pt, pt];
    renderPreview();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (settings.tool === 'magnifier') {
      if (!lensPinnedRef.current) {
        const pt = normalizePoint(e.clientX, e.clientY, rect);
        lensNormPosRef.current = pt;
        sendMagnifierThrottled(
          buildMagnifierCommand(true, {
            x: pt.x,
            y: pt.y,
            zoom: settings.magnifierZoom,
            radius: computeNormalizedRadius(settings.magnifierSize),
            pinned: false,
          }),
        );
      }
      return;
    }

    if (settings.tool === 'laser') {
      const pt = normalizePoint(e.clientX, e.clientY, rect);
      laserNormPosRef.current = pt;
      sendLaserThrottled(
        buildLaserCommand(true, {
          x: pt.x,
          y: pt.y,
          color: settings.color,
          width: settings.width,
        }),
      );
      return;
    }

    if (!drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rawPt = normalizePoint(e.clientX, e.clientY, rect);
    const aspect = rect.height > 0 ? rect.width / rect.height : 1;
    const pt = constrainShapePoint(settings.tool, pointsRef.current[0], rawPt, aspect, e.shiftKey);

    if (settings.tool === 'freehand') {
      pointsRef.current.push(pt);
    } else {
      pointsRef.current = [pointsRef.current[0], pt];
    }
    renderPreview();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    if (settings.tool === 'magnifier' || settings.tool === 'laser' || !drawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (commit && settings.tool !== 'freehand' && canvas) {
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
      lensNormPosRef.current = null;
      hideRemoteMagnifier();
    } else if (settings.tool === 'laser') {
      laserNormPosRef.current = null;
      hideRemoteLaser();
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

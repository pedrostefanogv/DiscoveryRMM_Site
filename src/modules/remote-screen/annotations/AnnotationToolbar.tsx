import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import {
  ANNOTATION_COLORS,
  ANNOTATION_MAGNIFIER_SIZES,
  ANNOTATION_MAGNIFIER_ZOOMS,
  ANNOTATION_TTLS,
  ANNOTATION_WIDTHS,
  type AnnotationSettings,
  type AnnotationTool,
} from './types';

interface AnnotationToolbarProps {
  settings: AnnotationSettings;
  onChange: (next: AnnotationSettings) => void;
  onUndo: () => void;
  onClear: () => void;
  onExit: () => void;
  canUndo?: boolean;
  activeCount?: number;
}

const TOOLS: { id: AnnotationTool; label: string; shortcut: string; icon: ReactNode }[] = [
  {
    id: 'arrow',
    label: 'Seta',
    shortcut: '1',
    icon: <Icon name="arrow_outward" className="h-4 w-4" />,
  },
  {
    id: 'ellipse',
    label: 'Círculo / Elipse',
    shortcut: '2',
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
        <ellipse cx="8" cy="8" rx="5.5" ry="4.5" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    id: 'rect',
    label: 'Retângulo',
    shortcut: '3',
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.25" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    id: 'freehand',
    label: 'Caneta',
    shortcut: '4',
    icon: <Icon name="edit" className="h-4 w-4" />,
  },
  {
    id: 'laser',
    label: 'Laser (3s)',
    shortcut: '5',
    icon: <Icon name="auto_awesome" className="h-4 w-4" />,
  },
  {
    id: 'magnifier',
    label: 'Lupa',
    shortcut: '6',
    icon: <Icon name="search" className="h-4 w-4" />,
  },
];

const WIDTH_DOT_PX: Record<number, number> = {
  3: 4,
  5: 7,
  8: 10,
};

export default function AnnotationToolbar({
  settings,
  onChange,
  onUndo,
  onClear,
  onExit,
  canUndo = true,
  activeCount,
}: AnnotationToolbarProps) {
  const isLaser = settings.tool === 'laser';
  const isMagnifier = settings.tool === 'magnifier';
  const isPresetZoom = (ANNOTATION_MAGNIFIER_ZOOMS as readonly number[]).includes(
    settings.magnifierZoom,
  );

  return (
    <div
      role="toolbar"
      aria-label="Ferramentas de anotação na tela"
      className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface/95 px-2 py-1.5 text-xs shadow-2xl backdrop-blur-md"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Ferramentas */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Ferramentas">
        {TOOLS.map((t) => {
          const selected = settings.tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              title={`${t.label} (${t.shortcut})`}
              onClick={() => onChange({ ...settings, tool: t.id })}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              {t.icon}
              <span className="sr-only">{t.label}</span>
            </button>
          );
        })}
      </div>

      <span className="h-5 w-px bg-border/80" />

      {isMagnifier ? (
        <>
          {/* Zoom da Lupa */}
          <div className="flex items-center gap-0.5" role="group" aria-label="Nível de zoom da lupa">
            {ANNOTATION_MAGNIFIER_ZOOMS.map((z) => {
              const selected = settings.magnifierZoom === z;
              return (
                <button
                  key={z}
                  type="button"
                  aria-pressed={selected}
                  title={`Ampliação ${z}×`}
                  onClick={() => onChange({ ...settings, magnifierZoom: z })}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                    selected
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {z}×
                </button>
              );
            })}
            {!isPresetZoom && (
              <span
                className="rounded-md bg-primary/20 px-2 py-1 font-mono text-[11px] font-semibold text-primary"
                title="Zoom ajustado pelo scroll"
              >
                {settings.magnifierZoom.toFixed(1)}×
              </span>
            )}
          </div>

          <span className="h-5 w-px bg-border/80" />

          {/* Tamanho da Lupa */}
          <div className="flex items-center gap-0.5" role="group" aria-label="Tamanho da lupa">
            {ANNOTATION_MAGNIFIER_SIZES.map((s) => {
              const selected = settings.magnifierSize === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Lupa ${s.label}`}
                  title={`Lupa ${s.label}`}
                  onClick={() => onChange({ ...settings, magnifierSize: s.value })}
                  className={`h-7 w-7 rounded-md font-mono text-[11px] transition-colors ${
                    selected
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {s.short}
                </button>
              );
            })}
          </div>

          <span className="hidden lg:inline px-1 text-[11px] text-muted-foreground">
            Scroll: zoom · Clique: fixar
          </span>
        </>
      ) : (
        <>
          {/* Cores */}
          <div className="flex items-center gap-0.5" role="group" aria-label="Cor da anotação">
            {ANNOTATION_COLORS.map((c) => {
              const selected = settings.color.toUpperCase() === c.value.toUpperCase();
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-label={`Cor ${c.label}`}
                  aria-pressed={selected}
                  title={c.label}
                  onClick={() => onChange({ ...settings, color: c.value })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
                >
                  <span
                    className={`h-4 w-4 rounded-full border transition-transform ${
                      selected
                        ? 'scale-110 border-white ring-2 ring-primary'
                        : 'border-border/80'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                </button>
              );
            })}
          </div>

          <span className="h-5 w-px bg-border/80" />

          {/* Espessura */}
          <div className="flex items-center gap-0.5" role="group" aria-label="Espessura do traço">
            {ANNOTATION_WIDTHS.map((w) => {
              const selected = settings.width === w.value;
              const dotPx = WIDTH_DOT_PX[w.value] ?? 6;
              return (
                <button
                  key={w.value}
                  type="button"
                  aria-label={`Espessura ${w.label}`}
                  aria-pressed={selected}
                  title={`Espessura ${w.label}`}
                  onClick={() => onChange({ ...settings, width: w.value })}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    selected
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: dotPx, height: dotPx }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          <span className="h-5 w-px bg-border/80" />

          {/* Duração */}
          <div className="flex items-center gap-0.5" role="group" aria-label="Duração da anotação">
            <Icon name="timer" className="mr-0.5 h-3.5 w-3.5 text-muted-foreground" />
            {isLaser ? (
              <span
                className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning"
                title="Apontador laser desaparece em 3 segundos"
              >
                3s
              </span>
            ) : (
              ANNOTATION_TTLS.map((t) => {
                const selected = settings.ttlMs === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={selected}
                    title={
                      t.value === 0
                        ? 'Manter na tela até limpar'
                        : `Apagar automaticamente após ${t.label}`
                    }
                    onClick={() => onChange({ ...settings, ttlMs: t.value })}
                    className={`rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                      selected
                        ? 'bg-primary/20 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      <span className="h-5 w-px bg-border/80" />

      {/* Ações */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!canUndo}
          title="Desfazer última anotação (Ctrl+Z)"
          onClick={onUndo}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="undo" className="h-3.5 w-3.5" />
          <span>Desfazer</span>
          {typeof activeCount === 'number' && activeCount > 0 && (
            <span className="rounded bg-surface-hover px-1 font-mono text-[10px] text-muted-foreground">
              {activeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          title="Limpar todas as anotações da tela"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-danger transition-colors hover:bg-danger/10"
        >
          <Icon name="delete" className="h-3.5 w-3.5" />
          <span>Limpar</span>
        </button>
        <button
          type="button"
          title="Voltar a controlar o PC remoto (Esc)"
          onClick={onExit}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-hover px-2.5 font-medium text-foreground transition-colors hover:bg-border"
        >
          <Icon name="desktop_windows" className="h-3.5 w-3.5" />
          <span>Controlar</span>
        </button>
      </div>
    </div>
  );
}

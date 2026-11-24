import {
  ANNOTATION_COLORS,
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
}

const TOOLS: { id: AnnotationTool; label: string; icon: string }[] = [
  { id: 'arrow', label: 'Seta', icon: '↗' },
  { id: 'ellipse', label: 'Círculo / Elipse', icon: '◯' },
  { id: 'rect', label: 'Retângulo', icon: '▭' },
  { id: 'freehand', label: 'Caneta', icon: '✎' },
  { id: 'laser', label: 'Laser (3s)', icon: '✦' },
];

export default function AnnotationToolbar({
  settings,
  onChange,
  onUndo,
  onClear,
  onExit,
}: AnnotationToolbarProps) {
  const isLaser = settings.tool === 'laser';

  return (
    <div
      role="toolbar"
      aria-label="Ferramentas de anotação na tela"
      className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-md"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Ferramentas */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => {
          const selected = settings.tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              title={t.label}
              onClick={() => onChange({ ...settings, tool: t.id })}
              className={`rounded px-2 py-1 font-medium transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="sr-only">{t.label}</span>
            </button>
          );
        })}
      </div>

      <span className="h-4 w-px bg-border" />

      {/* Cores */}
      <div className="flex items-center gap-1" role="group" aria-label="Cor da anotação">
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
              className={`h-4 w-4 rounded-full border transition-transform ${
                selected ? 'scale-125 border-white ring-2 ring-primary' : 'border-border/80'
              }`}
              style={{ backgroundColor: c.value }}
            />
          );
        })}
      </div>

      <span className="h-4 w-px bg-border" />

      {/* Espessura */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Espessura do traço">
        {ANNOTATION_WIDTHS.map((w) => {
          const selected = settings.width === w.value;
          return (
            <button
              key={w.value}
              type="button"
              aria-pressed={selected}
              title={`Espessura ${w.label}`}
              onClick={() => onChange({ ...settings, width: w.value })}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                selected
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {w.short}
            </button>
          );
        })}
      </div>

      <span className="h-4 w-px bg-border" />

      {/* Duração */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Duração da anotação">
        {isLaser ? (
          <span className="px-1.5 py-0.5 text-[11px] text-warning font-medium" title="Apontador laser desaparece em 3 segundos">
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
                title={t.value === 0 ? 'Manter na tela até limpar' : `Apagar automaticamente após ${t.label}`}
                onClick={() => onChange({ ...settings, ttlMs: t.value })}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
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

      <span className="h-4 w-px bg-border" />

      {/* Ações */}
      <button
        type="button"
        title="Desfazer última anotação (Ctrl+Z)"
        onClick={onUndo}
        className="rounded px-2 py-1 text-foreground hover:bg-surface-hover"
      >
        ↶ Desfazer
      </button>
      <button
        type="button"
        title="Limpar todas as anotações da tela"
        onClick={onClear}
        className="rounded px-2 py-1 text-danger hover:bg-danger/10"
      >
        Limpar
      </button>
      <button
        type="button"
        title="Voltar a controlar o PC remoto (Esc)"
        onClick={onExit}
        className="rounded bg-surface-hover px-2 py-1 font-medium text-foreground hover:bg-border"
      >
        Controlar
      </button>
    </div>
  );
}

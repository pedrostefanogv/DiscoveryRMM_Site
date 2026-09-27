import { memo, type CSSProperties } from 'react';
import { mixHex, normalizeHex, readableTone, relativeLuminance } from '@/theme/color';

/**
 * Badge de estado do workflow.
 *
 * Por que não usar `Badge color="accent"`:
 * o `accent` vem do branding (ex.: rosa) e era aplicado a TODOS os estados,
 * enquanto o pontinho usava a cor real do estado (azul, âmbar...). O resultado
 * era um pill rosa com texto rosa e ponto de outra cor — sem relação visual e
 * com contraste imprevisível quando o branding é claro.
 *
 * Aqui a cor do próprio estado é a matiz do pill (fundo tingido + borda) e o
 * texto/ponto recebem um tom derivado dela com contraste WCAG garantido.
 */

/** Cinza neutro para estados sem cor definida (mesmo fallback do settings). */
export const FALLBACK_STATE_COLOR = '#64748b';

/**
 * Superfícies reais onde o pill/ponto pode cair (espelham src/index.css):
 * surface, surface-light e surface-hover de cada tema. O tom do texto é
 * calculado contra a MAIS desfavorável delas, então o contraste mínimo vale em
 * qualquer linha da tabela (zebra, hover) e no hover card.
 */
const LIGHT_SURFACES = ['#ffffff', '#f1f5f9', '#e2e8f0'];
const DARK_SURFACES = ['#111d33', '#1a2840', '#1e293b'];

/** Mistura a cor do estado com a superfície (fundo tingido / borda). */
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#111d33';

const LIGHT_TINT = 0.86; // 14% da cor do estado
const DARK_TINT = 0.76; // 24% da cor do estado
const LIGHT_BORDER = 0.62;
const DARK_BORDER = 0.5;

/** Menor contraste possível: fundo mais escuro (texto escuro) / mais claro. */
function worstCaseSurface(surfaces: string[], tint: string, preferDark: boolean): string {
  return surfaces
    .concat(tint)
    .reduce((worst, candidate) => {
      const worstLum = relativeLuminance(worst) ?? 0;
      const candidateLum = relativeLuminance(candidate) ?? 0;
      const isWorse = preferDark ? candidateLum < worstLum : candidateLum > worstLum;
      return isWorse ? candidate : worst;
    });
}

/**
 * Variáveis CSS consumidas por `.state-pill` / `.state-dot` (ver index.css).
 * Tudo é resolvido em JS: nada depende de `color-mix`, então o resultado é o
 * mesmo em qualquer navegador e pode ser verificado em teste.
 */
const VARS_CACHE = new Map<string, CSSProperties>();

export function stateColorVars(color?: string | null): CSSProperties {
  const raw = normalizeHex(color) ?? FALLBACK_STATE_COLOR;

  // Mesma cor => mesmas variáveis. Sem o cache, listas longas repetiam toda a
  // matemática de contraste a cada render.
  const cached = VARS_CACHE.get(raw);
  if (cached) return cached;

  const lightTint = mixHex(raw, LIGHT_SURFACE, LIGHT_TINT);
  const darkTint = mixHex(raw, DARK_SURFACE, DARK_TINT);

  const vars = {
    '--state-color': raw,
    '--state-tone-light': readableTone(raw, worstCaseSurface(LIGHT_SURFACES, lightTint, true), 4.5),
    '--state-tone-dark': readableTone(raw, worstCaseSurface(DARK_SURFACES, darkTint, false), 4.5),
    '--state-bg-light': lightTint,
    '--state-bg-dark': darkTint,
    '--state-border-light': mixHex(raw, LIGHT_SURFACE, LIGHT_BORDER),
    '--state-border-dark': mixHex(raw, DARK_SURFACE, DARK_BORDER),
  } as CSSProperties;

  VARS_CACHE.set(raw, vars);
  return vars;
}

interface TicketStateBadgeProps {
  name: string;
  color?: string | null;
  /** Classes extras (ex.: tamanho reduzido em listas densas). */
  className?: string;
}

export const TicketStateBadge = memo(function TicketStateBadge({
  name,
  color,
  className = '',
}: TicketStateBadgeProps) {
  return (
    <span
      className={`state-pill inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={stateColorVars(color)}
      title={name}
    >
      {/* bg-current: o ponto usa exatamente o tom legível do texto. */}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
});

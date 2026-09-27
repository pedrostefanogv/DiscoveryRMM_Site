/**
 * Estilos de status compartilhados pela área de configuração.
 *
 * O tema escuro é o padrão e muitos componentes usam tons pastel (ex.: text-emerald-300).
 * No tema claro esses tons ficam ilegíveis sobre fundos claros — aqui cada tom define a
 * cor de texto para o tema claro e a variante \`dark:\` para o escuro.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Caixa de status completa: borda + fundo + texto legível nos dois temas. */
export const statusSurface: Record<StatusTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "border-border bg-surface-light text-muted-foreground",
};

/** Apenas texto/ícone colorido, com contraste nos dois temas. */
export const statusText: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
  info: "text-sky-700 dark:text-sky-300",
  neutral: "text-muted-foreground",
};

/** Ícone com fundo tingido (badges de seção). */
export const tintedIcon = {
  sky: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  blue: "bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  red: "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
  slate: "bg-surface-light text-muted",
} as const;

export type TintedIconTone = keyof typeof tintedIcon;

/** Card/botão selecionado (toggles). */
export const selectedSurface =
  "border-sky-500/40 bg-sky-500/10 dark:border-sky-500/30 dark:bg-sky-500/10";
export const selectedIcon =
  "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400";
export const unselectedSurface = "border-border bg-surface-light hover:border-border-strong";
export const unselectedIcon = "bg-surface-light text-muted";

/** Chips de tipos MIME (anexos). */
export const chipActive =
  "border-cyan-500/40 bg-cyan-500/15 text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300";
export const chipCustom =
  "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";

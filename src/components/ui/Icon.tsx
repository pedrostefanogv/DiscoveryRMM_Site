import { forwardRef } from "react";
import type { SVGProps } from "react";
import { MATERIAL_SYMBOL_PATHS, MATERIAL_SYMBOL_VIEWBOX } from "./materialSymbols";
import type { MaterialSymbolName } from "./materialSymbols";

export type { MaterialSymbolName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  /** Nome do glifo no Material Symbols (fonts.google.com/icons). */
  name: MaterialSymbolName;
  /**
   * Tamanho em px (padrão 24, igual ao Lucide que este componente substitui).
   * Classes Tailwind (h-4 w-4 etc.) sobrescrevem via CSS, como antes.
   */
  size?: number | string;
  /**
   * Aceito por compatibilidade com a API do Lucide que este componente
   * substitui — glifos fill não usam stroke, então o valor é ignorado.
   */
  strokeWidth?: number | string;
  /** Preenchido (FILL@1) ou vazado (FILL@0, padrão de menu). */
  filled?: boolean;
}

/**
 * Ícone do padrão único da plataforma: Google Material Symbols
 * (https://fonts.google.com/icons — Rounded, weight 400), o mesmo conjunto
 * dos cartões nativos do agente. Substitui o lucide-react em todo o site.
 *
 * Cor via `currentColor` (herda do texto), tamanho via prop ou classes
 * Tailwind de altura/largura.
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 24, filled = false, strokeWidth: _ignored, children, ...rest },
  ref,
) {
  const paths = MATERIAL_SYMBOL_PATHS[name];
  if (!paths) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[Icon] glifo desconhecido: " + String(name));
    }
    return null;
  }
  return (
    <svg
      ref={ref}
      viewBox={MATERIAL_SYMBOL_VIEWBOX}
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill={filled ? undefined : "currentColor"} />
      ))}
      {children}
    </svg>
  );
});

export default Icon;

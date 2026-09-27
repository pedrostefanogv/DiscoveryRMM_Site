/**
 * Utilitários de cor centralizados (sem dependências) para derivar variações da
 * cor de marca por tema. O branding define a cor "canônica" (usada no tema escuro);
 * o tema claro usa uma variação mais escura para manter contraste sobre fundos claros.
 */

/** Normaliza \`#abc\` / \`abcdef\` para \`#aabbcc\`; retorna null se inválido. */
export function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const value = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return `#${value.split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  return null;
}

/** Mistura dois hex (0 = \`a\`, 1 = \`b\`). */
export function mixHex(a: string, b: string, amount: number): string {
  const from = normalizeHex(a);
  const to = normalizeHex(b);
  if (!from || !to) return a;

  const ratio = Math.min(1, Math.max(0, amount));
  const channel = (value: string, index: number) =>
    parseInt(value.slice(1 + index * 2, 3 + index * 2), 16);

  const mixed = [0, 1, 2].map((index) =>
    Math.round(channel(from, index) * (1 - ratio) + channel(to, index) * ratio),
  );

  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Escurece em direção ao preto (usado no tema claro). */
export function darken(hex: string, amount = 0.18): string {
  return mixHex(hex, "#000000", amount);
}

/** Clareia em direção ao branco (usado no tema escuro). */
export function lighten(hex: string, amount = 0.18): string {
  return mixHex(hex, "#ffffff", amount);
}

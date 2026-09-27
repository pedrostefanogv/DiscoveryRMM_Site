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

/** Canal sRGB (0-255) de um hex normalizado. */
function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

/**
 * Luminância relativa (WCAG 2.x) de um hex. Retorna `null` para valores
 * inválidos, permitindo ao chamador decidir o fallback.
 */
export function relativeLuminance(hex: string | null | undefined): number | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const [r, g, b] = [0, 1, 2].map((index) => {
    const value = channel(normalized, index) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores (1 = idênticas, 21 = preto/branco). */
export function contrastRatio(a: string | null | undefined, b: string | null | undefined): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;

  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Converte uma cor livre (ex.: a cor escolhida para um estado de workflow) em um
 * tom legível sobre `background`, misturando com preto ou branco até atingir o
 * contraste mínimo. Cores que já passam no alvo são devolvidas intactas, o que
 * preserva a intenção de quem escolheu a cor.
 */
export function readableTone(
  color: string | null | undefined,
  background: string | null | undefined,
  target = 4.5,
): string {
  // Cor ausente/inválida: cai no cinza neutro (mesmo usado em WorkflowSettings)
  // e, se ele não passar no contraste do fundo (ex.: tema escuro), é ajustado.
  const base = normalizeHex(color) ?? "#64748b";
  const surface = normalizeHex(background);
  if (!surface || contrastRatio(base, surface) >= target) return base;

  const towards = (relativeLuminance(surface) ?? 1) > 0.5 ? "#000000" : "#ffffff";

  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(base, towards, step / 20);
    if (contrastRatio(candidate, surface) >= target) return candidate;
  }

  return mixHex(base, towards, 0.9);
}

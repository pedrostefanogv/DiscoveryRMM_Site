/**
 * Máscara de entrada leve (sem dependência externa).
 *
 * Tokens:
 *   9 → dígito [0-9]
 *   A → letra [A-Za-z]
 *   * → alfanumérico [A-Za-z0-9]
 * Qualquer outro caractere é literal (pontuação/espaço).
 *
 * A máscara é apenas formatação visual: a autoridade de validação continua
 * sendo o `validationRegex` + limites cadastrados no campo.
 */

const TOKEN_PATTERNS: Record<string, RegExp> = {
  "9": /[0-9]/,
  A: /[A-Za-z]/,
  "*": /[A-Za-z0-9]/,
};

function isMaskToken(char: string): boolean {
  return char === "9" || char === "A" || char === "*";
}

function matchesToken(token: string, char: string): boolean {
  const pattern = TOKEN_PATTERNS[token];
  return pattern ? pattern.test(char) : false;
}

/** Formata o valor digitado segundo a máscara, ignorando excedentes inválidos. */
export function applyFieldMask(
  mask: string | null | undefined,
  raw: string,
): string {
  const trimmedMask = (mask ?? "").trim();
  if (!trimmedMask) return raw ?? "";

  const chars = (raw ?? "").split("");
  let out = "";
  let cursor = 0;

  for (const token of trimmedMask) {
    if (isMaskToken(token)) {
      while (cursor < chars.length && !matchesToken(token, chars[cursor])) {
        cursor++;
      }
      if (cursor >= chars.length) break;
      out += chars[cursor];
      cursor++;
    } else {
      // Literal só entra enquanto ainda há entrada a ser consumida.
      if (cursor >= chars.length) break;
      out += token;
    }
  }

  return out;
}

/** Exemplo visual da máscara (9→0, A→A, *→X) para preview na configuração. */
export function fieldMaskPlaceholder(mask: string | null | undefined): string {
  const trimmedMask = (mask ?? "").trim();
  if (!trimmedMask) return "";
  return trimmedMask
    .replace(/9/g, "0")
    .replace(/A/g, "A")
    .replace(/\*/g, "X");
}

/** Quantidade de posições preenchíveis (tokens) da máscara. */
export function fieldMaskTokenCount(mask: string | null | undefined): number {
  const trimmedMask = (mask ?? "").trim();
  if (!trimmedMask) return 0;
  return [...trimmedMask].filter(isMaskToken).length;
}

/** True quando o valor já preencheu todas as posições da máscara. */
export function isFieldMaskComplete(
  mask: string | null | undefined,
  value: string,
): boolean {
  const total = fieldMaskTokenCount(mask);
  if (total === 0) return true;
  const masked = applyFieldMask(mask, value);
  const filled = [...masked].filter((_, index) => {
    const token = [...(mask ?? "").trim()][index];
    return isMaskToken(token ?? "");
  }).length;
  return filled >= total;
}

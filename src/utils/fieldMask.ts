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

/**
 * Normaliza um rascunho numérico (pt-BR ou en-US) para uma string que o
 * Number() entende. Aceita valores mascarados como "R$ 1.234,56".
 *
 * Regra: se houver vírgula depois do último ponto, o formato é pt-BR
 * (ponto = milhar, vírgula = decimal); caso contrário o ponto é decimal.
 */
export function normalizeNumericDraft(draft: string | null | undefined): string {
  const raw = (draft ?? "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return "";
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");
  let normalized: string;
  if (lastComma >= 0 && lastComma > lastDot) {
    normalized = body.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = body.replace(/,/g, "");
  }
  return (negative ? "-" : "") + normalized;
}

/**
 * Formata um valor numérico para exibição segundo a máscara (ex.: "1234.56"
 * virando "R$ 1.234,56" com a máscara "R$ 9.999.999,99").
 *
 * Diferente de applyFieldMask (largura fixa, usada em CPF/CNPJ), aqui o
 * agrupamento é calculado a partir do valor real: não trunca números grandes
 * e preenche as casas decimais do sufixo ",99" da máscara.
 */
export function maskNumericDraft(
  mask: string | null | undefined,
  draft: string | null | undefined,
): string {
  const trimmedMask = (mask ?? "").trim();
  const normalized = normalizeNumericDraft(draft);
  if (!normalized) return "";
  if (!trimmedMask) return normalized;

  // Literais que antecedem o primeiro token viram prefixo (ex.: "R$ ").
  const prefix = (/^[^9A*]*/.exec(trimmedMask) ?? [""])[0];
  const decimalSuffix = /,9+\s*$/.exec(trimmedMask);
  const decimals = decimalSuffix ? decimalSuffix[0].replace(/[^9]/g, "").length : 0;
  const negative = normalized.startsWith("-");
  const [integerPart, decimalPart = ""] = normalized.replace("-", "").split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimalText = decimals > 0 ? `,${decimalPart.padEnd(decimals, "0").slice(0, decimals)}` : "";
  return `${negative ? "-" : ""}${prefix}${grouped}${decimalText}`;
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

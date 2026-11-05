import { ApiError } from "@/api/client";

/** Um erro de validacao devolvido pelo backend (400 em layoutJson). */
export interface TemplateValidationError {
  /** Campo do payload (ex.: "layoutJson"), quando o backend informa. */
  field?: string;
  message: string;
  /** Codigo do erro (ex.: "Validation") quando disponivel. */
  code?: string;
}

/** Texto amigavel para um campo tecnico do payload. */
export function describeValidationField(field: string | undefined): string | undefined {
  if (!field) return undefined;
  const normalized = field.trim();
  if (!normalized) return undefined;

  // "layoutJson" e o campo que carrega colunas/joins/agrupamentos: o usuario
  // nao tem como agir sobre o nome tecnico, entao ancoramos no contexto.
  if (normalized.toLowerCase() === "layoutjson") {
    return "Layout do relatório (fontes, colunas e joins)";
  }
  if (normalized.toLowerCase() === "filtersjson") {
    return "Filtros do relatório";
  }
  return normalized;
}

/**
 * Extrai as mensagens de validacao de um erro do backend.
 *
 * Caminho normal: o cliente HTTP ja entrega a lista ESTRUTURADA em
 * `ApiError.errors` (ver parseErrorBody em api/client.ts). Cada erro chega
 * inteiro, com code/field/message, sem nenhuma engenharia reversa de texto.
 *
 * O split por "; " sobrevive apenas como fallback para erros que nao passaram
 * pelo client (ou backends antigos): se uma mensagem contiver "; " dentro dela,
 * esse fallback a partiria em duas — e exatamente por isso que ele deixou de
 * ser o caminho principal.
 */
export function extractValidationErrors(error: unknown): TemplateValidationError[] {
  if (!error) return [];

  // 1) CAMINHO NORMAL: lista estruturada que o client ja montou.
  if (error instanceof ApiError && error.errors?.length) {
    const fromApiError = error.errors
      .filter(
        (item) => item && typeof item.message === "string" && item.message.trim(),
      )
      .map((item) => ({
        message: item.message,
        field: item.field,
        code: item.code,
      }));
    if (fromApiError.length > 0) return fromApiError;
  }

  // 2) Erro que ja traga a lista estruturada sem passar pelo client
  //    (ex.: objeto cru com { errors: [...] }).
  const structured = extractStructured(error);
  if (structured.length > 0) return structured;

  // 3) FALLBACK LEGADO: so a string achatada esta disponivel.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const trimmed = message.trim();
  if (!trimmed) return [];

  return splitConcatenatedMessages(trimmed).map((part) => splitFieldPrefix(part));
}

/**
 * O backend devolve cada erro como "{field}: {message}" (o cliente concatena
 * com "; "). Separamos o prefixo para ancorar a mensagem no campo.
 */
function splitFieldPrefix(value: string): TemplateValidationError {
  const separator = value.indexOf(": ");
  if (separator <= 0) return { message: value };

  const candidateField = value.slice(0, separator).trim();
  const rest = value.slice(separator + 2).trim();

  // So tratamos como campo quando o prefixo parece um identificador tecnico
  // (layoutJson, dataSources[1].join.sourceKey). Uma mensagem em portugues
  // com dois-pontos nao deve ser partida.
  const looksLikeField = /^[A-Za-z_][\w.[\]\-]*$/.test(candidateField);
  if (!looksLikeField || !rest) return { message: value };

  return { field: candidateField, message: rest };
}

function splitConcatenatedMessages(value: string): string[] {
  // O cliente usa "; " como separador entre erros. Mensagens em portugues
  // nao contem "; ", entao a divisao e segura na pratica.
  return value
    .split("; ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractStructured(error: unknown): TemplateValidationError[] {
  if (typeof error !== "object" || error === null) return [];

  const candidate = (error as { errors?: unknown }).errors;
  if (!Array.isArray(candidate)) return [];

  return candidate
    .map((item): TemplateValidationError | null => {
      if (typeof item === "string") {
        return item.trim() ? { message: item.trim() } : null;
      }
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const message =
        typeof record.message === "string" && record.message.trim()
          ? record.message.trim()
          : typeof record.Message === "string" && record.Message.trim()
            ? record.Message.trim()
            : "";
      if (!message) return null;
      const field =
        typeof record.field === "string" && record.field.trim()
          ? record.field.trim()
          : typeof record.Field === "string" && record.Field.trim()
            ? record.Field.trim()
            : undefined;
      const code =
        typeof record.code === "string" && record.code.trim()
          ? record.code.trim()
          : typeof record.Code === "string" && record.Code.trim()
            ? record.Code.trim()
            : undefined;
      return { message, field, code };
    })
    .filter((item): item is TemplateValidationError => item !== null);
}

import { CustomFieldDataType, parseCustomFieldValue, type TicketSchemaField } from '@/api';
import { normalizeNumericDraft } from '@/utils/fieldMask';
import { describeFieldFormatError } from '@/utils/fieldFormatHints';

export interface CustomFieldValidationResult {
  ok: boolean;
  error?: string;
  value?: unknown;
  hasValue?: boolean;
}

/** True quando o rascunho está vazio/em branco. */
export function isBlankCustomFieldDraft(draft: string | null | undefined): boolean {
  return (draft ?? '').trim() === '';
}

/**
 * Converte o rascunho no valor persistido. Vazios viram null (em especial
 * Boolean/ListBox, que de outra forma gravariam false/[] em campo não tocado).
 */
export function parseCustomFieldDraft(dataType: CustomFieldDataType, draft: string): unknown {
  if (isBlankCustomFieldDraft(draft)) return null;
  // Números com máscara chegam como "R$ 1.234,56": normaliza antes de converter
  // (o Number() não entende separador de milhar nem vírgula decimal).
  if (dataType === CustomFieldDataType.Integer || dataType === CustomFieldDataType.Decimal) {
    const numeric = normalizeNumericDraft(draft);
    return numeric ? parseCustomFieldValue(dataType, numeric) : null;
  }
  return parseCustomFieldValue(dataType, draft);
}

/**
 * Valida e converte um campo do schema de tickets aplicando as regras
 * cadastradas (obrigatório, tipo, regex, min/max de tamanho e de valor).
 */
export function validateTicketSchemaField(
  field: TicketSchemaField,
  draft: string,
): CustomFieldValidationResult {
  const trimmed = (draft ?? '').trim();

  if (trimmed === '') {
    return field.isRequired
      ? { ok: false, error: `${field.label} é obrigatório.` }
      : { ok: true, value: null, hasValue: false };
  }

  // Números podem vir mascarados ("R$ 1.234,56"): valida o valor normalizado.
  const numericText =
    field.dataType === CustomFieldDataType.Integer || field.dataType === CustomFieldDataType.Decimal
      ? normalizeNumericDraft(trimmed)
      : trimmed;

  switch (field.dataType) {
    case CustomFieldDataType.Integer:
      if (!/^-?\d+$/.test(numericText)) {
        return { ok: false, error: `${field.label} deve ser um número inteiro.` };
      }
      break;
    case CustomFieldDataType.Decimal:
      if (!numericText || Number.isNaN(Number(numericText))) {
        return { ok: false, error: `${field.label} deve ser um número.` };
      }
      break;
    case CustomFieldDataType.Dropdown:
      if (field.options.length > 0 && !field.options.includes(trimmed)) {
        return { ok: false, error: `${field.label} possui um valor inválido.` };
      }
      break;
    case CustomFieldDataType.ListBox: {
      const items = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
      if (field.options.length > 0 && items.some((item) => !field.options.includes(item))) {
        return { ok: false, error: `${field.label} possui valores inválidos.` };
      }
      break;
    }
    default:
      break;
  }

  // min/maxLength só fazem sentido para texto (não para número/data/boolean).
  const isTextType = field.dataType === CustomFieldDataType.Text;
  if (isTextType && field.minLength != null && trimmed.length < field.minLength) {
    return { ok: false, error: `${field.label} deve ter ao menos ${field.minLength} caractere(s).` };
  }
  if (isTextType && field.maxLength != null && trimmed.length > field.maxLength) {
    return { ok: false, error: `${field.label} deve ter no máximo ${field.maxLength} caractere(s).` };
  }

  if (field.validationRegex) {
    try {
      if (!new RegExp(field.validationRegex).test(trimmed)) {
        // Mensagem com exemplo em vez de regex crua ("informe um valor como ...").
        return {
          ok: false,
          error: describeFieldFormatError(field.label, {
            inputMask: field.inputMask,
            validationRegex: field.validationRegex,
          }),
        };
      }
    } catch {
      // regex inválida cadastrada: ignora para não travar o formulário
    }
  }

  const value = parseCustomFieldDraft(field.dataType, trimmed);

  if (field.minValue != null || field.maxValue != null) {
    const numeric = typeof value === 'number' ? value : Number(numericText);
    if (!Number.isNaN(numeric)) {
      if (field.minValue != null && numeric < field.minValue) {
        return { ok: false, error: `${field.label} deve ser maior ou igual a ${field.minValue}.` };
      }
      if (field.maxValue != null && numeric > field.maxValue) {
        return { ok: false, error: `${field.label} deve ser menor ou igual a ${field.maxValue}.` };
      }
    }
  }

  return { ok: true, value, hasValue: true };
}

export interface CustomFieldValidation {
  values: Record<string, unknown>;
  errors: string[];
  /** Mensagem por definitionId, para destacar exatamente o campo inválido. */
  errorsByField: Record<string, string>;
}

/**
 * Constrói o mapa definitionId→valor, omitindo campos vazios, acumulando os
 * erros e identificando a qual campo cada erro pertence (destaque na ficha).
 */
export function buildTicketCustomFieldValidation(
  fields: TicketSchemaField[],
  drafts: Record<string, string>,
): CustomFieldValidation {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  const errorsByField: Record<string, string> = {};

  for (const field of fields) {
    const result = validateTicketSchemaField(field, drafts[field.definitionId] ?? '');
    if (!result.ok) {
      if (result.error) {
        errors.push(result.error);
        errorsByField[field.definitionId] = result.error;
      }
      continue;
    }
    if (result.hasValue) {
      values[field.definitionId] = result.value;
    }
  }

  return { values, errors, errorsByField };
}

/**
 * Compatibilidade: consumidores que só precisam de valores/erros agregados.
 */
export function buildTicketCustomFieldValues(
  fields: TicketSchemaField[],
  drafts: Record<string, string>,
): { values: Record<string, unknown>; errors: string[] } {
  const { values, errors } = buildTicketCustomFieldValidation(fields, drafts);
  return { values, errors };
}

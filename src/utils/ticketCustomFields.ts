import { CustomFieldDataType, parseCustomFieldValue, type TicketSchemaField } from '@/api';

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

  switch (field.dataType) {
    case CustomFieldDataType.Integer:
      if (!/^-?\d+$/.test(trimmed)) {
        return { ok: false, error: `${field.label} deve ser um número inteiro.` };
      }
      break;
    case CustomFieldDataType.Decimal:
      if (Number.isNaN(Number(trimmed))) {
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
        return { ok: false, error: `${field.label} não corresponde ao formato exigido.` };
      }
    } catch {
      // regex inválida cadastrada: ignora para não travar o formulário
    }
  }

  const value = parseCustomFieldDraft(field.dataType, trimmed);

  if (field.minValue != null || field.maxValue != null) {
    const numeric = typeof value === 'number' ? value : Number(trimmed);
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

/**
 * Constrói o mapa definitionId→valor, omitindo campos vazios e acumulando os
 * erros de validação dos campos preenchidos/obrigatórios.
 */
export function buildTicketCustomFieldValues(
  fields: TicketSchemaField[],
  drafts: Record<string, string>,
): { values: Record<string, unknown>; errors: string[] } {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of fields) {
    const result = validateTicketSchemaField(field, drafts[field.definitionId] ?? '');
    if (!result.ok) {
      if (result.error) errors.push(result.error);
      continue;
    }
    if (result.hasValue) {
      values[field.definitionId] = result.value;
    }
  }

  return { values, errors };
}

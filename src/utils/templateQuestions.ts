import { CustomFieldDataType, type TicketSchemaField } from '@/api';

/**
 * Pergunta do mini questionário de um template de chamado. NÃO é um campo do
 * chamado: as respostas são registradas no snapshot do chamado.
 */
export interface TemplateQuestion {
  key: string;
  label: string;
  dataType: CustomFieldDataType;
  isRequired: boolean;
  options: string[];
  validationRegex: string | null;
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  helpText: string | null;
  /** Pergunta sensível: não é indexada para a busca semântica. */
  isSensitive: boolean;
}

export const EMPTY_TEMPLATE_QUESTION: TemplateQuestion = {
  key: '',
  label: '',
  dataType: CustomFieldDataType.Text,
  isRequired: false,
  options: [],
  validationRegex: null,
  inputMask: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  helpText: null,
  isSensitive: false,
};

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function normalizeDataType(value: unknown): CustomFieldDataType {
  if (typeof value === 'number') return value as CustomFieldDataType;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric as CustomFieldDataType;
  switch (value) {
    case 'Integer': return CustomFieldDataType.Integer;
    case 'Decimal': return CustomFieldDataType.Decimal;
    case 'Boolean': return CustomFieldDataType.Boolean;
    case 'Date': return CustomFieldDataType.Date;
    case 'DateTime': return CustomFieldDataType.DateTime;
    case 'Dropdown': return CustomFieldDataType.Dropdown;
    case 'ListBox': return CustomFieldDataType.ListBox;
    default: return CustomFieldDataType.Text;
  }
}

export function parseTemplateQuestions(json: string | null | undefined): TemplateQuestion[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((raw: Record<string, unknown>) => ({
        key: String(raw.key ?? raw.Key ?? '').trim(),
        label: String(raw.label ?? raw.Label ?? '').trim(),
        dataType: normalizeDataType(raw.dataType ?? raw.DataType),
        isRequired: Boolean(raw.isRequired ?? raw.IsRequired ?? false),
        options: normalizeOptions(raw.options ?? raw.Options),
        validationRegex: (raw.validationRegex ?? raw.ValidationRegex ?? null) as string | null,
        inputMask: (raw.inputMask ?? raw.InputMask ?? null) as string | null,
        minLength: nullableNumber(raw.minLength ?? raw.MinLength),
        maxLength: nullableNumber(raw.maxLength ?? raw.MaxLength),
        minValue: nullableNumber(raw.minValue ?? raw.MinValue),
        maxValue: nullableNumber(raw.maxValue ?? raw.MaxValue),
        helpText: (raw.helpText ?? raw.HelpText ?? null) as string | null,
        isSensitive: Boolean(raw.isSensitive ?? raw.IsSensitive ?? false),
      }))
      .filter((question) => question.key.length > 0 && question.label.length > 0);
  } catch {
    return [];
  }
}

export function serializeTemplateQuestions(questions: TemplateQuestion[]): string {
  const clean = questions
    .map((question) => ({
      ...question,
      key: question.key.trim(),
      label: question.label.trim(),
      options: question.options.map((option) => option.trim()).filter(Boolean),
      validationRegex: question.validationRegex?.trim() || null,
      inputMask: question.inputMask?.trim() || null,
      helpText: question.helpText?.trim() || null,
      isSensitive: Boolean(question.isSensitive),
    }))
    .filter((question) => question.key.length > 0 && question.label.length > 0);
  return JSON.stringify(clean);
}

/** Gera uma chave estável ([a-z0-9_]) a partir do rótulo. */
export function slugifyQuestionKey(label: string, index: number): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `pergunta_${index + 1}`;
}

/**
 * Valida o questionário do modelo antes de salvar. Retorna a primeira mensagem
 * de erro encontrada ou null quando está tudo certo. Compartilhado entre a
 * página de edição do template e os testes — as perguntas aqui NÃO são campos
 * do chamado, então as regras vivem apenas deste lado.
 */
export function validateTemplateQuestions(questions: TemplateQuestion[]): string | null {
  const seen = new Set<string>();
  for (const question of questions) {
    const label = question.label.trim();
    const key = question.key.trim();
    if (!label || !key) return 'Toda pergunta do modelo precisa de rótulo e chave.';
    if (seen.has(key.toLowerCase())) return `Chave de pergunta duplicada: "${key}".`;
    seen.add(key.toLowerCase());

    if (
      (question.dataType === CustomFieldDataType.Dropdown ||
        question.dataType === CustomFieldDataType.ListBox) &&
      question.options.length === 0
    ) {
      return `Pergunta "${label}": informe ao menos uma opção.`;
    }

    const regex = question.validationRegex?.trim();
    if (regex) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(regex);
      } catch {
        return `Pergunta "${label}": regex de validação inválida.`;
      }
    }

    if (question.minLength != null && question.maxLength != null && question.minLength > question.maxLength) {
      return `Pergunta "${label}": tamanho mínimo maior que o máximo.`;
    }
    if (question.minValue != null && question.maxValue != null && question.minValue > question.maxValue) {
      return `Pergunta "${label}": valor mínimo maior que o máximo.`;
    }
  }
  return null;
}

/**
 * Converte a pergunta para o formato aceito pelo renderer/validador de campos,
 * reaproveitando a validação já usada pelos campos do departamento.
 */
export function questionToSchemaField(question: TemplateQuestion): TicketSchemaField {
  return {
    definitionId: question.key,
    name: question.key,
    label: question.label,
    description: question.helpText,
    dataType: question.dataType,
    isRequired: question.isRequired,
    isInternal: false,
    isActive: true,
    options: question.options,
    validationRegex: question.validationRegex,
    inputMask: question.inputMask,
    minLength: question.minLength,
    maxLength: question.maxLength,
    minValue: question.minValue,
    maxValue: question.maxValue,
    currentValueJson: null,
  };
}

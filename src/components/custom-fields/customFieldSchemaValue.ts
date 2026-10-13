import { CustomFieldDataType, formatCustomFieldValue, type CustomFieldSchemaItem } from '@/api';

/** Valor mascarado exibido no lugar de um segredo (nunca é copiado). */
export const MASKED_CUSTOM_FIELD_VALUE = '\u2022\u2022\u2022\u2022\u2022\u2022';

interface SchemaValueSource {
  valueJson: unknown;
}

/**
 * Valor atual de um item de schema. A API devolve `valueJson` como string JSON
 * (ou "null"); aceitamos também o valor já desserializado, como defesa contra
 * mudanças de contrato. Compartilhado entre o card detalhado e o resumo do
 * card "Informações" para que os dois mostrem exatamente o mesmo texto.
 */
export function parseSchemaValue(item: SchemaValueSource): unknown {
  const raw = item.valueJson;
  if (raw === undefined || raw === null || raw === 'null') return null;
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Texto pronto para exibir/copiar de um campo do schema. Segredos continuam
 * mascarados, MAS somente quando existe valor gravado: a API devolve
 * `valueJson = "null"` para segredo sem valor, e nesse caso o correto é
 * "não informado" (não uma máscara que sugere valor existente). Valores vazios
 * viram string vazia — o chamador decide o rótulo de "não informado".
 */
export function schemaValueText(item: CustomFieldSchemaItem): string {
  const value = parseSchemaValue(item);
  if (item.isSecret) {
    return value === null || value === '' ? '' : MASKED_CUSTOM_FIELD_VALUE;
  }
  return formatCustomFieldValue(value);
}

/** Indica se o valor do campo pode ser revelado/copiado pelo operador. */
export function isSchemaValueCopyable(item: CustomFieldSchemaItem): boolean {
  return !item.isSecret && schemaValueText(item).length > 0;
}

/**
 * Valor no formato aceito pelo controle de edição. `<input type="date">` exige
 * `YYYY-MM-DD` e `<input type="datetime-local">` exige `YYYY-MM-DDTHH:mm`: um
 * ISO completo ("2026-10-13T20:37:25Z") é rejeitado pelo browser, que deixa o
 * campo vazio mesmo existindo valor gravado.
 */
export function schemaValueDraft(item: CustomFieldSchemaItem, value: unknown): string {
  if (item.isSecret) return '';
  return toInputValue(item.dataType, formatCustomFieldValue(value));
}

function toInputValue(dataType: CustomFieldDataType, text: string): string {
  if (!text) return '';
  if (dataType === CustomFieldDataType.Date) return text.slice(0, 10);
  if (dataType === CustomFieldDataType.DateTime) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text.slice(0, 16);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  return text;
}

/**
 * Texto exibido quando o campo não é editável. Datas viram pt-BR; para campos
 * Date-only a conversão é feita por string, evitando o deslocamento de 1 dia
 * que `new Date('YYYY-MM-DD')` provoca em fusos negativos (ex.: UTC-3).
 */
export function schemaValueDisplay(item: CustomFieldSchemaItem, value: unknown): string {
  if (item.isSecret) {
    // Mesma regra de schemaValueText: máscara só quando existe valor gravado.
    return value === null || value === undefined || value === '' ? '' : MASKED_CUSTOM_FIELD_VALUE;
  }
  const text = formatCustomFieldValue(value);
  if (!text) return '';
  if (item.dataType === CustomFieldDataType.Date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
  }
  if (item.dataType === CustomFieldDataType.DateTime) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : parsed.toLocaleString('pt-BR');
  }
  return text;
}

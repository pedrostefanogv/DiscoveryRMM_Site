import { formatCustomFieldValue, type CustomFieldSchemaItem } from '@/api';

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

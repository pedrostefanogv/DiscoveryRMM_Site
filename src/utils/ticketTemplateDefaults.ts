import { CustomFieldDataType, type TicketSchemaField } from '@/api';

/**
 * Converte um valor persistido (JSON) de campo personalizado para o formato de
 * rascunho usado nos inputs do formulário.
 */
export function draftFromCustomFieldValue(
  dataType: CustomFieldDataType,
  value: unknown,
): string {
  if (value === null || value === undefined) return '';

  if (dataType === CustomFieldDataType.Boolean) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).toLowerCase() === 'true' ? 'true' : 'false';
  }

  if (dataType === CustomFieldDataType.ListBox) {
    if (Array.isArray(value)) return value.map((item) => String(item ?? '')).join(', ');
    return String(value);
  }

  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

/**
 * Lê o `customFieldDefaultsJson` de um template e devolve o mapa
 * definitionId→rascunho, apenas para campos presentes no schema informado.
 * Valores ausentes/nulos são omitidos.
 */
export function templateDefaultsToDrafts(
  defaultsJson: string | null | undefined,
  fields: TicketSchemaField[],
): Record<string, string> {
  if (!defaultsJson || fields.length === 0) return {};

  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(defaultsJson);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    parsed = raw as Record<string, unknown>;
  } catch {
    return {};
  }

  const drafts: Record<string, string> = {};
  for (const field of fields) {
    if (!field.isActive) continue;
    const value = parsed[field.definitionId];
    if (value === undefined || value === null) continue;
    const draft = draftFromCustomFieldValue(field.dataType, value);
    if (draft.trim() === '') continue;
    drafts[field.definitionId] = draft;
  }
  return drafts;
}

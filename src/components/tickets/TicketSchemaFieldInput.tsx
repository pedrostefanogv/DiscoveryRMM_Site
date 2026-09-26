import { Input, Select, TextArea } from '@/components/ui';
import { CustomFieldDataType, type TicketSchemaField } from '@/api';
import { applyFieldMask, fieldMaskPlaceholder } from '@/utils/fieldMask';

/**
 * Renderiza um campo dinâmico do schema de tickets (usado na abertura de
 * chamado, nos valores padrão de template e no preview de configuração).
 * Quando o campo tem máscara, ela é aplicada durante a digitação.
 */
export function TicketSchemaFieldInput({
  field,
  value,
  onChange,
  disabled = false,
}: {
  field: TicketSchemaField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const label = `${field.label}${field.isRequired ? ' *' : ''}`;
  const mask = field.inputMask ?? null;
  const hints = [
    mask ? `Máscara: ${fieldMaskPlaceholder(mask)}` : null,
    field.validationRegex ? `Formato: ${field.validationRegex}` : null,
  ].filter(Boolean);
  const hint = hints.length > 0 ? hints.join(" · ") : undefined;
  const setMasked = (raw: string) => onChange(applyFieldMask(mask, raw));

  switch (field.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label={label}
          value={value}
          disabled={disabled}
          options={[
            { value: '', label: 'Selecione...' },
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' },
          ]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          label={label}
          value={value}
          disabled={disabled}
          options={[
            { value: '', label: 'Selecione...' },
            ...field.options.map((opt) => ({ value: opt, label: opt })),
          ]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <TextArea
          label={label}
          rows={2}
          value={value}
          disabled={disabled}
          hint={field.options.length > 0 ? `Opções: ${field.options.join(', ')}` : 'Valores separados por vírgula'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input label={label} type="number" step="1" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} />;
    case CustomFieldDataType.Decimal:
      return <Input label={label} type="number" step="any" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} />;
    case CustomFieldDataType.Date:
      return <Input label={label} type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input label={label} type="datetime-local" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    default:
      return (
        <Input
          label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => setMasked(e.target.value)}
          hint={hint}
          placeholder={mask ? fieldMaskPlaceholder(mask) : field.description ?? undefined}
        />
      );
  }
}

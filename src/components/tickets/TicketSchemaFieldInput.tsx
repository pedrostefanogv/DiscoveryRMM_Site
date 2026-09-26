import { useEffect, useState } from 'react';
import { Input, Select, TextArea } from '@/components/ui';
import { CustomFieldDataType, type TicketSchemaField } from '@/api';
import {
  applyFieldMask,
  fieldMaskPlaceholder,
  maskNumericDraft,
  normalizeNumericDraft,
} from '@/utils/fieldMask';

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
    case CustomFieldDataType.Decimal: {
      // Com máscara (ex.: "Valor (R$)" = "R$ 9.999.999,99") o input precisa ser
      // texto: type="number" rejeitaria os literais da máscara.
      if (mask) {
        return (
          <MaskedNumericInput
            label={label}
            mask={mask}
            value={value}
            disabled={disabled}
            hint={hint}
            onChange={onChange}
          />
        );
      }
      return field.dataType === CustomFieldDataType.Integer
        ? <Input label={label} type="number" step="1" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} />
        : <Input label={label} type="number" step="any" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} />;
    }
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

/**
 * Campo numérico com máscara de moeda (ex.: R$ 9.999.999,99).
 *
 * Durante a digitação o texto é livre (dá para apagar/apontar normalmente);
 * o valor entregue ao formulário é sempre o número normalizado ("1234.56"),
 * e ao sair do campo o texto é reformatado com a máscara.
 */
function MaskedNumericInput({
  label,
  mask,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  mask: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => maskNumericDraft(mask, value));
  const [editing, setEditing] = useState(false);

  // Valor externo (defaults do template, reset) reflete quando não está editando.
  useEffect(() => {
    if (!editing) setText(maskNumericDraft(mask, value));
  }, [value, mask, editing]);

  return (
    <Input
      label={label}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      hint={hint}
      placeholder={fieldMaskPlaceholder(mask)}
      onFocus={() => {
        setEditing(true);
        setText(value);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(normalizeNumericDraft(e.target.value));
      }}
      onBlur={() => {
        setEditing(false);
        setText(maskNumericDraft(mask, value));
      }}
    />
  );
}

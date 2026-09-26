import { useEffect, useState } from 'react';
import { Input, Select, TextArea } from '@/components/ui';
import { CustomFieldDataType, type TicketSchemaField } from '@/api';
import {
  applyFieldMask,
  fieldMaskPlaceholder,
  maskNumericDraft,
  normalizeNumericDraft,
} from '@/utils/fieldMask';
import { describeFieldFormat } from '@/utils/fieldFormatHints';
import { supportsInputMask } from '@/utils/customFieldMask';

/**
 * Renderiza um campo dinâmico do schema de tickets (usado na abertura de
 * chamado, nos valores padrão de template e no preview de configuração).
 * Quando o campo tem máscara, ela é aplicada durante a digitação.
 *
 * A orientação é amigável (texto de ajuda + exemplo) — nunca a regex crua — e
 * um `error` destaca o campo inválido.
 */
export function TicketSchemaFieldInput({
  field,
  value,
  onChange,
  disabled = false,
  error,
  id,
}: {
  field: TicketSchemaField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Mensagem de erro exibida junto do campo (destaca o controle). */
  error?: string;
  /** id do controle, usado para focar/rolar até o primeiro campo inválido. */
  id?: string;
}) {
  const label = `${field.label}${field.isRequired ? ' *' : ''}`;
  // Defensivo: se a definição carregar máscara num tipo que não a usa (ex.:
  // veio de um modelo antigo), o render a ignora em vez de aplicar parcialmente.
  const mask = supportsInputMask(field.dataType) ? (field.inputMask ?? null) : null;
  const hint = describeFieldFormat({
    inputMask: mask,
    validationRegex: field.validationRegex,
    helpText: field.description,
  });
  const setMasked = (raw: string) => onChange(applyFieldMask(mask, raw));

  switch (field.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label={label}
          id={id}
          value={value}
          disabled={disabled}
          error={error}
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
          id={id}
          value={value}
          disabled={disabled}
          error={error}
          options={[
            { value: '', label: 'Selecione...' },
            ...field.options.map((opt) => ({ value: opt, label: opt })),
          ]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      // Com opções cadastradas, checkboxes: nada de digitação livre (e nada de
      // valor fora da lista). Sem opções, mantém o campo livre.
      if (field.options.length > 0) {
        return (
          <CheckboxGroupInput
            label={label}
            id={id}
            options={field.options}
            value={value}
            error={error}
            hint={hint ?? 'Selecione uma ou mais opções'}
            disabled={disabled}
            onChange={onChange}
          />
        );
      }
      return (
        <TextArea
          label={label}
          id={id}
          rows={2}
          value={value}
          disabled={disabled}
          error={error}
          hint="Separe os valores por vírgula"
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
            id={id}
            mask={mask}
            value={value}
            disabled={disabled}
            error={error}
            hint={hint}
            onChange={onChange}
          />
        );
      }
      return field.dataType === CustomFieldDataType.Integer
        ? <Input label={label} id={id} type="number" step="1" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} />
        : <Input label={label} id={id} type="number" step="any" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} />;
    }
    case CustomFieldDataType.Date:
      return <Input label={label} id={id} type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} />;
    case CustomFieldDataType.DateTime:
      return <Input label={label} id={id} type="datetime-local" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} />;
    default:
      return (
        <Input
          label={label}
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => setMasked(e.target.value)}
          hint={hint}
          error={error}
          placeholder={mask ? fieldMaskPlaceholder(mask) : undefined}
        />
      );
  }
}

/**
 * Múltipla escolha como checkboxes das opções cadastradas.
 *
 * O rascunho continua sendo a lista separada por vírgula (contrato do backend),
 * sempre na ordem das opções. Valores antigos que não estão mais cadastrados
 * aparecem como "(valor atual)" em vez de serem descartados em silêncio.
 */
function CheckboxGroupInput({
  label,
  id,
  options,
  value,
  onChange,
  hint,
  error,
  disabled,
}: {
  label: string;
  id?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
}) {
  const selected = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const legacy = selected.filter((item) => !options.includes(item));
  const all = [...options, ...legacy];

  const toggle = (option: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(option);
    else next.delete(option);
    // Ordem canônica: opções cadastradas e, depois, os valores legados mantidos.
    onChange(all.filter((item) => next.has(item)).join(', '));
  };

  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-medium text-muted-foreground">{label}</span>}
      <div
        id={id}
        role="group"
        aria-label={label}
        aria-invalid={Boolean(error)}
        tabIndex={-1}
        className={`space-y-1.5 rounded-xl border bg-surface-light px-3 py-2 ${error ? 'border-danger/50' : 'border-border'}`}
      >
        {all.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              disabled={disabled}
              onChange={(e) => toggle(option, e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            <span>{option}</span>
            {!options.includes(option) && <span className="text-xs text-muted">(valor atual)</span>}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
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
  id,
  mask,
  value,
  onChange,
  hint,
  error,
  disabled,
}: {
  label: string;
  id?: string;
  mask: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
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
      id={id}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      hint={hint}
      error={error}
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

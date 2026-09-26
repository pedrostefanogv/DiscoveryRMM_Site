import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, Input, Loading, Select, TextArea } from '@/components/ui';
import {
  CustomFieldDataType,
  CustomFieldScopeType,
  formatCustomFieldValue,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
} from '@/api';
import type { CustomFieldDefinition } from '@/api';
import { useCustomFieldDefinitions } from '@/hooks/useCustomFields';
import {
  useTicketCustomFields,
  useUpsertTicketCustomFieldValue,
} from '@/hooks/useTicketCustomFields';
import toast from 'react-hot-toast';

/**
 * Campos do chamado dentro do Resumo geral, logo após o SLA.
 *
 * - "Campos do departamento": definidos para o departamento do chamado (cobrados
 *   na abertura). Somente leitura aqui.
 * - "Campos adicionais do chamado": campos de escopo do próprio chamado,
 *   editáveis.
 */
export function TicketFieldsSection({
  ticketId,
}: {
  ticketId: string;
}) {
  const valuesQuery = useTicketCustomFields(ticketId);
  const values = Array.isArray(valuesQuery.data) ? valuesQuery.data : [];
  const departmentValues = values.filter(
    (value) => value.scopeType === CustomFieldScopeType.Department,
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Campos do departamento
        </p>
        <p className="text-xs text-muted">Definidos para o departamento deste chamado.</p>
        {valuesQuery.isLoading ? (
          <Loading />
        ) : departmentValues.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhum campo do departamento informado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-border">
            {departmentValues.map((value) => (
              <li key={value.definitionId} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{value.label ?? value.name ?? value.definitionId}</span>
                <span className="min-w-0 break-words text-right text-foreground">
                  {formatCustomFieldValue(value.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdditionalTicketFields ticketId={ticketId} />
    </div>
  );
}

function formatDateInputValue(value: string) {
  return value.slice(0, 10);
}

function formatDateTimeLocalInputValue(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatTicketCustomFieldDraftValue(
  dataType: CustomFieldDataType,
  value: unknown,
) {
  if (value === null || value === undefined) {
    return '';
  }

  switch (dataType) {
    case CustomFieldDataType.Boolean:
      return String(value);
    case CustomFieldDataType.ListBox:
      return Array.isArray(value)
        ? value.map((item) => String(item ?? '')).join(', ')
        : formatCustomFieldValue(value);
    case CustomFieldDataType.Date:
      return typeof value === 'string'
        ? formatDateInputValue(value)
        : formatDateInputValue(formatCustomFieldValue(value));
    case CustomFieldDataType.DateTime:
      return typeof value === 'string'
        ? formatDateTimeLocalInputValue(value)
        : formatDateTimeLocalInputValue(formatCustomFieldValue(value));
    default:
      return formatCustomFieldValue(value);
  }
}

function parseTicketCustomFieldDraftValue(
  dataType: CustomFieldDataType,
  input: string,
) {
  if (dataType === CustomFieldDataType.Boolean && !input.trim()) {
    return null;
  }

  return parseCustomFieldValue(dataType, input);
}

function AdditionalTicketFields({ ticketId }: { ticketId: string }) {
  const definitionsQuery = useCustomFieldDefinitions({
    scopeType: CustomFieldScopeType.Ticket,
  });
  const valuesQuery = useTicketCustomFields(ticketId);
  const upsertValue = useUpsertTicketCustomFieldValue();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingDefinitionId, setSavingDefinitionId] = useState<string | null>(null);

  const definitions = useMemo(
    () =>
      (Array.isArray(definitionsQuery.data) ? [...definitionsQuery.data] : [])
        .filter((definition) => definition.isActive)
        .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR')),
    [definitionsQuery.data],
  );

  const valuesByDefinitionId = useMemo(
    () => new Map((Array.isArray(valuesQuery.data) ? valuesQuery.data : []).map((item) => [item.definitionId, item])),
    [valuesQuery.data],
  );

  // Assinatura do conjunto de campos (muda quando muda o ticket/definições).
  const definitionsSignature = useMemo(
    () => `${ticketId}::${definitions.map((definition) => definition.id).join('|')}`,
    [ticketId, definitions],
  );
  const seededSignatureRef = useRef('');
  const dirtyDefinitionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sameShape = seededSignatureRef.current === definitionsSignature;

    // Refetch (ex.: após salvar um campo) NÃO sobrescreve campos que o usuário
    // editou; só sincroniza com o servidor os campos não editados.
    setDrafts((current) => {
      const next: Record<string, string> = {};
      for (const definition of definitions) {
        const serverValue = formatTicketCustomFieldDraftValue(
          definition.dataType,
          valuesByDefinitionId.get(definition.id)?.value,
        );
        next[definition.id] =
          sameShape && dirtyDefinitionIdsRef.current.has(definition.id)
            ? current[definition.id] ?? serverValue
            : serverValue;
      }
      return next;
    });

    if (!sameShape) {
      // Troca de ticket/conjunto: limpa TODAS as flags de "dirty" — flags do
      // ticket anterior fariam o próximo refetch preservar valores antigos.
      dirtyDefinitionIdsRef.current.clear();
      seededSignatureRef.current = definitionsSignature;
    }
  }, [definitions, definitionsSignature, valuesByDefinitionId]);

  const handleSaveValue = async (definition: CustomFieldDefinition) => {
    setSavingDefinitionId(definition.id);

    try {
      await upsertValue.mutateAsync({
        ticketId,
        definitionId: definition.id,
        value: parseTicketCustomFieldDraftValue(
          definition.dataType,
          drafts[definition.id] ?? '',
        ),
      });

      dirtyDefinitionIdsRef.current.delete(definition.id);
      toast.success(`Campo ${definition.label} atualizado.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o campo customizado.',
      );
    } finally {
      setSavingDefinitionId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        Campos adicionais do chamado
      </p>
      <p className="text-xs text-muted">
        Campos extras cadastrados direto no chamado (não vêm do departamento).
      </p>
      <div className="space-y-3">
        {definitionsQuery.isLoading || valuesQuery.isLoading ? (
          <Loading />
        ) : definitionsQuery.isError || valuesQuery.isError ? (
          <p className="text-sm text-danger">
            Erro ao carregar os campos adicionais do chamado.
          </p>
        ) : definitions.length === 0 ? (
          <p className="text-sm text-muted">Nenhum campo adicional cadastrado.</p>
        ) : (
          definitions.map((definition) => {
            const valueItem = valuesByDefinitionId.get(definition.id);

            return (
              <div
                key={definition.id}
                className="rounded-lg border border-border bg-surface-light px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {definition.label}
                      </p>
                      <Badge color="slate">
                        {getCustomFieldDataTypeLabel(definition.dataType)}
                      </Badge>
                    </div>
                    {definition.description && (
                      <p className="mt-1 text-xs text-muted">
                        {definition.description}
                      </p>
                    )}
                    {valueItem?.updatedAt && (
                      <p className="mt-2 text-[11px] text-muted">
                        Atualizado em{' '}
                        {new Date(valueItem.updatedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleSaveValue(definition)}
                    loading={savingDefinitionId === definition.id}
                  >
                    Salvar
                  </Button>
                </div>

                <div className="mt-3">
                  <TicketCustomFieldInput
                    definition={definition}
                    value={drafts[definition.id] ?? ''}
                    onChange={(value) => {
                      dirtyDefinitionIdsRef.current.add(definition.id);
                      setDrafts((current) => ({
                        ...current,
                        [definition.id]: value,
                      }));
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TicketCustomFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (definition.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Não definido' },
            { value: 'true', label: 'Verdadeiro' },
            { value: 'false', label: 'Falso' },
          ]}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            ...definition.options.map((option) => ({
              value: option,
              label: option,
            })),
          ]}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <TextArea
          label="Valor"
          rows={2}
          value={value}
          hint={
            definition.options.length > 0
              ? `Opções permitidas: ${definition.options.join(', ')}`
              : 'Separe múltiplos valores por vírgula.'
          }
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return (
        <Input
          label="Valor"
          type="number"
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Decimal:
      return (
        <Input
          label="Valor"
          type="number"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Date:
      return (
        <Input
          label="Valor"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.DateTime:
      return (
        <Input
          label="Valor"
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          label="Valor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

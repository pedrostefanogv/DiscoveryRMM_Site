import { useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Shield } from 'lucide-react';

import { Badge, Button, Input, Loading, Select, TextArea } from '@/components/ui';
import {
  CustomFieldDataType,
  CustomFieldScopeType,
  formatCustomFieldValue,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
} from '@/api';
import type { CustomFieldDefinition } from '@/api';
import { TicketSchemaFieldInput } from '@/components/tickets/TicketSchemaFieldInput';
import { draftFromCustomFieldValue } from '@/utils/ticketTemplateDefaults';
import { parseCustomFieldDraft, validateTicketSchemaField } from '@/utils/ticketCustomFields';
import { useCustomFieldDefinitions } from '@/hooks/useCustomFields';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import {
  useTicketCustomFields,
  useUpsertTicketCustomFieldValue,
} from '@/hooks/useTicketCustomFields';
import toast from 'react-hot-toast';

/**
 * Campos do chamado dentro do Resumo geral, logo após o SLA.
 *
 * - "Campos do departamento": definidos para o departamento do chamado. Públicos
 *   são cobrados na abertura; internos não aparecem lá. Nesta tela (atendente)
 *   ambos são editáveis, e os internos recebem o selo "Interno".
 * - "Campos adicionais do chamado": campos de escopo do próprio chamado,
 *   editáveis.
 */
export function TicketFieldsSection({
  ticketId,
  departmentId,
}: {
  ticketId: string;
  departmentId?: string | null;
}) {
  const valuesQuery = useTicketCustomFields(ticketId);
  // Tela do atendente: inclui também campos internos do departamento (eles não
  // aparecem no formulário de abertura, mas precisam ser preenchíveis aqui).
  const schemaQuery = useDepartmentTicketSchema(
    departmentId ?? null,
    Boolean(departmentId),
    true,
  );
  const values = Array.isArray(valuesQuery.data) ? valuesQuery.data : [];

  const upsertValue = useUpsertTicketCustomFieldValue();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Trocar de chamado/departamento descarta rascunhos: sem isso, a mesma
  // definição em outro chamado mostraria a edição não salva do anterior.
  useEffect(() => {
    setDrafts({});
  }, [ticketId, departmentId]);

  const valueByDefinitionId = useMemo(
    () => new Map(values.map((value) => [value.definitionId, value])),
    [values],
  );

  // O schema do departamento dá rótulo/tipo/obrigatoriedade e a ordem canônica;
  // os valores vêm do próprio chamado. Sem schema (chamado antigo/sem
  // departamento), cai para o que a API devolveu resolvido (somente leitura).
  const rows = useMemo(() => {
    const schemaFields = (schemaQuery.data ?? []).filter((field) => field.isActive);
    if (schemaFields.length > 0) {
      return schemaFields.map((field) => ({
        id: field.definitionId,
        label: field.label,
        dataType: field.dataType as CustomFieldDataType | null,
        isRequired: field.isRequired,
        value: valueByDefinitionId.get(field.definitionId)?.value ?? null,
        field,
      }));
    }

    return values
      .filter((value) => value.scopeType === CustomFieldScopeType.Department)
      .map((value) => ({
        id: value.definitionId,
        label: value.label ?? value.name ?? value.definitionId,
        dataType: null,
        isRequired: false,
        value: value.value,
        field: null,
      }));
  }, [schemaQuery.data, valueByDefinitionId, values]);

  // Valor salvo no formato de rascunho do input (o usuário edita em cima).
  const savedDrafts = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.id] = row.field
        ? draftFromCustomFieldValue(row.field.dataType, row.value)
        : formatCustomFieldValue(row.value);
    }
    return map;
  }, [rows]);

  const draftOf = (row: (typeof rows)[number]) => drafts[row.id] ?? savedDrafts[row.id] ?? '';
  const isDirty = (row: (typeof rows)[number]) =>
    drafts[row.id] !== undefined && drafts[row.id] !== (savedDrafts[row.id] ?? '');

  const saveRow = async (row: (typeof rows)[number]) => {
    if (!row.field) return;
    const draft = draftOf(row);
    const fieldError = validateTicketSchemaField(row.field, draft).error;
    if (fieldError) {
      toast.error(fieldError);
      return;
    }

    setSavingId(row.id);
    try {
      await upsertValue.mutateAsync({
        ticketId,
        definitionId: row.id,
        value: parseCustomFieldDraft(row.field.dataType, draft),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      toast.success(`Campo ${row.label} atualizado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o campo.');
    } finally {
      setSavingId(null);
    }
  };

  const isLoading = valuesQuery.isLoading || schemaQuery.isLoading;

  /** Booleanos e datas ficam mais legíveis do que o JSON cru. */
  const formatValue = (dataType: CustomFieldDataType | null, value: unknown): string => {
    if (dataType === CustomFieldDataType.Boolean) {
      return value === true || String(value).toLowerCase() === 'true' ? 'Sim' : 'Não';
    }
    if (
      (dataType === CustomFieldDataType.Date || dataType === CustomFieldDataType.DateTime) &&
      typeof value === 'string' &&
      value.trim()
    ) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return dataType === CustomFieldDataType.Date
          ? parsed.toLocaleDateString('pt-BR')
          : parsed.toLocaleString('pt-BR');
      }
    }
    return formatCustomFieldValue(value);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Campos do departamento
        </p>
        <p className="text-xs text-muted">Definidos para o departamento deste chamado.</p>
        {isLoading ? (
          <Loading />
        ) : schemaQuery.isError ? (
          // Falha do schema (403/500) não pode virar fallback silencioso de
          // somente leitura: sem a definição não há input nem validação.
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-light px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <p className="text-sm text-muted">
              Não foi possível carregar os campos deste departamento.
            </p>
            <Button size="sm" variant="ghost" onClick={() => schemaQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {departmentId
              ? 'Este departamento não possui campos configurados.'
              : 'Chamado sem departamento — não há campos do departamento.'}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-border">
            {rows.map((row) => {
              const text = formatValue(row.dataType, row.value);
              const missing = !text.trim();

              // Sem schema (chamado antigo) não há como editar com validação.
              if (!row.field) {
                return (
                  <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="min-w-0 break-words text-right text-foreground">
                      {missing ? <span className="text-xs text-muted italic">Não informado</span> : text}
                    </span>
                  </li>
                );
              }

              const draft = draftOf(row);
              const fieldError = draft.trim() ? validateTicketSchemaField(row.field, draft).error : undefined;
              const dirty = isDirty(row);

              return (
                <li key={row.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground">
                      {row.label}
                      {row.dataType !== null && (
                        <Badge color="slate">{getCustomFieldDataTypeLabel(row.dataType)}</Badge>
                      )}
                      {row.isRequired && <Badge color="accent">Obrigatório</Badge>}
                      {row.field?.isInternal && (
                        <Badge color="accent">
                          <Shield className="mr-0.5 inline h-3 w-3" />
                          Interno
                        </Badge>
                      )}
                      {!dirty && missing && <span className="text-xs text-muted italic">Não informado</span>}
                    </span>
                    {dirty && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void saveRow(row)}
                        loading={savingId === row.id}
                      >
                        Salvar
                      </Button>
                    )}
                  </div>
                  <div className="mt-2">
                    <TicketSchemaFieldInput
                      field={row.field}
                      value={draft}
                      error={fieldError}
                      onChange={(value) => setDrafts((prev) => ({ ...prev, [row.id]: value }))}
                    />
                  </div>
                </li>
              );
            })}
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

  // Grupo opcional: sem campos de escopo do chamado ele não aparece no Resumo.
  if (!definitionsQuery.isLoading && !valuesQuery.isLoading && definitions.length === 0) {
    return null;
  }

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

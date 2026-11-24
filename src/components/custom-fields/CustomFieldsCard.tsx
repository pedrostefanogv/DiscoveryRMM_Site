import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CustomFieldDataType,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
  type CustomFieldSchemaItem,
} from '@/api';
import { Icon, Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Select, Tooltip } from '@/components/ui';
import {
  isSchemaValueCopyable,
  parseSchemaValue,
  schemaValueDisplay,
  schemaValueDraft,
  schemaValueText,
} from './customFieldSchemaValue';

const COLLAPSED_COUNT = 6;

interface Props {
  items: CustomFieldSchemaItem[];
  isLoading: boolean;
  isError: boolean;
  /** false = somente leitura (sem permissão de edição da entidade). */
  canEdit: boolean;
  /** Título do card; o padrão é o nome da tela de definições. */
  title?: string;
  subtitle?: string;
  emptyMessage: string;
  /** Persiste o valor do campo; deve rejeitar em caso de erro. */
  onSave: (item: CustomFieldSchemaItem, value: unknown) => Promise<void>;
  /** Callback de retentativa quando isError é verdadeiro. */
  onRetry?: () => void;
  /** Quando true, exibe todos os campos sem recolher após 6 itens. */
  defaultExpanded?: boolean;
}

/**
 * Apresentação do card de campos customizados (agente, cliente ou site).
 * Só recebe itens com visibilidade no portal (webRead) — o filtro é do endpoint
 * de schema. Respeita a capacidade de edição pelo portal (webEdit).
 *
 * A linha de cada campo mostra apenas o essencial (rótulo + valor/edição).
 * Chave, tipo, permissões e última atualização ficam no ícone ⓘ (hover/foco),
 * para não poluir a leitura da aba.
 */
export function CustomFieldsCard({ items, isLoading, isError, canEdit, title, subtitle, emptyMessage, onSave, onRetry, defaultExpanded = false }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.label.localeCompare(b.label, 'pt-BR');
      }),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      item => item.label.toLowerCase().includes(q) || item.name.toLowerCase().includes(q),
    );
  }, [sorted, search]);

  // Sincroniza os rascunhos quando o schema chega/muda, preservando campos
  // alterados pelo usuário para evitar perda de rascunho em revalidações.
  useEffect(() => {
    setDrafts(prev => {
      const next: Record<string, string> = {};
      for (const item of items) {
        const serverDraft = schemaValueDraft(item, parseSchemaValue(item));
        if (dirtyIdsRef.current.has(item.definitionId) && item.definitionId in prev) {
          next[item.definitionId] = prev[item.definitionId];
        } else {
          next[item.definitionId] = serverDraft;
        }
      }
      return next;
    });
  }, [items]);

  const showAll = expanded || search.trim().length > 0;
  const visibleItems = showAll ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const hiddenCount = Math.max(0, filtered.length - visibleItems.length);

  async function handleSave(item: CustomFieldSchemaItem) {
    const draft = drafts[item.definitionId] ?? '';
    if (item.isSecret && !draft.trim()) {
      toast.error('Informe o novo valor do campo secreto.');
      return;
    }

    setSavingId(item.definitionId);
    try {
      await onSave(item, parseCustomFieldValue(item.dataType, draft));
      dirtyIdsRef.current.delete(item.definitionId);
      if (item.isSecret) {
        setDrafts(prev => ({ ...prev, [item.definitionId]: '' }));
      }
      toast.success(`${item.label} atualizado.`);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Falha ao salvar o campo.';
      toast.error(message);
    } finally {
      setSavingId(null);
    }
  }

  function handleRevert(item: CustomFieldSchemaItem) {
    dirtyIdsRef.current.delete(item.definitionId);
    const original = schemaValueDraft(item, parseSchemaValue(item));
    setDrafts(prev => ({ ...prev, [item.definitionId]: original }));
  }

  async function handleCopy(item: CustomFieldSchemaItem) {
    // Segredo e campo sem valor não são copiados: a máscara não é o valor real.
    if (!isSchemaValueCopyable(item)) {
      toast.error('Este campo não tem valor para copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(schemaValueText(item));
      toast.success('Valor copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <Card>
      <CardHeader
        title={title ?? 'Campos customizados'}
        subtitle={
          subtitle ??
          (sorted.length === 0
            ? 'Nenhum campo visível no portal.'
            : `${sorted.length} campo(s) · definidos em Configurações → Campos customizados`)
        }
      />

      {isLoading ? (
        <Loading message="Carregando campos..." />
      ) : isError ? (
        <ErrorDisplay message="Não foi possível carregar os campos." onRetry={onRetry} />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {sorted.length > 4 ? (
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar campos por nome ou chave..."
            />
          ) : null}

          {visibleItems.length === 0 ? (
            <p className="text-sm text-muted">Nenhum campo encontrado para o filtro informado.</p>
          ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {visibleItems.map(item => {
                const currentValue = parseSchemaValue(item);
                const display = schemaValueDisplay(item, currentValue);
                const draft = drafts[item.definitionId] ?? '';
                const editable = canEdit && item.allowWebEdit;
                const changed = !item.isSecret && draft !== schemaValueDraft(item, currentValue);
                const copyable = isSchemaValueCopyable(item);

                return (
                  <div key={item.definitionId} className="bg-surface-light px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {item.isPinned ? (
                        <Tooltip content="Campo destacado — aparece também no resumo do cadastro.">
                          <span
                            role="img"
                            aria-label="Campo destacado"
                            className="inline-flex text-accent"
                          >
                            <Icon name="push_pin" className="h-3.5 w-3.5" />
                          </span>
                        </Tooltip>
                      ) : null}
                      <span className="min-w-0 truncate font-medium text-foreground">{item.label}</span>
                      {item.isSecret ? <Badge color="warning">Segredo</Badge> : null}
                      <FieldInfoButton item={item} />
                    </div>

                    {editable ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="min-w-[200px] flex-1">
                          <SchemaValueInput
                            item={item}
                            draft={draft}
                            placeholder={item.isSecret ? 'Defina um novo valor para substituir' : undefined}
                            onChange={value => {
                              const original = schemaValueDraft(item, currentValue);
                              if (value === original && !item.isSecret) {
                                dirtyIdsRef.current.delete(item.definitionId);
                              } else {
                                dirtyIdsRef.current.add(item.definitionId);
                              }
                              setDrafts(prev => ({ ...prev, [item.definitionId]: value }));
                            }}
                            onSubmit={() => {
                              if (item.isSecret ? draft.trim() : changed) {
                                void handleSave(item);
                              }
                            }}
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={item.isSecret ? !draft.trim() : !changed}
                          loading={savingId === item.definitionId}
                          onClick={() => void handleSave(item)}
                        >
                          Salvar
                        </Button>
                        {changed ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Desfazer alteração de ${item.label}`}
                            title="Desfazer alteração"
                            onClick={() => handleRevert(item)}
                          >
                            <Icon name="restart_alt" className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {copyable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Copiar valor de ${item.label}`}
                            title="Copiar valor"
                            onClick={() => void handleCopy(item)}
                          >
                            <Icon name="content_copy" className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={display || undefined}>
                          {display || 'Não informado'}
                        </span>
                        {copyable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Copiar valor de ${item.label}`}
                            title="Copiar valor"
                            onClick={() => void handleCopy(item)}
                          >
                            <Icon name="content_copy" className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {hiddenCount > 0 && !showAll ? (
            <Button size="sm" variant="secondary" onClick={() => setExpanded(true)}>
              Mostrar todos (+{hiddenCount})
            </Button>
          ) : null}
          {expanded && !defaultExpanded && filtered.length > COLLAPSED_COUNT && !search.trim() ? (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
              Mostrar menos
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/**
 * Metadados do campo (chave, tipo, permissões e última atualização) atrás do
 * ícone ⓘ. O texto também vai no aria-label para leitores de tela — o balão só
 * existe no hover/foco.
 */
function FieldInfoButton({ item }: { item: CustomFieldSchemaItem }) {
  const capabilities = [
    item.allowRuntimeRead ? 'Lido por scripts' : null,
    item.allowAgentWrite ? 'Atualizado pelo agente' : null,
    !item.allowWebEdit ? 'Somente leitura no portal' : null,
  ].filter((value): value is string => Boolean(value));

  const updated = item.valueUpdatedAt
    ? `Atualizado em ${formatDateTime(item.valueUpdatedAt)}${item.valueUpdatedBy ? ` · ${describeUpdatedBy(item.valueUpdatedBy)}` : ''}`
    : 'Sem valor registrado';

  const summary = [
    `Chave: ${item.name}`,
    `Tipo: ${getCustomFieldDataTypeLabel(item.dataType)}`,
    ...(item.options.length > 0 ? [`Opções: ${item.options.join(', ')}`] : []),
    ...capabilities,
    updated,
  ].join(' · ');

  return (
    <Tooltip
      position="top"
      variant="hover-card"
      content={
        <div className="space-y-2">
          {item.description ? <p className="text-muted">{item.description}</p> : null}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted">Chave</dt>
            <dd className="font-mono text-foreground">{item.name}</dd>
            <dt className="text-muted">Tipo</dt>
            <dd className="text-foreground">{getCustomFieldDataTypeLabel(item.dataType)}</dd>
            {item.options.length > 0 ? (
              <>
                <dt className="text-muted">Opções</dt>
                <dd className="text-foreground">{item.options.join(', ')}</dd>
              </>
            ) : null}
            <dt className="text-muted">Permissões</dt>
            <dd className="text-foreground">
              {capabilities.length > 0 ? capabilities.join(' · ') : 'Editável no portal'}
            </dd>
            <dt className="text-muted">Última atualização</dt>
            <dd className="text-foreground">{updated}</dd>
          </dl>
        </div>
      }
    >
      <button
        type="button"
        aria-label={summary}
        className="-m-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Icon name="info" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

/** "task:<guid>"/"script:<guid>" viram um rótulo legível (id completo no title). */
function describeUpdatedBy(updatedBy: string): string {
  if (updatedBy.startsWith('task:')) return `tarefa ${updatedBy.slice(5, 13)}…`;
  if (updatedBy.startsWith('script:')) return `script ${updatedBy.slice(7, 15)}…`;
  if (updatedBy === 'agent') return 'agente';
  return updatedBy;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function SchemaValueInput({
  item,
  draft,
  placeholder,
  onChange,
  onSubmit,
}: {
  item: CustomFieldSchemaItem;
  draft: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const ariaLabel = item.label;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  switch (item.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          aria-label={ariaLabel}
          value={draft}
          options={[
            { value: '', label: 'Selecione...' },
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' },
          ]}
          onChange={event => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          aria-label={ariaLabel}
          value={draft}
          options={[
            { value: '', label: 'Selecione...' },
            ...item.options.map(option => ({ value: option, label: option })),
          ]}
          onChange={event => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <Input
          aria-label={ariaLabel}
          value={draft}
          placeholder={placeholder ?? 'Valores separados por vírgula'}
          onChange={event => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input aria-label={ariaLabel} type="number" step="1" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} />;
    case CustomFieldDataType.Decimal:
      return <Input aria-label={ariaLabel} type="number" step="any" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} />;
    case CustomFieldDataType.Date:
      return <Input aria-label={ariaLabel} type="date" value={draft} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input aria-label={ariaLabel} type="datetime-local" value={draft} onChange={event => onChange(event.target.value)} />;
    default:
      return <Input aria-label={ariaLabel} value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} />;
  }
}

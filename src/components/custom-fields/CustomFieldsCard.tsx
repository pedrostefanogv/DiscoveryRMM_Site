import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Info, Pin } from 'lucide-react';
import {
  CustomFieldDataType,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
  type CustomFieldSchemaItem,
} from '@/api';
import { Badge, Button, Card, CardHeader, Input, Select, Tooltip } from '@/components/ui';
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
export function CustomFieldsCard({ items, isLoading, isError, canEdit, title, subtitle, emptyMessage, onSave }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.label.localeCompare(b.label, 'pt-BR');
      }),
    [items],
  );

  // Sincroniza os rascunhos quando o schema chega/muda. Campos secretos começam
  // vazios: o valor mascarado ("***") nunca deve ser reenviado.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of items) {
      next[item.definitionId] = schemaValueDraft(item, parseSchemaValue(item));
    }
    setDrafts(next);
  }, [items]);

  const visibleItems = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);
  const hiddenCount = Math.max(0, sorted.length - visibleItems.length);

  async function handleSave(item: CustomFieldSchemaItem) {
    const draft = drafts[item.definitionId] ?? '';
    if (item.isSecret && !draft.trim()) {
      toast.error('Informe o novo valor do campo secreto.');
      return;
    }

    setSavingId(item.definitionId);
    try {
      await onSave(item, parseCustomFieldValue(item.dataType, draft));
      toast.success(`${item.label} atualizado.`);
    } catch {
      toast.error('Falha ao salvar o campo.');
    } finally {
      setSavingId(null);
    }
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
        <p className="text-sm text-muted">Carregando campos...</p>
      ) : isError ? (
        <p className="text-sm text-muted">Não foi possível carregar os campos.</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
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
                            <Pin className="h-3.5 w-3.5" />
                          </span>
                        </Tooltip>
                      ) : null}
                      <span className="min-w-0 truncate font-medium text-foreground">{item.label}</span>
                      {item.isSecret ? <Badge color="warning">Segredo</Badge> : null}
                      <FieldInfoButton item={item} />
                    </div>

                    {editable ? (
                      <div className="mt-2 grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <SchemaValueInput
                          item={item}
                          draft={draft}
                          placeholder={item.isSecret ? 'Defina um novo valor para substituir' : undefined}
                          onChange={value => setDrafts(prev => ({ ...prev, [item.definitionId]: value }))}
                        />
                        <Button
                          size="sm"
                          disabled={item.isSecret ? !draft.trim() : !changed}
                          loading={savingId === item.definitionId}
                          onClick={() => void handleSave(item)}
                        >
                          Salvar
                        </Button>
                        {copyable ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Copiar valor de ${item.label}`}
                            title="Copiar valor"
                            onClick={() => void handleCopy(item)}
                          >
                            <Copy className="h-4 w-4" />
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
                            <Copy className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hiddenCount > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setExpanded(true)}>
              Mostrar todos (+{hiddenCount})
            </Button>
          ) : null}
          {expanded && sorted.length > COLLAPSED_COUNT ? (
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
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Info className="h-3.5 w-3.5" />
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
}: {
  item: CustomFieldSchemaItem;
  draft: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const ariaLabel = item.label;

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
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input aria-label={ariaLabel} type="number" step="1" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.Decimal:
      return <Input aria-label={ariaLabel} type="number" step="any" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.Date:
      return <Input aria-label={ariaLabel} type="date" value={draft} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input aria-label={ariaLabel} type="datetime-local" value={draft} onChange={event => onChange(event.target.value)} />;
    default:
      return <Input aria-label={ariaLabel} value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
  }
}

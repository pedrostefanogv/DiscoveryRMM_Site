import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Pin } from 'lucide-react';
import {
  CustomFieldDataType,
  formatCustomFieldValue,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
  type CustomFieldSchemaItem,
} from '@/api';
import { Badge, Button, Card, CardHeader, Input, Select } from '@/components/ui';

const COLLAPSED_COUNT = 6;

interface Props {
  items: CustomFieldSchemaItem[];
  isLoading: boolean;
  isError: boolean;
  /** false = somente leitura (sem permissão de edição da entidade). */
  canEdit: boolean;
  subtitle?: string;
  emptyMessage: string;
  /** Persiste o valor do campo; deve rejeitar em caso de erro. */
  onSave: (item: CustomFieldSchemaItem, value: unknown) => Promise<void>;
}

/**
 * Apresentação do card de campos customizados (agente, cliente ou site).
 * Só recebe itens com visibilidade no portal (webRead) — o filtro é do endpoint
 * de schema. Respeita a capacidade de edição pelo portal (webEdit).
 */
export function CustomFieldsCard({ items, isLoading, isError, canEdit, subtitle, emptyMessage, onSave }: Props) {
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
      next[item.definitionId] = item.isSecret ? '' : formatCustomFieldValue(parseSchemaValue(item));
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
    const text = formatCustomFieldValue(parseSchemaValue(item));
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Valor copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Campos customizados"
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
        <div className="space-y-4">
          {visibleItems.map(item => {
            const currentValue = parseSchemaValue(item);
            const display = item.isSecret ? '••••••' : formatCustomFieldValue(currentValue);
            const draft = drafts[item.definitionId] ?? '';
            const editable = canEdit && item.allowWebEdit;
            const changed = !item.isSecret && draft !== formatCustomFieldValue(currentValue);

            return (
              <div key={item.definitionId} className="rounded-lg border border-border bg-surface-light p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {item.isPinned ? <Pin className="h-3.5 w-3.5 text-accent" /> : null}
                  <span className="font-medium text-foreground">{item.label}</span>
                  <Badge color="slate">{getCustomFieldDataTypeLabel(item.dataType)}</Badge>
                  {item.isSecret ? <Badge color="warning">Segredo</Badge> : null}
                  {item.allowRuntimeRead ? <Badge color="accent">Lido por scripts</Badge> : null}
                  {item.allowAgentWrite ? <Badge color="accent">Atualizado pelo agente</Badge> : null}
                  {!item.allowWebEdit ? <Badge color="slate">Somente leitura</Badge> : null}
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted">Chave: {item.name}</p>

                {editable ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
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
                    <Button size="sm" variant="ghost" onClick={() => void handleCopy(item)}>
                      <Copy className="h-4 w-4" />
                      Copiar
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-foreground">{display || 'Não informado'}</span>
                    {display ? (
                      <Button size="sm" variant="ghost" onClick={() => void handleCopy(item)}>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </Button>
                    ) : null}
                  </div>
                )}

                <p className="mt-1 text-[11px] text-muted">
                  {item.valueUpdatedAt
                    ? `Atualizado em ${formatDateTime(item.valueUpdatedAt)}${item.valueUpdatedBy ? ` · ${describeUpdatedBy(item.valueUpdatedBy)}` : ''}`
                    : 'Sem valor registrado'}
                </p>
              </div>
            );
          })}

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

/** "task:<guid>"/"script:<guid>" viram um rótulo legível (id completo no title). */
function describeUpdatedBy(updatedBy: string): string {
  if (updatedBy.startsWith('task:')) return `tarefa ${updatedBy.slice(5, 13)}…`;
  if (updatedBy.startsWith('script:')) return `script ${updatedBy.slice(7, 15)}…`;
  if (updatedBy === 'agent') return 'agente';
  return updatedBy;
}

function parseSchemaValue(item: CustomFieldSchemaItem): unknown {
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
          label="Valor"
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
          label="Valor"
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
          label="Valor (vírgula separado)"
          aria-label={ariaLabel}
          value={draft}
          hint={item.options.length > 0 ? `Opções: ${item.options.join(', ')}` : undefined}
          onChange={event => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input label="Valor" aria-label={ariaLabel} type="number" step="1" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.Decimal:
      return <Input label="Valor" aria-label={ariaLabel} type="number" step="any" value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.Date:
      return <Input label="Valor" aria-label={ariaLabel} type="date" value={draft} onChange={event => onChange(event.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input label="Valor" aria-label={ariaLabel} type="datetime-local" value={draft} onChange={event => onChange(event.target.value)} />;
    default:
      return <Input label="Valor" aria-label={ariaLabel} value={draft} placeholder={placeholder} onChange={event => onChange(event.target.value)} />;
  }
}

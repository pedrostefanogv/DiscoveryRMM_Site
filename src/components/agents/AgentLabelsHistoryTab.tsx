import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorDisplay, Icon, Loading } from '@/components/ui';
import { AgentLabelSourceType, type AgentLabelChangeLog } from '@/modules/agent-labels/types';
import { formatDate } from '@/pages/agents/agentDetailUtils';

export interface ActiveAgentLabelItem {
  id: string;
  label: string;
  sourceType: AgentLabelSourceType;
}

interface AgentLabelsHistoryTabProps {
  history: AgentLabelChangeLog[];
  isLoading: boolean;
  isError?: boolean;
  onRefresh: () => void;
  activeLabels?: ActiveAgentLabelItem[];
  canManage?: boolean;
  onRemoveLabel?: (labelId: string) => void;
}

type HistoryFilter = 'all' | 'Applied' | 'Removed';

export function AgentLabelsHistoryTab({
  history,
  isLoading,
  isError = false,
  onRefresh,
  activeLabels,
  canManage = false,
  onRemoveLabel,
}: AgentLabelsHistoryTabProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history;
    return history.filter((item) => item.action === filter);
  }, [history, filter]);

  return (
    <Card>
      <CardHeader
        title="Histórico de labels"
        subtitle={
          history.length > 0
            ? `Últimos ${history.length} registros de aplicação e remoção`
            : 'Auditoria de aplicação e remoção de labels'
        }
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Atualizar histórico de labels"
            title="Atualizar histórico de labels"
          >
            <Icon name="refresh" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        }
      />

      {activeLabels !== undefined && (
        <div className="mb-4 rounded-xl border border-border bg-surface-light/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Labels ativas ({activeLabels.length})
            </p>
            <p className="text-[11px] text-muted">
              Automáticas e manuais aplicadas atualmente
            </p>
          </div>
          {activeLabels.length === 0 ? (
            <p className="text-xs text-muted">Nenhuma label ativa neste agente.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activeLabels.map((item) => (
                <Badge
                  key={item.id}
                  color={item.sourceType === AgentLabelSourceType.Manual ? 'slate' : 'accent'}
                >
                  <span>{item.label}</span>
                  {canManage && item.sourceType === AgentLabelSourceType.Manual && onRemoveLabel ? (
                    <button
                      type="button"
                      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                      title="Remover label manual"
                      aria-label={`Remover label ${item.label}`}
                      onClick={() => onRemoveLabel(item.id)}
                    >
                      ×
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading && history.length === 0 ? (
        <Loading message="Carregando histórico de labels..." />
      ) : isError ? (
        <ErrorDisplay message="Não foi possível carregar o histórico de labels." onRetry={onRefresh} />
      ) : history.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: `Todas (${history.length})` },
                { id: 'Applied', label: 'Aplicadas' },
                { id: 'Removed', label: 'Removidas' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={filter === opt.id}
                onClick={() => setFilter(opt.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  filter === opt.id
                    ? 'border-primary/60 bg-primary/20 text-primary-100'
                    : 'border-border bg-surface-light text-muted hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <p className="text-sm text-muted">Nenhum registro para o filtro selecionado.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface-light px-3 py-2 text-xs text-muted"
                >
                  <Badge color={item.action === 'Removed' ? 'warning' : 'success'}>
                    {item.action === 'Removed' ? 'Removida' : 'Aplicada'}
                  </Badge>
                  <span className="font-mono font-medium text-foreground">{item.label}</span>
                  <span>· {formatDate(item.occurredAt)}</span>
                  {item.ruleName ? <span>· regra {item.ruleName}</span> : null}
                  {item.actor ? <span>· {item.actor}</span> : null}
                  {item.reason ? <span className="text-muted-foreground">· {item.reason}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Sem histórico registrado.</p>
      )}
    </Card>
  );
}

import { Button, Card, CardHeader, Icon } from '@/components/ui';
import type { AgentLabelChangeLog } from '@/modules/agent-labels/types';
import { formatDate } from '@/pages/agents/agentDetailUtils';

interface AgentLabelsHistoryTabProps {
  history: AgentLabelChangeLog[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function AgentLabelsHistoryTab({ history, isLoading, onRefresh }: AgentLabelsHistoryTabProps) {
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
      {history.length > 0 ? (
        <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {history.map(item => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className={item.action === 'Removed' ? 'text-warning' : 'text-success'}>
                {item.action === 'Removed' ? 'Removida' : 'Aplicada'}
              </span>
              <span className="font-mono text-foreground">{item.label}</span>
              <span>• {formatDate(item.occurredAt)}</span>
              {item.ruleName ? <span>• regra {item.ruleName}</span> : null}
              {item.actor ? <span>• {item.actor}</span> : null}
              {item.reason ? <span className="text-muted-foreground">• {item.reason}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Sem histórico registrado.</p>
      )}
    </Card>
  );
}

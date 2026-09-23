import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { getLogLevelMeta } from '@/utils/labels';
import type { LogEntry } from '@/api';

interface RecentLogsCardProps {
  logs: LogEntry[];
  total: number;
  isLoading?: boolean;
  title?: string;
  emptyMessage?: string;
  onViewAll: () => void;
}

/** Card padronizado de logs recentes (ClientDetail e SiteDetail). */
export function RecentLogsCard({
  logs,
  total,
  isLoading,
  title = 'Logs Recentes',
  emptyMessage = 'Nenhum log registrado',
  onViewAll,
}: RecentLogsCardProps) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            Ver todos
          </Button>
        }
      />
      <div className="space-y-2">
        {logs.map((log) => {
          const level = getLogLevelMeta(log.level);
          return (
            <div key={log.id} className="flex items-start gap-2 rounded-lg bg-surface-light px-3 py-2">
              <Badge color={level.color} className="mt-0.5 shrink-0">
                {level.label}
              </Badge>
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{log.message}</p>
            </div>
          );
        })}
        {isLoading && <p className="text-sm text-muted">Carregando...</p>}
        {total === 0 && !isLoading && <p className="text-sm text-muted">{emptyMessage}</p>}
      </div>
    </Card>
  );
}

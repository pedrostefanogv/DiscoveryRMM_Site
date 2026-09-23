import { Ticket as TicketIcon } from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { getTicketPriorityMeta } from '@/utils/labels';
import type { Ticket } from '@/api';

interface RecentTicketsCardProps {
  tickets: Ticket[];
  total: number;
  isLoading?: boolean;
  emptyMessage?: string;
  onSelect: (ticket: Ticket) => void;
  onViewAll: () => void;
}

/** Card padronizado de chamados recentes (ClientDetail e SiteDetail). */
export function RecentTicketsCard({
  tickets,
  total,
  isLoading,
  emptyMessage = 'Nenhum chamado',
  onSelect,
  onViewAll,
}: RecentTicketsCardProps) {
  return (
    <Card>
      <CardHeader
        title="Chamados Recentes"
        subtitle={`${total} total`}
        action={
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            Ver todos
          </Button>
        }
      />
      <div className="space-y-2">
        {tickets.map((ticket) => {
          const priority = getTicketPriorityMeta(ticket.priority);
          return (
            <div
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(ticket)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(ticket);
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <TicketIcon className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{ticket.title}</p>
                <p className="text-xs text-muted">{ticket.category ?? 'Sem categoria'}</p>
              </div>
              <Badge color={priority.color}>{priority.label}</Badge>
            </div>
          );
        })}
        {isLoading && <p className="text-sm text-muted">Carregando...</p>}
        {total === 0 && !isLoading && <p className="text-sm text-muted">{emptyMessage}</p>}
      </div>
    </Card>
  );
}

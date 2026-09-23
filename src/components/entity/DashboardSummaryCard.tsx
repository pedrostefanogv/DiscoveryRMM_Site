import { Activity, AlertTriangle, CheckCircle2, Monitor, Ticket as TicketIcon, XCircle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui';
import type { DashboardSummaryDto } from '@/api/dashboard';

interface DashboardSummaryCardProps {
  data: DashboardSummaryDto;
  title: string;
  subtitle?: string;
}

/** Card de resumo (agentes/chamados/comandos/automação) padronizado. */
export function DashboardSummaryCard({ data, title, subtitle }: DashboardSummaryCardProps) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-surface-light px-3 py-2">
          <div className="flex items-center gap-1.5 text-muted">
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Agentes</span>
          </div>
          <p className="mt-1 text-base font-semibold text-foreground">
            {data.agents.online}
            <span className="text-xs font-normal text-muted">/{data.agents.total} online</span>
          </p>
          {data.agents.error > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {data.agents.error} em erro
            </p>
          )}
        </div>

        <div className="rounded-lg bg-surface-light px-3 py-2">
          <div className="flex items-center gap-1.5 text-muted">
            <TicketIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chamados</span>
          </div>
          <p className="mt-1 text-base font-semibold text-foreground">
            {data.tickets.open}
            <span className="text-xs font-normal text-muted"> abertos</span>
          </p>
          {data.tickets.slaBreachedOpen > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {data.tickets.slaBreachedOpen} SLA violado
            </p>
          )}
        </div>

        <div className="rounded-lg bg-surface-light px-3 py-2">
          <div className="flex items-center gap-1.5 text-muted">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Comandos</span>
          </div>
          {data.commands.total > 0 ? (
            <>
              <p className={`mt-1 text-base font-semibold ${data.commands.successRate >= 80 ? 'text-success' : 'text-danger'}`}>
                {data.commands.successRate.toFixed(1)}% sucesso
              </p>
              <p className="mt-0.5 text-xs text-muted">{data.commands.total} total</p>
            </>
          ) : (
            <p className="mt-1 text-base font-semibold text-muted">Nenhum</p>
          )}
        </div>

        <div className="rounded-lg bg-surface-light px-3 py-2">
          <div className="flex items-center gap-1.5 text-muted">
            {data.automation.total > 0 && data.automation.failed > 0 ? (
              <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>Automação</span>
          </div>
          {data.automation.total > 0 ? (
            <>
              <p className={`mt-1 text-base font-semibold ${data.automation.successRate >= 80 ? 'text-success' : 'text-danger'}`}>
                {data.automation.successRate.toFixed(1)}% sucesso
              </p>
              <p className="mt-0.5 text-xs text-muted">{data.automation.total} execuções</p>
            </>
          ) : (
            <p className="mt-1 text-base font-semibold text-muted">Nenhuma</p>
          )}
        </div>
      </div>
    </Card>
  );
}

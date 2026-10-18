import { memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Download,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Button, Card, CardHeader, MetricBar } from "@/components/ui";
import type { PatchScopeSnapshot } from "@/api/types";

/**
 * Card do dashboard: inventário de atualizações (patches/WUA) da frota.
 *
 * Alimentado pelo `usePatchSnapshot('global')` que a página incicial JÁ usa no
 * KPI "Conformidade de patches" — ou seja, este card não adiciona nenhuma
 * requisição nova ao carregamento da home. É o detalhamento do que o KPI só
 * mostra em número: pendências, aprovações, reboot e falhas por janela/24h.
 */

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function complianceTone(value: number): "success" | "warning" | "danger" {
  if (value >= 90) return "success";
  if (value >= 70) return "warning";
  return "danger";
}

interface TileProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "warning" | "success";
  title?: string;
}

const toneClasses: Record<
  NonNullable<TileProps["tone"]>,
  { box: string; icon: string; value: string }
> = {
  default: { box: "bg-surface-light", icon: "text-muted", value: "text-foreground" },
  danger: { box: "bg-danger/10", icon: "text-danger", value: "text-danger" },
  warning: { box: "bg-warning/10", icon: "text-warning", value: "text-warning" },
  success: { box: "bg-success/10", icon: "text-success", value: "text-success" },
};

const MetricTile = memo(function MetricTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  title,
}: TileProps) {
  const classes = toneClasses[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ${classes.box}`} title={title}>
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className={`h-3.5 w-3.5 ${classes.icon}`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${classes.value}`}>{value}</p>
    </div>
  );
});

export interface AgentUpdatesInventoryCardProps {
  snapshot?: PatchScopeSnapshot;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRefresh?: () => void;
}

export function AgentUpdatesInventoryCard({
  snapshot,
  isLoading = false,
  isError = false,
  isFetching = false,
  onRefresh,
}: AgentUpdatesInventoryCardProps) {
  const navigate = useNavigate();

  const totalPending = snapshot?.totalPending ?? 0;
  const criticalPending = snapshot?.criticalPending ?? 0;
  const approvedPending = snapshot?.approvedPending ?? 0;
  const deniedPending = snapshot?.deniedPending ?? 0;
  const rebootPendingAgents = snapshot?.rebootPendingAgents ?? 0;
  const failedInstallations24h = snapshot?.failedInstallations24h ?? 0;
  const agentsWithPending = snapshot?.agentsWithPending ?? 0;
  const agentsTotal = snapshot?.agentsTotal ?? 0;
  const agentsReporting = snapshot?.agentsReporting ?? 0;
  const compliancePercent = snapshot?.compliancePercent ?? 0;

  // Pendências que ainda não têm decisão do operador (nem aprovadas, nem
  // negadas). É o número que realmente exige ação no gerenciador de patches.
  const awaitingDecision = Math.max(0, totalPending - approvedPending - deniedPending);
  const reportingPercent =
    agentsTotal > 0 ? Math.round((agentsReporting / agentsTotal) * 100) : 0;
  const hasData = Boolean(snapshot);

  return (
    <Card>
      <CardHeader
        title="Atualizações & Inventário dos Agentes"
        subtitle={
          hasData
            ? `Patches (Windows Update) da frota · última varredura ${formatDateTime(snapshot?.lastScanAt)}`
            : "Patches (Windows Update) da frota"
        }
        action={
          <div className="flex items-center gap-2">
            {isFetching && (
              <span className="text-xs text-primary" aria-live="polite">
                atualizando…
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              aria-label="Atualizar inventário de atualizações"
              title="Atualizar inventário de atualizações"
              disabled={!onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/patches/inventory")}
            >
              Gerenciador
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Não foi possível carregar o inventário de atualizações.
          </span>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              Tentar novamente
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="space-y-3">
            <MetricBar
              label="Conformidade da frota"
              value={isLoading ? null : compliancePercent}
              color={complianceTone(compliancePercent)}
            />
            <MetricBar
              label="Agentes reportando inventário"
              value={isLoading ? null : reportingPercent}
              color={reportingPercent >= 90 ? "success" : reportingPercent >= 50 ? "warning" : "danger"}
            />
            <p className="text-xs text-muted">
              {agentsReporting} de {agentsTotal} agentes reportaram
              {agentsWithPending > 0 ? ` · ${agentsWithPending} com pendência(s)` : " · nenhum com pendência"}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {criticalPending > 0 ? (
                <Badge color="danger">{criticalPending} crítica(s)</Badge>
              ) : (
                <Badge color="success">sem críticas pendentes</Badge>
              )}
              {rebootPendingAgents > 0 && (
                <Badge color="warning">{rebootPendingAgents} reinício(s) pendente(s)</Badge>
              )}
              {deniedPending > 0 && <Badge color="slate">{deniedPending} negada(s)</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricTile
              label="Pendentes"
              value={isLoading ? "—" : totalPending}
              icon={ShieldAlert}
              title="Atualizações pendentes detectadas no inventário da frota."
            />
            <MetricTile
              label="Críticas"
              value={isLoading ? "—" : criticalPending}
              icon={AlertTriangle}
              tone={criticalPending > 0 ? "danger" : "success"}
              title="Pendências classificadas como críticas/importantes."
            />
            <MetricTile
              label="Aprovadas"
              value={isLoading ? "—" : approvedPending}
              icon={CheckCircle2}
              tone="success"
              title="Pendências já aprovadas para instalação."
            />
            <MetricTile
              label="Sem decisão"
              value={isLoading ? "—" : awaitingDecision}
              icon={Ban}
              tone={awaitingDecision > 0 ? "warning" : "default"}
              title="Pendências que ainda aguardam aprovação/negação do operador."
            />
            <MetricTile
              label="Reboot"
              value={isLoading ? "—" : rebootPendingAgents}
              icon={RotateCcw}
              tone={rebootPendingAgents > 0 ? "warning" : "default"}
              title="Agentes com reinício pendente após instalação."
            />
            <MetricTile
              label="Falhas 24h"
              value={isLoading ? "—" : failedInstallations24h}
              icon={Download}
              tone={failedInstallations24h > 0 ? "danger" : "default"}
              title="Instalações de patch que falharam nas últimas 24 horas."
            />
          </div>
        </div>
      )}
    </Card>
  );
}

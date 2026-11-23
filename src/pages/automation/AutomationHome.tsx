import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Icon,
  PageHeader,
  StatCard,
  type MaterialSymbolName,
} from "@/components/ui";
import { useAuthorization } from "@/auth/authorization";
import { useAutomationScripts, useAutomationTasks } from "@/hooks/useAutomation";
import { AppApprovalScopeType } from "@/api";
import { formatDateTime } from "@/utils/format";
import { AutomationSubnav } from "./AutomationSubnav";
import { actionDisplayLabel, normalizeScopeType } from "./automationTasksUtils";

const baseCards: {
  title: string;
  description: string;
  to: string;
  cta: string;
  icon: MaterialSymbolName;
}[] = [
  {
    title: "Scripts",
    description: "Cadastro de scripts reutilizáveis e trilha de auditoria.",
    to: "/automation/scripts",
    cta: "Abrir Scripts",
    icon: "build",
  },
  {
    title: "Tarefas",
    description: "Regras de automação por escopo com validação condicional.",
    to: "/automation/tasks",
    cta: "Abrir Tarefas",
    icon: "checklist",
  },
  {
    title: "Operações",
    description: "Run-now, force-sync e histórico de execução por agent.",
    to: "/automation/operations",
    cta: "Abrir Operações",
    icon: "play_circle",
  },
  {
    title: "Auditoria",
    description: "Trilha de alterações de scripts e tarefas com snapshots.",
    to: "/automation/audit",
    cta: "Abrir Auditoria",
    icon: "history",
  },
];

export default function AutomationHome() {
  const { canCreateAutomation, canExecuteAutomation, hasAnyPermission } = useAuthorization();
  const canViewAgentLabels = hasAnyPermission(["agents.*", "agents.view", "Agents.View", "admin.*"]);

  const scripts = useAutomationScripts({ activeOnly: false, limit: 200 });
  const tasks = useAutomationTasks({ activeOnly: false, limit: 200 });

  const scriptItems = scripts.data?.items ?? [];
  const activeScripts = scriptItems.filter((s) => s.isActive).length;
  const taskItems = tasks.data?.items ?? [];
  const activeTasks = taskItems.filter((t) => t.isActive).length;
  const globalTasks = taskItems.filter(
    (t) => normalizeScopeType(t.scopeType) === AppApprovalScopeType.Global,
  ).length;
  const inactiveTasks = Math.max(0, taskItems.length - activeTasks);

  const scriptsSuffix = scripts.data?.hasMore ? "+" : "";
  const tasksSuffix = tasks.data?.hasMore ? "+" : "";

  const recentTasks = [...taskItems]
    .sort((a, b) => (Date.parse(b.lastUpdatedAt) || 0) - (Date.parse(a.lastUpdatedAt) || 0))
    .slice(0, 5);

  const cards = canViewAgentLabels
    ? [
        ...baseCards,
        {
          title: "Labels Automáticas",
          description: "Regras de rotulagem para segmentar tarefas por tags de agente.",
          to: "/automation/agent-labels",
          cta: "Abrir Labels",
          icon: "key" as MaterialSymbolName,
        },
      ]
    : baseCards;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Automação"
          description="Gerencie scripts, tarefas e operações de execução no ambiente."
        />
        <div className="flex flex-wrap gap-2">
          {canCreateAutomation && (
            <>
              <Link to="/automation/scripts/new">
                <Button size="sm" variant="secondary">
                  <Icon name="add" className="h-4 w-4" /> Novo script
                </Button>
              </Link>
              <Link to="/automation/tasks?new=1">
                <Button size="sm" variant="secondary">
                  <Icon name="add" className="h-4 w-4" /> Nova tarefa
                </Button>
              </Link>
            </>
          )}
          {canExecuteAutomation && (
            <Link to="/automation/operations">
              <Button size="sm">
                <Icon name="play_arrow" className="h-4 w-4" /> Executar agora
              </Button>
            </Link>
          )}
        </div>
      </div>

      <AutomationSubnav />

      {(scripts.isError || tasks.isError) && (
        <ErrorDisplay
          onRetry={() => {
            void scripts.refetch();
            void tasks.refetch();
          }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/automation/scripts" className="block transition-transform hover:-translate-y-0.5">
          <StatCard
            icon="build"
            label="Scripts ativos"
            value={
              scripts.isLoading
                ? "…"
                : scripts.isError
                  ? "-"
                  : `${activeScripts}/${scriptItems.length}${scriptsSuffix}`
            }
            tone="primary"
          />
        </Link>
        <Link
          to="/automation/tasks?status=active"
          className="block transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            icon="checklist"
            label="Tarefas ativas"
            value={
              tasks.isLoading
                ? "…"
                : tasks.isError
                  ? "-"
                  : `${activeTasks}/${taskItems.length}${tasksSuffix}`
            }
            tone="success"
          />
        </Link>
        <Link
          to="/automation/tasks?scopeType=0"
          className="block transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            icon="public"
            label="Tarefas globais"
            value={
              tasks.isLoading ? "…" : tasks.isError ? "-" : `${globalTasks}${tasksSuffix}`
            }
            tone="accent"
          />
        </Link>
        <Link
          to="/automation/tasks?status=inactive"
          className="block transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            icon="schedule"
            label="Tarefas inativas"
            value={
              tasks.isLoading ? "…" : tasks.isError ? "-" : `${inactiveTasks}${tasksSuffix}`
            }
            tone="warning"
          />
        </Link>
      </div>

      {!tasks.isLoading && !tasks.isError && recentTasks.length > 0 && (
        <Card>
          <CardHeader
            title="Tarefas atualizadas recentemente"
            subtitle="Últimas alterações cadastradas no ambiente"
            action={
              <Link to="/automation/tasks" className="text-xs text-primary hover:underline">
                Ver todas
              </Link>
            }
          />
          <div className="divide-y divide-border/60">
            {recentTasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted">
                    {actionDisplayLabel(t.actionType)} · Atualizado em{" "}
                    {formatDateTime(t.lastUpdatedAt)}
                  </p>
                </div>
                <Badge color={t.isActive ? "success" : "slate"}>
                  {t.isActive ? "Ativa" : "Inativa"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.to}>
            <CardHeader
              title={card.title}
              subtitle={card.description}
              action={<Icon name={card.icon} className="h-4 w-4 text-muted" />}
            />
            <Link to={card.to}>
              <Button size="sm">{card.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

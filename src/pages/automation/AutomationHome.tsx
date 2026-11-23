import { Link } from "react-router-dom";
import { Icon, Button, Card, CardHeader, StatCard, type MaterialSymbolName, PageHeader } from "@/components/ui";
import { useAuthorization } from "@/auth/authorization";
import { useAutomationScripts, useAutomationTasks } from "@/hooks/useAutomation";
import { AutomationSubnav } from "./AutomationSubnav";

const baseCards: { title: string; description: string; to: string; cta: string; icon: MaterialSymbolName }[] = [
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
  const { canCreateAutomation, hasAnyPermission } = useAuthorization();
  const canViewAgentLabels = hasAnyPermission(["agents.*", "agents.view", "Agents.View", "admin.*"]);

  const scripts = useAutomationScripts({ activeOnly: false, limit: 200 });
  const tasks = useAutomationTasks({ activeOnly: false, limit: 200 });

  const scriptItems = scripts.data?.items ?? [];
  const activeScripts = scriptItems.filter((s) => s.isActive).length;
  const taskItems = tasks.data?.items ?? [];
  const activeTasks = taskItems.filter((t) => t.isActive).length;
  const globalTasks = taskItems.filter((t) => t.scopeType === "Global" || t.scopeType === 0).length;

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
        <PageHeader title="Automação" description="Gerencie scripts, tarefas e operações de execução no ambiente." />
        <div className="flex flex-wrap gap-2">
          {canCreateAutomation && (
            <Link to="/automation/scripts/new">
              <Button size="sm" variant="secondary">
                <Icon name="add" className="h-4 w-4" /> Novo script
              </Button>
            </Link>
          )}
          <Link to="/automation/operations">
            <Button size="sm">
              <Icon name="play_arrow" className="h-4 w-4" /> Executar agora
            </Button>
          </Link>
        </div>
      </div>

      <AutomationSubnav />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="build"
          label="Scripts ativos"
          value={scripts.isLoading ? "…" : `${activeScripts}/${scriptItems.length}`}
          tone="primary"
        />
        <StatCard
          icon="checklist"
          label="Tarefas ativas"
          value={tasks.isLoading ? "…" : `${activeTasks}/${taskItems.length}`}
          tone="success"
        />
        <StatCard
          icon="public"
          label="Tarefas globais"
          value={tasks.isLoading ? "…" : globalTasks}
          tone="accent"
        />
        <StatCard
          icon="schedule"
          label="Tarefas inativas"
          value={tasks.isLoading ? "…" : Math.max(0, taskItems.length - activeTasks)}
          tone="warning"
        />
      </div>

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

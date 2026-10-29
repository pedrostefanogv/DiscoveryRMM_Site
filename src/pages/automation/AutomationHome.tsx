import { Link } from "react-router-dom";

import { Icon, Button, Card, CardHeader, type MaterialSymbolName,

PageHeader,
} from "@/components/ui";

const cards: { title: string; description: string; to: string; cta: string; icon: MaterialSymbolName }[] = [
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
  return (
    <div className="space-y-6">
      <PageHeader title="Automação" description="Gerencie scripts, tarefas e operações de execução no ambiente." />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
                    return (
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
          );
        })}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Wrench, ListChecks, PlayCircle, History } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";

const cards = [
  {
    title: "Scripts",
    description: "Cadastro de scripts reutilizáveis e trilha de auditoria.",
    to: "/automation/scripts",
    cta: "Abrir Scripts",
    icon: Wrench,
  },
  {
    title: "Tarefas",
    description: "Regras de automação por escopo com validação condicional.",
    to: "/automation/tasks",
    cta: "Abrir Tarefas",
    icon: ListChecks,
  },
  {
    title: "Operações",
     description: "Run-now, force-sync e histórico de execução por agent.",
     to: "/automation/operations",
     cta: "Abrir Operações",
    icon: PlayCircle,
  },
  {
    title: "Auditoria",
    description: "Trilha de alterações de scripts e tarefas com snapshots.",
    to: "/automation/audit",
    cta: "Abrir Auditoria",
    icon: History,
  },
];

export default function AutomationHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automação</h1>
         <p className="text-sm text-muted">
           Gerencie scripts, tarefas e operações de execução no ambiente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.to}>
              <CardHeader
                title={card.title}
                subtitle={card.description}
                action={<Icon className="h-4 w-4 text-muted" />}
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

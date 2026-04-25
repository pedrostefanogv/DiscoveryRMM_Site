import { Link } from "react-router-dom";
import { Wrench, ListChecks, PlayCircle, History } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";

const cards = [
  {
    title: "Scripts",
    description: "Cadastro de scripts reutilizaveis e trilha de auditoria.",
    to: "/automation/scripts",
    cta: "Abrir Scripts",
    icon: Wrench,
  },
  {
    title: "Tarefas",
    description: "Regras de automacao por escopo com validacao condicional.",
    to: "/automation/tasks",
    cta: "Abrir Tarefas",
    icon: ListChecks,
  },
  {
    title: "Operacoes",
    description: "Run-now, force-sync e historico de execucao por agent.",
    to: "/automation/operations",
    cta: "Abrir Operacoes",
    icon: PlayCircle,
  },
  {
    title: "Auditoria",
    description: "Trilha de alteracoes de scripts e tarefas com snapshots.",
    to: "/automation/audit",
    cta: "Abrir Auditoria",
    icon: History,
  },
];

export default function AutomationHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Automacao</h1>
        <p className="text-sm text-slate-400">
          Gerencie scripts, tarefas e operacoes de execucao no ambiente.
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
                action={<Icon className="h-4 w-4 text-slate-400" />}
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

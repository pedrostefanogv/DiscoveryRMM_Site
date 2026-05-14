import { Link } from "react-router-dom";
import { Button, Card, CardHeader } from "@/components/ui";

const cards = [
  {
    title: "Configuração de Servidor",
     description: "Define os valores base para toda a hierarquia.",
     to: "/settings/server",
   },
   {
     title: "Configuração de Cliente",
     description: "Sobrescritas por cliente. Null herda do servidor.",
     to: "/settings/client",
   },
   {
     title: "Configuração de Site",
     description: "Sobrescritas por site. Null herda de cliente/servidor.",
     to: "/settings/site",
   },
   {
     title: "Configuração MeshCentral",
     description: "Perfil de policy herdável por escopo, status de drift e reconcile.",
     to: "/identity/mesh-central",
   },
   {
     title: "Auditoria de Configurações",
     description: "Histórico de alterações por entidade, campo e usuário.",
     to: "/settings/audit",
   },
   {
     title: "Labels Automáticas",
     description: "Cadastro e gerenciamento de regras de tags para agents.",
     to: "/settings/agent-labels",
  },
  {
    title: "Custom Fields",
    description: "Defina campos por escopo e gerencie valores por entidade.",
    to: "/settings/custom-fields",
  },
];

export default function ConfigurationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-slate-400">
          Gerencie Server, Client e Site com heranca Server -&gt; Client -&gt; Site.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.to}>
            <CardHeader title={card.title} subtitle={card.description} />
            <Link to={card.to}>
              <Button size="sm">Abrir</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

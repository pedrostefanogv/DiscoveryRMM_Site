import { Link } from "react-router-dom";
import { Button, Card, CardHeader } from "@/components/ui";

const cards = [
  {
    title: "Configuracao de Servidor",
    description: "Define os valores base para toda a hierarquia.",
    to: "/settings/server",
  },
  {
    title: "Configuracao de Cliente",
    description: "Sobrescritas por cliente. Null herda do servidor.",
    to: "/settings/client",
  },
  {
    title: "Configuracao de Site",
    description: "Sobrescritas por site. Null herda de cliente/servidor.",
    to: "/settings/site",
  },
  {
    title: "Auditoria de Configuracoes",
    description: "Historico de alteracoes por entidade, campo e usuario.",
    to: "/settings/audit",
  },
];

export default function ConfigurationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuracoes</h1>
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

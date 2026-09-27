import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  Layers,
  ListChecks,
  MapPin,
  Palette,
  ScrollText,
  Server,
  Tags,
  UploadCloud,
  Workflow,
} from "lucide-react";
import { Card } from "@/components/ui";

interface SettingsCard {
  title: string;
  description: string;
  to: string;
  icon: React.ReactNode;
}

interface SettingsGroup {
  title: string;
  description: string;
  cards: SettingsCard[];
}

const groups: SettingsGroup[] = [
  {
    title: "Hierarquia de configuração",
    description: "Herança Server → Client → Site. Valores em branco herdam do nível acima.",
    cards: [
      {
        title: "Configuração do Servidor",
        description: "Valores base para todos os clientes e sites.",
        to: "/settings/server",
        icon: <Server className="h-5 w-5" />,
      },
      {
        title: "Configuração de Cliente",
        description: "Sobrescritas por cliente. Nunca sobrescreve o que está bloqueado.",
        to: "/settings/client",
        icon: <Building2 className="h-5 w-5" />,
      },
      {
        title: "Configuração de Site",
        description: "Sobrescritas por site, herdando de cliente e servidor.",
        to: "/settings/site",
        icon: <MapPin className="h-5 w-5" />,
      },
      {
        title: "Configuração Efetiva",
        description: "Simulador de herança: valor efetivo e origem de cada campo.",
        to: "/settings/effective",
        icon: <Layers className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Operação de tickets",
    description: "Fluxos, notificações e classificação automática.",
    cards: [
      {
        title: "Workflow",
        description: "Estados, transições e regras do fluxo de atendimento.",
        to: "/settings/workflow",
        icon: <Workflow className="h-5 w-5" />,
      },
      {
        title: "Workflow Profiles",
        description: "Perfis de workflow por escopo, com SLA associado.",
        to: "/settings/workflow-profiles",
        icon: <ListChecks className="h-5 w-5" />,
      },
      {
        title: "Notificações",
        description: "Canais de notificação e eventos disparados.",
        to: "/settings/notifications",
        icon: <Bell className="h-5 w-5" />,
      },
      {
        title: "Labels Automáticas",
        description: "Regras de rotulagem automática aplicadas aos agentes.",
        to: "/settings/agent-labels",
        icon: <Tags className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Dados e governança",
    description: "Campos personalizados, atualizações e trilha de auditoria.",
    cards: [
      {
        title: "Campos Personalizados",
        description: "Defina campos por escopo e gerencie valores por entidade.",
        to: "/settings/custom-fields",
        icon: <BadgeCheck className="h-5 w-5" />,
      },
      {
        title: "Agent Updates",
        description: "Canais, rollout e janelas de atualização do agente.",
        to: "/settings/agent-updates",
        icon: <UploadCloud className="h-5 w-5" />,
      },
      {
        title: "Auditoria de Configurações",
        description: "Histórico de alterações por entidade, campo e usuário.",
        to: "/settings/audit",
        icon: <ScrollText className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Identidade visual",
    description: "Marca, cores e logo exibidos no painel e nos agentes.",
    cards: [
      {
        title: "Branding",
        description: "Nome da aplicação, logo e cores padrão.",
        to: "/settings/branding",
        icon: <Palette className="h-5 w-5" />,
      },
    ],
  },
];

export default function ConfigurationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted">
          Gerencie Server, Client e Site com herança Server → Client → Site.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </h2>
            <p className="text-xs text-muted">{group.description}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {group.cards.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Card className="h-full transition-colors group-hover:border-border-strong">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted-foreground">
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{card.description}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, Card, EmptyState, Input, PageHeader } from "@/components/ui";

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
        icon: <Icon name="dns" className="h-5 w-5" />,
      },
      {
        title: "Configuração de Cliente",
        description: "Sobrescritas por cliente. Nunca sobrescreve o que está bloqueado.",
        to: "/settings/client",
        icon: <Icon name="apartment" className="h-5 w-5" />,
      },
      {
        title: "Configuração de Site",
        description: "Sobrescritas por site, herdando de cliente e servidor.",
        to: "/settings/site",
        icon: <Icon name="location_on" className="h-5 w-5" />,
      },
      {
        title: "Configuração Efetiva",
        description: "Simulador de herança: valor efetivo e origem de cada campo.",
        to: "/settings/effective",
        icon: <Icon name="layers" className="h-5 w-5" />,
      },
      {
        title: "Autorização de Acesso Remoto",
        description: "Prompt de consentimento, timeout e overrides por usuário/grupo.",
        to: "/settings/remote-consent",
        icon: <Icon name="gpp_maybe" className="h-5 w-5" />,
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
        icon: <Icon name="schema" className="h-5 w-5" />,
      },
      {
        title: "Workflow Profiles",
        description: "Perfis de workflow por escopo, com SLA associado.",
        to: "/settings/workflow-profiles",
        icon: <Icon name="checklist" className="h-5 w-5" />,
      },
      {
        title: "Notificações",
        description: "Canais de notificação e eventos disparados.",
        to: "/settings/notifications",
        icon: <Icon name="notifications" className="h-5 w-5" />,
      },
      {
        title: "Labels Automáticas",
        description: "Regras de rotulagem automática aplicadas aos agentes.",
        to: "/settings/agent-labels",
        icon: <Icon name="sell" className="h-5 w-5" />,
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
        icon: <Icon name="verified" className="h-5 w-5" />,
      },
      {
        title: "Agent Updates",
        description: "Canais, rollout e janelas de atualização do agente.",
        to: "/settings/agent-updates",
        icon: <Icon name="cloud_upload" className="h-5 w-5" />,
      },
      {
        title: "Auditoria de Configurações",
        description: "Histórico de alterações por entidade, campo e usuário.",
        to: "/settings/audit",
        icon: <Icon name="article" className="h-5 w-5" />,
      },
      {
        title: "Manutenção do Banco de Dados",
        description: "Sanitização de inconsistências e reparos de dados.",
        to: "/settings/database-maintenance",
        icon: <Icon name="database" className="h-5 w-5" />,
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
        icon: <Icon name="palette" className="h-5 w-5" />,
      },
    ],
  },
];

export default function ConfigurationSettings() {
  const [query, setQuery] = useState("");

  // Busca rápida por título/descrição/grupo — 18 cards exigem filtro, não rolagem.
  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (text: string) => text.toLowerCase().includes(term);
    return groups
      .map((group) => ({
        ...group,
        cards: term
          ? group.cards.filter(
              (card) =>
                matches(card.title) ||
                matches(card.description) ||
                matches(group.title) ||
                matches(group.description),
            )
          : group.cards,
      }))
      .filter((group) => group.cards.length > 0);
  }, [query]);

  const totalResults = filteredGroups.reduce((total, group) => total + group.cards.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Hierarquia Server → Client → Site mais os módulos operacionais do ambiente."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-md">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar configuração (ex.: NATS, e-mail, auditoria)…"
            aria-label="Buscar configuração"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {query.trim() ? `${totalResults} de ${groups.reduce((t, g) => t + g.cards.length, 0)} itens` : "Todos os módulos"}
        </p>
        {query.trim() && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            limpar busca
          </button>
        )}
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma configuração encontrada"
          description={`Nada corresponde a "${query.trim()}". Tente outro termo (ex.: server, nats, workflow).`}
        />
      ) : (
        filteredGroups.map((group) => (
          <section key={group.title} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h2>
              <p className="text-xs text-muted">{group.description}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                      <Icon
                        name="arrow_forward"
                        className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

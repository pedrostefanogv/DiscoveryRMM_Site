import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, Badge, Card, EmptyState, Input, PageHeader, type MaterialSymbolName } from "@/components/ui";
import { tintedIcon } from "@/components/configuration";

interface SettingsCard {
  title: string;
  description: string;
  to: string;
  icon: MaterialSymbolName;
  tint: string;
  keywords: string[];
  badge?: string;
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
        description: "Valores base para todos os clientes e sites, NATS, S3, anexos e IA.",
        to: "/settings/server",
        icon: "dns",
        tint: tintedIcon.sky,
        keywords: ["server", "servidor", "nats", "s3", "minio", "rustfs", "storage", "anexos", "ia", "global", "locks"],
        badge: "Base",
      },
      {
        title: "Configuração por Escopo",
        description: "Unificado: sobrescritas por Cliente, Site e Simulador Efetivo mantendo o contexto.",
        to: "/settings/scope",
        icon: "layers",
        tint: tintedIcon.violet,
        keywords: ["cliente", "client", "site", "efetiva", "effective", "herança", "override", "simulador", "escopo"],
        badge: "Unificado",
      },
      {
        title: "Acesso Remoto",
        description: "Unificado: autorização de sessão, destinos do proxy (allowlist) e WebRTC (STUN/TURN).",
        to: "/settings/remote-access",
        icon: "devices",
        tint: tintedIcon.emerald,
        keywords: [
          "consentimento",
          "autorização",
          "remoto",
          "banner",
          "timeout",
          "desktop",
          "proxy",
          "túnel",
          "cidr",
          "porta",
          "allowlist",
          "rdp",
          "tcp",
          "webrtc",
          "p2p",
          "stun",
          "turn",
          "ice",
        ],
        badge: "Unificado",
      },
    ],
  },
  {
    title: "Automação",
    description: "Scripts, tarefas, operações e rotulagem automática dos agentes.",
    cards: [
      {
        title: "Visão Geral de Automação",
        description: "Painel inicial com execuções, filas e saúde da automação.",
        to: "/automation",
        icon: "build",
        tint: tintedIcon.amber,
        keywords: ["automação", "visão geral", "filas"],
      },
      {
        title: "Scripts",
        description: "Biblioteca de scripts disponíveis para execução nos agentes.",
        to: "/automation/scripts",
        icon: "code",
        tint: tintedIcon.sky,
        keywords: ["scripts", "powershell", "bash", "python"],
      },
      {
        title: "Tarefas",
        description: "Tarefas agendadas e execuções sob demanda.",
        to: "/automation/tasks",
        icon: "play_circle",
        tint: tintedIcon.emerald,
        keywords: ["tarefas", "agendamento", "cron"],
      },
      {
        title: "Operações",
        description: "Histórico e acompanhamento das operações executadas.",
        to: "/automation/operations",
        icon: "rocket_launch",
        tint: tintedIcon.violet,
        keywords: ["operações", "execuções", "histórico"],
      },
      {
        title: "Auditoria de Automação",
        description: "Trilha de auditoria das execuções e alterações de automação.",
        to: "/automation/audit",
        icon: "fact_check",
        tint: tintedIcon.cyan,
        keywords: ["auditoria", "trilha", "automação"],
      },
      {
        title: "Labels Automáticas",
        description: "Regras de rotulagem automática aplicadas aos agentes.",
        to: "/automation/agent-labels",
        icon: "sell",
        tint: tintedIcon.blue,
        keywords: ["labels", "tags", "etiquetas", "agentes"],
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
        icon: "schema",
        tint: tintedIcon.violet,
        keywords: ["workflow", "estados", "transições", "kanban"],
      },
      {
        title: "Workflow Profiles",
        description: "Perfis de workflow por escopo, com SLA associado.",
        to: "/settings/workflow-profiles",
        icon: "checklist",
        tint: tintedIcon.sky,
        keywords: ["workflow", "perfis", "sla"],
      },
      {
        title: "Notificações",
        description: "Canais de notificação, e-mail SMTP, webhooks e eventos disparados.",
        to: "/settings/notifications",
        icon: "notifications",
        tint: tintedIcon.amber,
        keywords: ["notificações", "e-mail", "email", "smtp", "webhook", "canais"],
      },
    ],
  },
  {
    title: "Dados e governança",
    description: "IA, campos personalizados, atualizações e trilha de auditoria.",
    cards: [
      {
        title: "Ferramentas de IA (MCP)",
        description: "Governança, rate limit, timeout e bloqueio de tools MCP por escopo.",
        to: "/settings/mcp-tools",
        icon: "smart_toy",
        tint: tintedIcon.violet,
        keywords: ["mcp", "ia", "ai", "tools", "ferramentas", "llm"],
      },
      {
        title: "Cockpit de Custo IA",
        description: "Consumo de tokens, custos por modelo/provedor e tendências de uso.",
        to: "/settings/ai-cost",
        icon: "paid",
        tint: tintedIcon.emerald,
        keywords: ["ia", "ai", "custo", "tokens", "llm", "openrouter", "openai"],
      },
      {
        title: "Campos Personalizados",
        description: "Defina campos por escopo e gerencie valores por entidade.",
        to: "/settings/custom-fields",
        icon: "verified",
        tint: tintedIcon.sky,
        keywords: ["campos", "custom fields", "formulários"],
      },
      {
        title: "Agent Updates",
        description: "Canais, rollout e janelas de atualização do agente.",
        to: "/settings/agent-updates",
        icon: "cloud_upload",
        tint: tintedIcon.cyan,
        keywords: ["update", "atualização", "agente", "versão", "rollout"],
      },
      {
        title: "Auditoria de Configurações",
        description: "Histórico de alterações por entidade, campo e usuário.",
        to: "/settings/audit",
        icon: "article",
        tint: tintedIcon.blue,
        keywords: ["auditoria", "histórico", "diff", "alterações"],
      },
      {
        title: "Manutenção do Banco de Dados",
        description: "Sanitização de inconsistências e reparos de dados.",
        to: "/settings/database-maintenance",
        icon: "database",
        tint: tintedIcon.red,
        keywords: ["banco", "database", "sanitização", "limpeza", "reparo"],
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
        icon: "palette",
        tint: tintedIcon.amber,
        keywords: ["branding", "marca", "logo", "cores", "tema", "white label"],
      },
    ],
  },
];

const TOTAL_CARDS = groups.reduce((total, group) => total + group.cards.length, 0);

export default function ConfigurationSettings() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (text: string) => text.toLowerCase().includes(term);

    return groups
      .filter((group) => selectedCategory === "all" || group.title === selectedCategory)
      .map((group) => ({
        ...group,
        cards: term
          ? group.cards.filter(
              (card) =>
                matches(card.title) ||
                matches(card.description) ||
                matches(group.title) ||
                matches(group.description) ||
                card.keywords.some((kw) => matches(kw)),
            )
          : group.cards,
      }))
      .filter((group) => group.cards.length > 0);
  }, [query, selectedCategory]);

  const totalResults = filteredGroups.reduce((total, group) => total + group.cards.length, 0);
  const isFiltering = Boolean(query.trim()) || selectedCategory !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Hierarquia Server → Client → Site mais os módulos operacionais do ambiente."
      />

      {/* Busca + Filtro por categoria */}
      <Card padding={false} className="p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1 sm:max-w-md">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar configuração (ex.: NATS, e-mail, IA, auditoria)…"
              aria-label="Buscar configuração"
              className="pl-9 pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar campo de busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <p className="text-xs text-muted tabular-nums" aria-live="polite">
            {query.trim()
              ? `${totalResults} de ${TOTAL_CARDS} itens`
              : `${totalResults} módulos disponíveis`}
          </p>

          {query.trim() && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              limpar busca
            </button>
          )}
        </div>

        {/* Pills de categoria em linha única horizontal */}
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            aria-pressed={selectedCategory === "all"}
            onClick={() => setSelectedCategory("all")}
            className={`flex-none rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === "all"
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            Todos ({TOTAL_CARDS})
          </button>
          {groups.map((group) => {
            const active = selectedCategory === group.title;
            return (
              <button
                key={group.title}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedCategory(active ? "all" : group.title)}
                className={`flex-none rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground"
                }`}
              >
                {group.title} ({group.cards.length})
              </button>
            );
          })}
        </div>
      </Card>

      {/* Guia visual da cascata de herança (visível sem filtro ativo) */}
      {!isFiltering && (
        <Card className="border-primary/20 bg-surface/95">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Fluxo de herança do sistema
              </p>
              <p className="text-sm text-muted-foreground">
                Defina os padrões globais no Servidor e sobrescreva apenas o necessário por Cliente ou Site.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                to="/settings/server"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-light px-3 py-2 font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-hover"
              >
                <Icon name="dns" className="h-4 w-4 text-primary" />
                1. Servidor
              </Link>
              <Icon name="arrow_forward" className="h-3.5 w-3.5 text-muted" />
              <Link
                to="/settings/scope"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-light px-3 py-2 font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-hover"
              >
                <Icon name="layers" className="h-4 w-4 text-accent" />
                2. Cliente / Site / Efetiva
              </Link>
            </div>
          </div>
        </Card>
      )}

      {filteredGroups.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma configuração encontrada"
          description={`Nada corresponde a "${query.trim()}". Tente outro termo (ex.: server, nats, workflow).`}
        />
      ) : (
        filteredGroups.map((group) => (
          <section key={group.title} className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h2>
                <p className="text-xs text-muted">{group.description}</p>
              </div>
              <span className="text-xs tabular-nums text-muted">{group.cards.length}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.cards.map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Card className="glass-card-interactive h-full transition-all group-hover:border-border-strong">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}
                      >
                        <Icon name={card.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                            {card.title}
                          </p>
                          {card.badge && (
                            <Badge color={card.badge === "Unificado" ? "primary" : "slate"}>
                              {card.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {card.description}
                        </p>
                      </div>
                      <Icon
                        name="arrow_forward"
                        className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
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

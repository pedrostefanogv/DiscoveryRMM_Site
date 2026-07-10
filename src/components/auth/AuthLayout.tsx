import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTheme } from "@/theme/ThemeContext";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { ParticlesBackground } from "@/components/ui/ParticlesBackground";

const authCardsOptions: string[][] = [
  [
    "Monitoramento de agentes e dispositivos em tempo real",
    "Dashboard operacional com alertas e status dos agentes",
    "Gestão centralizada de clientes, sites e agentes de TI",
  ],
  [
    "Tickets, alertas e SLA integrados ao service desk",
    "Gestão de tickets com SLA, fluxos e atribuições",
    "Abertura e acompanhamento de chamados com SLA e escalonamento",
  ],
  [
    "Automação de scripts e tarefas para toda a infraestrutura",
    "Scripts, tarefas agendadas e operações automatizadas",
    "Execução remota de scripts e automações por agente",
  ],
  [
    "Inventário de software, relatórios e tokens de deploy",
    "Relatórios, knowledge base e inventário unificados",
    "Gestão de identidade, permissões e trilha de auditoria",
  ],
];

function pickRandomOption(options: string[]) {
  return options[Math.floor(Math.random() * options.length)];
}

export function AuthLayout() {
  const { branding } = useTheme();
  const authCards = useMemo(() => authCardsOptions.map(pickRandomOption), []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <ParticlesBackground />
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.18),transparent_36%)]" />
      
      {/* Theme toggle — fixed top-right */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-[2] mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-border bg-surface-light px-4 py-2 text-sm text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Portal de operações de TI
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
              {branding.appName}
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground lg:text-lg">
              Sessão segura com primeiro acesso guiado e verificação em duas etapas quando necessário.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            {authCards.map((cardText, index) => (
              <div key={index} className="rounded-2xl border border-border bg-surface-light p-4">
                {cardText}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-lg">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
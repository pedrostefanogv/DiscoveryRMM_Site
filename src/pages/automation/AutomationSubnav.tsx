import { NavLink, useInRouterContext } from "react-router-dom";
import { Icon, type MaterialSymbolName } from "@/components/ui";
import { useAuthorization } from "@/auth/authorization";

interface SubnavItem {
  to: string;
  label: string;
  icon: MaterialSymbolName;
  end?: boolean;
}

const BASE_ITEMS: SubnavItem[] = [
  { to: "/automation", label: "Visão Geral", icon: "dashboard", end: true },
  { to: "/automation/scripts", label: "Scripts", icon: "build" },
  { to: "/automation/tasks", label: "Tarefas", icon: "checklist" },
  { to: "/automation/operations", label: "Operações", icon: "play_circle" },
  { to: "/automation/audit", label: "Auditoria", icon: "history" },
];

/**
 * Barra de navegação contextual entre as áreas do módulo de Automação.
 * Usa `useInRouterContext` para não quebrar testes unitários que montam
 * páginas isoladas sem Router.
 */
export function AutomationSubnav() {
  const inRouter = useInRouterContext();
  const { hasAnyPermission } = useAuthorization();

  if (!inRouter) return null;

  const canViewAgentLabels = hasAnyPermission([
    "agents.*",
    "agents.view",
    "Agents.View",
    "admin.*",
  ]);

  const items: SubnavItem[] = canViewAgentLabels
    ? [
        ...BASE_ITEMS,
        { to: "/automation/agent-labels", label: "Labels Automáticas", icon: "key" },
      ]
    : BASE_ITEMS;

  return (
    <nav
      aria-label="Navegação de automação"
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface/60 p-1.5"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary/20 text-primary-100 border border-primary/40"
                : "text-muted hover:bg-surface-hover hover:text-foreground border border-transparent"
            }`
          }
        >
          <Icon name={item.icon} className="h-3.5 w-3.5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

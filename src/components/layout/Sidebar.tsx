import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Monitor,
  Ticket,
  ScrollText,
  KeyRound,
  AppWindow,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  Wrench,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthorization } from '@/auth/authorization';

const mainLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Monitor, label: 'Agentes' },
  { to: '/tickets', icon: Ticket, label: 'Suporte' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/deploy', icon: KeyRound, label: 'Deploy' },
];

const clientLinks = [
  { to: '/clients', label: 'Clientes' },
  { to: '/sites', label: 'Sites' },
];

const softwareLinks = [
  { to: '/software/inventory', label: 'Inventário Detalhado' },
  { to: '/automation', label: 'Automação' },
  { to: '/software/store', label: 'Loja de aplicativos' },
];

const automationLinks = [
  { to: '/automation', label: 'Visão Geral' },
  { to: '/automation/scripts', label: 'Scripts' },
  { to: '/automation/tasks', label: 'Tarefas' },
  { to: '/automation/operations', label: 'Operações' },
  { to: '/automation/audit', label: 'Auditoria' },
  { to: '/settings/agent-labels', label: 'Labels Automáticas' },
];

const reportsLinks = [
  { to: '/reports/templates', label: 'Templates' },
  { to: '/reports/executions', label: 'Execuções' },
];

const ticketsLinks = [
  { to: '/tickets', label: 'Chamados' },
  { to: '/knowledge', label: 'Conhecimento' },
  { to: '/tickets/alerts', label: 'Alertas' },
  { to: '/tickets/sla', label: 'SLA, Calendários e Perfis' },
  { to: '/tickets/departments', label: 'Departamentos' },
  { to: '/settings/workflow-profiles', label: 'Workflow Profiles' },
];

const settingsLinks = [
  { to: '/settings', label: 'Geral' },
  { to: '/settings/workflow', label: 'Workflow' },
  { to: '/settings/audit', label: 'Auditoria Config' },
  { to: '/settings/custom-fields', label: 'Campos Personalizados' },
  { to: '/settings/branding', label: 'Branding' },
];

const identityLinks = [
  { to: '/identity/authentication', label: 'Perfil e Segurança' },
  { to: '/identity/users', label: 'Usuários e Acesso' },
  { to: '/identity/groups', label: 'Grupos de Usuários' },
  { to: '/identity/roles', label: 'Roles e Permissões' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isDesktop: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

type SidebarAccordionSection =
  | 'clients'
  | 'tickets'
  | 'software'
  | 'automation'
  | 'reports'
  | 'identity'
  | 'settings';

function submenuAnimationClass(isOpen: boolean): string {
  return [
    'overflow-hidden transition-[max-height,opacity,transform] duration-200 ease-out',
    isOpen ? 'max-h-96 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-1 pointer-events-none',
  ].join(' ');
}

function chevronAnimationClass(isOpen: boolean): string {
  return `h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`;
}

export function Sidebar({ collapsed, onToggle, isDesktop, mobileOpen, onCloseMobile }: SidebarProps) {
  const { branding } = useTheme();
  const {
    canManageIdentity,
    canViewAutomation,
    canViewDeploy,
    canViewReports,
    canViewSettings,
    canViewSoftware,
    hasAnyPermission,
  } = useAuthorization();
  const location = useLocation();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  // Quando colapsado no desktop e o mouse está sobre a sidebar, expande visualmente
  const effectiveCollapsed = collapsed && (!hovered || !isDesktop);
  const clientsIsActive =
    location.pathname.startsWith('/clients') || location.pathname.startsWith('/sites');
  const softwareIsActive = location.pathname.startsWith('/software') || location.pathname === '/software-inventory';
  const automationIsActive =
    location.pathname.startsWith('/automation') || location.pathname.startsWith('/settings/agent-labels');
  const reportsIsActive = location.pathname.startsWith('/reports');
  const ticketsIsActive =
    location.pathname.startsWith('/tickets') || location.pathname.startsWith('/knowledge');
  const settingsIsActive = location.pathname.startsWith('/settings');
  const identityIsActive = location.pathname.startsWith('/identity');

  // BUG-12: resolveActiveSection memoizado para evitar recriação a cada render
  const activeSection = useMemo((): SidebarAccordionSection | null => {
    if (clientsIsActive) return 'clients';
    if (ticketsIsActive) return 'tickets';
    if (softwareIsActive) return 'software';
    if (automationIsActive) return 'automation';
    if (reportsIsActive) return 'reports';
    if (identityIsActive) return 'identity';
    if (settingsIsActive) return 'settings';
    return null;
  }, [clientsIsActive, ticketsIsActive, softwareIsActive, automationIsActive, reportsIsActive, identityIsActive, settingsIsActive]);

  const [openSection, setOpenSection] = useState<SidebarAccordionSection | null>(() =>
    activeSection,
  );

  const clientsOpen = openSection === 'clients';
  const ticketsOpen = openSection === 'tickets';
  const softwareOpen = openSection === 'software';
  const automationOpen = openSection === 'automation';
  const reportsOpen = openSection === 'reports';
  const identityOpen = openSection === 'identity';
  const settingsOpen = openSection === 'settings';

  const visibleIdentityLinks = canManageIdentity ? identityLinks : identityLinks.slice(0, 1);
  const canViewAgentLabels = hasAnyPermission(['settings.*', 'settings.read', 'admin.*']);
  const canViewAutomationMenu = canViewAutomation || canViewAgentLabels;
  const visibleAutomationLinks = canViewAgentLabels
    ? automationLinks
    : automationLinks.filter(({ to }) => to !== '/settings/agent-labels');
  const canViewDepartments = hasAnyPermission(['departments.*', 'settings.*', 'settings.read', 'admin.*']);
  const canViewWorkflowProfiles = hasAnyPermission(['workflow-profiles.*', 'settings.*', 'settings.read', 'admin.*']);
  let visibleTicketsLinks = canViewDepartments
    ? ticketsLinks
    : ticketsLinks.filter(({ to }) => to !== '/tickets/departments');
  visibleTicketsLinks = canViewWorkflowProfiles
    ? visibleTicketsLinks
    : visibleTicketsLinks.filter(({ to }) => to !== '/settings/workflow-profiles');
  const visibleMainLinks = mainLinks
    .slice(1)
    .filter(({ to }) => (to === '/deploy' ? canViewDeploy : to !== '/tickets'));

  useEffect(() => {
    if (!isDesktop) onCloseMobile();
  }, [location.pathname, isDesktop, onCloseMobile]);

  useEffect(() => {
    if (activeSection) {
      setOpenSection(activeSection);
    }
  }, [
    clientsIsActive,
    ticketsIsActive,
    softwareIsActive,
    automationIsActive,
    reportsIsActive,
    identityIsActive,
    settingsIsActive,
  ]);

  const expandedWidthClass = effectiveCollapsed ? 'lg:w-16' : 'lg:w-60';
  const mobileVisibleClass = mobileOpen ? 'translate-x-0' : '-translate-x-full';

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`sidebar-transition fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-border bg-sidebar/95 shadow-2xl backdrop-blur-xl ${
        isDesktop ? `translate-x-0 ${expandedWidthClass}` : mobileVisibleClass
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="h-8 w-8 rounded" />
        ) : (
          <img src="/icon.ico" alt="Discovery RMM" className="h-8 w-8 rounded" />
        )}
        {!effectiveCollapsed && (
          <span className="text-lg font-bold text-foreground truncate">
            {branding.appName}
          </span>
        )}
      </div>

      {/* Nav Links */}
      <nav className="mt-2 flex-1 space-y-1 px-2 overflow-y-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-surface-hover text-foreground'
                : 'text-muted hover:bg-surface-light hover:text-foreground'
            }`
          }
        >
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          {!effectiveCollapsed && <span className="truncate">Dashboard</span>}
        </NavLink>

        <button
          type="button"
          onClick={() => {
            if (effectiveCollapsed) {
              navigate('/clients');
              return;
            }
            setOpenSection((prev) => (prev === 'clients' ? null : 'clients'));
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            clientsIsActive
              ? 'bg-surface-hover text-foreground'
              : 'text-muted hover:bg-surface-light hover:text-foreground'
          }`}
          aria-label="Abrir submenu de clientes"
        >
          <Users className="h-5 w-5 shrink-0" />
          {!effectiveCollapsed && (
            <>
              <span className="truncate">Clientes</span>
              <span className="ml-auto">
                <ChevronDown className={chevronAnimationClass(clientsOpen)} />
              </span>
            </>
          )}
        </button>

        {!effectiveCollapsed && (
          <div className={submenuAnimationClass(clientsOpen)} aria-hidden={!clientsOpen}>
            <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
              {clientLinks.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/clients'}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-hover text-foreground'
                        : 'text-muted hover:bg-surface-light hover:text-foreground'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {visibleMainLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!effectiveCollapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => {
            if (effectiveCollapsed) {
              navigate('/tickets');
              return;
            }
            setOpenSection((prev) => (prev === 'tickets' ? null : 'tickets'));
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            ticketsIsActive
              ? 'bg-surface-hover text-foreground'
              : 'text-muted hover:bg-surface-light hover:text-foreground'
          }`}
          aria-label="Abrir submenu de suporte"
        >
          <Ticket className="h-5 w-5 shrink-0" />
          {!effectiveCollapsed && (
            <>
              <span className="truncate">Suporte</span>
              <span className="ml-auto">
                <ChevronDown className={chevronAnimationClass(ticketsOpen)} />
              </span>
            </>
          )}
        </button>

        {!effectiveCollapsed && (
          <div className={submenuAnimationClass(ticketsOpen)} aria-hidden={!ticketsOpen}>
            <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
              {visibleTicketsLinks.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/tickets'}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-hover text-foreground'
                        : 'text-muted hover:bg-surface-light hover:text-foreground'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {canViewSoftware && (
          <>
            <button
              type="button"
              onClick={() => {
                if (effectiveCollapsed) {
                  navigate('/software');
                  return;
                }
                setOpenSection((prev) => (prev === 'software' ? null : 'software'));
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                softwareIsActive
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              }`}
              aria-label="Abrir submenu de softwares"
            >
              <AppWindow className="h-5 w-5 shrink-0" />
              {!effectiveCollapsed && (
                <>
                  <span className="truncate">Softwares</span>
                  <span className="ml-auto">
                    <ChevronDown className={chevronAnimationClass(softwareOpen)} />
                  </span>
                </>
              )}
            </button>

            {!effectiveCollapsed && (
              <div className={submenuAnimationClass(softwareOpen)} aria-hidden={!softwareOpen}>
                <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
                  {softwareLinks.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-surface-hover text-foreground'
                            : 'text-muted hover:bg-surface-light hover:text-foreground'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {canViewAutomationMenu && (
          <>
            <button
              type="button"
              onClick={() => {
                if (effectiveCollapsed) {
                  navigate(visibleAutomationLinks[0]?.to ?? '/automation');
                  return;
                }
                setOpenSection((prev) => (prev === 'automation' ? null : 'automation'));
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                automationIsActive
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              }`}
              aria-label="Abrir submenu de automação"
            >
              <Wrench className="h-5 w-5 shrink-0" />
              {!effectiveCollapsed && (
                <>
                  <span className="truncate">Automação</span>
                  <span className="ml-auto">
                    <ChevronDown className={chevronAnimationClass(automationOpen)} />
                  </span>
                </>
              )}
            </button>

            {!effectiveCollapsed && (
              <div className={submenuAnimationClass(automationOpen)} aria-hidden={!automationOpen}>
                <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
                  {visibleAutomationLinks.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/automation'}
                      className={({ isActive }) =>
                        `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-surface-hover text-foreground'
                            : 'text-muted hover:bg-surface-light hover:text-foreground'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {canViewReports && (
          <>
            <button
              type="button"
              onClick={() => {
                if (effectiveCollapsed) {
                  navigate('/reports/templates');
                  return;
                }
                setOpenSection((prev) => (prev === 'reports' ? null : 'reports'));
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                reportsIsActive
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              }`}
              aria-label="Abrir submenu de relatórios"
            >
              <FileBarChart className="h-5 w-5 shrink-0" />
              {!effectiveCollapsed && (
                <>
                  <span className="truncate">Relatórios</span>
                  <span className="ml-auto">
                    <ChevronDown className={chevronAnimationClass(reportsOpen)} />
                  </span>
                </>
              )}
            </button>

            {!effectiveCollapsed && (
              <div className={submenuAnimationClass(reportsOpen)} aria-hidden={!reportsOpen}>
                <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
                  {reportsLinks.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-surface-hover text-foreground'
                            : 'text-muted hover:bg-surface-light hover:text-foreground'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => {
            if (effectiveCollapsed) {
              navigate('/identity/authentication');
              return;
            }
            setOpenSection((prev) => (prev === 'identity' ? null : 'identity'));
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            identityIsActive
              ? 'bg-surface-hover text-foreground'
              : 'text-muted hover:bg-surface-light hover:text-foreground'
          }`}
          aria-label="Abrir submenu de identidade"
        >
          <ShieldCheck className="h-5 w-5 shrink-0" />
          {!effectiveCollapsed && (
            <>
              <span className="truncate">Identidade</span>
              <span className="ml-auto">
                <ChevronDown className={chevronAnimationClass(identityOpen)} />
              </span>
            </>
          )}
        </button>

        {!effectiveCollapsed && (
          <div className={submenuAnimationClass(identityOpen)} aria-hidden={!identityOpen}>
            <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
              {visibleIdentityLinks.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-hover text-foreground'
                        : 'text-muted hover:bg-surface-light hover:text-foreground'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {canViewSettings && (
          <>
            <button
              type="button"
              onClick={() => {
                if (effectiveCollapsed) {
                  navigate('/settings');
                  return;
                }
                setOpenSection((prev) => (prev === 'settings' ? null : 'settings'));
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                settingsIsActive
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted hover:bg-surface-light hover:text-foreground'
              }`}
              aria-label="Abrir submenu de configurações"
            >
              <Settings className="h-5 w-5 shrink-0" />
              {!effectiveCollapsed && (
                <>
                  <span className="truncate">Configurações</span>
                  <span className="ml-auto">
                    <ChevronDown className={chevronAnimationClass(settingsOpen)} />
                  </span>
                </>
              )}
            </button>

            {!effectiveCollapsed && (
              <div className={submenuAnimationClass(settingsOpen)} aria-hidden={!settingsOpen}>
                <div className="ml-8 space-y-1 border-l border-border pl-3 pb-1">
                  {settingsLinks.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/settings'}
                      className={({ isActive }) =>
                        `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-surface-hover text-foreground'
                            : 'text-muted hover:bg-surface-light hover:text-foreground'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="hidden border-t border-border lg:block">
        <button
          onClick={onToggle}
          className="flex h-11 w-full items-center justify-center gap-2 text-xs font-medium text-muted transition-colors hover:bg-surface-light hover:text-muted-foreground"
          aria-label={effectiveCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {effectiveCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!effectiveCollapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}
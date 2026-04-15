import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Monitor,
  Ticket,
  ScrollText,
  KeyRound,
  AppWindow,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  FileBarChart,
  Wrench,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthorization } from '@/auth/authorization';

const mainLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Monitor, label: 'Agentes' },
  { to: '/tickets', icon: Ticket, label: 'Chamados' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/deploy', icon: KeyRound, label: 'Deploy' },
  { to: '/knowledge', icon: BookOpen, label: 'Conhecimento' },
];

const clientLinks = [
  { to: '/clients', label: 'Clientes' },
  { to: '/sites', label: 'Sites' },
];

const softwareLinks = [
  { to: '/software/inventory', label: 'Inventário Detalhado' },
  { to: '/automation', label: 'Automação' },
  { to: '/software/store', label: 'Store' },
];

const automationLinks = [
  { to: '/automation', label: 'Visão Geral' },
  { to: '/automation/scripts', label: 'Scripts' },
  { to: '/automation/tasks', label: 'Tarefas' },
  { to: '/automation/operations', label: 'Operações' },
  { to: '/automation/audit', label: 'Auditoria' },
  { to: '/settings/agent-labels', label: 'Labels Automaticas' },
];

const reportsLinks = [
  { to: '/reports/templates', label: 'Templates' },
  { to: '/reports/executions', label: 'Execuções' },
];

const ticketsLinks = [
  { to: '/tickets', label: 'Chamados' },
  { to: '/settings/departments', label: 'Departamentos' },
];

const settingsLinks = [
  { to: '/settings', label: 'Geral' },
  { to: '/settings/workflow', label: 'Workflow' },
  { to: '/settings/workflow-profiles', label: 'SLA e Perfis' },
  { to: '/settings/audit', label: 'Auditoria Config' },
  { to: '/settings/custom-fields', label: 'Custom Fields' },
  { to: '/settings/branding', label: 'Branding' },
];

const identityLinks = [
  { to: '/identity/authentication', label: 'Perfil e Segurança' },
  { to: '/identity/users', label: 'Usuários e Acesso' },
  { to: '/identity/groups', label: 'Grupos de Usuários' },
  { to: '/identity/roles', label: 'Roles e Permissões' },
  { to: '/identity/mesh-profiles', label: 'Perfis Mesh' },
  { to: '/identity/mesh-central', label: 'Config MeshCentral' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
  const clientsIsActive =
    location.pathname.startsWith('/clients') || location.pathname.startsWith('/sites');
  const softwareIsActive = location.pathname.startsWith('/software') || location.pathname === '/software-inventory';
  const automationIsActive =
    location.pathname.startsWith('/automation') || location.pathname.startsWith('/settings/agent-labels');
  const reportsIsActive = location.pathname.startsWith('/reports');
  const ticketsIsActive =
    location.pathname.startsWith('/tickets') || location.pathname.startsWith('/settings/departments');
  const settingsIsActive = location.pathname.startsWith('/settings');
  const identityIsActive = location.pathname.startsWith('/identity');
  const [clientsOpen, setClientsOpen] = useState(clientsIsActive);
  const [softwareOpen, setSoftwareOpen] = useState(softwareIsActive);
  const [automationOpen, setAutomationOpen] = useState(automationIsActive);
  const [reportsOpen, setReportsOpen] = useState(reportsIsActive);
  const [ticketsOpen, setTicketsOpen] = useState(ticketsIsActive);
  const [settingsOpen, setSettingsOpen] = useState(settingsIsActive);
  const [identityOpen, setIdentityOpen] = useState(identityIsActive);
  const visibleIdentityLinks = canManageIdentity ? identityLinks : identityLinks.slice(0, 1);
  const canViewAgentLabels = hasAnyPermission(['settings.*', 'settings.read', 'admin.*']);
  const canViewAutomationMenu = canViewAutomation || canViewAgentLabels;
  const visibleAutomationLinks = canViewAgentLabels
    ? automationLinks
    : automationLinks.filter(({ to }) => to !== '/settings/agent-labels');
  const canViewDepartments = hasAnyPermission(['departments.*', 'settings.*', 'settings.read', 'admin.*']);
  const visibleTicketsLinks = canViewDepartments
    ? ticketsLinks
    : ticketsLinks.filter(({ to }) => to !== '/settings/departments');
  const visibleMainLinks = mainLinks
    .slice(1)
    .filter(({ to }) => (to === '/deploy' ? canViewDeploy : to !== '/tickets'));

  return (
    <aside
      className={`sidebar-transition fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-white/5 bg-sidebar ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="h-8 w-8 rounded" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <span className="text-lg font-bold text-white truncate">
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
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">Dashboard</span>}
        </NavLink>

        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              navigate('/clients');
              return;
            }
            setClientsOpen(prev => !prev);
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            clientsIsActive
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
          aria-label="Abrir submenu de clientes"
        >
          <Users className="h-5 w-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Clientes</span>
              <span className="ml-auto">
                {clientsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </>
          )}
        </button>

        {!collapsed && clientsOpen && (
          <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
            {clientLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/clients'}
                className={({ isActive }) =>
                  `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
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
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              navigate('/tickets');
              return;
            }
            setTicketsOpen(prev => !prev);
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            ticketsIsActive
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
          aria-label="Abrir submenu de tickets"
        >
          <Ticket className="h-5 w-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Tickets</span>
              <span className="ml-auto">
                {ticketsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </>
          )}
        </button>

        {!collapsed && ticketsOpen && (
          <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
            {visibleTicketsLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/tickets'}
                className={({ isActive }) =>
                  `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {canViewSoftware && (
          <>
            <button
              type="button"
              onClick={() => {
                if (collapsed) {
                  navigate('/software');
                  return;
                }
                setSoftwareOpen(prev => !prev);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                softwareIsActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-label="Abrir submenu de softwares"
            >
              <AppWindow className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">Softwares</span>
                  <span className="ml-auto">
                    {softwareOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </>
              )}
            </button>

            {!collapsed && softwareOpen && (
              <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
                {softwareLinks.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}

        {canViewAutomationMenu && (
          <>
            <button
              type="button"
              onClick={() => {
                if (collapsed) {
                  navigate(visibleAutomationLinks[0]?.to ?? '/automation');
                  return;
                }
                setAutomationOpen(prev => !prev);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                automationIsActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-label="Abrir submenu de automação"
            >
              <Wrench className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">Automação</span>
                  <span className="ml-auto">
                    {automationOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </>
              )}
            </button>

            {!collapsed && automationOpen && (
              <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
                {visibleAutomationLinks.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/automation'}
                    className={({ isActive }) =>
                      `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}

        {canViewReports && (
          <>
            <button
              type="button"
              onClick={() => {
                if (collapsed) {
                  navigate('/reports/templates');
                  return;
                }
                setReportsOpen(prev => !prev);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                reportsIsActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-label="Abrir submenu de relatórios"
            >
              <FileBarChart className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">Relatórios</span>
                  <span className="ml-auto">
                    {reportsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </>
              )}
            </button>

            {!collapsed && reportsOpen && (
              <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
                {reportsLinks.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              navigate('/identity/authentication');
              return;
            }
            setIdentityOpen(prev => !prev);
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            identityIsActive
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
          aria-label="Abrir submenu de identidade"
        >
          <ShieldCheck className="h-5 w-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">Identidade</span>
              <span className="ml-auto">
                {identityOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </>
          )}
        </button>

        {!collapsed && identityOpen && (
          <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
            {visibleIdentityLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {canViewSettings && (
          <>
            <button
              type="button"
              onClick={() => {
                if (collapsed) {
                  navigate('/settings');
                  return;
                }
                setSettingsOpen(prev => !prev);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                settingsIsActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-label="Abrir submenu de configurações"
            >
              <Settings className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate">Configurações</span>
                  <span className="ml-auto">
                    {settingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </>
              )}
            </button>

            {!collapsed && settingsOpen && (
              <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
                {settingsLinks.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/settings'}
                    className={({ isActive }) =>
                      `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex h-12 items-center justify-center border-t border-white/5 text-slate-400 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>
    </aside>
  );
}

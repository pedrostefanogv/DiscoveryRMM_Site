import { NavLink } from 'react-router-dom';
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
  Shield,
} from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/agents', icon: Monitor, label: 'Agentes' },
  { to: '/tickets', icon: Ticket, label: 'Chamados' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/deploy', icon: KeyRound, label: 'Deploy' },
  { to: '/software-inventory', icon: AppWindow, label: 'Softwares' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { branding } = useTheme();

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
        {links.map(({ to, icon: Icon, label }) => (
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

import { Bell, LogOut, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui';

export function Header() {
  const navigate = useNavigate();
  const { logout, session } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/5 bg-header px-6">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar agentes, clientes, chamados..."
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <div className="hidden text-right md:block">
          <p className="text-sm font-medium text-white">
            {session.stage === 'authenticated' ? 'Sessao autenticada' : 'Aguardando autenticacao'}
          </p>
          <p className="text-xs text-slate-400">
            {session.expiresAt ? `Expira em ${new Date(session.expiresAt).toLocaleTimeString('pt-BR')}` : 'Token temporario ou sessao sem expiracao local'}
          </p>
        </div>
        <button aria-label="Notificações" className="relative rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
        </button>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          A
        </div>
      </div>
    </header>
  );
}

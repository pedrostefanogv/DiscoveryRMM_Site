import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Search, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui';
import { useNowTick } from '@/hooks/useNowTick';
import { RealtimeConnectionStatus } from '@/components/RealtimeConnectionStatus';
import { NotificationBell } from '@/components/notifications/NotificationBell';

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function Header() {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const now = useNowTick(1_000);
  const expiresInText =
    session.expiresAt && session.stage === 'authenticated'
      ? formatCountdown(session.expiresAt - now)
      : null;

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

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
            {expiresInText ? `Expira em ${expiresInText}` : 'Token temporario ou sessao sem expiracao local'}
          </p>
        </div>
        <RealtimeConnectionStatus />
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <User className="h-4 w-4" /> Conta <ChevronDown className="h-4 w-4" />
          </Button>

          {menuOpen && (
            <div className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/identity/authentication');
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              >
                <User className="h-4 w-4" /> Meu perfil
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-200 transition-colors hover:bg-danger/20"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          )}
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">U</div>
      </div>
    </header>
  );
}

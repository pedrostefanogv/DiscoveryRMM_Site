import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, Search, User } from 'lucide-react';
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

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
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
    <header className="sticky top-0 z-20 border-b border-white/10 bg-header/90 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 lg:hidden"
            aria-label="Abrir menu lateral"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar agentes, clientes, chamados..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 xl:block">
            Sessão segura
          </div>
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium text-white">
              {session.stage === 'authenticated' ? 'Sessão autenticada' : 'Aguardando autenticação'}
            </p>
            <p className="text-xs text-slate-400">
              {expiresInText ? `Expira em ${expiresInText}` : 'Token temporário ou sessão sem expiração local'}
            </p>
          </div>
          <RealtimeConnectionStatus />
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
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
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white sm:flex">U</div>
        </div>
      </div>
    </header>
  );
}

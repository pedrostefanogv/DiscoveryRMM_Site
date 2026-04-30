import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Menu, Search, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useNowTick } from '@/hooks/useNowTick';
import { useMyProfile } from '@/hooks/useIdentity';
import { RealtimeConnectionStatus } from '@/components/RealtimeConnectionStatus';
import { NotificationBell } from '@/components/notifications/NotificationBell';

function computeInitials(source: string | undefined | null): string {
  if (!source) return 'U';
  const trimmed = source.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const { logout, session, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const now = useNowTick(1_000);
  const expiresInText =
    session.expiresAt && session.stage === 'authenticated'
      ? formatCountdown(session.expiresAt - now)
      : null;

  const profileQuery = useMyProfile();
  const profile = isAuthenticated ? profileQuery.data : undefined;
  const displayName = profile?.fullName || profile?.login || 'Usuário';
  const displayEmail = profile?.email ?? '';
  const initials = useMemo(
    () => computeInitials(profile?.fullName ?? profile?.login ?? null),
    [profile?.fullName, profile?.login],
  );

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
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              title={displayEmail ? `${displayName} · ${displayEmail}` : displayName}
              aria-label={`Conta de ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white ring-1 ring-white/10 transition hover:ring-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              {initials}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur"
              >
                <div className="flex items-center gap-3 border-b border-white/10 px-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{displayName}</p>
                    {displayEmail && (
                      <p className="truncate text-xs text-slate-400">{displayEmail}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
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
                  role="menuitem"
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
        </div>
      </div>
    </header>
  );
}

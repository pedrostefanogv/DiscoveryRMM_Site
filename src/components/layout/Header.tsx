import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Menu, Search, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useMyProfile } from '@/hooks/useIdentity';
import { useSearch } from '@/hooks/useSearch';
import { RealtimeConnectionStatus } from '@/components/RealtimeConnectionStatus';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SearchPalette } from '@/components/search/SearchPalette';
import { SessionCountdown } from '@/components/auth/SessionCountdown';
import { ThemeToggle } from '@/components/auth/ThemeToggle';

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

/** SHA-256 do e-mail (padrão do Gravatar) em hexadecimal. */
async function gravatarHashFromEmail(email: string | undefined | null): Promise<string | null> {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Avatar do usuário: foto do Gravatar com base no e-mail, com fallback para
 * as iniciais quando não há imagem (d=404 + onError).
 */
function UserAvatar({ email, initials, className }: { email?: string; initials: string; className: string }) {
  const [hash, setHash] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;
    void gravatarHashFromEmail(email).then(nextHash => {
      if (!cancelled) setHash(nextHash);
    });
    return () => { cancelled = true; };
  }, [email]);

  const avatarClass = className + ' object-cover';
  if (hash && !failed) {
    return (
      <img
        src={'https://gravatar.com/avatar/' + hash + '?s=96&d=404'}
        alt={initials}
        className={avatarClass}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className={className}>{initials}</span>;
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { logout, session, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { query, setQuery, results, loading, error } = useSearch();

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

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, [setQuery]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        handleSearchClose();
        (e.target as HTMLInputElement).blur();
      }
    },
    [handleSearchClose],
  );

  // Click outside para o dropdown de busca
  useEffect(() => {
    if (!searchOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!searchContainerRef.current) return;
      if (searchContainerRef.current.contains(event.target as Node)) return;
      setSearchOpen(false);
    };

    // Delay para evitar que o clique que abriu dispare o fechamento
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [searchOpen]);

  // Click outside para o menu do usuário
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
    <header className="sticky top-0 z-20 border-b border-border bg-header/90 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-light text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
            aria-label="Abrir menu lateral"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block" ref={searchContainerRef}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar agentes, clientes, chamados..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-xl border border-border bg-input py-2 pl-10 pr-4 text-sm text-foreground placeholder-muted outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
            />

            {searchOpen && (query.trim().length >= 3 || loading) && (
              <SearchPalette
                query={query}
                results={results}
                loading={loading}
                error={error}
                onClose={handleSearchClose}
              />
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium text-foreground">
              {session.stage === 'authenticated' ? 'Sessão autenticada' : 'Aguardando autenticação'}
            </p>
            <SessionCountdown
              expiresAt={session.expiresAt}
              authenticated={session.stage === 'authenticated'}
            />
          </div>
          <RealtimeConnectionStatus />
          <NotificationBell />
          <ThemeToggle />
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              title={displayEmail ? `${displayName} · ${displayEmail}` : displayName}
              aria-label={`Conta de ${displayName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-foreground ring-1 ring-border transition hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              <UserAvatar email={displayEmail} initials={initials} className="flex h-9 w-9 items-center justify-center" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-border bg-surface p-1 shadow-2xl backdrop-blur"
              >
                <div className="flex items-center gap-3 border-b border-border px-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-foreground">
                    <UserAvatar email={displayEmail} initials={initials} className="flex h-9 w-9 items-center justify-center" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                    {displayEmail && (
                      <p className="truncate text-xs text-muted">{displayEmail}</p>
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
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
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
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 transition-colors hover:bg-danger/20 dark:text-red-200"
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

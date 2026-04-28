import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAgentStatusRealtime_Combined } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);
  const { isAuthenticated } = useAuth();
  useAgentStatusRealtime_Combined(isAuthenticated);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) setMobileOpen(false);
    };

    setIsDesktop(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="app-shell relative flex min-h-screen text-slate-100">
      <div className="app-grid-bg" aria-hidden="true" />

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        isDesktop={isDesktop}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobileMenu}
      />

      {!isDesktop && mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu lateral"
          className="fixed inset-0 z-20 bg-slate-950/65 backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      <div
        className={`sidebar-transition relative z-10 flex min-h-screen flex-1 flex-col ${
          isDesktop ? (collapsed ? 'lg:ml-16' : 'lg:ml-60') : ''
        }`}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

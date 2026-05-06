import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAgentStatusRealtime_Combined, type AgentRealtimeScope } from '@/hooks';
import { useAuth } from '@/auth/AuthContext';
import { useAgent } from '@/hooks/useAgents';
import { useAgentHeartbeat } from '@/stores/heartbeatStore';
import type { Site } from '@/api';

type RouteRealtimeScope =
  | { kind: 'global' }
  | { kind: 'client'; clientId: string }
  | { kind: 'site'; clientId: string; siteId: string }
  | { kind: 'agent'; agentId: string };

function decodeSegment(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveRouteRealtimeScope(pathname: string): RouteRealtimeScope {
  const normalizedPath = pathname.trim();

  const siteMatch = normalizedPath.match(/^\/clients\/([^/]+)\/sites\/([^/]+)(?:\/|$)/i);
  if (siteMatch) {
    return {
      kind: 'site',
      clientId: decodeSegment(siteMatch[1]),
      siteId: decodeSegment(siteMatch[2]),
    };
  }

  const clientMatch = normalizedPath.match(/^\/clients\/([^/]+)(?:\/|$)/i);
  if (clientMatch) {
    return {
      kind: 'client',
      clientId: decodeSegment(clientMatch[1]),
    };
  }

  if (/^\/agents\/remote-debug-console(?:\/|$)/i.test(normalizedPath)) {
    return { kind: 'global' };
  }

  const agentMatch = normalizedPath.match(/^\/agents\/([^/]+)(?:\/|$)/i);
  if (agentMatch) {
    return {
      kind: 'agent',
      agentId: decodeSegment(agentMatch[1]),
    };
  }

  return { kind: 'global' };
}

function readOptionalStringField(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;

  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function findClientIdBySiteId(
  queryClient: ReturnType<typeof useQueryClient>,
  siteId: string | undefined,
): string | undefined {
  if (!siteId) return undefined;

  const siteQueries = queryClient.getQueriesData<Site[]>({
    queryKey: ['sites', 'byClient'],
  });

  for (const [, sites] of siteQueries) {
    if (!sites) continue;
    const matchedSite = sites.find((site) => site.id === siteId);
    if (matchedSite?.clientId) {
      return matchedSite.clientId;
    }
  }

  return undefined;
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const routeScope = useMemo(
    () => resolveRouteRealtimeScope(location.pathname),
    [location.pathname],
  );

  const routeAgentId = routeScope.kind === 'agent' ? routeScope.agentId : '';
  const agentQuery = useAgent(routeAgentId);
  const heartbeat = useAgentHeartbeat(routeAgentId);
  const heartbeatClientId = heartbeat?.clientId;
  const heartbeatSiteId = heartbeat?.siteId;
  const agentSiteId = agentQuery.data?.siteId;
  const agentClientId = readOptionalStringField(agentQuery.data, 'clientId');

  const realtimeScope = useMemo<AgentRealtimeScope>(() => {
    if (routeScope.kind === 'site') {
      return {
        level: 'site',
        clientId: routeScope.clientId,
        siteId: routeScope.siteId,
      };
    }

    if (routeScope.kind === 'client') {
      return {
        level: 'client',
        clientId: routeScope.clientId,
      };
    }

    if (routeScope.kind === 'agent') {
      const resolvedSiteId = heartbeatSiteId ?? agentSiteId;
      const resolvedClientId =
        heartbeatClientId ??
        agentClientId ??
        findClientIdBySiteId(queryClient, resolvedSiteId);

      return {
        level: 'agent',
        agentId: routeScope.agentId,
        clientId: resolvedClientId,
        siteId: resolvedSiteId,
      };
    }

    return { level: 'global' };
  }, [
    routeScope,
    heartbeatSiteId,
    heartbeatClientId,
    agentSiteId,
    agentClientId,
    queryClient,
  ]);

  useAgentStatusRealtime_Combined(isAuthenticated, realtimeScope);

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

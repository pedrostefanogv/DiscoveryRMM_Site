import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { useAuthorization } from '@/auth/authorization';
import ClientList from './ClientList';
import SiteList from './SiteList';

export type ClientsHubTab = 'clients' | 'sites';

interface ClientsHubPageProps {
  initialTab?: ClientsHubTab;
}

export default function ClientsHubPage({ initialTab = 'clients' }: ClientsHubPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAnyPermission } = useAuthorization();

  const canViewClients = hasAnyPermission(['Clients.View', 'clients.*', 'admin.*']);
  const canViewSites = hasAnyPermission(['Sites.View', 'sites.*', 'admin.*']);

  const tabs = useMemo(() => {
    const items: Array<{ id: ClientsHubTab; label: string; path: string; icon: 'group' | 'apartment' }> = [];
    if (canViewClients) {
      items.push({ id: 'clients', label: 'Clientes', path: '/clients', icon: 'group' });
    }
    if (canViewSites) {
      items.push({ id: 'sites', label: 'Sites', path: '/sites', icon: 'apartment' });
    }
    if (items.length === 0) {
      items.push(
        { id: 'clients', label: 'Clientes', path: '/clients', icon: 'group' },
        { id: 'sites', label: 'Sites', path: '/sites', icon: 'apartment' },
      );
    }
    return items;
  }, [canViewClients, canViewSites]);

  const resolvedInitialTab = useMemo<ClientsHubTab>(() => {
    if (tabs.some((tab) => tab.id === initialTab)) return initialTab;
    return tabs[0].id;
  }, [initialTab, tabs]);

  const [activeTab, setActiveTab] = useState<ClientsHubTab>(resolvedInitialTab);
  const tabRefs = useRef<Record<ClientsHubTab, HTMLButtonElement | null>>({
    clients: null,
    sites: null,
  });

  useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  const selectTab = (tab: ClientsHubTab) => {
    setActiveTab(tab);
    const targetPath = tab === 'clients' ? '/clients' : '/sites';
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
    tabRefs.current[tab]?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes e Sites"
        description="Gerencie clientes, filiais e acompanhe os agentes vinculados em um único hub."
      />

      <div
        role="tablist"
        aria-label="Seções de clientes e sites"
        className="flex flex-nowrap overflow-x-auto border-b border-border gap-1"
      >
        {tabs.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={[
                'relative flex-none whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                isSelected
                  ? 'text-primary after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary'
                  : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {activeTab === 'clients' ? <ClientList embedded /> : <SiteList embedded />}
      </div>
    </div>
  );
}

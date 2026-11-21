import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import IamUsersPage from './IamUsersPage';
import IamGroupsPage from './IamGroupsPage';
import IamRolesPage from './IamRolesPage';

export type IamHubTab = 'users' | 'groups' | 'roles';

interface IamHubPageProps {
  initialTab?: IamHubTab;
}

const TABS: Array<{ id: IamHubTab; label: string; path: string; icon: 'person' | 'group' | 'shield' }> = [
  { id: 'users', label: 'Usuários', path: '/identity/users', icon: 'person' },
  { id: 'groups', label: 'Grupos', path: '/identity/groups', icon: 'group' },
  { id: 'roles', label: 'Roles e Permissões', path: '/identity/roles', icon: 'shield' },
];

export default function IamHubPage({ initialTab = 'users' }: IamHubPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<IamHubTab>(initialTab);
  const tabRefs = useRef<Record<IamHubTab, HTMLButtonElement | null>>({
    users: null,
    groups: null,
    roles: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: IamHubTab) => {
    setActiveTab(tab);
    const targetPath = TABS.find((t) => t.id === tab)?.path ?? '/identity/users';
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
    tabRefs.current[tab]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TABS[nextIndex];
    selectTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários, Grupos e Roles"
        description="Administre contas, grupos de acesso e permissões RBAC em um único painel."
        breadcrumb={
          <Link to="/settings" className="transition-colors hover:text-foreground">
            Configurações
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label="Seções de controle de acesso"
        className="flex flex-nowrap overflow-x-auto border-b border-border gap-1"
      >
        {TABS.map((tab, index) => {
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
        {activeTab === 'users' && <IamUsersPage embedded />}
        {activeTab === 'groups' && <IamGroupsPage embedded />}
        {activeTab === 'roles' && <IamRolesPage embedded />}
      </div>
    </div>
  );
}

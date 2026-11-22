import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import WorkflowSettings from './WorkflowSettings';
import WorkflowProfileSettings from './WorkflowProfileSettings';

export type WorkflowHubTab = 'states' | 'profiles';

interface WorkflowHubPageProps {
  initialTab?: WorkflowHubTab;
}

const TABS: Array<{ id: WorkflowHubTab; label: string; path: string; icon: 'account_tree' | 'schedule' }> = [
  { id: 'states', label: 'Estados e Transições', path: '/settings/workflow', icon: 'account_tree' },
  { id: 'profiles', label: 'Perfis e SLA', path: '/settings/workflow-profiles', icon: 'schedule' },
];

export default function WorkflowHubPage({ initialTab = 'states' }: WorkflowHubPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<WorkflowHubTab>(initialTab);
  const tabRefs = useRef<Record<WorkflowHubTab, HTMLButtonElement | null>>({
    states: null,
    profiles: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: WorkflowHubTab) => {
    setActiveTab(tab);
    const targetPath = tab === 'states' ? '/settings/workflow' : '/settings/workflow-profiles';
    if (location.pathname !== targetPath) {
      navigate(`${targetPath}${location.search}`, { replace: true });
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
        title="Workflow"
        description="Gerencie estados, transições e perfis de SLA em um único lugar."
        breadcrumb={
          <Link to="/settings" className="transition-colors hover:text-foreground">
            Configurações
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label="Seções de workflow"
        className="flex flex-nowrap overflow-x-auto border-b border-border gap-1"
      >
        {TABS.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`workflow-hub-tab-${tab.id}`}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="workflow-hub-panel"
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

      <div
        id="workflow-hub-panel"
        role="tabpanel"
        aria-labelledby={`workflow-hub-tab-${activeTab}`}
      >
        {activeTab === 'states' ? <WorkflowSettings embedded /> : <WorkflowProfileSettings embedded />}
      </div>
    </div>
  );
}

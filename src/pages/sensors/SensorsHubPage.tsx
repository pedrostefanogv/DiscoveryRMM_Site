import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import SensorsFleetPage from './SensorsFleetPage';
import SensorsManagePage from './SensorsManagePage';

export type SensorsHubTab = 'fleet' | 'manage';

interface SensorsHubPageProps {
  initialTab?: SensorsHubTab;
}

const TABS: Array<{ id: SensorsHubTab; label: string; path: string; icon: 'sensors' | 'settings' }> = [
  { id: 'fleet', label: 'Visão da Frota', path: '/sensors', icon: 'sensors' },
  { id: 'manage', label: 'Definições', path: '/sensors/manage', icon: 'settings' },
];

export default function SensorsHubPage({ initialTab = 'fleet' }: SensorsHubPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<SensorsHubTab>(initialTab);
  const tabRefs = useRef<Record<SensorsHubTab, HTMLButtonElement | null>>({
    fleet: null,
    manage: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: SensorsHubTab) => {
    setActiveTab(tab);
    const targetPath = tab === 'fleet' ? '/sensors' : '/sensors/manage';
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
        title="Sensores"
        description="Monitore a telemetria da frota e gerencie definições de sensores em um único hub."
      />

      <div
        role="tablist"
        aria-label="Seções de sensores"
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
        {activeTab === 'fleet' ? <SensorsFleetPage embedded /> : <SensorsManagePage embedded />}
      </div>
    </div>
  );
}

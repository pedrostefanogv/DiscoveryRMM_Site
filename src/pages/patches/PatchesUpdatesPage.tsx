import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon, PageHeader, type MaterialSymbolName } from "@/components/ui";
import PatchesInventory from "./PatchesInventory";
import PatchesPending from "./PatchesPending";

export type PatchesUpdatesTab = "inventory" | "pending";

interface PatchesUpdatesPageProps {
  initialTab?: PatchesUpdatesTab;
}

const TABS: { id: PatchesUpdatesTab; label: string; icon: MaterialSymbolName }[] = [
  { id: "inventory", label: "Por atualização (Inventário)", icon: "inventory" },
  { id: "pending", label: "Por agente (Pendências)", icon: "desktop_windows" },
];

export default function PatchesUpdatesPage({
  initialTab = "inventory",
}: PatchesUpdatesPageProps) {
  const [activeTab, setActiveTab] = useState<PatchesUpdatesTab>(initialTab);
  const tabRefs = useRef<Record<PatchesUpdatesTab, HTMLButtonElement | null>>({
    inventory: null,
    pending: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: PatchesUpdatesTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = TABS[nextIndex];
    selectTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atualizações e Pendências"
        description="Acompanhe atualizações por KB/pacote ou pendências por agente em um único painel."
      />

      <div
        role="tablist"
        aria-label="Visões de atualizações e pendências"
        className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`patches-updates-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`relative flex-none inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon name={tab.icon} className="h-4 w-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`patches-updates-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "inventory" && <PatchesInventory embedded />}
        {activeTab === "pending" && <PatchesPending embedded />}
      </div>
    </div>
  );
}

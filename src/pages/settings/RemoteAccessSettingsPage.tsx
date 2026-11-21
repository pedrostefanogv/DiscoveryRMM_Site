import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Icon, PageHeader, type MaterialSymbolName } from "@/components/ui";
import RemoteConsentSettings from "./RemoteConsentSettings";
import RemoteProxyPolicySettings from "./RemoteProxyPolicySettings";
import RemoteAccessWebRtcSettings from "./RemoteAccessWebRtcSettings";

export type RemoteAccessTab = "consent" | "proxy" | "webrtc";

interface RemoteAccessSettingsPageProps {
  initialTab?: RemoteAccessTab;
}

const TABS: { id: RemoteAccessTab; label: string; icon: MaterialSymbolName }[] = [
  { id: "consent", label: "Autorização", icon: "gpp_maybe" },
  { id: "proxy", label: "Destinos do Proxy", icon: "lan" },
  { id: "webrtc", label: "WebRTC", icon: "settings_input_antenna" },
];

export default function RemoteAccessSettingsPage({
  initialTab = "consent",
}: RemoteAccessSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<RemoteAccessTab>(initialTab);
  const tabRefs = useRef<Record<RemoteAccessTab, HTMLButtonElement | null>>({
    consent: null,
    proxy: null,
    webrtc: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: RemoteAccessTab) => {
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
        title="Acesso Remoto"
        description="Consentimento de sessão, destinos permitidos do proxy e transporte direto WebRTC em um único lugar."
        breadcrumb={
          <Link to="/settings" className="transition-colors hover:text-foreground">
            Configurações
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label="Configurações de acesso remoto"
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
              id={`remote-access-tab-${tab.id}`}
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
        aria-labelledby={`remote-access-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "consent" && <RemoteConsentSettings embedded />}
        {activeTab === "proxy" && <RemoteProxyPolicySettings embedded />}
        {activeTab === "webrtc" && <RemoteAccessWebRtcSettings embedded />}
      </div>
    </div>
  );
}

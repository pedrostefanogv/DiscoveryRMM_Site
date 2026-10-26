
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Icon } from "@/components/ui";

export type SiteContextAction =
  | "edit"
  | "wake-on-lan"
  | "shutdown"
  | "restart"
  | "transfer-agents"
  | "delete";

interface SiteContextMenuProps {
  position: { x: number; y: number };
  loadingAction?: SiteContextAction | null;
  onAction: (action: SiteContextAction) => void;
  onClose: () => void;
}

export default function SiteContextMenu({
  position,
  loadingAction,
  onAction,
  onClose,
}: SiteContextMenuProps) {
  const items: ContextMenuItem[] = [
    {
      key: "edit",
      label: "Editar site",
      icon: <Icon name="edit" className="h-4 w-4" />,
      onClick: () => onAction("edit"),
    },
    {
      key: "power",
      label: "Energia",
      icon: <Icon name="power_settings_new" className="h-4 w-4" />,
      children: [
        {
          key: "wake-on-lan",
          label: "Acordar (Wake-on-LAN)",
          icon:
            loadingAction === "wake-on-lan" ? (
              <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
            ) : (
              <Icon name="bolt" className="h-4 w-4" />
            ),
          onClick: () => onAction("wake-on-lan"),
        },
        {
          key: "shutdown",
          label: "Desligar",
          icon:
            loadingAction === "shutdown" ? (
              <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
            ) : (
              <Icon name="power_settings_new" className="h-4 w-4" />
            ),
          danger: true,
          onClick: () => onAction("shutdown"),
        },
        {
          key: "restart",
          label: "Reiniciar",
          icon:
            loadingAction === "restart" ? (
              <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
            ) : (
              <Icon name="desktop_windows" className="h-4 w-4" />
            ),
          onClick: () => onAction("restart"),
        },
      ],
    },
    {
      key: "transfer-agents",
      label: "Transferir Agentes",
      icon:
        loadingAction === "transfer-agents" ? (
          <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
        ) : (
          <Icon name="swap_horiz" className="h-4 w-4" />
        ),
      separatorBefore: true,
      onClick: () => onAction("transfer-agents"),
    },
    {
      key: "delete",
      label: "Apagar",
      icon:
        loadingAction === "delete" ? (
          <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
        ) : (
          <Icon name="delete" className="h-4 w-4" />
        ),
      danger: true,
      onClick: () => onAction("delete"),
    },
    {
      key: "download-agent",
      label: "Download Agent",
      icon: <Icon name="download" className="h-4 w-4" />,
      hint: "em breve",
      disabled: true,
      separatorBefore: true,
    },
  ];

  return (
    <ContextMenu position={position} items={items} onClose={onClose} />
  );
}
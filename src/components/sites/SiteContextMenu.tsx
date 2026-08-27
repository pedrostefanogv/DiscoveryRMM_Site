import {
  Power,
  Zap,
  Monitor,
  Download,
  Trash2,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";

export type SiteContextAction =
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
      key: "power",
      label: "Energia",
      icon: <Power className="h-4 w-4" />,
      children: [
        {
          key: "wake-on-lan",
          label: "Acordar (Wake-on-LAN)",
          icon:
            loadingAction === "wake-on-lan" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            ),
          onClick: () => onAction("wake-on-lan"),
        },
        {
          key: "shutdown",
          label: "Desligar",
          icon:
            loadingAction === "shutdown" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            ),
          danger: true,
          onClick: () => onAction("shutdown"),
        },
        {
          key: "restart",
          label: "Reiniciar",
          icon:
            loadingAction === "restart" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Monitor className="h-4 w-4" />
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
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRightLeft className="h-4 w-4" />
        ),
      separatorBefore: true,
      onClick: () => onAction("transfer-agents"),
    },
    {
      key: "delete",
      label: "Apagar",
      icon:
        loadingAction === "delete" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        ),
      danger: true,
      onClick: () => onAction("delete"),
    },
    {
      key: "download-agent",
      label: "Download Agent",
      icon: <Download className="h-4 w-4" />,
      hint: "em breve",
      disabled: true,
      separatorBefore: true,
    },
  ];

  return (
    <ContextMenu position={position} items={items} onClose={onClose} />
  );
}
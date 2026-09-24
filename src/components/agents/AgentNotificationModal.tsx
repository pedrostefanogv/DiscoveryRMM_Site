import NotificationComposerModal, {
  type NotificationIcon,
  type NotificationMode,
  type NotificationPayload,
} from "@/components/notifications/NotificationComposerModal";

export type { NotificationMode, NotificationIcon };
/** Compatibilidade: nome histórico do payload usado pelos chamadores. */
export type AgentNotificationPayload = NotificationPayload;

interface AgentNotificationModalProps {
  agent: { id: string; displayName?: string | null; hostname: string };
  onClose: () => void;
  onConfirm: (data: NotificationPayload) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Envio de notificação para um agent único. Wrapper fino em torno do
 * NotificationComposerModal compartilhado (mesmo usado por cliente/site).
 */
export default function AgentNotificationModal({
  agent,
  onClose,
  onConfirm,
  isLoading = false,
}: AgentNotificationModalProps) {
  return (
    <NotificationComposerModal
      targetLabel={agent.displayName ?? agent.hostname}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

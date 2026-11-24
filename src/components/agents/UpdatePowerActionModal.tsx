import toast from 'react-hot-toast';
import { Icon, Button, Modal } from '@/components/ui';
import { useRestartAgent, useShutdownAgent } from '@/hooks/useAgents';
import { useAgentWindowsUpdateSnapshot, useInstallApprovedWindowsUpdates } from '@/hooks/useAgentWindowsUpdates';
import { awaitAgentCommandById, notifyAgentCommandOutcome } from '@/pages/agents/agentDetailUtils';
import { hasPendingWindowsUpdatePowerOption } from '@/utils/agentReboot';

interface UpdatePowerActionModalProps {
  open: boolean;
  agentId: string;
  agentName: string;
  action: 'restart' | 'shutdown';
  hasPendingWindowsUpdate?: boolean;
  onClose: () => void;
}

/**
 * Ação composta "Atualizar e reiniciar/desligar":
 * - Quando há atualizações aprovadas (`approvedCount > 0`), instala via WUA e
 *   executa a ação de energia ao final.
 * - Quando não há novas atualizações aprovadas mas o Windows já possui
 *   atualização preparada aguardando reboot/servicing (`pendingReboot`),
 *   executa o reinício/desligamento completo para concluir a instalação no SO.
 */
export default function UpdatePowerActionModal({
  open,
  agentId,
  agentName,
  action,
  hasPendingWindowsUpdate = false,
  onClose,
}: UpdatePowerActionModalProps) {
  const snapshot = useAgentWindowsUpdateSnapshot(open ? agentId : undefined);
  const installApproved = useInstallApprovedWindowsUpdates();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();

  const approvedCount = snapshot.data?.approvedCount ?? 0;
  const pendingCount = snapshot.data?.pendingCount ?? 0;
  const deniedCount = snapshot.data?.deniedCount ?? 0;
  const hasWindowsUpdatePendingReboot =
    hasPendingWindowsUpdatePowerOption(snapshot.data) ||
    (snapshot.data == null && Boolean(hasPendingWindowsUpdate));
  const canExecute = approvedCount > 0 || hasWindowsUpdatePendingReboot;
  const loading = snapshot.isLoading;
  const isSubmitting = installApproved.isPending || restartAgent.isPending || shutdownAgent.isPending;
  const actionLabel = action === 'restart' ? 'reiniciar' : 'desligar';

  const handleConfirm = async () => {
    try {
      if (approvedCount > 0) {
        const result = await installApproved.mutateAsync({
          agentId,
          postAction: action,
          confirm: true,
        });
        toast.success(result.message || 'Atualizações instaladas; o computador será reiniciado/desligado em seguida.');
        onClose();
        return;
      }

      if (hasWindowsUpdatePendingReboot) {
        const powerPayload = {
          delaySeconds: 15,
          force: false,
          notifyUser: true,
          message: action === 'restart'
            ? 'Reiniciando para concluir a instalação das atualizações pendentes do Windows.'
            : 'Desligando para concluir a instalação das atualizações pendentes do Windows.',
        };
        const response = action === 'restart'
          ? await restartAgent.mutateAsync({ id: agentId, data: powerPayload })
          : await shutdownAgent.mutateAsync({ id: agentId, data: powerPayload });
        void awaitAgentCommandById(agentId, response.commandId).then(notifyAgentCommandOutcome);
        toast.success(
          action === 'restart'
            ? 'Reinício enviado para aplicar as atualizações pendentes do Windows.'
            : 'Desligamento enviado para aplicar as atualizações pendentes do Windows.',
        );
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao executar atualização e energia.');
    }
  };

  return (
    <Modal open={open} onClose={() => { if (!isSubmitting) onClose(); }} title={`Atualizar e ${actionLabel}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-light p-3">
          {action === 'restart' ? <Icon name="restart_alt" className="h-5 w-5 text-primary" /> : <Icon name="power_settings_new" className="h-5 w-5 text-danger" />}
          <div className="text-sm">
            <p className="font-medium text-foreground">{agentName}</p>
            <p className="text-muted">
              {approvedCount > 0
                ? `Instala as atualizações aprovadas e, ao final, ${actionLabel} a máquina.`
                : `Conclui as atualizações pendentes do Windows ao ${actionLabel} a máquina.`}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Consultando atualizações do agente...</p>
        ) : approvedCount > 0 ? (
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <Icon name="download" className="h-4 w-4 text-success" />
              <span><strong>{approvedCount}</strong> aprovada(s) será(ão) instalada(s)</span>
            </li>
            <li className="text-muted">
              {Math.max(0, pendingCount - approvedCount)} pendente(s) não aprovada(s) será(ão) ignorada(s)
              {deniedCount > 0 ? ` · ${deniedCount} recusada(s)` : ''}
            </li>
            {hasWindowsUpdatePendingReboot && (
              <li className="text-xs text-muted">
                Atualizações já preparadas no Windows também serão concluídas ao {actionLabel}.
              </li>
            )}
          </ul>
        ) : hasWindowsUpdatePendingReboot ? (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
            <p>
              O Windows já possui atualizações preparadas aguardando {actionLabel === 'reiniciar' ? 'reinício' : 'desligamento'} para concluir a instalação.
            </p>
            {pendingCount > 0 && (
              <p className="text-xs text-muted">
                {pendingCount} atualização(ões) pendente(s) ainda não aprovada(s) será(ão) ignorada(s).
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Nenhuma atualização aprovada ou pendente de reinício neste agente. Nada será enviado. Abra a aba
            <strong> Atualizações </strong> do agente e aprove ao menos uma atualização pendente.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            variant={action === 'shutdown' ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            disabled={!canExecute || loading || isSubmitting}
          >
            {isSubmitting ? 'Enviando...' : `Atualizar e ${actionLabel}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

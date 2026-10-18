import { Download, Power, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { useAgentWindowsUpdateSnapshot, useInstallApprovedWindowsUpdates } from '@/hooks/useAgentWindowsUpdates';

interface UpdatePowerActionModalProps {
  open: boolean;
  agentId: string;
  agentName: string;
  action: 'restart' | 'shutdown';
  onClose: () => void;
}

/**
 * Ação composta "Atualizar e reiniciar/desligar": instala SOMENTE as
 * atualizações aprovadas e, ao final, executa a ação de energia.
 *
 * Regras (decisão do produto): com 0 aprovadas o comando NÃO é enviado — o
 * modal explica como aprovar. Nada é forçado e o reinício nunca é automático.
 */
export default function UpdatePowerActionModal({
  open,
  agentId,
  agentName,
  action,
  onClose,
}: UpdatePowerActionModalProps) {
  const snapshot = useAgentWindowsUpdateSnapshot(open ? agentId : undefined);
  const installApproved = useInstallApprovedWindowsUpdates();

  const approvedCount = snapshot.data?.approvedCount ?? 0;
  const pendingCount = snapshot.data?.pendingCount ?? 0;
  const deniedCount = snapshot.data?.deniedCount ?? 0;
  const loading = snapshot.isLoading;
  const actionLabel = action === 'restart' ? 'reiniciar' : 'desligar';

  const handleConfirm = async () => {
    try {
      const result = await installApproved.mutateAsync({
        agentId,
        postAction: action,
        confirm: true,
      });
      toast.success(result.message || `Atualizações instaladas; o computador será reiniciado/desligado em seguida.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao instalar atualizações aprovadas.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Atualizar e ${actionLabel}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-light p-3">
          {action === 'restart' ? <RotateCcw className="h-5 w-5 text-primary" /> : <Power className="h-5 w-5 text-danger" />}
          <div className="text-sm">
            <p className="font-medium text-foreground">{agentName}</p>
            <p className="text-muted">
              Instala as atualizações aprovadas e, ao final, {actionLabel} a máquina.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Consultando atualizações do agente...</p>
        ) : (
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <Download className="h-4 w-4 text-success" />
              <span><strong>{approvedCount}</strong> aprovada(s) será(ão) instalada(s)</span>
            </li>
            <li className="text-muted">
              {Math.max(0, pendingCount - approvedCount)} pendente(s) não aprovada(s) será(ão) ignorada(s)
              {deniedCount > 0 ? ` · ${deniedCount} recusada(s)` : ''}
            </li>
          </ul>
        )}

        {approvedCount === 0 && !loading && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Nenhuma atualização aprovada neste agente. Nada será enviado. Abra a aba
            <strong> Atualizações </strong> do agente e aprove ao menos uma atualização pendente.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant={action === 'shutdown' ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            disabled={approvedCount === 0 || loading || installApproved.isPending}
          >
            {installApproved.isPending ? 'Enviando...' : `Atualizar e ${actionLabel}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

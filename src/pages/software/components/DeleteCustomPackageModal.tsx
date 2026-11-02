import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Button, Icon, Input, Modal } from '@/components/ui';
import { useDeleteCustomPackage } from '@/hooks/useAppStore';

interface DeleteCustomPackageModalProps {
  open: boolean;
  packageId: string;
  /** Nome amigável (exibido na frase de confirmação). */
  name?: string | null;
  onClose: () => void;
  /** Notifica o sucesso (o pai recarrega as listas). */
  onDeleted?: () => void;
}

/**
 * Soft delete de pacote custom com confirmação DIGITADA: o operador precisa
 * reproduzir o packageId (case-insensitivo, igual à API) — um clique não basta,
 * porque as aprovações do pacote são apagadas DEFINITIVAMENTE.
 */
export function DeleteCustomPackageModal({
  open,
  packageId,
  name,
  onClose,
  onDeleted,
}: DeleteCustomPackageModalProps) {
  const [confirmValue, setConfirmValue] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const deletePackage = useDeleteCustomPackage();

  useEffect(() => {
    if (!open) return;
    setConfirmValue('');
    setReason('');
    setTouched(false);
  }, [open]);

  // Mesma regra da API (400 quando confirm != packageId, case-insensitive):
  // o botão só habilita quando casa — sem frustrar o operador com 400.
  const confirmOk = confirmValue.trim().toLowerCase() === packageId.trim().toLowerCase();

  async function handleConfirm() {
    if (!confirmOk) {
      setTouched(true);
      return;
    }
    try {
      await deletePackage.mutateAsync({
        packageId,
        confirm: confirmValue.trim(),
        reason: reason.trim() || undefined,
      });
      toast.success('Pacote movido para a lixeira. As aprovações dele foram excluídas definitivamente.');
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir o pacote.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Excluir pacote custom" maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-danger">
            <Icon name="warning" className="h-4 w-4" /> As aprovações deste pacote serão EXCLUÍDAS definitivamente.
          </p>
          <p className="mt-2 text-muted-foreground">
            O pacote <strong className="text-foreground">{name || packageId}</strong> sai do catálogo e vai para a
            lixeira — pode ser restaurado depois, mas as regras de aprovação NÃO voltam: será preciso recadastrá-las.
          </p>
        </div>

        <Input
          label={`Digite ${packageId} para confirmar`}
          value={confirmValue}
          onChange={(e) => {
            setConfirmValue(e.target.value);
            setTouched(true);
          }}
          placeholder={packageId}
          autoFocus
          error={touched && !confirmOk ? 'A confirmação precisa ser exatamente o ID do pacote.' : undefined}
        />

        <Input
          label="Motivo (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: substituído por versão mais recente"
          maxLength={300}
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!confirmOk} loading={deletePackage.isPending}>
            <Icon name="delete" className="h-4 w-4" /> Excluir pacote
          </Button>
        </div>
      </div>
    </Modal>
  );
}

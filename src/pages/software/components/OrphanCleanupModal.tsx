import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Badge, Button, Icon, Loading, Modal } from '@/components/ui';
import { useCleanupOrphanApprovalRules } from '@/hooks/useAppStore';
import { scopeLabel } from '../softwareStoreUtils';
import type { AppApprovalOrphanCleanupResponse } from '@/api/types';

interface OrphanCleanupModalProps {
  open: boolean;
  onClose: () => void;
  /** Notifica o sucesso da remoção (o pai recarrega as listas). */
  onCleaned?: (removed: number) => void;
}

/**
 * Limpeza de regras de aprovação órfãs (pacotes custom que não existem mais).
 * Sempre roda o dry-run primeiro: o operador vê a contagem e a lista antes de
 * aplicar — a remoção das regras é definitiva.
 */
export function OrphanCleanupModal({ open, onClose, onCleaned }: OrphanCleanupModalProps) {
  const [preview, setPreview] = useState<AppApprovalOrphanCleanupResponse | null>(null);
  const cleanup = useCleanupOrphanApprovalRules();

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    cleanup
      .mutateAsync({ dryRun: true })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Falha ao buscar regras órfãs.');
      });
    return () => {
      cancelled = true;
    };
    // O modal roda o dry-run UMA vez por abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const orphans = preview?.orphans ?? [];

  async function handleApply() {
    try {
      const result = await cleanup.mutateAsync({ dryRun: false });
      const removed = result.removed ?? result.orphans.length;
      toast.success(`${removed} regra(s) órfã(s) removida(s).`);
      onCleaned?.(removed);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao remover as regras órfãs.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Limpar regras órfãs" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Regras de aprovação de pacotes <strong className="text-foreground">custom</strong> cujo pacote não existe
          mais (foi excluído da loja). Elas não têm efeito e podem ser removidas sem afetar nada.
        </p>

        {cleanup.isPending ? (
          <Loading />
        ) : orphans.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted">
            <Icon name="check_circle" className="mb-2 h-8 w-8 text-success" />
            <p className="text-sm">Nenhuma regra órfã encontrada.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge color="warning">{orphans.length} regra(s) órfã(s)</Badge>
            <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-2 font-mono text-[11px] text-muted">
              {orphans.slice(0, 50).map((orphan) => (
                <li key={orphan.ruleId}>
                  {orphan.packageId} — regra {orphan.ruleId} · escopo {scopeLabel(orphan.scopeType)}
                </li>
              ))}
              {orphans.length > 50 && <li>… e {orphans.length - 50} mais</li>}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => void handleApply()}
            disabled={orphans.length === 0 || cleanup.isPending}
            loading={cleanup.isPending && cleanup.variables?.dryRun === false}
          >
            <Icon name="delete" className="h-4 w-4" /> Limpar regras órfãs
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui';
import type { PowerActionVerb } from '@/components/agents/powerActionVerbs';

interface PowerActionVerbDialogProps {
  /** Verbo pendente de confirmação; `null` mantém o diálogo fechado. */
  verb: PowerActionVerb | null;
  /** Nome de exibição do agente (hostname/displayName). */
  agentName: ReactNode;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Diálogo de confirmação de um verbo de energia. Um único diálogo atende TODOS
 * os verbos: o texto (aviso de BitLocker, perda de trabalho, reversibilidade do
 * bloqueio, etc.) vem da declaração em POWER_ACTION_VERBS.
 *
 * Fica separado de powerActionVerbs.tsx de propósito — aquele arquivo exporta
 * apenas constantes/tipos, então não há mistura de componente com dados.
 */
export function PowerActionVerbDialog({
  verb,
  agentName,
  isLoading,
  onConfirm,
  onClose,
}: PowerActionVerbDialogProps) {
  return (
    <ConfirmDialog
      open={verb !== null}
      title={verb?.confirmTitle ?? 'Confirmar ação de energia'}
      message={verb ? verb.confirmMessage(agentName) : null}
      confirmLabel={verb?.confirmLabel ?? 'Confirmar'}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

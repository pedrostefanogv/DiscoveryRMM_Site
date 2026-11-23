import { useEffect, useMemo, useState } from 'react';

import { Icon, Modal, Button, Input } from '@/components/ui';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import type { AgentCardAgent } from './AgentCard';

export type BulkPowerAction = 'restart' | 'shutdown';

export interface BulkPowerActionPayload {
  delaySeconds: number;
  force: boolean;
  message: string;
  notifyUser: boolean;
}

interface BulkPowerActionModalProps {
  open: boolean;
  action: BulkPowerAction;
  /** Agentes selecionados na aba (todos entram na confirmação). */
  agents: readonly AgentCardAgent[];
  now: number;
  onClose: () => void;
  onConfirm: (data: BulkPowerActionPayload) => Promise<void>;
  isLoading?: boolean;
}

/** Palavra que o operador precisa digitar para liberar o botão. */
const CONFIRM_WORD: Record<BulkPowerAction, string> = {
  restart: 'REINICIAR',
  shutdown: 'DESLIGAR',
};

/**
 * Confirmação de energia em LOTE para os agentes selecionados na aba Agentes.
 *
 * Difere do `PowerActionModal` (um agente) e do `SitePowerConfirmationModal`
 * (o site inteiro, com o nome do site como confirmação): aqui o alvo é um
 * subconjunto arbitrário escolhido na própria lista, então a confirmação é uma
 * palavra fixa e o modal mostra quantos online/offline foram selecionados.
 *
 * Comandos de energia dependem do agente estar online (o dispatcher não os
 * reentrega como os de atualização/notificação): os offline são apenas
 * contabilizados e não recebem nada.
 */
export default function BulkPowerActionModal({
  open,
  action,
  agents,
  now,
  onClose,
  onConfirm,
  isLoading = false,
}: BulkPowerActionModalProps) {
  const isRestart = action === 'restart';
  const confirmWord = CONFIRM_WORD[action];
  const defaultDelay = isRestart ? 15 : 30;

  const [delaySeconds, setDelaySeconds] = useState(defaultDelay);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState('');
  const [notifyUser, setNotifyUser] = useState(true);
  const [confirmation, setConfirmation] = useState('');

  // Cada abertura começa limpa: reaproveitar a confirmação digitada antes
  // liberaria o botão sem o operador revalidar a ação.
  useEffect(() => {
    if (!open) return;
    setDelaySeconds(defaultDelay);
    setForce(false);
    setMessage('');
    setNotifyUser(true);
    setConfirmation('');
  }, [open, defaultDelay]);

  const onlineAgents = useMemo(
    () => agents.filter((agent) => isAgentOnlineNow(agent, now)),
    [agents, now],
  );
  const offlineCount = agents.length - onlineAgents.length;

  const confirmed = confirmation.trim().toUpperCase() === confirmWord;
  const canSubmit = confirmed && delaySeconds >= 1 && onlineAgents.length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await onConfirm({ delaySeconds, force, message, notifyUser });
      onClose();
    } catch {
      // O chamador já reporta o erro com toast; o modal permanece aberto para
      // o operador revisar o que digitou.
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRestart ? 'Reiniciar agentes selecionados' : 'Desligar agentes selecionados'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Ação em massa em {agents.length} agente(s) selecionado(s)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                O comando de {isRestart ? 'reinicialização' : 'desligamento'} será enviado para{' '}
                <strong className="text-foreground">{onlineAgents.length} agente(s) online</strong>.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {offlineCount > 0
                  ? `${offlineCount} agente(s) offline não recebem comando de energia: reative-os com Wake-on-LAN ou ligue a máquina.`
                  : 'Todos os selecionados estão online.'}
              </p>
              <p className="mt-2 text-xs text-muted">
                A janela de manutenção vale para automação e patches e{' '}
                <strong>não adia este comando</strong>.
              </p>
            </div>
          </div>
        </div>

        {onlineAgents.length === 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-danger">
            Nenhum dos agentes selecionados está online. A ação foi desabilitada.
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground" htmlFor="bulk-power-delay">
            Tempo de espera (segundos)
          </label>
          <input
            id="bulk-power-delay"
            type="number"
            min={1}
            max={3600}
            value={delaySeconds}
            onChange={(event) => setDelaySeconds(Number(event.target.value) || 0)}
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-muted">
            O comando é aplicado {delaySeconds} segundo{delaySeconds === 1 ? '' : 's'} após a entrega.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            className="h-4 w-4 rounded border-border-strong bg-surface-light text-primary focus:ring-primary/30"
          />
          <div>
            <span className="text-sm text-muted-foreground">Forçar</span>
            <p className="text-xs text-muted">Não aguardar o fechamento de aplicativos abertos.</p>
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={notifyUser}
            onChange={(event) => setNotifyUser(event.target.checked)}
            className="h-4 w-4 rounded border-border-strong bg-surface-light text-primary focus:ring-primary/30"
          />
          <div>
            <span className="text-sm text-muted-foreground">Notificar o usuário</span>
            <p className="text-xs text-muted">
              Exibe um aviso Fluent com contador em cada máquina antes de{' '}
              {isRestart ? 'reiniciar' : 'desligar'}. Sem isso, o comando é aplicado direto.
            </p>
          </div>
        </label>

        <Input
          label="Mensagem (opcional)"
          placeholder="Mensagem exibida ao usuário antes da ação..."
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 512))}
        />

        <div className="rounded-lg border border-border bg-surface-light p-3">
          <label
            className="mb-1.5 block text-sm font-medium text-muted-foreground"
            htmlFor="bulk-power-confirmation"
          >
            Digite <span className="font-mono font-semibold text-foreground">{confirmWord}</span> para confirmar
          </label>
          <input
            id="bulk-power-confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={confirmWord}
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {confirmation.length > 0 && !confirmed && (
            <p className="mt-1 text-xs text-danger">O texto digitado não corresponde a {confirmWord}.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant={isRestart ? 'secondary' : 'danger'}
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            loading={isLoading}
          >
            {isLoading
              ? 'Enviando...'
              : `${isRestart ? 'Reiniciar' : 'Desligar'} ${onlineAgents.length} agente(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

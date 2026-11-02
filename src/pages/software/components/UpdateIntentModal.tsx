import { Badge, Button, ErrorDisplay, Icon, Loading, Modal } from '@/components/ui';
import { useAppStoreUpdateIntent } from '@/hooks/useAppStore';
import { AppApprovalScopeType, AppInstallationType } from '@/api/types';
import {
  AppUpdateOwner,
  type AppMaintenanceWindowInfo,
  type AppStoreUpdateIntentItem,
} from '@/api/appStoreUpdateIntent';
import { installationTypeOptions, scopeLabel } from '../softwareStoreUtils';

/** Mesma convenção do servidor: 1=domingo ... 7=sábado (vazio = todos os dias). */
const DAY_LABELS: Record<number, string> = {
  1: 'Dom', 2: 'Seg', 3: 'Ter', 4: 'Qua', 5: 'Qui', 6: 'Sex', 7: 'Sáb',
};

interface UpdateIntentModalProps {
  open: boolean;
  onClose: () => void;
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
  search?: string;
}

/** "Automação \"Navegadores\" — Recorrente (cron: 0 3 * * *)" */
function schedulingLabel(item: AppStoreUpdateIntentItem): string {
  if (item.owner !== AppUpdateOwner.Automation) return '—';
  const name = item.automationTaskName ?? 'sem nome';
  const trigger = item.automationTriggerSummary;
  return trigger ? `"${name}" — ${trigger}` : `"${name}"`;
}

function ownerLabel(item: AppStoreUpdateIntentItem): string {
  switch (item.owner) {
    case AppUpdateOwner.AutoUpdate:
      return 'Auto-update';
    case AppUpdateOwner.Automation:
      return `Automação "${item.automationTaskName ?? 'sem nome'}"`;
    default:
      return 'Manual';
  }
}

/** Resumo da janela de manutenção em texto ("Seg, Ter, ... às 02:00 por 2 h (America/Sao_Paulo)"). */
function maintenanceWindowSummary(window: AppMaintenanceWindowInfo): string {
  if (!window.enabled) return 'Desligada';
  const days =
    window.daysOfWeek.length > 0
      ? [...window.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_LABELS[d] ?? String(d)).join(', ')
      : 'Todos os dias';
  const parts = [`${days} às ${window.startTime ?? '--:--'}`];
  if (window.durationMinutes != null) {
    parts.push(`por ${window.durationMinutes} min`);
  }
  if (window.timeZone) parts.push(`(${window.timeZone})`);
  return parts.join(' ');
}

export function UpdateIntentModal({
  open,
  onClose,
  scopeType,
  scopeId,
  installationType,
  search,
}: UpdateIntentModalProps) {
  // Escopo Cliente/Site/Agente sem id não tem simulação: a consulta nem roda.
  const scopeMissing = scopeType !== AppApprovalScopeType.Global && !scopeId;
  const query = useAppStoreUpdateIntent(
    { scopeType, scopeId, installationType, search: search || undefined },
    { enabled: open && !scopeMissing },
  );
  const window_ = query.data?.maintenanceWindow ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Simular Atualizações" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Mostra o que aconteceria se o agent rodasse a atualização agora, para o escopo{' '}
          <strong className="text-foreground">{scopeLabel(scopeType)}</strong>
          {installationType !== undefined && (
            <>
              {' '}e o tipo{' '}
              <strong className="text-foreground">
                {installationTypeOptions.find((o) => o.value === String(installationType))?.label ?? ''}
              </strong>
            </>
          )}
          .
        </p>

        {/* Janela de manutenção vigente: com ela desligada o agent NÃO roda
            auto-update — o aviso abaixo explica como habilitar. */}
        {window_ && (
          <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs">
            <div className="flex items-center gap-2">
              <Icon name="schedule" className="h-4 w-4 text-muted" />
              <span className="font-medium text-foreground">Janela de manutenção:</span>
              <span className="text-muted">{maintenanceWindowSummary(window_)}</span>
            </div>
            {!window_.isOpenNow && window_.nextStartUtc && (
              <p className="mt-1 text-xs text-muted">
                Próxima janela abre em {window_.nextStartUtc} (UTC).
              </p>
            )}
            {!window_.enabled && (
              <p className="mt-1 text-xs text-warning">
                Janela desligada: o auto-update NÃO é executado — configure a janela de manutenção
                (Configurações → Servidor) para habilitá-lo.
              </p>
            )}
          </div>
        )}

        {/* Escopo Cliente/Site/Agente sem id não tem simulação: mostra o que
            falta em vez de um modal praticamente vazio. */}
        {scopeMissing && (
          <div className="flex flex-col items-center py-10 text-muted">
            <Icon name="verified_user" className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Selecione um cliente, site ou agente para simular.</p>
          </div>
        )}

        {!scopeMissing && query.isLoading && <Loading />}
        {!scopeMissing && query.isError && (
          <ErrorDisplay message="Erro ao carregar a simulação." onRetry={() => query.refetch()} />
        )}
        {!scopeMissing && query.data && query.data.truncated && (
          <p className="text-xs text-warning">Simulação truncada (limite de pacotes).</p>
        )}
        {!scopeMissing && query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-10 text-muted">
            <Icon name="verified_user" className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum pacote elegível para atualização neste escopo.</p>
          </div>
        )}

        {!scopeMissing && query.data && query.data.items.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Pacote</th>
                  <th className="px-3 py-2 font-medium">Dono</th>
                  <th className="px-3 py-2 font-medium">Agendamento</th>
                  <th className="px-3 py-2 font-medium">Conflito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.data.items.map((item) => (
                  <tr key={item.packageId} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-foreground">{item.packageId}</div>
                      {item.packageName && (
                        <div className="text-xs text-muted">{item.packageName}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{ownerLabel(item)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{schedulingLabel(item)}</td>
                    <td className="px-3 py-2">
                      {/* O endpoint só simula pacotes que SERÃO atualizados (ação
                          Allow): não há branch de "Negado" aqui de propósito. */}
                      {item.conflict ? (
                        <Badge color="warning">{item.conflictReason ?? 'Conflito'}</Badge>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* A simulação nunca executa: evita o operador esperar instalação. */}
        <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted">
          Simulação — nada é executado aqui. Quando ativo, quem executa é o agent,
          dentro da janela de manutenção (fila única de pacotes; automações têm precedência).
        </p>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

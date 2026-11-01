import { useState, useEffect } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useCreateApproval } from '@/hooks/useAppStore';
import { AgentPicker } from './AgentPicker';
import { PackageCatalogPicker } from './PackageCatalogPicker';
import { installationTypeOptions, scopeTypeOptions, actionOptions } from '../softwareStoreUtils';
import { AppApprovalActionType, AppApprovalScopeType, AppInstallationType, type CreateAppApprovalRuleRequest } from '@/api/types';

interface ApprovalFormModalProps {
  open: boolean;
  onClose: () => void;
  prefillPackageId?: string;
  prefillInstallationType?: AppInstallationType;
  lockPackageId?: boolean;
  /**
   * Trava o "Tipo de instalação" quando ele vem do catálogo: sem isso dá para
   * montar uma regra Winget para um pacote Custom e a API só devolve 400.
   */
  lockInstallationType?: boolean;
  /** Escopo/ids já filtrados na aba, para não obrigar a escolher de novo. */
  prefillScopeType?: AppApprovalScopeType;
  prefillClientId?: string;
  prefillSiteId?: string;
  prefillAgentId?: string;
  /**
   * Valores herdados ao criar um override ("Sobrescrever aqui"): o operador
   * começa do estado que já vale no escopo e só ajusta o que quiser.
   */
  prefillAction?: AppApprovalActionType;
  prefillAutoUpdate?: boolean;
  /**
   * Avisa o dono da lista com o tipo de instalação da regra salva: criar uma
   * regra Custom com o filtro em Winget deixava a lista vazia logo após salvar.
   */
  onSaved?: (installationType: AppInstallationType) => void;
}

export function ApprovalFormModal({
  open,
  onClose,
  prefillPackageId = '',
  prefillInstallationType = AppInstallationType.Winget,
  lockPackageId = false,
  lockInstallationType = false,
  prefillScopeType,
  prefillClientId = '',
  prefillSiteId = '',
  prefillAgentId = '',
  prefillAction,
  prefillAutoUpdate,
  onSaved,
}: ApprovalFormModalProps) {
  const isPackageIdLocked = lockPackageId || Boolean(prefillPackageId.trim());
  const isInstallationTypeLocked = lockInstallationType || isPackageIdLocked;
  const clients = useClients();
  const [scopeType, setScopeType] = useState(AppApprovalScopeType.Global);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [installationType, setInstallationType] = useState(prefillInstallationType);
  const [packageId, setPackageId] = useState(prefillPackageId);
  const [action, setAction] = useState(AppApprovalActionType.Allow);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sites = useSites(selectedClientId);
  const createApproval = useCreateApproval();

  const scopeId =
    scopeType === AppApprovalScopeType.Client
      ? selectedClientId || null
      : scopeType === AppApprovalScopeType.Site
        ? selectedSiteId || null
        : scopeType === AppApprovalScopeType.Agent
          ? selectedAgentId || null
          : null;

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const siteOptions = [
    { value: '', label: 'Selecione...' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  useEffect(() => {
    if (!open) return;
    setPackageId(prefillPackageId);
    setInstallationType(prefillInstallationType);
    // Repõe o escopo/ids que a aba já tinha filtrado (senão o operador escolhe
    // cliente/site/agente duas vezes para a mesma regra).
    if (prefillScopeType !== undefined) setScopeType(prefillScopeType);
    setSelectedClientId(prefillClientId);
    setSelectedSiteId(prefillSiteId);
    setSelectedAgentId(prefillAgentId);
    // Override começa com a ação/auto-update herdados; regra nova usa o padrão.
    setAction(prefillAction ?? AppApprovalActionType.Allow);
    setAutoUpdate(prefillAutoUpdate ?? false);
    // Motivo/erro são por abertura: sem isto, cancelar e reabrir reaproveitava o
    // motivo da tentativa anterior sem o operador perceber.
    setReason('');
    setError(null);
  }, [
    open,
    prefillPackageId,
    prefillInstallationType,
    prefillScopeType,
    prefillClientId,
    prefillSiteId,
    prefillAgentId,
    prefillAction,
    prefillAutoUpdate,
  ]);

  async function handleSubmit() {
    if (!packageId.trim()) {
      setError('ID do pacote é obrigatório.');
      return;
    }
    if (scopeType !== AppApprovalScopeType.Global && !scopeId) {
      setError('Selecione ou informe o escopo.');
      return;
    }
    setError(null);
    const req: CreateAppApprovalRuleRequest = {
      scopeType,
      scopeId,
      installationType,
      packageId: packageId.trim().toLowerCase(),
      action,
      autoUpdateEnabled: autoUpdate,
      reason: reason.trim() || undefined,
    };
    try {
      const saved = await createApproval.mutateAsync(req);
      onSaved?.(saved?.installationType ?? installationType);
      onClose();
      setPackageId('');
      setReason('');
      setAutoUpdate(false);
      setScopeType(AppApprovalScopeType.Global);
      setSelectedClientId('');
      setSelectedSiteId('');
      setSelectedAgentId('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar regra.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Regra de Aprovação" maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de instalação"
            options={installationTypeOptions}
            value={String(installationType)}
            disabled={isInstallationTypeLocked}
            title={isInstallationTypeLocked ? 'Definido pelo pacote selecionado no catálogo' : undefined}
            onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)}
          />
          <Select
            label="Escopo"
            options={scopeTypeOptions}
            value={String(scopeType)}
            onChange={(e) => {
              setScopeType(Number(e.target.value) as AppApprovalScopeType);
              setSelectedClientId('');
              setSelectedSiteId('');
              setSelectedAgentId('');
            }}
          />
        </div>

        {scopeType === AppApprovalScopeType.Client && (
          <Select
            label="Cliente"
            options={clientOptions}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          />
        )}
        {scopeType === AppApprovalScopeType.Site && (
          <>
            <Select
              label="Cliente"
              options={clientOptions}
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setSelectedSiteId('');
              }}
            />
            <Select
              label="Site"
              options={siteOptions}
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
            />
          </>
        )}
        {scopeType === AppApprovalScopeType.Agent && (
          <AgentPicker
            // key: remonta o picker quando o contexto vindo da aba muda, para os
            // selects de cliente/site abrirem já preenchidos.
            key={`${prefillClientId}-${prefillSiteId}`}
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            label="Agente"
            initialClientId={prefillClientId}
            initialSiteId={prefillSiteId}
          />
        )}

        <PackageCatalogPicker
          installationType={installationType}
          packageId={packageId}
          locked={isPackageIdLocked}
          onChange={setPackageId}
        />
        {isPackageIdLocked && (
          <p className="-mt-2 text-xs text-muted">
            Este ID veio do pacote selecionado e não é editável nesta regra.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Ação"
            options={actionOptions}
            value={String(action)}
            onChange={(e) => setAction(Number(e.target.value) as AppApprovalActionType)}
          />
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-surface-light accent-primary"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
              />
              Auto-atualização
            </label>
          </div>
        </div>
        {/* Contexto do que o checkbox faz: evita o operador achar que o site
            dispara a atualização — quem roda é o agent, dentro da janela. */}
        <p className="-mt-2 text-xs text-muted">
          Executado pelo agent dentro da janela de manutenção (Configurações → Servidor). Se existir
          uma automação ativa para o mesmo pacote, ela tem precedência.
        </p>

        <Input
          label="Motivo (opcional)"
          placeholder="Ex: Aprovado pela TI"
          value={reason}
          // Mesmo limite da coluna app_approval_rules.reason (varchar(500)):
          // sem isto a API devolvia 400 depois de o operador escrever o texto.
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={createApproval.isPending}>
            Salvar Regra
          </Button>
        </div>
      </div>
    </Modal>
  );
}

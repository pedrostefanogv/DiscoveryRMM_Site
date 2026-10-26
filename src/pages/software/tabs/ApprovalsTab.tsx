import { useState } from 'react';
import toast from 'react-hot-toast';

import { Icon, Badge, Button, Card, ErrorDisplay, Loading, Modal, Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAppStoreApprovals, useDeleteApproval } from '@/hooks/useAppStore';
import { ApiError } from '@/api/client';
import { AppApprovalActionType, AppApprovalScopeType, AppInstallationType, type AppApprovalRule } from '@/api/types';
import { AgentPicker } from '../components/AgentPicker';
import { ApprovalFormModal } from '../components/ApprovalFormModal';
import { installationTypeOptions, scopeTypeOptions, scopeLabel, formatDate } from '../softwareStoreUtils';

export function ApprovalsTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [scopeType, setScopeType] = useState(AppApprovalScopeType.Global);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [agentId, setAgentId] = useState('');
  // Contexto (cliente/site) escolhido dentro do AgentPicker: o picker guarda isso
  // internamente, então a aba espelha aqui para repassar ao modal de nova regra.
  const [agentClientId, setAgentClientId] = useState('');
  const [agentSiteId, setAgentSiteId] = useState('');
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppApprovalRule | null>(null);

  const clients = useClients();
  const sites = useSites(selectedClientId);
  const deleteApproval = useDeleteApproval();

  const scopeId =
    scopeType === AppApprovalScopeType.Client
      ? selectedClientId || null
      : scopeType === AppApprovalScopeType.Site
        ? selectedSiteId || null
        : scopeType === AppApprovalScopeType.Agent
          ? agentId || null
          : null;

  const query = useAppStoreApprovals({ scopeType, scopeId, installationType });

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: 'Selecione...' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  async function handleDelete(rule: AppApprovalRule) {
    const ruleId = rule.ruleId ?? rule.id ?? '';
    if (!ruleId) {
      toast.error('Regra sem identificador — recarregue a lista.');
      return;
    }
    try {
      await deleteApproval.mutateAsync({ ruleId });
      toast.success('Regra removida.');
      setDeleteTarget(null);
    } catch (err) {
      // 404 = a regra já não existia (duplo clique / lista velha). Não é falha
      // de remoção: fecha o modal, recarrega a lista e diz o que aconteceu.
      if (err instanceof ApiError && err.status === 404) {
        toast('Regra já não existia. Lista atualizada.', { icon: 'ℹ️' });
        setDeleteTarget(null);
        void query.refetch();
        return;
      }
      // Sem tratamento, a falha virava promise rejeitada silenciosa e o modal
      // ficava aberto sem indicação nenhuma de erro.
      toast.error(err instanceof Error ? err.message : 'Falha ao remover a regra.');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select label="Tipo" options={installationTypeOptions} value={String(installationType)}
              onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)} />
          </div>
          <div className="w-40">
            <Select label="Escopo" options={scopeTypeOptions} value={String(scopeType)}
              onChange={(e) => { setScopeType(Number(e.target.value) as AppApprovalScopeType); setSelectedClientId(''); setSelectedSiteId(''); setAgentId(''); }} />
          </div>
          {scopeType === AppApprovalScopeType.Client && (
            <div className="w-56"><Select label="Cliente" options={clientOptions} value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} /></div>
          )}
          {scopeType === AppApprovalScopeType.Site && (
            <>
              <div className="w-48"><Select label="Cliente" options={clientOptions} value={selectedClientId} onChange={(e) => { setSelectedClientId(e.target.value); setSelectedSiteId(''); }} /></div>
              <div className="w-48"><Select label="Site" options={siteOptions} value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)} /></div>
            </>
          )}
          <div className="ml-auto"><Button onClick={() => setNewRuleOpen(true)}><Icon name="add" className="h-4 w-4" /> Nova Regra</Button></div>
        </div>
        {/* O seletor de agente é um bloco próprio: dentro da barra de filtros ele
            esticava a linha (itens alinhados pela base) e quebrava o card. */}
        {scopeType === AppApprovalScopeType.Agent && (
          <div className="mt-4 border-t border-border pt-4">
            <AgentPicker
              value={agentId}
              onChange={setAgentId}
              // O contexto espelhado volta como valor inicial: trocar o escopo e
              // voltar para "Agente" remonta o picker e, sem isto, ele apareceria
              // vazio enquanto o modal recebia o contexto antigo.
              initialClientId={agentClientId}
              initialSiteId={agentSiteId}
              onContextChange={(clientId, siteId) => {
                setAgentClientId(clientId);
                setAgentSiteId(siteId);
              }}
            />
          </div>
        )}
      </Card>

      <Card padding={false}>
        <div className="border-b border-border px-5 py-4">
          <span className="text-sm font-medium text-foreground">{query.data ? `${query.data.count} regra(s) — escopo ${scopeLabel(scopeType)}` : 'Regras de aprovação'}</span>
        </div>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorDisplay message="Erro ao carregar regras." onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-muted">
            <Icon name="verified_user" className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma regra encontrada para este escopo.</p>
            {/* A regra criada para um pacote Custom não aparece com "Tipo" Winget —
                era exatamente a dúvida de quem criou a regra. */}
            <p className="mt-1 max-w-md text-center text-xs text-muted">
              O filtro &quot;Tipo&quot; ({installationTypeOptions.find((o) => o.value === String(installationType))?.label ?? ''}) mostra
              só regras desse tipo de instalação. Mude o tipo para ver regras de Winget, Chocolatey ou Custom.
            </p>
          </div>
        )}
        {query.data && query.data.items.length > 0 && (
          <div className="divide-y divide-black/10 dark:divide-white/5">
            {query.data.items.map((rule) => (
              <div key={rule.ruleId ?? rule.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface-light transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground font-mono">{rule.packageId}</span>
                    {rule.packageName && <span className="text-xs text-muted">{rule.packageName}</span>}
                    {rule.action === AppApprovalActionType.Allow ? <Badge color="success">Permitido</Badge> : rule.action === AppApprovalActionType.Deny ? <Badge color="danger">Negado</Badge> : <span className="text-xs text-muted">{'\u2014'}</span>}
                    {rule.autoUpdateEnabled && <Badge color="primary">Auto-update</Badge>}
                    <Badge color="slate">{scopeLabel(rule.scopeType)}</Badge>
                  </div>
                  {rule.reason && <p className="mt-0.5 text-xs text-muted">{rule.reason}</p>}
                  {/* `createdAt` é exposto pela API; `updatedAt` cobre respostas antigas. */}
                  <p className="mt-0.5 text-xs text-muted">Criado em {formatDate(rule.createdAt || rule.updatedAt)}</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Remover regra ${rule.packageId}`}
                  onClick={() => setDeleteTarget(rule)}
                >
                  <Icon name="delete" className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ApprovalFormModal
        open={newRuleOpen}
        onClose={() => setNewRuleOpen(false)}
        prefillInstallationType={installationType}
        prefillScopeType={scopeType}
        prefillClientId={
          scopeType === AppApprovalScopeType.Agent ? agentClientId : selectedClientId
        }
        prefillSiteId={scopeType === AppApprovalScopeType.Agent ? agentSiteId : selectedSiteId}
        prefillAgentId={scopeType === AppApprovalScopeType.Agent ? agentId : ''}
        // Criar uma regra Custom com o filtro em Winget deixava a lista vazia
        // logo depois de salvar: a aba passa a seguir o tipo da regra criada.
        onSaved={setInstallationType}
      />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover Regra" maxWidth="max-w-sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Tem certeza que deseja remover a regra de <strong className="text-foreground">{deleteTarget.packageId}</strong>?</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteTarget)} loading={deleteApproval.isPending}>Remover</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

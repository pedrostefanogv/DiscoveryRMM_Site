import { useState } from 'react';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ErrorDisplay, Loading, Modal, Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAppStoreApprovals, useDeleteApproval } from '@/hooks/useAppStore';
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
    await deleteApproval.mutateAsync({ ruleId: rule.ruleId ?? rule.id ?? '' });
    setDeleteTarget(null);
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
          {scopeType === AppApprovalScopeType.Agent && <div className="flex-1 min-w-72"><AgentPicker value={agentId} onChange={setAgentId} /></div>}
          <div className="ml-auto"><Button onClick={() => setNewRuleOpen(true)}><Plus className="h-4 w-4" /> Nova Regra</Button></div>
        </div>
      </Card>

      <Card padding={false}>
        <div className="border-b border-white/5 px-5 py-4">
          <span className="text-sm font-medium text-white">{query.data ? `${query.data.count} regra(s) — escopo ${scopeLabel(scopeType)}` : 'Regras de aprovação'}</span>
        </div>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorDisplay message="Erro ao carregar regras." onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-500"><ShieldCheck className="mb-3 h-10 w-10 opacity-30" /><p className="text-sm">Nenhuma regra encontrada para este escopo.</p></div>
        )}
        {query.data && query.data.items.length > 0 && (
          <div className="divide-y divide-white/5">
            {query.data.items.map((rule) => (
              <div key={rule.ruleId ?? rule.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white font-mono">{rule.packageId}</span>
                    {rule.packageName && <span className="text-xs text-slate-400">{rule.packageName}</span>}
                    {rule.action === AppApprovalActionType.Allow ? <Badge color="success">Permitido</Badge> : <Badge color="danger">Negado</Badge>}
                    {rule.autoUpdateEnabled && <Badge color="primary">Auto-update</Badge>}
                    <Badge color="slate">{scopeLabel(rule.scopeType)}</Badge>
                  </div>
                  {rule.reason && <p className="mt-0.5 text-xs text-slate-500">{rule.reason}</p>}
                  <p className="mt-0.5 text-xs text-slate-600">Criado em {formatDate(rule.createdAt)}</p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(rule)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ApprovalFormModal open={newRuleOpen} onClose={() => setNewRuleOpen(false)} prefillInstallationType={installationType} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover Regra" maxWidth="max-w-sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Tem certeza que deseja remover a regra de <strong className="text-white">{deleteTarget.packageId}</strong>?</p>
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

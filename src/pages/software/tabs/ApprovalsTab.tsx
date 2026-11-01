import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Icon, Badge, Button, Card, ErrorDisplay, Input, Loading, Modal, Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAppStoreResolvedApprovals, useDeleteApproval } from '@/hooks/useAppStore';
import { ApiError } from '@/api/client';
import {
  AppApprovalActionType,
  AppApprovalScopeType,
  AppInstallationType,
  type AppApprovalResolvedRule,
} from '@/api/types';
import { AgentPicker } from '../components/AgentPicker';
import { ApprovalFormModal } from '../components/ApprovalFormModal';
import { UpdateIntentModal } from '../components/UpdateIntentModal';
import {
  actionBadge,
  installationTypeOptions,
  scopeTypeOptions,
  scopeLabel,
  formatDate,
} from '../softwareStoreUtils';

/**
 * Cadeia de herança em texto: "Global: Permitido → Cliente: Permitido + Auto-update".
 * Mostra o que o escopo herda e o que ele sobrescreve — antes a aba listava só
 * as regras criadas no escopo exato e as Globais herdadas sumiam da tela.
 */
function inheritanceChain(rule: AppApprovalResolvedRule): string {
  return rule.sources
    .map((source) => {
      const autoUpdate = source.autoUpdateEnabled ? ' + Auto-update' : '';
      return `${scopeLabel(source.scopeType)}: ${actionBadge(source.action)}${autoUpdate}`;
    })
    .join(' → ');
}

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
  // Pacote que o modal deve pré-preencher (herdado → "Sobrescrever aqui").
  const [prefillPackageId, setPrefillPackageId] = useState('');
  const [prefillInstallationType, setPrefillInstallationType] = useState<AppInstallationType | undefined>();
  // Valores herdados que o override começa usando (ação/auto-update vigentes).
  const [prefillAction, setPrefillAction] = useState<AppApprovalActionType | undefined>();
  const [prefillAutoUpdate, setPrefillAutoUpdate] = useState<boolean | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  // Simulação de intenção de atualização (nada é executado; ver modal).
  const [updateIntentOpen, setUpdateIntentOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppApprovalResolvedRule | null>(null);

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

  // Escopo sem id (cliente/site/agente ainda não escolhido) não tem cadeia a
  // resolver: a consulta só liga depois da escolha — sem isso a API devolvia
  // 400 e a aba mostrava erro antes de o operador terminar o filtro.
  const scopeMissing = scopeType !== AppApprovalScopeType.Global && !scopeId;

  // Busca com debounce: a filtragem é feita no servidor (com muitas regras
  // Globais não faz sentido baixar tudo para filtrar no navegador).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sempre a visão resolvida: para Client/Site/Agente ela traz a cadeia
  // completa (herdadas + próprias), não só as regras do escopo exato.
  const query = useAppStoreResolvedApprovals(
    { scopeType, scopeId, installationType, search: debouncedSearch || undefined },
    { enabled: !scopeMissing },
  );

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: 'Selecione...' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const modalClientId =
    scopeType === AppApprovalScopeType.Agent ? agentClientId : selectedClientId;
  const modalSiteId =
    scopeType === AppApprovalScopeType.Agent ? agentSiteId : selectedSiteId;

  function openNewRule(rule?: AppApprovalResolvedRule) {
    // Sem regra: modal em branco. Com regra herdada: já vem com pacote/tipo e o
    // escopo atual, porque o objetivo é criar o override aqui.
    setPrefillPackageId(rule?.packageId ?? '');
    setPrefillInstallationType(rule?.installationType);
    // Herdado: o modal já abre com a ação/auto-update que valem hoje — o
    // operador só ajusta o que quer sobrescrever.
    setPrefillAction(rule?.action ?? undefined);
    setPrefillAutoUpdate(rule?.autoUpdateEnabled);
    setNewRuleOpen(true);
  }

  async function handleDelete(rule: AppApprovalResolvedRule) {
    const ruleId = rule.sources.find((source) => source.isEffective)?.ruleId ?? '';
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
          <div className="w-64">
            <Input
              label="Buscar pacote"
              placeholder="ID ou nome do pacote"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={() => setUpdateIntentOpen(true)}>
              <Icon name="play_circle" className="h-4 w-4" /> Simular atualizações
            </Button>
            <Button onClick={() => openNewRule()}><Icon name="add" className="h-4 w-4" /> Nova Regra</Button>
          </div>
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
          <span className="text-sm font-medium text-foreground">
            {query.data
              ? `${query.data.count} regra(s) — escopo ${scopeLabel(scopeType)}${scopeType === AppApprovalScopeType.Global ? '' : ' (inclui herdadas)'}`
              : 'Regras de aprovação'}
          </span>
        </div>
        {/* Política efetiva do escopo: com All/Disabled as regras abaixo são só
            informativas — sem este aviso o operador acha que aprovou algo. */}
        {query.data?.policy && query.data.policy !== 'PreApproved' && (
          <div className="border-b border-border bg-warning/10 px-5 py-3 text-xs text-warning">
            {query.data.policy === 'All'
              ? 'A política da loja neste escopo é "All": qualquer pacote pode ser instalado e as regras abaixo NÃO estão sendo aplicadas.'
              : 'A loja está desabilitada neste escopo: nenhuma instalação é permitida, independentemente das regras abaixo.'}
          </div>
        )}
        {scopeMissing && (
          <div className="flex flex-col items-center py-16 text-muted">
            <Icon name="verified_user" className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              Selecione {scopeType === AppApprovalScopeType.Client ? 'o cliente' : scopeType === AppApprovalScopeType.Site ? 'o cliente e o site' : 'o agente'} para ver as regras herdadas.
            </p>
          </div>
        )}
        {!scopeMissing && query.isLoading && <Loading />}
        {!scopeMissing && query.isError && <ErrorDisplay message="Erro ao carregar regras." onRetry={() => query.refetch()} />}
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
            {query.data.items.map((rule) => {
              const effectiveSource = rule.sources.find((source) => source.isEffective);
              return (
                <div key={rule.packageId} className="flex items-center justify-between px-5 py-3 hover:bg-surface-light transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground font-mono">{rule.packageId}</span>
                      {rule.packageName && <span className="text-xs text-muted">{rule.packageName}</span>}
                      {rule.action === AppApprovalActionType.Allow ? <Badge color="success">Permitido</Badge> : rule.action === AppApprovalActionType.Deny ? <Badge color="danger">Negado</Badge> : <span className="text-xs text-muted">{'—'}</span>}
                      {/* Pacote negado não tem auto-update: o badge só confundia. */}
                      {rule.action === AppApprovalActionType.Allow && rule.autoUpdateEnabled && (
                        <Badge color="primary">Auto-update</Badge>
                      )}
                      <Badge color="slate">{scopeLabel(rule.effectiveScopeType)}</Badge>
                      {rule.inherited && <Badge color="accent">Herdado</Badge>}
                      {rule.overridden && <Badge color="warning">Sobrescrito</Badge>}
                    </div>
                    {rule.overridden && (
                      <p className="mt-0.5 text-xs text-muted">{inheritanceChain(rule)}</p>
                    )}
                    {effectiveSource?.reason && <p className="mt-0.5 text-xs text-muted">{effectiveSource.reason}</p>}
                    {/* A data é a do nível que vence: é a regra que a API aplica. */}
                    {effectiveSource?.updatedAt && (
                      <p className="mt-0.5 text-xs text-muted">Atualizado em {formatDate(effectiveSource.updatedAt)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Regra herdada não pode ser removida deste escopo: o botão
                        de excluir só aparece para a regra que pertence a ele. */}
                    {rule.inherited ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Sobrescrever ${rule.packageId} neste escopo`}
                        onClick={() => openNewRule(rule)}
                      >
                        <Icon name="edit" className="h-4 w-4" /> Sobrescrever aqui
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        aria-label={`Remover regra ${rule.packageId}`}
                        onClick={() => setDeleteTarget(rule)}
                      >
                        <Icon name="delete" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ApprovalFormModal
        open={newRuleOpen}
        onClose={() => setNewRuleOpen(false)}
        prefillPackageId={prefillPackageId}
        prefillInstallationType={prefillInstallationType ?? installationType}
        prefillScopeType={scopeType}
        prefillClientId={modalClientId}
        prefillSiteId={modalSiteId}
        prefillAgentId={scopeType === AppApprovalScopeType.Agent ? agentId : ''}
        prefillAction={prefillAction}
        prefillAutoUpdate={prefillAutoUpdate}
        // Criar uma regra Custom com o filtro em Winget deixava a lista vazia
        // logo depois de salvar: a aba passa a seguir o tipo da regra criada.
        onSaved={setInstallationType}
      />

      {/* Simulação do que o auto-update faria com o escopo atual. */}
      <UpdateIntentModal
        open={updateIntentOpen}
        onClose={() => setUpdateIntentOpen(false)}
        scopeType={scopeType}
        scopeId={scopeId}
        installationType={installationType}
        search={debouncedSearch}
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

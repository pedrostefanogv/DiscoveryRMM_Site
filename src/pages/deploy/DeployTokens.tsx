import { formatDateTime } from '@/utils/format';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  Select,
  TextArea,
} from '@/components/ui';
import { DetailTabs, type DetailTab } from '@/components/entity/DetailTabs';
import {
  useCreateDeployTokenAndDownload,
  useDeployTokens,
  useDownloadDeployInstaller,
  useRevokeDeployToken,
} from '@/hooks/useDeployTokens';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useNowTick } from '@/hooks/useNowTick';
import { agentUpdatesApi, ApiError, deployTokensApi } from '@/api';
import { genericInstallerUrl } from '@/api/deploy-tokens';
import type {
  CreateDeployTokenAndDownloadRequest,
  DeployInstallerType,
  DeployToken,
} from '@/api';
import { CreateDeployTokenModal } from '@/components/entity/CreateDeployTokenModal';
import toast from 'react-hot-toast';

interface DeployTokenFormState {
  description: string | null;
  expiresInHours: number | null;
  multiUse: boolean | null;
}

type DeployTab = 'create' | 'manage';
type TokenStatus = 'active' | 'expired' | 'revoked';
type TokenStatusFilter = 'all' | TokenStatus;
type TokenPeriodFilter = 'all' | '24h' | '7d' | '30d';
type TokenSortBy = 'created-desc' | 'created-asc' | 'expires-asc' | 'expires-desc' | 'status';

const CREATION_PRESETS: Array<{
  id: string;
  label: string;
  hint: string;
  expiresInHours: number;
  multiUse: boolean;
}> = [
  { id: 'single-2h', label: 'Uso único (2h)', hint: '1 máquina · curto prazo', expiresInHours: 2, multiUse: false },
  { id: 'standard-24h', label: 'Onboarding padrão (24h)', hint: '1 máquina · 24 horas', expiresInHours: 24, multiUse: false },
  { id: 'batch-7d', label: 'Implantação em lote (7d)', hint: 'Multiuso · 7 dias', expiresInHours: 168, multiUse: true },
];

const INSTALLER_OPTIONS: Array<{
  value: DeployInstallerType;
  title: string;
  badge?: string;
  description: string;
}> = [
  {
    value: 'online',
    title: 'Instalador mínimo (.exe)',
    badge: 'Recomendado',
    description: '~2 MB — baixa os pacotes durante a instalação (requer internet).',
  },
  {
    value: 'offline',
    title: 'Pacote offline completo (.exe)',
    description: '~150 MB — inclui todos os binários para ambientes sem internet.',
  },
];

function triggerInstallerDownload(fileName: string, blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'discovery-agent-bootstrap.exe';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Baixa o instalador zero-touch (~61 MB) STREAMING DIRETO PARA O DISCO.
 *
 * O caminho antigo (fetch + response.blob()) bufferizava os 61 MB inteiros na
 * memoria do navegador antes de gravar e, pior, estava sujeito ao timeout de
 * 60s do apiFetchResponse: em conexao lenta o AbortSignal.timeout cortava o
 * download em ~13-14 MB DEPOIS do HTTP 200 ja ter sido enviado, deixando um
 * .exe truncado no disco sem nenhum erro visivel (o download "nao funcionava").
 *
 * Aqui o proprio navegador faz o GET (streaming nativo, sem buffering em JS e
 * sem timeout de fetch) e grava direto no arquivo. O endpoint e anonimo
 * ([AllowAnonymous]), entao nao precisa do header Authorization.
 */
function triggerStreamingInstallerDownload(fileName: string, url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'discovery-agent-zerotouch.exe';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const GENERIC_INSTALLER_FILE_NAME = 'discovery-agent-zerotouch.exe';

function mapInstallerFlowError(error: ApiError | null, action: 'baixar instalador') {
  if (!error) return `Não foi possível ${action}.`;

  if (error.status === 400) {
    return `Não foi possível ${action}: parâmetros ausentes ou inválidos.`;
  }

  if (error.status === 401) {
    return 'Token inválido, expirado, revogado ou sem usos disponíveis.';
  }

  if (error.status === 503) {
    return 'Instalador indisponível temporariamente. Tente novamente em instantes.';
  }

  return error.message || `Não foi possível ${action}.`;
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function getTokenStatus(token: DeployToken, revokedTokenIds: Set<string>, nowMs: number): TokenStatus {
  if (revokedTokenIds.has(token.id)) return 'revoked';
  if (token.isRevoked === true) return 'revoked';

  if (token.isExpired === true) return 'expired';
  const expiresMs = toTimestamp(token.expiresAt);
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return 'expired';

  return 'active';
}

function formatDuration(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  const minutes = Math.max(1, Math.floor(abs / 60000));

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function formatExpiryRelative(expiresAt: string | null, nowMs: number): string {
  if (!expiresAt) return 'Sem expiração';

  const expiresMs = toTimestamp(expiresAt);
  if (!Number.isFinite(expiresMs)) return 'Validade inválida';

  const delta = expiresMs - nowMs;
  if (delta >= 0) return `Expira em ${formatDuration(delta)}`;

  return `Expirou há ${formatDuration(delta)}`;
}

function statusBadge(status: TokenStatus): { label: string; color: 'success' | 'slate' | 'danger' } {
  if (status === 'active') return { label: 'Ativo', color: 'success' };
  if (status === 'expired') return { label: 'Expirado', color: 'slate' };
  return { label: 'Revogado', color: 'danger' };
}

function matchesPeriod(createdAt: string, period: TokenPeriodFilter, nowMs: number): boolean {
  if (period === 'all') return true;

  const createdMs = toTimestamp(createdAt);
  if (!Number.isFinite(createdMs)) return false;

  const deltaByPeriod: Record<Exclude<TokenPeriodFilter, 'all'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  return createdMs >= nowMs - deltaByPeriod[period];
}

export default function DeployTokens() {
  const [searchParams, setSearchParams] = useSearchParams();
  const createAndDownload = useCreateDeployTokenAndDownload();
  const revokeToken = useRevokeDeployToken();
  const [revokeTarget, setRevokeTarget] = useState<{ token: DeployToken; message: string } | null>(null);
  const downloadInstaller = useDownloadDeployInstaller();

  const initialTab = searchParams.get('tab') === 'manage' ? 'manage' : 'create';
  const [activeTab, setActiveTab] = useState<DeployTab>(initialTab);
  const [selectedClientId, setSelectedClientId] = useState(() => searchParams.get('client') ?? '');
  const [selectedSiteId, setSelectedSiteId] = useState(() => searchParams.get('site') ?? '');
  const [installerType, setInstallerType] = useState<DeployInstallerType>('online');

  const [form, setForm] = useState<DeployTokenFormState>({
    description: null,
    expiresInHours: 24,
    multiUse: false,
  });

  const [downloadingTokenId, setDownloadingTokenId] = useState<string | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [revokedTokenIds, setRevokedTokenIds] = useState<Set<string>>(new Set());
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);
  // A API não expõe o token cru na listagem; o download por token exige que o
  // operador informe o valor original (única fonte confiável do segredo).
  const [downloadPrompt, setDownloadPrompt] = useState<DeployToken | null>(null);
  const [downloadPromptValue, setDownloadPromptValue] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [tokenSearch, setTokenSearch] = useState('');
  const deferredTokenSearch = useDeferredValue(tokenSearch);
  const [statusFilter, setStatusFilter] = useState<TokenStatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<TokenPeriodFilter>('all');
  const [sortBy, setSortBy] = useState<TokenSortBy>('created-desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const clients = useClients(false);
  const sites = useSites(selectedClientId, false);
  const hasScope = Boolean(selectedClientId && selectedSiteId);
  const deployTokens = useDeployTokens(
    { clientId: selectedClientId, siteId: selectedSiteId },
    { enabled: activeTab === 'manage' && hasScope },
  );

  const activeClients = useMemo(
    () => (clients.data ?? []).filter(client => client.isActive),
    [clients.data],
  );
  const activeSites = useMemo(
    () => (sites.data ?? []).filter(site => site.isActive),
    [sites.data],
  );
  const nowMs = useNowTick(60_000);

  // Auto-seleciona cliente/site único ativo quando não há seleção definida.
  useEffect(() => {
    if (!selectedClientId && activeClients.length === 1) {
      setSelectedClientId(activeClients[0].id);
    }
  }, [activeClients, selectedClientId]);

  useEffect(() => {
    if (selectedClientId && !selectedSiteId && activeSites.length === 1) {
      setSelectedSiteId(activeSites[0].id);
    }
  }, [activeSites, selectedClientId, selectedSiteId]);

  // Sincroniza escopo e aba ativa com a URL.
  useEffect(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (selectedClientId) next.set('client', selectedClientId);
        else next.delete('client');

        if (selectedSiteId) next.set('site', selectedSiteId);
        else next.delete('site');

        if (activeTab === 'manage') next.set('tab', 'manage');
        else next.delete('tab');

        return next;
      },
      { replace: true },
    );
  }, [activeTab, selectedClientId, selectedSiteId, setSearchParams]);

  const listedTokens = useMemo(
    () => [...(deployTokens.data ?? [])].sort(
      (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
    ),
    [deployTokens.data],
  );

  const tokenStats = useMemo(() => {
    const accumulator = {
      total: listedTokens.length,
      active: 0,
      expired: 0,
      revoked: 0,
      expiringSoon: 0,
    };

    for (const token of listedTokens) {
      const status = getTokenStatus(token, revokedTokenIds, nowMs);
      if (status === 'active') accumulator.active += 1;
      if (status === 'expired') accumulator.expired += 1;
      if (status === 'revoked') accumulator.revoked += 1;

      const expiresMs = toTimestamp(token.expiresAt);
      if (status === 'active' && Number.isFinite(expiresMs) && expiresMs > nowMs && expiresMs <= nowMs + (24 * 60 * 60 * 1000)) {
        accumulator.expiringSoon += 1;
      }
    }

    return accumulator;
  }, [listedTokens, revokedTokenIds, nowMs]);

  const filteredTokens = useMemo(() => {
    const normalizedSearch = deferredTokenSearch.trim().toLowerCase();

    const filtered = listedTokens.filter(token => {
      const status = getTokenStatus(token, revokedTokenIds, nowMs);

      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!matchesPeriod(token.createdAt, periodFilter, nowMs)) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        token.id,
        token.description ?? '',
        token.tokenPrefix,
      ].join(' ').toLowerCase();

      return searchable.includes(normalizedSearch);
    });

    const sorted = [...filtered].sort((left, right) => {
      const leftCreated = toTimestamp(left.createdAt);
      const rightCreated = toTimestamp(right.createdAt);
      const leftExpires = toTimestamp(left.expiresAt);
      const rightExpires = toTimestamp(right.expiresAt);

      if (sortBy === 'created-desc') return rightCreated - leftCreated;
      if (sortBy === 'created-asc') return leftCreated - rightCreated;

      if (sortBy === 'expires-asc') {
        const leftWeight = Number.isFinite(leftExpires) ? leftExpires : Number.POSITIVE_INFINITY;
        const rightWeight = Number.isFinite(rightExpires) ? rightExpires : Number.POSITIVE_INFINITY;
        return leftWeight - rightWeight;
      }

      if (sortBy === 'expires-desc') {
        const leftWeight = Number.isFinite(leftExpires) ? leftExpires : Number.NEGATIVE_INFINITY;
        const rightWeight = Number.isFinite(rightExpires) ? rightExpires : Number.NEGATIVE_INFINITY;
        return rightWeight - leftWeight;
      }

      const rank: Record<TokenStatus, number> = {
        active: 0,
        expired: 1,
        revoked: 2,
      };

      const leftStatus = getTokenStatus(left, revokedTokenIds, nowMs);
      const rightStatus = getTokenStatus(right, revokedTokenIds, nowMs);
      if (rank[leftStatus] !== rank[rightStatus]) return rank[leftStatus] - rank[rightStatus];

      return rightCreated - leftCreated;
    });

    return sorted;
  }, [listedTokens, revokedTokenIds, nowMs, statusFilter, periodFilter, sortBy, deferredTokenSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const pagedTokens = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTokens.slice(start, start + pageSize);
  }, [filteredTokens, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, periodFilter, sortBy, deferredTokenSearch, pageSize, selectedClientId, selectedSiteId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const refreshAgentUpdateBuild = useMutation({
    mutationFn: () => agentUpdatesApi.refreshBuild(),
    onSuccess: () => {
      toast.success('Rebuild do agente de atualização iniciado.');
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o rebuild do agente de atualização.';
      toast.error(message);
    },
  });

  const downloadGenericInstaller = useMutation({
    // Sonda antes de navegar: um <a href> puro transforma um 503/500 (a API
    // devolve JSON quando nao ha build disponivel ou o build falha) numa
    // navegacao para o corpo do erro — e o toast diria "iniciado" mesmo assim.
    mutationFn: () => deployTokensApi.probeGenericInstaller(),
    onSuccess: () => {
      // Streaming direto para o disco: sem buffering dos ~61 MB em memoria e sem
      // o timeout de 60s do apiFetchResponse que truncava o arquivo em ~13-14 MB
      // (ver triggerStreamingInstallerDownload).
      triggerStreamingInstallerDownload(
        GENERIC_INSTALLER_FILE_NAME,
        genericInstallerUrl(),
      );
      toast.success('Download do instalador zero-touch iniciado.');
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError
        ? error.message
        : 'Não foi possível baixar o instalador zero-touch.';
      toast.error(message);
    },
  });

  function handleDownloadGenericInstaller() {
    downloadGenericInstaller.mutate();
  }

  function resetListingState() {
    setRevokedTokenIds(new Set());
    setDownloadPrompt(null);
    setDownloadPromptValue('');
    setPage(1);
  }

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedSiteId('');
    resetListingState();
  }

  function handleSiteChange(siteId: string) {
    setSelectedSiteId(siteId);
    resetListingState();
  }

  function applyCreationPreset(preset: Partial<DeployTokenFormState>) {
    setForm(current => ({ ...current, ...preset }));
  }

  function buildDownloadPayload(): CreateDeployTokenAndDownloadRequest {
    return {
      clientId: selectedClientId,
      siteId: selectedSiteId,
      description: form.description?.trim() ? form.description.trim() : null,
      expiresInHours: form.expiresInHours,
      multiUse: form.multiUse,
      installerType,
    };
  }

  function handleCreateAndDownload() {
    if (!selectedClientId) {
      toast.error('Selecione o cliente.');
      return;
    }
    if (!selectedSiteId) {
      toast.error('Selecione o site.');
      return;
    }
    if (
      form.expiresInHours !== null &&
      (!Number.isInteger(form.expiresInHours) || form.expiresInHours < 1 || form.expiresInHours > 8760)
    ) {
      toast.error('Informe uma validade entre 1 e 8760 horas.');
      return;
    }

    createAndDownload.mutate(buildDownloadPayload(), {
      onSuccess: result => {
        triggerInstallerDownload(result.fileName, result.blob);
        toast.success('Instalador gerado com sucesso. Download iniciado.');
        void deployTokens.refetch();
      },
      onError: error => {
        const msg = error instanceof ApiError ? error.message : 'Erro ao gerar instalador.';
        toast.error(msg);
      },
    });
  }

  function handleDownloadInstallerByToken(tokenId: string, rawToken: string) {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) return;

    setDownloadingTokenId(tokenId);

    downloadInstaller.mutate(
      {
        rawToken: normalizedToken,
        installerType,
      },
      {
        onSuccess: result => {
          triggerInstallerDownload(result.fileName, result.blob);
          toast.success('Download iniciado com sucesso.');
          setDownloadPrompt(null);
          setDownloadPromptValue('');
        },
        onError: error => {
          toast.error(mapInstallerFlowError(error, 'baixar instalador'));
        },
        onSettled: () => {
          setDownloadingTokenId(null);
        },
      },
    );
  }

  function handleRevokeToken(token: DeployToken) {
    const createdAt = formatDateTime(token.createdAt);
    const expiresAt = token.expiresAt
      ? formatDateTime(token.expiresAt)
      : 'Sem expiração';

    const confirmation = [
      `Token (prefixo): ${token.tokenPrefix}`,
      `Criado em: ${createdAt}`,
      `Validade: ${expiresAt}`,
      'Após revogar, downloads com este token deixam de funcionar.',
    ].join(' · ');

    setRevokeTarget({ token, message: confirmation });
  }

  function handleConfirmRevokeToken() {
    if (!revokeTarget) return;
    const { token } = revokeTarget;
    setRevokingTokenId(token.id);
    revokeToken.mutate(token.id, {
      onSuccess: () => {
        setRevokedTokenIds(previous => {
          const next = new Set(previous);
          next.add(token.id);
          return next;
        });
        setRevokeTarget(null);
        toast.success('Deploy token revogado com sucesso.');
      },
      onError: error => {
        toast.error(error.message || 'Não foi possível revogar o deploy token.');
      },
      onSettled: () => {
        setRevokingTokenId(null);
      },
    });
  }

  async function handleCopyPrefix(token: DeployToken) {
    if (!token.tokenPrefix) return;
    try {
      await navigator.clipboard.writeText(token.tokenPrefix);
      setCopiedPrefixId(token.id);
      window.setTimeout(() => setCopiedPrefixId(current => (current === token.id ? null : current)), 2000);
    } catch {
      toast.error('Não foi possível copiar o prefixo.');
    }
  }

  const tabs: DetailTab<DeployTab>[] = [
    { id: 'create', label: 'Criar instalador / token', icon: 'add_circle' },
    {
      id: 'manage',
      label: 'Gerenciar tokens',
      icon: 'list',
      badge: hasScope && deployTokens.data ? tokenStats.active : undefined,
    },
  ];

  const hasActiveFilters =
    Boolean(tokenSearch.trim()) ||
    statusFilter !== 'all' ||
    periodFilter !== 'all' ||
    sortBy !== 'created-desc';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instalação de Agentes"
        description="Console de provisionamento com criação e gestão operacional de deploy tokens."
      >
        <Button
          variant="secondary"
          onClick={handleDownloadGenericInstaller}
          loading={downloadGenericInstaller.isPending}
        >
          <Icon name="download" className="h-4 w-4" />
          Baixar instalador zero-touch
        </Button>
        <Button
          variant="secondary"
          onClick={() => refreshAgentUpdateBuild.mutate()}
          loading={refreshAgentUpdateBuild.isPending}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Rebuildar agente de atualização
        </Button>
      </PageHeader>

      <Card>
        <CardHeader
          title="Escopo de operação"
          subtitle="Selecione cliente e site para criar ou gerenciar tokens de instalação."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Cliente"
            value={selectedClientId}
            onChange={e => handleClientChange(e.target.value)}
            options={[
              { value: '', label: clients.isLoading ? 'Carregando clientes...' : 'Selecione um cliente' },
              ...activeClients.map(client => ({ value: client.id, label: client.name })),
            ]}
          />
          <Select
            label="Site"
            value={selectedSiteId}
            disabled={!selectedClientId || sites.isLoading}
            onChange={e => handleSiteChange(e.target.value)}
            options={[
              {
                value: '',
                label: !selectedClientId
                  ? 'Selecione um cliente primeiro'
                  : sites.isLoading
                    ? 'Carregando sites...'
                    : 'Selecione um site',
              },
              ...activeSites.map(site => ({ value: site.id, label: site.name })),
            ]}
          />
        </div>
      </Card>

      <DetailTabs
        tabs={tabs}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Seções de implantação de agentes"
        panelIdPrefix="deploy-tabs"
      />

      <div
        id="deploy-tabs-panel"
        role="tabpanel"
        aria-labelledby={`deploy-tabs-tab-${activeTab}`}
      >
        {activeTab === 'create' ? (
          <Card>
            <CardHeader
              title="Criar agente para instalação"
              subtitle="Gere apenas o token ou baixe o instalador mínimo / pacote completo para onboarding."
            />
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Presets rápidos
                </div>
                <div className="flex flex-wrap gap-2">
                  {CREATION_PRESETS.map(preset => {
                    const isActive =
                      form.expiresInHours === preset.expiresInHours &&
                      Boolean(form.multiUse) === preset.multiUse;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          applyCreationPreset({
                            multiUse: preset.multiUse,
                            expiresInHours: preset.expiresInHours,
                          })
                        }
                        aria-pressed={isActive}
                        className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground'
                        }`}
                      >
                        <div className="text-xs font-medium">{preset.label}</div>
                        <div className="text-[11px] opacity-80">{preset.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">
                  Tipo de instalador para download
                </span>
                <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Tipo de instalador">
                  {INSTALLER_OPTIONS.map(option => {
                    const selected = installerType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setInstallerType(option.value)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-surface-light hover:border-border-strong'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{option.title}</span>
                          {option.badge && <Badge color="primary">{option.badge}</Badge>}
                        </div>
                        <p className="text-xs text-muted">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <TextArea
                label="Descrição"
                placeholder="Ex: Onboarding notebooks filial SP"
                value={form.description ?? ''}
                onChange={e => setForm(current => ({ ...current, description: e.target.value || null }))}
                rows={2}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Expira em (horas)"
                  type="number"
                  min={1}
                  max={8760}
                  value={form.expiresInHours ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    setForm(current => ({ ...current, expiresInHours: raw === '' ? null : Number(raw) }));
                  }}
                />
                <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl border border-border bg-surface-light px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(form.multiUse)}
                    onChange={e => setForm(current => ({ ...current, multiUse: e.target.checked }))}
                    className="rounded border-border bg-surface-light"
                  />
                  Permitir multiuso (várias máquinas)
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setCreateModalOpen(true)}
                  disabled={!selectedClientId}
                >
                  <Icon name="key" className="h-4 w-4" />
                  Gerar token
                </Button>
                <Button
                  onClick={handleCreateAndDownload}
                  loading={createAndDownload.isPending}
                  disabled={!selectedClientId || !selectedSiteId}
                >
                  <Icon name="download" className="h-4 w-4" />
                  {installerType === 'offline' ? 'Baixar pacote completo (.exe)' : 'Baixar instalador mínimo (.exe)'}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Gerenciar tokens emitidos"
                subtitle={
                  hasScope
                    ? 'Acompanhe status, validade e ações por token do escopo selecionado.'
                    : 'Selecione cliente e site acima para visualizar os tokens emitidos.'
                }
                action={
                  hasScope ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void deployTokens.refetch()}
                      loading={deployTokens.isFetching}
                    >
                      <Icon name="refresh" className="h-4 w-4" />
                      Atualizar
                    </Button>
                  ) : undefined
                }
              />

              {!hasScope ? (
                <div className="rounded-xl border border-dashed border-border-strong bg-surface-light px-4 py-5 text-sm text-muted">
                  Selecione um <strong>Cliente</strong> e um <strong>Site</strong> no escopo acima para listar os tokens automaticamente.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      label="Total carregados"
                      value={tokenStats.total}
                      tone="slate"
                      active={statusFilter === 'all'}
                      onClick={() => setStatusFilter('all')}
                    />
                    <MetricCard
                      label="Ativos"
                      value={tokenStats.active}
                      tone="success"
                      active={statusFilter === 'active'}
                      onClick={() => setStatusFilter(current => (current === 'active' ? 'all' : 'active'))}
                    />
                    <MetricCard
                      label="Expirados"
                      value={tokenStats.expired}
                      tone="slate"
                      active={statusFilter === 'expired'}
                      onClick={() => setStatusFilter(current => (current === 'expired' ? 'all' : 'expired'))}
                    />
                    <MetricCard
                      label="Revogados"
                      value={tokenStats.revoked}
                      tone="danger"
                      active={statusFilter === 'revoked'}
                      onClick={() => setStatusFilter(current => (current === 'revoked' ? 'all' : 'revoked'))}
                    />
                    <MetricCard
                      label="Expiram em 24h"
                      value={tokenStats.expiringSoon}
                      tone="warning"
                      onClick={() => setStatusFilter('active')}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <div className="relative xl:col-span-2">
                      <Input
                        label="Busca"
                        placeholder="Descrição, ID ou prefixo do token"
                        value={tokenSearch}
                        onChange={e => setTokenSearch(e.target.value)}
                      />
                      {tokenSearch && (
                        <button
                          type="button"
                          onClick={() => setTokenSearch('')}
                          aria-label="Limpar busca de tokens"
                          className="absolute right-2.5 bottom-2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                        >
                          <Icon name="close" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Select
                      label="Status"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as TokenStatusFilter)}
                      options={[
                        { value: 'all', label: 'Todos' },
                        { value: 'active', label: 'Ativo' },
                        { value: 'expired', label: 'Expirado' },
                        { value: 'revoked', label: 'Revogado' },
                      ]}
                    />
                    <Select
                      label="Período"
                      value={periodFilter}
                      onChange={e => setPeriodFilter(e.target.value as TokenPeriodFilter)}
                      options={[
                        { value: 'all', label: 'Sem recorte' },
                        { value: '24h', label: 'Últimas 24h' },
                        { value: '7d', label: 'Últimos 7 dias' },
                        { value: '30d', label: 'Últimos 30 dias' },
                      ]}
                    />
                    <Select
                      label="Ordenação"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as TokenSortBy)}
                      options={[
                        { value: 'created-desc', label: 'Mais recentes' },
                        { value: 'created-asc', label: 'Mais antigos' },
                        { value: 'expires-asc', label: 'Expira primeiro' },
                        { value: 'expires-desc', label: 'Expira por último' },
                        { value: 'status', label: 'Status' },
                      ]}
                    />
                    <Select
                      label="Instalador ao baixar"
                      value={installerType}
                      onChange={e => setInstallerType(e.target.value as DeployInstallerType)}
                      options={[
                        { value: 'online', label: 'Mínimo (~2 MB)' },
                        { value: 'offline', label: 'Offline (~150 MB)' },
                      ]}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                    <span>
                      {filteredTokens.length} {filteredTokens.length === 1 ? 'token' : 'tokens'} após filtros
                    </span>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTokenSearch('');
                          setStatusFilter('all');
                          setPeriodFilter('all');
                          setSortBy('created-desc');
                        }}
                      >
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {hasScope && (
              <Card>
                {deployTokens.isLoading && listedTokens.length === 0 ? (
                  <Loading message="Carregando deploy tokens..." />
                ) : deployTokens.isError ? (
                  <ErrorDisplay
                    message="Não foi possível carregar os deploy tokens."
                    onRetry={() => void deployTokens.refetch()}
                  />
                ) : filteredTokens.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-strong bg-surface-light px-4 py-5 text-sm text-muted">
                    {listedTokens.length === 0
                      ? 'Nenhum deploy token emitido para este site.'
                      : 'Nenhum token corresponde aos filtros atuais.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagedTokens.map(token => {
                      const status = getTokenStatus(token, revokedTokenIds, nowMs);
                      const statusUi = statusBadge(status);
                      const isRevoked = status === 'revoked';
                      const canDownload = status === 'active';

                      return (
                        <div
                          key={token.id}
                          className="rounded-xl border border-border bg-surface-light p-4"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge color={statusUi.color}>{statusUi.label}</Badge>
                                <Badge color="slate">Usos: {token.usedCount ?? 0}</Badge>
                                <Badge color="slate">Criado em {formatDateTime(token.createdAt)}</Badge>
                                <Badge color={status === 'active' ? 'warning' : 'slate'}>
                                  {formatExpiryRelative(token.expiresAt, nowMs)}
                                </Badge>
                              </div>

                              {token.description ? (
                                <p className="text-sm text-foreground">{token.description}</p>
                              ) : (
                                <p className="text-sm text-muted">Sem descrição</p>
                              )}

                              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                                <p className="min-w-0 break-all font-mono text-xs text-foreground">
                                  {token.tokenPrefix || '—'}
                                  <span className="ml-2 text-muted">(prefixo público — o token completo não é exposto)</span>
                                </p>
                                {token.tokenPrefix && (
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyPrefix(token)}
                                    aria-label={`Copiar prefixo ${token.tokenPrefix}`}
                                    title="Copiar prefixo"
                                    className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                                  >
                                    <Icon
                                      name={copiedPrefixId === token.id ? 'check' : 'content_copy'}
                                      className="h-3.5 w-3.5"
                                    />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-start gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setDownloadPrompt(token);
                                  setDownloadPromptValue('');
                                }}
                                disabled={!canDownload}
                              >
                                <Icon name="download" className="h-4 w-4" />
                                Baixar {installerType === 'offline' ? 'pacote offline' : 'instalador mínimo'}
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted hover:text-danger"
                                onClick={() => handleRevokeToken(token)}
                                loading={revokingTokenId === token.id}
                                disabled={isRevoked}
                              >
                                <Icon name="block" className="h-4 w-4" />
                                Revogar
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <Select
                        label="Itens por página"
                        value={String(pageSize)}
                        onChange={e => setPageSize(Number(e.target.value) || 10)}
                        options={[
                          { value: '10', label: '10 por página' },
                          { value: '20', label: '20 por página' },
                          { value: '50', label: '50 por página' },
                        ]}
                      />
                      <Pagination
                        className="flex-1"
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        totalItems={filteredTokens.length}
                        pageSize={pageSize}
                      />
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      <Modal
        open={downloadPrompt !== null}
        onClose={() => {
          if (downloadingTokenId !== null) return;
          setDownloadPrompt(null);
          setDownloadPromptValue('');
        }}
        title="Baixar instalador com token"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            O token completo não é exposto na listagem. Informe o token original (gerado no momento da criação)
            para baixar o instalador do token de prefixo{' '}
            <strong className="font-mono">{downloadPrompt?.tokenPrefix || '—'}</strong>.
          </p>
          <Input
            label="Token"
            value={downloadPromptValue}
            onChange={e => setDownloadPromptValue(e.target.value)}
            placeholder="Cole o token completo"
            disabled={downloadingTokenId !== null}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDownloadPrompt(null);
                setDownloadPromptValue('');
              }}
              disabled={downloadingTokenId !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const target = downloadPrompt;
                if (!target) return;
                handleDownloadInstallerByToken(target.id, downloadPromptValue);
              }}
              disabled={!downloadPromptValue.trim() || downloadingTokenId !== null}
              loading={downloadingTokenId !== null}
            >
              Baixar
            </Button>
          </div>
        </div>
      </Modal>

      <CreateDeployTokenModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        clientId={selectedClientId}
        sites={activeSites.map(site => ({ id: site.id, name: site.name }))}
        defaultSiteId={selectedSiteId}
        onCreated={() => void deployTokens.refetch()}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revogar deploy token"
        message={revokeTarget?.message ?? ''}
        confirmLabel="Revogar"
        tone="danger"
        isLoading={revokeToken.isPending}
        onConfirm={handleConfirmRevokeToken}
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'success' | 'warning' | 'danger';
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass: Record<typeof tone, string> = {
    slate: 'text-foreground border-border bg-surface-light',
    success: 'text-success border-success/30 bg-success/10',
    warning: 'text-warning border-warning/30 bg-warning/10',
    danger: 'text-danger border-danger/30 bg-danger/10',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-xl border px-3 py-2 text-left transition-all hover:brightness-105 ${toneClass[tone]} ${
        active ? 'ring-2 ring-primary/50' : ''
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </button>
  );
}

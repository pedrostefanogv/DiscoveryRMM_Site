import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Download, KeyRound } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Input, Select, TextArea } from '@/components/ui';
import {
  useCreateDeployToken,
  useDeployTokens,
  useDownloadDeployInstaller,
  useRevokeDeployToken,
} from '@/hooks/useDeployTokens';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import {
  agentUpdatesApi,
  ApiError,
  deployTokensApi,
  LogLevel,
  LogSource,
  LogType,
  logsApi,
} from '@/api';
import type {
  CreateDeployTokenRequest,
  DeployInstallerType,
  DeployToken,
  DeployTokenDelivery,
  ListDeployTokensParams,
} from '@/api';
import toast from 'react-hot-toast';

interface DeployTokenFormState {
  description: string | null;
  expiresInHours: number | null;
  multiUse: boolean | null;
  delivery: DeployTokenDelivery;
}

type DeployTab = 'create' | 'manage';
type TokenStatus = 'active' | 'expired' | 'revoked';
type TokenStatusFilter = 'all' | TokenStatus;
type TokenUsageFilter = 'all' | 'single' | 'multi';
type TokenPeriodFilter = 'all' | '24h' | '7d' | '30d';
type TokenSortBy = 'created-desc' | 'created-asc' | 'expires-asc' | 'expires-desc' | 'status';

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
  if (token.revokedAt) return 'revoked';
  if (token.isActive === false) return 'revoked';

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

function shortenToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export default function DeployTokens() {
  const createToken = useCreateDeployToken();
  const revokeToken = useRevokeDeployToken();
  const downloadInstaller = useDownloadDeployInstaller();

  const [activeTab, setActiveTab] = useState<DeployTab>('create');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [installerType, setInstallerType] = useState<DeployInstallerType>('online');

  const [form, setForm] = useState<DeployTokenFormState>({
    description: null,
    expiresInHours: 24,
    multiUse: false,
    delivery: 'installer',
  });

  const [downloadingTokenId, setDownloadingTokenId] = useState<string | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [visibleTokenIds, setVisibleTokenIds] = useState<Set<string>>(new Set());
  const [revokedTokenIds, setRevokedTokenIds] = useState<Set<string>>(new Set());
  const [openActionsForTokenId, setOpenActionsForTokenId] = useState<string | null>(null);

  const [tokensFilter, setTokensFilter] = useState<ListDeployTokensParams | null>(null);
  const [tokenSearch, setTokenSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TokenStatusFilter>('all');
  const [usageFilter, setUsageFilter] = useState<TokenUsageFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<TokenPeriodFilter>('all');
  const [sortBy, setSortBy] = useState<TokenSortBy>('created-desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const clients = useClients(false);
  const sites = useSites(selectedClientId, false);
  const deployTokens = useDeployTokens(tokensFilter ?? {}, { enabled: tokensFilter !== null });

  const activeClients = (clients.data ?? []).filter(client => client.isActive);
  const activeSites = (sites.data ?? []).filter(site => site.isActive);
  const nowMs = Date.now();

  const listedTokens = useMemo(
    () => [...(deployTokens.data ?? [])].sort(
      (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
    ),
    [deployTokens.data],
  );

  const generatedToken = createToken.data && 'token' in createToken.data ? createToken.data : null;

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
    const normalizedSearch = tokenSearch.trim().toLowerCase();

    const filtered = listedTokens.filter(token => {
      const status = getTokenStatus(token, revokedTokenIds, nowMs);

      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (usageFilter === 'single' && token.multiUse) return false;
      if (usageFilter === 'multi' && !token.multiUse) return false;
      if (!matchesPeriod(token.createdAt, periodFilter, nowMs)) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        token.id,
        token.description ?? '',
        token.token,
        shortenToken(token.token),
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
  }, [listedTokens, revokedTokenIds, nowMs, statusFilter, usageFilter, periodFilter, sortBy, tokenSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const pagedTokens = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTokens.slice(start, start + pageSize);
  }, [filteredTokens, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, usageFilter, periodFilter, sortBy, tokenSearch, pageSize, tokensFilter]);

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

  const emitInstallerTelemetry = async (
    eventName: string,
    level: LogLevel,
    data: Record<string, unknown>,
  ) => {
    try {
      await logsApi.create({
        clientId: selectedClientId || null,
        siteId: selectedSiteId || null,
        agentId: null,
        type: LogType.Application,
        level,
        source: LogSource.Portal,
        message: `deploy.installer.${eventName}`,
        dataJson: data,
      });
    } catch {
      // Telemetria não deve bloquear o fluxo principal.
    }
  };

  const downloadGenericInstaller = useMutation({
    mutationFn: () => deployTokensApi.downloadGenericInstaller(),
    onSuccess: (result) => {
      triggerInstallerDownload(result.fileName, result.blob);
      toast.success('Instalador zero-touch baixado com sucesso.');
    },
    onError: (error: unknown) => {
      const message = error instanceof ApiError
        ? error.message
        : 'Não foi possível baixar o instalador zero-touch.';
      toast.error(message);
    },
  });

  function handleDownloadGenericInstaller() {
    emitInstallerTelemetry('generic_download_started', LogLevel.Info, {});
    downloadGenericInstaller.mutate();
  }

  function resetListingState() {
    setTokensFilter(null);
    setVisibleTokenIds(new Set());
    setRevokedTokenIds(new Set());
    setOpenActionsForTokenId(null);
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

  function handleCreate() {
    if (!selectedClientId) {
      toast.error('Selecione o cliente.');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Selecione o site.');
      return;
    }

    const payload: CreateDeployTokenRequest = {
      clientId: selectedClientId,
      siteId: selectedSiteId,
      description: form.description?.trim() ? form.description.trim() : null,
      expiresInHours: form.expiresInHours,
      multiUse: form.multiUse,
      delivery: form.delivery,
    };

    createToken.mutate(payload, {
      onSuccess: (result) => {
        if ('token' in result) {
          toast.success('Token de deploy criado com sucesso.');
          return;
        }

        triggerInstallerDownload(result.fileName, result.blob);
        toast.success('Instalador gerado com sucesso. Download iniciado.');
      },
      onError: () => toast.error('Erro ao criar token de deploy.'),
    });
  }

  function handleLoadIssuedTokens() {
    if (!selectedClientId) {
      toast.error('Selecione o cliente.');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Selecione o site.');
      return;
    }

    const nextFilter: ListDeployTokensParams = {
      clientId: selectedClientId,
      siteId: selectedSiteId,
    };

    const sameFilter =
      tokensFilter?.clientId === nextFilter.clientId
      && tokensFilter?.siteId === nextFilter.siteId;

    if (sameFilter) {
      void deployTokens.refetch();
      return;
    }

    setVisibleTokenIds(new Set());
    setRevokedTokenIds(new Set());
    setOpenActionsForTokenId(null);
    setTokensFilter(nextFilter);
  }

  function handleDownloadInstallerByToken(tokenId: string, rawToken: string) {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) return;

    setDownloadingTokenId(tokenId);
    emitInstallerTelemetry('download_started', LogLevel.Info, {
      tokenId,
      installerType,
    });

    downloadInstaller.mutate(
      {
        rawToken: normalizedToken,
        installerType,
      },
      {
        onSuccess: (result) => {
          triggerInstallerDownload(result.fileName, result.blob);
          toast.success('Download iniciado com sucesso.');
          emitInstallerTelemetry('download_succeeded', LogLevel.Info, {
            tokenId,
            installerType,
            fileName: result.fileName,
          });
        },
        onError: (error) => {
          toast.error(mapInstallerFlowError(error, 'baixar instalador'));
          emitInstallerTelemetry('download_failed', LogLevel.Error, {
            tokenId,
            installerType,
            status: error.status,
            reason: error.message,
          });
        },
        onSettled: () => {
          setDownloadingTokenId(null);
        },
      },
    );
  }

  function toggleTokenVisibility(tokenId: string) {
    setVisibleTokenIds(previous => {
      const next = new Set(previous);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  }

  async function handleCopyToken(tokenValue: string) {
    try {
      await navigator.clipboard.writeText(tokenValue);
      toast.success('Token copiado para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar o token.');
    }
  }

  function handleRevokeToken(token: DeployToken) {
    const createdAt = new Date(token.createdAt).toLocaleString('pt-BR');
    const expiresAt = token.expiresAt
      ? new Date(token.expiresAt).toLocaleString('pt-BR')
      : 'Sem expiração';

    const confirmation = [
      'Revogar este deploy token?',
      '',
      `Token: ${shortenToken(token.token)}`,
      `Criado em: ${createdAt}`,
      `Validade: ${expiresAt}`,
      '',
      'Após revogar, downloads com este token deixam de funcionar.',
    ].join('\n');

    if (!window.confirm(confirmation)) return;

    setRevokingTokenId(token.id);
    revokeToken.mutate(token.id, {
      onSuccess: () => {
        setRevokedTokenIds(previous => {
          const next = new Set(previous);
          next.add(token.id);
          return next;
        });
        setOpenActionsForTokenId(null);
        toast.success('Deploy token revogado com sucesso.');
      },
      onError: (error) => {
        toast.error(error.message || 'Não foi possível revogar o deploy token.');
      },
      onSettled: () => {
        setRevokingTokenId(null);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instalação de Agentes</h1>
          <p className="text-sm text-muted">Console de provisionamento com criação e gestão operacional de deploy tokens.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleDownloadGenericInstaller}
            loading={downloadGenericInstaller.isPending}
          >
            <Download className="h-4 w-4" />
            Baixar instalador zero-touch
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              refreshAgentUpdateBuild.mutate();
            }}
            loading={refreshAgentUpdateBuild.isPending}
          >
            Rebuildar agente de atualização
          </Button>
        </div>
      </div>

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
              ...(activeClients.map(client => ({ value: client.id, label: client.name }))),
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
              ...(activeSites.map(site => ({ value: site.id, label: site.name }))),
            ]}
          />
        </div>
      </Card>

      <div className="inline-flex rounded-xl border border-border bg-surface-light p-1">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'create' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Criar token
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manage')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'manage' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Gerenciar tokens
        </button>
      </div>

      {activeTab === 'create' ? (
        <>
          <Card>
            <CardHeader
              title="Criar agente para instalação"
              subtitle="Gere token e instalador para onboarding de novos agentes."
            />
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-muted">Presets rápidos</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => applyCreationPreset({
                      delivery: 'installer',
                      multiUse: false,
                      expiresInHours: 24,
                    })}
                  >
                    Onboarding padrão (24h)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => applyCreationPreset({
                      delivery: 'installer',
                      multiUse: true,
                      expiresInHours: 168,
                    })}
                  >
                    Implantação em lote (7d)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => applyCreationPreset({
                      delivery: 'token',
                      multiUse: false,
                      expiresInHours: 24,
                    })}
                  >
                    Somente token
                  </Button>
                </div>
              </div>

              <TextArea
                label="Descrição"
                placeholder="Ex: Onboarding notebooks filial SP"
                value={form.description ?? ''}
                onChange={e => setForm(current => ({ ...current, description: e.target.value || null }))}
                rows={3}
              />

              <Select
                label="Entrega"
                value={form.delivery}
                onChange={e => setForm(current => ({ ...current, delivery: e.target.value as DeployTokenDelivery }))}
                options={[
                  { value: 'token', label: 'Somente token' },
                  { value: 'installer', label: 'Token + download do instalador mínimo (.exe)' },
                  { value: 'full-installer', label: 'Token + download do instalador completo (.exe)' },
                ]}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Expira em (horas)"
                  type="number"
                  min={1}
                  value={form.expiresInHours ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    setForm(current => ({ ...current, expiresInHours: raw === '' ? null : Number(raw) }));
                  }}
                />
                <label className="flex items-center gap-2 self-end rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(form.multiUse)}
                    onChange={e => setForm(current => ({ ...current, multiUse: e.target.checked }))}
                    className="rounded border-border bg-surface-light"
                  />
                  Permitir multiuso
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleCreate}
                  loading={createToken.isPending}
                  disabled={!selectedClientId || !selectedSiteId}
                >
                  <KeyRound className="h-4 w-4" />
                  {form.delivery === 'token'
                    ? 'Gerar token'
                    : form.delivery === 'full-installer'
                      ? 'Gerar e baixar instalador completo'
                      : 'Gerar e baixar instalador mínimo'}
                </Button>
              </div>
            </div>
          </Card>

          {generatedToken && (
            <Card>
              <CardHeader title="Token gerado" subtitle="Copie e guarde com segurança." />
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-black/20 p-3">
                  <p className="break-all font-mono text-sm text-foreground">{generatedToken.token}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={generatedToken.multiUse ? 'accent' : 'slate'}>
                    {generatedToken.multiUse ? 'Multiuso' : 'Uso único'}
                  </Badge>
                  <Badge color="slate">
                    Expira: {generatedToken.expiresAt ? new Date(generatedToken.expiresAt).toLocaleString('pt-BR') : 'Sem expiração'}
                  </Badge>
                </div>

                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => void handleCopyToken(generatedToken.token)}>
                    <Copy className="h-4 w-4" /> Copiar token
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Gerenciar tokens emitidos"
              subtitle={tokensFilter
                ? 'Acompanhe status, validade e ações por token.'
                : 'Selecione o escopo e carregue a listagem para iniciar a gestão.'}
              action={(
                <Button
                  variant="secondary"
                  onClick={handleLoadIssuedTokens}
                  disabled={!selectedClientId || !selectedSiteId}
                  loading={deployTokens.isFetching}
                >
                  {tokensFilter ? 'Atualizar listagem' : 'Carregar tokens'}
                </Button>
              )}
            />

            {tokensFilter === null ? (
              <div className="rounded-xl border border-dashed border-border-strong bg-surface-light px-4 py-5 text-sm text-muted">
                Defina cliente e site e clique em Carregar tokens para abrir o painel operacional.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard label="Total carregados" value={tokenStats.total} tone="slate" />
                  <MetricCard label="Ativos" value={tokenStats.active} tone="success" />
                  <MetricCard label="Expirados" value={tokenStats.expired} tone="slate" />
                  <MetricCard label="Revogados" value={tokenStats.revoked} tone="danger" />
                  <MetricCard label="Expiram hoje" value={tokenStats.expiringSoon} tone="warning" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <Input
                    label="Busca"
                    placeholder="Descrição, ID ou final do token"
                    value={tokenSearch}
                    onChange={e => setTokenSearch(e.target.value)}
                    className="xl:col-span-2"
                  />
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
                    label="Uso"
                    value={usageFilter}
                    onChange={e => setUsageFilter(e.target.value as TokenUsageFilter)}
                    options={[
                      { value: 'all', label: 'Todos' },
                      { value: 'single', label: 'Uso único' },
                      { value: 'multi', label: 'Multiuso' },
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
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-light px-3 py-2">
                  <div className="text-sm text-muted">
                    {filteredTokens.length} tokens após filtros
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      label="Tipo de instalador"
                      value={installerType}
                      onChange={e => setInstallerType(e.target.value as DeployInstallerType)}
                      options={[
                        { value: 'online', label: 'Instalador mínimo (.exe) — Recomendado' },
                        { value: 'offline', label: 'Pacote offline completo (.zip)' },
                      ]}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTokenSearch('');
                        setStatusFilter('all');
                        setUsageFilter('all');
                        setPeriodFilter('all');
                        setSortBy('created-desc');
                        setPageSize(10);
                      }}
                    >
                      Limpar filtros
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  <strong>Instalador mínimo:</strong> ~2 MB, baixa o restante durante a instalação (requer internet).
                  {' '}<strong>Pacote offline:</strong> ~150 MB, instalação completa sem internet.
                </p>
              </div>
            )}
          </Card>

          {tokensFilter !== null && (
            <Card>
              {deployTokens.isLoading && listedTokens.length === 0 ? (
                <p className="text-sm text-muted">Carregando tokens...</p>
              ) : deployTokens.isError ? (
                <p className="text-sm text-rose-300">Não foi possível carregar os deploy tokens.</p>
              ) : filteredTokens.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-strong bg-surface-light px-4 py-5 text-sm text-muted">
                  Nenhum token corresponde aos filtros atuais.
                </div>
              ) : (
                <div className="space-y-3">
                  {pagedTokens.map(token => {
                    const status = getTokenStatus(token, revokedTokenIds, nowMs);
                    const statusUi = statusBadge(status);
                    const tokenVisible = visibleTokenIds.has(token.id);
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
                              <Badge color={token.multiUse ? 'accent' : 'slate'}>
                                {token.multiUse ? 'Multiuso' : 'Uso único'}
                              </Badge>
                              <Badge color="slate">Criado em {new Date(token.createdAt).toLocaleString('pt-BR')}</Badge>
                              <Badge color={status === 'active' ? 'warning' : 'slate'}>
                                {formatExpiryRelative(token.expiresAt, nowMs)}
                              </Badge>
                            </div>

                            {token.description ? (
                              <p className="text-sm text-muted-foreground">{token.description}</p>
                            ) : (
                              <p className="text-sm text-muted">Sem descrição</p>
                            )}

                            <div className="rounded-lg border border-border bg-black/20 p-3">
                              <p className="break-all font-mono text-xs text-foreground">
                                {tokenVisible ? token.token : '••••••••••••••••••••••••••••••••'}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-start gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => handleDownloadInstallerByToken(token.id, token.token)}
                              loading={downloadingTokenId === token.id}
                              disabled={!canDownload}
                            >
                              Baixar {installerType === 'offline' ? 'pacote offline' : 'instalador mínimo'}
                            </Button>

                            <div className="relative">
                              <Button
                                variant="ghost"
                                onClick={() => setOpenActionsForTokenId(current => (current === token.id ? null : token.id))}
                              >
                                Ações
                              </Button>

                              {openActionsForTokenId === token.id ? (
                                <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-background/95 p-1 shadow-2xl">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleTokenVisibility(token.id);
                                    }}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                                  >
                                    {tokenVisible ? 'Ocultar token' : 'Ver token'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleCopyToken(token.token);
                                      setOpenActionsForTokenId(null);
                                    }}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                                  >
                                    Copiar token
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeToken(token)}
                                    disabled={isRevoked || revokingTokenId === token.id}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {revokingTokenId === token.id ? 'Revogando...' : 'Revogar token'}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="text-sm text-muted">
                      Página {page} de {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(current => Math.max(1, current - 1))}
                        disabled={page <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                        disabled={page >= totalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'success' | 'warning' | 'danger';
}) {
  const toneClass: Record<typeof tone, string> = {
    slate: 'text-foreground border-border bg-surface-light',
    success: 'text-emerald-200 border-emerald-400/25 bg-emerald-500/10',
    warning: 'text-amber-200 border-amber-400/25 bg-amber-500/10',
    danger: 'text-rose-200 border-rose-400/25 bg-rose-500/10',
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
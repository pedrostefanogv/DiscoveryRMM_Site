import { useMemo, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, TextArea, Badge, Select } from '@/components/ui';
import {
  useCreateDeployToken,
  useDeployTokens,
  useDeployInstallerOptions,
  useDownloadDeployInstaller,
  useRevokeDeployToken,
} from '@/hooks/useDeployTokens';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import {
  ApiError,
  LogLevel,
  LogSource,
  LogType,
  logsApi,
} from '@/api';
import type {
  CreateDeployTokenRequest,
  DeployInstallerOption,
  DeployInstallerType,
  DeployTokenDelivery,
} from '@/api';
import toast from 'react-hot-toast';

interface DeployTokenFormState {
  clientId: string;
  siteId: string;
  description: string | null;
  expiresInHours: number | null;
  multiUse: boolean | null;
  delivery: DeployTokenDelivery;
}

function triggerInstallerDownload(fileName: string, blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'discovery-installer.exe';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function mapInstallerFlowError(error: ApiError | null, action: 'validar token' | 'baixar instalador') {
  if (!error) return `Nao foi possivel ${action}.`;

  if (error.status === 400) {
    return `Nao foi possivel ${action}: parametros ausentes ou invalidos.`;
  }

  if (error.status === 401) {
    return 'Token invalido, expirado, revogado ou sem usos disponiveis.';
  }

  if (error.status === 503) {
    return 'Instalador indisponivel temporariamente. Tente novamente em instantes.';
  }

  return error.message || `Nao foi possivel ${action}.`;
}

export default function DeployTokens() {
  const createToken = useCreateDeployToken();
  const revokeToken = useRevokeDeployToken();
  const installerOptions = useDeployInstallerOptions();
  const downloadInstaller = useDownloadDeployInstaller();
  const [form, setForm] = useState<DeployTokenFormState>({
    clientId: '',
    siteId: '',
    description: null,
    expiresInHours: 24,
    multiUse: false,
    delivery: 'token',
  });
  const [rawToken, setRawToken] = useState('');
  const [selectedInstallerType, setSelectedInstallerType] = useState<DeployInstallerType>('online');

  const clients = useClients(false);
  const sites = useSites(form.clientId, false);
  const deployTokens = useDeployTokens({
    clientId: form.clientId || undefined,
    siteId: form.siteId || undefined,
  });
  const activeClients = (clients.data ?? []).filter(c => c.isActive);
  const activeSites = (sites.data ?? []).filter(s => s.isActive);
  const listedTokens = useMemo(
    () => [...(deployTokens.data ?? [])].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    ),
    [deployTokens.data],
  );

  const generatedToken = createToken.data && 'token' in createToken.data ? createToken.data : null;
  const installerOptionsData = installerOptions.data;
  const availableOptions = installerOptionsData?.options ?? [];
  const hasOfflineOption = useMemo(
    () => availableOptions.some(option => option.type === 'offline'),
    [availableOptions],
  );

  const selectedOption = availableOptions.find(option => option.type === selectedInstallerType) ?? null;

  const emitInstallerTelemetry = async (
    eventName: string,
    level: LogLevel,
    data: Record<string, unknown>,
  ) => {
    try {
      await logsApi.create({
        clientId: installerOptionsData?.clientId ?? null,
        siteId: installerOptionsData?.siteId ?? null,
        agentId: null,
        type: LogType.Application,
        level,
        source: LogSource.Portal,
        message: `deploy.installer.${eventName}`,
        dataJson: data,
      });
    } catch {
      // Telemetria nao deve bloquear o fluxo principal.
    }
  };

  const handleCreate = () => {
    if (!form.clientId) {
      toast.error('Selecione o cliente');
      return;
    }

    if (!form.siteId) {
      toast.error('Selecione o site');
      return;
    }

    const payload: CreateDeployTokenRequest = {
      clientId: form.clientId,
      siteId: form.siteId,
      description: form.description?.trim() ? form.description.trim() : null,
      expiresInHours: form.expiresInHours,
      multiUse: form.multiUse,
      delivery: form.delivery,
    };

    createToken.mutate(payload, {
      onSuccess: (result) => {
        if ('token' in result) {
          toast.success('Token de deploy criado com sucesso');
          return;
        }

        triggerInstallerDownload(result.fileName, result.blob);
        toast.success('Instalador gerado com sucesso. Download iniciado.');
      },
      onError: () => toast.error('Erro ao criar token de deploy'),
    });
  };

  const handleValidateInstallerOptions = () => {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) {
      toast.error('Informe um deploy token para validar opcoes.');
      return;
    }

    installerOptions.mutate(normalizedToken, {
      onSuccess: (response) => {
        const recommended = response.options.find(option => option.recommended);
        setSelectedInstallerType((recommended ?? response.options[0])?.type ?? 'online');
        toast.success('Token validado. Escolha a modalidade de instalacao.');
      },
      onError: (error) => {
        toast.error(mapInstallerFlowError(error, 'validar token'));
      },
    });
  };

  const handleInstallerTypeChange = (option: DeployInstallerOption) => {
    setSelectedInstallerType(option.type);
    emitInstallerTelemetry('option_selected', LogLevel.Info, {
      tokenId: installerOptionsData?.tokenId ?? null,
      installerType: option.type,
      recommended: option.recommended,
      requiresInternet: option.requiresInternet,
    });
  };

  const handleDownloadInstaller = (type?: DeployInstallerType) => {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) {
      toast.error('Informe um deploy token para iniciar o download.');
      return;
    }

    const installerType = type ?? selectedInstallerType;
    emitInstallerTelemetry('download_started', LogLevel.Info, {
      tokenId: installerOptionsData?.tokenId ?? null,
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
            tokenId: installerOptionsData?.tokenId ?? null,
            installerType,
            fileName: result.fileName,
          });
        },
        onError: (error) => {
          toast.error(mapInstallerFlowError(error, 'baixar instalador'));
          emitInstallerTelemetry('download_failed', LogLevel.Error, {
            tokenId: installerOptionsData?.tokenId ?? null,
            installerType,
            status: error.status,
            reason: error.message,
          });
        },
      },
    );
  };

  const handleCopyToken = async () => {
    if (!generatedToken?.token) return;
    try {
      await navigator.clipboard.writeText(generatedToken.token);
      toast.success('Token copiado para a area de transferencia');
    } catch {
      toast.error('Nao foi possivel copiar o token');
    }
  };

  const handleCopyListedToken = async (tokenValue: string) => {
    try {
      await navigator.clipboard.writeText(tokenValue);
      toast.success('Token copiado para a area de transferencia');
    } catch {
      toast.error('Nao foi possivel copiar o token');
    }
  };

  const handleRevokeToken = (tokenId: string) => {
    if (!window.confirm('Revogar este deploy token?')) {
      return;
    }

    revokeToken.mutate(tokenId, {
      onSuccess: () => {
        toast.success('Deploy token revogado com sucesso.');
      },
      onError: (error) => {
        toast.error(error.message || 'Nao foi possivel revogar o deploy token.');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Deploy</h1>
        <p className="text-sm text-slate-400">Geracao de token para instalacao de agentes</p>
      </div>

      <Card>
        <CardHeader
          title="Criar Deploy Token"
          subtitle="Endpoint: POST /api/deploy-tokens"
        />
        <div className="space-y-4">
          <Select
            label="Cliente"
            value={form.clientId}
            onChange={e => {
              const clientId = e.target.value;
              setForm(f => ({ ...f, clientId, siteId: '' }));
            }}
            options={[
              { value: '', label: clients.isLoading ? 'Carregando clientes...' : 'Selecione um cliente' },
              ...(activeClients.map(c => ({ value: c.id, label: c.name }))),
            ]}
          />

          <Select
            label="Site"
            value={form.siteId}
            disabled={!form.clientId || sites.isLoading}
            onChange={e => setForm(f => ({ ...f, siteId: e.target.value }))}
            options={[
              {
                value: '',
                label: !form.clientId
                  ? 'Selecione um cliente primeiro'
                  : sites.isLoading
                    ? 'Carregando sites...'
                    : 'Selecione um site',
              },
              ...(activeSites.map(s => ({ value: s.id, label: s.name }))),
            ]}
          />

          <TextArea
            label="Descricao"
            placeholder="Ex: Token para onboarding de novos agentes"
            value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))}
            rows={3}
          />

          <Select
            label="Entrega"
            value={form.delivery}
            onChange={e => setForm(f => ({ ...f, delivery: e.target.value as DeployTokenDelivery }))}
            options={[
              { value: 'token', label: 'Somente token' },
              { value: 'installer', label: 'Token + download do instalador (.exe)' },
            ]}
          />

          <Input
            label="Expira em (horas)"
            type="number"
            min={1}
            value={form.expiresInHours ?? ''}
            onChange={e => {
              const raw = e.target.value;
              setForm(f => ({ ...f, expiresInHours: raw === '' ? null : Number(raw) }));
            }}
          />

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(form.multiUse)}
              onChange={e => setForm(f => ({ ...f, multiUse: e.target.checked }))}
              className="rounded border-white/10 bg-white/5"
            />
            Permitir multiuso
          </label>

          <div className="flex justify-end">
            <Button onClick={handleCreate} loading={createToken.isPending}>
              <KeyRound className="h-4 w-4" /> {form.delivery === 'installer' ? 'Gerar e baixar instalador' : 'Gerar Token'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Download por Token"
          subtitle="Valida token e escolha Online (menor) ou Offline (completo)"
        />
        <div className="space-y-4">
          <Input
            label="Deploy Token"
            placeholder="mdz_deploy_..."
            value={rawToken}
            onChange={e => {
              setRawToken(e.target.value);
              installerOptions.reset();
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleValidateInstallerOptions}
              loading={installerOptions.isPending}
            >
              Validar opcoes
            </Button>

            {installerOptionsData?.expiresAt && (
              <Badge color="slate">
                Expira: {new Date(installerOptionsData.expiresAt).toLocaleString('pt-BR')}
              </Badge>
            )}
          </div>

          {availableOptions.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {availableOptions.map(option => {
                const isActive = selectedInstallerType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => handleInstallerTypeChange(option)}
                    className={`rounded-xl border p-4 text-left transition ${
                      isActive
                        ? 'border-cyan-400/70 bg-cyan-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{option.displayName}</p>
                      {option.recommended && <Badge color="accent">Recomendado</Badge>}
                    </div>
                    <p className="text-xs text-slate-300">{option.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge color="slate">{option.type === 'online' ? 'Online' : 'Offline'}</Badge>
                      <Badge color="slate">{option.requiresInternet ? 'Requer internet' : 'Sem internet'}</Badge>
                      <Badge color="slate">Formato: {option.fileExtension}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {installerOptions.isError && (
            <p className="text-sm text-rose-300">
              {mapInstallerFlowError(installerOptions.error, 'validar token')}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              onClick={() => handleDownloadInstaller()}
              loading={downloadInstaller.isPending}
              disabled={!selectedOption || availableOptions.length === 0}
            >
              Baixar {selectedOption?.type === 'offline' ? 'Offline' : 'Online'}
            </Button>

            {downloadInstaller.isError &&
              downloadInstaller.error.status === 503 &&
              selectedInstallerType === 'online' &&
              hasOfflineOption && (
                <Button
                  variant="secondary"
                  onClick={() => handleDownloadInstaller('offline')}
                  disabled={downloadInstaller.isPending}
                >
                  Tentar fallback Offline
                </Button>
              )}
          </div>
        </div>
      </Card>

      {generatedToken && (
        <Card>
          <CardHeader title="Token Gerado" subtitle="Copie e guarde com seguranca" />
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="break-all font-mono text-sm text-slate-200">{generatedToken.token}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge color={generatedToken.multiUse ? 'accent' : 'slate'}>
                {generatedToken.multiUse ? 'Multiuso' : 'Uso unico'}
              </Badge>
              <Badge color="slate">
                Expira: {generatedToken.expiresAt ? new Date(generatedToken.expiresAt).toLocaleString('pt-BR') : 'Sem expiracao'}
              </Badge>
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleCopyToken}>
                <Copy className="h-4 w-4" /> Copiar Token
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Tokens Emitidos"
          subtitle={form.siteId
            ? 'Listagem filtrada pelo site selecionado.'
            : form.clientId
              ? 'Listagem filtrada pelo cliente selecionado.'
              : 'Listagem geral de deploy tokens.'}
        />

        <div className="space-y-3">
          {deployTokens.isLoading && listedTokens.length === 0 ? (
            <p className="text-sm text-slate-400">Carregando tokens...</p>
          ) : listedTokens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum deploy token encontrado para o filtro atual.</p>
          ) : (
            listedTokens.map(token => (
              <div
                key={token.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={token.multiUse ? 'accent' : 'slate'}>
                        {token.multiUse ? 'Multiuso' : 'Uso unico'}
                      </Badge>
                      <Badge color="slate">
                        Criado em {new Date(token.createdAt).toLocaleString('pt-BR')}
                      </Badge>
                      <Badge color="slate">
                        Expira: {token.expiresAt ? new Date(token.expiresAt).toLocaleString('pt-BR') : 'Sem expiracao'}
                      </Badge>
                    </div>

                    {token.description && (
                      <p className="text-sm text-slate-300">{token.description}</p>
                    )}

                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="break-all font-mono text-xs text-slate-200">{token.token}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void handleCopyListedToken(token.token)}
                    >
                      <Copy className="h-4 w-4" /> Copiar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleRevokeToken(token.id)}
                      loading={revokeToken.isPending}
                    >
                      <Trash2 className="h-4 w-4" /> Revogar
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          {deployTokens.isError && (
            <p className="text-sm text-rose-300">
              Nao foi possivel carregar os deploy tokens.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, TextArea, Badge, Select } from '@/components/ui';
import {
  useCreateDeployToken,
  useDeployTokens,
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
  agentUpdatesApi,
  logsApi,
} from '@/api';
import type {
  CreateDeployTokenRequest,
  DeployTokenDelivery,
  ListDeployTokensParams,
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

export default function DeployTokens() {
  const createToken = useCreateDeployToken();
  const revokeToken = useRevokeDeployToken();
  const downloadInstaller = useDownloadDeployInstaller();
  const [form, setForm] = useState<DeployTokenFormState>({
    clientId: '',
    siteId: '',
    description: null,
    expiresInHours: 24,
    multiUse: false,
    delivery: 'installer',
  });
  const [downloadingTokenId, setDownloadingTokenId] = useState<string | null>(null);
  const [visibleTokenIds, setVisibleTokenIds] = useState<Set<string>>(new Set());
  const [tokensFilter, setTokensFilter] = useState<ListDeployTokensParams | null>(null);

  const clients = useClients(false);
  const sites = useSites(form.clientId, false);
  const deployTokens = useDeployTokens(tokensFilter ?? {}, { enabled: tokensFilter !== null });
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
  const refreshAgentUpdateBuild = useMutation({
    mutationFn: () => agentUpdatesApi.refreshBuild(),
    onSuccess: () => {
      toast.success('Rebuild do agente de atualizacao iniciado.');
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
        clientId: form.clientId || null,
        siteId: form.siteId || null,
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

  const handleLoadIssuedTokens = () => {
    if (!form.clientId) {
      toast.error('Selecione o cliente');
      return;
    }

    if (!form.siteId) {
      toast.error('Selecione o site');
      return;
    }

    const nextFilter: ListDeployTokensParams = {
      clientId: form.clientId,
      siteId: form.siteId,
    };

    const sameFilter =
      tokensFilter?.clientId === nextFilter.clientId
      && tokensFilter?.siteId === nextFilter.siteId;

    if (sameFilter) {
      void deployTokens.refetch();
      return;
    }

    setVisibleTokenIds(new Set());
    setTokensFilter(nextFilter);
  };

  const handleDownloadInstallerByToken = (tokenId: string, rawToken: string) => {
    const normalizedToken = rawToken.trim();
    if (!normalizedToken) return;

    const installerType = 'online';
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
  };

  const toggleTokenVisibility = (tokenId: string) => {
    setVisibleTokenIds((previous) => {
      const next = new Set(previous);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  };

  const handleCopyToken = async () => {
    if (!generatedToken?.token) return;
    try {
      await navigator.clipboard.writeText(generatedToken.token);
      toast.success('Token copiado para a área de transferência');
     } catch {
       toast.error('Não foi possível copiar o token');
     }
   };

   const handleCopyListedToken = async (tokenValue: string) => {
     try {
       await navigator.clipboard.writeText(tokenValue);
       toast.success('Token copiado para a área de transferência');
     } catch {
       toast.error('Não foi possível copiar o token');
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
        toast.error(error.message || 'Não foi possível revogar o deploy token.');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Instalacao de Agentes</h1>
        <p className="text-sm text-slate-400">Crie token e instalador para provisionar agentes em novos dispositivos</p>
        <div className="mt-3 flex justify-start">
          <Button
            variant="secondary"
            onClick={() => {
              refreshAgentUpdateBuild.mutate();
            }}
            loading={refreshAgentUpdateBuild.isPending}
          >
            Rebuildar agente de atualizacao
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Criar agente para instalacao"
          subtitle="Gere token e instalador para onboarding de novos agentes"
        />
        <div className="space-y-4">
          <Select
            label="Cliente"
            value={form.clientId}
            onChange={e => {
              const clientId = e.target.value;
              setTokensFilter(null);
              setVisibleTokenIds(new Set());
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
            onChange={e => {
              setTokensFilter(null);
              setVisibleTokenIds(new Set());
              setForm(f => ({ ...f, siteId: e.target.value }));
            }}
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
            label="Descrição"
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
          subtitle={tokensFilter?.siteId
            ? 'Listagem filtrada pelo site selecionado.'
            : form.siteId && form.clientId
              ? 'Clique em "Ver tokens emitidos" para carregar a listagem.'
              : 'Selecione cliente e site para habilitar a listagem.'}
        />

        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={handleLoadIssuedTokens}
              disabled={!form.clientId || !form.siteId}
              loading={deployTokens.isFetching}
            >
              Ver tokens emitidos
            </Button>
          </div>

          {tokensFilter === null ? (
            <p className="text-sm text-slate-400">
              Selecione cliente e site e clique em "Ver tokens emitidos".
            </p>
          ) : deployTokens.isLoading && listedTokens.length === 0 ? (
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
                      <p className="break-all font-mono text-xs text-slate-200">
                        {visibleTokenIds.has(token.id)
                          ? token.token
                          : '••••••••••••••••••••••••••••••••'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => toggleTokenVisibility(token.id)}
                    >
                      {visibleTokenIds.has(token.id) ? 'Ocultar token' : 'Ver token'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleDownloadInstallerByToken(token.id, token.token)}
                      loading={downloadingTokenId === token.id}
                    >
                      Baixar instalador
                    </Button>
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

          {tokensFilter !== null && deployTokens.isError && (
            <p className="text-sm text-rose-300">
              Nao foi possivel carregar os deploy tokens.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

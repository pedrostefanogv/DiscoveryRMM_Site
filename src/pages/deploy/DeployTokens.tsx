import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button, Card, CardHeader, Input, TextArea, Badge, Select } from '@/components/ui';
import { useCreateDeployToken } from '@/hooks/useDeployTokens';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import type { CreateDeployTokenRequest, DeployTokenDelivery } from '@/api';
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
  anchor.download = fileName || 'meduza-installer.exe';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function DeployTokens() {
  const createToken = useCreateDeployToken();
  const [form, setForm] = useState<DeployTokenFormState>({
    clientId: '',
    siteId: '',
    description: null,
    expiresInHours: 24,
    multiUse: false,
    delivery: 'token',
  });

  const clients = useClients(false);
  const sites = useSites(form.clientId, false);
  const activeClients = (clients.data ?? []).filter(c => c.isActive);
  const activeSites = (sites.data ?? []).filter(s => s.isActive);

  const generatedToken = createToken.data && 'token' in createToken.data ? createToken.data : null;

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

  const handleCopyToken = async () => {
    if (!generatedToken?.token) return;
    try {
      await navigator.clipboard.writeText(generatedToken.token);
      toast.success('Token copiado para a area de transferencia');
    } catch {
      toast.error('Nao foi possivel copiar o token');
    }
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
    </div>
  );
}

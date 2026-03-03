import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Plus, Monitor, Trash2 } from 'lucide-react';
import { useClient, useDeleteClient } from '@/hooks/useClients';
import { useSites, useCreateSite } from '@/hooks/useSites';
import { useAgentsByClient } from '@/hooks/useAgents';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Modal, Input, TextArea } from '@/components/ui';
import toast from 'react-hot-toast';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteCity, setSiteCity] = useState('');
  const [siteState, setSiteState] = useState('');
  const [siteZipCode, setSiteZipCode] = useState('');
  const [siteNotes, setSiteNotes] = useState('');

  const client = useClient(id!);
  const sites = useSites(id!);
  const agents = useAgentsByClient(id!);
  const deleteClient = useDeleteClient();
  const createSite = useCreateSite();

  if (client.isLoading) return <Loading />;
  if (client.isError || !client.data) return <ErrorDisplay onRetry={() => client.refetch()} />;

  const c = client.data;

  const handleDelete = () => {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
    deleteClient.mutate(c.id, {
      onSuccess: () => { toast.success('Cliente excluído'); navigate('/clients'); },
      onError: () => toast.error('Erro ao excluir'),
    });
  };

  const handleCreateSite = () => {
    if (!siteName.trim()) {
      toast.error('Informe o nome do site');
      return;
    }

    createSite.mutate(
      {
        clientId: c.id,
        data: {
          name: siteName.trim(),
          address: siteAddress.trim() || null,
          city: siteCity.trim() || null,
          state: siteState.trim() || null,
          zipCode: siteZipCode.trim() || null,
          notes: siteNotes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Site cadastrado com sucesso');
          setSiteModalOpen(false);
          setSiteName('');
          setSiteAddress('');
          setSiteCity('');
          setSiteState('');
          setSiteZipCode('');
          setSiteNotes('');
        },
        onError: () => toast.error('Erro ao cadastrar site'),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} aria-label="Voltar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{c.name}</h1>
          <p className="text-sm text-slate-400">{c.document ?? 'Sem documento'}</p>
        </div>
        <Badge color={c.isActive ? 'success' : 'slate'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
      </div>

      {/* Info */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-400">Email</dt><dd className="text-white">{c.email ?? '—'}</dd></div>
            <div><dt className="text-slate-400">Telefone</dt><dd className="text-white">{c.phone ?? '—'}</dd></div>
            <div><dt className="text-slate-400">Observações</dt><dd className="text-white">{c.notes ?? '—'}</dd></div>
          </dl>
        </Card>

        {/* Sites */}
        <Card>
          <CardHeader
            title="Sites"
            subtitle={`${sites.data?.length ?? 0} sites`}
            action={(
              <Button size="sm" variant="ghost" onClick={() => setSiteModalOpen(true)} aria-label="Cadastrar site">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          />
          <div className="space-y-2">
            {(sites.data ?? []).map(site => (
              <div key={site.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                <MapPin className="h-4 w-4 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{site.name}</p>
                  <p className="text-xs text-slate-500">
                    {[site.city, site.state].filter(Boolean).join(', ') || 'Sem localização'}
                  </p>
                </div>
                <Badge color={site.isActive ? 'success' : 'slate'}>
                  {site.isActive ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            ))}
            {sites.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
            {(sites.data?.length ?? 0) === 0 && !sites.isLoading && (
              <p className="text-sm text-slate-500">Nenhum site cadastrado</p>
            )}
          </div>
        </Card>

        {/* Agents */}
        <Card>
          <CardHeader
            title="Agentes"
            subtitle={`${agents.data?.length ?? 0} agentes`}
          />
          <div className="space-y-2">
            {(agents.data ?? []).map(agent => (
              <div
                key={agent.id}
                onClick={() => navigate(`/agents/${agent.id}`)}
                className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10 transition-colors"
              >
                <Monitor className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {agent.displayName ?? agent.hostname}
                  </p>
                  <p className="text-xs text-slate-500">{agent.operatingSystem ?? 'N/A'}</p>
                </div>
                <span className={`h-2 w-2 rounded-full ${agent.isOnline ? 'bg-success' : 'bg-slate-600'}`} />
              </div>
            ))}
            {agents.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
            {(agents.data?.length ?? 0) === 0 && !agents.isLoading && (
              <p className="text-sm text-slate-500">Nenhum agente</p>
            )}
          </div>
        </Card>
      </div>

      <Modal open={siteModalOpen} onClose={() => setSiteModalOpen(false)} title="Cadastrar Site">
        <div className="space-y-4">
          <Input label="Nome" value={siteName} onChange={e => setSiteName(e.target.value)} />
          <Input label="Endereço" value={siteAddress} onChange={e => setSiteAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cidade" value={siteCity} onChange={e => setSiteCity(e.target.value)} />
            <Input label="Estado" value={siteState} onChange={e => setSiteState(e.target.value)} />
          </div>
          <Input label="CEP" value={siteZipCode} onChange={e => setSiteZipCode(e.target.value)} />
          <TextArea label="Observações" value={siteNotes} onChange={e => setSiteNotes(e.target.value)} rows={3} />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setSiteModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSite} loading={createSite.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

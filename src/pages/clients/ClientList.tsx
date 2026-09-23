import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { useClients, useCreateClient } from '@/hooks/useClients';
import { useAuthorization } from '@/auth/authorization';
import { Button, Card, DataTable, Badge, Loading, ErrorDisplay, Modal, Input, TextArea, StatCard, PageHeader } from '@/components/ui';
import type { Client, CreateClientRequest } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

export default function ClientList() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Busca todos (inclusive inativos) para os cards; a tabela filtra no cliente.
  const allClients = useClients(true);
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  const canCreate = hasAnyPermission(['Clients.Create', 'clients.*', 'admin.*']);

  const allData = allClients.data ?? [];

  const displayedClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allData
      .filter(c => showInactive || c.isActive)
      .filter(c => !term || c.name.toLowerCase().includes(term) || (c.notes ?? '').toLowerCase().includes(term));
  }, [allData, showInactive, search]);

  const activeClients = allData.filter(c => c.isActive).length;
  const inactiveClients = allData.filter(c => !c.isActive).length;

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: c => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{c.name}</p>
            <p className="truncate text-xs text-muted">{c.notes?.trim() ? c.notes : 'Sem observações'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: c => (
        <Badge color={c.isActive ? 'success' : 'slate'}>
          {c.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
  ];

  if (allClients.isLoading && !allClients.data) return <Loading />;
  if (allClients.isError) return <ErrorDisplay onRetry={() => allClients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={`${displayedClients.length} de ${allData.length} cliente(s)`}
      >
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Mostrar inativos
        </label>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Total de clientes" value={allData.length} tone="accent" />
        <StatCard icon={Building2} label="Clientes ativos" value={activeClients} tone="success" />
        <StatCard icon={Building2} label="Clientes inativos" value={inactiveClients} tone="warning" />
      </div>

      <Card>
        <Input
          label="Buscar"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nome ou observação"
        />
      </Card>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={displayedClients}
          keyExtractor={c => c.id}
          emptyMessage="Nenhum cliente encontrado"
          onRowClick={c => navigate(`/clients/${c.id}`)}
        />
      </Card>

      <CreateClientModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function CreateClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateClient();
  const [form, setForm] = useState<CreateClientRequest>({
    name: '',
    notes: null,
  });

  // Reset form when modal opens
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setForm({ name: '', notes: null });
    }
    prevOpen.current = open;
  }, [open]);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    create.mutate(form, {
      onSuccess: () => {
        toast.success('Cliente criado com sucesso');
        onClose();
        setForm({ name: '', notes: null });
      },
      onError: () => toast.error('Erro ao criar cliente'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Cliente">
      <div className="space-y-4">
        <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <TextArea label="Observações" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

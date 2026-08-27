import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { useClients, useCreateClient } from '@/hooks/useClients';
import { Button, Card, DataTable, Badge, Loading, ErrorDisplay, Modal, Input, TextArea, StatCard } from '@/components/ui';
import type { Client, CreateClientRequest } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

export default function ClientList() {
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Always fetch all clients for stat cards; filter table client-side
  const allClients = useClients(true);
  const navigate = useNavigate();

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: c => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted">{c.notes ?? 'Sem observações'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'notes',
      header: 'Observações',
      render: c => <span className="text-muted">{c.notes ?? '\u2014'}</span>,
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

  if (allClients.isLoading) return <Loading />;
  if (allClients.isError) return <ErrorDisplay onRetry={() => allClients.refetch()} />;

  const allData = allClients.data ?? [];
  const displayedClients = showInactive ? allData : allData.filter(c => c.isActive);
  const activeClients = allData.filter(c => c.isActive).length;
  const inactiveClients = allData.filter(c => !c.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted">{allData.length} clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Mostrar inativos
          </label>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Total de clientes" value={allData.length} tone="accent" />
        <StatCard icon={Building2} label="Clientes ativos" value={activeClients} tone="success" />
        <StatCard icon={Building2} label="Clientes inativos" value={inactiveClients} tone="warning" />
      </div>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={displayedClients}
          keyExtractor={c => c.id}
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

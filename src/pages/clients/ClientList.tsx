import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { useClients, useCreateClient } from '@/hooks/useClients';
import { Button, Card, DataTable, Badge, Loading, ErrorDisplay, Modal, Input, TextArea } from '@/components/ui';
import type { Client, CreateClientRequest } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

export default function ClientList() {
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const clients = useClients(showInactive);
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

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted">{clients.data?.length ?? 0} clientes</p>
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

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={clients.data ?? []}
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

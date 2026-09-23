import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, TextArea } from '@/components/ui';
import { useCreateClient, useUpdateClient } from '@/hooks/useClients';
import type { Client } from '@/api';
import toast from 'react-hot-toast';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Quando informado, o modal entra em modo edição. */
  client?: Client | null;
  onSaved?: (client: Client) => void;
}

/** Formulário padronizado de criação/edição de cliente. */
export function ClientFormModal({ open, onClose, client = null, onSaved }: ClientFormModalProps) {
  const isEdit = !!client;
  const create = useCreateClient();
  const update = useUpdateClient();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setName(client?.name ?? '');
      setNotes(client?.notes ?? '');
      setIsActive(client?.isActive ?? true);
    }
    prevOpen.current = open;
  }, [open, client]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Informe o nome do cliente');
      return;
    }

    const onSuccess = (saved: Client) => {
      toast.success(isEdit ? 'Cliente atualizado com sucesso' : 'Cliente criado com sucesso');
      onSaved?.(saved);
      onClose();
    };
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar cliente');

    if (isEdit && client) {
      update.mutate(
        { id: client.id, data: { name: trimmed, notes: notes.trim() || null, isActive } },
        { onSuccess, onError },
      );
    } else {
      create.mutate({ name: trimmed, notes: notes.trim() || null }, { onSuccess, onError });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Cliente' : 'Novo Cliente'}>
      <div className="space-y-4">
        <Input label="Nome" value={name} onChange={e => setName(e.target.value)} required />
        <TextArea
          label="Observações"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
        />
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Cliente ativo
          </label>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={create.isPending || update.isPending}>
            {isEdit ? 'Salvar alterações' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

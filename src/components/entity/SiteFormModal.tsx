import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Select, TextArea } from '@/components/ui';
import { useCreateSite, useUpdateSite } from '@/hooks/useSites';
import type { Site } from '@/api';
import toast from 'react-hot-toast';

interface SiteFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Cliente fixo do site. No modo "novo" pode ser omitido se `clients` for fornecido. */
  clientId?: string;
  /** Lista para escolher o cliente quando o site é criado fora do contexto do cliente. */
  clients?: { id: string; name: string }[];
  /** Quando informado, o modal entra em modo edição. */
  site?: Site | null;
  onSaved?: (site: Site) => void;
}

/** Formulário padronizado de criação/edição de site. */
export function SiteFormModal({
  open,
  onClose,
  clientId,
  clients,
  site = null,
  onSaved,
}: SiteFormModalProps) {
  const isEdit = !!site;
  const create = useCreateSite();
  const update = useUpdateSite();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setName(site?.name ?? '');
      setNotes(site?.notes ?? '');
      setIsActive(site?.isActive ?? true);
      setSelectedClientId(site?.clientId ?? clientId ?? '');
    }
    prevOpen.current = open;
  }, [open, site, clientId]);

  const showClientPicker = !isEdit && !clientId && Array.isArray(clients);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Informe o nome do site');
      return;
    }

    const targetClientId = site?.clientId ?? clientId ?? selectedClientId;
    if (!targetClientId) {
      toast.error('Selecione o cliente');
      return;
    }

    const onSuccess = (saved: Site) => {
      toast.success(isEdit ? 'Site atualizado com sucesso' : 'Site cadastrado com sucesso');
      onSaved?.(saved);
      onClose();
    };
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar site');

    if (isEdit && site) {
      update.mutate(
        { clientId: targetClientId, id: site.id, data: { name: trimmed, notes: notes.trim() || null, isActive } },
        { onSuccess, onError },
      );
    } else {
      create.mutate(
        { clientId: targetClientId, data: { name: trimmed, notes: notes.trim() || null } },
        { onSuccess, onError },
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Site' : 'Novo Site'}>
      <div className="space-y-4">
        {showClientPicker && (
          <Select
            label="Cliente"
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            options={[
              { value: '', label: 'Selecione um cliente', disabled: true },
              ...(clients ?? []).map(client => ({ value: client.id, label: client.name })),
            ]}
          />
        )}
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
            Site ativo
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

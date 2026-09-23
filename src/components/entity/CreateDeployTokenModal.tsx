import { useEffect, useRef, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Badge, Button, Input, Modal, Select, TextArea } from '@/components/ui';
import { useCreateDeployToken } from '@/hooks/useDeployTokens';
import type { DeployToken } from '@/api';
import toast from 'react-hot-toast';

interface CreateDeployTokenModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  /** Sites elegíveis (normalmente apenas os ativos). */
  sites: { id: string; name: string }[];
  defaultSiteId?: string;
  onCreated?: (token: DeployToken) => void;
}

/**
 * Modal compartilhado de criação de deploy token (usado no detalhe do cliente
 * e na página /deploy). Exibe o token cru apenas aqui — a listagem não o expõe.
 */
export function CreateDeployTokenModal({
  open,
  onClose,
  clientId,
  sites,
  defaultSiteId,
  onCreated,
}: CreateDeployTokenModalProps) {
  const create = useCreateDeployToken();

  const [siteId, setSiteId] = useState('');
  const [description, setDescription] = useState('');
  const [expiresInHours, setExpiresInHours] = useState<number | null>(24);
  const [multiUse, setMultiUse] = useState(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setSiteId(defaultSiteId ?? (sites.length === 1 ? sites[0].id : ''));
      setDescription('');
      setExpiresInHours(24);
      setMultiUse(false);
      create.reset();
    }
    prevOpen.current = open;
  }, [open, defaultSiteId, sites, create]);

  const generated = create.data ?? null;

  const handleCreate = () => {
    if (!clientId) {
      toast.error('Selecione o cliente');
      return;
    }
    if (!siteId) {
      toast.error('Selecione o site');
      return;
    }

    create.mutate(
      {
        clientId,
        siteId,
        description: description.trim() ? description.trim() : null,
        expiresInHours,
        multiUse,
      },
      {
        onSuccess: (token) => {
          toast.success('Token de deploy criado com sucesso');
          onCreated?.(token);
        },
        onError: (error) => toast.error(error.message || 'Erro ao criar token de deploy'),
      },
    );
  };

  const handleCopy = async () => {
    const value = generated?.rawToken;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Token copiado para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar o token');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Criar Token de Deploy">
      <div className="space-y-4">
        <Select
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          options={[
            { value: '', label: sites.length === 0 ? 'Nenhum site ativo' : 'Selecione um site' },
            ...sites.map((site) => ({ value: site.id, label: site.name })),
          ]}
          disabled={sites.length === 0}
        />

        <TextArea
          label="Descrição"
          placeholder="Ex: onboarding de novo agente"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <Input
          label="Expira em (horas)"
          type="number"
          min={1}
          value={expiresInHours ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            setExpiresInHours(raw === '' ? null : Number(raw));
          }}
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={multiUse}
            onChange={(e) => setMultiUse(e.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Permitir multiuso
        </label>

        {generated && (
          <div className="space-y-3 rounded-lg border border-border bg-black/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted">Token gerado</p>
            <p className="break-all font-mono text-sm text-foreground">{generated.rawToken ?? ''}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={multiUse ? 'accent' : 'slate'}>
                {multiUse ? 'Multiuso' : 'Uso único'}
              </Badge>
              <Badge color="slate">
                Expira: {generated.expiresAt ? new Date(generated.expiresAt).toLocaleString('pt-BR') : 'Sem expiração'}
              </Badge>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleCopy}>
                <Copy className="h-4 w-4" /> Copiar Token
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} loading={create.isPending} disabled={sites.length === 0}>
            <KeyRound className="h-4 w-4" /> Gerar Token
          </Button>
        </div>
      </div>
    </Modal>
  );
}

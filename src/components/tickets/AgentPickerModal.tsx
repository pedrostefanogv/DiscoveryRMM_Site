import { useEffect, useMemo, useState } from 'react';
import { Monitor, Trash2 } from 'lucide-react';
import { Button, Input, Loading, Modal } from '@/components/ui';
import type { Agent } from '@/api';

/**
 * Vínculo do agent (máquina) ao chamado, no mesmo padrão do solicitante:
 * ícone abre este modal com busca e lista das máquinas do escopo do chamado.
 */
export function AgentPickerModal({
  open,
  agents,
  isLoading = false,
  selectedId,
  scopeLabel,
  isSaving = false,
  onClose,
  onSave,
}: {
  open: boolean;
  agents: Agent[];
  isLoading?: boolean;
  selectedId: string | null;
  /** Ex.: "do site Matriz" / "do cliente Acme". */
  scopeLabel?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (agentId: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(selectedId);

  useEffect(() => {
    if (open) {
      setPending(selectedId);
      setSearch('');
    }
  }, [open, selectedId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term
      ? agents.filter((agent) =>
          `${agent.hostname ?? ''} ${agent.displayName ?? ''}`.toLowerCase().includes(term),
        )
      : agents;
    return base.slice(0, 50);
  }, [agents, search]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Agent do chamado" maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Vincule a máquina relacionada ao chamado{scopeLabel ? ` (${scopeLabel})` : ''}. Busque por hostname ou nome.
        </p>

        <Input
          label="Buscar agent"
          value={search}
          placeholder="Hostname ou nome da máquina"
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {isLoading ? (
            <Loading message="Carregando agents..." />
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              {agents.length === 0 ? 'Nenhum agent neste escopo.' : 'Nenhum agent encontrado.'}
            </p>
          ) : (
            filtered.map((agent) => {
              const label = agent.displayName || agent.hostname || agent.id;
              const selected = pending === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setPending(agent.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-hover/60'
                  }`}
                >
                  <Monitor className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary' : 'text-muted'}`} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {agent.hostname && agent.hostname !== label && (
                    <span className="shrink-0 truncate text-xs text-muted">{agent.hostname}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" disabled={!pending} onClick={() => setPending(null)}>
            <Trash2 className="h-4 w-4" /> Remover agent
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => onSave(pending)} loading={isSaving}>Salvar</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

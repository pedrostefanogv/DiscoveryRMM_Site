import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Input, Loading, Modal } from '@/components/ui';
import type { Department } from '@/api';

/**
 * Transferência do chamado entre departamentos, no mesmo padrão do
 * AgentPickerModal/RequesterPickerModal: busca e lista os departamentos do
 * escopo do chamado (do cliente + globais).
 */
export function DepartmentPickerModal({
  open,
  departments,
  isLoading = false,
  selectedId,
  scopeLabel,
  isSaving = false,
  onClose,
  onSave,
}: {
  open: boolean;
  departments: Department[];
  isLoading?: boolean;
  selectedId: string | null;
  /** Ex.: "do cliente Acme". */
  scopeLabel?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (departmentId: string | null) => void;
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
    const active = departments.filter((department) => department.isActive !== false);
    const base = term
      ? active.filter((department) => department.name.toLowerCase().includes(term))
      : active;
    return [...base].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  }, [departments, search]);

  if (!open) return null;

  const canSave = pending !== selectedId;
  const isClearing = pending === null;

  return (
    <Modal open onClose={onClose} title="Departamento do chamado" maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Transfira o chamado para outro departamento{scopeLabel ? ` (${scopeLabel})` : ''}. O SLA passa
          a usar o perfil do departamento escolhido.
        </p>

        <Input
          label="Buscar departamento"
          value={search}
          placeholder="Nome do departamento"
          onChange={(event) => setSearch(event.target.value)}
        />

        <button
          type="button"
          onClick={() => setPending(null)}
          aria-pressed={pending === null}
          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${
            pending === null
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-surface-hover/60'
          }`}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Sem departamento</span>
          {selectedId === null && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">atual</span>
          )}
        </button>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {isLoading ? (
            <Loading message="Carregando departamentos..." />
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              {departments.length === 0
                ? 'Nenhum departamento neste escopo.'
                : 'Nenhum departamento encontrado.'}
            </p>
          ) : (
            filtered.map((department) => {
              const selected = pending === department.id;
              return (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => setPending(department.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-hover/60'
                  }`}
                >
                  <Building2 className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary' : 'text-muted'}`} />
                  <span className="min-w-0 flex-1 truncate">{department.name}</span>
                  {department.clientId === null && (
                    <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted">
                      Global
                    </span>
                  )}
                  {department.id === selectedId && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">atual</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSave(pending)} loading={isSaving} disabled={!canSave}>
            {isClearing ? 'Remover departamento' : 'Transferir'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

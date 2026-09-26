import { useEffect, useMemo, useState } from 'react';
import { Trash2, UserCheck } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import type { UserDto } from '@/api';

/**
 * Seleção do solicitante do chamado (quem abriu). Quem abriu é quem pode
 * avaliar (CSAT), então o vínculo é feito por aqui em vez de um select solto.
 */
export function RequesterPickerModal({
  open,
  users,
  selectedId,
  isSaving = false,
  onClose,
  onSave,
}: {
  open: boolean;
  users: UserDto[];
  selectedId: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (userId: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(selectedId);

  // Sincroniza ao abrir/trocar de chamado.
  useEffect(() => {
    if (open) {
      setPending(selectedId);
      setSearch('');
    }
  }, [open, selectedId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users.slice(0, 50);
    return users
      .filter((user) =>
        `${user.fullName ?? ''} ${user.login ?? ''} ${user.email ?? ''}`.toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [users, search]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Solicitante do chamado" maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          O solicitante é quem abriu o chamado — e quem pode avaliar o atendimento. Busque por nome, login ou e-mail.
        </p>

        <Input
          label="Buscar usuário"
          value={search}
          placeholder="Nome, login ou e-mail"
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">Nenhum usuário encontrado.</p>
          ) : (
            filtered.map((user) => {
              const label = user.fullName || user.login || user.email;
              const selected = pending === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setPending(user.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-hover/60'
                  }`}
                >
                  <UserCheck className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary' : 'text-muted'}`} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {user.email && user.email !== label && (
                    <span className="shrink-0 truncate text-xs text-muted">{user.email}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!pending}
            onClick={() => setPending(null)}
          >
            <Trash2 className="h-4 w-4" /> Remover solicitante
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => onSave(pending)} loading={isSaving}>Salvar</Button>
          </div>
        </div>

        {search.trim().length === 0 && users.length > filtered.length && (
          <p className="text-xs text-muted">
            Mostrando os primeiros {filtered.length} de {users.length} usuários — use a busca para refinar.
          </p>
        )}
      </div>
    </Modal>
  );
}

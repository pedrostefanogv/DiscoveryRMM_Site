import { useMemo, useState } from 'react';
import { UserPlus, UserMinus } from 'lucide-react';
import { Badge, Button, Input, Loading, Select } from '@/components/ui';
import {
  useAddTicketWatcher, useRemoveTicketWatcher, useTicketWatchers,
} from '@/hooks/useTickets';
import { useIamUsers } from '@/hooks/useIdentity';
import type { UserDto } from '@/api';
import toast from 'react-hot-toast';

/**
 * Quem acompanha o chamado (watchers) — renderizado dentro do card de Resumo
 * geral, antes do bloco de SLA.
 */
export function WatchersSection({
  ticketId,
  assignedToUserId,
}: {
  ticketId: string;
  assignedToUserId: string | null;
}) {
  const watchers = useTicketWatchers(ticketId);
  const users = useIamUsers();
  const addWatcher = useAddTicketWatcher();
  const removeWatcher = useRemoveTicketWatcher();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingWatcherId, setRemovingWatcherId] = useState<string | null>(null);

  const watcherItems = watchers.data ?? [];
  const userItems = users.data ?? [];

  const userMap = useMemo(
    () => new Map<string, UserDto>(userItems.map((user) => [user.id, user])),
    [userItems],
  );

  const existingWatcherIds = useMemo(
    () => new Set(watcherItems.map((watcher) => watcher.userId)),
    [watcherItems],
  );

  const availableUsers = useMemo(
    () => userItems.filter((user) => !existingWatcherIds.has(user.id)),
    [existingWatcherIds, userItems],
  );

  const filteredAvailableUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return availableUsers.slice(0, 30);
    }

    return availableUsers
      .filter((user) => {
        const haystack = `${user.fullName ?? ''} ${user.login ?? ''} ${user.email ?? ''}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 30);
  }, [availableUsers, searchTerm]);

  const userOptions = [
    {
      value: '',
      label: filteredAvailableUsers.length === 0 ? 'Nenhum usuario encontrado' : 'Selecione um usuario',
    },
    ...filteredAvailableUsers.map((user) => ({
      value: user.id,
      label: user.fullName || user.login || user.email,
    })),
  ];

  const closeAddWatcher = () => {
    setIsAdding(false);
    setSelectedUserId('');
    setSearchTerm('');
  };

  const handleAddWatcher = () => {
    if (!selectedUserId) return;

    addWatcher.mutate(
      {
        ticketId,
        data: { userId: selectedUserId },
      },
      {
        onSuccess: () => {
          closeAddWatcher();
          toast.success('Watcher adicionado com sucesso.');
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao adicionar watcher.');
        },
      },
    );
  };

  const handleRemoveWatcher = (userId: string) => {
    setRemovingWatcherId(userId);
    removeWatcher.mutate(
      { ticketId, userId },
      {
        onSuccess: () => {
          toast.success('Watcher removido com sucesso.');
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao remover watcher.');
        },
        onSettled: () => {
          setRemovingWatcherId(null);
        },
      },
    );
  };

  return (
    <section className="space-y-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Quem acompanha</h3>
          <p className="text-xs text-muted">
            {watcherItems.length === 0 ? 'Ninguém acompanhando ainda' : `${watcherItems.length} acompanhando`}
          </p>
        </div>
        <Button
          size="sm"
          variant={isAdding ? 'secondary' : 'ghost'}
          className="px-2"
          onClick={() => (isAdding ? closeAddWatcher() : setIsAdding(true))}
          aria-label="Adicionar watcher"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {watchers.isLoading || users.isLoading ? (
          <Loading />
        ) : watchers.isError || users.isError ? (
          <p className="text-sm text-danger">Erro ao carregar watchers.</p>
        ) : (
          <>
            {watcherItems.length > 0 && (
              <div className="space-y-2">
              {watcherItems.map((watcher) => {
                const user = userMap.get(watcher.userId);
                const displayName = user?.fullName || user?.login || user?.email || watcher.userId;
                const isAssignedUser = assignedToUserId === watcher.userId;

                return (
                  <div key={watcher.id} className="rounded-lg border border-border bg-surface-light px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {user?.email && user.email !== displayName && <Badge color="slate">{user.email}</Badge>}
                          {isAssignedUser && <Badge color="accent">Responsavel</Badge>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveWatcher(watcher.userId)}
                        loading={removingWatcherId === watcher.userId}
                        aria-label={`Remover watcher ${displayName}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}

            {isAdding && (
              <div className={`${watcherItems.length > 0 ? 'border-t border-border pt-3' : ''} space-y-3`}>
                <Input
                  label="Pesquisar usuario"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedUserId('');
                  }}
                  placeholder="Nome, login ou e-mail"
                />
                <Select
                  label="Selecionar usuario"
                  options={userOptions}
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={filteredAvailableUsers.length === 0}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={closeAddWatcher}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddWatcher}
                    loading={addWatcher.isPending}
                    disabled={!selectedUserId}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}


import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import {
  Badge, Button, Card, ErrorDisplay, Icon, Input, Loading, Modal,
} from '@/components/ui';
import {
  useCustomTrash,
  usePermanentDeleteCustomPackage,
  useRestoreCustomPackage,
} from '@/hooks/useAppStore';
import type { CustomPackageTrashItem } from '@/api/types';
import { ApiError } from '@/api/client';
import { formatDate, formatBytes } from '../softwareStoreUtils';

const TRASH_LIMIT = 20;

/**
 * Lixeira de pacotes custom: lista os soft deletes, permite restaurar (sem
 * recuperar as aprovações — a API deixa claro na mensagem) e excluir em
 * definitivo em 2 passos (confirmação digitada + decisão de force no 409).
 */
export function CustomTrashPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(1);
  const [purgeTarget, setPurgeTarget] = useState<CustomPackageTrashItem | null>(null);
  const restore = useRestoreCustomPackage();

  const cursor = cursors[page - 1];
  const query = useCustomTrash({ search: search || undefined, cursor, limit: TRASH_LIMIT });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setCursors([undefined]);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleNext() {
    const nextCursor = query.data?.nextCursor ?? null;
    if (!nextCursor) return;
    setCursors((prev) => {
      const next = [...prev];
      next[page] = nextCursor;
      return next;
    });
    setPage((p) => p + 1);
  }

  async function handleRestore(item: CustomPackageTrashItem) {
    try {
      const result = await restore.mutateAsync(item.packageId);
      // A mensagem da API é o contrato: deixa claro que as aprovações NÃO voltam.
      toast.success(result.message || 'Pacote restaurado. Recadastre as aprovações para este pacote.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao restaurar o pacote.');
    }
  }

  const items = query.data?.items ?? [];
  const hasMore = query.data?.hasMore ?? false;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-56">
            <Input
              label="Buscar na lixeira"
              placeholder="Nome ou ID do pacote..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <p className="pb-2 text-xs text-muted">
            Pacotes aqui saíram do catálogo. <strong>Restaurar</strong> devolve o cadastro — as aprovações não são
            recuperadas.
          </p>
        </div>
      </Card>

      <Card padding={false}>
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {query.isLoading && !query.data
              ? 'Carregando...'
              : items.length > 0
                ? `${items.length} pacote(s) na lixeira (página ${page})`
                : 'Lixeira'}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Página anterior">
              <Icon name="chevron_left" className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs text-muted">Pág. {page}</span>
            <Button variant="ghost" size="sm" disabled={!hasMore || query.isFetching} onClick={handleNext} aria-label="Próxima página">
              <Icon name="chevron_right" className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {query.isLoading && !query.data && <Loading />}
        {query.isError && <ErrorDisplay message="Erro ao carregar a lixeira." onRetry={() => query.refetch()} />}

        {!query.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-muted">
            <Icon name="delete" className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">A lixeira está vazia.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="divide-y divide-black/10 dark:divide-white/5">
            {items.map((item) => (
              <div key={item.id || item.packageId} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{item.name || item.packageId}</span>
                      {item.version && <Badge color="slate">{item.version}</Badge>}
                      {item.hasFile ? (
                        <Badge color="accent">
                          {item.fileName || 'arquivo'}
                          {item.fileSizeBytes ? ` — ${formatBytes(item.fileSizeBytes)}` : ''}
                        </Badge>
                      ) : (
                        <Badge color="slate">sem instalador</Badge>
                      )}
                      {item.hasIcon && <Badge color="primary">ícone</Badge>}
                      {item.purgeFailedAt && (
                        <Badge color="danger">Falha na limpeza do arquivo</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted break-all">{item.packageId}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted flex-wrap">
                      <span>Excluído em {formatDate(item.deletedAt)}</span>
                      {item.deletedBy && <span>por {item.deletedBy}</span>}
                      {item.deleteReason && <span>— motivo: {item.deleteReason}</span>}
                    </div>
                    {item.purgeError && (
                      <p className="mt-0.5 text-xs text-danger">Purge do arquivo: {item.purgeError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleRestore(item)}
                      loading={restore.isPending && restore.variables === item.packageId}
                      aria-label={`Restaurar ${item.name || item.packageId}`}
                    >
                      <Icon name="undo" className="h-4 w-4" /> Restaurar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setPurgeTarget(item)}
                      aria-label={`Excluir em definitivo ${item.name || item.packageId}`}
                    >
                      <Icon name="delete" className="h-4 w-4" /> Excluir em definitivo
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PermanentDeleteModal
        item={purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onDeleted={() => {
          setPurgeTarget(null);
          void query.refetch();
        }}
      />
    </div>
  );
}

interface PermanentDeleteModalProps {
  item: CustomPackageTrashItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Exclusão definitiva em DOIS passos:
 *
 * 1. Confirmação digitada (o operador reproduz o packageId) e modal mostrando
 *    tudo que será removido — instalador, ícone e (já apagadas) as aprovações;
 * 2. A API pode responder 409 quando o objeto não saiu do storage: o modal
 *    pergunta se deve excluir SÓ no servidor (force=true) e o arquivo pendente
 *    fica para o varredor de órfãos.
 */
export function PermanentDeleteModal({ item, onClose, onDeleted }: PermanentDeleteModalProps) {
  const [confirmValue, setConfirmValue] = useState('');
  const [touched, setTouched] = useState(false);
  // Purga falhou (409): o operador decide forçar a exclusão somente no servidor.
  const [purgeFailedError, setPurgeFailedError] = useState<string | null>(null);
  const purge = usePermanentDeleteCustomPackage();

  useEffect(() => {
    if (item) return;
    setConfirmValue('');
    setTouched(false);
    setPurgeFailedError(null);
  }, [item]);

  if (!item) return null;
  // Cópia local para as closures (o TS não mantém o narrowing dentro delas).
  const pkg = item;

  const confirmOk = confirmValue.trim().toLowerCase() === item.packageId.trim().toLowerCase();

  async function handlePurge(force: boolean) {
    if (!confirmOk) {
      setTouched(true);
      return;
    }
    try {
      await purge.mutateAsync({ packageId: pkg.packageId, confirm: confirmValue.trim(), force });
      toast.success('Pacote excluído em definitivo.');
      onDeleted?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Purge do storage falhou: a decisão de forçar fica explícita na tela.
        setPurgeFailedError(err.message || 'Falha ao remover o arquivo do object storage.');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir em definitivo.');
    }
  }

  return (
    <Modal open onClose={onClose} title="Excluir em definitivo" maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">
            Esta ação remove o pacote da lixeira para sempre e não pode ser desfeita.
          </p>
          <p className="mt-2 text-muted-foreground">Serão removidos:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            <li>
              O instalador publicado {item.fileName ? `(${item.fileName}` : ''}
              {item.fileSizeBytes ? `, ${formatBytes(item.fileSizeBytes)})` : item.fileName ? ')' : ' (nenhum anexado)'}
            </li>
            <li>O ícone/capa publicado {item.hasIcon ? '' : ' (nenhum anexado)'}</li>
            <li>Qualquer registro restante do pacote (as aprovações já foram excluídas no soft delete)</li>
          </ul>
        </div>

        {purgeFailedError && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-medium text-warning">Falha ao remover o arquivo do storage — excluir somente no servidor?</p>
            <p className="mt-1 text-muted-foreground">
              O arquivo pode permanecer no S3 (object storage). Repetindo com “forçar”, a linha é apagada e o arquivo
              órfão será encontrado pelo varredor de assets sem vínculo.
            </p>
            <Button variant="danger" className="mt-2" onClick={() => void handlePurge(true)} loading={purge.isPending}>
              <Icon name="delete" className="h-4 w-4" /> Forçar exclusão no servidor
            </Button>
          </div>
        )}

        <Input
          label={`Digite ${item.packageId} para confirmar`}
          value={confirmValue}
          onChange={(e) => {
            setConfirmValue(e.target.value);
            setTouched(true);
          }}
          placeholder={item.packageId}
          autoFocus
          error={touched && !confirmOk ? 'A confirmação precisa ser exatamente o ID do pacote.' : undefined}
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handlePurge(false)} disabled={!confirmOk} loading={purge.isPending}>
            <Icon name="delete" className="h-4 w-4" /> Excluir em definitivo
          </Button>
        </div>
      </div>
    </Modal>
  );
}

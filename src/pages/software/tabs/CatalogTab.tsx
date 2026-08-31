import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Search, ShieldCheck, ChevronLeft, ChevronRight,
  Package, RefreshCw, RotateCcw, X, LayoutGrid, LayoutList, Info, ExternalLink,
} from 'lucide-react';
import { Badge, Button, Card, ErrorDisplay, Input, Loading, Modal, Select } from '@/components/ui';
import { useAppStoreCatalog, useSyncCatalog } from '@/hooks/useAppStore';
import { appStoreApi } from '@/api/app-store';
import {
  AppInstallationType,
  type AppStoreCatalogPackage,
  type SyncChocolateyCatalogResponse,
} from '@/api/types';
import { PackageIcon } from '../components/PackageIcon';
import { MarkdownDescription } from '../components/MarkdownDescription';
import { Highlight } from '../components/Highlight';
import { ApprovalFormModal } from '../components/ApprovalFormModal';
import { PackageDetailsModal } from '../components/PackageDetailsModal';
import {
  installationTypeOptions, limitOptions, APP_STORE_LAST_SYNC_STORAGE_KEY,
  formatDate,
} from '../softwareStoreUtils';

export function CatalogTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [limit, setLimit] = useState(20);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  const [approvalTarget, setApprovalTarget] = useState<AppStoreCatalogPackage | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<AppStoreCatalogPackage | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmValue, setSyncConfirmValue] = useState('');
  const [syncConfirmTouched, setSyncConfirmTouched] = useState(false);
  const [lastSyncByType, setLastSyncByType] = useState<
    Partial<Record<AppInstallationType, SyncChocolateyCatalogResponse>>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(APP_STORE_LAST_SYNC_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<Record<string, SyncChocolateyCatalogResponse>>;
      return {
        [AppInstallationType.Winget]: parsed[String(AppInstallationType.Winget)],
        [AppInstallationType.Chocolatey]: parsed[String(AppInstallationType.Chocolatey)],
      };
    } catch { return {}; }
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCatalog = useSyncCatalog();
  const [syncingType, setSyncingType] = useState<AppInstallationType | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling do status do job em background enquanto houver sync em andamento.
  useEffect(() => {
    if (syncingType === null) {
      if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; }
      return;
    }
    const type = syncingType;
    const poll = async () => {
      try {
        const status = await appStoreApi.getSyncStatus(type);
        if (!status.running && status.lastResult) {
          setLastSyncByType((prev) => ({ ...prev, [type]: status.lastResult! }));
          setSyncingType(null);
          void query.refetch();
          if (status.lastResult.success) toast.success(`Sincronização ${type === AppInstallationType.Chocolatey ? 'do Chocolatey' : 'do Winget'} concluída.`);
          else toast.error(status.lastResult.error ?? 'Sincronização falhou.');
        }
      } catch { /* status indisponível — tenta no próximo ciclo */ }
    };
    void poll();
    syncPollRef.current = setInterval(poll, 5000);
    return () => { if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncingType]);

  const cursor = cursors[page - 1];

  const query = useAppStoreCatalog({
    installationType,
    search: searchApplied || undefined,
    limit,
    cursor,
  });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchApplied(searchInput);
      setPage(1);
      setCursors([undefined]);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(APP_STORE_LAST_SYNC_STORAGE_KEY, JSON.stringify(lastSyncByType)); } catch { /* storage indisponível */ }
  }, [lastSyncByType]);

  function handleSearchEnter() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchApplied(searchInput);
    setPage(1);
    setCursors([undefined]);
  }

  function handleNext() {
    const nextCursor = query.data?.nextCursor ?? null;
    if (!nextCursor) return;
    setCursors((prev) => { const next = [...prev]; next[page] = nextCursor; return next; });
    setPage((p) => p + 1);
  }

  function handlePrev() { setPage((p) => Math.max(1, p - 1)); }

  function resetFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearchApplied('');
    setPage(1);
    setCursors([undefined]);
  }

  const hasMore = query.data?.hasMore ?? false;
  const isChocolatey = installationType === AppInstallationType.Chocolatey;
  const isWinget = installationType === AppInstallationType.Winget;
  const isCatalogEmpty = (query.data?.totalPackagesInSource ?? 0) === 0;
  const syncLabel = isChocolatey ? 'Chocolatey' : 'Winget';
  const lastSyncInfo = lastSyncByType[installationType];
  const syncConfirmOk = syncConfirmValue.trim().toLowerCase() === 'yes';
  const isSyncingThis = syncingType === installationType;
  const catalogTotal = query.data?.totalPackagesInSource;

  async function handleSyncCatalog() {
    if (syncingType !== null) return;
    setSyncingType(installationType);
    try {
      // 202: job disparado em background. O resumo será atualizado pelo
      // polling de sync/status no useEffect acima quando o job concluir.
      await syncCatalog.mutateAsync(installationType);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao sincronizar catálogo.';
      toast.error(message);
      // Registra a falha no resumo para que a estatística da última tentativa fique visível.
      setLastSyncByType((prev) => ({
        ...prev,
        [installationType]: {
          installationType,
          success: false,
          packagesUpserted: 0,
          syncedAt: new Date().toISOString(),
          error: message,
        },
      }));
      setSyncingType(null);
    }
  }

  function handleSyncRequest() {
    if (syncingType !== null) return;
    if (isChocolatey) { setSyncConfirmOpen(true); setSyncConfirmValue(''); setSyncConfirmTouched(false); return; }
    void handleSyncCatalog();
  }

  function handleSyncConfirm() {
    if (!syncConfirmOk) { setSyncConfirmTouched(true); return; }
    setSyncConfirmOpen(false);
    void handleSyncCatalog();
  }

  return (
    <div className="space-y-4">
      <Modal open={syncConfirmOpen} onClose={() => setSyncConfirmOpen(false)} title="Confirmar sincronização Chocolatey" maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-light p-4 text-sm text-foreground">
            <p>Esta operação consulta a API do Chocolatey. Continue apenas se você tem autorização para acessar e sincronizar dados do catálogo.</p>
            <p className="mt-2">
              Ao confirmar, voce declara que leu e concorda com os Termos de Uso:{' '}
              <a href="https://chocolatey.org/terms" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                https://chocolatey.org/terms <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-light p-4 text-sm text-foreground">
            <p>Se não for possível sincronizar todos os dados agora, ao repetir a sincronização o processo continua de onde parou.</p>
            <p className="mt-2">Para evitar incompatibilidades posteriores, confirme conscientemente antes de iniciar o processo.</p>
          </div>
          <Input label="Digite yes para confirmar" value={syncConfirmValue} onChange={(e) => setSyncConfirmValue(e.target.value)} placeholder="yes" autoFocus error={syncConfirmTouched && !syncConfirmOk ? 'Confirmação obrigatória.' : undefined} />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSyncConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleSyncConfirm} disabled={!syncConfirmOk} loading={syncCatalog.isPending}>Confirmar e sincronizar</Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select label="Tipo" options={installationTypeOptions} value={String(installationType)}
              onChange={(e) => { setInstallationType(Number(e.target.value) as AppInstallationType); resetFilters(); }} />
          </div>
          <div className="flex-1 min-w-48">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Busca</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input className="w-full rounded-lg border border-border bg-surface-light py-2 pl-9 pr-8 text-sm text-foreground placeholder-muted outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  placeholder="Nome ou ID do pacote..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchEnter()} />
                {searchInput && (
                  <button type="button" onClick={resetFilters} aria-label="Limpar busca" title="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="w-40">
            <Select label="Itens por página" options={limitOptions} value={String(limit)}
              onChange={(e) => { setLimit(Number(e.target.value)); resetFilters(); }} />
          </div>
          <div className="flex items-end pb-0.5">
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button type="button" onClick={() => setViewMode('list')} title="Visualização em lista"
                className={`flex items-center px-3 py-2 transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-light hover:text-foreground'}`}>
                <LayoutList className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewMode('card')} title="Visualização em cards"
                className={`flex items-center px-3 py-2 transition-colors ${viewMode === 'card' ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-light hover:text-foreground'}`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Limpar filtros"><RotateCcw className="h-4 w-4" /></Button>
          {(isChocolatey || isWinget) && (
            <Button variant="primary" onClick={handleSyncRequest} loading={isSyncingThis} disabled={syncingType !== null && !isSyncingThis} title={`Sincronizar catálogo ${syncLabel}`}>
              <RefreshCw className="h-4 w-4" /> {isSyncingThis ? 'Sincronizando...' : 'Sincronizar Catálogo'}
            </Button>
          )}
        </div>
        {(isChocolatey || isWinget) && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted">A sincronização do catálogo {syncLabel} e idempotente e pode levar alguns minutos.</p>
            <div className={`rounded-lg border px-3 py-2 text-xs ${lastSyncInfo && !lastSyncInfo.success ? 'border-danger/30 bg-danger/10 text-foreground' : 'border-success/30 bg-success/10 text-muted-foreground'}`}>
              <p>Ultima sincronização: {formatDate(lastSyncInfo?.syncedAt ?? null)}</p>
              <p>
                Pacotes atualizados: {lastSyncInfo?.packagesUpserted ?? 0}
                {typeof catalogTotal === 'number' ? ` - Total no catálogo: ${catalogTotal}` : ''}
                {lastSyncInfo?.pagesProcessed !== undefined ? ` - Paginas: ${lastSyncInfo.pagesProcessed}` : ''}
                {lastSyncInfo?.duration ? ` - Duração: ${lastSyncInfo.duration}` : ''}
              </p>
              {lastSyncInfo && !lastSyncInfo.success && lastSyncInfo.error && <p className="text-danger">Erro: {lastSyncInfo.error}</p>}
            </div>
          </div>
        )}
      </Card>

      <Card padding={false}>
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {query.isFetching && !query.data ? 'Carregando...' : query.data ? query.data.items.length > 0 ? `${query.data.items.length} pacote(s) na página ${page}${searchApplied ? ` — "${searchApplied}"` : ''}` : 'Nenhum pacote encontrado' : 'Catálogo'}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[3rem] text-center text-xs text-muted">Pág. {page}</span>
            <Button variant="ghost" size="sm" onClick={handleNext} disabled={!hasMore || query.isFetching}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {query.isFetching && !query.data && <Loading />}
        {query.isError && <ErrorDisplay message="Erro ao carregar catálogo." onRetry={() => query.refetch()} />}

        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-muted">
            <Package className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{(isChocolatey || isWinget) && isCatalogEmpty ? `Catálogo ${syncLabel} ainda não sincronizado.` : 'Nenhum pacote encontrado.'}</p>
            {(isChocolatey || isWinget) && isCatalogEmpty && (
              <Button className="mt-3" onClick={handleSyncRequest} loading={syncCatalog.isPending}><RefreshCw className="h-4 w-4" /> Sincronizar catálogo agora</Button>
            )}
            {searchApplied && <button type="button" onClick={resetFilters} className="mt-3 text-xs text-primary hover:underline">Limpar busca</button>}
          </div>
        )}

        {query.data && query.data.items.length > 0 && viewMode === 'list' && (
          <div className={`divide-y divide-white/5 transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
            {query.data.items.map((pkg) => (
              <div key={pkg.packageId} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-light transition-colors">
                <PackageIcon url={pkg.icon} homepage={pkg.homepage}
                  downloadUrl={pkg.installerUrlsByArch ? Object.values(pkg.installerUrlsByArch).find((value) => Boolean(value)) ?? null : null}
                  name={pkg.name} />
                <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground break-words"><Highlight text={pkg.name ?? pkg.packageId} query={searchApplied} /></span>
                    {pkg.version && <Badge color="slate">{pkg.version}</Badge>}
                    {pkg.architecture && <Badge color="accent">{pkg.architecture}</Badge>}
                    {pkg.category && <Badge color="primary">{pkg.category}</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted flex-wrap">
                    <span className="font-mono break-all"><Highlight text={pkg.packageId} query={searchApplied} /></span>
                    {pkg.publisher && <span className="break-words"><Highlight text={pkg.publisher} query={searchApplied} /></span>}
                    {pkg.license && <span className="text-muted break-all max-w-full">{pkg.license}</span>}
                  </div>
                  {pkg.description && <div className="mt-1"><MarkdownDescription content={pkg.description} variant="preview" /></div>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDetailsTarget(pkg)}><Info className="h-4 w-4" /> Detalhes</Button>
                  <Button size="sm" onClick={() => setApprovalTarget(pkg)}><ShieldCheck className="h-4 w-4" /> Aprovar / Negar</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {query.data && query.data.items.length > 0 && viewMode === 'card' && (
          <div className={`grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
            {query.data.items.map((pkg) => (
              <div key={pkg.packageId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-light p-4 transition-colors hover:bg-white/[0.08]">
                <div className="flex items-start gap-3">
                  <PackageIcon url={pkg.icon} homepage={pkg.homepage}
                    downloadUrl={pkg.installerUrlsByArch ? Object.values(pkg.installerUrlsByArch).find((value) => Boolean(value)) ?? null : null}
                    name={pkg.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground line-clamp-2"><Highlight text={pkg.name ?? pkg.packageId} query={searchApplied} /></div>
                    <div className="mt-0.5 font-mono text-xs text-muted"><Highlight text={pkg.packageId} query={searchApplied} /></div>
                  </div>
                </div>
                {pkg.description && <div className="flex-1"><MarkdownDescription content={pkg.description} variant="preview" /></div>}
                <div className="flex flex-wrap gap-1">
                  {pkg.version && <Badge color="slate">{pkg.version}</Badge>}
                  {pkg.architecture && <Badge color="accent">{pkg.architecture}</Badge>}
                  {pkg.category && <Badge color="primary">{pkg.category}</Badge>}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDetailsTarget(pkg)}><Info className="h-4 w-4" /> Detalhes</Button>
                  <Button size="sm" className="flex-1" onClick={() => setApprovalTarget(pkg)}><ShieldCheck className="h-4 w-4" /> Aprovar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ApprovalFormModal open={!!approvalTarget} onClose={() => setApprovalTarget(null)}
        prefillPackageId={approvalTarget?.packageId ?? ''} prefillInstallationType={installationType} lockPackageId />
      <PackageDetailsModal open={!!detailsTarget} onClose={() => setDetailsTarget(null)} pkg={detailsTarget} installationType={installationType} />
    </div>
  );
}

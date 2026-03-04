import { useEffect, useState } from "react";
import { AppWindow, Search } from "lucide-react";
import { Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, Select, StatCard, Button, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useSoftwareInventoryList, useSoftwareInventorySnapshot, type SoftwareInventoryScope } from "@/hooks/useSoftwareInventory";
import type { SoftwareInventoryCatalogItem } from "@/api";

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("pt-BR");
}

export default function SoftwareInventory() {
  const [scope, setScope] = useState<SoftwareInventoryScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [limit, setLimit] = useState("10");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);

  const clients = useClients();
  const sites = useSites(selectedClientId);

  const cursor = pageCursors[page - 1];
  const list = useSoftwareInventoryList({
    scope,
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
    cursor,
    limit: Number(limit),
    search: searchApplied,
    order,
  });

  const snapshot = useSoftwareInventorySnapshot(
    scope,
    selectedClientId || undefined,
    selectedSiteId || undefined,
  );

  const resetPagination = () => {
    setPage(1);
    setPageCursors([undefined]);
  };

  const handleScopeChange = (value: SoftwareInventoryScope) => {
    setScope(value);
    setSelectedSiteId("");
    resetPagination();
  };

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
    setSelectedSiteId("");
    resetPagination();
  };

  const handleApplySearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchApplied(searchInput.trim());
    resetPagination();
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchApplied("");
    resetPagination();
  };

  const handleOrderChange = (value: "asc" | "desc") => {
    setOrder(value);
    resetPagination();
  };

  const handleLimitChange = (value: string) => {
    setLimit(value);
    resetPagination();
  };

  const canQuery =
    scope === "global" ||
    (scope === "client" && !!selectedClientId) ||
    (scope === "site" && !!selectedSiteId);

  const items = list.data?.items ?? [];
  const totalInstalled = list.data?.totalInstalled ?? snapshot.data?.totalInstalled ?? 0;
  const totalSoftware = list.data?.totalSoftware ?? snapshot.data?.distinctSoftware ?? 0;
  const totalAgents = list.data?.totalAgents ?? snapshot.data?.distinctAgents ?? 0;
  const totalCount = list.data?.totalSoftware ?? list.data?.count ?? snapshot.data?.distinctSoftware ?? 0;
  const resolvedLimit = list.data?.limit ?? Number(limit);
  const totalPagesByCount = Math.max(1, Math.ceil(totalCount / resolvedLimit));
  const totalPagesByCursor = Math.max(page, page + (list.data?.hasMore ? 1 : 0));
  const totalPages = Math.max(totalPagesByCount, totalPagesByCursor);
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      resetPagination();
    }
  }, [page, totalPages]);

  const canPrev = page > 1 && !list.isFetching;
  const canNext = Boolean(list.data?.hasMore && list.data?.nextCursor) && !list.isFetching;

  const goToNextPage = () => {
    if (!list.data?.nextCursor) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[page] = list.data.nextCursor ?? undefined;
      return next;
    });
    setPage((p) => p + 1);
  };

  const goToPrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const hasCursorForPage = (targetPage: number) => {
    if (targetPage <= 1) return true;
    return Boolean(pageCursors[targetPage - 1]);
  };

  const visibleWindowSize = 5;
  const windowStart = Math.max(
    1,
    Math.min(currentPage - 2, Math.max(1, totalPages - (visibleWindowSize - 1))),
  );
  const visiblePages = Array.from(
    { length: Math.min(visibleWindowSize, totalPages) },
    (_, index) => windowStart + index,
  );

  const goToPage = (targetPage: number) => {
    if (targetPage === page) return;
    if (targetPage < 1 || targetPage > totalPages) return;

    if (targetPage < page && hasCursorForPage(targetPage)) {
      setPage(targetPage);
      return;
    }

    if (targetPage === page + 1 && canNext) {
      goToNextPage();
    }
  };

  const scopeOptions = [
    { value: "global", label: "Global" },
    { value: "client", label: "Por cliente" },
    { value: "site", label: "Por site" },
  ];

  const orderOptions = [
    { value: "desc", label: "Mais recente primeiro" },
    { value: "asc", label: "Mais antigo primeiro" },
  ];

  const limitOptions = [
    { value: "10", label: "10 por página" },
    { value: "30", label: "30 por página" },
    { value: "50", label: "50 por página" },
  ];

  const clientOptions = [
    { value: "", label: "Selecione um cliente..." },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const siteOptions = [
    { value: "", label: "Selecione um site..." },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const columns: Column<SoftwareInventoryCatalogItem>[] = [
    {
      key: "name",
      header: "Aplicativo",
      render: (item) => (
        <div>
          <p className="font-medium text-white">{item.name}</p>
          <p className="text-xs text-slate-500">{item.publisher ?? "Sem fabricante"}</p>
        </div>
      ),
    },
    {
      key: "installedCount",
      header: "Instalado em",
      className: "font-mono",
      render: (item) => `${item.installedCount} agent(s)`,
    },
    {
      key: "source",
      header: "Fonte",
      render: (item) => item.source ?? "—",
    },
    {
      key: "lastSeen",
      header: "Última coleta",
      render: (item) => formatDate(item.lastCollectedAt ?? item.lastSeenAt),
    },
  ];

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Inventário de Softwares</h1>
        <p className="text-sm text-slate-400">Consulta global, por cliente e por site</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AppWindow} label="Instalados" value={totalInstalled} tone="primary" />
        <StatCard icon={AppWindow} label="Softwares distintos" value={totalSoftware} tone="accent" />
        <StatCard icon={AppWindow} label="Agents distintos" value={totalAgents} tone="success" />
        <StatCard icon={AppWindow} label="Última coleta" value={snapshot.data?.lastCollectedAt ? new Date(snapshot.data.lastCollectedAt).toLocaleDateString("pt-BR") : "—"} tone="warning" />
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Defina o escopo e os critérios de busca" />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Select value={scope} options={scopeOptions} onChange={(e) => handleScopeChange(e.target.value as SoftwareInventoryScope)} />

          {(scope === "client" || scope === "site") && (
            <Select value={selectedClientId} options={clientOptions} onChange={(e) => handleClientChange(e.target.value)} />
          )}

          {scope === "site" && (
            <Select value={selectedSiteId} options={siteOptions} onChange={(e) => { setSelectedSiteId(e.target.value); resetPagination(); }} />
          )}

          <Select value={order} options={orderOptions} onChange={(e) => handleOrderChange(e.target.value as "asc" | "desc")} />
          <Select value={limit} options={limitOptions} onChange={(e) => handleLimitChange(e.target.value)} />
        </div>

        <form className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]" onSubmit={handleApplySearch}>
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome, publisher ou source"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleClearSearch}>
            Limpar
          </Button>
        </form>
      </Card>

      <Card padding={false}>
        {!canQuery ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            {scope === "client"
              ? "Selecione um cliente para consultar o inventário"
              : "Selecione cliente e site para consultar o inventário"}
          </div>
        ) : list.isLoading ? (
          <Loading message="Carregando inventário..." />
        ) : list.isError ? (
          <ErrorDisplay onRetry={() => list.refetch()} />
        ) : (
          <div className="p-5">
            <div className="mb-3 text-xs text-slate-400">
              Endpoint: <code className="font-mono">/api/software-inventory{scope === "client" ? "/by-client/{clientId}" : scope === "site" ? "/by-site/{siteId}" : ""}</code>
            </div>

            <DataTable
              columns={columns}
              data={items}
              keyExtractor={(item) => item.softwareId}
              emptyMessage="Nenhum software encontrado para os filtros atuais"
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Página {currentPage} de {totalPages} | {items.length} item(ns) nesta página
                {searchApplied ? ` | filtro: "${searchApplied}"` : ""}
              </p>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={goToPrevPage} disabled={!canPrev}>
                  Voltar
                </Button>

                <div className="flex items-center gap-1">
                  {visiblePages.map((pageNumber) => {
                    const isCurrent = pageNumber === currentPage;
                    const canNavigateToPage =
                      hasCursorForPage(pageNumber) || (pageNumber === page + 1 && canNext);

                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => goToPage(pageNumber)}
                        disabled={isCurrent || !canNavigateToPage || list.isFetching}
                        className={`min-w-8 rounded-md border px-2 py-1 text-xs transition-colors ${
                          isCurrent
                            ? "border-primary/60 bg-primary/20 text-primary"
                            : canNavigateToPage
                              ? "border-white/10 text-slate-300 hover:border-white/30 hover:bg-white/5"
                              : "border-white/5 text-slate-600"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <Button variant="secondary" size="sm" onClick={goToNextPage} disabled={!canNext} loading={list.isFetching}>
                  Avançar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

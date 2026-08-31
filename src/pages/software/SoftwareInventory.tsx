import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppWindow, Eye, Search } from "lucide-react";
import { Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, Select, StatCard, Button, Modal, Badge, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useSoftwareInventoryList, useSoftwareInventorySnapshot, useSoftwareInstallations, type SoftwareInventoryScope } from "@/hooks/useSoftwareInventory";
import { useCursorPagination } from "@/hooks/useCursorPagination";
import type { SoftwareInventoryCatalogItem } from "@/api";

function formatDate(date: string | null): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleString("pt-BR");
}

export default function SoftwareInventory() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<SoftwareInventoryScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const pag = useCursorPagination({ initialLimit: 10 });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSoftware, setDetailsSoftware] = useState<SoftwareInventoryCatalogItem | null>(null);
  const detailsPag = useCursorPagination({ initialLimit: 50 });

  const clients = useClients();
  const sites = useSites(selectedClientId);

  const list = useSoftwareInventoryList({
    scope,
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
    cursor: pag.cursor,
    limit: pag.limit,
    search: searchApplied,
    order,
  });

  const snapshot = useSoftwareInventorySnapshot(
    scope,
    selectedClientId || undefined,
    selectedSiteId || undefined,
  );

  const handleScopeChange = (value: SoftwareInventoryScope) => {
    setScope(value);
    setSelectedSiteId("");
    pag.reset();
  };

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
    setSelectedSiteId("");
    pag.reset();
  };

  const handleApplySearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchApplied(searchInput.trim());
    pag.reset();
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchApplied("");
    pag.reset();
  };

  const handleOrderChange = (value: "asc" | "desc") => {
    setOrder(value);
    pag.reset();
  };

  const handleLimitChange = (value: string) => {
    pag.setLimit(Number(value));
  };

  const canQuery =
    scope === "global" ||
    (scope === "client" && !!selectedClientId) ||
    (scope === "site" && !!selectedSiteId);

  const items = list.data?.items ?? [];
  const totalInstalled = snapshot.data?.totalInstalled ?? 0;
  const totalSoftware = snapshot.data?.distinctSoftware ?? 0;
  const totalAgents = snapshot.data?.distinctAgents ?? 0;
  const resolvedLimit = pag.limit;
  // Quando há busca ativa, o snapshot reflete o total sem filtro �?" não tentamos estimar páginas
  const hasActiveSearch = searchApplied.length > 0;
  const estimatedTotalPages = totalSoftware > 0
    ? Math.max(1, Math.ceil(totalSoftware / resolvedLimit))
    : 1;
  const currentPage = Math.min(pag.page, Math.max(1, pag.pageCursors.length || 1));

  const canPrev = pag.page > 1 && !list.isFetching;
  const canNext = (list.data?.hasMore ?? Boolean(list.data?.nextCursor)) && !list.isFetching;

  const paginationInfoText = hasActiveSearch
    ? `Página ${currentPage} | ${items.length} item(ns) nesta página | filtro: "${searchApplied}"`
    : `Página ${currentPage} de ~${estimatedTotalPages} | ${items.length} item(ns) nesta página`;

  const scopeOptions = [
    { value: "global", label: "Global" },
    { value: "client", label: "Por cliente" },
    { value: "site", label: "Por site" },
  ];

  const orderOptions = [
    { value: "asc", label: "Nome (A–Z)" },
    { value: "desc", label: "Nome (Z–A)" },
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
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-muted">{item.publisher ?? "Sem fabricante"}</p>
        </div>
      ),
    },
    {
      key: "lastSeen",
      header: "�sltima coleta",
      render: (item) => formatDate(item.lastCollectedAt ?? item.lastSeenAt),
    },
    {
      key: "details",
      header: "",
      className: "text-right",
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenSoftwareDetails(item);
          }}
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-light hover:text-foreground"
          aria-label={`Ver detalhes de ${item.name}`}
          title="Ver detalhes de instalação"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  const handleOpenSoftwareDetails = (software: SoftwareInventoryCatalogItem) => {
    setDetailsSoftware(software);
    setDetailsOpen(true);
    detailsPag.reset();
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsSoftware(null);
    detailsPag.reset();
  };

  const installations = useSoftwareInstallations({
    softwareId: detailsSoftware?.softwareId ?? "",
    scope,
    clientId: scope === "client" ? selectedClientId || undefined : undefined,
    siteId: scope === "site" ? selectedSiteId || undefined : undefined,
    cursor: detailsPag.cursor,
    limit: detailsPag.limit,
  });

  const detailsRows = installations.data?.items ?? [];
  const detailsUniqueClients = new Set(detailsRows.map((row) => row.clientName)).size;
  const detailsUniqueSites = new Set(detailsRows.map((row) => row.siteName)).size;
  const detailsUniqueAgents = new Set(detailsRows.map((row) => row.agentId)).size;
  const detailsUniqueVersions = new Set(detailsRows.map((row) => row.version ?? "\u2014")).size;
  const detailsCanNext = installations.data?.hasMore ?? false;
  const detailsCanPrev = detailsPag.page > 1 && !installations.isFetching;

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventário de Softwares</h1>
        <p className="text-sm text-muted">Consulta global, por cliente e por site</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AppWindow} label="Instalados" value={totalInstalled} tone="primary" />
        <StatCard icon={AppWindow} label="Softwares distintos" value={totalSoftware} tone="accent" />
        <StatCard icon={AppWindow} label="Agents distintos" value={totalAgents} tone="success" />
        <StatCard icon={AppWindow} label="�sltima coleta" value={snapshot.data?.lastCollectedAt ? new Date(snapshot.data.lastCollectedAt).toLocaleDateString("pt-BR") : "\u2014"} tone="warning" />
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Defina o escopo e os critérios de busca" />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Select value={scope} options={scopeOptions} onChange={(e) => handleScopeChange(e.target.value as SoftwareInventoryScope)} />

          {(scope === "client" || scope === "site") && (
            <Select value={selectedClientId} options={clientOptions} onChange={(e) => handleClientChange(e.target.value)} />
          )}

          {scope === "site" && (
            <Select value={selectedSiteId} options={siteOptions} onChange={(e) => { setSelectedSiteId(e.target.value); pag.reset(); }} />
          )}

          <Select value={order} options={orderOptions} onChange={(e) => handleOrderChange(e.target.value as "asc" | "desc")} />
          <Select value={String(pag.limit)} options={limitOptions} onChange={(e) => handleLimitChange(e.target.value)} />
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
          <div className="flex h-40 items-center justify-center text-sm text-muted">
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
            {/* Paginação superior */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">{paginationInfoText}</p>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={pag.goToPrev} disabled={!canPrev}>
                  Voltar
                </Button>

                <span className="px-2 text-xs tabular-nums text-muted">
                  {hasActiveSearch ? currentPage : `${currentPage} / ~${estimatedTotalPages}`}
                </span>

                <Button variant="secondary" size="sm" onClick={() => pag.goToNext(list.data?.nextCursor)} disabled={!canNext} loading={list.isFetching}>
                  Avançar
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <DataTable
                columns={columns}
                data={items}
                keyExtractor={(item) => item.softwareId}
                emptyMessage="Nenhum software encontrado para os filtros atuais"
                showPagination={false}
              />
            </div>

            {/* Paginação inferior */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">{paginationInfoText}</p>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={pag.goToPrev} disabled={!canPrev}>
                  Voltar
                </Button>

                <span className="px-2 text-xs tabular-nums text-muted">
                  {hasActiveSearch ? currentPage : `${currentPage} / ~${estimatedTotalPages}`}
                </span>

                <Button variant="secondary" size="sm" onClick={() => pag.goToNext(list.data?.nextCursor)} disabled={!canNext} loading={list.isFetching}>
                  Avançar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={detailsOpen}
        onClose={closeDetails}
        title={detailsSoftware ? `Detalhes - ${detailsSoftware.name}` : "Detalhes do software"}
        maxWidth="max-w-5xl"
      >
        {installations.isLoading ? (
          <div className="py-4">
            <Loading message="Carregando instalações por cliente/site/agente..." />
          </div>
        ) : installations.isError ? (
          <ErrorDisplay onRetry={() => installations.refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="primary">Instalações: {detailsRows.length}{detailsCanNext ? "+" : ""}</Badge>
              <Badge color="accent">Clientes: {detailsUniqueClients}</Badge>
              <Badge color="warning">Sites: {detailsUniqueSites}</Badge>
              <Badge color="success">Agents: {detailsUniqueAgents}</Badge>
              <Badge color="slate">Versões: {detailsUniqueVersions}</Badge>
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-light">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Cliente</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Site</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Agent</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Versão</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Última coleta</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {detailsRows.map((row) => (
                    <tr key={`${row.agentId}-${row.version ?? "sem-versao"}`} className="border-b border-border">
                      <td className="px-3 py-2 text-foreground">{row.clientName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.siteName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.agentDisplayName?.trim() || row.hostname}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{row.version ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-muted">{formatDate(row.lastSeenAt ?? row.collectedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/agents/${row.agentId}`)}
                          title="Abrir detalhes do agente"
                        >
                          Abrir agente
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {detailsRows.length === 0 && (
                <div className="flex h-28 items-center justify-center text-sm text-muted">
                  Nenhuma instalação encontrada para este software no escopo atual.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {detailsRows.length} instalação(ões) nesta página
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={detailsPag.goToPrev} disabled={!detailsCanPrev}>
                  Voltar
                </Button>
                <span className="px-2 text-xs tabular-nums text-muted">Página {detailsPag.page}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => detailsPag.goToNext(installations.data?.nextCursor)}
                  disabled={!detailsCanNext}
                  loading={installations.isFetching}
                >
                  Avançar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

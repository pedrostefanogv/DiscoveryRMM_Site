import { useEffect, useState } from "react";
import { AppWindow, Eye, Search } from "lucide-react";
import { Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, Select, StatCard, Button, Modal, Badge, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useSoftwareInventoryList, useSoftwareInventorySnapshot, type SoftwareInventoryScope } from "@/hooks/useSoftwareInventory";
import { useCursorPagination } from "@/hooks/useCursorPagination";
import { agentsApi, clientsApi, sitesApi, type Agent, type SoftwareInventoryCatalogItem } from "@/api";
import { useNavigate } from "react-router-dom";

interface SoftwareInstallationRow {
  agentId: string;
  agentName: string;
  siteName: string;
  clientName: string;
  version: string | null;
  source: string | null;
  collectedAt: string;
  lastSeenAt: string | null;
}

function formatDate(date: string | null): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleString("pt-BR");
}

export default function SoftwareInventory() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<SoftwareInventoryScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const pag = useCursorPagination({ initialLimit: 10 });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSoftware, setDetailsSoftware] = useState<SoftwareInventoryCatalogItem | null>(null);
  const [detailsRows, setDetailsRows] = useState<SoftwareInstallationRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsScannedAgents, setDetailsScannedAgents] = useState(0);

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
  const totalInstalled = list.data?.totalInstalled ?? snapshot.data?.totalInstalled ?? 0;
  const totalSoftware = list.data?.totalSoftware ?? snapshot.data?.distinctSoftware ?? 0;
  const totalAgents = list.data?.totalAgents ?? snapshot.data?.distinctAgents ?? 0;
  const totalCount = list.data?.totalSoftware ?? list.data?.count ?? snapshot.data?.distinctSoftware ?? 0;
  const resolvedLimit = list.data?.limit ?? pag.limit;
  const totalPages = Math.max(1, Math.ceil(totalCount / resolvedLimit));
  const currentPage = Math.min(pag.page, totalPages);

  useEffect(() => {
    if (pag.page > totalPages) {
      pag.reset();
    }
  }, [pag.page, totalPages]);

  const canPrev = pag.page > 1 && !list.isFetching;
  const canNext = Boolean(list.data?.hasMore && list.data?.nextCursor) && !list.isFetching;

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
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-muted">{item.publisher ?? "Sem fabricante"}</p>
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
      render: (item) => item.source ?? "\u2014",
    },
    {
      key: "lastSeen",
      header: "Última coleta",
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
            void handleOpenSoftwareDetails(item);
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

  const buildSoftwareRowsForAgent = async (
    software: SoftwareInventoryCatalogItem,
    agent: Agent,
    siteLookup: Map<string, { siteName: string; clientName: string }>,
  ) => {
    const collectedRows: SoftwareInstallationRow[] = [];

    const rawResult = await agentsApi.getSoftware(agent.id, {
        limit: 200,
        order: "desc",
      });

      // API now returns flat array instead of paginated object
      const pageItems = rawResult;

      const matched = pageItems.filter(
        (row) => row.softwareId === software.softwareId,
      );

      if (matched.length > 0) {
        const siteInfo = siteLookup.get(agent.siteId);
        const agentName = agent.displayName?.trim() || agent.hostname;
        matched.forEach((row) => {
          collectedRows.push({
            agentId: agent.id,
            agentName,
            siteName: siteInfo?.siteName ?? "Site desconhecido",
            clientName: siteInfo?.clientName ?? "Cliente desconhecido",
            version: row.version,
            source: row.source,
            collectedAt: row.collectedAt,
            lastSeenAt: row.lastSeenAt,
          });
        });
      }

      // No more pages since API returns all data at once

    return collectedRows;
  };

  const handleOpenSoftwareDetails = async (software: SoftwareInventoryCatalogItem) => {
    setDetailsOpen(true);
    setDetailsSoftware(software);
    setDetailsRows([]);
    setDetailsError(null);
    setDetailsLoading(true);
    setDetailsScannedAgents(0);

    try {
      let scopedClients = clients.data ?? [];
      let scopedAgents: Agent[] = [];
      const siteLookup = new Map<string, { siteName: string; clientName: string }>();

      if (scope === "global") {
        scopedClients = await clientsApi.list(true);
        const agentsByClient = await Promise.all(
          scopedClients.map((clientRow) => agentsApi.listByClient(clientRow.id)),
        );
        scopedAgents = agentsByClient.flat();

        const sitesByClient = await Promise.all(
          scopedClients.map(async (clientRow) => ({
            clientName: clientRow.name,
            sites: await sitesApi.list(clientRow.id, true),
          })),
        );

        sitesByClient.forEach(({ clientName, sites: clientSites }) => {
          clientSites.forEach((siteRow) => {
            siteLookup.set(siteRow.id, { siteName: siteRow.name, clientName });
          });
        });
      }

      if (scope === "client") {
        if (!selectedClientId) throw new Error("Cliente não selecionado.");

        const selectedClientName =
          scopedClients.find((c) => c.id === selectedClientId)?.name ?? "Cliente";

        const [clientAgents, clientSites] = await Promise.all([
          agentsApi.listByClient(selectedClientId),
          sitesApi.list(selectedClientId, true),
        ]);

        scopedAgents = clientAgents;
        clientSites.forEach((siteRow) => {
          siteLookup.set(siteRow.id, {
            siteName: siteRow.name,
            clientName: selectedClientName,
          });
        });
      }

      if (scope === "site") {
        if (!selectedSiteId || !selectedClientId) {
          throw new Error("Cliente/Site não selecionado.");
        }

        const selectedClientName =
          scopedClients.find((c) => c.id === selectedClientId)?.name ?? "Cliente";

        const [siteAgents, clientSites] = await Promise.all([
          agentsApi.listBySite(selectedSiteId),
          sitesApi.list(selectedClientId, true),
        ]);

        scopedAgents = siteAgents;
        clientSites.forEach((siteRow) => {
          siteLookup.set(siteRow.id, {
            siteName: siteRow.name,
            clientName: selectedClientName,
          });
        });
      }

      const detailedRows: SoftwareInstallationRow[] = [];
      setDetailsScannedAgents(0);
      for (const agentRow of scopedAgents) {
        const rowsForAgent = await buildSoftwareRowsForAgent(software, agentRow, siteLookup);
        detailedRows.push(...rowsForAgent);
        setDetailsScannedAgents((prev) => prev + 1);
      }

      detailedRows.sort((a, b) => {
        if (a.clientName !== b.clientName) return a.clientName.localeCompare(b.clientName, "pt-BR");
        if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName, "pt-BR");
        return a.agentName.localeCompare(b.agentName, "pt-BR");
      });

      setDetailsRows(detailedRows);
    } catch {
      setDetailsError("Não foi possível carregar os detalhes deste software.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsSoftware(null);
    setDetailsRows([]);
    setDetailsError(null);
    setDetailsLoading(false);
    setDetailsScannedAgents(0);
  };

  const detailsUniqueClients = new Set(detailsRows.map((row) => row.clientName)).size;
  const detailsUniqueSites = new Set(detailsRows.map((row) => row.siteName)).size;
  const detailsUniqueAgents = new Set(detailsRows.map((row) => row.agentId)).size;
  const detailsUniqueVersions = new Set(detailsRows.map((row) => row.version ?? "\u2014")).size;

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
        <StatCard icon={AppWindow} label="Última coleta" value={snapshot.data?.lastCollectedAt ? new Date(snapshot.data.lastCollectedAt).toLocaleDateString("pt-BR") : "\u2014"} tone="warning" />
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
            <DataTable
              columns={columns}
              data={items}
              keyExtractor={(item) => item.softwareId}
              emptyMessage="Nenhum software encontrado para os filtros atuais"
              showPagination={false}
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Página {currentPage} de {totalPages} | {items.length} item(ns) nesta página
                {searchApplied ? ` | filtro: "${searchApplied}"` : ""}
              </p>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={pag.goToPrev} disabled={!canPrev}>
                  Voltar
                </Button>

                <span className="px-2 text-xs tabular-nums text-muted">
                  {currentPage} / {totalPages}
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
        {detailsLoading ? (
          <div className="space-y-3 py-4">
            <Loading message="Carregando instalações por cliente/site/agente..." />
            <p className="text-center text-xs text-muted">
              Agentes verificados: {detailsScannedAgents}
            </p>
          </div>
        ) : detailsError ? (
          <ErrorDisplay message={detailsError} onRetry={() => detailsSoftware && void handleOpenSoftwareDetails(detailsSoftware)} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="primary">Instalações: {detailsRows.length}</Badge>
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
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Fonte</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted">Última coleta</th>
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {detailsRows.map((row) => (
                    <tr key={`${row.agentId}-${row.version ?? "sem-versao"}-${row.collectedAt}`} className="border-b border-border">
                      <td className="px-3 py-2 text-foreground">{row.clientName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.siteName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.agentName}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{row.version ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.source ?? "\u2014"}</td>
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
          </div>
        )}
      </Modal>
    </div>
  );
}

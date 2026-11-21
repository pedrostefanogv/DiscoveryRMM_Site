import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  PageHeader,
  Select,
  type MaterialSymbolName,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useServiceBoard } from "@/hooks/useServiceBoard";
import type {
  ServiceBoardItemDto,
  ServiceBoardItemKind,
} from "@/api/serviceBoard";

type SeverityFilter = "" | "urgent" | "normal" | "low";
type BoardViewMode = "list" | "board";

interface KindMeta {
  /** Rótulo singular exibido na linha/cartão do item. */
  label: string;
  /** Rótulo plural exibido no cartão-resumo e no cabeçalho de coluna. */
  pluralLabel: string;
  icon: MaterialSymbolName;
  iconBoxClass: string;
  barClass: string;
  activeCardClass: string;
  columnAccentClass: string;
}

const KIND_META: Record<ServiceBoardItemKind, KindMeta> = {
  ticket: {
    label: "Chamado",
    pluralLabel: "Chamados",
    icon: "confirmation_number",
    iconBoxClass: "bg-primary/15 text-primary ring-1 ring-primary/25",
    barClass: "status-bar-primary",
    activeCardClass: "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
    columnAccentClass: "border-t-primary",
  },
  automation: {
    label: "Automação",
    pluralLabel: "Automação",
    icon: "smart_toy",
    iconBoxClass: "bg-accent/15 text-accent ring-1 ring-accent/25",
    barClass: "status-bar-primary",
    activeCardClass: "border-accent/50 bg-accent/5 ring-1 ring-accent/30",
    columnAccentClass: "border-t-accent",
  },
  patch: {
    label: "Patch",
    pluralLabel: "Patches",
    icon: "gpp_maybe",
    iconBoxClass: "bg-warning/15 text-warning ring-1 ring-warning/25",
    barClass: "status-bar-warning",
    activeCardClass: "border-warning/50 bg-warning/5 ring-1 ring-warning/30",
    columnAccentClass: "border-t-warning",
  },
  alert: {
    label: "Alerta",
    pluralLabel: "Alertas",
    icon: "notifications",
    iconBoxClass: "bg-success/15 text-success ring-1 ring-success/25",
    barClass: "status-bar-success",
    activeCardClass: "border-success/50 bg-success/5 ring-1 ring-success/30",
    columnAccentClass: "border-t-success",
  },
};

const KIND_ORDER: ServiceBoardItemKind[] = ["ticket", "automation", "patch", "alert"];

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "urgent", label: "Crítica / Alta" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Baixa" },
];

const VIEW_TABS: { id: BoardViewMode; label: string; icon: MaterialSymbolName }[] = [
  { id: "list", label: "Lista priorizada", icon: "view_list" },
  { id: "board", label: "Por categoria", icon: "view_quilt" },
];

/** Idade relativa compacta: "+3h", "+2d". */
export function formatAge(ageHours: number): string {
  if (ageHours < 24) return `+${Math.max(1, Math.round(ageHours))}h`;
  return `+${Math.round(ageHours / 24)}d`;
}

/** Minúsculas sem acento: "Crítica" casa com "critical" etc. */
function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function priorityBadgeColor(priority: string | null | undefined) {
  const normalized = norm(priority);
  if (
    normalized.includes("critic") ||
    normalized.includes("urgent") ||
    normalized.includes("alta") ||
    normalized.includes("error")
  ) {
    return "danger" as const;
  }
  if (normalized.includes("high") || normalized.includes("media") || normalized.includes("warning")) {
    return "warning" as const;
  }
  return "slate" as const;
}

function statusBadgeColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("breach")) {
    return "danger" as const;
  }
  if (normalized.includes("resolved") || normalized.includes("closed") || normalized.includes("success")) {
    return "success" as const;
  }
  return "primary" as const;
}

/** Fila do board: prioridade decrescente, depois idade decrescente (o mais
 * velho/abandonado primeiro). O backend já ordena; mantemos a ordenação no
 * cliente para o caso de filtros locais reagruparem a lista. */
function priorityRank(priority: string | null): number {
  const p = norm(priority);
  if (p.includes("critic") || p.includes("urgent") || p.includes("alta") || p.includes("error")) return 5;
  if (p.includes("high") || p.includes("media") || p.includes("warning")) return 4;
  if (p.includes("normal") || p.includes("medium") || p.includes("info")) return 3;
  if (p.includes("low") || p.includes("success")) return 2;
  return 1;
}

function matchesSeverity(priority: string | null, filter: SeverityFilter): boolean {
  if (!filter) return true;
  const rank = priorityRank(priority);
  if (filter === "urgent") return rank >= 4;
  if (filter === "normal") return rank === 3;
  return rank <= 2;
}

function formatSyncTime(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ageToneClass(ageHours: number): string {
  if (ageHours >= 72) return "border-danger/30 bg-danger/10 text-danger";
  if (ageHours >= 24) return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-surface-light text-muted";
}

function QueueRow({ item }: { item: ServiceBoardItemDto }) {
  const meta = KIND_META[item.kind];
  const rank = priorityRank(item.priority);
  const severityBorder =
    rank >= 5
      ? "border-l-danger"
      : rank === 4
        ? "border-l-warning"
        : rank === 3
          ? "border-l-primary/60"
          : "border-l-border-strong";

  return (
    <Link
      to={item.deepLink}
      data-testid={`service-board-item-${item.kind}`}
      className={`group flex items-center gap-3 rounded-xl border border-border border-l-4 ${severityBorder} bg-surface/95 px-3.5 py-3 shadow-sm transition-all hover:-translate-y-px hover:border-border-strong hover:bg-surface-light/90 hover:shadow-md`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.iconBoxClass}`}
      >
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="slate" className="shrink-0">
            {meta.label}
          </Badge>
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground group-hover:text-primary"
            title={item.title}
          >
            {item.title}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          {item.clientName && (
            <span className="inline-flex items-center gap-1 truncate text-muted-foreground">
              <Icon name="apartment" className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="truncate">{item.clientName}</span>
            </span>
          )}
          <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
          {item.priority && (
            <Badge color={priorityBadgeColor(item.priority)}>{item.priority}</Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${ageToneClass(item.ageHours)}`}
          title="Idade do item na fila"
        >
          <Icon name="alarm" className="h-3 w-3" />
          {formatAge(item.ageHours)}
        </span>
        <Icon
          name="chevron_right"
          className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </div>
    </Link>
  );
}

function BoardColumnCard({ item }: { item: ServiceBoardItemDto }) {
  const rank = priorityRank(item.priority);
  const severityBorder =
    rank >= 5 ? "border-l-danger" : rank === 4 ? "border-l-warning" : "border-l-primary/40";

  return (
    <Link
      to={item.deepLink}
      data-testid={`service-board-item-${item.kind}`}
      className={`group block rounded-xl border border-border border-l-4 ${severityBorder} bg-surface p-3 transition-all hover:-translate-y-px hover:border-border-strong hover:bg-surface-light/90`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary" title={item.title}>
          {item.title}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${ageToneClass(item.ageHours)}`}
        >
          {formatAge(item.ageHours)}
        </span>
      </div>

      {item.clientName && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted">
          <Icon name="apartment" className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.clientName}</span>
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
          {item.priority && (
            <Badge color={priorityBadgeColor(item.priority)}>{item.priority}</Badge>
          )}
        </div>
        <Icon
          name="arrow_outward"
          className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </Link>
  );
}

export default function ServiceBoardPage() {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [kindFilter, setKindFilter] = useState<ServiceBoardItemKind | "">("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<BoardViewMode>("list");
  const tabRefs = useRef<Record<BoardViewMode, HTMLButtonElement | null>>({
    list: null,
    board: null,
  });

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const board = useServiceBoard({
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
  });

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes..." },
      ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [
      { value: "", label: "Todos os sites..." },
      ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name })),
    ],
    [sites.data],
  );

  const counts = board.data?.counts;
  const allItems = board.data?.items ?? [];

  const urgentCount = useMemo(
    () => allItems.filter((item) => priorityRank(item.priority) >= 4).length,
    [allItems],
  );

  const visibleItems = useMemo(() => {
    const term = norm(searchQuery.trim());
    const filtered = allItems.filter((item) => {
      if (kindFilter && item.kind !== kindFilter) return false;
      if (!matchesSeverity(item.priority, severityFilter)) return false;
      if (term) {
        const haystack = `${norm(item.title)} ${norm(item.clientName)} ${norm(item.status)} ${norm(item.priority)}`;
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    return [...filtered].sort(
      (a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        b.ageHours - a.ageHours,
    );
  }, [allItems, kindFilter, severityFilter, searchQuery]);

  const itemsByKind = useMemo(() => {
    const grouped: Record<ServiceBoardItemKind, ServiceBoardItemDto[]> = {
      ticket: [],
      automation: [],
      patch: [],
      alert: [],
    };
    for (const item of visibleItems) {
      grouped[item.kind].push(item);
    }
    return grouped;
  }, [visibleItems]);

  const totalKnown = counts
    ? KIND_ORDER.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0)
    : allItems.length;
  const hidden = Math.max(0, totalKnown - allItems.length);
  const lastSync = formatSyncTime(board.data?.generatedAtUtc);

  const hasLocalFilters = Boolean(
    kindFilter || severityFilter || searchQuery.trim() || selectedClientId || selectedSiteId,
  );

  const clearAllFilters = () => {
    setKindFilter("");
    setSeverityFilter("");
    setSearchQuery("");
    setSelectedClientId("");
    setSelectedSiteId("");
  };

  const handleViewTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % VIEW_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = VIEW_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = VIEW_TABS[nextIndex];
    setViewMode(target.id);
    const btn = tabRefs.current[target.id];
    btn?.focus();
    btn?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const boardColumns = kindFilter ? [kindFilter] : KIND_ORDER;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service Board"
        description="Centro de triagem unificado: chamados, automações falhas, patches pendentes e alertas priorizados."
      >
        {urgentCount > 0 && (
          <Badge color="danger" className="gap-1.5 py-1">
            <Icon name="warning" className="h-3.5 w-3.5" />
            {urgentCount} crítico(s)/alto(s)
          </Badge>
        )}

        <span
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground"
          title="Atualização automática a cada 30 segundos"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              board.isFetching ? "animate-pulse bg-warning" : "bg-success"
            }`}
            aria-hidden="true"
          />
          <span>{board.isFetching ? "Sincronizando…" : "Ao vivo · 30s"}</span>
          {lastSync && <span className="hidden text-muted sm:inline">· {lastSync}</span>}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void board.refetch()}
          disabled={board.isFetching}
        >
          <Icon name="refresh" className={`h-4 w-4 ${board.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </PageHeader>

      {/* Cartões-resumo interativos: clicar filtra a fila pelo tipo */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const count = counts?.[kind] ?? 0;
          const sharePct = totalKnown > 0 ? Math.round((count / totalKnown) * 100) : 0;
          const isActive = kindFilter === kind;

          return (
            <button
              key={kind}
              type="button"
              onClick={() => setKindFilter(isActive ? "" : kind)}
              aria-pressed={isActive}
              className={`glass-card glass-card-interactive flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                isActive
                  ? meta.activeCardClass
                  : "border-border bg-surface/95 hover:border-border-strong"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconBoxClass}`}
                  >
                    <Icon name={meta.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {meta.pluralLabel}
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{count}</p>
                  </div>
                </div>
                <span className="text-xs font-medium tabular-nums text-muted">
                  {isActive ? (
                    <Badge color="primary">Filtrado</Badge>
                  ) : (
                    `${sharePct}%`
                  )}
                </span>
              </div>

              <progress
                max={100}
                value={sharePct}
                aria-label={`Proporção de ${meta.pluralLabel}`}
                className={`status-bar ${meta.barClass}`}
              />
            </button>
          );
        })}
      </div>

      {/* Barra unificada de busca, escopo, severidade e modo de visualização */}
      <Card padding={false} className="p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <Input
                aria-label="Buscar na fila"
                placeholder="Filtrar por título, cliente ou status…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Select
              aria-label="Cliente"
              value={selectedClientId}
              onChange={(event) => {
                setSelectedClientId(event.target.value);
                setSelectedSiteId("");
              }}
              options={clientOptions}
            />

            <Select
              aria-label="Site"
              value={selectedSiteId}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              options={siteOptions}
              disabled={!selectedClientId}
            />
          </div>

          {/* Seletor de visualização em linha única seguindo WAI-ARIA tabs + underline */}
          <div
            role="tablist"
            aria-label="Modo de visualização da fila"
            className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border lg:shrink-0"
          >
            {VIEW_TABS.map((tab, index) => {
              const selected = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setViewMode(tab.id)}
                  onKeyDown={(event) => handleViewTabKeyDown(event, index)}
                  className={`relative flex-none inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    selected
                      ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name={tab.icon} className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtro rápido de severidade + resumo */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted">Prioridade:</span>
            {SEVERITY_OPTIONS.map((option) => {
              const active = severityFilter === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSeverityFilter(option.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="tabular-nums">
              {visibleItems.length} {visibleItems.length === 1 ? "item exibido" : "itens exibidos"}
            </span>
            {kindFilter && (
              <button
                type="button"
                onClick={() => setKindFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-primary hover:bg-primary/20"
                title="Limpar filtro de tipo"
              >
                Tipo: {KIND_META[kindFilter].label}
                <Icon name="close" className="h-3 w-3" />
              </button>
            )}
            {hasLocalFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </Card>

      {board.isLoading ? (
        <Loading />
      ) : board.isError ? (
        <ErrorDisplay onRetry={() => board.refetch()} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="Fila vazia"
          description={
            hasLocalFilters
              ? "Nenhum item encontrado com os filtros atuais."
              : "Nada pendente no momento — chamados, automações, patches e alertas em dia."
          }
        />
      ) : (
        <div className="space-y-3">
          {viewMode === "list" ? (
            <div className="flex flex-col gap-2">
              {visibleItems.map((item) => (
                <QueueRow key={item.kind + ":" + item.id} item={item} />
              ))}
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                boardColumns.length === 1
                  ? "grid-cols-1"
                  : "md:grid-cols-2 2xl:grid-cols-4"
              }`}
            >
              {boardColumns.map((kind) => {
                const meta = KIND_META[kind];
                const colItems = itemsByKind[kind];
                return (
                  <Card
                    key={kind}
                    padding={false}
                    className={`flex flex-col border-t-4 ${meta.columnAccentClass} p-3`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.iconBoxClass}`}
                        >
                          <Icon name={meta.icon} className="h-4 w-4" />
                        </span>
                        <h2 className="text-sm font-semibold text-foreground">
                          {meta.pluralLabel}
                        </h2>
                      </div>
                      <Badge color="slate">{colItems.length}</Badge>
                    </div>

                    {colItems.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-8 text-xs text-muted">
                        Sem pendências nesta categoria
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {colItems.map((item) => (
                          <BoardColumnCard key={item.kind + ":" + item.id} item={item} />
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {hidden > 0 && (
            <p className="text-center text-xs text-muted">
              Mostrando {visibleItems.length} de {totalKnown} itens — {hidden} ocultados pelo limite da API. Refine os filtros para ver mais.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

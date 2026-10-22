import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Bell, Bot, ChevronRight, RefreshCw, ShieldAlert, Ticket as TicketIcon } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorDisplay,
  Loading,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useServiceBoard } from "@/hooks/useServiceBoard";
import type {
  ServiceBoardItemDto,
  ServiceBoardItemKind,
} from "@/api/serviceBoard";

const KIND_META: Record<ServiceBoardItemKind, { label: string; icon: typeof TicketIcon }> = {
  ticket: { label: "Chamado", icon: TicketIcon },
  automation: { label: "Automação", icon: Bot },
  patch: { label: "Patch", icon: ShieldAlert },
  alert: { label: "Alerta", icon: Bell },
};

const KIND_ORDER: ServiceBoardItemKind[] = ["ticket", "automation", "patch", "alert"];

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
  if (normalized.includes("critic") || normalized.includes("urgent") || normalized.includes("alta") || normalized.includes("error"))
    return "danger" as const;
  if (normalized.includes("high") || normalized.includes("media") || normalized.includes("warning"))
    return "warning" as const;
  return "slate" as const;
}

function statusBadgeColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("breach"))
    return "danger" as const;
  if (normalized.includes("resolved") || normalized.includes("closed") || normalized.includes("success"))
    return "success" as const;
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

function QueueRow({ item }: { item: ServiceBoardItemDto }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const severity = priorityRank(item.priority) >= 4 ? "border-l-danger" : priorityRank(item.priority) === 3 ? "border-l-warning" : "border-l-transparent";
  return (
    <Link
      to={item.deepLink}
      data-testid={`service-board-item-${item.kind}`}
      className={`group flex items-center gap-3 border-l-4 ${severity} rounded-r-lg border-y border-r border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-light`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light ring-1 ring-border">
        <Icon className="h-4 w-4 text-muted" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <Badge color="slate" className="shrink-0">{meta.label}</Badge>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={item.title}>
            {item.title}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          {item.clientName && <span className="truncate">{item.clientName}</span>}
          <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
          {item.priority && <Badge color={priorityBadgeColor(item.priority)}>{item.priority}</Badge>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted" title="Idade do item">
        <AlarmClock className="h-3 w-3" />
        {formatAge(item.ageHours)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export default function ServiceBoardPage() {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [kindFilter, setKindFilter] = useState<ServiceBoardItemKind | "">("");

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

  const visibleItems = useMemo(() => {
    const filtered = kindFilter ? allItems.filter((item) => item.kind === kindFilter) : allItems;
    return [...filtered].sort(
      (a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        b.ageHours - a.ageHours,
    );
  }, [allItems, kindFilter]);

  const totalKnown = counts
    ? KIND_ORDER.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0)
    : allItems.length;
  const hidden = Math.max(0, totalKnown - allItems.length);

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Board"
        description="Fila priorizada do que precisa de atenção: chamados, automações, patches e alertas (atualiza a cada 30s)."
      >
        <Button variant="secondary" onClick={() => void board.refetch()} disabled={board.isFetching}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

      {/* Resumo: clicar em um cartão filtra a fila pelo tipo. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const tone = kind === "ticket" ? "primary" : kind === "automation" ? "accent" : kind === "patch" ? "warning" : "success";
          return (
            <StatCard
              key={kind}
              icon={meta.icon}
              label={kind === "ticket" ? "Chamados" : kind === "automation" ? "Automação" : kind === "patch" ? "Patches" : "Alertas"}
              value={counts?.[kind] ?? 0}
              tone={tone}
              active={kindFilter === kind}
              onClick={() => setKindFilter(kindFilter === kind ? "" : kind)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Cliente"
          fullWidth={false}
          value={selectedClientId}
          onChange={(event) => {
            setSelectedClientId(event.target.value);
            setSelectedSiteId("");
          }}
          options={clientOptions}
        />
        <Select
          label="Site"
          fullWidth={false}
          value={selectedSiteId}
          onChange={(event) => setSelectedSiteId(event.target.value)}
          options={siteOptions}
          disabled={!selectedClientId}
        />
        {kindFilter && (
          <Button
            variant="ghost"
            onClick={() => setKindFilter("")}
            title="Limpar filtro de tipo"
          >
            Filtro: {KIND_META[kindFilter].label} · limpar
          </Button>
        )}
      </div>

      {board.isLoading ? (
        <Loading />
      ) : board.isError ? (
        <ErrorDisplay onRetry={() => board.refetch()} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="Fila vazia"
          description={kindFilter || selectedClientId || selectedSiteId
            ? "Nenhum item com os filtros atuais."
            : "Nada pendente no momento — chamados, automações, patches e alertas em dia."}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            {visibleItems.map((item) => (
              <QueueRow key={item.kind + ":" + item.id} item={item} />
            ))}
          </div>
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

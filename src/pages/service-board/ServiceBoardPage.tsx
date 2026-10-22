import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Bell, Bot, RefreshCw, ShieldAlert, Ticket as TicketIcon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ErrorDisplay,
  Loading,
  PageHeader,
  Select,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useServiceBoard } from "@/hooks/useServiceBoard";
import type {
  ServiceBoardItemDto,
  ServiceBoardItemKind,
} from "@/api/serviceBoard";

const KIND_COLUMNS: Array<{
  kind: ServiceBoardItemKind;
  title: string;
  icon: typeof TicketIcon;
}> = [
  { kind: "ticket", title: "Chamados", icon: TicketIcon },
  { kind: "automation", title: "Automação", icon: Bot },
  { kind: "patch", title: "Patches", icon: ShieldAlert },
  { kind: "alert", title: "Alertas", icon: Bell },
];

/** Idade relativa compacta: "+3h", "+2d". */
export function formatAge(ageHours: number): string {
  if (ageHours < 24) return `+${Math.max(1, Math.round(ageHours))}h`;
  return `+${Math.round(ageHours / 24)}d`;
}

function priorityBadgeColor(priority: string | null | undefined) {
  const normalized = (priority ?? "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("urgent") || normalized.includes("alta"))
    return "danger" as const;
  if (normalized.includes("high") || normalized.includes("média") || normalized.includes("media"))
    return "warning" as const;
  return "slate" as const;
}

function statusBadgeColor(status: string) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("breach") ||
    normalized.includes("resolved") ||
    normalized.includes("closed")
  )
    return normalized.includes("fail") || normalized.includes("error") || normalized.includes("breach")
      ? ("danger" as const)
      : ("success" as const);
  return "primary" as const;
}

function BoardCard({ item }: { item: ServiceBoardItemDto }) {
  return (
    <Link
      to={item.deepLink}
      className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-light"
      data-testid={`service-board-item-${item.kind}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={item.title}>
          {item.title}
        </p>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted" title="Idade do item">
          <AlarmClock className="h-3 w-3" />
          {formatAge(item.ageHours)}
        </span>
      </div>
      {(item.clientName || item.status || item.priority) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.clientName && (
            <span className="truncate text-[11px] text-muted">{item.clientName}</span>
          )}
          <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
          {item.priority && (
            <Badge color={priorityBadgeColor(item.priority)}>{item.priority}</Badge>
          )}
        </div>
      )}
    </Link>
  );
}

export default function ServiceBoardPage() {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const board = useServiceBoard({
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
  });

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes..." },
      ...(clients.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })),
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

  const itemsByKind = useMemo(() => {
    const map = new Map<ServiceBoardItemKind, ServiceBoardItemDto[]>();
    for (const item of board.data?.items ?? []) {
      const list = map.get(item.kind) ?? [];
      list.push(item);
      map.set(item.kind, list);
    }
    return map;
  }, [board.data?.items]);

  const counts = board.data?.counts;

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Board"
        description="Visão operacional unificada de chamados, automação, patches e alertas (atualiza a cada 30s)."
      >
        <Button
          variant="secondary"
          onClick={() => void board.refetch()}
          disabled={board.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

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
      </div>

      {board.isLoading ? (
        <Loading />
      ) : board.isError ? (
        <ErrorDisplay onRetry={() => board.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KIND_COLUMNS.map(({ kind, title, icon: Icon }) => {
            const items = itemsByKind.get(kind) ?? [];
            return (
              <Card key={kind} className="flex flex-col">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted" />
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                  </div>
                  <Badge color="slate">{counts?.[kind] ?? items.length}</Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {items.map((item) => (
                    <BoardCard key={item.kind + ":" + item.id} item={item} />
                  ))}
                  {items.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted">Nada aqui</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

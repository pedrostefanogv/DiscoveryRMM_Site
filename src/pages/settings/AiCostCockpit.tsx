import { formatDate } from '@/utils/format';
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ticketAssignmentApi } from "@/api";
import {
  Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  PageHeader,
  Select,
  StatCard,
  type Column,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useAiCostCockpit } from "@/hooks/useAiCostCockpit";
import type {
  AiCostByClientDto,
  AiCostTopToolDto,
} from "@/api/aiCost";

function formatUsd(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Percentual custo/orçamento (proporcional ao período selecionado); null quando não há orçamento. */
export function budgetPercent(row: AiCostByClientDto, periodDays = 30): number | null {
  const budget = row.budgetUsdMonthly;
  if (!budget || budget <= 0) return null;
  const effectiveBudget = budget * (Math.max(1, periodDays) / 30);
  return (row.costUsd / effectiveBudget) * 100;
}

function BudgetBar({ row, periodDays }: { row: AiCostByClientDto; periodDays: number }) {
  const percent = budgetPercent(row, periodDays);
  if (percent === null) return <span className="text-xs text-muted">Sem orçamento</span>;
  const clamped = Math.min(100, Math.max(0, percent));
  const over = percent >= 100;
  const warning = !over && percent >= 80;
  const effectiveBudget = (row.budgetUsdMonthly ?? 0) * (Math.max(1, periodDays) / 30);
  return (
    <div className="min-w-[140px]" title={`${percent.toFixed(1)}% do orçamento proporcional (${periodDays}d)`}>
      <div className="flex items-center justify-between text-xs">
        <span className="tabular-nums text-muted">{formatUsd(row.costUsd)}</span>
        <span className={`tabular-nums ${over ? "text-danger" : warning ? "text-warning" : "text-muted"}`}>
          / {formatUsd(effectiveBudget)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-light">
        <div
          className={`h-full rounded-full ${over ? "bg-danger" : warning ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function AssignmentDecisionsTab({ from, to }: { from: string; to: string }) {
  const decisionsQuery = useQuery({
    queryKey: ["ai-assignment-decisions", from, to],
    queryFn: () => ticketAssignmentApi.listDecisions({ from, to, pageSize: 50 }),
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardHeader
        title="Decisões de auto-atribuição por IA"
        subtitle="Histórico recente de triagem e atribuição automática de chamados."
      />
      {decisionsQuery.isLoading ? (
        <Loading />
      ) : decisionsQuery.isError ? (
        <ErrorDisplay onRetry={() => void decisionsQuery.refetch()} />
      ) : (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Chamado</th>
                <th className="py-2 pr-3">Escolhido</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2 pr-3 text-right">Confiança</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {(decisionsQuery.data ?? []).map((d) => (
                <tr key={d.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </td>
                  <td className="py-2 pr-3">
                    <Link to={`/tickets/${d.ticketId}`} className="font-mono text-primary hover:underline">
                      {d.ticketId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-medium">{d.chosenUserName ?? d.chosenUserId ?? "—"}</td>
                  <td className="py-2 pr-3">{d.strategySource}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {d.confidence > 0 ? `${(d.confidence * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge color={d.overriddenAt ? "warning" : d.applied ? "success" : "slate"}>
                      {d.overriddenAt ? "trocada" : d.applied ? "aplicada" : "não aplicada"}
                    </Badge>
                  </td>
                  <td className="py-2 max-w-xs truncate text-muted-foreground" title={d.notAppliedReason ?? d.rationale ?? ""}>
                    {d.notAppliedReason ?? d.rationale ?? "—"}
                  </td>
                </tr>
              ))}
              {(decisionsQuery.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    Nenhuma decisão de triagem registrada no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function AiCostCockpit() {
  const [activeTab, setActiveTab] = useState<"cost" | "assignment">("cost");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [clientSearch, setClientSearch] = useState("");
  const [clientSort, setClientSort] = useState<"cost" | "requests" | "name">("cost");

  const { from, to } = useMemo(() => {
    const days = Number(periodDays) || 30;
    const now = new Date();
    const toDay = now.toISOString().slice(0, 10);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
    return { from: start.toISOString().slice(0, 10), to: toDay };
  }, [periodDays]);

  const clients = useClients();
  const cockpit = useAiCostCockpit({
    clientId: selectedClientId || undefined,
    from,
    to,
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

  const clientColumns: Column<AiCostByClientDto>[] = [
    { key: "clientName", header: "Cliente", render: (item) => item.clientName },
    {
      key: "requests",
      header: "Requisições",
      className: "text-right tabular-nums",
      render: (item) => formatNumber(item.requests),
    },
    {
      key: "inputTokens",
      header: "Tokens entrada",
      className: "text-right tabular-nums",
      render: (item) => formatNumber(item.inputTokens),
    },
    {
      key: "outputTokens",
      header: "Tokens saída",
      className: "text-right tabular-nums",
      render: (item) => formatNumber(item.outputTokens),
    },
    {
      key: "costUsd",
      header: "Custo",
      className: "text-right tabular-nums",
      render: (item) => formatUsd(item.costUsd),
    },
    {
      key: "budgetUsdMonthly",
      header: `Orçamento (${periodDays}d)`,
      render: (item) => <BudgetBar row={item} periodDays={Number(periodDays) || 30} />,
    },
  ];

  const toolColumns: Column<AiCostTopToolDto>[] = [
    { key: "tool", header: "Ferramenta", render: (item) => item.tool },
    {
      key: "calls",
      header: "Chamadas",
      className: "text-right tabular-nums",
      render: (item) => formatNumber(item.calls),
    },
    {
      key: "costUsd",
      header: "Custo (USD)",
      className: "text-right tabular-nums",
      render: (item) => formatUsd(item.costUsd ?? 0),
    },
  ];

  const filteredClients = useMemo(() => {
    const rows = [...(cockpit.data?.byClient ?? [])];
    const q = clientSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.clientName.toLowerCase().includes(q))
      : rows;
    filtered.sort((a, b) => {
      if (clientSort === "name") return a.clientName.localeCompare(b.clientName, "pt-BR");
      if (clientSort === "requests") return b.requests - a.requests;
      return b.costUsd - a.costUsd;
    });
    return filtered;
  }, [cockpit.data?.byClient, clientSearch, clientSort]);

  function handleExportCsv() {
    const header = "Cliente,Requisicoes,TokensEntrada,TokensSaida,CustoUSD,OrcamentoMensalUSD";
    const lines = filteredClients.map((r) =>
      `"${r.clientName.replace(/"/g, '""')}",${r.requests},${r.inputTokens},${r.outputTokens},${r.costUsd.toFixed(4)},${r.budgetUsdMonthly ?? ""}`,
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-cost-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = cockpit.data?.totals;

  if (cockpit.isLoading && !cockpit.data) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cockpit de custo IA"
        description="Consumo de tokens, orçamento mensal e uso de ferramentas (MCP). Valores em USD são estimativas por token."
        breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleExportCsv}
            disabled={filteredClients.length === 0}
          >
            <Icon name="download" className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => void cockpit.refetch()}
            disabled={cockpit.isFetching}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </PageHeader>

      <div className="flex gap-2 border-b border-border pb-2">
        <Button
          type="button"
          size="sm"
          variant={activeTab === "cost" ? "primary" : "ghost"}
          onClick={() => setActiveTab("cost")}
        >
          Consumo & Ferramentas
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === "assignment" ? "primary" : "ghost"}
          onClick={() => setActiveTab("assignment")}
        >
          Auditoria de Triagem IA
        </Button>
      </div>

      {activeTab === "assignment" ? (
        <AssignmentDecisionsTab from={from} to={to} />
      ) : (
      <>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Cliente"
          fullWidth={false}
          value={selectedClientId}
          onChange={(event) => setSelectedClientId(event.target.value)}
          options={clientOptions}
        />
        <Select
          label="Período"
          fullWidth={false}
          value={periodDays}
          onChange={(event) => setPeriodDays(event.target.value)}
          options={[
            { value: "7", label: "Últimos 7 dias" },
            { value: "30", label: "Últimos 30 dias" },
            { value: "90", label: "Últimos 90 dias" },
          ]}
        />
      </div>

      {cockpit.isLoading ? (
        <Loading />
      ) : cockpit.isError ? (
        <ErrorDisplay onRetry={() => cockpit.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon="memory"
              label="Requisições"
              value={formatNumber(totals?.requests ?? 0)}
              tone="primary"
            />
            <StatCard
              icon="dns"
              label="Tokens de entrada"
              value={formatNumber(totals?.inputTokens ?? 0)}
              tone="accent"
            />
            <StatCard
              icon="trending_up"
              label="Tokens de saída"
              value={formatNumber(totals?.outputTokens ?? 0)}
              tone="accent"
            />
            <StatCard
              icon="attach_money"
              label="Custo total (USD)"
              value={formatUsd(totals?.costUsd ?? 0)}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader
              title="Custo por cliente"
              subtitle={
                cockpit.data
                  ? `Período: ${formatDate(cockpit.data.fromUtc)} a ${formatDate(cockpit.data.toUtc)}`
                  : undefined
              }
            />
            <div className="mb-3 flex flex-wrap items-center gap-3 px-4">
              <Input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="max-w-xs"
              />
              <Select
                fullWidth={false}
                value={clientSort}
                onChange={(e) => setClientSort(e.target.value as "cost" | "requests" | "name")}
                options={[
                  { value: "cost", label: "Ordenar por custo" },
                  { value: "requests", label: "Ordenar por requisições" },
                  { value: "name", label: "Ordenar por nome" },
                ]}
              />
            </div>
            {/* Paginação desativada de propósito: agregação curta (≤5 linhas). */}
            <DataTable
              columns={clientColumns}
              data={filteredClients}
              keyExtractor={(item) => item.clientId}
              showPagination={false}
              emptyMessage="Nenhum consumo no período"
            />
            <div className="px-4 pb-3">
              <Badge color="slate">
                <Icon name="paid" className="mr-1 h-3 w-3" />
                Orçamento em vermelho indica 100%+ do mensal consumido
              </Badge>
            </div>
          </Card>

          <Card>
            <CardHeader title="Top ferramentas" subtitle="Ferramentas MCP mais acionadas no período" />
            {/* Idem: agregação curta, sem paginação. */}
            <DataTable
              columns={toolColumns}
              data={cockpit.data?.topTools ?? []}
              keyExtractor={(item) => item.tool}
              showPagination={false}
              emptyMessage="Nenhuma ferramenta usada"
            />
          </Card>
        </>
      )}
      </>
      )}
    </div>
  );
}

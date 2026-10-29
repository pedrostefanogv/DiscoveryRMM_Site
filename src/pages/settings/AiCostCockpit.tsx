import { formatDate } from '@/utils/format';
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
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

/** Percentual custo/orçamento; null quando não há orçamento. */
export function budgetPercent(row: AiCostByClientDto): number | null {
  const budget = row.budgetUsdMonthly;
  if (!budget || budget <= 0) return null;
  return (row.costUsd / budget) * 100;
}

function BudgetBar({ row }: { row: AiCostByClientDto }) {
  const percent = budgetPercent(row);
  if (percent === null) return <span className="text-xs text-muted">Sem orçamento</span>;
  const clamped = Math.min(100, Math.max(0, percent));
  const over = percent >= 100;
  return (
    <div className="min-w-[140px]" title={`${percent.toFixed(1)}% do orçamento`}>
      <div className="flex items-center justify-between text-xs">
        <span className="tabular-nums text-muted">{formatUsd(row.costUsd)}</span>
        <span className={`tabular-nums ${over ? "text-danger" : "text-muted"}`}>
          / {formatUsd(row.budgetUsdMonthly ?? 0)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-light">
        <div
          className={`h-full rounded-full ${over ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default function AiCostCockpit() {
  const [selectedClientId, setSelectedClientId] = useState("");

  const clients = useClients();
  const cockpit = useAiCostCockpit({
    clientId: selectedClientId || undefined,
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
      header: "Orçamento mensal",
      render: (item) => <BudgetBar row={item} />,
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
      header: "Custo",
      className: "text-right tabular-nums",
      render: (item) => formatUsd(item.costUsd),
    },
  ];

  const totals = cockpit.data?.totals;

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cockpit de custo IA"
        description="Consumo de tokens e custo por cliente e por ferramenta (MCP)."
        breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      >
        <Button
          variant="secondary"
          onClick={() => void cockpit.refetch()}
          disabled={cockpit.isFetching}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Cliente"
          fullWidth={false}
          value={selectedClientId}
          onChange={(event) => setSelectedClientId(event.target.value)}
          options={clientOptions}
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
            {/* Paginação desativada de propósito: agregação curta (≤5 linhas). */}
            <DataTable
              columns={clientColumns}
              data={cockpit.data?.byClient ?? []}
              keyExtractor={(item) => item.clientId}
              showPagination={false}
              emptyMessage="Nenhum consumo no período"
            />
          </Card>

          <Card>
            <CardHeader title="Top ferramentas" subtitle="Ferramentas (tools) com maior custo no período" />
            {/* Idem: agregação curta, sem paginação. */}
            <DataTable
              columns={toolColumns}
              data={cockpit.data?.topTools ?? []}
              keyExtractor={(item) => item.tool}
              showPagination={false}
              emptyMessage="Nenhuma ferramenta usada"
            />
            <div className="px-4 pb-3">
              <Badge color="slate">
                <Icon name="paid" className="mr-1 h-3 w-3" />
                Orçamento em vermelho indica 100%+ do mensal consumido
              </Badge>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

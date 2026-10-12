import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Database, Play, RefreshCw, Search, ShieldAlert, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, ConfirmDialog } from "@/components/ui";
import {
  useDatabaseHealth,
  useDatabaseMaintenanceRuns,
  useRunDatabaseMaintenance,
  useRunSanitization,
  useSanitizationChecks,
} from "@/hooks";
import { useAuthorization } from "@/auth/authorization";
import type { DatabaseHealthSeverity, SanitizationReport } from "@/api";

/**
 * Manutenção do banco: sanitização de inconsistências que impedem a operação
 * (ex.: chamado sem estado de workflow), diagnóstico físico (índices inválidos,
 * bloat, wraparound) e histórico/disparo da manutenção VACUUM/REINDEX/ANALYZE.
 */
export default function DatabaseMaintenanceSettings() {
  const { hasAnyPermission } = useAuthorization();
  const canManage = hasAnyPermission(["settings.*", "admin.*"]);

  const queryClient = useQueryClient();
  const checksQuery = useSanitizationChecks();
  const runSanitization = useRunSanitization();
  const healthQuery = useDatabaseHealth();
  const runsQuery = useDatabaseMaintenanceRuns();
  const runMaintenance = useRunDatabaseMaintenance();

  const [report, setReport] = useState<SanitizationReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = useState(false);

  const run = (dryRun: boolean) => {
    runSanitization.mutate(
      { dryRun },
      {
        onSuccess: (data) => {
          setReport(data);
          if (dryRun) {
            toast.success("Verificação concluída (nada foi alterado).");
            return;
          }
          toast.success(
            data.totalFixed > 0
              ? data.totalFixed + " registro(s) corrigido(s)."
              : "Nenhuma inconsistência para corrigir.",
          );
          // Correções gravadas: listas e detalhes de chamados podem estar
          // desatualizados (ex.: "Sem estado" na lista).
          if (data.totalFixed > 0) {
            void queryClient.invalidateQueries({ queryKey: ["tickets"] });
            void healthQuery.refetch();
          }
        },
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Falha ao executar a sanitização.",
          ),
      },
    );
  };

  const isDryRunPending = runSanitization.isPending && runSanitization.variables?.dryRun === true;
  const isApplyPending = runSanitization.isPending && runSanitization.variables?.dryRun === false;
  const availableChecks = checksQuery.data ?? [];
  const health = healthQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manutenção do Banco de Dados</h1>
        <p className="text-sm text-muted">
          Detecta e corrige inconsistências de dados que impedem a operação normal — por
          exemplo, chamados sem estado de workflow, que não podem ser fechados — e mostra a
          saúde física do PostgreSQL (índices inválidos, bloat, estatísticas e wraparound).
        </p>
      </div>

      <Card>
        <CardHeader
          title="Sanitização de dados"
          subtitle="As correções são idempotentes: só tocam registros realmente inconsistentes."
        />

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-light p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Verificações executadas
            </div>
            {checksQuery.isLoading ? (
              <p className="text-xs text-muted">Carregando verificações...</p>
            ) : availableChecks.length === 0 ? (
              <p className="text-xs text-muted">Nenhuma verificação disponível.</p>
            ) : (
              <ul className="space-y-1 text-xs text-muted">
                {availableChecks.map((check) => (
                  <li key={check.key}>
                    <span className="font-medium text-foreground">{check.title}</span> — {check.description}
                    {check.reportOnly && (
                      <Badge color="slate" className="ml-2">
                        somente relatório
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!canManage || runSanitization.isPending}
              loading={isDryRunPending}
              onClick={() => run(true)}
            >
              <Search className="h-4 w-4" />
              Verificar (sem alterar)
            </Button>
            <Button
              variant="danger"
              disabled={!canManage || runSanitization.isPending}
              loading={isApplyPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Play className="h-4 w-4" />
              Aplicar correções
            </Button>
          </div>

          {!canManage && (
            <p className="text-xs text-muted">
              Você não tem permissão para executar a sanitização (é necessário
              permissão de configuração do servidor).
            </p>
          )}
        </div>
      </Card>

      {report && (
        <Card>
          <CardHeader
            title={report.dryRun ? "Pré-visualização (nada foi alterado)" : "Resultado da sanitização"}
            subtitle={
              "Avaliados: " + report.totalExamined +
              " · encontrados: " + report.totalFound +
              " · corrigidos: " + report.totalFixed
            }
            action={
              <Badge color={report.dryRun ? "warning" : "success"}>
                {report.dryRun ? "dry-run" : "aplicado"}
              </Badge>
            }
          />
          {report.truncated && (
            <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              A varredura foi truncada pelo teto por verificação. Rode novamente para
              continuar a partir do que sobrou.
            </p>
          )}
          <div className="space-y-3">
            {report.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{check.title}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge color="slate">avaliados {check.examined}</Badge>
                    <Badge color={check.found > 0 ? "warning" : "slate"}>encontrados {check.found}</Badge>
                    <Badge color={check.fixed > 0 ? "success" : "slate"}>corrigidos {check.fixed}</Badge>
                    {check.skipped > 0 && <Badge color="warning">ignorados {check.skipped}</Badge>}
                    {check.hasMore && <Badge color="danger">truncado</Badge>}
                  </div>
                </div>

                {check.error && <p className="mt-1 text-xs text-danger">{check.error}</p>}

                {check.samples.length > 0 && (
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
                    {check.samples.slice(0, 8).map((sample, index) => (
                      <li key={index}>{sample}</li>
                    ))}
                  </ul>
                )}

                {check.found === 0 && !check.error && (
                  <p className="mt-1 text-xs text-success">Nenhuma inconsistência encontrada.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Saúde física do banco"
          subtitle="Somente leitura: índices inválidos, bloat, estatísticas velhas, FKs sem índice e wraparound de XID."
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={healthQuery.isFetching}
              loading={healthQuery.isFetching}
              onClick={() => healthQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          }
        />
        {healthQuery.isLoading ? (
          <p className="text-xs text-muted">Analisando o banco...</p>
        ) : healthQuery.isError ? (
          <p className="text-xs text-danger">
            Falha ao consultar o diagnóstico físico do banco.
          </p>
        ) : health ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge color="slate">
                <Database className="mr-1 h-3 w-3" /> banco {formatBytes(health.databaseSizeBytes)}
              </Badge>
              <Badge color="slate">tabelas {formatBytes(health.totalTableSizeBytes)}</Badge>
              <Badge color="slate">{health.tables.length} tabelas</Badge>
              {health.generatedAtUtc && (
                <Badge color="slate">em {formatDateTime(health.generatedAtUtc)}</Badge>
              )}
            </div>

            {health.issues.map((issue) => (
              <div key={issue.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{issue.title}</span>
                  <Badge color={severityColor(issue.severity)}>{issue.count}</Badge>
                </div>
                {issue.count === 0 ? (
                  <p className="mt-1 text-xs text-success">Nada a reportar.</p>
                ) : (
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
                    {issue.samples.slice(0, 6).map((sample, index) => (
                      <li key={index}>{sample}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Manutenção física (VACUUM / REINDEX / ANALYZE)"
          subtitle="Executada pelo job agendado; o disparo manual roda a mesma rotina imediatamente."
          action={
            <Button
              variant="primary"
              size="sm"
              disabled={!canManage || runMaintenance.isPending}
              loading={runMaintenance.isPending}
              onClick={() => setConfirmMaintenanceOpen(true)}
            >
              <Wrench className="h-4 w-4" />
              Executar agora
            </Button>
          }
        />
        {runsQuery.isLoading ? (
          <p className="text-xs text-muted">Carregando histórico...</p>
        ) : (runsQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted">Nenhuma execução registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {(runsQuery.data ?? []).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs"
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Activity className="h-4 w-4 text-muted" />
                  {formatDateTime(run.startedAtUtc)}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge color={run.succeeded ? "success" : "danger"}>
                    {run.succeeded ? "ok" : "com falhas"}
                  </Badge>
                  <Badge color="slate">{run.successCount} ok</Badge>
                  {run.errorCount > 0 && <Badge color="danger">{run.errorCount} erro(s)</Badge>}
                  <Badge color="slate">{run.tableCount} tabelas</Badge>
                  {run.reclaimedBytes > 0 && (
                    <Badge color="accent">liberado {formatBytes(run.reclaimedBytes)}</Badge>
                  )}
                </span>
                {run.errorMessage && (
                  <p className="w-full font-mono text-[11px] text-danger">{run.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Aplicar correções no banco?"
        message={
          <span>
            Isso vai gravar alterações nos registros inconsistentes (por exemplo, aplicar o
            estado inicial em chamados sem estado) e registrar a auditoria. A ação é
            idempotente e pode ser executada novamente sem efeito colateral. Verificações
            "somente relatório" nunca alteram dados.
          </span>
        }
        confirmLabel="Aplicar correções"
        tone="danger"
        isLoading={runSanitization.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          run(false);
        }}
      />

      <ConfirmDialog
        open={confirmMaintenanceOpen}
        title="Executar manutenção física agora?"
        message={
          <span>
            Isso enfileira o job de manutenção (VACUUM/REINDEX/ANALYZE/FREEZE conforme a
            configuração). Operações como VACUUM FULL e REINDEX podem bloquear escrita por
            tempo — rode preferencialmente fora do horário de pico.
          </span>
        }
        confirmLabel="Executar manutenção"
        tone="danger"
        isLoading={runMaintenance.isPending}
        onClose={() => setConfirmMaintenanceOpen(false)}
        onConfirm={() => {
          setConfirmMaintenanceOpen(false);
          runMaintenance.mutate(undefined, {
            onSuccess: () => {
              toast.success("Manutenção disparada. Acompanhe o resultado no histórico.");
              void runsQuery.refetch();
            },
            onError: () => toast.error("Falha ao disparar a manutenção."),
          });
        }}
      />
    </div>
  );
}

function severityColor(severity: DatabaseHealthSeverity) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "slate" as const;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return value.toFixed(exponent === 0 ? 0 : 2) + " " + units[exponent];
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

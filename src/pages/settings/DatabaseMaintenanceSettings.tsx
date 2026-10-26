import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Icon, Badge, Button, Card, CardHeader, ConfirmDialog, Select } from "@/components/ui";
import {
  useDatabaseHealth,
  useDatabaseMaintenanceRuns,
  useObjectStorageSanitizationChecks,
  useRunDatabaseMaintenance,
  useRunObjectStorageSanitization,
  useRunSanitization,
  useSanitizationChecks,
} from "@/hooks";
import { useAuthorization } from "@/auth/authorization";
import type {
  DatabaseHealthSeverity,
  ObjectStorageSanitizationReport,
  SanitizationReport,
} from "@/api";

/**
 * Manutenção do banco: sanitização de inconsistências que impedem a operação
 * (ex.: chamado sem estado de workflow), diagnóstico físico (índices inválidos,
 * bloat, wraparound) e histórico/disparo da manutenção VACUUM/REINDEX/ANALYZE.
 */
/** Tamanho em bytes no formato curto (inventário do object storage). */
function formatStorageBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " " + units[unit];
}

export default function DatabaseMaintenanceSettings() {
  const { hasAnyPermission } = useAuthorization();
  const canManage = hasAnyPermission(["settings.*", "admin.*"]);

  const queryClient = useQueryClient();
  const checksQuery = useSanitizationChecks();
  const runSanitization = useRunSanitization();
  const healthQuery = useDatabaseHealth();
  const runsQuery = useDatabaseMaintenanceRuns();
  const runMaintenance = useRunDatabaseMaintenance();

  const storageChecksQuery = useObjectStorageSanitizationChecks();
  const runStorageSanitization = useRunObjectStorageSanitization();

  const [report, setReport] = useState<SanitizationReport | null>(null);
  const [storageReport, setStorageReport] = useState<ObjectStorageSanitizationReport | null>(null);
  // Idade mínima do órfão: evita apagar um arquivo que acabou de subir e ainda
  // está a caminho do vínculo com o pacote.
  const [storageMinAgeHours, setStorageMinAgeHours] = useState("24");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStorageOpen, setConfirmStorageOpen] = useState(false);
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

  const runStorage = (dryRun: boolean) => {
    runStorageSanitization.mutate(
      { dryRun, minAgeHours: Number(storageMinAgeHours) || 24 },
      {
        onSuccess: (data) => {
          setStorageReport(data);
          if (dryRun) {
            toast.success("Inventário do object storage atualizado (nada foi apagado).");
            return;
          }
          toast.success(
            data.totalFixed > 0
              ? data.totalFixed + " objeto(s) órfão(s) removido(s) do object storage."
              : "Nenhum objeto órfão elegível para remover.",
          );
        },
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Falha ao executar a limpeza do object storage.",
          ),
      },
    );
  };

  const isDryRunPending = runSanitization.isPending && runSanitization.variables?.dryRun === true;
  const isApplyPending = runSanitization.isPending && runSanitization.variables?.dryRun === false;
  const isStorageDryRunPending =
    runStorageSanitization.isPending && runStorageSanitization.variables?.dryRun === true;
  const isStorageApplyPending =
    runStorageSanitization.isPending && runStorageSanitization.variables?.dryRun === false;
  const availableStorageChecks = storageChecksQuery.data ?? [];
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
              <Icon name="gpp_maybe" className="h-4 w-4 text-warning" />
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
              <Icon name="search" className="h-4 w-4" />
              Verificar (sem alterar)
            </Button>
            <Button
              variant="danger"
              disabled={!canManage || runSanitization.isPending}
              loading={isApplyPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Icon name="play_arrow" className="h-4 w-4" />
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
          title="Object storage (S3)"
          subtitle="Quanto existe no bucket e quais assets da loja ficaram sem vínculo com um pacote. A limpeza apaga SOMENTE app-store/custom/ — anexos de chamados, relatórios e imagens de KB (clients/) não são tocados."
        />

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-light p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <Icon name="gpp_maybe" className="h-4 w-4 text-warning" />
              Verificações executadas
            </div>
            {storageChecksQuery.isLoading ? (
              <p className="text-xs text-muted">Carregando verificações...</p>
            ) : availableStorageChecks.length === 0 ? (
              <p className="text-xs text-muted">Nenhuma verificação disponível.</p>
            ) : (
              <ul className="space-y-1 text-xs text-muted">
                {availableStorageChecks.map((check) => (
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

          <div className="w-64">
            <Select
              label="Idade mínima para considerar órfão"
              options={[
                { value: "1", label: "1 hora" },
                { value: "6", label: "6 horas" },
                { value: "24", label: "24 horas (padrão)" },
                { value: "168", label: "7 dias" },
              ]}
              value={storageMinAgeHours}
              disabled={!canManage || runStorageSanitization.isPending}
              onChange={(event) => setStorageMinAgeHours(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!canManage || runStorageSanitization.isPending}
              loading={isStorageDryRunPending}
              onClick={() => runStorage(true)}
            >
              <Icon name="search" className="h-4 w-4" />
              Analisar (sem apagar)
            </Button>
            <Button
              variant="danger"
              disabled={!canManage || runStorageSanitization.isPending}
              loading={isStorageApplyPending}
              onClick={() => setConfirmStorageOpen(true)}
            >
              <Icon name="delete" className="h-4 w-4" />
              Limpar órfãos
            </Button>
          </div>

          {!canManage && (
            <p className="text-xs text-muted">
              Você não tem permissão para executar a limpeza do object storage (é necessário
              permissão de configuração do servidor).
            </p>
          )}
        </div>
      </Card>

      {storageReport && (
        <Card>
          <CardHeader
            title={
              storageReport.dryRun
                ? "Object storage — pré-visualização (nada foi alterado)"
                : "Object storage — limpeza aplicada"
            }
            subtitle={
              "Objetos no bucket: " + storageReport.totalObjects + " (" + formatStorageBytes(storageReport.totalBytes) + ")" +
              " · órfãos: " + storageReport.totalFound + " (" + formatStorageBytes(storageReport.totalFoundBytes) + ")" +
              " · removidos: " + storageReport.totalFixed + " (" + formatStorageBytes(storageReport.totalFixedBytes) + ")" +
              " · idade mínima: " + storageReport.minAgeHours + " h"
            }
            action={
              <Badge color={storageReport.dryRun ? "warning" : "success"}>
                {storageReport.dryRun ? "dry-run" : "aplicado"}
              </Badge>
            }
          />

          {storageReport.truncated && (
            <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              A varredura do bucket foi truncada: os totais acima são parciais. Rode novamente para continuar.
            </p>
          )}

          {storageReport.inventory.length > 0 && (
            <div className="mb-4 rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Inventário por prefixo</p>
              <ul className="space-y-0.5 font-mono text-[11px] text-muted">
                {storageReport.inventory.map((entry) => (
                  <li key={entry.prefix}>
                    {entry.prefix} — {entry.objects} objeto(s), {formatStorageBytes(entry.bytes)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {storageReport.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{check.title}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge color="slate">avaliados {check.examined}</Badge>
                    <Badge color={check.found > 0 ? "warning" : "slate"}>
                      órfãos {check.found} ({formatStorageBytes(check.foundBytes)})
                    </Badge>
                    <Badge color={check.fixed > 0 ? "success" : "slate"}>
                      removidos {check.fixed} ({formatStorageBytes(check.fixedBytes)})
                    </Badge>
                    {check.skipped > 0 && <Badge color="warning">preservados {check.skipped}</Badge>}
                    {check.hasMore && <Badge color="danger">truncado</Badge>}
                  </div>
                </div>

                {check.error && <p className="mt-1 text-xs text-danger">{check.error}</p>}

                {check.samples.length > 0 && (
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
                    {check.samples.slice(0, 10).map((sample, index) => (
                      <li key={index}>{sample}</li>
                    ))}
                  </ul>
                )}

                {check.found === 0 && !check.error && (
                  <p className="mt-1 text-xs text-success">Nada para limpar nesta verificação.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmStorageOpen}
        title="Limpar assets sem vínculo"
        message={
          <span>
            Os objetos de <strong>app-store/custom/</strong> que nenhum pacote referencia e que estão sem
            alteração há mais de <strong>{storageMinAgeHours} hora(s)</strong> serão apagados do object
            storage. É irreversível — rode <strong>Analisar (sem apagar)</strong> antes para ver a lista.
          </span>
        }
        confirmLabel="Limpar órfãos"
        tone="danger"
        isLoading={isStorageApplyPending}
        onClose={() => setConfirmStorageOpen(false)}
        onConfirm={() => {
          setConfirmStorageOpen(false);
          runStorage(false);
        }}
      />

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
              <Icon name="refresh" className="h-4 w-4" />
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
                <Icon name="database" className="mr-1 h-3 w-3" /> banco {formatBytes(health.databaseSizeBytes)}
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
                  <>
                    <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
                      {issue.samples.slice(0, 6).map((sample, index) => (
                        <li key={index}>{sample}</li>
                      ))}
                    </ul>
                    {issue.key === "foreign-keys-without-index" && (
                      <p className="mt-2 text-[11px] text-muted">
                        A manutenção cria esses índices automaticamente
                        (<code>CONCURRENTLY IF NOT EXISTS</code>, idempotente). Pode ser
                        desligado com <code>databaseMaintenance.createMissingForeignKeyIndexes = false</code>.
                      </p>
                    )}
                    {issue.key === "foreign-keys-without-leading-index" && (
                      <p className="mt-2 text-[11px] text-muted">
                        Existe índice contendo a coluna, mas ela não é a primeira — o lookup
                        do FK não o aproveita. Criar outro índice pode ser redundante; avalie
                        caso a caso.
                      </p>
                    )}
                  </>
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
              <Icon name="build" className="h-4 w-4" />
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
                  <Icon name="monitoring" className="h-4 w-4 text-muted" />
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

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Search, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, ConfirmDialog } from "@/components/ui";
import { useRunSanitization, useSanitizationChecks } from "@/hooks";
import { useAuthorization } from "@/auth/authorization";
import type { SanitizationReport } from "@/api";

/**
 * Manutenção do banco: sanitização de inconsistências que impedem a operação
 * (ex.: chamado sem estado de workflow, que não pode ser fechado).
 */
export default function DatabaseMaintenanceSettings() {
  const { hasAnyPermission } = useAuthorization();
  const canManage = hasAnyPermission(["settings.*", "admin.*"]);

  const queryClient = useQueryClient();
  const checksQuery = useSanitizationChecks();
  const runSanitization = useRunSanitization();
  const [report, setReport] = useState<SanitizationReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manutenção do Banco de Dados</h1>
        <p className="text-sm text-muted">
          Detecta e corrige inconsistências de dados que impedem a operação normal — por
          exemplo, chamados sem estado de workflow, que não podem ser fechados.
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
            subtitle={"Itens analisados: " + report.totalScanned + " · corrigidos: " + report.totalFixed}
            action={
              <Badge color={report.dryRun ? "warning" : "success"}>
                {report.dryRun ? "dry-run" : "aplicado"}
              </Badge>
            }
          />
          <div className="space-y-3">
            {report.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{check.title}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge color="slate">analisados {check.scanned}</Badge>
                    <Badge color={check.fixed > 0 ? "success" : "slate"}>corrigidos {check.fixed}</Badge>
                    {check.skipped > 0 && <Badge color="warning">ignorados {check.skipped}</Badge>}
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

                {check.scanned === 0 && !check.error && (
                  <p className="mt-1 text-xs text-success">Nenhuma inconsistência encontrada.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Aplicar correções no banco?"
        message={
          <span>
            Isso vai gravar alterações nos registros inconsistentes (por exemplo, aplicar o
            estado inicial em chamados sem estado) e registrar a auditoria. A ação é
            idempotente e pode ser executada novamente sem efeito colateral.
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
    </div>
  );
}

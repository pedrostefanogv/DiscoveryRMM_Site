import { useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, Shuffle } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
import { ApiError, type MeshGroupPolicyReconcileReport } from "@/api";
import {
  useClients,
  useMeshGroupPolicyReconcile,
  useMeshGroupPolicyStatus,
  useSites,
} from "@/hooks";
import { useAuthorization } from "@/auth/authorization";
import {
  useClientConfig,
  useServerConfig,
  useSiteConfig,
  useSiteEffectiveConfig,
} from "../../hooks/useConfigurationApi";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function toText(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
}

function toBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function pickNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function MeshCentralConfigurationPage() {
  const { hasAnyPermission } = useAuthorization();
  const canView = hasAnyPermission([
    "settings.*",
    "settings.read",
    "siteconfig.view",
    "admin.*",
  ]);
  const canApply = hasAnyPermission([
    "settings.*",
    "settings.write",
    "siteconfig.edit",
    "admin.*",
  ]);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [lastReport, setLastReport] =
    useState<MeshGroupPolicyReconcileReport | null>(null);

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);

  const serverConfigQuery = useServerConfig();
  const clientConfigQuery = useClientConfig(clientId);
  const siteConfigQuery = useSiteConfig(siteId);
  const siteEffectiveQuery = useSiteEffectiveConfig(siteId);

  const statusQuery = useMeshGroupPolicyStatus(siteId || null);
  const reconcileMutation = useMeshGroupPolicyReconcile();

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...((clientsQuery.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })) ?? []),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(
    () => [
      {
        value: "",
        label: clientId ? "Todos os sites" : "Selecione um cliente para listar sites",
      },
      ...((sitesQuery.data ?? []).map((site) => ({
        value: site.id,
        label: site.name,
      })) ?? []),
    ],
    [clientId, sitesQuery.data],
  );

  const runReconcile = async (applyChanges: boolean) => {
    if (!canApply) {
      toast.error("Você não possui permissão para reconciliar políticas Mesh.");
      return;
    }

    if (applyChanges) {
      const confirmed = window.confirm(
        "Aplicar reconcile modifica a policy de grupos no MeshCentral. Deseja continuar?",
      );
      if (!confirmed) return;
    }

    try {
      const report = await reconcileMutation.mutateAsync({
        applyChanges,
        clientId: clientId || null,
        siteId: siteId || null,
      });
      setLastReport(report);
      toast.success(
        applyChanges
          ? "Reconcile aplicado com sucesso."
          : "Dry-run de reconcile concluído.",
      );
      if (siteId) {
        await statusQuery.refetch();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Falha ao executar reconcile de policy Mesh."));
    }
  };

  if (!canView) {
    return (
      <ErrorDisplay message="Sem permissão para visualizar configurações MeshCentral." />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações MeshCentral</h1>
        <p className="text-sm text-slate-400">
          Gerencie herança de perfil de policy e reconciliação operacional por site.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="Defina cliente/site para inspeção de drift e reconciliação."
        />

        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setSiteId("");
              setLastReport(null);
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId || sitesQuery.isLoading}
            onChange={(event) => {
              setSiteId(event.target.value);
              setLastReport(null);
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Hierarquia de Perfil"
          subtitle="Valor global e overrides por cliente/site para MeshCentralGroupPolicyProfile."
          action={<ShieldCheck className="h-4 w-4 text-slate-400" />}
        />

        <div className="space-y-3 px-5 pb-5">
          {(serverConfigQuery.isLoading ||
            (clientId && clientConfigQuery.isLoading) ||
            (siteId && siteConfigQuery.isLoading) ||
            (siteId && siteEffectiveQuery.isLoading)) && (
            <Loading message="Carregando hierarquia de perfil MeshCentral..." />
          )}

          {(serverConfigQuery.isError ||
            clientConfigQuery.isError ||
            siteConfigQuery.isError ||
            siteEffectiveQuery.isError) && (
            <ErrorDisplay
              message="Falha ao carregar dados de herança de policy MeshCentral."
              onRetry={() => {
                void serverConfigQuery.refetch();
                if (clientId) void clientConfigQuery.refetch();
                if (siteId) {
                  void siteConfigQuery.refetch();
                  void siteEffectiveQuery.refetch();
                }
              }}
            />
          )}

          {!serverConfigQuery.isLoading && !serverConfigQuery.isError && (
            <>
              <HierarchyRow
                label="Global"
                value={toText(
                  serverConfigQuery.data?.meshCentralGroupPolicyProfile,
                  "Não definido",
                )}
                badge="Server"
              />

              <HierarchyRow
                label="Cliente"
                value={
                  !clientId
                    ? "Selecione um cliente"
                    : toText(
                        clientConfigQuery.data?.meshCentralGroupPolicyProfile,
                        "Herdado do global",
                      )
                }
                badge="Client"
              />

              <HierarchyRow
                label="Site"
                value={
                  !siteId
                    ? "Selecione um site"
                    : toText(
                        siteConfigQuery.data?.meshCentralGroupPolicyProfile,
                        "Herdado do cliente/global",
                      )
                }
                badge="Site"
              />

              <HierarchyRow
                label="Efetivo no Site"
                value={
                  !siteId
                    ? "Selecione um site"
                    : toText(
                        siteEffectiveQuery.data?.meshCentralGroupPolicyProfile,
                        "Sem valor efetivo",
                      )
                }
                badge="Effective"
              />

              {siteId && (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                  Campo bloqueado: {isMeshPolicyBlocked(siteEffectiveQuery.data) ? "Sim" : "Não"}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Status de Policy por Site"
          subtitle="Consulta drift entre desiredProfile e appliedProfile no MeshCentral."
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void statusQuery.refetch()}
              disabled={!siteId || statusQuery.isFetching}
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          }
        />

        <div className="space-y-3 px-5 pb-5">
          {!siteId && (
            <p className="text-sm text-slate-500">Selecione um site para consultar status.</p>
          )}

          {siteId && statusQuery.isLoading && (
            <Loading message="Consultando status de policy no MeshCentral..." />
          )}

          {siteId && statusQuery.isError && (
            <ErrorDisplay
              message="Falha ao obter status de policy do site."
              onRetry={() => void statusQuery.refetch()}
            />
          )}

          {siteId && statusQuery.data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={toBool(statusQuery.data.hasDrift) ? "warning" : "success"}>
                  {toBool(statusQuery.data.hasDrift) ? "Com Drift" : "Sincronizado"}
                </Badge>
                <Badge color="slate">
                  Group: {toText(statusQuery.data.groupName, "N/A")}
                </Badge>
                <Badge color="slate">
                  MeshId: {toText(statusQuery.data.meshId, "N/A")}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <StatusBox
                  title="Desired Profile"
                  value={toText(statusQuery.data.desiredProfile, "Não informado")}
                />
                <StatusBox
                  title="Applied Profile"
                  value={toText(statusQuery.data.appliedProfile, "Não informado")}
                />
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Drift Reasons
                </p>
                <div className="mt-2 space-y-1">
                  {toArray(statusQuery.data.driftReasons).length === 0 && (
                    <p className="text-sm text-slate-500">Sem divergências reportadas.</p>
                  )}
                  {toArray(statusQuery.data.driftReasons).map((reason, index) => (
                    <p key={`${reason}-${index}`} className="text-sm text-slate-300">
                      - {reason}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  AppliedAtUtc: {toText(statusQuery.data.appliedAtUtc, "N/A")}
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Reconcile de Policy"
          subtitle="Use dry-run para simular e apply para aplicar alterações no MeshCentral."
          action={<Shuffle className="h-4 w-4 text-slate-400" />}
        />

        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void runReconcile(false)}
              loading={reconcileMutation.isPending}
              disabled={!canApply || reconcileMutation.isPending}
            >
              Simular reconcile
            </Button>
            <Button
              variant="danger"
              onClick={() => void runReconcile(true)}
              loading={reconcileMutation.isPending}
              disabled={!canApply || reconcileMutation.isPending}
            >
              Aplicar reconcile
            </Button>
            {!canApply && (
              <p className="text-xs text-slate-500">
                Sem permissão de edição para reconciliar policy.
              </p>
            )}
          </div>

          {lastReport && (
            <ReconcileReportView report={lastReport} />
          )}
        </div>
      </Card>
    </div>
  );
}

function HierarchyRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
      <Badge color="slate">{badge}</Badge>
    </div>
  );
}

function StatusBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}

function isMeshPolicyBlocked(effective: unknown) {
  if (!effective || typeof effective !== "object") return false;
  const blocked = (effective as { blockedFields?: unknown }).blockedFields;
  if (!Array.isArray(blocked)) return false;

  return blocked.some(
    (item) =>
      item === "meshCentralGroupPolicyProfile" ||
      item === "MeshCentralGroupPolicyProfile",
  );
}

function ReconcileReportView({ report }: { report: MeshGroupPolicyReconcileReport }) {
  const total =
    pickNumber(report.totalSites) ||
    pickNumber((report as Record<string, unknown>).totalGroups) ||
    pickNumber((report as Record<string, unknown>).totalItems) ||
    (Array.isArray(report.items) ? report.items.length : 0);

  const success =
    pickNumber(report.reconciledSites) ||
    pickNumber((report as Record<string, unknown>).syncedSites) ||
    pickNumber((report as Record<string, unknown>).successCount);

  const failed =
    pickNumber(report.failedSites) ||
    pickNumber((report as Record<string, unknown>).failedGroups) ||
    pickNumber((report as Record<string, unknown>).failureCount);

  const items = Array.isArray(report.items) ? report.items : [];

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="accent">Total: {total}</Badge>
        <Badge color="success">Sucesso: {success}</Badge>
        <Badge color={failed > 0 ? "danger" : "slate"}>Falhas: {failed}</Badge>
        <Badge color="slate">Modo: {report.applyChanges ? "Apply" : "Dry-run"}</Badge>
      </div>

      <p className="text-xs text-slate-500">
        Início: {toText(report.startedAtUtc, "N/A")} | Fim: {toText(report.finishedAtUtc, "N/A")}
      </p>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="text-sm text-slate-500">Sem itens detalhados no retorno.</p>
        )}

        {items.map((item, index) => {
          const asRecord = item as Record<string, unknown>;
          const siteLabel = toText(asRecord.siteName ?? asRecord.siteId, "Site não informado");
          const groupLabel = toText(asRecord.groupName, "Grupo não informado");
          const desired = toText(asRecord.desiredProfile, "N/A");
          const applied = toText(asRecord.appliedProfile, "N/A");
          const hasDrift = toBool(asRecord.hasDrift, false);
          const successItem = toBool(asRecord.success, false);
          const error = toText(asRecord.error, "");

          return (
            <div
              key={`${siteLabel}-${groupLabel}-${index}`}
              className="rounded-md border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">
                  {siteLabel} · {groupLabel}
                </p>
                <Badge color={successItem ? "success" : "danger"}>
                  {successItem ? "OK" : "Falha"}
                </Badge>
              </div>

              <p className="text-xs text-slate-400">Desired: {desired}</p>
              <p className="text-xs text-slate-400">Applied: {applied}</p>
              <p className="text-xs text-slate-400">Drift: {hasDrift ? "Sim" : "Não"}</p>
              {error && <p className="text-xs text-danger">Erro: {error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

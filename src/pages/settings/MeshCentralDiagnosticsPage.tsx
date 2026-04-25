import { useMemo, useState } from "react";
import { RefreshCw, Stethoscope } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
import { ApiError } from "@/api";
import { useAuthorization } from "@/auth/authorization";
import { useAgentsBySite, useClients, useMeshCentralDiagnosticsHealth, useSites } from "@/hooks";

function toText(value: unknown, fallback = "N/A") {
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

export default function MeshCentralDiagnosticsPage() {
  const { hasAnyPermission } = useAuthorization();
  const canView = hasAnyPermission([
    "SiteConfig.View",
    "siteconfig.view",
    "settings.*",
    "settings.read",
    "admin.*",
  ]);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [agentId, setAgentId] = useState("");

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);
  const agentsQuery = useAgentsBySite(siteId || "");
  const diagnosticsQuery = useMeshCentralDiagnosticsHealth(
    siteId || null,
    agentId || null,
  );

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
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
        label: clientId ? "Selecione um site" : "Selecione um cliente primeiro",
      },
      ...((sitesQuery.data ?? []).map((site) => ({
        value: site.id,
        label: site.name,
      })) ?? []),
    ],
    [clientId, sitesQuery.data],
  );

  const agentOptions = useMemo(
    () => [
      {
        value: "",
        label: siteId ? "Todos os agents do site" : "Selecione um site primeiro",
      },
      ...((agentsQuery.data ?? []).map((agent) => ({
        value: agent.id,
        label: agent.displayName ?? agent.hostname,
      })) ?? []),
    ],
    [siteId, agentsQuery.data],
  );

  if (!canView) {
    return <ErrorDisplay message="Sem permissão para visualizar diagnostics do MeshCentral." />;
  }

  const diagnosticsError = diagnosticsQuery.error;
  const status = diagnosticsError instanceof ApiError ? diagnosticsError.status : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Diagnostics MeshCentral</h1>
        <p className="text-sm text-slate-400">
          Troubleshooting da integração MeshCentral por escopo. Use esta tela para investigação operacional.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="Selecione o site e opcionalmente um agent para diagnóstico detalhado."
          action={<Stethoscope className="h-4 w-4 text-slate-400" />}
        />

        <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setSiteId("");
              setAgentId("");
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId || sitesQuery.isLoading}
            onChange={(event) => {
              setSiteId(event.target.value);
              setAgentId("");
            }}
          />
          <Select
            label="Agent (opcional)"
            options={agentOptions}
            value={agentId}
            disabled={!siteId || agentsQuery.isLoading}
            onChange={(event) => setAgentId(event.target.value)}
          />
        </div>

        <div className="px-5 pb-5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void diagnosticsQuery.refetch()}
            disabled={!siteId || diagnosticsQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar diagnóstico
          </Button>
        </div>
      </Card>

      {!siteId && (
        <Card>
          <div className="px-5 py-4 text-sm text-slate-500">
            Selecione um site para carregar health/site/agent.
          </div>
        </Card>
      )}

      {siteId && diagnosticsQuery.isLoading && (
        <Loading message="Consultando saúde da integração MeshCentral..." />
      )}

      {siteId && diagnosticsQuery.isError && (
        <ErrorDisplay
          message={
            status === 403
              ? "Suporte desabilitado no escopo ou sem permissão para diagnostics."
              : status === 503
                ? "Falha operacional/configuração do MeshCentral."
                : "Falha ao carregar diagnostics do MeshCentral."
          }
          onRetry={() => void diagnosticsQuery.refetch()}
        />
      )}

      {siteId && diagnosticsQuery.data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Health" subtitle="Estado operacional da integração" />
            <div className="space-y-2 px-5 pb-5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Control Socket</span>
                <Badge color={diagnosticsQuery.data.health.controlSocketConnected ? "success" : "danger"}>
                  {diagnosticsQuery.data.health.controlSocketConnected ? "Conectado" : "Desconectado"}
                </Badge>
              </div>
              <p className="text-slate-300">Public URL: {toText(diagnosticsQuery.data.health.publicBaseUrl)}</p>
              <p className="text-slate-300">Admin URL: {toText(diagnosticsQuery.data.health.administrativeBaseUrl)}</p>
              <p className="text-slate-300">Technical User: {toText(diagnosticsQuery.data.health.technicalUsername)}</p>
              <p className="text-slate-300">Mesh Count: {diagnosticsQuery.data.health.meshCount ?? 0}</p>
              <p className="text-slate-300">User Count: {diagnosticsQuery.data.health.userCount ?? 0}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Site" subtitle="Status de policy e drift no escopo" />
            <div className="space-y-2 px-5 pb-5 text-sm">
              <p className="text-slate-300">Cliente: {toText(diagnosticsQuery.data.site?.clientName)}</p>
              <p className="text-slate-300">Site: {toText(diagnosticsQuery.data.site?.siteName)}</p>
              <p className="text-slate-300">Desired: {toText(diagnosticsQuery.data.site?.desiredProfile)}</p>
              <p className="text-slate-300">Applied: {toText(diagnosticsQuery.data.site?.appliedProfile)}</p>
              <p className="text-slate-300">MeshId: {toText(diagnosticsQuery.data.site?.meshId)}</p>
              <p className="text-slate-300">Group: {toText(diagnosticsQuery.data.site?.groupName)}</p>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Drift</span>
                <Badge color={toBool(diagnosticsQuery.data.site?.hasDrift) ? "warning" : "success"}>
                  {toBool(diagnosticsQuery.data.site?.hasDrift) ? "Com drift" : "Sincronizado"}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400">Drift reasons</p>
                <div className="mt-1 space-y-1 text-slate-300">
                  {toArray(diagnosticsQuery.data.site?.driftReasons).length === 0 && (
                    <p>Sem divergências reportadas.</p>
                  )}
                  {toArray(diagnosticsQuery.data.site?.driftReasons).map((reason, index) => (
                    <p key={`${reason}-${index}`}>- {reason}</p>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Agent" subtitle="Vínculo de node persistido" />
            <div className="space-y-2 px-5 pb-5 text-sm">
              <p className="text-slate-300">Agent ID: {toText(diagnosticsQuery.data.agent?.id)}</p>
              <p className="text-slate-300">Hostname: {toText(diagnosticsQuery.data.agent?.hostname)}</p>
              <p className="text-slate-300">Site ID: {toText(diagnosticsQuery.data.agent?.siteId)}</p>
              <p className="text-slate-300">Node ID: {toText(diagnosticsQuery.data.agent?.meshCentralNodeId)}</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

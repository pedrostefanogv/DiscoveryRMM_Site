import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  type Column,
  ErrorDisplay,
  Loading,
  Select,
} from "@/components/ui";
import {
  AutomationExecutionSourceType,
  AutomationExecutionStatus,
  type AutomationExecutionReport,
} from "@/api";
import { useAgentsBySite } from "@/hooks/useAgents";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAutomationScripts, useAutomationTasks, useAutomationExecutions, useForceAutomationSync, useRunAutomationScriptNow, useRunAutomationTaskNow } from "@/hooks/useAutomation";

function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function executionStatusMeta(status: unknown): { label: string; color: "slate" | "primary" | "success" | "danger" | "warning" } {
  if (status === AutomationExecutionStatus.Dispatched || status === "Dispatched") {
    return { label: "Dispatched", color: "slate" };
  }
  if (status === AutomationExecutionStatus.Acknowledged || status === "Acknowledged") {
    return { label: "Acknowledged", color: "primary" };
  }
  if (status === AutomationExecutionStatus.Completed || status === "Completed") {
    return { label: "Completed", color: "success" };
  }
  if (status === AutomationExecutionStatus.Failed || status === "Failed") {
    return { label: "Failed", color: "danger" };
  }
  return { label: String(status ?? "Unknown"), color: "warning" };
}

function executionSourceLabel(source: unknown): string {
  if (source === AutomationExecutionSourceType.RunNow || source === "RunNow") return "RunNow";
  if (source === AutomationExecutionSourceType.Scheduled || source === "Scheduled") return "Scheduled";
  if (source === AutomationExecutionSourceType.ForceSync || source === "ForceSync") return "ForceSync";
  if (source === AutomationExecutionSourceType.AgentManual || source === "AgentManual") return "AgentManual";
  return String(source ?? "Unknown");
}

export default function AutomationOperationsPage() {
  const [searchParams] = useSearchParams();
  const initialAgentId = searchParams.get("agentId") ?? "";

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [agentId, setAgentId] = useState(initialAgentId);
  const [taskId, setTaskId] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [syncPolicies, setSyncPolicies] = useState(true);
  const [syncInventory, setSyncInventory] = useState(false);
  const [syncSoftware, setSyncSoftware] = useState(false);
  const [syncAppStore, setSyncAppStore] = useState(false);

  const clients = useClients();
  const sites = useSites(clientId);
  const agents = useAgentsBySite(siteId);
  const tasks = useAutomationTasks({ activeOnly: true, limit: 200 });
  const scripts = useAutomationScripts({ activeOnly: true, limit: 200 });
  const executions = useAutomationExecutions(agentId, 50, !!agentId);

  const runTaskNow = useRunAutomationTaskNow();
  const runScriptNow = useRunAutomationScriptNow();
  const forceSync = useForceAutomationSync();

  useEffect(() => {
    if (!initialAgentId || agentId) return;
    setAgentId(initialAgentId);
  }, [agentId, initialAgentId]);

  const clientOptions = [
    { value: "", label: "Selecione" },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];
  const siteOptions = [
    { value: "", label: "Selecione" },
    ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name })),
  ];
  const agentOptions = [
    { value: "", label: "Selecione" },
    ...(agents.data ?? []).map((agent) => ({
      value: agent.id,
      label: `${agent.displayName ?? agent.hostname} (${agent.hostname})`,
    })),
  ];
  const taskOptions = [
    { value: "", label: "Selecione" },
    ...(tasks.data?.items ?? []).map((task) => ({ value: task.id, label: task.name })),
  ];
  const scriptOptions = [
    { value: "", label: "Selecione" },
    ...(scripts.data?.items ?? []).map((script) => ({ value: script.id, label: script.name })),
  ];

  const columns = useMemo<Column<AutomationExecutionReport>[]>(
    () => [
      {
        key: "status",
        header: "Status",
        render: (item) => {
          const meta = executionStatusMeta(item.status);
          return <Badge color={meta.color}>{meta.label}</Badge>;
        },
      },
      {
        key: "source",
        header: "Source",
        render: (item) => <Badge color="accent">{executionSourceLabel(item.sourceType)}</Badge>,
      },
      {
        key: "taskScript",
        header: "Task/Script",
        render: (item) => (
          <div className="text-xs">
            <p className="font-mono text-muted-foreground">task: {item.taskId ?? "-"}</p>
            <p className="font-mono text-muted">script: {item.scriptId ?? "-"}</p>
          </div>
        ),
      },
      {
        key: "timestamps",
        header: "Eventos",
        render: (item) => (
          <div className="text-xs text-muted">
            <p>Criado: {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
            <p>Ack: {item.acknowledgedAt ? new Date(item.acknowledgedAt).toLocaleString("pt-BR") : "-"}</p>
            <p>Resultado: {item.resultReceivedAt ? new Date(item.resultReceivedAt).toLocaleString("pt-BR") : "-"}</p>
          </div>
        ),
      },
      {
        key: "result",
        header: "Resultado",
        render: (item) => (
          <div className="text-xs">
            <p className="text-foreground">ExitCode: {item.exitCode ?? "-"}</p>
            <p className="text-muted">{item.errorMessage || "Sem erro"}</p>
          </div>
        ),
      },
      {
        key: "correlation",
        header: "Correlation",
        render: (item) => <span className="font-mono text-xs">{item.correlationId ?? "-"}</span>,
      },
    ],
    [],
  );

  const handleRunTask = () => {
    if (!agentId) return toast.error("Selecione um agent");
    if (!taskId) return toast.error("Selecione uma tarefa");

    runTaskNow.mutate(
      {
        agentId,
        taskId,
        correlationId: buildCorrelationId("task-run-now"),
      },
      {
        onSuccess: () => toast.success("Tarefa disparada com sucesso"),
        onError: () => toast.error("Falha ao disparar tarefa"),
      },
    );
  };

  const handleRunScript = () => {
    if (!agentId) return toast.error("Selecione um agent");
    if (!scriptId) return toast.error("Selecione um script");

    runScriptNow.mutate(
      {
        agentId,
        scriptId,
        correlationId: buildCorrelationId("script-run-now"),
      },
      {
        onSuccess: () => toast.success("Script disparado com sucesso"),
        onError: () => toast.error("Falha ao disparar script"),
      },
    );
  };

  const handleForceSync = () => {
    if (!agentId) return toast.error("Selecione um agent");

    forceSync.mutate(
      {
        agentId,
        request: {
          policies: syncPolicies,
          inventory: syncInventory,
          software: syncSoftware,
          appStore: syncAppStore,
        },
        correlationId: buildCorrelationId("force-sync"),
      },
      {
        onSuccess: () => toast.success("Force sync enviado"),
        onError: () => toast.error("Falha ao enviar force sync"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operacoes de Automação</h1>
        <p className="text-sm text-muted">
          Execute tarefas/scripts por agent e acompanhe o histórico.
        </p>
      </div>

      <Card>
        <CardHeader title="Contexto do Agent" subtitle="Selecione alvo para operações" />
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setSiteId("");
              setAgentId(initialAgentId || "");
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setAgentId(initialAgentId || "");
            }}
          />
          <Select
            label="Agent"
            options={agentOptions}
            value={agentId}
            disabled={!siteId && !initialAgentId}
            onChange={(e) => setAgentId(e.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Run Task Now" subtitle="Disparo imediato de tarefa" />
          <div className="space-y-3">
            <Select
              label="Tarefa"
              options={taskOptions}
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            />
            <Button className="w-full" onClick={handleRunTask} loading={runTaskNow.isPending}>
              Executar tarefa
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Run Script Now" subtitle="Disparo imediato de script" />
          <div className="space-y-3">
            <Select
              label="Script"
              options={scriptOptions}
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
            />
            <Button className="w-full" onClick={handleRunScript} loading={runScriptNow.isPending}>
              Executar script
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Force Sync" subtitle="Sincronização técnica" />
          <div className="space-y-3">
            <Select
              label="Policies"
              options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
              value={String(syncPolicies)}
              onChange={(e) => setSyncPolicies(e.target.value === "true")}
            />
            <Select
              label="Inventory"
              options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
              value={String(syncInventory)}
              onChange={(e) => setSyncInventory(e.target.value === "true")}
            />
            <Select
              label="Software"
              options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
              value={String(syncSoftware)}
              onChange={(e) => setSyncSoftware(e.target.value === "true")}
            />
            <Select
              label="AppStore"
              options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
              value={String(syncAppStore)}
              onChange={(e) => setSyncAppStore(e.target.value === "true")}
            />
            <Button className="w-full" onClick={handleForceSync} loading={forceSync.isPending}>
              Executar force sync
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Histórico de execuções" subtitle={agentId ? "Eventos recentes do agent" : "Selecione um agent para consultar"} />
        {!agentId && <p className="text-sm text-muted">Nenhum agent selecionado.</p>}
        {agentId && executions.isLoading && <Loading message="Carregando execuções..." />}
        {agentId && executions.isError && <ErrorDisplay onRetry={() => executions.refetch()} />}
        {agentId && !executions.isLoading && !executions.isError && (
          <DataTable
            columns={columns}
            data={executions.data ?? []}
            keyExtractor={(item) => item.id}
            emptyMessage="Nenhuma execução encontrada."
          />
        )}
      </Card>
    </div>
  );
}

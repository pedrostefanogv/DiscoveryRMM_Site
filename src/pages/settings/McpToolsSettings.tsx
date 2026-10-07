import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleSlash, RotateCcw, Save, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Input, PageHeader, Select } from "@/components/ui";
import { mcpToolsApi, type McpToolCatalogItem, type McpToolScopeRef } from "@/api/mcp-tools";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAgentsBySite } from "@/hooks/useAgents";

type ScopeLevel = "global" | "client" | "site" | "agent";

interface RowEdit {
  isEnabled: boolean;
  maxCallsPerMinute: number;
  timeoutSeconds: number;
  locked: boolean;
}

/**
 * Governança das MCP tools: habilita/desabilita as ferramentas que o LLM pode
 * executar (no servidor e na máquina do cliente), com herança por escopo.
 *
 * - Ausência de sobrescrita neste nível = herda do nível acima (Global → Cliente
 *   → Site → Agente).
 * - "Bloquear" impede que níveis inferiores sobrescrevam a política — a mesma
 *   semântica de campos bloqueados para herança das configurações.
 */
export default function McpToolsSettings() {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<ScopeLevel>("global");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [pendingConfirm, setPendingConfirm] = useState<{ tool: McpToolCatalogItem; edit: RowEdit } | null>(null);

  const clients = useClients();
  const sites = useSites(clientId || undefined);
  const agents = useAgentsBySite(siteId);

  const scope: McpToolScopeRef = useMemo(() => {
    if (level === "agent") return { agentId };
    if (level === "site") return { siteId };
    if (level === "client") return { clientId };
    return {};
  }, [level, clientId, siteId, agentId]);

  const scopeReady =
    level === "global" ||
    (level === "client" && !!clientId) ||
    (level === "site" && !!siteId) ||
    (level === "agent" && !!agentId);

  const catalogQuery = useQuery({
    queryKey: ["mcp-tools", level, clientId, siteId, agentId],
    queryFn: () => mcpToolsApi.catalog(scope),
    enabled: scopeReady,
  });

  const saveMutation = useMutation({
    mutationFn: ({ toolName, edit }: { toolName: string; edit: RowEdit }) =>
      mcpToolsApi.save(toolName, {
        ...scope,
        isEnabled: edit.isEnabled,
        maxCallsPerMinute: edit.maxCallsPerMinute,
        timeoutSeconds: edit.timeoutSeconds,
        locked: edit.locked,
      }),
    onSuccess: (_data, variables) => {
      toast.success(`Política de "${variables.toolName}" salva.`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[variables.toolName];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["mcp-tools"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a política."),
  });

  const resetMutation = useMutation({
    mutationFn: (toolName: string) => mcpToolsApi.reset(toolName, scope),
    onSuccess: (_data, toolName) => {
      toast.success(`"${toolName}" voltou a herdar do nível acima.`);
      void queryClient.invalidateQueries({ queryKey: ["mcp-tools"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao restaurar a herança."),
  });

  const tools = catalogQuery.data?.tools ?? [];

  const rowState = (tool: McpToolCatalogItem): RowEdit =>
    edits[tool.name] ?? {
      isEnabled: tool.isEnabled,
      maxCallsPerMinute: tool.maxCallsPerMinute,
      timeoutSeconds: tool.timeoutSeconds,
      locked: tool.locked,
    };

  const patchRow = (tool: McpToolCatalogItem, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({ ...prev, [tool.name]: { ...rowState(tool), ...patch } }));

  const isDirty = (tool: McpToolCatalogItem) => {
    const edit = edits[tool.name];
    if (!edit) return false;
    return (
      edit.isEnabled !== tool.isEnabled ||
      edit.maxCallsPerMinute !== tool.maxCallsPerMinute ||
      edit.timeoutSeconds !== tool.timeoutSeconds ||
      edit.locked !== tool.locked
    );
  };

  const requestSave = (tool: McpToolCatalogItem) => {
    const edit = rowState(tool);
    // Desabilitar/bloquear num nível com sobrescritas abaixo tem impacto em cascata.
    if ((!edit.isEnabled || edit.locked) && tool.lowerScopeOverrides > 0) {
      setPendingConfirm({ tool, edit });
      return;
    }
    saveMutation.mutate({ toolName: tool.name, edit });
  };

  const scopeOptions = [
    { value: "global", label: "Global (todos)" },
    { value: "client", label: "Cliente" },
    { value: "site", label: "Site" },
    { value: "agent", label: "Agente" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ferramentas de IA (MCP)"
        description="Habilite ou desabilite as ferramentas que o modelo pode executar no servidor e na máquina do cliente. Sem sobrescrita local, o escopo herda a política do nível acima."
      />

      <Card>
        <CardHeader title="Escopo" subtitle="A política é resolvida de cima para baixo: Global → Cliente → Site → Agente." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Nível"
            options={scopeOptions}
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as ScopeLevel);
              setEdits({});
            }}
          />
          {level === "client" && (
            <Select
              label="Cliente"
              options={[
                { value: "", label: "Selecione..." },
                ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setEdits({});
              }}
            />
          )}
          {(level === "site" || level === "agent") && (
            <>
              <Select
                label="Cliente"
                options={[
                  { value: "", label: "Selecione..." },
                  ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setSiteId("");
                  setAgentId("");
                  setEdits({});
                }}
              />
              <Select
                label="Site"
                options={[
                  { value: "", label: "Selecione..." },
                  ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setAgentId("");
                  setEdits({});
                }}
              />
            </>
          )}
          {level === "agent" && (
            <Select
              label="Agente"
              options={[
                { value: "", label: "Selecione..." },
                ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.hostname ?? a.id })),
              ]}
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value);
                setEdits({});
              }}
            />
          )}
        </div>
      </Card>

      <Card padding={false}>
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Ferramentas {tools.length > 0 ? `(${tools.length})` : ""}
          </p>
          <p className="text-xs text-muted">
            {scopeReady
              ? "Servidor = executada na API. Agente = executada na máquina do cliente."
              : "Selecione o escopo para carregar as ferramentas."}
          </p>
        </div>

        {catalogQuery.isLoading && <p className="p-4 text-sm text-muted">Carregando...</p>}
        {catalogQuery.isError && (
          <p className="p-4 text-sm text-danger">Falha ao carregar o catálogo de ferramentas.</p>
        )}

        {scopeReady && !catalogQuery.isLoading && tools.length === 0 && (
          <p className="p-4 text-sm text-muted">Nenhuma ferramenta disponível neste escopo.</p>
        )}

        {tools.length > 0 && (
          <div className="divide-y divide-border">
            {tools.map((tool) => {
              const edit = rowState(tool);
              const dirty = isDirty(tool);
              // Bloqueio de herança: a política vem de um nível superior com
              // Locked=true — este escopo não pode sobrescrevê-la.
              const lockedByParent = tool.locked && !tool.overriddenHere;
              return (
                <div key={tool.name} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{tool.name}</span>
                      <Badge color={tool.source === "agent" ? "accent" : "primary"}>
                        {tool.source === "agent" ? "Agente" : "Servidor"}
                      </Badge>
                      {tool.overriddenHere ? (
                        <Badge color="warning">Sobrescrito aqui</Badge>
                      ) : (
                        <Badge color="slate">Herdado</Badge>
                      )}
                      {tool.locked && (
                        <Badge color="danger">
                          <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" /> Bloqueado
                        </Badge>
                      )}
                      {!tool.isEnabled && <Badge color="danger">Desabilitado</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{tool.description}</p>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={edit.isEnabled}
                        disabled={lockedByParent}
                        onChange={(e) => patchRow(tool, { isEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-border disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      Habilitada
                    </label>

                    <div className="w-24">
                      <Input
                        label="Chamadas/min"
                        type="number"
                        min={1}
                        max={600}
                        disabled={lockedByParent}
                        value={edit.maxCallsPerMinute}
                        onChange={(e) =>
                          patchRow(tool, { maxCallsPerMinute: Number(e.target.value) || 1 })
                        }
                      />
                    </div>

                    <div className="w-24">
                      <Input
                        label="Timeout (s)"
                        type="number"
                        min={1}
                        max={3600}
                        disabled={lockedByParent}
                        value={edit.timeoutSeconds}
                        onChange={(e) => patchRow(tool, { timeoutSeconds: Number(e.target.value) || 1 })}
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Impede que níveis inferiores sobrescrevam esta política.">
                      <input
                        type="checkbox"
                        checked={edit.locked}
                        disabled={lockedByParent}
                        onChange={(e) => patchRow(tool, { locked: e.target.checked })}
                        className="h-4 w-4 rounded border-border disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      Bloquear
                    </label>

                    <Button
                      size="sm"
                      onClick={() => requestSave(tool)}
                      disabled={!dirty || lockedByParent}
                      title={lockedByParent ? "Bloqueado por um nível superior (herança)" : undefined}
                      loading={saveMutation.isPending && saveMutation.variables?.toolName === tool.name}
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" /> Salvar
                    </Button>

                    {tool.overriddenHere ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetMutation.mutate(tool.name)}
                        loading={resetMutation.isPending && resetMutation.variables === tool.name}
                        title="Remove a sobrescrita local e volta a herdar."
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Herdar
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" /> herdando
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingConfirm}
        title="Confirmar impacto em cascata"
        confirmLabel="Aplicar"
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (pendingConfirm) {
            saveMutation.mutate({ toolName: pendingConfirm.tool.name, edit: pendingConfirm.edit });
          }
          setPendingConfirm(null);
        }}
        message={
          pendingConfirm ? (
            <span>
              Existem <strong>{pendingConfirm.tool.lowerScopeOverrides}</strong> sobrescrita(s) em escopos
              mais específicos para <strong>{pendingConfirm.tool.name}</strong>. Ao{" "}
              {pendingConfirm.edit.locked ? "bloquear" : "desabilitar"} neste nível, os níveis inferiores
              deixam de sobrescrever essa ferramenta.
            </span>
          ) : null
        }
      />
    </div>
  );
}

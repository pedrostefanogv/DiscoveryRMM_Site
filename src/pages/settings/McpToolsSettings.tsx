import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  CircleSlash,
  Pencil,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { mcpToolsApi, type McpToolCatalogItem, type McpToolScopeRef } from "@/api/mcp-tools";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAgentsBySite } from "@/hooks/useAgents";

type ScopeLevel = "global" | "client" | "site" | "agent";
type SourceFilter = "all" | "server" | "agent";
type StatusFilter = "all" | "enabled" | "disabled" | "overridden" | "locked";

interface RowEdit {
  isEnabled: boolean;
  maxCallsPerMinute: number;
  timeoutSeconds: number;
  locked: boolean;
}

/**
 * Capacidade governável que NÃO é uma ferramenta executável (ex.: A2UI).
 *
 * O backend sinaliza esses itens com `maxCallsPerMinute = 0` e
 * `timeoutApplies = false`, porque não existe chamada a limitar nem execução a
 * cronometrar — a capacidade só pode ser habilitada/desabilitada (e bloqueada
 * para os níveis abaixo). Nesses casos a tela esconde "Chamadas/min" e
 * "Timeout", que só geravam controles desalinhados e expectativa falsa.
 *
 * `isCapability` é opcional para tolerar uma API anterior à exposição do campo;
 * quando ausente, a inferência usa os dois sinais já existentes.
 */
function isNonExecutableCapability(tool: McpToolCatalogItem): boolean {
  if (tool.isCapability !== undefined) return tool.isCapability;
  return !tool.timeoutApplies && tool.maxCallsPerMinute <= 0;
}

/** Chip compacto de resumo (largura/altura constante => colunas alinhadas). */
function SummaryChip({
  children,
  title,
  tone = "slate",
}: {
  children: ReactNode;
  title?: string;
  tone?: "slate" | "success" | "danger";
}) {
  const tones = {
    slate: "border-border bg-surface-light text-muted-foreground",
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/30 bg-danger/10 text-danger",
  } as const;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Valida o texto digitado nos campos numéricos do modal.
 *
 * Aceita campo vazio durante a digitação: `Number(valor) || 1` forçava "1" a
 * cada backspace (era impossível apagar o campo) e os atributos min/max nativos
 * disparavam o balão "Selecione um valor que não seja menor que 1". Os limites
 * reais da API são 600 chamadas/min e 3600s de timeout (McpToolsController).
 */
function parseLimit(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/**
 * Governança das MCP tools: habilita/desabilita as ferramentas que o LLM pode
 * executar (no servidor e na máquina do cliente), com herança por escopo.
 *
 * - Ausência de sobrescrita neste nível = herda do nível acima (Global → Cliente
 *   → Site → Agente).
 * - "Bloquear" impede que níveis inferiores sobrescrevam a política — a mesma
 *   semântica de campos bloqueados para herança das configurações.
 * - A linha mostra apenas o resumo da política; a edição acontece em um modal
 *   (um único botão "Editar"), o que evita a grade de controles desalinhados.
 * - Capacidades não executáveis (A2UI) exibem somente ligar/desligar + bloquear:
 *   não têm limite de chamadas nem timeout.
 */
export default function McpToolsSettings() {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<ScopeLevel>("global");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [editingTool, setEditingTool] = useState<string | null>(null);
  // Texto digitado nos campos numéricos do modal: preserva o que o operador
  // digitou (inclusive vazio/inválido) enquanto o rascunho numérico só é
  // atualizado quando o valor é válido.
  const [limitText, setLimitText] = useState<{ calls: string; timeout: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ tool: McpToolCatalogItem; edit: RowEdit } | null>(null);

  // ── Filtros da lista ────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    mutationFn: ({ tool, edit }: { tool: McpToolCatalogItem; edit: RowEdit }) =>
      mcpToolsApi.save(tool.name, {
        ...scope,
        isEnabled: edit.isEnabled,
        // Capacidade não executável: nada de rate limit nem timeout — o backend
        // também descarta esses valores para esses itens.
        maxCallsPerMinute: isNonExecutableCapability(tool) ? null : edit.maxCallsPerMinute,
        timeoutSeconds: isNonExecutableCapability(tool) ? null : edit.timeoutSeconds,
        locked: edit.locked,
      }),
    onSuccess: (_data, variables) => {
      toast.success(`Política de "${variables.tool.name}" salva.`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[variables.tool.name];
        return next;
      });
      setLimitText(null);
      setEditingTool(null);
      void queryClient.invalidateQueries({ queryKey: ["mcp-tools"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a política."),
  });

  const resetMutation = useMutation({
    mutationFn: (toolName: string) => mcpToolsApi.reset(toolName, scope),
    onSuccess: (_data, toolName) => {
      toast.success(`"${toolName}" voltou a herdar do nível acima.`);
      // A sobrescrita deixou de existir: descartar o rascunho evita a linha
      // continuar marcada como "Não salvo" com valores que já não valem.
      setEdits((prev) => {
        const next = { ...prev };
        delete next[toolName];
        return next;
      });
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

  /** Abre o editor do modal já com o texto dos campos numéricos normalizado. */
  const openEditor = (tool: McpToolCatalogItem) => {
    const state = rowState(tool);
    setLimitText({
      calls: String(state.maxCallsPerMinute),
      timeout: String(state.timeoutSeconds),
    });
    setEditingTool(tool.name);
  };

  /**
   * Fecha o editor DESCARTANDO o rascunho local (Cancelar / X / clique fora):
   * sem isso a linha continuava exibindo "Não salvo" com valores abandonados e
   * o modal reabria já preenchido com eles.
   */
  const closeEditor = () => {
    const toolName = editingTool;
    if (toolName) {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[toolName];
        return next;
      });
    }
    setLimitText(null);
    setEditingTool(null);
  };

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

  const categories = useMemo(
    () =>
      Array.from(new Set(tools.map((tool) => tool.category).filter((category): category is string => !!category)))
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tools],
  );

  const filteredTools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tools.filter((tool) => {
      if (sourceFilter !== "all" && tool.source !== sourceFilter) return false;
      if (categoryFilter && tool.category !== categoryFilter) return false;
      if (statusFilter === "enabled" && !tool.isEnabled) return false;
      if (statusFilter === "disabled" && tool.isEnabled) return false;
      if (statusFilter === "overridden" && !tool.overriddenHere) return false;
      if (statusFilter === "locked" && !tool.locked) return false;
      if (!term) return true;

      return [
        tool.name,
        tool.description,
        tool.category ?? "",
        tool.whenToUse ?? "",
        tool.source === "agent" ? "agente" : "servidor",
        tool.isEnabled ? "habilitada" : "desabilitada",
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [tools, search, sourceFilter, statusFilter, categoryFilter]);

  const hasActiveFilters =
    search.trim() !== "" || sourceFilter !== "all" || statusFilter !== "all" || categoryFilter !== "";

  const clearFilters = () => {
    setSearch("");
    setSourceFilter("all");
    setStatusFilter("all");
    setCategoryFilter("");
  };

  const requestSave = (tool: McpToolCatalogItem) => {
    const edit = rowState(tool);
    // Desabilitar/bloquear num nível com sobrescritas abaixo tem impacto em cascata.
    if ((!edit.isEnabled || edit.locked) && tool.lowerScopeOverrides > 0) {
      // Fecha o modal de edição antes de abrir a confirmação (evita dois
      // overlays empilhados) e o reabre se o operador cancelar.
      setEditingTool(null);
      setPendingConfirm({ tool, edit });
      return;
    }
    saveMutation.mutate({ tool, edit });
  };

  const editing = editingTool ? tools.find((tool) => tool.name === editingTool) ?? null : null;
  const editingEdit = editing ? rowState(editing) : null;
  const editingLockedByParent = editing ? editing.locked && !editing.overriddenHere : false;
  const editingCapability = editing ? isNonExecutableCapability(editing) : false;

  // Texto exibido nos campos numéricos do modal e sua validação: o rascunho
  // numérico só acompanha valores válidos, mas o texto livre fica visível para
  // o operador ver o que digitou (inclusive vazio) e receber o erro.
  const callsText = limitText?.calls ?? (editingEdit ? String(editingEdit.maxCallsPerMinute) : "");
  const timeoutText = limitText?.timeout ?? (editingEdit ? String(editingEdit.timeoutSeconds) : "");
  const callsValue = parseLimit(callsText, 1, 600);
  const timeoutValue = parseLimit(timeoutText, 1, 3600);
  const editingLimitsInvalid = !editing
    ? false
    : editingCapability
      ? false
      : callsValue === null || (editing.timeoutApplies && timeoutValue === null);

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
              setEditingTool(null);
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
                setEditingTool(null);
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
                  setEditingTool(null);
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
                  setEditingTool(null);
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
                setEditingTool(null);
              }}
            />
          )}
        </div>
      </Card>

      <Card padding={false}>
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Ferramentas {tools.length > 0 ? `(${tools.length})` : ""}
              </p>
              <p className="text-xs text-muted">
                {scopeReady
                  ? "Servidor = executada na API. Agente = executada na máquina do cliente."
                  : "Selecione o escopo para carregar as ferramentas."}
              </p>
            </div>
            {tools.length > 0 && (
              <span className="text-xs text-muted">
                Mostrando {filteredTools.length} de {tools.length}
              </span>
            )}
          </div>

          {tools.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="Buscar ferramenta"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, descrição, categoria..."
                />
                <Select
                  label="Origem"
                  options={[
                    { value: "all", label: "Servidor e agente" },
                    { value: "server", label: "Servidor" },
                    { value: "agent", label: "Agente" },
                  ]}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                />
                <Select
                  label="Estado"
                  options={[
                    { value: "all", label: "Todos os estados" },
                    { value: "enabled", label: "Habilitadas" },
                    { value: "disabled", label: "Desabilitadas" },
                    { value: "overridden", label: "Sobrescritas aqui" },
                    { value: "locked", label: "Bloqueadas" },
                  ]}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                />
                <Select
                  label="Categoria"
                  options={[
                    { value: "", label: "Todas as categorias" },
                    ...categories.map((category) => ({ value: category, label: category })),
                  ]}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                />
              </div>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )}
            </>
          )}
        </div>

        {catalogQuery.isLoading && <p className="p-4 text-sm text-muted">Carregando...</p>}
        {catalogQuery.isError && (
          <p className="p-4 text-sm text-danger">Falha ao carregar o catálogo de ferramentas.</p>
        )}

        {scopeReady && !catalogQuery.isLoading && tools.length === 0 && (
          <p className="p-4 text-sm text-muted">Nenhuma ferramenta disponível neste escopo.</p>
        )}

        {tools.length > 0 && filteredTools.length === 0 && (
          <div className="p-4 text-sm text-muted">
            <p>Nenhuma ferramenta corresponde aos filtros atuais.</p>
            <div className="mt-2">
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          </div>
        )}

        {filteredTools.length > 0 && (
          <div className="divide-y divide-border">
            {filteredTools.map((tool) => {
              const edit = rowState(tool);
              const dirty = isDirty(tool);
              const capability = isNonExecutableCapability(tool);
              // Bloqueio de herança: a política vem de um nível superior com
              // Locked=true — este escopo não pode sobrescrevê-la.
              const lockedByParent = tool.locked && !tool.overriddenHere;
              const isExpanded = !!expanded[tool.name];
              return (
                <div
                  key={tool.name}
                  data-testid={`mcp-tool-${tool.name}`}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{tool.name}</span>
                      <Badge color={tool.source === "agent" ? "accent" : "primary"}>
                        {tool.source === "agent" ? "Agente" : "Servidor"}
                      </Badge>
                      {tool.category && <Badge color="slate">{tool.category}</Badge>}
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

                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [tool.name]: !prev[tool.name] }))}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {isExpanded ? "Ocultar detalhes" : "O que faz e quando usar"}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-surface-light px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">O que faz:</strong> {tool.description}
                        </p>
                        {tool.whenToUse && (
                          <p className="text-xs text-muted-foreground">
                            <strong className="text-foreground">Quando usar:</strong> {tool.whenToUse}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Timeout recomendado:</strong>{" "}
                          {tool.timeoutApplies
                            ? `${tool.recommendedTimeoutSeconds}s`
                            : "não se aplica (a ferramenta aguarda o usuário)"}
                          . Executa {tool.source === "agent" ? "na máquina do cliente (agente)" : "na API (servidor)"}.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Coluna de resumo + ação: largura fixa no desktop para que
                      todas as linhas fiquem alinhadas na mesma vertical. */}
                  <div className="flex shrink-0 flex-col gap-2 lg:w-80 lg:items-end">
                    <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                      <SummaryChip tone={edit.isEnabled ? "success" : "danger"}>
                        {edit.isEnabled ? "Habilitada" : "Desabilitada"}
                      </SummaryChip>
                      {capability ? (
                        <SummaryChip title="Capacidade do chat: não é executada, então não tem limite de chamadas nem timeout.">
                          Sem limites
                        </SummaryChip>
                      ) : (
                        <>
                          <SummaryChip title="Limite de chamadas por minuto">{edit.maxCallsPerMinute}/min</SummaryChip>
                          {tool.timeoutApplies ? (
                            <SummaryChip title="Timeout aplicado à execução">Timeout {edit.timeoutSeconds}s</SummaryChip>
                          ) : (
                            <SummaryChip title="A ferramenta aguarda o usuário; o timeout não é aplicado.">
                              Sem timeout
                            </SummaryChip>
                          )}
                        </>
                      )}
                      {dirty && <SummaryChip tone="danger">Não salvo</SummaryChip>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`mcp-edit-${tool.name}`}
                        onClick={() => openEditor(tool)}
                        title={
                          lockedByParent
                            ? "Bloqueado por um nível superior (herança) — somente leitura"
                            : `Editar a política de ${tool.name}`
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
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
                        <span className="inline-flex w-[5.5rem] items-center gap-1 text-xs text-muted lg:justify-end">
                          <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" /> herdando
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Modal de edição da política ─────────────────────────────────── */}
      <Modal
        open={!!editing}
        onClose={closeEditor}
        title={editing ? `Editar política — ${editing.name}` : "Editar política"}
        maxWidth="max-w-xl"
      >
        {editing && editingEdit && (
          <div className="space-y-5">
            <div className="space-y-2 rounded-lg border border-border bg-surface-light px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={editing.source === "agent" ? "accent" : "primary"}>
                  {editing.source === "agent" ? "Agente" : "Servidor"}
                </Badge>
                {editing.category && <Badge color="slate">{editing.category}</Badge>}
                {editing.overriddenHere ? (
                  <Badge color="warning">Sobrescrito aqui</Badge>
                ) : (
                  <Badge color="slate">Herdado do nível acima</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{editing.description}</p>
              {editing.whenToUse && (
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Quando usar:</strong> {editing.whenToUse}
                </p>
              )}
            </div>

            {editingLockedByParent && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <span>
                  Esta política está <strong>bloqueada por um nível superior</strong>. Remova o bloqueio no escopo
                  de origem para poder editá-la aqui.
                </span>
              </div>
            )}

            {editingCapability && (
              <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted-foreground">
                Esta é uma <strong className="text-foreground">capacidade do chat</strong>, não uma ferramenta
                executável: não há chamada para limitar nem execução para cronometrar. Por isso só existe{" "}
                <strong className="text-foreground">habilitar/desabilitar</strong> (e bloquear a herança nos níveis
                abaixo).
              </p>
            )}

            <label
              htmlFor="mcp-policy-enabled"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <input
                id="mcp-policy-enabled"
                type="checkbox"
                checked={editingEdit.isEnabled}
                disabled={editingLockedByParent}
                onChange={(e) => patchRow(editing, { isEnabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Habilitada</span>
                <span className="block text-xs text-muted">
                  Desligada, a ferramenta não é oferecida ao modelo neste escopo.
                </span>
              </span>
            </label>

            {!editingCapability && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="mcp-policy-max-calls"
                  label="Chamadas/min"
                  type="number"
                  inputMode="numeric"
                  disabled={editingLockedByParent}
                  value={callsText}
                  error={callsValue === null ? "Informe um número entre 1 e 600." : undefined}
                  onChange={(e) => {
                    const text = e.target.value;
                    setLimitText((prev) => ({
                      calls: text,
                      timeout: prev?.timeout ?? timeoutText,
                    }));
                    const parsed = parseLimit(text, 1, 600);
                    if (parsed !== null) patchRow(editing, { maxCallsPerMinute: parsed });
                  }}
                  hint="Limite de execuções por minuto neste escopo."
                />

                {editing.timeoutApplies ? (
                  <div className="space-y-1">
                    <Input
                      id="mcp-policy-timeout"
                      label="Timeout (s)"
                      type="number"
                      inputMode="numeric"
                      disabled={editingLockedByParent}
                      value={timeoutText}
                      error={timeoutValue === null ? "Informe um número entre 1 e 3600." : undefined}
                      onChange={(e) => {
                        const text = e.target.value;
                        setLimitText((prev) => ({
                          calls: prev?.calls ?? callsText,
                          timeout: text,
                        }));
                        const parsed = parseLimit(text, 1, 3600);
                        if (parsed !== null) patchRow(editing, { timeoutSeconds: parsed });
                      }}
                      hint={`Recomendado: ${editing.recommendedTimeoutSeconds}s`}
                    />
                    {editing.recommendedTimeoutSeconds > 0 &&
                      editingEdit.timeoutSeconds !== editing.recommendedTimeoutSeconds && (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          disabled={editingLockedByParent}
                          onClick={() => {
                            const recommended = editing.recommendedTimeoutSeconds;
                            // O texto do campo precisa acompanhar: sem isso o
                            // input mostraria o valor antigo enquanto o
                            // rascunho já valia o recomendado.
                            setLimitText((prev) => ({
                              calls: prev?.calls ?? callsText,
                              timeout: String(recommended),
                            }));
                            patchRow(editing, { timeoutSeconds: recommended });
                          }}
                          title="Aplicar o timeout recomendado para esta ferramenta"
                        >
                          Usar o recomendado ({editing.recommendedTimeoutSeconds}s)
                        </button>
                      )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="block text-sm font-medium text-muted-foreground">Timeout</span>
                    <p className="text-xs text-muted">Não se aplica</p>
                    <p className="text-xs text-muted">
                      Esta ferramenta aguarda resposta/autorização do usuário; o agente ignora o timeout.
                    </p>
                  </div>
                )}
              </div>
            )}

            <label
              htmlFor="mcp-policy-locked"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <input
                id="mcp-policy-locked"
                type="checkbox"
                checked={editingEdit.locked}
                disabled={editingLockedByParent}
                onChange={(e) => patchRow(editing, { locked: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Bloquear herança</span>
                <span className="block text-xs text-muted">
                  Impede que cliente, site e agente sobrescrevam esta política.
                  {editing.lowerScopeOverrides > 0 && (
                    <>
                      {" "}
                      Hoje existem <strong className="text-foreground">{editing.lowerScopeOverrides}</strong>{" "}
                      sobrescrita(s) em níveis mais específicos.
                    </>
                  )}
                </span>
              </span>
            </label>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={closeEditor}>
                Cancelar
              </Button>
              {editing.overriddenHere && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    closeEditor();
                    resetMutation.mutate(editing.name);
                  }}
                  loading={resetMutation.isPending && resetMutation.variables === editing.name}
                  title="Remove a sobrescrita local e volta a herdar."
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Herdar
                </Button>
              )}
              <Button
                onClick={() => requestSave(editing)}
                disabled={!isDirty(editing) || editingLockedByParent || editingLimitsInvalid}
                loading={saveMutation.isPending && saveMutation.variables?.tool.name === editing.name}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" /> Salvar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingConfirm}
        title="Confirmar impacto em cascata"
        confirmLabel="Aplicar"
        onClose={() => {
          // Cancelou: volta para o modal de edição com o rascunho preservado.
          const tool = pendingConfirm?.tool;
          setPendingConfirm(null);
          if (tool) setEditingTool(tool.name);
        }}
        onConfirm={() => {
          if (pendingConfirm) {
            saveMutation.mutate({ tool: pendingConfirm.tool, edit: pendingConfirm.edit });
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

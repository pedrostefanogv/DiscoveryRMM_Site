import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Globe,
  ListTodo,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DepartmentCustomFieldsSection } from "@/components/configuration/DepartmentCustomFieldsSection";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Input,
  Loading,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useIamUsers } from "@/hooks/useIdentity";
import {
  useAddDepartmentMember,
  useDepartmentMembers,
  useRemoveDepartmentMember,
} from "@/hooks/useSupportProductivity";
import {
  useApplySkillSuggestion,
  useApplyWeightSuggestion,
  useDeleteDepartment,
  useDepartment,
  useDepartmentLearningSuggestions,
  useDepartmentTeamMetrics,
  useDiscardSkillSuggestion,
  useDiscardWeightSuggestion,
  useRefreshDepartmentTeamMetrics,
  useRunLearningCycle,
  useUpdateDepartment,
  useUpdateDepartmentMemberProfile,
} from "@/hooks/useDepartments";
import type {
  AiAssignmentWeights,
  DepartmentMemberProfileDto,
  UpdateDepartmentMemberProfileRequest,
  UpdateDepartmentRequest,
} from "@/api";

type DepartmentTab = "general" | "fields" | "team";

const ASSIGNMENT_OPTIONS = [
  { value: "0", label: "Manual (sem auto-atribuição)" },
  { value: "1", label: "Round-robin" },
  { value: "2", label: "Menos chamados abertos" },
  { value: "3", label: "Triagem por IA (métricas da equipe)" },
];

const AI_MODE_OPTIONS = [
  { value: "0", label: "Sugerir (um humano confirma)" },
  { value: "1", label: "Atribuir automaticamente" },
];

const AI_FALLBACK_OPTIONS = [
  { value: "1", label: "Round-robin" },
  { value: "2", label: "Menos chamados abertos" },
];

const LEARNING_MODE_OPTIONS = [
  { value: "0", label: "Desligado" },
  { value: "1", label: "Sugerir (gestor aprova)" },
  { value: "2", label: "Aplicar automaticamente" },
];

function describeWeights(weights: AiAssignmentWeights): string {
  return [
    "competência " + weights.skill.toFixed(2),
    "afinidade " + weights.affinity.toFixed(2),
    "performance " + weights.performance.toFixed(2),
    "carga " + weights.load.toFixed(2),
    "csat " + weights.csat.toFixed(2),
    "sla " + weights.slaQuality.toFixed(2),
  ].join(" · ");
}

function describeEvidence(json?: string | null, limit = 3): string {
  if (!json) return "sem evidência detalhada";
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;

    // Evidência da recalibração de pesos: { dimensao: { Samples, Overrides, Strength, Delta } }.
    const dimensions = Object.entries(parsed)
      .filter(([, value]) => value !== null && typeof value === "object" && ("Delta" in value || "delta" in value))
      .map(([key, value]) => {
        const item = value as {
          Samples?: number;
          Overrides?: number;
          Strength?: number;
          Delta?: number;
          samples?: number;
          overrides?: number;
          strength?: number;
          delta?: number;
        };
        const samples = item.Samples ?? item.samples ?? 0;
        const overrides = item.Overrides ?? item.overrides ?? 0;
        const strength = item.Strength ?? item.strength ?? 0;
        const delta = item.Delta ?? item.delta ?? 0;
        return {
          magnitude: Math.abs(delta),
          text:
            key +
            ": " +
            overrides +
            "/" +
            samples +
            " trocas · força " +
            strength.toFixed(2) +
            " · Δ " +
            delta.toFixed(3),
        };
      })
      .filter((entry) => entry.text.indexOf("/0 ") < 0)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, limit)
      .map((entry) => entry.text);

    if (dimensions.length > 0) return dimensions.join(" · ");

    // Evidência da extração de competências: { resolvedTickets, tags: [...] }.
    const evidence = parsed as {
      resolvedTickets?: number;
      tags?: { tag: string; count: number }[];
    };
    const parts = (evidence.tags ?? []).slice(0, limit).map((item) => item.tag + ": " + item.count);
    if (evidence.resolvedTickets !== undefined) {
      parts.unshift("chamados resolvidos: " + evidence.resolvedTickets);
    }
    return parts.join(" · ") || "sem evidência detalhada";
  } catch {
    return "sem evidência detalhada";
  }
}

const DEFAULT_WEIGHTS: AiAssignmentWeights = {
  skill: 0.25,
  affinity: 0.25,
  performance: 0.2,
  load: 0.15,
  csat: 0.1,
  slaQuality: 0.05,
};

const WEIGHT_FIELDS: { key: keyof AiAssignmentWeights; label: string }[] = [
  { key: "skill", label: "Competência" },
  { key: "affinity", label: "Afinidade" },
  { key: "performance", label: "Performance" },
  { key: "load", label: "Carga" },
  { key: "csat", label: "CSAT" },
  { key: "slaQuality", label: "Qualidade de SLA" },
];

function parseWeights(json?: string | null): AiAssignmentWeights {
  if (!json) return { ...DEFAULT_WEIGHTS };
  try {
    const parsed = JSON.parse(json) as Partial<AiAssignmentWeights>;
    return { ...DEFAULT_WEIGHTS, ...parsed };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

function formatMinutes(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value < 60) return value.toFixed(0) + " min";
  if (value < 1440) return (value / 60).toFixed(1) + " h";
  return (value / 1440).toFixed(1) + " d";
}

function formatPercent(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return (value * 100).toFixed(0) + "%";
}

/**
 * Formata decimais opcionais. A API usa JsonIgnoreCondition.WhenWritingNull, então
 * um campo anulável pode chegar como `undefined` (propriedade omitida) em vez de
 * `null`. Sem esta guarda, `undefined.toFixed(...)` derruba o render.
 */
function formatDecimal(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function DepartmentMembersCard({ departmentId }: { departmentId: string }) {
  const members = useDepartmentMembers(departmentId);
  const add = useAddDepartmentMember();
  const remove = useRemoveDepartmentMember();
  const users = useIamUsers();
  const [userId, setUserId] = useState("");

  const memberIds = new Set((members.data ?? []).map((m) => m.userId));
  const options = [
    { value: "", label: "Selecione um usuário..." },
    ...(users.data ?? [])
      .filter((u) => !memberIds.has(u.id))
      .map((u) => ({ value: u.id, label: u.fullName || u.login || u.email })),
  ];

  return (
    <Card>
      <CardHeader
        title="Equipe do departamento"
        subtitle="Usuários elegíveis para auto-atribuição (round-robin / menos chamados)."
      />
      <div className="space-y-3">
        {members.isLoading && <Loading />}
        {(members.data ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2">
            <span className="text-sm text-foreground">{m.userName ?? m.userId}</span>
            <button
              type="button"
              aria-label="Remover membro"
              className="p-1 text-muted hover:text-danger"
              onClick={() =>
                remove.mutate(
                  { departmentId, userId: m.userId },
                  { onError: () => toast.error("Erro ao remover membro") },
                )
              }
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(members.data?.length ?? 0) === 0 && !members.isLoading && (
          <p className="text-sm text-muted">Nenhum membro cadastrado.</p>
        )}
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-[220px] flex-1">
            <Select label="Adicionar usuário" options={options} value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={!userId}
            loading={add.isPending}
            onClick={() =>
              add.mutate(
                { departmentId, userId },
                {
                  onSuccess: () => setUserId(""),
                  onError: () => toast.error("Erro ao adicionar membro"),
                },
              )
            }
          >
            Adicionar
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function DepartmentDetailPage() {
  const navigate = useNavigate();
  const { departmentId = "" } = useParams();

  const departmentQuery = useDepartment(departmentId);
  const clientsQuery = useClients();

  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [tab, setTab] = useState<DepartmentTab>("general");
  const [form, setForm] = useState<UpdateDepartmentRequest | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Semeadura do form: só quando muda o departamento; refetch não sobrescreve
  // edições pendentes do usuário.
  const seededDepartmentIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const clientsById = useMemo(
    () => new Map((clientsQuery.data ?? []).map((client) => [client.id, client.name])),
    [clientsQuery.data],
  );

  useEffect(() => {
    if (!departmentQuery.data) return;

    const entityChanged = seededDepartmentIdRef.current !== departmentQuery.data.id;
    if (!entityChanged && dirtyRef.current) return;

    setForm({
      name: departmentQuery.data.name,
      description: departmentQuery.data.description,
      inheritFromGlobalId: departmentQuery.data.inheritFromGlobalId,
      sortOrder: departmentQuery.data.sortOrder,
      isActive: departmentQuery.data.isActive,
      assignmentStrategy: departmentQuery.data.assignmentStrategy ?? 0,
      aiAssignmentMode: departmentQuery.data.aiAssignmentMode ?? 0,
      aiAssignmentMinConfidence: departmentQuery.data.aiAssignmentMinConfidence ?? 0.6,
      aiAssignmentFallbackStrategy: departmentQuery.data.aiAssignmentFallbackStrategy ?? 1,
      aiAssignmentMaxCandidates: departmentQuery.data.aiAssignmentMaxCandidates ?? 8,
      aiAssignmentWeightsJson: departmentQuery.data.aiAssignmentWeightsJson ?? null,
      aiAssignmentInstructions: departmentQuery.data.aiAssignmentInstructions ?? null,
      aiAssignmentUseAffinity: departmentQuery.data.aiAssignmentUseAffinity ?? true,
    });
    seededDepartmentIdRef.current = departmentQuery.data.id;
    if (entityChanged) dirtyRef.current = false;
  }, [departmentQuery.data]);

  if (!departmentId) {
    return (
      <ErrorDisplay
        message="Departamento inválido."
        onRetry={() => navigate("/tickets/departments")}
      />
    );
  }

  if (departmentQuery.isLoading) {
    return <Loading message="Carregando detalhes do departamento..." />;
  }

  if (departmentQuery.isError || !departmentQuery.data || !form) {
    return (
      <ErrorDisplay
        message="Não foi possível carregar o departamento solicitado."
        onRetry={() => void departmentQuery.refetch()}
      />
    );
  }

  const department = departmentQuery.data;
  const clientName = department.clientId
    ? clientsById.get(department.clientId) ?? "Cliente"
    : null;

  const valid = form.name.trim().length >= 2;

  async function handleSave() {
    const currentForm = form;
    if (!currentForm) return;

    if (!valid) {
      toast.error("Informe um nome com ao menos 2 caracteres.");
      return;
    }

    try {
      await updateDepartment.mutateAsync({
        id: department.id,
        data: {
          ...currentForm,
          name: currentForm.name.trim(),
          description: currentForm.description?.trim() || null,
          inheritFromGlobalId: currentForm.inheritFromGlobalId ?? null,
          sortOrder: Math.max(0, Number(currentForm.sortOrder || 0)),
          isActive: currentForm.isActive ?? true,
          assignmentStrategy: currentForm.assignmentStrategy ?? 0,
        },
      });
      dirtyRef.current = false;
      toast.success("Departamento atualizado com sucesso.");
      void departmentQuery.refetch();
    } catch {
      toast.error("Erro ao atualizar departamento.");
    }
  }

function handleDelete() {
    setConfirmDeleteOpen(true);
  }

  async function confirmDeleteDepartment() {
    try {
      await deleteDepartment.mutateAsync(department.id);
      toast.success("Departamento excluído com sucesso.");
      navigate("/tickets/departments");
    } catch {
      toast.error("Erro ao excluir departamento.");
    }
  }

  const scopedTo = department.clientId
    ? `Cliente: ${clientName ?? "—"}`
    : "Global — visível para todos os clientes";
  const statusText = department.isActive ? "Ativo" : "Inativo";
  const desc = `${scopedTo} · ${statusText} · Ordem #${department.sortOrder}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={department.name}
        description={desc}
      >
        <Button variant="ghost" onClick={() => navigate("/tickets/departments")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para listagem
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={department.clientId ? Building2 : Globe}
          label="Escopo"
          value={clientName ?? "Global"}
          tone={department.clientId ? "accent" : "primary"}
        />
        <StatCard
          icon={Building2}
          label="Ordem"
          value={`#${department.sortOrder}`}
          tone="warning"
        />
        <StatCard
          icon={Settings}
          label="Status"
          value={department.isActive ? "Ativo" : "Inativo"}
          tone={department.isActive ? "success" : "warning"}
        />
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface-light p-1">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "general"
              ? "bg-primary/20 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Settings className="mr-1.5 inline h-4 w-4" />
          Geral
        </button>
        <button
          type="button"
          onClick={() => setTab("fields")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "fields"
              ? "bg-primary/20 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <ListTodo className="mr-1.5 inline h-4 w-4" />
          Campos customizados
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "team"
              ? "bg-primary/20 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Users className="mr-1.5 inline h-4 w-4" />
          Equipe
        </button>
      </div>

      {tab === "general" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Card>
            <CardHeader
              title="Dados do departamento"
              subtitle="Atualize os dados principais e salve nesta própria URL."
            />
            <div className="space-y-4">
              <Input
                label="Nome *"
                value={form.name}
                onChange={(event) => {
                  markDirty();
                  setForm((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  );
                }}
              />

              <Input
                label="Descrição"
                value={form.description ?? ""}
                onChange={(event) => {
                  markDirty();
                  setForm((current) =>
                    current ? { ...current, description: event.target.value || null } : current,
                  );
                }}
                placeholder="Contexto operacional e regras deste departamento"
              />

              <Input
                label="Ordem"
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) => {
                  markDirty();
                  setForm((current) =>
                    current
                      ? { ...current, sortOrder: Math.max(0, Number(event.target.value || 0)) }
                      : current,
                  );
                }}
              />

              <Select
                label="Auto-atribuição de chamados"
                options={ASSIGNMENT_OPTIONS}
                value={String(form.assignmentStrategy ?? 0)}
                onChange={(event) => {
                  markDirty();
                  setForm((current) =>
                    current ? { ...current, assignmentStrategy: Number(event.target.value) } : current,
                  );
                }}
              />

              {Number(form.assignmentStrategy ?? 0) === 3 && (
                <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Triagem por IA</p>
                    <p className="mt-1 text-xs text-muted">
                      A IA escolhe o responsável cruzando o conteúdo e a dificuldade do
                      chamado com métricas, afinidade e competências dos membros da equipe.
                      Exige a integração de IA habilitada nas configurações do servidor.
                    </p>
                  </div>

                  <Select
                    label="Como aplicar a decisão"
                    options={AI_MODE_OPTIONS}
                    value={String(form.aiAssignmentMode ?? 0)}
                    onChange={(event) => {
                      markDirty();
                      setForm((current) =>
                        current ? { ...current, aiAssignmentMode: Number(event.target.value) } : current,
                      );
                    }}
                  />

                  <Select
                    label="Fallback quando a IA não decide"
                    options={AI_FALLBACK_OPTIONS}
                    value={String(form.aiAssignmentFallbackStrategy ?? 1)}
                    onChange={(event) => {
                      markDirty();
                      setForm((current) =>
                        current ? { ...current, aiAssignmentFallbackStrategy: Number(event.target.value) } : current,
                      );
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Confiança mínima (0 a 1)"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={String(form.aiAssignmentMinConfidence ?? 0.6)}
                      onChange={(event) => {
                        markDirty();
                        setForm((current) =>
                          current ? { ...current, aiAssignmentMinConfidence: Number(event.target.value || 0) } : current,
                        );
                      }}
                    />
                    <Input
                      label="Máximo de candidatos"
                      type="number"
                      min="1"
                      max="20"
                      value={String(form.aiAssignmentMaxCandidates ?? 8)}
                      onChange={(event) => {
                        markDirty();
                        setForm((current) =>
                          current ? { ...current, aiAssignmentMaxCandidates: Number(event.target.value || 1) } : current,
                        );
                      }}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={form.aiAssignmentUseAffinity ?? true}
                      onChange={(event) => {
                        markDirty();
                        setForm((current) =>
                          current ? { ...current, aiAssignmentUseAffinity: event.target.checked } : current,
                        );
                      }}
                      className="rounded border-border bg-surface-light"
                    />
                    Usar afinidade com chamados semelhantes já resolvidos
                  </label>

                  <Input
                    label="Orientações para a IA (opcional)"
                    value={form.aiAssignmentInstructions ?? ""}
                    onChange={(event) => {
                      markDirty();
                      setForm((current) =>
                        current ? { ...current, aiAssignmentInstructions: event.target.value || null } : current,
                      );
                    }}
                    placeholder="Ex.: priorize quem domina rede para chamados do cliente X"
                  />

                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted">Pesos do score</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {WEIGHT_FIELDS.map((field) => {
                        const weights = parseWeights(form.aiAssignmentWeightsJson);
                        return (
                          <Input
                            key={field.key}
                            label={field.label}
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={String(weights[field.key])}
                            onChange={(event) => {
                              markDirty();
                              const next = { ...weights, [field.key]: Number(event.target.value || 0) };
                              setForm((current) =>
                                current ? { ...current, aiAssignmentWeightsJson: JSON.stringify(next) } : current,
                              );
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border bg-surface-light p-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Aprendizado (híbrido)</p>
                      <p className="mt-1 text-xs text-muted">
                        A IA pode extrair competências do histórico e recalibrar os pesos a partir das
                        trocas manuais de responsável. Em "Sugerir", nada muda sem aprovação do gestor.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        label="Competências: modo"
                        options={LEARNING_MODE_OPTIONS}
                        value={String(form.aiSkillLearningMode ?? 1)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiSkillLearningMode: Number(event.target.value) } : current,
                          );
                        }}
                      />
                      <Select
                        label="Pesos: modo"
                        options={LEARNING_MODE_OPTIONS}
                        value={String(form.aiWeightLearningMode ?? 1)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiWeightLearningMode: Number(event.target.value) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Evidência mínima (chamados)"
                        type="number"
                        min="1"
                        max="100"
                        value={String(form.aiSkillMinEvidence ?? 3)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiSkillMinEvidence: Number(event.target.value || 1) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Máx. competências por atendente"
                        type="number"
                        min="1"
                        max="30"
                        value={String(form.aiSkillMaxTags ?? 12)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiSkillMaxTags: Number(event.target.value || 1) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Ciclo de calibração (dias)"
                        type="number"
                        min="1"
                        max="90"
                        value={String(form.aiWeightCycleDays ?? 7)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiWeightCycleDays: Number(event.target.value || 1) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Ajuste máx. por ciclo"
                        type="number"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        value={String(form.aiWeightMaxDeltaPerCycle ?? 0.1)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiWeightMaxDeltaPerCycle: Number(event.target.value || 0.01) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Peso mínimo"
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={String(form.aiWeightMin ?? 0.05)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiWeightMin: Number(event.target.value || 0.01) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Peso máximo"
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={String(form.aiWeightMax ?? 0.5)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiWeightMax: Number(event.target.value || 0.01) } : current,
                          );
                        }}
                      />
                      <Input
                        label="Teto de tokens da triagem"
                        type="number"
                        min="200"
                        max="32768"
                        step="100"
                        value={String(form.aiAssignmentMaxOutputTokens ?? 1200)}
                        onChange={(event) => {
                          markDirty();
                          setForm((current) =>
                            current ? { ...current, aiAssignmentMaxOutputTokens: Number(event.target.value || 200) } : current,
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface-light px-4 py-3 text-sm text-muted-foreground">
                <p className="text-xs uppercase tracking-wide text-muted">Cliente vinculado</p>
                <p className="mt-1 text-foreground">{clientName ?? "Global"}</p>
                <p className="mt-1 text-xs text-muted">
                  O escopo cliente/global nao pode ser alterado por este endpoint.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => {
                    markDirty();
                    setForm((current) =>
                      current ? { ...current, isActive: event.target.checked } : current,
                    );
                  }}
                  className="rounded border-border bg-surface-light"
                />
                Ativo
              </label>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Button
                  onClick={() => void handleSave()}
                  loading={updateDepartment.isPending}
                  disabled={!valid}
                >
                  Salvar alterações
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Zona de risco" subtitle="Ação irreversível." />
            <div className="space-y-4">
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-danger">Excluir departamento</p>
                <p className="mt-1 text-muted">
                  Os valores já preenchidos em chamados permanecem, mas o departamento deixa de
                  existir para novos fluxos.
                </p>
              </div>

              <Button
                variant="danger"
                onClick={() => void handleDelete()}
                loading={deleteDepartment.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Excluir departamento
              </Button>
            </div>
          </Card>
        </div>
      ) : tab === "fields" ? (
        <Card>
          <CardHeader
            title="Campos customizados"
            subtitle="Defina quais campos aparecem na abertura de chamados deste departamento."
          />
          <DepartmentCustomFieldsSection departmentId={department.id} clientId={department.clientId} />
        </Card>
      ) : (
        <div className="grid gap-6">
          <DepartmentMembersCard departmentId={department.id} />
          <DepartmentAssignmentTeamCard departmentId={department.id} />
          <DepartmentLearningCard departmentId={department.id} />
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Excluir departamento"
        message={
          <>
            Tem certeza que deseja excluir o departamento{' '}
            <span className="font-semibold text-foreground">{department.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => void confirmDeleteDepartment()}
        onClose={() => setConfirmDeleteOpen(false)}
        isLoading={deleteDepartment.isPending}
      />
    </div>
  );
}
/**
 * Métricas da equipe usadas pela triagem por IA, com edição do perfil de cada
 * atendente (competências, teto de chamados, peso e opt-out).
 */
function DepartmentAssignmentTeamCard({ departmentId }: { departmentId: string }) {
  const metrics = useDepartmentTeamMetrics(departmentId);
  const refresh = useRefreshDepartmentTeamMetrics(departmentId);

  const rows = metrics.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Métricas da equipe (triagem por IA)"
        subtitle="Histórico considerado pela IA: carga, tempo de resolução, SLA, CSAT e reincidência."
      />
      <div className="space-y-3">
        {metrics.isLoading && <Loading />}
        {metrics.isError && (
          <p className="text-sm text-danger">Não foi possível carregar as métricas da equipe.</p>
        )}
        {!metrics.isLoading && !metrics.isError && rows.length === 0 && (
          <p className="text-sm text-muted">Nenhum membro cadastrado neste departamento.</p>
        )}
        {rows.map((member) => (
          <MemberProfileRow key={member.userId} member={member} />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Os snapshots são recalculados automaticamente a cada 15 minutos e sob demanda
            quando vencidos.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: () => toast.success("Métricas recalculadas."),
                onError: (error) =>
                  toast.error(
                    error instanceof Error && error.message
                      ? `Erro ao recalcular as métricas: ${error.message}`
                      : "Erro ao recalcular as métricas.",
                  ),
              })
            }
          >
            Recalcular métricas
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function MemberProfileRow({ member }: { member: DepartmentMemberProfileDto }) {
  const updateProfile = useUpdateDepartmentMemberProfile(member.departmentId);
  const [tags, setTags] = useState(member.skillTags.join(", "));
  const [level, setLevel] = useState(String(member.skillLevel));
  const [maxOpen, setMaxOpen] = useState(
    member.maxOpenTickets == null ? "" : String(member.maxOpenTickets),
  );
  const [weight, setWeight] = useState(String(member.weight));
  const [accepts, setAccepts] = useState(member.acceptsAiAssignment);

  const m = member.metrics;

  function handleSave() {
    const trimmedMax = maxOpen.trim();
    const payload: UpdateDepartmentMemberProfileRequest = {
      skillTags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      skillLevel: Number(level || 3),
      weight: Number(weight || 1),
      acceptsAiAssignment: accepts,
      clearMaxOpenTickets: trimmedMax === "",
      maxOpenTickets: trimmedMax === "" ? null : Number(trimmedMax),
    };

    updateProfile.mutate(
      { userId: member.userId, data: payload },
      {
        onSuccess: () => toast.success("Perfil do atendente atualizado."),
        onError: () => toast.error("Erro ao atualizar o perfil do atendente."),
      },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-light p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {member.userName ?? member.userId}
        </span>
        <div className="flex items-center gap-2">
          {!member.isActive && <Badge color="slate">inativo</Badge>}
          {!member.acceptsAiAssignment && <Badge color="warning">fora da IA</Badge>}
        </div>
      </div>

      {m && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
          <span>
            Abertos: <strong className="text-foreground">{m.openNow}</strong>
          </span>
          <span>
            Resolução: <strong className="text-foreground">{formatMinutes(m.avgResolutionMinutes)}</strong>
          </span>
          <span>
            1ª resposta: <strong className="text-foreground">{formatMinutes(m.avgFirstResponseMinutes)}</strong>
          </span>
          <span>
            CSAT: <strong className="text-foreground">{formatDecimal(m.csatAverage)}</strong>
          </span>
          <span>
            SLA violado: <strong className="text-foreground">{formatPercent(m.slaBreachRate)}</strong>
          </span>
          <span>
            Reabertura: <strong className="text-foreground">{formatPercent(m.reopenRate)}</strong>
          </span>
          <span>
            Resolvidos: <strong className="text-foreground">{m.resolvedTotal}</strong>
          </span>
          <span>
            Top categorias: <strong className="text-foreground">{m.topCategories.slice(0, 2).join(", ") || "—"}</strong>
          </span>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Input
          label="Competências (vírgula)"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="rede, impressora, erp"
        />
        <Input
          label="Nível (1-5)"
          type="number"
          min="1"
          max="5"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        />
        <Input
          label="Teto de abertos"
          type="number"
          min="0"
          value={maxOpen}
          onChange={(event) => setMaxOpen(event.target.value)}
          placeholder="sem teto"
        />
        <Input
          label="Peso (0,1-3)"
          type="number"
          min="0.1"
          max="3"
          step="0.1"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={accepts}
            onChange={(event) => setAccepts(event.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Aceita ser escolhido automaticamente pela IA
        </label>
        <Button size="sm" loading={updateProfile.isPending} onClick={handleSave}>
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
/**
 * Sugestões do aprendizado híbrido: competências derivadas do histórico e pesos
 * propostos a partir das trocas manuais. Em modo Sugerir, aplica/descarta por item;
 * em modo Automático o backend já aplicou e a lista fica vazia.
 */
export function DepartmentLearningCard({ departmentId }: { departmentId: string }) {
  const suggestions = useDepartmentLearningSuggestions(departmentId);
  const runCycle = useRunLearningCycle(departmentId);
  const applySkill = useApplySkillSuggestion(departmentId);
  const discardSkill = useDiscardSkillSuggestion(departmentId);
  const applyWeight = useApplyWeightSuggestion(departmentId);
  const discardWeight = useDiscardWeightSuggestion(departmentId);

  const skills = suggestions.data?.skills ?? [];
  const weights = suggestions.data?.weights ?? [];
  const pending = skills.length + weights.length;

  return (
    <Card>
      <CardHeader
        title="Sugestões da IA (aprendizado)"
        subtitle="Competências extraídas dos chamados resolvidos e pesos propostos a partir das trocas manuais."
      />
      <div className="space-y-3">
        {suggestions.isLoading && <Loading />}
        {suggestions.isError && (
          <p className="text-sm text-danger">Não foi possível carregar as sugestões.</p>
        )}
        {!suggestions.isLoading && !suggestions.isError && pending === 0 && (
          <p className="text-sm text-muted">
            Nenhuma sugestão pendente. Rode um ciclo para avaliar o histórico atual.
          </p>
        )}

        {skills.map((suggestion) => (
          <div key={suggestion.id} className="rounded-xl border border-border bg-surface-light p-3">
            <p className="text-sm font-medium text-foreground">
              {suggestion.userName ?? suggestion.userId}
            </p>
            <p className="mt-1 text-xs text-muted">
              Competências sugeridas ({suggestion.windowDays} dias): {suggestion.suggestedTags.join(", ")}
            </p>
            <p className="mt-1 text-[11px] text-muted">{describeEvidence(suggestion.evidenceJson)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={applySkill.isPending}
                onClick={() =>
                  applySkill.mutate(suggestion.id, {
                    onSuccess: () => toast.success("Competências aplicadas ao perfil."),
                    onError: () => toast.error("Erro ao aplicar as competências."),
                  })
                }
              >
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={discardSkill.isPending}
                onClick={() =>
                  discardSkill.mutate(suggestion.id, {
                    onSuccess: () => toast.success("Sugestão descartada."),
                    onError: () => toast.error("Erro ao descartar a sugestão."),
                  })
                }
              >
                Descartar
              </Button>
            </div>
          </div>
        ))}

        {weights.map((suggestion) => (
          <div key={suggestion.id} className="rounded-xl border border-border bg-surface-light p-3">
            <p className="text-sm font-medium text-foreground">
              Pesos sugeridos (ciclo de {suggestion.cycleDays} dias)
            </p>
            <p className="mt-1 text-xs text-muted line-through">
              {describeWeights(suggestion.currentWeights)}
            </p>
            <p className="mt-1 text-xs text-foreground">
              {describeWeights(suggestion.suggestedWeights)}
            </p>
            <p className="mt-1 text-[11px] text-muted">{describeEvidence(suggestion.evidenceJson)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={applyWeight.isPending}
                onClick={() =>
                  applyWeight.mutate(suggestion.id, {
                    onSuccess: () => toast.success("Pesos aplicados ao departamento."),
                    onError: () => toast.error("Erro ao aplicar os pesos."),
                  })
                }
              >
                Aplicar pesos
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={discardWeight.isPending}
                onClick={() =>
                  discardWeight.mutate(suggestion.id, {
                    onSuccess: () => toast.success("Sugestão descartada."),
                    onError: () => toast.error("Erro ao descartar a sugestão."),
                  })
                }
              >
                Descartar
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            O ciclo roda automaticamente uma vez por dia para departamentos com aprendizado ligado.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={runCycle.isPending}
            onClick={() =>
              runCycle.mutate(undefined, {
                onSuccess: (result) =>
                  toast.success(
                    result.created > 0
                      ? result.created + " sugestão(ões) gerada(s)."
                      : "Nenhuma sugestão nova neste ciclo.",
                  ),
                onError: () => toast.error("Erro ao rodar o ciclo de aprendizado."),
              })
            }
          >
            Rodar ciclo agora
          </Button>
        </div>
      </div>
    </Card>
  );
}

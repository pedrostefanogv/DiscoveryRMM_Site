import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DepartmentCustomFieldsSection } from "@/components/configuration/DepartmentCustomFieldsSection";
import { InheritableFieldToggle } from "@/components/configuration/InheritableFieldToggle";
import { Icon,
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
  useDepartmentEffective,
  useDepartmentLearningSuggestions,
  useDepartmentTeamMetrics,
  useDiscardSkillSuggestion,
  useDiscardWeightSuggestion,
  useGlobalDepartments,
  useRefreshDepartmentTeamMetrics,
  useRunLearningCycle,
  useUpdateDepartment,
  useUpdateDepartmentMemberProfile,
} from "@/hooks/useDepartments";
import {
  buildDepartmentUpdatePayload,
  buildInheritanceOptions,
  normalizeDepartmentEffective,
  parseDepartmentValidationErrors,
} from "@/api";
import type {
  AiAssignmentWeights,
  Department,
  DepartmentEffectiveView,
  DepartmentFieldOrigin,
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

// ── Herança do departamento global ────────────────────────────────────────

const ORIGIN_LABELS: Record<DepartmentFieldOrigin, string> = {
  own: "definido aqui",
  "inherited-global": "herdado",
  default: "padrão",
};

/**
 * Selo de origem de um valor na configuração de triagem.
 *
 * Só é renderizado quando a API devolve a origem
 * (GET /api/v1/departments/{id}/effective). Sem esse endpoint a tela continua
 * funcionando como antes, sem selos.
 */
export function InheritedOriginBadge({
  origin,
  inheritedFrom,
}: {
  origin?: DepartmentFieldOrigin;
  inheritedFrom?: string | null;
}) {
  if (!origin) return null;

  if (origin === "inherited-global") {
    return (
      <Badge color="accent">herdado de {inheritedFrom || "departamento global"}</Badge>
    );
  }

  return (
    <Badge color={origin === "own" ? "primary" : "slate"}>{ORIGIN_LABELS[origin]}</Badge>
  );
}

/**
 * Avisos de herança devolvidos pelo backend (ciclo, auto-herança, pai inativo,
 * pai de outro escopo) e erros de validação do save (422/400).
 */
export function DepartmentInheritanceAlerts({
  messages,
}: {
  messages: string[];
}) {
  if (messages.length === 0) return null;

  return (
    <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-warning">
        <Icon name="warning" className="h-4 w-4" />
        Herança do departamento
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

type TriageFieldKey =
  | "aiAssignmentMode"
  | "aiAssignmentMinConfidence"
  | "aiAssignmentFallbackStrategy"
  | "aiAssignmentMaxCandidates"
  | "aiAssignmentInstructions"
  | "aiAssignmentUseAffinity"
  | "aiAssignmentMaxOutputTokens"
  | "aiSkillLearningMode"
  | "aiSkillMinEvidence"
  | "aiSkillMaxTags"
  | "aiWeightLearningMode"
  | "aiWeightMaxDeltaPerCycle"
  | "aiWeightCycleDays"
  | "aiWeightMin"
  | "aiWeightMax";

interface TriageFieldDef {
  key: TriageFieldKey;
  label: string;
  kind: "select" | "number" | "boolean" | "text";
  /**
   * Tipo gravado no payload. Selects usam o value do <option> (string), mas os
   * enums da API são numéricos — sem isso o JSON iria com "1" em vez de 1.
   */
  valueType?: "number" | "boolean" | "string";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  /** Valor exibido quando herdado e a API ainda não devolveu o efetivo. */
  defaultValue: string;
  group: "triage" | "learning";
}

const TRIAGE_FIELD_DEFS: TriageFieldDef[] = [
  {
    key: "aiAssignmentMode",
    label: "Como aplicar a decisão",
    kind: "select",
    valueType: "number",
    options: AI_MODE_OPTIONS,
    defaultValue: "0",
    group: "triage",
  },
  {
    key: "aiAssignmentFallbackStrategy",
    label: "Fallback quando a IA não decide",
    kind: "select",
    valueType: "number",
    options: AI_FALLBACK_OPTIONS,
    defaultValue: "1",
    group: "triage",
  },
  {
    key: "aiAssignmentMinConfidence",
    label: "Confiança mínima (0 a 1)",
    kind: "number",
    min: 0,
    max: 1,
    step: "0.05",
    defaultValue: "0.6",
    group: "triage",
  },
  {
    key: "aiAssignmentMaxCandidates",
    label: "Máximo de candidatos",
    kind: "number",
    min: 1,
    max: 20,
    defaultValue: "8",
    group: "triage",
  },
  {
    key: "aiAssignmentUseAffinity",
    label: "Usar afinidade com chamados semelhantes já resolvidos",
    kind: "boolean",
    defaultValue: "true",
    group: "triage",
  },
  {
    key: "aiAssignmentMaxOutputTokens",
    label: "Teto de tokens da triagem",
    kind: "number",
    min: 200,
    max: 32768,
    step: "100",
    defaultValue: "1200",
    group: "triage",
  },
  {
    key: "aiAssignmentInstructions",
    label: "Orientações para a IA (opcional)",
    kind: "text",
    defaultValue: "",
    group: "triage",
  },
  {
    key: "aiSkillLearningMode",
    label: "Competências: modo",
    kind: "select",
    valueType: "number",
    options: LEARNING_MODE_OPTIONS,
    defaultValue: "1",
    group: "learning",
  },
  {
    key: "aiWeightLearningMode",
    label: "Pesos: modo",
    kind: "select",
    valueType: "number",
    options: LEARNING_MODE_OPTIONS,
    defaultValue: "1",
    group: "learning",
  },
  {
    key: "aiSkillMinEvidence",
    label: "Evidência mínima (chamados)",
    kind: "number",
    min: 1,
    max: 100,
    defaultValue: "3",
    group: "learning",
  },
  {
    key: "aiSkillMaxTags",
    label: "Máx. competências por atendente",
    kind: "number",
    min: 1,
    max: 30,
    defaultValue: "12",
    group: "learning",
  },
  {
    key: "aiWeightCycleDays",
    label: "Ciclo de calibração (dias)",
    kind: "number",
    min: 1,
    max: 90,
    defaultValue: "7",
    group: "learning",
  },
  {
    key: "aiWeightMaxDeltaPerCycle",
    label: "Ajuste máx. por ciclo",
    kind: "number",
    min: 0.01,
    max: 0.5,
    step: "0.01",
    defaultValue: "0.1",
    group: "learning",
  },
  {
    key: "aiWeightMin",
    label: "Peso mínimo",
    kind: "number",
    min: 0.01,
    max: 1,
    step: "0.01",
    defaultValue: "0.05",
    group: "learning",
  },
  {
    key: "aiWeightMax",
    label: "Peso máximo",
    kind: "number",
    min: 0.01,
    max: 1,
    step: "0.01",
    defaultValue: "0.5",
    group: "learning",
  },
];

const TRIAGE_FIELDS_BY_KEY = new Map(TRIAGE_FIELD_DEFS.map((def) => [def.key, def]));

/** Converte o valor cru da API/form em texto para o controle. */
function fieldText(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Converte o texto do controle de volta para o tipo gravado no payload. */
function fieldValueFromText(
  def: TriageFieldDef,
  text: string,
): number | boolean | string | null {
  const valueType = def.valueType ?? (def.kind === "text" ? "string" : def.kind);
  if (valueType === "number") {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : Number(def.defaultValue);
  }
  if (valueType === "boolean") return text === "true";
  return text.trim() ? text : null;
}

/**
 * Campo da configuração de triagem com herança: mostra a origem, bloqueia a
 * edição enquanto o valor vem do global e permite sobrescrever (ou voltar a
 * herdar, enviando null no update).
 */
export function TriageInheritableField({
  def,
  ownValue,
  effectiveValue,
  origin,
  inheritedFrom,
  canInherit,
  onChange,
  onInherit,
}: {
  def: TriageFieldDef;
  /** Valor próprio do departamento (null = herdando). */
  ownValue: unknown;
  /** Valor efetivo devolvido pela API (usado quando herdado). */
  effectiveValue?: unknown;
  origin?: DepartmentFieldOrigin;
  inheritedFrom?: string | null;
  canInherit: boolean;
  onChange: (value: number | boolean | string | null) => void;
  onInherit: () => void;
}) {
  const inherited = origin === "inherited-global";
  // Só "inherited-global" usa o valor efetivo. Origem "default" (sem override e
  // sem pai) é o valor-base do PRÓPRIO departamento — quando o form não tem o
  // valor (null), o efetivo da API manda, em vez do padrão de fábrica.
  const ownOrEffective = ownValue ?? (origin === "default" ? effectiveValue : ownValue);
  const text = fieldText(inherited ? effectiveValue : ownOrEffective, def.defaultValue);
  const disabled = inherited;
  const controlId = "triage-" + def.key;

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => onChange(fieldValueFromText(def, event.target.value));

  // Valor salvo/efetivo fora do catálogo (ex.: opção removida): mantém visível
  // para o admin perceber e corrigir — mesmo padrão do ConfigurationFieldEditor.
  const baseOptions = def.options ?? [];
  const selectOptions =
    !text || baseOptions.some((option) => option.value === text)
      ? baseOptions
      : [...baseOptions, { value: text, label: text + " (valor atual)" }];

  const control =
    def.kind === "select" ? (
      <Select
        id={controlId}
        value={text}
        options={selectOptions}
        disabled={disabled}
        onChange={(event) => onChange(fieldValueFromText(def, event.target.value))}
      />
    ) : def.kind === "boolean" ? (
      <Select
        id={controlId}
        value={text}
        options={[
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ]}
        disabled={disabled}
        onChange={(event) => onChange(fieldValueFromText(def, event.target.value))}
      />
    ) : def.kind === "number" ? (
      <Input
        id={controlId}
        type="number"
        min={def.min}
        max={def.max}
        step={def.step}
        value={text}
        disabled={disabled}
        onChange={handleChange}
      />
    ) : (
      <Input
        id={controlId}
        value={text}
        disabled={disabled}
        onChange={handleChange}
        placeholder="Ex.: priorize quem domina rede para chamados do cliente X"
      />
    );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label htmlFor={controlId} className="text-sm font-medium text-foreground">
          {def.label}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <InheritedOriginBadge origin={origin} inheritedFrom={inheritedFrom} />
          {canInherit && (
            <InheritableFieldToggle
              checked={inherited}
              onChange={(next) => {
                if (next) {
                  onInherit();
                  return;
                }
                // Sobrescrever: parte do valor efetivo exibido.
                onChange(fieldValueFromText(def, text));
              }}
            />
          )}
        </div>
      </div>
      <div className="mt-auto">{control}</div>
    </div>
  );
}

/**
 * Origem de um campo no GET /effective.
 *
 * O backend pode expor a chave com ou sem o sufixo `Override`
 * (ex.: `assignmentStrategy` ou `assignmentStrategyOverride`) — as duas são
 * aceitas para a tela não perder o selo nem o null de herança.
 */
function readEffectiveOrigin(
  effective: DepartmentEffectiveView | null,
  key: string,
): DepartmentFieldOrigin | undefined {
  return effective?.origins?.[key] ?? effective?.origins?.[`${key}Override`];
}

/**
 * A estratégia de auto-atribuição (`assignmentStrategy`) está herdada?
 *
 * O backend passou a herdar esse campo. Fonte preferencial: a origem no
 * /effective (campo com ou sem o sufixo Override). Reserva para quando o
 * endpoint ainda não está publicado (404): `assignmentStrategyOverride === null`
 * no próprio departamento, desde que exista herança configurada.
 */
export function isAssignmentStrategyInherited(
  department: Department,
  effective: DepartmentEffectiveView | null,
): boolean {
  const origin = readEffectiveOrigin(effective, "assignmentStrategy");
  if (origin) return origin === "inherited-global";

  return (
    department.assignmentStrategyOverride === null &&
    Boolean(department.inheritFromGlobalId)
  );
}

/**
 * Form inicial a partir do departamento + configuração efetiva.
 *
 * Só a origem "inherited-global" vira null (= herdar). A origem "default" NÃO é
 * herança: é o valor-base do próprio departamento quando não há pai utilizável —
 * tratá-la como null fazia a tela exibir o padrão de fábrica no lugar do valor
 * real (override null vs base, D11/B2).
 */
export function buildDepartmentForm(
  department: Department,
  effective: DepartmentEffectiveView | null,
): UpdateDepartmentRequest {
  const inheritedOrDefault = (key: string) =>
    readEffectiveOrigin(effective, key) === "inherited-global";

  const decor = <T,>(key: string, value: T | null | undefined, fallback: T): T | null =>
    inheritedOrDefault(key) ? null : value ?? fallback;

  return {
    name: department.name,
    description: department.description,
    inheritFromGlobalId: department.inheritFromGlobalId ?? null,
    sortOrder: department.sortOrder,
    isActive: department.isActive,
    // null = herdar a estratégia do global (o form mostra o valor efetivo).
    // O buildDepartmentUpdatePayload converte esse null em
    // `assignmentStrategyOverride: null` e omite o valor base (B3).
    assignmentStrategy: isAssignmentStrategyInherited(department, effective)
      ? null
      : department.assignmentStrategy ?? 0,
    aiAssignmentMode: decor("aiAssignmentMode", department.aiAssignmentMode, 0),
    aiAssignmentMinConfidence: decor(
      "aiAssignmentMinConfidence",
      department.aiAssignmentMinConfidence,
      0.6,
    ),
    aiAssignmentFallbackStrategy: decor(
      "aiAssignmentFallbackStrategy",
      department.aiAssignmentFallbackStrategy,
      1,
    ),
    aiAssignmentMaxCandidates: decor(
      "aiAssignmentMaxCandidates",
      department.aiAssignmentMaxCandidates,
      8,
    ),
    aiAssignmentWeightsJson: decor(
      "aiAssignmentWeightsJson",
      department.aiAssignmentWeightsJson,
      null as string | null,
    ),
    aiAssignmentInstructions: decor(
      "aiAssignmentInstructions",
      department.aiAssignmentInstructions,
      null as string | null,
    ),
    aiAssignmentUseAffinity: decor(
      "aiAssignmentUseAffinity",
      department.aiAssignmentUseAffinity,
      true,
    ),
    aiAssignmentMaxOutputTokens: decor(
      "aiAssignmentMaxOutputTokens",
      department.aiAssignmentMaxOutputTokens,
      1200,
    ),
    aiSkillLearningMode: decor("aiSkillLearningMode", department.aiSkillLearningMode, 1),
    aiSkillMinEvidence: decor("aiSkillMinEvidence", department.aiSkillMinEvidence, 3),
    aiSkillMaxTags: decor("aiSkillMaxTags", department.aiSkillMaxTags, 12),
    aiWeightLearningMode: decor("aiWeightLearningMode", department.aiWeightLearningMode, 1),
    aiWeightMaxDeltaPerCycle: decor(
      "aiWeightMaxDeltaPerCycle",
      department.aiWeightMaxDeltaPerCycle,
      0.1,
    ),
    aiWeightCycleDays: decor("aiWeightCycleDays", department.aiWeightCycleDays, 7),
    aiWeightMin: decor("aiWeightMin", department.aiWeightMin, 0.05),
    aiWeightMax: decor("aiWeightMax", department.aiWeightMax, 0.5),
  };
}

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

/**
 * Membro efetivo herdado do departamento global pai.
 *
 * O /effective devolve `origin: "inherited-global"`; o team-metrics devolve
 * `origin: "inherited:<departmentId>"`. Ambos contam como herdados.
 */
export function isInheritedMember(
  member: { inherited?: boolean; origin?: string | null } | undefined,
): boolean {
  if (!member) return false;
  return (
    member.inherited === true ||
    member.origin === "inherited-global" ||
    Boolean(member.origin?.startsWith("inherited:"))
  );
}

function DepartmentMembersCard({
  departmentId,
  inheritedFrom,
}: {
  departmentId: string;
  /** Nome do global pai, para o selo "herdado de ...". */
  inheritedFrom?: string | null;
}) {
  const members = useDepartmentMembers(departmentId);
  const effectiveQuery = useDepartmentEffective(departmentId);
  const add = useAddDepartmentMember();
  const remove = useRemoveDepartmentMember();
  const users = useIamUsers();
  const [userId, setUserId] = useState("");

  const effective = useMemo(
    () => normalizeDepartmentEffective(effectiveQuery.data),
    [effectiveQuery.data],
  );

  const ownMembers = members.data ?? [];
  const ownIds = new Set(ownMembers.map((m) => m.userId));
  const effectiveById = useMemo(
    () => new Map((effective?.team ?? []).map((member) => [member.userId, member])),
    [effective],
  );
  // Membros efetivos marcados como herdados e que NÃO estão na equipe própria.
  const inheritedMembers = (effective?.team ?? []).filter(
    (member) => isInheritedMember(member) && !ownIds.has(member.userId),
  );
  const inheritedIds = new Set(inheritedMembers.map((member) => member.userId));

  const options = [
    { value: "", label: "Selecione um usuário..." },
    ...(users.data ?? [])
      .filter((u) => !ownIds.has(u.id) && !inheritedIds.has(u.id))
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
        {ownMembers.map((m) => {
          const inherited = isInheritedMember(effectiveById.get(m.userId));

          return (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{m.userName ?? m.userId}</span>
                {inherited && <InheritedOriginBadge origin="inherited-global" inheritedFrom={inheritedFrom} />}
              </div>
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
                <Icon name="delete" className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        {inheritedMembers.map((member) => (
          <div
            key={"inherited-" + member.userId}
            className="flex items-center justify-between rounded-lg border border-dashed border-accent/40 bg-accent/5 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">{member.userName ?? member.userId}</span>
              <InheritedOriginBadge
                origin="inherited-global"
                inheritedFrom={member.sourceDepartmentName ?? inheritedFrom}
              />
              {member.isActive === false && <Badge color="slate">inativo</Badge>}
            </div>
            <span className="text-xs text-muted">gerenciado no global</span>
          </div>
        ))}

        {ownMembers.length === 0 && inheritedMembers.length === 0 && !members.isLoading && (
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
  const globalsQuery = useGlobalDepartments();
  const effectiveQuery = useDepartmentEffective(departmentId);

  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [tab, setTab] = useState<DepartmentTab>("general");
  const [form, setForm] = useState<UpdateDepartmentRequest | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  /** Erros de validação do último save (422/400), exibidos no formulário. */
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
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

  const effective = useMemo(
    () => normalizeDepartmentEffective(effectiveQuery.data),
    [effectiveQuery.data],
  );

  // Re-semeia quando o departamento muda ou quando a config efetiva chega
  // (a origem por campo só existe depois do GET /effective). Edições pendentes
  // do usuário nunca são sobrescritas.
  useEffect(() => {
    if (!departmentQuery.data) return;

    const entityChanged = seededDepartmentIdRef.current !== departmentQuery.data.id;
    if (!entityChanged && dirtyRef.current) return;

    setForm(buildDepartmentForm(departmentQuery.data, effective));
    seededDepartmentIdRef.current = departmentQuery.data.id;
    if (entityChanged) dirtyRef.current = false;
  }, [departmentQuery.data, effective]);

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

  // Departamento global não herda de ninguém (só é herdado).
  const isGlobalScope = !department.clientId;
  const canInherit = !isGlobalScope;
  const origins = effective?.origins ?? {};
  const effectiveConfig = effective?.config ?? {};
  const globals = globalsQuery.data ?? [];
  const inheritanceOptions = buildInheritanceOptions(globals, department.id);
  const parentGlobal = globals.find((global) => global.id === form.inheritFromGlobalId) ?? null;
  const inheritedFromName =
    parentGlobal?.name ??
    department.inheritFromGlobalName ??
    effective?.parentName ??
    (form.inheritFromGlobalId ? "departamento global" : null);

  // Avisos do backend (ciclo/auto-herança/pai inativo/escopo) + erros de save.
  const inheritanceAlerts = Array.from(
    new Set([
      ...(effective?.warnings ?? []),
      ...(department.inheritanceWarnings ?? []),
      ...saveErrors,
    ]),
  ).filter(Boolean);

  const fieldOrigin = (key: string): DepartmentFieldOrigin | undefined => origins[key];

  /** Atualiza um campo de override (null = voltar a herdar do global). */
  const setOverride = (
    key: keyof UpdateDepartmentRequest,
    value: number | boolean | string | null,
  ) => {
    markDirty();
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const ownStrategy = form.assignmentStrategy ?? 0;
  const strategyOrigin = origins.assignmentStrategy ?? origins.assignmentStrategyOverride;
  // A fonte da verdade é o FORM (`null` = herdar), semeado pelo
  // buildDepartmentForm e atualizado pelo toggle "Herdar": derivar só da origem
  // do /effective deixava o toggle/select dessincronizados até o refetch.
  // Departamento global nunca herda, então nunca fica travado.
  const strategyInherited =
    canInherit && (form.assignmentStrategy === null || form.assignmentStrategy === undefined);
  const effectiveStrategy = strategyInherited
    ? Number(effectiveConfig.assignmentStrategy ?? 0) || 0
    : ownStrategy;
  // Selo coerente com o que o formulário vai salvar: herdado mostra "herdado
  // de ..." e, ao desmarcar "Herdar", passa a "definido aqui" na hora.
  const strategyBadgeOrigin: DepartmentFieldOrigin | undefined = strategyInherited
    ? "inherited-global"
    : strategyOrigin === "inherited-global"
      ? "own"
      : strategyOrigin;

  const weightsInherited =
    (origins.aiAssignmentWeightsJson ?? origins.aiAssignmentWeightsJsonOverride) ===
    "inherited-global";
  const weights = parseWeights(
    weightsInherited
      ? fieldText(effectiveConfig.aiAssignmentWeightsJson, "")
      : form.aiAssignmentWeightsJson,
  );

  const valid = form.name.trim().length >= 2;

  async function handleSave() {
    const currentForm = form;
    if (!currentForm) return;

    if (!valid) {
      toast.error("Informe um nome com ao menos 2 caracteres.");
      return;
    }

    try {
      // buildDepartmentUpdatePayload mantém null explícito nos campos de
      // herança/override (ausente ≠ null no patch semântico do backend).
      await updateDepartment.mutateAsync({
        id: department.id,
        data: buildDepartmentUpdatePayload(currentForm),
      });
      setSaveErrors([]);
      dirtyRef.current = false;
      toast.success("Departamento atualizado com sucesso.");
      void departmentQuery.refetch();
      void effectiveQuery.refetch();
    } catch (error) {
      // 422 (e o 400 legado) traz a mensagem de validação da herança.
      const validation = parseDepartmentValidationErrors(error);
      setSaveErrors(validation.messages);
      toast.error(validation.messages[0] ?? "Erro ao atualizar departamento.");
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
        breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      >
        <Button variant="ghost" onClick={() => navigate("/tickets/departments")}>
          <Icon name="arrow_back" className="h-4 w-4" />
          Voltar para listagem
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={department.clientId ? "apartment" : "public"}
          label="Escopo"
          value={clientName ?? "Global"}
          tone={department.clientId ? "accent" : "primary"}
        />
        <StatCard
          icon="apartment"
          label="Ordem"
          value={`#${department.sortOrder}`}
          tone="warning"
        />
        <StatCard
          icon="settings"
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
          <Icon name="settings" className="mr-1.5 inline h-4 w-4" />
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
          <Icon name="fact_check" className="mr-1.5 inline h-4 w-4" />
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
          <Icon name="group" className="mr-1.5 inline h-4 w-4" />
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

              <div className="space-y-3 rounded-xl border border-border bg-surface-light px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Herança do departamento global</p>
                  <p className="mt-1 text-xs text-muted">
                    {isGlobalScope
                      ? "Departamento global não herda de outro departamento — ele é a origem da herança."
                      : "Ao herdar, a equipe do global é somada à sua e os campos de triagem não definidos aqui passam a vir do global."}
                  </p>
                </div>

                <Select
                  label="Herdar de"
                  options={inheritanceOptions}
                  value={form.inheritFromGlobalId ?? ""}
                  disabled={isGlobalScope || globalsQuery.isLoading}
                  hint={
                    isGlobalScope
                      ? "Somente departamentos de cliente podem herdar."
                      : "Apenas departamentos globais aparecem nesta lista. Globais inativos ficam marcados como (inativo) e não podem ser escolhidos. \"Nenhum\" desfaz a herança."
                  }
                  onChange={(event) => {
                    markDirty();
                    setSaveErrors([]);
                    setForm((current) =>
                      current
                        ? { ...current, inheritFromGlobalId: event.target.value || null }
                        : current,
                    );
                  }}
                />

                {globalsQuery.isError && !isGlobalScope && (
                  <p className="text-xs text-warning">
                    Não foi possível carregar os departamentos globais. Recarregue a página para
                    editar a herança.
                  </p>
                )}

                {inheritedFromName && !isGlobalScope && (
                  <p className="text-xs text-muted">
                    Herdando de <span className="text-foreground">{inheritedFromName}</span>.
                  </p>
                )}

                <DepartmentInheritanceAlerts messages={inheritanceAlerts} />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Auto-atribuição de chamados
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <InheritedOriginBadge
                      origin={strategyBadgeOrigin}
                      inheritedFrom={inheritedFromName}
                    />
                    {canInherit && (
                      <InheritableFieldToggle
                        checked={strategyInherited}
                        onChange={(next) => {
                          if (next) {
                            setOverride("assignmentStrategy", null);
                            return;
                          }
                          setOverride("assignmentStrategy", effectiveStrategy);
                        }}
                      />
                    )}
                  </div>
                </div>
                <Select
                  label="Estratégia"
                  options={ASSIGNMENT_OPTIONS}
                  value={String(effectiveStrategy)}
                  disabled={strategyInherited}
                  hint={
                    strategyInherited
                      ? 'Valor herdado do departamento global. Desmarque "Herdar" para definir aqui.'
                      : 'Aplicada aos chamados novos deste departamento.'
                  }
                  onChange={(event) => {
                    markDirty();
                    setForm((current) =>
                      current ? { ...current, assignmentStrategy: Number(event.target.value) } : current,
                    );
                  }}
                />
              </div>

              {effectiveStrategy === 3 && (
                <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Triagem por IA</p>
                    <p className="mt-1 text-xs text-muted">
                      A IA escolhe o responsável cruzando o conteúdo e a dificuldade do
                      chamado com métricas, afinidade e competências dos membros da equipe.
                      Exige a integração de IA habilitada nas configurações do servidor.
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Os campos com "Herdar" marcado vêm do departamento global. Desmarque para
                      sobrescrever aqui; marque de novo para voltar a herdar.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {TRIAGE_FIELD_DEFS.filter(
                      (def) => def.group === "triage" && def.key !== "aiAssignmentInstructions",
                    ).map((def) => (
                      <TriageInheritableField
                        key={def.key}
                        def={def}
                        ownValue={form[def.key]}
                        effectiveValue={effectiveConfig[def.key]}
                        origin={fieldOrigin(def.key)}
                        inheritedFrom={inheritedFromName}
                        canInherit={canInherit}
                        onChange={(value) => setOverride(def.key, value)}
                        onInherit={() => setOverride(def.key, null)}
                      />
                    ))}
                  </div>

                  <TriageInheritableField
                    def={TRIAGE_FIELDS_BY_KEY.get("aiAssignmentInstructions")!}
                    ownValue={form.aiAssignmentInstructions}
                    effectiveValue={effectiveConfig.aiAssignmentInstructions}
                    origin={fieldOrigin("aiAssignmentInstructions")}
                    inheritedFrom={inheritedFromName}
                    canInherit={canInherit}
                    onChange={(value) => setOverride("aiAssignmentInstructions", value)}
                    onInherit={() => setOverride("aiAssignmentInstructions", null)}
                  />

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-muted">Pesos do score</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <InheritedOriginBadge
                          origin={fieldOrigin("aiAssignmentWeightsJson")}
                          inheritedFrom={inheritedFromName}
                        />
                        {canInherit && (
                          <InheritableFieldToggle
                            checked={weightsInherited}
                            onChange={(next) => {
                              if (next) {
                                setOverride("aiAssignmentWeightsJson", null);
                                return;
                              }
                              // Sobrescrever a partir dos pesos efetivos exibidos.
                              setOverride("aiAssignmentWeightsJson", JSON.stringify(weights));
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {WEIGHT_FIELDS.map((field) => (
                        <Input
                          key={field.key}
                          label={field.label}
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={String(weights[field.key])}
                          disabled={weightsInherited}
                          onChange={(event) => {
                            const next = {
                              ...weights,
                              [field.key]: Number(event.target.value || 0),
                            };
                            setOverride("aiAssignmentWeightsJson", JSON.stringify(next));
                          }}
                        />
                      ))}
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      {TRIAGE_FIELD_DEFS.filter((def) => def.group === "learning").map((def) => (
                        <TriageInheritableField
                          key={def.key}
                          def={def}
                          ownValue={form[def.key]}
                          effectiveValue={effectiveConfig[def.key]}
                          origin={fieldOrigin(def.key)}
                          inheritedFrom={inheritedFromName}
                          canInherit={canInherit}
                          onChange={(value) => setOverride(def.key, value)}
                          onInherit={() => setOverride(def.key, null)}
                        />
                      ))}
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
                <Icon name="delete" className="h-4 w-4" />
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
          <DepartmentMembersCard
            departmentId={department.id}
            inheritedFrom={inheritedFromName ?? undefined}
          />
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
  // B2 — membro herdado é gerenciado no global pai. A lista mostra o perfil
  // (para a IA e para o gestor enxergarem a equipe efetiva), mas a edição fica
  // bloqueada aqui; o backend responde 422 se alguém tentar mesmo assim.
  const inherited = isInheritedMember(member);
  const [tags, setTags] = useState(member.skillTags.join(", "));
  const [level, setLevel] = useState(String(member.skillLevel));
  const [maxOpen, setMaxOpen] = useState(
    member.maxOpenTickets == null ? "" : String(member.maxOpenTickets),
  );
  const [weight, setWeight] = useState(String(member.weight));
  const [accepts, setAccepts] = useState(member.acceptsAiAssignment);

  const m = member.metrics;

  function handleSave() {
    if (inherited) return;
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
        onError: (error) => {
          // 422 do membro herdado vem com a mensagem explicando que o perfil é
          // gerenciado no global; mostra essa mensagem em vez de um erro genérico.
          const validation = parseDepartmentValidationErrors(
            error,
            "Erro ao atualizar o perfil do atendente.",
          );
          toast.error(validation.messages[0] ?? "Erro ao atualizar o perfil do atendente.");
        },
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
          {inherited && <Badge color="accent">herdado do global</Badge>}
          {!member.isActive && <Badge color="slate">inativo</Badge>}
          {!member.acceptsAiAssignment && <Badge color="warning">fora da IA</Badge>}
        </div>
      </div>

      {inherited && (
        <p className="mt-1 text-xs text-muted">
          Perfil gerenciado no departamento global: edite lá para alterar competências,
          teto, peso ou opt-out deste atendente.
        </p>
      )}

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
          disabled={inherited}
          onChange={(event) => setTags(event.target.value)}
          placeholder="rede, impressora, erp"
        />
        <Input
          label="Nível (1-5)"
          type="number"
          min="1"
          max="5"
          value={level}
          disabled={inherited}
          onChange={(event) => setLevel(event.target.value)}
        />
        <Input
          label="Teto de abertos"
          type="number"
          min="0"
          value={maxOpen}
          disabled={inherited}
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
          disabled={inherited}
          onChange={(event) => setWeight(event.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={accepts}
            disabled={inherited}
            onChange={(event) => setAccepts(event.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Aceita ser escolhido automaticamente pela IA
        </label>
        <Button
          size="sm"
          loading={updateProfile.isPending}
          disabled={inherited}
          onClick={handleSave}
        >
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

import { ApiError, api } from "./client";
import type {
  CursorPageDto,
  Department,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  DepartmentEffectiveDto,
  DepartmentEffectiveMemberDto,
  DepartmentEffectiveOrigin,
  DepartmentMemberProfileDto,
  UpdateDepartmentMemberProfileRequest,
  DepartmentLearningSuggestionsDto,
  TechnicianSkillSuggestionDto,
  AiWeightSuggestionDto,
} from "./types";

const BASE = "/api/v1/departments";

/**
 * Origem de um valor na configuração efetiva do departamento.
 * (Alias exportado para a tela não depender do nome do DTO.)
 */
export type DepartmentFieldOrigin = DepartmentEffectiveOrigin;

/** Endpoint ainda não publicado pelo backend (404/405/501). */
export function isMissingEndpointError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 405 || error.status === 501)
  );
}

/** A API pode devolver lista simples ou página por cursor. */
export function normalizeDepartmentList(
  data: CursorPageDto<Department> | Department[] | null | undefined,
): Department[] {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}

/** Apenas departamentos globais (ClientId ausente ou nulo). */
export function filterGlobalDepartments(departments: Department[]): Department[] {
  return departments.filter((department) => !department.clientId);
}

/** Campos de override que aceitam null (= herdar do departamento global pai). */
export const DEPARTMENT_OVERRIDE_FIELDS = [
  "aiAssignmentMode",
  "aiAssignmentMinConfidence",
  "aiAssignmentFallbackStrategy",
  "aiAssignmentMaxCandidates",
  "aiAssignmentWeightsJson",
  "aiAssignmentInstructions",
  "aiAssignmentUseAffinity",
  "aiAssignmentMaxOutputTokens",
  "aiSkillLearningMode",
  "aiSkillMinEvidence",
  "aiSkillMaxTags",
  "aiWeightLearningMode",
  "aiWeightMaxDeltaPerCycle",
  "aiWeightCycleDays",
  "aiWeightMin",
  "aiWeightMax",
] as const;

const ORIGIN_ALIASES: Record<string, DepartmentFieldOrigin> = {
  own: "own",
  proprio: "own",
  "próprio": "own",
  local: "own",
  department: "own",
  departamento: "own",
  "inherited-global": "inherited-global",
  inherited: "inherited-global",
  "inherited-from-global": "inherited-global",
  global: "inherited-global",
  herdado: "inherited-global",
  "herdado-global": "inherited-global",
  inherit: "inherited-global",
  default: "default",
  padrao: "default",
  "padrão": "default",
  system: "default",
};

/**
 * Normaliza a origem devolvida pela API. Aceita string ("own",
 * "inherited-global", "default", variações em pt-BR) ou enum numérico
 * (0=default, 1=own, 2=inherited-global). Devolve undefined quando não
 * reconhece — a tela então simplesmente não mostra o selo, em vez de mostrar
 * uma origem errada.
 */
export function normalizeDepartmentOrigin(
  raw: unknown,
): DepartmentFieldOrigin | undefined {
  if (raw === null || raw === undefined) return undefined;

  if (typeof raw === "number") {
    if (raw === 0) return "default";
    if (raw === 1) return "own";
    if (raw === 2) return "inherited-global";
    return undefined;
  }

  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  return ORIGIN_ALIASES[key];
}

/** Configuração efetiva já normalizada para uso na tela. */
export interface DepartmentEffectiveView {
  departmentId: string | null;
  parentId: string | null;
  parentName: string | null;
  config: Record<string, unknown>;
  origins: Record<string, DepartmentFieldOrigin>;
  team: DepartmentEffectiveMemberDto[];
  warnings: string[];
  resolvedAt: string | null;
}

function readAlias(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

/**
 * Normaliza o payload de GET /departments/{id}/effective de forma defensiva:
 * os nomes dos campos ainda não estão congelados no backend. Devolve null
 * quando não há payload (endpoint ausente/404).
 */
export function normalizeDepartmentEffective(
  raw: DepartmentEffectiveDto | null | undefined,
): DepartmentEffectiveView | null {
  if (!raw) return null;

  const source = raw as Record<string, unknown>;
  const configRaw = readAlias(source, ["config", "effectiveConfig", "values", "resolved"]);
  const originsRaw = readAlias(source, ["origins", "fieldOrigins", "configOrigins"]);
  const teamRaw = readAlias(source, ["team", "members", "effectiveTeam", "teamMembers"]);
  const warningsRaw = readAlias(source, ["warnings", "inheritanceWarnings", "validationWarnings"]);

  const config: Record<string, unknown> =
    configRaw && typeof configRaw === "object" && !Array.isArray(configRaw)
      ? { ...(configRaw as Record<string, unknown>) }
      : {};

  const origins: Record<string, DepartmentFieldOrigin> = {};
  if (originsRaw && typeof originsRaw === "object" && !Array.isArray(originsRaw)) {
    for (const [key, value] of Object.entries(originsRaw as Record<string, unknown>)) {
      const origin = normalizeDepartmentOrigin(value);
      if (origin) origins[key] = origin;
    }
  }

  const team: DepartmentEffectiveMemberDto[] = Array.isArray(teamRaw)
    ? (teamRaw as Array<Record<string, unknown>>)
        .map(normalizeEffectiveMember)
        .filter((member): member is DepartmentEffectiveMemberDto => member !== null)
    : [];

  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  const parentId =
    typeof raw.inheritFromGlobalId === "string" && raw.inheritFromGlobalId.trim()
      ? raw.inheritFromGlobalId
      : null;
  const parentNameRaw = readAlias(source, [
    "inheritFromGlobalName",
    "globalDepartmentName",
    "parentName",
    "parentDepartmentName",
  ]);

  return {
    departmentId:
      typeof raw.departmentId === "string" && raw.departmentId.trim()
        ? raw.departmentId
        : null,
    parentId,
    parentName: typeof parentNameRaw === "string" && parentNameRaw.trim() ? parentNameRaw : null,
    config,
    origins,
    team,
    warnings,
    resolvedAt: typeof raw.resolvedAt === "string" ? raw.resolvedAt : null,
  };
}

function normalizeEffectiveMember(
  raw: Record<string, unknown>,
): DepartmentEffectiveMemberDto | null {
  const userId = raw.userId ?? raw.id;
  if (typeof userId !== "string" || !userId.trim()) return null;

  const origin = normalizeDepartmentOrigin(raw.origin ?? raw.source);
  const inherited =
    typeof raw.inherited === "boolean"
      ? raw.inherited
      : typeof raw.isInherited === "boolean"
        ? raw.isInherited
        : origin === "inherited-global";

  return {
    userId,
    userName: typeof raw.userName === "string" ? raw.userName : null,
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : undefined,
    inherited,
    sourceDepartmentId:
      typeof raw.sourceDepartmentId === "string" ? raw.sourceDepartmentId : null,
    sourceDepartmentName:
      typeof raw.sourceDepartmentName === "string" ? raw.sourceDepartmentName : null,
    origin,
  };
}

export interface DepartmentInheritanceOption {
  value: string;
  label: string;
}

/**
 * Opções do select "Herdar de": apenas departamentos GLOBAIS (ClientId nulo),
 * com "Nenhum" (null) para desfazer. Departamento global não herda — a tela
 * desabilita o select nesse caso.
 */
export function buildInheritanceOptions(
  globals: Department[] | undefined,
  currentDepartmentId?: string | null,
): DepartmentInheritanceOption[] {
  const seen = new Set<string>();
  const options = (globals ?? [])
    .filter((department) => !department.clientId)
    .filter((department) => {
      if (!department.id) return false;
      if (currentDepartmentId && department.id === currentDepartmentId) return false;
      if (seen.has(department.id)) return false;
      seen.add(department.id);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    .map((department) => ({ value: department.id, label: department.name }));

  return [{ value: "", label: "Nenhum (sem herança)" }, ...options];
}

/**
 * Monta o payload do PUT preservando null explícito nos campos de herança.
 *
 * O backend faz patch semântico: campo AUSENTE = "não mexe", `null` =
 * "desfaz herança / volta a herdar". Por isso os campos de override sempre
 * aparecem no JSON, mesmo quando nulos.
 */
export function buildDepartmentUpdatePayload(
  form: UpdateDepartmentRequest,
): UpdateDepartmentRequest {
  const payload: Record<string, unknown> = {
    ...form,
    name: form.name.trim(),
    description: form.description?.trim() || null,
    inheritFromGlobalId: form.inheritFromGlobalId ?? null,
    sortOrder: Math.max(0, Number(form.sortOrder || 0)),
    isActive: form.isActive ?? true,
  };

  // assignmentStrategy também aceita null (= herdar); só cai em 0 quando o
  // campo não foi informado.
  if (payload.assignmentStrategy === undefined) payload.assignmentStrategy = 0;

  // O backend expõe os overrides de herança como `${campo}Override` (Optional):
  // AUSENTE = "não mexe", null = "volta a herdar", valor = sobrescreve. Por isso
  // o payload envia o sufixo Override sempre presente; o campo base (valor
  // "próprio") não é enviado por este formulário.
  for (const field of DEPARTMENT_OVERRIDE_FIELDS) {
    const overrideKey = `${field}Override`;
    payload[overrideKey] = payload[field] === undefined ? null : payload[field];
    delete payload[field];
  }

  return payload as unknown as UpdateDepartmentRequest;
}

export interface DepartmentValidationErrors {
  status: number | null;
  messages: string[];
}

/** Erros de validação (422/400) prontos para exibição no formulário. */
export function parseDepartmentValidationErrors(
  error: unknown,
  fallback = "Erro ao atualizar departamento.",
): DepartmentValidationErrors {
  if (error instanceof ApiError) {
    const messages = error.message
      .split(/;\s*/)
      .map((message) => message.trim())
      .filter(Boolean);
    return { status: error.status, messages: messages.length > 0 ? messages : [fallback] };
  }

  if (error instanceof Error && error.message.trim()) {
    return { status: null, messages: [error.message.trim()] };
  }

  return { status: null, messages: [fallback] };
}

export const departmentsApi = {
  /**
   * Departamentos globais. O backend vai expor GET /departments/global; até
   * lá (404/405) cai para a listagem e filtra os globais no client.
   */
  listGlobal: async (): Promise<Department[]> => {
    try {
      const data = await api.get<CursorPageDto<Department> | Department[]>(BASE + "/global");
      return normalizeDepartmentList(data);
    } catch (error) {
      if (!isMissingEndpointError(error)) throw error;
      const data = await api.get<CursorPageDto<Department> | Department[]>(BASE, {
        includeGlobal: true,
      });
      return filterGlobalDepartments(normalizeDepartmentList(data));
    }
  },

  list: (
    params: {
      clientId?: string;
      includeGlobal?: boolean;
      activeOnly?: boolean;
    } = {},
  ) => api.get<Department[]>(BASE, params as Record<string, unknown>),

  get: (id: string) => api.get<Department>(BASE + "/" + id),

  /** Configuração efetiva + equipe efetiva (herança do global pai). */
  effective: (id: string) =>
    api.get<DepartmentEffectiveDto>(BASE + "/" + id + "/effective"),

  create: (data: CreateDepartmentRequest) => api.post<Department>(BASE, data),

  update: (id: string, data: UpdateDepartmentRequest) =>
    api.put<Department>(BASE + "/" + id, data),

  delete: (id: string) => api.del<void>(BASE + "/" + id),

  // ── Triagem por IA na auto-atribuição ────────────────────────────────

  /** Perfil (competências/capacidade) + métricas de cada membro da equipe. */
  teamMetrics: (id: string) =>
    api.get<DepartmentMemberProfileDto[]>(BASE + "/" + id + "/assignment/team-metrics"),

  /** Atualiza competências, teto de chamados, peso e opt-out do membro. */
  updateMemberProfile: (
    id: string,
    userId: string,
    data: UpdateDepartmentMemberProfileRequest,
  ) =>
    api.put<DepartmentMemberProfileDto>(
      BASE + "/" + id + "/members/" + userId + "/profile",
      data,
    ),

  /**
   * Força o recálculo dos snapshots de métricas usados pela triagem.
   * Ação administrativa potencialmente longa (agregações SQL por atendente):
   * usa timeout maior que o padrão de 60s em vez de abortar e mostrar erro.
   */
  refreshTeamMetrics: (id: string) =>
    api.post<number>(BASE + "/" + id + "/assignment/metrics/refresh", {}, { timeoutMs: 120_000 }),

  // ── Aprendizado (competências e pesos) ───────────────────────────────

  /** Sugestões pendentes de competências e de recalibração de pesos. */
  learningSuggestions: (id: string) =>
    api.get<DepartmentLearningSuggestionsDto>(BASE + "/" + id + "/learning/suggestions"),

  /** Roda um ciclo de aprendizado sob demanda. */
  runLearningCycle: (id: string) =>
    api.post<{ created: number }>(BASE + "/" + id + "/learning/run", {}),

  applySkillSuggestion: (id: string, suggestionId: string) =>
    api.post<TechnicianSkillSuggestionDto>(
      BASE + "/" + id + "/learning/skills/" + suggestionId + "/apply",
      {},
    ),

  discardSkillSuggestion: (id: string, suggestionId: string) =>
    api.post<void>(BASE + "/" + id + "/learning/skills/" + suggestionId + "/discard", {}),

  applyWeightSuggestion: (id: string, suggestionId: string) =>
    api.post<AiWeightSuggestionDto>(
      BASE + "/" + id + "/learning/weights/" + suggestionId + "/apply",
      {},
    ),

  discardWeightSuggestion: (id: string, suggestionId: string) =>
    api.post<void>(BASE + "/" + id + "/learning/weights/" + suggestionId + "/discard", {}),
};

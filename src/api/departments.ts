import { api } from "./client";
import type {
  Department,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  DepartmentMemberProfileDto,
  UpdateDepartmentMemberProfileRequest,
  DepartmentLearningSuggestionsDto,
  TechnicianSkillSuggestionDto,
  AiWeightSuggestionDto,
} from "./types";

const BASE = "/api/v1/departments";

export const departmentsApi = {
  listGlobal: () => api.get<Department[]>(BASE + "/global"),

  list: (
    params: {
      clientId?: string;
      includeGlobal?: boolean;
      activeOnly?: boolean;
    } = {},
  ) => api.get<Department[]>(BASE, params as Record<string, unknown>),

  get: (id: string) => api.get<Department>(BASE + "/" + id),

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

  /** Força o recálculo dos snapshots de métricas usados pela triagem. */
  refreshTeamMetrics: (id: string) =>
    api.post<number>(BASE + "/" + id + "/assignment/metrics/refresh", {}),

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

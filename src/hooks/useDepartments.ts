import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { departmentsApi } from "@/api";
import type {
  CreateDepartmentRequest,
  CursorPageDto,
  Department,
  DepartmentMemberProfileDto,
  UpdateDepartmentMemberProfileRequest,
  UpdateDepartmentRequest,
} from "@/api";

const KEYS = {
  all: ["departments"] as const,
  list: (params: {
    clientId?: string;
    includeGlobal?: boolean;
    activeOnly?: boolean;
  }) => [...KEYS.all, "list", params] as const,
  global: [...["departments"], "global"] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useDepartments(
  params: {
    clientId?: string;
    includeGlobal?: boolean;
    activeOnly?: boolean;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => departmentsApi.list(params),
    staleTime: 60_000,
    select: (data) =>
      normalizeArray(data as CursorPageDto<Department> | Department[]),
  });
}

export function useGlobalDepartments() {
  return useQuery({
    queryKey: KEYS.global,
    queryFn: () => departmentsApi.listGlobal(),
  });
}

export function useDepartment(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => departmentsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDepartmentRequest) => departmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list({}) });
      qc.invalidateQueries({ queryKey: KEYS.global });
    },
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDepartmentRequest }) =>
      departmentsApi.update(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.list({}) });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.global });
    },
  });
}

const learningKey = (departmentId: string) =>
  [...KEYS.all, "learning", departmentId] as const;

/** Sugestões pendentes de aprendizado (competências e pesos). */
export function useDepartmentLearningSuggestions(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: learningKey(departmentId),
    queryFn: () => departmentsApi.learningSuggestions(departmentId),
    enabled: !!departmentId && enabled,
    staleTime: 30_000,
  });
}

/** Roda um ciclo de aprendizado sob demanda. */
export function useRunLearningCycle(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => departmentsApi.runLearningCycle(departmentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: learningKey(departmentId) });
      void qc.invalidateQueries({ queryKey: KEYS.detail(departmentId) });
    },
  });
}

export function useApplySkillSuggestion(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      departmentsApi.applySkillSuggestion(departmentId, suggestionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: learningKey(departmentId) });
      void qc.invalidateQueries({ queryKey: teamMetricsKey(departmentId) });
    },
  });
}

export function useDiscardSkillSuggestion(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      departmentsApi.discardSkillSuggestion(departmentId, suggestionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: learningKey(departmentId) });
    },
  });
}

export function useApplyWeightSuggestion(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      departmentsApi.applyWeightSuggestion(departmentId, suggestionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: learningKey(departmentId) });
      void qc.invalidateQueries({ queryKey: KEYS.detail(departmentId) });
    },
  });
}

export function useDiscardWeightSuggestion(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      departmentsApi.discardWeightSuggestion(departmentId, suggestionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: learningKey(departmentId) });
    },
  });
}

const teamMetricsKey = (departmentId: string) =>
  [...KEYS.all, "team-metrics", departmentId] as const;

/** Perfil + métricas da equipe usadas pela triagem por IA do departamento. */
export function useDepartmentTeamMetrics(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: teamMetricsKey(departmentId),
    queryFn: () => departmentsApi.teamMetrics(departmentId),
    enabled: !!departmentId && enabled,
    staleTime: 30_000,
  });
}

/** Atualiza competências, teto de chamados, peso e opt-out de um membro. */
export function useUpdateDepartmentMemberProfile(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateDepartmentMemberProfileRequest;
    }) => departmentsApi.updateMemberProfile(departmentId, userId, data),
    onSuccess: (updated: DepartmentMemberProfileDto) => {
      qc.setQueryData<DepartmentMemberProfileDto[]>(teamMetricsKey(departmentId), (current) =>
        current
          ? current.map((member) =>
              member.userId === updated.userId
                ? { ...member, ...updated, metrics: updated.metrics ?? member.metrics }
                : member,
            )
          : current,
      );
      void qc.invalidateQueries({ queryKey: teamMetricsKey(departmentId) });
    },
  });
}

/** Força o recálculo dos snapshots de métricas da equipe. */
export function useRefreshDepartmentTeamMetrics(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => departmentsApi.refreshTeamMetrics(departmentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamMetricsKey(departmentId) });
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => departmentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list({}) });
      qc.invalidateQueries({ queryKey: KEYS.global });
    },
  });
}

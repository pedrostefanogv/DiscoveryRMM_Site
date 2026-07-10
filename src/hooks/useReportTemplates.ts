import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type {
  CreateReportTemplateRequest,
  CursorPageDto,
  ReportTemplate,
  UpdateReportTemplateRequest,
  ReportDatasetTypeValue,
} from "@/api/types";

const KEYS = {
  all: ["reportTemplates"] as const,
  list: (params?: {
    datasetType?: ReportDatasetTypeValue;
    isActive?: boolean;
  }) => [...KEYS.all, "list", params] as const,
  detail: (id: string, clientId?: string) =>
    [...KEYS.all, "detail", id, clientId] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useReportTemplates(params?: {
  datasetType?: ReportDatasetTypeValue;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => reportsApi.getReportTemplates(params),
    select: (data) =>
      normalizeArray(data as CursorPageDto<ReportTemplate> | ReportTemplate[]),
  });
}

export function useReportTemplate(id: string, clientId?: string) {
  return useQuery({
    queryKey: KEYS.detail(id, clientId),
    queryFn: () => reportsApi.getReportTemplateById(id, clientId),
    enabled: !!id,
  });
}

export function useCreateReportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReportTemplateRequest) =>
      reportsApi.createReportTemplate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateReportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateReportTemplateRequest;
    }) => reportsApi.updateReportTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteReportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteReportTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

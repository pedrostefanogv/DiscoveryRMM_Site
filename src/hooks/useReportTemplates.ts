import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type {
  CreateReportTemplateRequest,
  UpdateReportTemplateRequest,
  ReportDatasetType,
} from "@/api/types";

const KEYS = {
  all: ["reportTemplates"] as const,
  list: (params?: {
    clientId?: string;
    datasetType?: ReportDatasetType;
    isActive?: boolean;
  }) => [...KEYS.all, "list", params] as const,
  detail: (id: string, clientId?: string) =>
    [...KEYS.all, "detail", id, clientId] as const,
};

export function useReportTemplates(params?: {
  clientId?: string;
  datasetType?: ReportDatasetType;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => reportsApi.getReportTemplates(params),
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

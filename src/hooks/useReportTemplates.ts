import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as reportsApi from "@/api/reports";
import { normalizeApiError } from "@/pages/reports/report-template-form/utils";
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
    // Rede de seguranca: sem isto uma rejeicao do backend (400 de validacao
    // do layout) ficava invisivel fora de quem consome a mutation. O wizard
    // exibe os erros inline; aqui garantimos que a falha nunca passe em
    // silencio, seguindo o padrao de toast ja usado em ReportTemplateForm.
    onError: (error) => {
      toast.error(normalizeApiError(error, "Erro ao criar template."));
    },
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
    onError: (error) => {
      toast.error(normalizeApiError(error, "Erro ao atualizar template."));
    },
  });
}

export function useDeleteReportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteReportTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

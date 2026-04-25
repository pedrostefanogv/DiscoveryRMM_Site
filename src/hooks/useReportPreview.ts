import { useMutation } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type { PreviewReportRequest } from "@/api/types";

export function useReportPreview() {
  return useMutation({
    mutationFn: (request: PreviewReportRequest) =>
      reportsApi.previewReport(request),
  });
}

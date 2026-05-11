import { useState, useCallback, useEffect, useRef } from "react";
import * as reportsApi from "@/api/reports";
import { ReportExecutionStatus } from "@/api/types";
import { downloadReportFile } from "@/api/reports";
import type { ReportExecution } from "@/api/types";

const POLLING_INTERVAL_MS = 2000;
const MAX_POLLING_ATTEMPTS = 60; // 2 min total

export interface DownloadProgress {
  status: "idle" | "running" | "completed" | "error";
  progress: number; // 0-100
  message: string;
  errorMessage?: string;
}

interface DownloadReportOptions {
  clientId?: string;
  fileName?: string;
}

function normalizeExecutionStatus(
  status: ReportExecution["status"] | string | number,
): ReportExecutionStatus | undefined {
  if (typeof status === "number") {
    return status as ReportExecutionStatus;
  }

  const normalized = String(status).toLowerCase();
  if (normalized === "pending") return ReportExecutionStatus.Pending;
  if (normalized === "running" || normalized === "processing") {
    return ReportExecutionStatus.Running;
  }
  if (normalized === "completed") return ReportExecutionStatus.Completed;
  if (normalized === "failed") return ReportExecutionStatus.Failed;
  return undefined;
}

export function useReportDownload() {
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>(
    {},
  );
  const clearTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeTimeouts = clearTimeoutsRef.current;
    return () => {
      for (const timeoutId of activeTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      activeTimeouts.clear();
    };
  }, []);

  const downloadReport = useCallback(
    async (executionId: string, options?: DownloadReportOptions) => {
      setDownloads((prev) => ({
        ...prev,
        [executionId]: {
          status: "running",
          progress: 0,
          message: "Iniciando download do relatório...",
        },
      }));

      try {
        let attempt = 0;

        const pollForCompletion = async (): Promise<ReportExecution> => {
          for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
            attempt++;
            const progress = Math.min(
              90,
              (attempt / MAX_POLLING_ATTEMPTS) * 80 + 10,
            );

            setDownloads((prev) => ({
              ...prev,
              [executionId]: {
                status: "running",
                progress,
                message: `Aguardando conclusão... (${attempt}/${MAX_POLLING_ATTEMPTS})`,
              },
            }));

            const execution = await reportsApi.getReportExecution(
              executionId,
              options?.clientId,
            );

            const normalizedStatus = normalizeExecutionStatus(
              execution.status as ReportExecution["status"] | string | number,
            );

            if (normalizedStatus === ReportExecutionStatus.Completed) {
              return execution;
            }

            if (normalizedStatus === ReportExecutionStatus.Failed) {
              throw new Error(
                execution.errorMessage ||
                  "Erro desconhecido na geração do relatório",
              );
            }

            await new Promise((resolve) =>
              setTimeout(resolve, POLLING_INTERVAL_MS),
            );
          }

          throw new Error("Timeout aguardando conclusão do relatório");
        };

        const execution = await pollForCompletion();

        setDownloads((prev) => ({
          ...prev,
          [executionId]: {
            status: "running",
            progress: 95,
            message: "Iniciando download do arquivo...",
          },
        }));

        // Determine file extension from format or content type
        const getFileExtension = (exec: ReportExecution): string => {
          if (exec.resultContentType?.includes("pdf")) return "pdf";
          if (exec.resultContentType?.includes("spreadsheet")) return "xlsx";
          if (exec.resultContentType?.includes("csv")) return "csv";
          // Fallback to PDF
          return "pdf";
        };

        const extension = getFileExtension(execution);
        const fileName =
          options?.fileName ||
          `report_${new Date().toISOString().split("T")[0]}.${extension}`;

        // Use the helper function from API
        await downloadReportFile(executionId, fileName, options?.clientId);

        setDownloads((prev) => ({
          ...prev,
          [executionId]: {
            status: "completed",
            progress: 100,
            message: "Download concluído!",
          },
        }));

        const clearTimeoutId = setTimeout(() => {
          setDownloads((prev) => {
            const updated = { ...prev };
            delete updated[executionId];
            return updated;
          });
          clearTimeoutsRef.current.delete(executionId);
        }, 3000);
        clearTimeoutsRef.current.set(executionId, clearTimeoutId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";
        setDownloads((prev) => ({
          ...prev,
          [executionId]: {
            status: "error",
            progress: 0,
            message: "Erro no download",
            errorMessage,
          },
        }));
      }
    },
    [],
  );

  const getProgress = useCallback(
    (executionId: string): DownloadProgress | undefined =>
      downloads[executionId],
    [downloads],
  );

  const clearProgress = useCallback((executionId: string) => {
    setDownloads((prev) => {
      const updated = { ...prev };
      delete updated[executionId];
      return updated;
    });
  }, []);

  return {
    downloadReport,
    getProgress,
    clearProgress,
  };
}

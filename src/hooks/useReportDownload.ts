import { useState, useCallback } from "react";
import * as reportsApi from "@/api/reports";
import { ReportExecutionStatus } from "@/api/types";
import {
  getReportDownloadUrl,
  getReportStreamDownloadUrl,
} from "@/api/reports";
import type { ReportExecution } from "@/api/types";

const POLLING_INTERVAL_MS = 2000;
const MAX_POLLING_ATTEMPTS = 60; // 2 min total
const STREAM_THRESHOLD_BYTES = 50 * 1024 * 1024;

export interface DownloadProgress {
  status: "idle" | "running" | "completed" | "error";
  progress: number; // 0-100
  message: string;
  errorMessage?: string;
}

interface DownloadReportOptions {
  clientId?: string;
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

        const isLargeFile =
          (execution.resultSizeBytes ?? 0) > STREAM_THRESHOLD_BYTES;

        if (isLargeFile) {
          const streamUrl = getReportStreamDownloadUrl(
            executionId,
            options?.clientId,
          );
          const link = document.createElement("a");
          link.href = streamUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          const downloadUrl = getReportDownloadUrl(
            executionId,
            options?.clientId,
          );
          const response = await fetch(downloadUrl, {
            method: "GET",
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Falha ao baixar o arquivo do relatório");
          }

          const blob = await response.blob();
          const objectUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `relatorio_${executionId}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(objectUrl);
        }

        setDownloads((prev) => ({
          ...prev,
          [executionId]: {
            status: "completed",
            progress: 100,
            message: isLargeFile
              ? "Download em streaming iniciado!"
              : "Download concluído!",
          },
        }));

        setTimeout(() => {
          setDownloads((prev) => {
            const updated = { ...prev };
            delete updated[executionId];
            return updated;
          });
        }, 3000);
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

import { formatBytes as formatBytesBase } from '@/utils/format';
import type { PatchApprovalState, PatchScope, PatchUpdateStatus } from "@/api/types";

export function formatPatchDate(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleString("pt-BR");
}

export function severityColor(severity: string | null | undefined): "danger" | "warning" | "primary" | "slate" {
  const normalized = (severity ?? "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("cr\u00edtica")) return "danger";
  if (normalized.includes("important") || normalized.includes("importante")) return "warning";
  if (normalized.includes("moderate") || normalized.includes("moderada")) return "primary";
  return "slate";
}

export function severityLabel(severity: string | null | undefined): string {
  if (!severity) return "\u2014";
  return severity;
}

export function approvalLabel(state: PatchApprovalState): string {
  switch (state) {
    case "Approved":
      return "Aprovada";
    case "AutoApproved":
      return "Auto-aprovada";
    case "Denied":
      return "Recusada";
    default:
      return "Aguardando aprovação";
  }
}

export function approvalColor(state: PatchApprovalState): "success" | "accent" | "danger" | "slate" {
  switch (state) {
    case "Approved":
      return "success";
    case "AutoApproved":
      return "accent";
    case "Denied":
      return "danger";
    default:
      return "slate";
  }
}

export function statusLabel(status: PatchUpdateStatus): string {
  switch (status) {
    case "Pending":
      return "Pendente";
    case "Installed":
      return "Instalada";
    case "Approved":
      return "Aprovada";
    case "Denied":
      return "Recusada";
    case "Installing":
      return "Instalando";
    case "Failed":
      return "Falhou";
    case "Superseded":
      return "Substituída";
    default:
      return "N/A";
  }
}

export function statusColor(status: PatchUpdateStatus): "success" | "warning" | "danger" | "primary" | "slate" {
  switch (status) {
    case "Installed":
      return "success";
    case "Approved":
      return "primary";
    case "Denied":
      return "danger";
    case "Installing":
      return "warning";
    case "Failed":
      return "danger";
    default:
      return "slate";
  }
}

export function rebootReasonLabel(reason: string): string {
  switch (reason) {
    case "windows_update":
      return "Windows Update";
    case "cbs":
      return "Component Based Servicing";
    case "file_rename":
      return "Arquivos em uso";
    case "computer_rename":
      return "Renomeação do computador";
    case "servicing":
      return "Manutenção de componentes";
    default:
      return reason;
  }
}

export function parseRebootReasons(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function formatKbList(kbIds: string[] | null | undefined): string {
  if (!kbIds || kbIds.length === 0) return "\u2014";
  return kbIds.join(", ");
}

export const PATCH_SCOPE_OPTIONS: Array<{ value: PatchScope; label: string }> = [
  { value: "global", label: "Global" },
  { value: "client", label: "Por cliente" },
  { value: "site", label: "Por site" },
];

export const PATCH_SEVERITY_OPTIONS = [
  { value: "", label: "Todas as severidades" },
  { value: "Critical", label: "Crítica" },
  { value: "Important", label: "Importante" },
  { value: "Moderate", label: "Moderada" },
  { value: "Low", label: "Baixa" },
];

export const PATCH_STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "denied", label: "Recusadas" },
  { value: "installed", label: "Instaladas" },
  { value: "failed", label: "Com falha" },
];

export function formatBytes(bytes: number | null | undefined): string {
  return formatBytesBase(bytes);
}

/**
 * Tamanho máximo de download por cima do limiar de plausibilidade.
 *
 * O WUA devolve em MaxDownloadSize a soma de TODOS os conteúdos do pacote
 * empacotado (UUP): numa atualização Insider Preview o mesmo update trazia
 * 13.426 arquivos (todas as edições/idiomas) e MaxDownloadSize = 97,8 GB,
 * enquanto o download real desta máquina era ~9,1 GB na tela do Windows.
 * Acima de 20 GiB o número não descreve o download do dispositivo.
 */
export const IMPLAUSIBLE_DOWNLOAD_SIZE_BYTES = 20 * 1024 * 1024 * 1024;

/**
 * Rótulo de tamanho de download para exibição, dado o intervalo do WUA.
 *
 * - min > 0 e max plausível (<= 20 GiB): "a partir de X" (o download real
 *   começa no mínimo e pode crescer até o máximo);
 * - min = 0 e max plausível: "≈ X" (estimativa única);
 * - max acima do limiar: null (o número não descreve este dispositivo e é
 *   omitido em vez de exibir 91 GiB para um download real de 9 GB).
 */
export function formatDownloadSizeLabel(
  minDownloadSize: number | null | undefined,
  maxDownloadSize: number | null | undefined,
): string | null {
  const min = typeof minDownloadSize === "number" && Number.isFinite(minDownloadSize) ? minDownloadSize : 0;
  const max = typeof maxDownloadSize === "number" && Number.isFinite(maxDownloadSize) ? maxDownloadSize : 0;
  if (max <= 0) return null;
  if (max > IMPLAUSIBLE_DOWNLOAD_SIZE_BYTES) return null;
  if (min > 0 && min < max) return "a partir de " + formatBytes(min);
  return "≈ " + formatBytes(max);
}

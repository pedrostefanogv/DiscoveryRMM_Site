import type { AgentWindowsUpdateSnapshot } from "@/api/types";
import { rebootReasonLabel } from "@/pages/patches/patchesUtils";

/**
 * Derivações da aba "Atualizações" do agente.
 *
 * Ficam fora do componente para poderem ser testadas sem DOM e para que o
 * painel só interprete o snapshot da API (todos os campos novos são opcionais:
 * API/agente antigos continuam funcionando, apenas com menos avisos).
 */

/** O agente roda 1 varredura a cada 6h; acima disso o snapshot é considerado velho. */
export const STALE_SCAN_THRESHOLD_MS = 6 * 60 * 60 * 1000;
/** Acima disso o aviso muda de tom (pode haver mais de um ciclo perdido). */
export const VERY_STALE_SCAN_THRESHOLD_MS = 12 * 60 * 60 * 1000;

const SCAN_ERROR_LABELS: Record<string, string> = {
  service_disabled:
    "O serviço Windows Update (wuauserv) está desabilitado nesta máquina; o agente não consegue consultar atualizações.",
  wua_unavailable:
    "A interface COM do Windows Update (WUA) não está disponível no agente.",
  wua_interface_error:
    "A consulta ao Windows Update falhou no agente (erro na interface WUA).",
  service_stopped:
    "O serviço Windows Update está parado e não pôde ser iniciado pelo agente.",
  access_denied:
    "O agente não tem permissão para consultar o Windows Update (verifique a conta do serviço).",
  timeout: "A varredura do Windows Update excedeu o tempo limite no agente.",
  unsupported:
    "Este sistema operacional não é suportado pela busca de atualizações do agente.",
  scan_error: "A varredura do Windows Update falhou no agente.",
};

export type ScanHealthTone = "ok" | "warning" | "danger";

export interface ScanHealth {
  /** Varredura nunca chegou (nunca houve inventário). */
  neverScanned: boolean;
  /** `lastCollectedAt` mais antigo que o limiar de 6h. */
  stale: boolean;
  /** Mais antigo que 12h (mais de um ciclo perdido). */
  veryStale: boolean;
  /** scanStatus != ok/partial. */
  failed: boolean;
  /** Existe algum motivo para alertar o operador. */
  alert: boolean;
  tone: ScanHealthTone;
  /** Título curto do banner. */
  title: string;
  /** Explicação do motivo (scanError bruto + explicação quando conhecida). */
  reason: string;
  /** Idade do snapshot em ms, quando `lastCollectedAt` é válido. */
  ageMs: number | null;
}

/** Valor cru de `scanStatus` quando a API antiga devolve "unknown". */
export function normalizeScanStatus(scanStatus: string | null | undefined): string {
  const normalized = (scanStatus ?? "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return "ok";
  return normalized;
}

/**
 * O status "unknown" da API é o valor padrão de snapshot nunca preenchido;
 * nesse caso quem manda é a presença de `lastCollectedAt`.
 */
export function isScanFailed(
  scanStatus: string | null | undefined,
  lastCollectedAt: string | null | undefined,
): boolean {
  const raw = (scanStatus ?? "").trim().toLowerCase();
  // "unknown"/vazio é o valor padrão de snapshot nunca preenchido pela API.
  if (!raw || raw === "unknown") return !lastCollectedAt;
  if (raw === "ok" || raw === "partial") return false;
  return true;
}

export function describeScanError(
  scanError: string | null | undefined,
  scanErrorCode: string | null | undefined,
): string | null {
  const code = (scanErrorCode ?? "").trim().toLowerCase();
  const mapped = code ? SCAN_ERROR_LABELS[code] : undefined;
  const raw = (scanError ?? "").trim();
  if (mapped && raw) return `${mapped} (detalhe: ${raw})`;
  if (mapped) return mapped;
  if (raw) return raw;
  return null;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseTimestamp(value: string | null | undefined): number | null {
  return toMs(value);
}

type SnapshotLike = Partial<
  Pick<
    AgentWindowsUpdateSnapshot,
    "scanStatus" | "scanError" | "scanErrorCode" | "lastCollectedAt" | "pendingReboot"
  >
> | null;

export function deriveScanHealth(
  snapshot: SnapshotLike | undefined,
  now: number,
  options?: { staleThresholdMs?: number },
): ScanHealth {
  const staleThresholdMs = options?.staleThresholdMs ?? STALE_SCAN_THRESHOLD_MS;
  const lastCollectedMs = toMs(snapshot?.lastCollectedAt);
  const ageMs = lastCollectedMs === null ? null : Math.max(0, now - lastCollectedMs);
  const neverScanned = !snapshot || lastCollectedMs === null;
  const failed = isScanFailed(snapshot?.scanStatus, snapshot?.lastCollectedAt);
  const stale = !neverScanned && !failed && (ageMs ?? 0) > staleThresholdMs;
  const veryStale = !neverScanned && !failed && (ageMs ?? 0) > VERY_STALE_SCAN_THRESHOLD_MS;
  const errorDetail = describeScanError(snapshot?.scanError, snapshot?.scanErrorCode);

  if (neverScanned) {
    return {
      neverScanned,
      stale: false,
      veryStale: false,
      failed,
      alert: true,
      tone: failed ? "danger" : "warning",
      title: "Nenhuma varredura recebida deste agente",
      reason: failed && errorDetail
        ? errorDetail
        : "O agente ainda não enviou inventário do Windows Update. Clique em “Verificar atualizações” ou aguarde o próximo ciclo.",
      ageMs,
    };
  }

  if (failed) {
    return {
      neverScanned,
      stale: false,
      veryStale: false,
      failed,
      alert: true,
      tone: "danger",
      title: "A última varredura falhou",
      reason: errorDetail ?? "O agente não informou o motivo da falha.",
      ageMs,
    };
  }

  if (stale) {
    return {
      neverScanned,
      stale,
      veryStale,
      failed,
      alert: true,
      tone: veryStale ? "danger" : "warning",
      title: "Varredura desatualizada",
      reason: veryStale
        ? `O inventário foi coletado há mais de 12h. O agente varre a cada 6h; pode haver atualização baixada, instalação em andamento ou reinício pendente que ainda não chegou ao servidor.`
        : "O agente varre o Windows Update a cada 6h. Os dados podem não refletir downloads/instalações recentes; peça uma varredura agora.",
      ageMs,
    };
  }

  return {
    neverScanned,
    stale: false,
    veryStale: false,
    failed: false,
    alert: false,
    tone: "ok",
    title: "Varredura atualizada",
    reason: "",
    ageMs,
  };
}

/** "há 3 min", "há 2 h", "há 3 dias" — usado em textos de última varredura. */
export function formatElapsed(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined) return "sem registro";
  if (!Number.isFinite(ageMs) || ageMs < 0) return "sem registro";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "há instantes";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `há ${hours} h ${rest} min` : `há ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export type ActivityTone = "primary" | "warning" | "success";

export interface UpdateActivity {
  key: "installing" | "downloading" | "reboot" | "idle";
  label: string;
  tone: ActivityTone;
  detail: string;
}

type ActivitySnapshotLike = Partial<
  Pick<AgentWindowsUpdateSnapshot, "pendingReboot" | "pendingRebootReasons" | "probe">
>;

/**
 * Estado de "atividade" do Windows Update no agente, exibido como badge:
 * instalação em andamento, download em andamento, reinício pendente ou ocioso.
 */
export function deriveUpdateActivity(snapshot: ActivitySnapshotLike | null | undefined): UpdateActivity {
  const probe = snapshot?.probe ?? null;
  const downloadPercent =
    typeof probe?.downloadPercent === "number" && probe.downloadPercent >= 0 && probe.downloadPercent <= 100
      ? Math.round(probe.downloadPercent)
      : null;

  if (probe?.downloadInProgress === true) {
    return {
      key: "downloading",
      label: "Download em andamento",
      tone: "primary",
      detail:
        downloadPercent !== null
          ? `O Windows Update está baixando pacotes (${downloadPercent}%).`
          : "O Windows Update está baixando pacotes nesta máquina.",
    };
  }

  if (snapshot?.pendingReboot) {
    const reasons = (snapshot.pendingRebootReasons ?? []).map(rebootReasonLabel).filter(Boolean);
    return {
      key: "reboot",
      label: "Reinício pendente",
      tone: "warning",
      detail: reasons.length > 0 ? reasons.join(", ") : "motivo não informado",
    };
  }

  return {
    key: "idle",
    label: "Sem atividade",
    tone: "success",
    detail: "",
  };
}

/**
 * A busca WUA padrão (IsInstalled=0) só devolve atualizações que o Windows
 * Update considera *ainda* pendentes. Um pacote baixado e instalado, mas que
 * exige reinício, deixa de aparecer nessa busca — por isso a lista de
 * "Pendentes" pode ficar vazia enquanto a máquina tem trabalho inacabado.
 */
export const PENDING_EMPTY_EXPLANATION =
  "A busca do Windows Update (IsInstalled=0) lista só o que ainda falta baixar ou instalar. Atualizações já instaladas aparecem em “Instaladas” depois da próxima coleta; o que já foi baixado só aparece se houver reinício pendente ou instalação em andamento.";

export interface PendingEmptyMessage {
  title: string;
  description: string;
  /** true quando o vazio NÃO deve ser lido como "máquina em dia". */
  suspicious: boolean;
}

export function describePendingEmpty(
  snapshot: (SnapshotLike & ActivitySnapshotLike) | undefined,
  health: ScanHealth,
  extras?: { skippedCount?: number | null; skippedReasons?: string[] | null },
): PendingEmptyMessage {
  const base = "Nenhuma atualização PENDENTE detectada pela busca do Windows Update.";
  const skipped =
    typeof extras?.skippedCount === "number" && extras.skippedCount > 0
      ? ` ${extras.skippedCount} resultado(s) foram ignorados${extras.skippedReasons && extras.skippedReasons.length > 0 ? ` (${extras.skippedReasons.join("; ")})` : ""}.`
      : "";

  if (health.neverScanned || health.failed) {
    return {
      title: base,
      description: `Confirmar o resultado só é possível depois de uma varredura bem-sucedida. ${health.reason}`.trim(),
      suspicious: true,
    };
  }

  if (snapshot?.pendingReboot) {
    return {
      title: base,
      description: `Há reinício pendente nesta máquina: a atualização pode já estar instalada e só faltar reiniciar. ${PENDING_EMPTY_EXPLANATION}${skipped}`,
      suspicious: true,
    };
  }

  if (snapshot?.probe?.downloadInProgress === true) {
    return {
      title: base,
      description: `Há um download em andamento no Windows Update; essa atualização pode não aparecer como pendente até o download terminar. ${PENDING_EMPTY_EXPLANATION}${skipped}`,
      suspicious: true,
    };
  }

  if (health.stale) {
    return {
      title: base,
      description: `${PENDING_EMPTY_EXPLANATION}${skipped} Os dados estão desatualizados: verifique atualizações para confirmar.`,
      suspicious: true,
    };
  }

  return {
    title: base,
    description: `${PENDING_EMPTY_EXPLANATION}${skipped}`,
    suspicious: false,
  };
}

/** Linhas de diagnóstico (serviço, WSUS, política, WUA) exibidas no painel. */
export interface ProbeFlag {
  label: string;
  tone: ScanHealthTone;
  value: string;
}

export function describeProbe(
  snapshot: Partial<Pick<AgentWindowsUpdateSnapshot, "probe" | "wuaAvailable">> | null | undefined,
): ProbeFlag[] {
  const flags: ProbeFlag[] = [];
  const probe = snapshot?.probe ?? null;
  if (!probe && snapshot?.wuaAvailable == null) return flags;

  if (typeof snapshot?.wuaAvailable === "boolean") {
    flags.push({
      label: "WUA (COM)",
      tone: snapshot.wuaAvailable ? "ok" : "danger",
      value: snapshot.wuaAvailable ? "disponível" : "indisponível",
    });
  }

  if (probe?.serviceDisabled === true) {
    flags.push({ label: "Serviço Windows Update", tone: "danger", value: "desabilitado" });
  } else if (probe?.service) {
    const service = probe.service.toLowerCase();
    const tone: ScanHealthTone = service.includes("run") ? "ok" : "warning";
    flags.push({ label: "Serviço Windows Update", tone, value: probe.service });
  }

  if (probe?.wsus === true) {
    flags.push({ label: "WSUS", tone: "warning", value: "gerenciado por servidor" });
  }

  if (probe?.policyManaged === true) {
    flags.push({ label: "Política de WU", tone: "warning", value: "gerenciada por GPO/Intune" });
  }

  if (typeof probe?.lastInstallResult === "number") {
    flags.push({
      label: "Último resultado de instalação",
      tone: probe.lastInstallResult === 0 ? "ok" : "danger",
      value: String(probe.lastInstallResult),
    });
  }

  if (probe?.lastInstallSuccessAt) {
    flags.push({ label: "Última instalação OK", tone: "ok", value: probe.lastInstallSuccessAt });
  }

  return flags;
}

/** Motivo legível para o código estável de erro devolvido pela API. */
export function scanErrorCodeLabel(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toLowerCase();
  return normalized ? (SCAN_ERROR_LABELS[normalized] ?? null) : null;
}

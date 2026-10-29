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

/**
 * Normaliza os motivos de descarte da varredura. O agente envia um MAPA
 * ({ driver: 2 }); versões antigas/JSON diferente podem mandar uma lista.
 * Objeto inesperado vira string vazia (nunca "[object Object]" na UI).
 */
export function formatSkippedReasons(
  value: string[] | Record<string, number> | null | undefined,
): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).join("; ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key, count]) => typeof key === "string" && key.trim().length > 0 && Number(count) > 0)
      .map(([key, count]) => {
        const label = SKIPPED_REASON_LABELS[key] ?? key;
        return Number(count) > 1 ? `${label}: ${Number(count)}` : label;
      })
      .join("; ");
  }
  return "";
}

const SKIPPED_REASON_LABELS: Record<string, string> = {
  driver: "drivers fora do escopo",
  no_identity: "sem identificador",
  unreadable: "itens ilegíveis",
};

export function describePendingEmpty(
  snapshot: (SnapshotLike & ActivitySnapshotLike) | undefined,
  health: ScanHealth,
  extras?: {
    skippedCount?: number | null;
    /**
     * A API expõe o mapa motivo → quantidade (`scan.skippedReasons` do agente)
     * ou, em agentes/API antigos, uma lista de motivos.
     */
    skippedReasons?: string[] | Record<string, number> | null;
  },
): PendingEmptyMessage {
  const base = "Nenhuma atualização PENDENTE detectada pela busca do Windows Update.";
  const reasons = formatSkippedReasons(extras?.skippedReasons);
  const skipped =
    typeof extras?.skippedCount === "number" && extras.skippedCount > 0
      ? ` ${extras.skippedCount} resultado(s) foram ignorados${reasons ? ` (${reasons})` : ""}.`
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

/** Rótulos do AUOptions do Windows Update (política de atualização automática). */
const AU_OPTIONS_LABELS: Record<number, string> = {
  1: "desabilitada por política",
  2: "notificar antes de baixar",
  3: "baixar e notificar instalação",
  4: "agendar instalação",
  5: "permitir escolha do administrador",
};

/** Traduz o AUOptions numérico; valores desconhecidos ficam como número. */
export function auOptionsLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return AU_OPTIONS_LABELS[value] ?? `opção ${value}`;
}

/** Resumo curto do disparo do último scan, para a faixa de saúde. */
export function describeScanTrigger(
  trigger: string | null | undefined,
  source: string | null | undefined,
): string | null {
  const triggerLabels: Record<string, string> = {
    periodic: "rotina",
    change: "mudança de estado",
    command: "pedido do operador",
    install: "pós-instalação",
  };
  const sourceLabels: Record<string, string> = {
    wua: "WUA",
    qfe: "QFE",
  };
  const parts: string[] = [];
  const triggerLabel = trigger ? triggerLabels[trigger.trim().toLowerCase()] : null;
  const sourceLabel = source ? sourceLabels[source.trim().toLowerCase()] : null;
  if (triggerLabel) parts.push(`disparo: ${triggerLabel}`);
  if (sourceLabel) parts.push(`origem: ${sourceLabel}`);
  return parts.length > 0 ? parts.join(" · ") : null;
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

  // A API manda "service"; o agente usa "serviceState" no envelope — aceitar os
  // dois evita a linha de serviço sumir dependendo de quem respondeu.
  const serviceLabel = probe?.service ?? probe?.serviceState ?? null;
  if (probe?.serviceDisabled === true || serviceLabel?.toLowerCase() === "disabled") {
    flags.push({ label: "Serviço Windows Update", tone: "danger", value: "desabilitado" });
  } else if (serviceLabel) {
    const service = serviceLabel.toLowerCase();
    const tone: ScanHealthTone = service.includes("run") ? "ok" : "warning";
    // A interface nunca mostra o estado cru em inglês ("running").
    flags.push({ label: "Serviço Windows Update", tone, value: serviceStateLabel(serviceLabel) ?? serviceLabel });
  }

  if (probe?.wsusServer) {
    flags.push({ label: "Servidor WSUS", tone: "warning", value: probe.wsusServer });
  }

  if (probe?.wsus === true) {
    flags.push({ label: "WSUS", tone: "warning", value: "gerenciado por servidor" });
  }

  const auOptions = auOptionsLabel(probe?.auOptions);
  if (auOptions) {
    const updateDisabled = probe?.auOptions === 1 || probe?.noAutoUpdate === true;
    flags.push({
      label: "Atualização automática",
      tone: updateDisabled ? "danger" : "ok",
      value: probe?.noAutoUpdate === true ? "desligada (NoAutoUpdate=1)" : auOptions,
    });
  }

  const deferralDays = probe?.deferralDays;
  if (typeof deferralDays === "number" && deferralDays > 0) {
    flags.push({
      label: "Deferral",
      tone: "warning",
      value: `${deferralDays} dia(s) de atraso`,
    });
  }

  if (typeof probe?.activeHoursStart === "number" && typeof probe.activeHoursEnd === "number") {
    flags.push({
      label: "Horas ativas",
      tone: "ok",
      value: `${String(probe.activeHoursStart).padStart(2, "0")}h–${String(probe.activeHoursEnd).padStart(2, "0")}h`,
    });
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

  if (typeof probe?.qfeInstalledCount === "number" && probe.qfeInstalledCount > 0) {
    flags.push({
      label: "KBs instaladas (CBS)",
      tone: "ok",
      value: String(probe.qfeInstalledCount),
    });
  }

  return flags;
}

/** Motivo legível para o código estável de erro devolvido pela API. */
export function scanErrorCodeLabel(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toLowerCase();
  return normalized ? (SCAN_ERROR_LABELS[normalized] ?? null) : null;
}

/** Rótulos pt-BR para os estados crus do serviço wuauserv (chegam em inglês). */
const SERVICE_STATE_LABELS: Record<string, string> = {
  running: "em execução",
  stopped: "parado",
  disabled: "desabilitado",
  paused: "pausado",
  start_pending: "iniciando",
  stop_pending: "parando",
  continue_pending: "retomando",
  pause_pending: "pausando",
  not_installed: "não instalado",
  unknown: "estado desconhecido",
};

/**
 * Traduz o estado do serviço Windows Update. Valores desconhecidos são
 * devolvidos como vieram (nunca "running" cru na interface).
 */
export function serviceStateLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const key = value.toLowerCase().replace(/[\s-]+/g, "_");
  return SERVICE_STATE_LABELS[key] ?? value;
}

/** Duração legível: "5,7 s", "1 min 20 s", "sem registro". */
export function formatScanDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return "sem registro";
  if (!Number.isFinite(durationMs) || durationMs < 0) return "sem registro";
  if (durationMs < 1000) return "menos de 1 s";
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1).replace(".", ",")} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
}

type SummarySnapshotLike = Partial<
  Pick<
    AgentWindowsUpdateSnapshot,
    "pendingCount" | "installedCount" | "deniedCount" | "approvedCount"
  >
>;

/**
 * Resumo de uma linha para o cabeçalho do painel. Só mostra o que existe:
 * uma máquina em dia não ganha "0 pendentes" repetido em três lugares.
 */
export function describeSnapshotSummary(snapshot: SummarySnapshotLike | null | undefined): string {
  const pending = snapshot?.pendingCount ?? 0;
  const approved = snapshot?.approvedCount ?? 0;
  const denied = snapshot?.deniedCount ?? 0;
  const installed = snapshot?.installedCount ?? 0;
  // aprovadas/recusadas são SUBCONJUNTOS das pendentes: somar tudo numa lista
  // de "·" lia-se como 6 itens quando havia 3 pendentes. Agora elas vão entre
  // parênteses, como detalhe do total.
  const parts: string[] = [];
  if (pending > 0) {
    const detail: string[] = [];
    if (approved > 0) detail.push(`${approved} aprovada${approved > 1 ? "s" : ""} para instalar`);
    if (denied > 0) detail.push(`${denied} recusada${denied > 1 ? "s" : ""}`);
    parts.push(
      detail.length > 0
        ? `${pending} pendente${pending > 1 ? "s" : ""} (${detail.join(", ")})`
        : `${pending} pendente${pending > 1 ? "s" : ""}`,
    );
  }
  if (parts.length === 0) {
    return installed > 0
      ? `Nenhuma atualização pendente · ${installed} instalada${installed > 1 ? "s" : ""} no inventário`
      : "Nenhuma atualização pendente";
  }
  if (installed > 0) parts.push(`${installed} instalada${installed > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Filtros ativos do painel, para o resumo de resultados e o "limpar filtros". */
export interface PanelFilterState {
  search: string;
  severity: string;
  status: string;
}

export function hasActiveFilters(filters: PanelFilterState): boolean {
  return Boolean(filters.search.trim() || filters.severity || filters.status);
}

/** Texto do vazio quando há filtro aplicado (diferente do vazio "de verdade"). */
export function describeFilteredEmpty(filters: PanelFilterState): { title: string; description: string } {
  const parts: string[] = [];
  if (filters.search.trim()) parts.push(`busca "${filters.search.trim()}"`);
  if (filters.severity) parts.push(`severidade ${filters.severity}`);
  if (filters.status) parts.push(`status ${filters.status}`);
  return {
    title: "Nenhuma atualização corresponde aos filtros",
    description: parts.length > 0
      ? `Filtros aplicados: ${parts.join(" · ")}. Limpe os filtros para ver a lista completa.`
      : "Limpe os filtros para ver a lista completa.",
  };
}


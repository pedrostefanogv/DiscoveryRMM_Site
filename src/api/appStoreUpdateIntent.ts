import { api } from "./client";
import {
  AppApprovalActionType,
  AppApprovalScopeType,
  AppInstallationType,
} from "./types";
import type { AppStorePolicyType } from "./types";

/**
 * Simulação de intenção de atualização (`GET /api/v1/app-store/approvals/update-intent`).
 *
 * A execução acontece no agent, dentro da janela de manutenção do servidor;
 * automações têm precedência. Este endpoint simula o que aconteceria hoje — qual
 * pacote seria atualizado, por quem (manual, auto-update ou automação) e se há
 * conflito entre donos.
 */

/** Quem "dona" a atualização do pacote na simulação. */
export enum AppUpdateOwner {
  Manual = 0,
  AutoUpdate = 1,
  Automation = 2,
}

/** Janela de manutenção vigente no servidor (configuração de atualizações). */
export interface AppMaintenanceWindowInfo {
  enabled: boolean;
  /** Horário local, ex.: "02:00". */
  startTime: string | null;
  timeZone: string | null;
  /** Mesmo horário em UTC, ex.: "05:00". */
  startUtc: string | null;
  durationMinutes: number | null;
  rebootGraceSeconds: number | null;
  /** ISO weekday (1 = domingo ... 7 = sábado), conforme o contrato do servidor. */
  daysOfWeek: number[];
  /** A janela está aberta agora? Ausente na API antiga (normalizado em false). */
  isOpenNow: boolean;
  /** Instante UTC da próxima abertura da janela; null quando não há próxima. */
  nextStartUtc: string | null;
  /** Instante UTC do fim da janela atual/próxima; null quando desconhecido. */
  endUtc: string | null;
}

/** Uma linha da simulação: o que aconteceria com um pacote hoje. */
export interface AppStoreUpdateIntentItem {
  packageId: string;
  packageName: string | null;
  action: AppApprovalActionType | null;
  autoUpdateEnabled: boolean;
  owner: AppUpdateOwner;
  automationTaskId: string | null;
  automationTaskName: string | null;
  automationTriggerSummary: string | null;
  conflict: boolean;
  conflictReason: string | null;
}

/** Resposta completa da simulação. */
export interface AppStoreUpdateIntentPage {
  scopeType: AppApprovalScopeType;
  scopeId: string | null;
  installationType: AppInstallationType | null;
  /** Política da loja no escopo; null quando indisponível. */
  policy: AppStorePolicyType | null;
  maintenanceWindow: AppMaintenanceWindowInfo | null;
  count: number;
  generatedAt: string | null;
  /** A simulação foi truncada pelo limite de pacotes do servidor. */
  truncated: boolean;
  items: AppStoreUpdateIntentItem[];
}

export interface AppStoreUpdateIntentParams {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
  search?: string;
}

// Formato cru aceito do wire (enums podem chegar por nome ou número).
type RawUpdateIntentItem = Partial<AppStoreUpdateIntentItem> & {
  owner?: unknown;
  action?: unknown;
};

type RawUpdateIntentPage = Partial<Omit<AppStoreUpdateIntentPage, "items">> & {
  items?: RawUpdateIntentItem[];
};

const OWNER_BY_NAME: Record<string, AppUpdateOwner> = {
  manual: AppUpdateOwner.Manual,
  autoupdate: AppUpdateOwner.AutoUpdate,
  automation: AppUpdateOwner.Automation,
};

/** Dono chega por nome ("Automation") ou número; valor desconhecido cai em Manual. */
function normalizeOwner(value: unknown): AppUpdateOwner {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === AppUpdateOwner.AutoUpdate) return AppUpdateOwner.AutoUpdate;
    if (value === AppUpdateOwner.Automation) return AppUpdateOwner.Automation;
    return AppUpdateOwner.Manual;
  }
  if (typeof value === "string") {
    const byName = OWNER_BY_NAME[value.trim().toLowerCase()];
    if (byName !== undefined) return byName;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeOwner(numeric);
  }
  return AppUpdateOwner.Manual;
}

/** Ação chega por nome ("Allow") ou número; null quando não reconhecida. */
function normalizeAction(value: unknown): AppApprovalActionType | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === AppApprovalActionType.Allow) return AppApprovalActionType.Allow;
    if (value === AppApprovalActionType.Deny) return AppApprovalActionType.Deny;
    return null;
  }
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "allow") return AppApprovalActionType.Allow;
    if (raw === "deny") return AppApprovalActionType.Deny;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeAction(numeric);
  }
  return null;
}

function normalizeInstallationType(value: unknown): AppInstallationType | null {
  if (value === AppInstallationType.Winget || value === 0 || value === "0") {
    return AppInstallationType.Winget;
  }
  if (value === AppInstallationType.Chocolatey || value === 1 || value === "1") {
    return AppInstallationType.Chocolatey;
  }
  if (value === AppInstallationType.Custom || value === 2 || value === "2") {
    return AppInstallationType.Custom;
  }
  return null;
}

function normalizeScopeType(value: unknown): AppApprovalScopeType {
  if (value === AppApprovalScopeType.Client || value === 1 || value === "1") {
    return AppApprovalScopeType.Client;
  }
  if (value === AppApprovalScopeType.Site || value === 2 || value === "2") {
    return AppApprovalScopeType.Site;
  }
  if (value === AppApprovalScopeType.Agent || value === 3 || value === "3") {
    return AppApprovalScopeType.Agent;
  }
  return AppApprovalScopeType.Global;
}

/** Política da loja chega por nome ("PreApproved") ou número; null se desconhecida. */
function normalizePolicy(value: unknown): AppStorePolicyType | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return "Disabled";
    if (value === 1) return "PreApproved";
    if (value === 2) return "All";
    return null;
  }
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "disabled") return "Disabled";
    if (raw === "preapproved") return "PreApproved";
    if (raw === "all") return "All";
  }
  return null;
}

function normalizeMaintenanceWindow(
  value: unknown,
): AppMaintenanceWindowInfo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AppMaintenanceWindowInfo> & Record<string, unknown>;
  return {
    enabled: Boolean(raw.enabled),
    startTime: typeof raw.startTime === "string" ? raw.startTime : null,
    timeZone: typeof raw.timeZone === "string" ? raw.timeZone : null,
    startUtc: typeof raw.startUtc === "string" ? raw.startUtc : null,
    durationMinutes:
      typeof raw.durationMinutes === "number" ? raw.durationMinutes : null,
    rebootGraceSeconds:
      typeof raw.rebootGraceSeconds === "number" ? raw.rebootGraceSeconds : null,
    daysOfWeek: Array.isArray(raw.daysOfWeek)
      ? raw.daysOfWeek.filter((d): d is number => typeof d === "number")
      : [],
    // Campos novos do contrato: a API antiga não os envia, então ausência vira
    // false/null — nunca quebra o render.
    isOpenNow: Boolean(raw.isOpenNow),
    nextStartUtc: typeof raw.nextStartUtc === "string" ? raw.nextStartUtc : null,
    endUtc: typeof raw.endUtc === "string" ? raw.endUtc : null,
  };
}

function normalizeIntentItem(item: RawUpdateIntentItem): AppStoreUpdateIntentItem {
  return {
    packageId: item.packageId ?? "",
    packageName: item.packageName ?? null,
    action: normalizeAction(item.action),
    autoUpdateEnabled: Boolean(item.autoUpdateEnabled),
    owner: normalizeOwner(item.owner),
    automationTaskId: item.automationTaskId ?? null,
    automationTaskName: item.automationTaskName ?? null,
    automationTriggerSummary: item.automationTriggerSummary ?? null,
    conflict: Boolean(item.conflict),
    conflictReason: item.conflictReason ?? null,
  };
}

function normalizeIntentPage(
  response: RawUpdateIntentPage | null | undefined,
  params: AppStoreUpdateIntentParams,
): AppStoreUpdateIntentPage {
  const page = response ?? {};
  const items = (page.items ?? []).map(normalizeIntentItem);
  return {
    scopeType:
      page.scopeType !== undefined
        ? normalizeScopeType(page.scopeType)
        : params.scopeType,
    scopeId: page.scopeId ?? params.scopeId ?? null,
    installationType:
      page.installationType !== undefined
        ? normalizeInstallationType(page.installationType)
        : (params.installationType ?? null),
    policy: normalizePolicy(page.policy),
    maintenanceWindow: normalizeMaintenanceWindow(page.maintenanceWindow),
    count: page.count ?? items.length,
    generatedAt: page.generatedAt ?? null,
    truncated: Boolean(page.truncated),
    items,
  };
}

const BASE = "/api/v1/app-store";

/** Consulta a simulação de intenção de atualização para o escopo informado. */
export async function getAppStoreUpdateIntent(
  params: AppStoreUpdateIntentParams,
): Promise<AppStoreUpdateIntentPage> {
  const response = await api.get<RawUpdateIntentPage>(
    `${BASE}/approvals/update-intent`,
    params as unknown as Record<string, unknown>,
  );
  return normalizeIntentPage(response, params);
}

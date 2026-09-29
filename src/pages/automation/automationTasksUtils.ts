import {
  AppApprovalScopeType,
  AppInstallationType,
  AutomationNotificationMode,
  AutomationTaskActionType,
  AutomationToastTiming,
} from "@/api/types";

export function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function actionLabel(value: unknown): string {
  if (
    value === AutomationTaskActionType.InstallPackage ||
    value === "InstallPackage"
  )
    return "InstallPackage";
  if (
    value === AutomationTaskActionType.UpdatePackage ||
    value === "UpdatePackage"
  )
    return "UpdatePackage";
  if (value === AutomationTaskActionType.RunScript || value === "RunScript")
    return "RunScript";
  if (
    value === AutomationTaskActionType.CustomCommand ||
    value === "CustomCommand"
  )
    return "CustomCommand";
  if (
    value === AutomationTaskActionType.RemovePackage ||
    value === "RemovePackage"
  )
    return "RemovePackage";
  if (
    value === AutomationTaskActionType.UpdateOrInstallPackage ||
    value === "UpdateOrInstallPackage"
  )
    return "UpdateOrInstallPackage";
  return String(value ?? "-");
}

export function scopeLabel(value: unknown): string {
  if (value === AppApprovalScopeType.Global || value === "Global")
    return "Global";
  if (value === AppApprovalScopeType.Client || value === "Client")
    return "Client";
  if (value === AppApprovalScopeType.Site || value === "Site") return "Site";
  if (value === AppApprovalScopeType.Agent || value === "Agent") return "Agent";
  return String(value ?? "-");
}

export function normalizeActionType(value: unknown): AutomationTaskActionType {
  if (typeof value === "number") return value as AutomationTaskActionType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationTaskActionType;
    if (value === "InstallPackage")
      return AutomationTaskActionType.InstallPackage;
    if (value === "UpdatePackage")
      return AutomationTaskActionType.UpdatePackage;
    if (value === "RunScript") return AutomationTaskActionType.RunScript;
    if (value === "CustomCommand")
      return AutomationTaskActionType.CustomCommand;
    if (value === "RemovePackage")
      return AutomationTaskActionType.RemovePackage;
    if (value === "UpdateOrInstallPackage")
      return AutomationTaskActionType.UpdateOrInstallPackage;
  }
  return AutomationTaskActionType.RunScript;
}

export function normalizeScopeType(value: unknown): AppApprovalScopeType {
  if (typeof value === "number") return value as AppApprovalScopeType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AppApprovalScopeType;
    if (value === "Global") return AppApprovalScopeType.Global;
    if (value === "Client") return AppApprovalScopeType.Client;
    if (value === "Site") return AppApprovalScopeType.Site;
    if (value === "Agent") return AppApprovalScopeType.Agent;
  }
  return AppApprovalScopeType.Global;
}

export function normalizeInstallationType(value: unknown): AppInstallationType {
  if (typeof value === "number") return value as AppInstallationType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AppInstallationType;
    if (value === "Winget") return AppInstallationType.Winget;
    if (value === "Chocolatey") return AppInstallationType.Chocolatey;
    if (value === "Custom") return AppInstallationType.Custom;
    if (value === "winget") return AppInstallationType.Winget;
    if (value === "chocolatey" || value === "choco")
      return AppInstallationType.Chocolatey;
    if (value === "custom") return AppInstallationType.Custom;
  }
  return AppInstallationType.Winget;
}

export function normalizeNotificationMode(
  value: unknown,
): AutomationNotificationMode {
  if (typeof value === "number") return value as AutomationNotificationMode;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationNotificationMode;
    if (value === "Silent") return AutomationNotificationMode.Silent;
    if (value === "Prompt") return AutomationNotificationMode.Prompt;
    if (value === "Toast") return AutomationNotificationMode.Toast;
  }
  return AutomationNotificationMode.Silent;
}

export function normalizeToastTiming(value: unknown): AutomationToastTiming {
  if (typeof value === "number") return value as AutomationToastTiming;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationToastTiming;
    if (value === "Before") return AutomationToastTiming.Before;
    if (value === "After") return AutomationToastTiming.After;
  }
  return AutomationToastTiming.After;
}

/**
 * Resolve o modo efetivo de uma tarefa. Quando a resposta não traz
 * `notificationMode` (API/cache antigos), deriva de `requiresApproval` para não
 * exibir "Silenciosa" numa tarefa que na verdade pede o Prompt.
 */
export function notificationModeFromTask(
  value: unknown,
  requiresApproval?: boolean,
): AutomationNotificationMode {
  if (value === null || value === undefined || value === "") {
    return requiresApproval
      ? AutomationNotificationMode.Prompt
      : AutomationNotificationMode.Silent;
  }
  return normalizeNotificationMode(value);
}

export function notificationModeLabel(value: unknown): string {
  switch (normalizeNotificationMode(value)) {
    case AutomationNotificationMode.Prompt:
      return "Prompt PSADT (Continuar/Adiar)";
    case AutomationNotificationMode.Toast:
      return "Toast simples";
    default:
      return "Silencioso";
  }
}

export function toastTimingLabel(value: unknown): string {
  return normalizeToastTiming(value) === AutomationToastTiming.Before
    ? "Antes de executar"
    : "Após a conclusão";
}

export interface WingetDecisionInfo {
  skip: boolean;
  benign: boolean;
  reason: string | null;
  decidedBy: string | null;
}

/**
 * Extrai a decisão do winget do metadata de resultado do agent
 * (`resultMetadataJson` -> `wingetDecision`). Serve para explicar na UI por que
 * uma execução não instalou nada (ex.: pacote já instalado) e qual fonte decidiu
 * ("winget" ou "inventory-cache" quando o winget está indisponível).
 */
export function wingetDecisionFromMetadata(
  metadataJson: string | null | undefined,
): WingetDecisionInfo | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as {
      wingetDecision?: unknown;
    } | null;
    const decision = parsed?.wingetDecision;
    if (!decision || typeof decision !== "object") return null;
    const record = decision as Record<string, unknown>;
    return {
      skip: record.skip === true,
      benign: record.benign === true,
      reason: typeof record.reason === "string" ? record.reason : null,
      decidedBy: typeof record.decidedBy === "string" ? record.decidedBy : null,
    };
  } catch {
    return null;
  }
}

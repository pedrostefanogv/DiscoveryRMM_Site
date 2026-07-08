import {
  AppApprovalScopeType,
  AppInstallationType,
  AutomationTaskActionType,
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

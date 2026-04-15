// Tipos para modulo Agent Labels API

export enum AgentLabelApplyMode {
  ApplyOnly = 0,
  ApplyAndRemove = 1,
}

export enum AgentLabelNodeType {
  Group = 0,
  Condition = 1,
}

export enum AgentLabelLogicalOperator {
  And = 0,
  Or = 1,
}

export enum AgentLabelField {
  Hostname = 0,
  DisplayName = 1,
  IpAddress = 2,
  OperatingSystem = 3,
  OsVersion = 4,
  Status = 5,
  SoftwareName = 6,
  SoftwarePublisher = 7,
  SoftwareVersion = 8,
  SoftwareCount = 9,
  Processor = 10,
  TotalMemoryBytes = 11,
  TotalDisksCount = 12,
  AgentCustomField = 100,
  ClientCustomField = 101,
  SiteCustomField = 102,
}

export enum AgentLabelComparisonOperator {
  Contains = 0,
  NotContains = 1,
  StartsWith = 2,
  EndsWith = 3,
  Equals = 4,
  NotEquals = 5,
  Regex = 6,
  GreaterThan = 7,
  GreaterThanOrEqual = 8,
  LessThan = 9,
  LessThanOrEqual = 10,
}

export enum AgentLabelSourceType {
  Automatic = 0,
  Manual = 1,
}

export enum AgentStatus {
  Online = "Online",
  Offline = "Offline",
  Maintenance = "Maintenance",
  Error = "Error",
}

export interface AgentLabelRuleExpressionNodeDto {
  nodeType: AgentLabelNodeType;
  logicalOperator?: AgentLabelLogicalOperator | null;
  children?: AgentLabelRuleExpressionNodeDto[];
  field?: AgentLabelField | null;
  customFieldDefinitionId?: string | null;
  operator?: AgentLabelComparisonOperator | null;
  value?: string | null;
}

export interface CreateAgentLabelRuleRequest {
  name: string;
  label: string;
  description?: string | null;
  applyMode: AgentLabelApplyMode;
  expression: AgentLabelRuleExpressionNodeDto;
}

export interface UpdateAgentLabelRuleRequest {
  name: string;
  label: string;
  description?: string | null;
  isEnabled: boolean;
  applyMode: AgentLabelApplyMode;
  expression: AgentLabelRuleExpressionNodeDto;
}

export interface AgentLabelRuleResponse {
  id: string;
  name: string;
  label: string;
  description?: string | null;
  isEnabled: boolean;
  applyMode: AgentLabelApplyMode;
  expression: AgentLabelRuleExpressionNodeDto;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLabel {
  id: string;
  agentId: string;
  label: string;
  sourceType: AgentLabelSourceType;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLabelRuleDryRunRequest {
  agentId: string;
  label?: string | null;
  applyMode: AgentLabelApplyMode;
  expression: AgentLabelRuleExpressionNodeDto;
}

export interface AgentLabelRuleDryRunResponse {
  agentId: string;
  matched: boolean;
  label?: string | null;
  wouldAddLabel: boolean;
  wouldRemoveLabel: boolean;
  currentAutomaticLabels: string[];
}

export interface AgentLabelRuleAgentItem {
  agentId: string;
  hostname: string | null;
  displayName: string | null;
  status: string | null;
  matchedAt: string | null;
  lastEvaluatedAt: string | null;
}

export interface AgentLabelAvailableCustomField {
  id: string;
  name: string;
  label: string;
  description: string | null;
  scopeType: 1 | 2 | 3;
  dataType: number;
  options: string[];
}

export interface AgentLabelRuleAgentsResponse {
  ruleId: string;
  ruleName: string;
  label: string;
  description: string | null;
  totalAgents: number;
  agents: AgentLabelRuleAgentItem[];
}

export interface ApiValidationError {
  errors: string[];
}

export interface ApiNotFoundError {
  error: string;
}

const APPLY_MODE_NAMES: Record<string, AgentLabelApplyMode> = {
  ApplyOnly: AgentLabelApplyMode.ApplyOnly,
  ApplyAndRemove: AgentLabelApplyMode.ApplyAndRemove,
};

const NODE_TYPE_NAMES: Record<string, AgentLabelNodeType> = {
  Group: AgentLabelNodeType.Group,
  Condition: AgentLabelNodeType.Condition,
};

const LOGICAL_OPERATOR_NAMES: Record<string, AgentLabelLogicalOperator> = {
  And: AgentLabelLogicalOperator.And,
  Or: AgentLabelLogicalOperator.Or,
};

const FIELD_NAMES: Record<string, AgentLabelField> = {
  Hostname: AgentLabelField.Hostname,
  DisplayName: AgentLabelField.DisplayName,
  IpAddress: AgentLabelField.IpAddress,
  OperatingSystem: AgentLabelField.OperatingSystem,
  OsVersion: AgentLabelField.OsVersion,
  Status: AgentLabelField.Status,
  SoftwareName: AgentLabelField.SoftwareName,
  SoftwarePublisher: AgentLabelField.SoftwarePublisher,
  SoftwareVersion: AgentLabelField.SoftwareVersion,
  SoftwareCount: AgentLabelField.SoftwareCount,
  Processor: AgentLabelField.Processor,
  TotalMemoryBytes: AgentLabelField.TotalMemoryBytes,
  TotalDisksCount: AgentLabelField.TotalDisksCount,
  AgentCustomField: AgentLabelField.AgentCustomField,
  ClientCustomField: AgentLabelField.ClientCustomField,
  SiteCustomField: AgentLabelField.SiteCustomField,
};

const COMPARISON_OPERATOR_NAMES: Record<string, AgentLabelComparisonOperator> = {
  Contains: AgentLabelComparisonOperator.Contains,
  NotContains: AgentLabelComparisonOperator.NotContains,
  StartsWith: AgentLabelComparisonOperator.StartsWith,
  EndsWith: AgentLabelComparisonOperator.EndsWith,
  Equals: AgentLabelComparisonOperator.Equals,
  NotEquals: AgentLabelComparisonOperator.NotEquals,
  Regex: AgentLabelComparisonOperator.Regex,
  GreaterThan: AgentLabelComparisonOperator.GreaterThan,
  GreaterThanOrEqual: AgentLabelComparisonOperator.GreaterThanOrEqual,
  LessThan: AgentLabelComparisonOperator.LessThan,
  LessThanOrEqual: AgentLabelComparisonOperator.LessThanOrEqual,
};

const SOURCE_TYPE_NAMES: Record<string, AgentLabelSourceType> = {
  Automatic: AgentLabelSourceType.Automatic,
  Manual: AgentLabelSourceType.Manual,
};

function normalizeEnumValue<T extends number>(
  value: unknown,
  byName: Record<string, T>,
  fallback: T,
): T {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value as T;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric as T;
    }

    const normalized = value.trim();
    if (normalized in byName) {
      return byName[normalized];
    }
  }

  return fallback;
}

export function normalizeAgentLabelApplyMode(value: unknown): AgentLabelApplyMode {
  return normalizeEnumValue(value, APPLY_MODE_NAMES, AgentLabelApplyMode.ApplyOnly);
}

export function normalizeAgentLabelNodeType(value: unknown): AgentLabelNodeType {
  return normalizeEnumValue(value, NODE_TYPE_NAMES, AgentLabelNodeType.Condition);
}

export function normalizeAgentLabelLogicalOperator(value: unknown): AgentLabelLogicalOperator {
  return normalizeEnumValue(value, LOGICAL_OPERATOR_NAMES, AgentLabelLogicalOperator.And);
}

export function normalizeAgentLabelField(value: unknown): AgentLabelField {
  return normalizeEnumValue(value, FIELD_NAMES, AgentLabelField.Hostname);
}

export function normalizeAgentLabelComparisonOperator(value: unknown): AgentLabelComparisonOperator {
  return normalizeEnumValue(value, COMPARISON_OPERATOR_NAMES, AgentLabelComparisonOperator.Equals);
}

export function normalizeAgentLabelSourceType(value: unknown): AgentLabelSourceType {
  return normalizeEnumValue(value, SOURCE_TYPE_NAMES, AgentLabelSourceType.Automatic);
}

export function isCustomFieldAgentLabelField(field: AgentLabelField): boolean {
  return (
    field === AgentLabelField.AgentCustomField ||
    field === AgentLabelField.ClientCustomField ||
    field === AgentLabelField.SiteCustomField
  );
}

export function getAgentLabelFieldLabel(field: AgentLabelField): string {
  switch (field) {
    case AgentLabelField.Hostname:
      return "Hostname";
    case AgentLabelField.DisplayName:
      return "Display Name";
    case AgentLabelField.IpAddress:
      return "IP Address";
    case AgentLabelField.OperatingSystem:
      return "Sistema Operacional";
    case AgentLabelField.OsVersion:
      return "Versão do SO";
    case AgentLabelField.Status:
      return "Status";
    case AgentLabelField.SoftwareName:
      return "Nome do Software";
    case AgentLabelField.SoftwarePublisher:
      return "Fabricante do Software";
    case AgentLabelField.SoftwareVersion:
      return "Versão do Software";
    case AgentLabelField.SoftwareCount:
      return "Quantidade de Softwares";
    case AgentLabelField.Processor:
      return "Processador";
    case AgentLabelField.TotalMemoryBytes:
      return "Memória Total (bytes)";
    case AgentLabelField.TotalDisksCount:
      return "Quantidade de Discos";
    case AgentLabelField.AgentCustomField:
      return "Custom Field do Agente";
    case AgentLabelField.ClientCustomField:
      return "Custom Field do Cliente";
    case AgentLabelField.SiteCustomField:
      return "Custom Field do Site";
    default:
      return String(field);
  }
}

export function getAgentLabelApplyModeLabel(mode: AgentLabelApplyMode): string {
  return mode === AgentLabelApplyMode.ApplyAndRemove ? "Aplicar e remover" : "Aplicar apenas";
}

export function getAgentLabelLogicalOperatorLabel(value: AgentLabelLogicalOperator): string {
  return value === AgentLabelLogicalOperator.Or ? "OU" : "E";
}

export function getAgentLabelComparisonOperatorLabel(value: AgentLabelComparisonOperator): string {
  const entry = Object.entries(COMPARISON_OPERATOR_NAMES).find(([, item]) => item === value);
  return entry?.[0] ?? String(value);
}

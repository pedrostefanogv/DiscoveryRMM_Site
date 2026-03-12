// Tipos para modulo Agent Labels API

export enum AgentLabelApplyMode {
  ApplyOnly = "ApplyOnly",
  ApplyAndRemove = "ApplyAndRemove",
}

export enum AgentLabelNodeType {
  Group = "Group",
  Condition = "Condition",
}

export enum AgentLabelLogicalOperator {
  And = "And",
  Or = "Or",
}

export enum AgentLabelField {
  Hostname = "Hostname",
  DisplayName = "DisplayName",
  IpAddress = "IpAddress",
  OperatingSystem = "OperatingSystem",
  OsVersion = "OsVersion",
  Status = "Status",
  SoftwareName = "SoftwareName",
  SoftwarePublisher = "SoftwarePublisher",
  SoftwareVersion = "SoftwareVersion",
  SoftwareCount = "SoftwareCount",
  Processor = "Processor",
  TotalMemoryBytes = "TotalMemoryBytes",
  TotalDisksCount = "TotalDisksCount",
}

export enum AgentLabelComparisonOperator {
  Contains = "Contains",
  NotContains = "NotContains",
  StartsWith = "StartsWith",
  EndsWith = "EndsWith",
  Equals = "Equals",
  NotEquals = "NotEquals",
  Regex = "Regex",
  GreaterThan = "GreaterThan",
  GreaterThanOrEqual = "GreaterThanOrEqual",
  LessThan = "LessThan",
  LessThanOrEqual = "LessThanOrEqual",
}

export enum AgentLabelSourceType {
  Automatic = "Automatic",
  Manual = "Manual",
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

// ── Enums ──────────────────────────────────────────────
export enum LogType {
  System = 0,
  Security = 1,
  Application = 2,
  Hardware = 3,
}

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
  Critical = 4,
}

export enum LogSource {
  Agent = 0,
  Server = 1,
  Portal = 2,
}

export enum CommandType {
  Restart = 0,
  Shutdown = 1,
  RunScript = 2,
  Update = 3,
  CollectInventory = 4,
}

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";

export type TicketActivityType =
  | "Created"
  | "StateChanged"
  | "Assigned"
  | "Commented"
  | "SlaWarning"
  | "SlaBreached"
  | "Escalated"
  | "Reopened"
  | "DepartmentChanged"
  | "PriorityChanged"
  | "DescriptionUpdated"
  | "CategoryChanged";

// ── Base Entities (response shapes) ────────────────────

export interface Client {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  clientId: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  siteId: string;
  hostname: string;
  displayName: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  status?: "Online" | "Offline";
  lastSeenAt?: string | null;
  lastIpAddress?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHardwareInfo {
  id: string;
  agentId: string;
  inventoryRaw: string | null;
  inventorySchemaVersion: string | null;
  inventoryCollectedAt: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  motherboardManufacturer: string | null;
  motherboardModel: string | null;
  motherboardSerialNumber: string | null;
  processor: string | null;
  processorCores: number | null;
  processorThreads: number | null;
  processorArchitecture: string | null;
  totalMemoryBytes: number | null;
  biosVersion: string | null;
  biosManufacturer: string | null;
  osName: string | null;
  osVersion: string | null;
  osBuild: string | null;
  osArchitecture: string | null;
  collectedAt: string;
  updatedAt: string;
}

export interface DiskInfo {
  id: string;
  agentId: string;
  driveLetter: string;
  label: string | null;
  fileSystem: string | null;
  totalSizeBytes: number;
  freeSpaceBytes: number;
  mediaType: string | null;
  collectedAt: string;
}

export interface NetworkAdapterInfo {
  id: string;
  agentId: string;
  name: string;
  macAddress: string | null;
  ipAddress: string | null;
  subnetMask: string | null;
  gateway: string | null;
  dnsServers: string | null;
  isDhcpEnabled: boolean;
  adapterType: string | null;
  speed: string | null;
  collectedAt: string;
}

export interface MemoryModuleInfo {
  id: string;
  agentId: string;
  slot: string | null;
  capacityBytes: number;
  speedMhz: number | null;
  memoryType: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  serialNumber: string | null;
  collectedAt: string;
}

export interface AgentSoftwareInventoryItem {
  inventoryId: string;
  agentId: string;
  softwareId: string;
  name: string;
  version: string | null;
  publisher: string | null;
  installId: string | null;
  serial: string | null;
  source: string | null;
  collectedAt: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export type AgentSoftwareOrder = "asc" | "desc";

export interface AgentSoftwareInventoryPage {
  items: AgentSoftwareInventoryItem[];
  count: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  search: string | null;
  order: AgentSoftwareOrder;
}

export interface SoftwareInventoryCatalogItem {
  softwareId: string;
  name: string;
  publisher: string | null;
  source: string | null;
  installedCount: number;
  firstSeenAt: string | null;
  lastCollectedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface SoftwareInventoryCatalogPage {
  items: SoftwareInventoryCatalogItem[];
  count: number;
  totalInstalled: number;
  totalSoftware: number;
  totalAgents: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  search: string | null;
  order: AgentSoftwareOrder;
}

export interface AgentSoftwareInventorySnapshot {
  agentId: string;
  totalInstalled: number;
  firstSeenAt: string | null;
  lastCollectedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface SoftwareInventorySnapshot {
  totalInstalled: number;
  distinctSoftware: number;
  distinctAgents: number;
  firstSeenAt: string | null;
  lastCollectedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface SoftwareInventoryTopItem {
  softwareId: string;
  name: string;
  publisher: string | null;
  source: string | null;
  installedCount: number;
}

export interface SoftwareInventoryTopResponse {
  items: SoftwareInventoryTopItem[];
  count: number;
  limit: number;
}

export interface AgentToken {
  id: string;
  agentId: string;
  description: string | null;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface AgentCommand {
  id: string;
  agentId: string;
  commandType: CommandType;
  payload: string;
  status: string;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Ticket {
  id: string;
  clientId: string;
  siteId: string | null;
  agentId: string | null;
  departmentId: string | null;
  workflowProfileId: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  category: string | null;
  assignedToUserId: string | null;
  workflowStateId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Department {
  id: string;
  clientId: string | null;
  name: string;
  description: string | null;
  inheritFromGlobalId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkflowProfile {
  id: string;
  clientId: string | null;
  departmentId: string;
  name: string;
  description: string | null;
  slaHours: number;
  defaultPriority: TicketPriority | null;
  isActive: boolean;
}

export interface TicketTimelineEntry {
  id: string;
  ticketId: string;
  activityType: TicketActivityType;
  userId: string | null;
  description: string;
  metadata: unknown;
  createdAt: string;
}

export interface TicketStatistics {
  totalEvents: number;
  byActivityType: Record<string, number>;
}

export interface SlaStatus {
  slaExpiresAt: string | null;
  hoursRemaining: number | null;
  percentUsed: number | null;
  breached: boolean;
  status: string;
}

export interface SlaDetails extends SlaStatus {
  ticketId: string;
  createdAt: string;
  totalSlaHours: number | null;
  elapsedHours: number | null;
  warningLevel: "low" | "medium" | "high" | "critical" | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  author: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface WorkflowState {
  id: string;
  clientId: string | null;
  name: string;
  color: string | null;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

export interface WorkflowTransition {
  id: string;
  clientId: string | null;
  fromStateId: string;
  toStateId: string;
  name: string;
}

export interface LogEntry {
  id: string;
  clientId: string | null;
  siteId: string | null;
  agentId: string | null;
  type: LogType;
  level: LogLevel;
  source: LogSource;
  message: string;
  dataJson: unknown;
  createdAt: string;
}

export interface DeployToken {
  id: string;
  token: string;
  description: string | null;
  expiresAt: string | null;
  multiUse: boolean;
  createdAt: string;
}

export interface Note {
  id: string;
  clientId: string | null;
  siteId: string | null;
  agentId: string | null;
  content: string;
  author: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ConfigurationValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | Record<string, unknown>;

export type ConfigurationMap = Record<string, ConfigurationValue>;

export type ConfigurationOrigin = "Server" | "Client" | "Site";

export type AppStorePolicyType = "Disabled" | "PreApproved" | "All" | 0 | 1 | 2;

export interface ServerConfiguration {
  id: string;
  recoveryEnabled: boolean;
  discoveryEnabled: boolean;
  p2PFilesEnabled: boolean;
  supportEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  appStorePolicy: AppStorePolicyType;
  inventoryIntervalHours: number;
  autoUpdateSettingsJson: string;
  tokenExpirationDays: number;
  maxTokensPerAgent: number;
  agentHeartbeatIntervalSeconds: number;
  agentOfflineThresholdSeconds: number;
  lockedFieldsJson: string;
  brandingSettingsJson: string;
  aiIntegrationSettingsJson: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  version: number;
  [key: string]: ConfigurationValue | null | undefined;
}

export interface ClientConfiguration {
  id: string;
  clientId: string;
  recoveryEnabled?: boolean | null;
  discoveryEnabled?: boolean | null;
  p2PFilesEnabled?: boolean | null;
  supportEnabled?: boolean | null;
  appStorePolicy?: AppStorePolicyType | null;
  aiIntegrationSettingsJson?: string | null;
  inventoryIntervalHours?: number | null;
  autoUpdateSettingsJson?: string | null;
  tokenExpirationDays?: number | null;
  maxTokensPerAgent?: number | null;
  agentHeartbeatIntervalSeconds?: number | null;
  agentOfflineThresholdSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  version: number;
  [key: string]: ConfigurationValue | null | undefined;
}

export interface SiteConfiguration {
  id: string;
  siteId: string;
  clientId: string;
  recoveryEnabled?: boolean | null;
  discoveryEnabled?: boolean | null;
  p2PFilesEnabled?: boolean | null;
  supportEnabled?: boolean | null;
  appStorePolicy?: AppStorePolicyType | null;
  aiIntegrationSettingsJson?: string | null;
  inventoryIntervalHours?: number | null;
  autoUpdateSettingsJson?: string | null;
  timezone?: string | null;
  location?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  version: number;
  [key: string]: ConfigurationValue | null | undefined;
}

export interface ResolvedConfiguration {
  siteId?: string | null;
  clientId?: string | null;
  recoveryEnabled: boolean;
  discoveryEnabled: boolean;
  p2PFilesEnabled: boolean;
  supportEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  appStorePolicy: AppStorePolicyType;
  inventoryIntervalHours: number;
  tokenExpirationDays: number;
  maxTokensPerAgent: number;
  agentHeartbeatIntervalSeconds: number;
  agentOfflineThresholdSeconds: number;
  autoUpdate: Record<string, unknown>;
  aiIntegration: Record<string, unknown>;
  inheritance?: Record<string, number>;
  blockedFields?: string[];
  resolvedAt: string;
  [key: string]: ConfigurationValue | null | undefined;
}

export interface ConfigurationFieldMetadata {
  sourceType?: number;
  isLockedByGlobal?: boolean;
  isLockedByClient?: boolean;
  isLockedBySite?: boolean;
  canEditAtClient?: boolean;
  canEditAtSite?: boolean;
  canEditAtAgent?: boolean;
  lockOwnerForClient?: string | null;
  lockOwnerForSite?: string | null;
  lockOwnerForAgent?: string | null;
}

export interface ConfigurationMetadataResponse {
  fields: Record<string, ConfigurationFieldMetadata>;
  blockedFields?: string[];
}

export interface EffectiveConfiguration {
  values: ConfigurationMap;
  origins: Record<string, ConfigurationOrigin>;
}

export interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string | null;
  type: string;
  configuration: ConfigurationMap;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigurationTemplateRequest {
  name: string;
  description: string | null;
  type: string;
  configuration: ConfigurationMap;
}

export interface ApplyTemplateToClientsRequest {
  clientIds: string[];
}

export interface ApplyTemplateToSitesRequest {
  siteIds: string[];
}

export interface ConfigurationAuditEntry {
  id: string;
  entityType: "Server" | "Client" | "Site";
  entityId: string;
  fieldName: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  changedBy?: string | null;
  changedAt: string;
  ipAddress?: string | null;
  entityVersion: number;
}

export interface ConfigurationAuditQuery {
  days?: number;
  limit?: number;
}

export interface ConfigurationAuditReportQuery {
  startDate: string;
  endDate: string;
}

// ── Request DTOs ───────────────────────────────────────

export interface CreateClientRequest {
  name: string;
  notes: string | null;
}

export interface UpdateClientRequest extends CreateClientRequest {
  isActive: boolean;
}

export interface CreateSiteRequest {
  name: string;
  notes: string | null;
}

export interface UpdateSiteRequest extends CreateSiteRequest {
  isActive: boolean;
}

export interface CreateAgentRequest {
  siteId: string;
  hostname: string;
  displayName: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  agentVersion: string | null;
}

export interface UpdateAgentRequest {
  siteId: string;
  hostname: string;
  displayName: string | null;
}

export interface SendCommandRequest {
  commandType: CommandType;
  payload: string;
}

export interface CreateTokenRequest {
  description: string | null;
  expirationDays: number | null;
}

export interface CreateTicketRequest {
  clientId: string;
  siteId: string | null;
  agentId: string | null;
  departmentId: string | null;
  workflowProfileId: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  category: string | null;
  assignedToUserId: string | null;
}

export interface UpdateTicketRequest {
  title: string;
  description: string;
  priority: TicketPriority;
  assignedToUserId: string | null;
  category: string | null;
}

export interface CreateDepartmentRequest {
  clientId: string | null;
  name: string;
  description: string | null;
  inheritFromGlobalId: string | null;
  sortOrder: number;
}

export interface UpdateDepartmentRequest {
  name: string;
  description: string | null;
  inheritFromGlobalId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateWorkflowProfileRequest {
  clientId: string | null;
  departmentId: string;
  name: string;
  description: string | null;
  slaHours: number;
  defaultPriority: TicketPriority | null;
}

export interface UpdateWorkflowProfileRequest {
  name: string;
  description: string | null;
  departmentId: string;
  slaHours: number;
  defaultPriority: TicketPriority | null;
  isActive: boolean;
}

export interface UpdateWorkflowStateRequest {
  workflowStateId: string;
}

export interface AddCommentRequest {
  author: string;
  content: string;
  isInternal?: boolean;
}

export interface CreateWorkflowStateRequest {
  clientId: string | null;
  name: string;
  color: string | null;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

export interface UpdateStateRequest {
  name: string;
  color: string | null;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

export interface CreateWorkflowTransitionRequest {
  clientId: string | null;
  fromStateId: string;
  toStateId: string;
  name: string;
}

export interface CreateDeployTokenRequest {
  clientId: string;
  siteId: string;
  description: string | null;
  expiresInHours: number | null;
  multiUse: boolean | null;
}

export interface CreateLogRequest {
  clientId: string | null;
  siteId: string | null;
  agentId: string | null;
  type: LogType;
  level: LogLevel;
  source: LogSource;
  message: string;
  dataJson: unknown;
}

export interface HardwareReportRequest {
  hardware: AgentHardwareInfo | null;
  disks: DiskInfo[] | null;
  networkAdapters: NetworkAdapterInfo[] | null;
  memoryModules: MemoryModuleInfo[] | null;
  inventoryRaw: unknown;
  inventorySchemaVersion: string | null;
  inventoryCollectedAt: string | null;
}

export interface CreateNoteRequest {
  content: string;
  author: string | null;
  isPinned?: boolean;
}

export interface UpdateNoteRequest {
  content: string;
  author: string | null;
  isPinned?: boolean;
}

// ── Query params ───────────────────────────────────────

export interface LogsQuery {
  clientId?: string;
  siteId?: string;
  agentId?: string;
  type?: LogType;
  level?: LogLevel;
  source?: LogSource;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface TicketsQuery {
  workflowStateId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

// ── Reports ────────────────────────────────────────────

// ── Report Enums ──────────────────────────────────────────────

export enum ReportDatasetType {
  SoftwareInventory = 0,
  Logs = 1,
  ConfigurationAudit = 2,
  Tickets = 3,
  AgentHardware = 4,
}

export enum ReportFormat {
  Xlsx = 0,
  Pdf = 1,
  Csv = 2,
}

export enum ReportExecutionStatus {
  Pending = 0,
  Running = 1,
  Completed = 2,
  Failed = 3,
}

export enum ReportOrientation {
  Portrait = 0,
  Landscape = 1,
}

export enum ReportSortDirection {
  ASC = 0,
  DESC = 1,
}

export enum ReportScopeType {
  Global = 0,
  Client = 1,
  ClientSite = 2,
  ClientSiteAgent = 3,
}

export enum ReportDateMode {
  None = 0,
  OptionalRange = 1,
  RequiredRange = 2,
}

export enum ReportFilterFieldType {
  Text = 0,
  TextExact = 1,
  Enum = 2,
  Guid = 3,
  Integer = 4,
  Decimal = 5,
  Date = 6,
  DateTime = 7,
  Boolean = 8,
}

export enum ReportFilterUiComponent {
  TextInput = 0,
  TextSearch = 1,
  Select = 2,
  MultiSelect = 3,
  GuidInput = 4,
  NumberInput = 5,
  DatePicker = 6,
  DateTimePicker = 7,
  Toggle = 8,
}

export enum NotificationSeverity {
  Informational = 0,
  Warning = 1,
  Critical = 2,
}

// OrderBy Enums (valores em camelCase para JSON)
export enum SoftwareInventoryOrderBy {
  SoftwareName = "softwareName",
  Publisher = "publisher",
  Version = "version",
  LastSeenAt = "lastSeenAt",
  AgentHostname = "agentHostname",
  SiteName = "siteName",
}

export enum LogsOrderBy {
  Timestamp = "timestamp",
  Level = "level",
  Source = "source",
  Type = "type",
}

export enum ConfigurationAuditOrderBy {
  Timestamp = "timestamp",
  EntityType = "entityType",
  ChangedBy = "changedBy",
  FieldName = "fieldName",
}

export enum TicketsOrderBy {
  Timestamp = "timestamp",
  Priority = "priority",
  SlaBreached = "slaBreached",
  ClosedAt = "closedAt",
}

export enum AgentHardwareOrderBy {
  SiteName = "siteName",
  AgentHostname = "agentHostname",
  CollectedAt = "collectedAt",
  OsName = "osName",
}

// Legacy type for backward compatibility
export type ReportFilterType = "DateTime" | "Long" | "String" | "Boolean";

// ── Report Interfaces ──────────────────────────────────────────

export interface ReportFilterField {
  name: string;
  label: string;
  type: ReportFilterFieldType;
  required: boolean;
  group: string;
  description?: string;
  uiComponent: ReportFilterUiComponent;
  dependsOn?: string | null;
  placeholder?: string;
  defaultValue?: string;
  allowedValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  isPartialMatch?: boolean;
}

export interface ReportFilterDefinition {
  name: string;
  label: string;
  type: ReportFilterType;
  required: boolean;
  description?: string;
}

export interface ReportFilterPreset {
  name: string;
  description: string;
  filtersJson: string;
}

export interface ReportExecutionSchema {
  scopeType: ReportScopeType;
  dateMode: ReportDateMode;
  allowedOrientations: string[];
  defaultOrientation: string;
  allowedSortFields: string[];
  defaultSortField: string;
  allowedSortDirections: string[];
  defaultSortDirection: string;
  filters: ReportFilterField[];
  sampleFilterPresets?: ReportFilterPreset[];
}

export interface DatasetCatalogItem {
  type: string;
  fields: string[];
  formats: ReportFormat[];
  executionSchema: ReportExecutionSchema;
}

export interface ReportDataset {
  type: ReportDatasetType;
  name: string;
  description: string;
  executionSchema: ReportExecutionSchema;
}

export interface ReportTemplate {
  id: string;
  clientId: string | null;
  name: string;
  description: string | null;
  datasetType: ReportDatasetType;
  instructions?: string | null;
  executionSchema: ReportExecutionSchema;
  executionSchemaJson?: Record<string, any> | null;
  defaultFormat: ReportFormat;
  layoutJson: string;
  filtersJson: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ReportExecution {
  id: string;
  templateId: string;
  clientId: string | null;
  format: ReportFormat;
  filtersJson: string | null;
  status: ReportExecutionStatus;
  resultPath: string | null;
  resultContentType: string | null;
  resultSizeBytes: number | null;
  rowCount: number | null;
  errorMessage: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string | null;
}

export interface CreateReportTemplateRequest {
  name: string;
  description?: string | null;
  datasetType: ReportDatasetType;
  instructions?: string | null;
  executionSchemaJson?: Record<string, any> | null;
  defaultFormat?: ReportFormat;
  layoutJson?: string;
  filtersJson?: string | null;
  createdBy?: string | null;
}

export interface UpdateReportTemplateRequest {
  name?: string;
  description?: string | null;
  datasetType?: ReportDatasetType;
  instructions?: string | null;
  executionSchemaJson?: Record<string, any> | null;
  defaultFormat?: ReportFormat;
  layoutJson?: string;
  filtersJson?: string | null;
  isActive?: boolean;
  updatedBy?: string | null;
}

export interface RunReportRequest {
  templateId: string;
  format?: ReportFormat;
  filtersJson?: string | null;
  createdBy?: string | null;
  runAsync: boolean;
}

export interface RunReportResponse {
  executionId: string;
  status: ReportExecutionStatus;
  message?: string;
  rowCount?: number;
  contentType?: string;
  resultSizeBytes?: number;
  downloadPath?: string;
}

export interface ReportTemplateHistory {
  id: string;
  templateId: string;
  version: number;
  eventType: "Created" | "Updated" | "Deleted";
  name: string;
  datasetType: ReportDatasetType;
  defaultFormat: ReportFormat;
  layoutJson: string;
  filtersJson: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
}

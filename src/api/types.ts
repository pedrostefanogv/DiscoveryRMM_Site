// ── Enums ──────────────────────────────────────────────

/**
 * Tipo de log. Valores duplicados são aliases históricos para manter
 * compatibilidade com versões anteriores da API.
 *
 * ATENÇÃO: Em JavaScript, enums numéricos com valores duplicados fazem
 * reverse-lookup retornar apenas o último nome definido.
 * Ex: LogType[0] === "Hardware" (não "Inventory").
 * Use comparação por valor numérico, não por nome string.
 */
export enum LogType {
  Inventory = 0,
  Hardware = 0, // alias de Inventory
  Command = 1,
  Auth = 2,
  Security = 2, // alias de Auth
  System = 3,
  Application = 3, // alias de System
  Agent = 4,
  Ticket = 5,
  Workflow = 6,
  AiChat = 7,
  Automation = 8,
  CustomField = 9,
}

/**
 * Nível de log. Valores duplicados são aliases.
 * ATENÇÃO: LogLevel[3] === "Warning", LogLevel[5] === "Critical".
 */
export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Warning = 3, // alias de Warn
  Error = 4,
  Fatal = 5,
  Critical = 5, // alias de Fatal
}

/**
 * Origem do log. Valores duplicados são aliases.
 * ATENÇÃO: LogSource[0] === "Portal" (último alias definido).
 */
export enum LogSource {
  Api = 0,
  Server = 0, // alias de Api
  Portal = 0, // alias de Api
  Agent = 1,
  Scheduler = 2,
  Nats = 3,
}

export enum CommandType {
  Shell = 0,
  PowerShell = 1,
  Script = 2,
  FileTransfer = 3,
  SystemInfo = 4,
  Restart = 5,
  Shutdown = 6,
  Update = 7,
  RemoteDebug = 8,
  ShowPsadtAlert = 9,
  Notification = 10,
  WakeOnLan = 11,
}

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";

export type MfaRequirement = "None" | "Totp" | "Fido2";

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
  | "CategoryChanged"
  | "AutomationLinked"
  | "AutomationApproved"
  | "AutomationRejected";

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

export interface AgentHeartbeatMetrics {
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  memoryTotalGb?: number;
  memoryUsedGb?: number;
  diskTotalGb?: number;
  diskUsedGb?: number;
  diskReadPercent?: number;
  diskWritePercent?: number;
  diskResponseMs?: number;
  p2pPeers?: number;
  uptimeSeconds?: number;
  processCount?: number;
  cpuTemperatureCelsius?: number;
  ipAddress?: string;
  hostname?: string;
  agentVersion?: string;
  commitHash?: string;
  timestampUtc?: string;
  receivedAtUtc?: string;
}

export interface Agent {
  id: string;
  clientId?: string;
  siteId: string;
  hostname: string;
  displayName: string | null;
  machineScore?: number | null;
  zeroTouchPending?: boolean;
  operatingSystem: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  commitHash?: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  status?: "Online" | "Offline";
  lastSeenAt?: string | null;
  lastIpAddress?: string | null;
  heartbeatMetrics?: AgentHeartbeatMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHardwareInfo {
  id: string;
  agentId: string;
  machineScore?: number | null;
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
  smartStatus?: string | null;
  temperatureC?: number | null;
  powerOnHours?: number | null;
  reallocatedSectors?: number | null;
}

export interface NetworkAdapterInfo {
  id: string;
  agentId: string;
  name: string;
  macAddress: string | null;
  ipAddress: string | null;
  ipv6Address: string | null;
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

export interface ListeningPortInfo {
  id: string;
  agentId: string;
  processName: string | null;
  processId: number;
  processPath: string | null;
  protocol: string | null;
  address: string | null;
  port: number;
  collectedAt: string;
}

export interface OpenSocketInfo {
  id: string;
  agentId: string;
  processName: string | null;
  processId: number;
  processPath: string | null;
  localAddress: string | null;
  localPort: number;
  remoteAddress: string | null;
  remotePort: number;
  protocol: string | null;
  family: string | null;
  collectedAt: string;
}

export interface PrinterInfo {
  name: string;
  driverName: string | null;
  portName: string | null;
  printerStatus: string | null;
  isDefault: boolean;
  isNetworkPrinter: boolean;
  shared: boolean;
  shareName: string | null;
  location: string | null;
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
  returnedItems: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface SoftwareInventoryCatalogItem {
  softwareId: string;
  name: string;
  publisher: string | null;
  source: string | null;
  installedCount: number | null;
  firstSeenAt: string | null;
  lastCollectedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface SoftwareInventoryCatalogPage {
  items: SoftwareInventoryCatalogItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SoftwareInstallationItem {
  agentId: string;
  hostname: string;
  agentDisplayName: string | null;
  siteId: string;
  siteName: string;
  clientId: string;
  clientName: string;
  version: string | null;
  source: string | null;
  collectedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SoftwareInstallationsPage {
  items: SoftwareInstallationItem[];
  nextCursor: string | null;
  hasMore: boolean;
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
  lastCollectedAt: string | null;
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

export type RemoteDebugLogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface StartRemoteDebugSessionRequest {
  logLevel?: RemoteDebugLogLevel;
  preferredTransport?: "nats";
  ttlMinutes?: number;
}

export interface StartRemoteDebugSessionResponse {
  sessionId: string;
  commandId: string;
  agentId: string;
  logLevel: RemoteDebugLogLevel;
  preferredTransport: "nats";
  startedAtUtc: string;
  expiresAtUtc: string;
  natsTenantSubject: string | null;
  natsWssUrl: string | null;
}

export interface RemoteDebugSessionJoinedEvent {
  sessionId: string;
  agentId: string;
  startedAtUtc: string;
  expiresAtUtc: string;
  preferredTransport: "nats";
}

export interface RemoteDebugLogEvent {
  sessionId: string;
  agentId: string;
  level: RemoteDebugLogLevel;
  message: string;
  timestampUtc: string;
  sequence?: number;
  transport?: string | null;
}

export interface RemoteDebugSessionEndedEvent {
  sessionId: string;
  endedAtUtc: string;
  reason?: string | null;
}

export interface RemoteDebugNatsCredentialsResponse {
  jwt: string;
  nkeySeed: string;
  publicKey: string;
  expiresAtUtc: string;
  subscribeSubjects: string[];
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

export interface TicketRemoteSession {
  id: string;
  ticketId: string;
  agentId?: string | null;
  meshNodeId?: string | null;
  sessionUrl?: string | null;
  startedBy?: string | null;
  note?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  endedBy?: string | null;
  endNote?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StartTicketRemoteSessionRequest {
  agentId?: string | null;
  meshNodeId?: string | null;
  sessionUrl?: string | null;
  startedBy?: string | null;
  note?: string | null;
}

export interface EndTicketRemoteSessionRequest {
  note?: string | null;
}

export interface TicketAutomationLink {
  id: string;
  ticketId: string;
  automationTaskDefinitionId: string;
  status: string | number;
  statusLabel: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
}

export interface CreateTicketAutomationLinkRequest {
  automationTaskDefinitionId: string;
  requestedBy?: string | null;
  note?: string | null;
}

export interface ReviewTicketAutomationLinkRequest {
  reviewedBy?: string | null;
  note?: string | null;
}

export interface TicketSavedViewFilter extends TicketsQuery { }

export interface TicketSavedView {
  id: string;
  userId: string | null;
  name: string;
  filterJson: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketSavedViewRequest {
  name: string;
  userId?: string | null;
  isShared?: boolean;
  filter?: TicketSavedViewFilter | null;
}

export interface UpdateTicketSavedViewRequest {
  name: string;
  isShared?: boolean;
  filter?: TicketSavedViewFilter | null;
}

export interface TicketKpiByAssignee {
  assignedToUserId: string | null;
  open: number;
  breached: number;
}

export interface TicketKpiByDepartment {
  departmentId: string | null;
  open: number;
  breached: number;
}

export interface TicketKpiResult {
  totalOpen: number;
  totalClosed: number;
  slaBreached: number;
  slaWarning: number;
  onHold: number;
  frtAchievementRate: number;
  avgResolutionHours: number;
  avgAgeOpenHours: number;
  byAssignee: TicketKpiByAssignee[];
  byDepartment: TicketKpiByDepartment[];
}

export interface TicketKpiQuery {
  clientId?: string;
  departmentId?: string;
  since?: string;
}

export interface TicketAiBaseResponse {
  ticketId: string;
  tokensUsed: number;
  model: string | null;
}

export interface TicketAiTriageResponse extends TicketAiBaseResponse {
  suggestion: string;
}

export interface TicketAiSummaryResponse extends TicketAiBaseResponse {
  summary: string;
}

export interface TicketAiSuggestedReplyResponse extends TicketAiBaseResponse {
  suggestedReply: string;
}

export interface SlaStatus {
  slaExpiresAt?: string | null;
  hoursRemaining?: number | null;
  percentUsed?: number | null;
  breached?: boolean;
  status?: string;
  message?: string | null;
}

export interface SlaFirstResponseStatus {
  slaFirstResponseExpiresAt: string | null;
  firstRespondedAt: string | null;
  hoursRemaining: number | null;
  percentUsed: number | null;
  breached: boolean;
  achieved: boolean;
}

export interface SlaDetails extends SlaStatus {
  ticket?: {
    id: string;
    title: string;
  };
  ticketId?: string;
  createdAt?: string;
  effectiveSlaExpiresAt?: string | null;
  totalSlaHours?: number | null;
  elapsedHours?: number | null;
  onHold?: boolean;
  slaHoldStartedAt?: string | null;
  slaPausedSeconds?: number;
  warningLevel?: "low" | "medium" | "high" | "critical" | null;
  firstResponseSla?: SlaFirstResponseStatus | null;
}

export interface SlaCalendarSummary {
  id: string;
  name: string;
  clientId: string | null;
  timezone: string;
  workDayStartHour: number;
  workDayEndHour: number;
  workDaysJson: string;
  holidayCount: number;
}

export interface SlaCalendarHoliday {
  id: string;
  date: string;
  name: string;
  holidayType: number; // 0=Fixed, 1=Yearly, 2=Relative
  relativeMonth: number | null;
  relativeDayOfWeek: number | null;
  relativeOccurrence: number | null;
  relativeMethod: number | null; // 0=DayOfWeekOccurrence, 1=NthBusinessDay
}

export interface SlaCalendarDetail extends Omit<
  SlaCalendarSummary,
  "holidayCount"
> {
  holidays: SlaCalendarHoliday[];
}

export interface CreateSlaCalendarRequest {
  name: string;
  clientId?: string | null;
  timezone?: string | null;
  workDayStartHour?: number | null;
  workDayEndHour?: number | null;
  workDaysJson?: string | null;
}

export interface UpdateSlaCalendarRequest {
  name?: string | null;
  timezone?: string | null;
  workDayStartHour?: number | null;
  workDayEndHour?: number | null;
  workDaysJson?: string | null;
}

export interface AddSlaCalendarHolidayRequest {
  date: string;
  name: string;
  holidayType?: number;
  relativeMonth?: number | null;
  relativeDayOfWeek?: number | null;
  relativeOccurrence?: number | null;
  relativeMethod?: number | null;
}

export interface UpdateSlaCalendarHolidayRequest {
  date: string;
  name: string;
  holidayType?: number;
  relativeMonth?: number | null;
  relativeDayOfWeek?: number | null;
  relativeOccurrence?: number | null;
  relativeMethod?: number | null;
}

export interface SlaCalendarCreateResponse {
  id: string;
}

export interface SlaCalendarUpdateResponse {
  id: string;
  name: string;
}

export interface TicketEscalationRule {
  id: string;
  workflowProfileId: string;
  name: string;
  triggerAtSlaPercent: number;
  triggerAtHoursBefore: number;
  reassignToUserId: string | null;
  reassignToDepartmentId: string | null;
  bumpPriority: boolean;
  notifyAssignee: boolean;
  isActive: boolean;
}

export interface CreateEscalationRuleRequest {
  workflowProfileId: string;
  name: string;
  triggerAtSlaPercent?: number;
  triggerAtHoursBefore?: number;
  reassignToUserId?: string | null;
  reassignToDepartmentId?: string | null;
  bumpPriority?: boolean;
  notifyAssignee?: boolean;
}

export interface UpdateEscalationRuleRequest {
  name: string;
  triggerAtSlaPercent?: number;
  triggerAtHoursBefore?: number;
  reassignToUserId?: string | null;
  reassignToDepartmentId?: string | null;
  bumpPriority?: boolean;
  notifyAssignee?: boolean;
  isActive?: boolean;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  author: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketWatcher {
  id: string;
  ticketId: string;
  userId: string;
  addedBy?: string | null;
  addedAt: string;
}

export interface AddTicketWatcherRequest {
  userId: string;
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

export interface LogFacetCount {
  key: string;
  count: number;
}

export interface LogScopeFacetCount {
  id: string;
  name: string | null;
  count: number;
}

export interface LogCursorPage {
  items: LogEntry[];
  returnedItems: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  search: string | null;
  traceId: string | null;
  correlationId: string | null;
  requestPath: string | null;
  statusCode: number | null;
  period: string | null;
  from: string | null;
  to: string | null;
}

// ── Generic cursor page (reusable across modules) ─────────

export interface CursorPageDto<T> {
  items: T[];
  returnedItems: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface LogSummary {
  total: number;
  search: string | null;
  traceId: string | null;
  correlationId: string | null;
  requestPath: string | null;
  statusCode: number | null;
  period: string | null;
  from: string | null;
  to: string | null;
  levels: LogFacetCount[];
  sources: LogFacetCount[];
  types: LogFacetCount[];
  clients: LogScopeFacetCount[];
  sites: LogScopeFacetCount[];
  agents: LogScopeFacetCount[];
}

export interface LogScopeOption {
  value: string;
  id: number;
}

export interface LogScopeClientOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface LogScopeSiteOption {
  id: string;
  clientId: string;
  name: string;
  isActive: boolean;
}

export interface LogScopeAgentOption {
  id: string;
  label: string;
  hostname: string;
  siteId: string;
  status?: string | null;
}

export interface LogScopeOptions {
  canViewAll: boolean;
  clients: LogScopeClientOption[];
  sites: LogScopeSiteOption[];
  agents: LogScopeAgentOption[];
  logLevels: LogScopeOption[];
  logSources: LogScopeOption[];
  logTypes: LogScopeOption[];
}

export interface DeployToken {
  id: string;
  token: string;
  description: string | null;
  expiresAt: string | null;
  multiUse: boolean;
  createdAt: string;
  revokedAt?: string | null;
  isActive?: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  token?: string | null;
  maskedToken?: string | null;
  prefix?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  isActive?: boolean;
}

export interface MonitoringEvent {
  id: string;
  clientId?: string | null;
  siteId?: string | null;
  agentId?: string | null;
  alertCode?: string | null;
  severity?: number | null;
  title?: string | null;
  message?: string | null;
  metricKey?: string | null;
  metricValue?: number | null;
  payloadJson?: string | null;
  labels?: string[] | null;
  source?: number | null;
  sourceRefId?: string | null;
  correlationId?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MonitoringAutoTicketDecision {
  id?: string | null;
  monitoringEventId?: string | null;
  ruleId?: string | null;
  ticketId?: string | null;
  decision?: string | null;
  reason?: string | null;
  note?: string | null;
  createdAt?: string | null;
  matched?: boolean | null;
}

export interface BackgroundService {
  name: string;
  displayName?: string | null;
  description?: string | null;
  jobGroup?: string | null;
  jobName?: string | null;
  status?: string | null;
  isRunning?: boolean | null;
  isEnabled?: boolean | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastError?: string | null;
}

export interface AdminJobActionResult {
  jobGroup: string;
  jobName: string;
  action: string;
  success?: boolean | null;
  message?: string | null;
  status?: string | null;
}

export interface DeployInstallerPayload {
  fileName: string;
  blob: Blob;
}

export type DeployInstallerType = "online" | "offline";

export type DeployInstallerTypeInput =
  | DeployInstallerType
  | "installer"
  | "portable";

export interface DeployInstallerOption {
  type: DeployInstallerType;
  displayName: string;
  description: string;
  requiresInternet: boolean;
  fileExtension: string;
  recommended: boolean;
}

export interface DeployInstallerOptionsResponse {
  tokenId: string;
  clientId: string;
  siteId: string;
  expiresAt: string | null;
  options: DeployInstallerOption[];
}

export interface ListDeployTokensParams {
  clientId?: string;
  siteId?: string;
}

export interface DownloadDeployPackageRequest {
  rawToken: string;
  artifact: string | null;
}

export interface PrebuildAgentRequest {
  forceRebuild: boolean;
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

export enum ConfigurationPriorityType {
  Block = 0,
  Global = 2,
  Client = 3,
  Site = 4,
  Agent = 5,
}

export enum AppStorePolicyTypeEnum {
  Disabled = 0,
  PreApproved = 1,
  All = 2,
}

export type AppStorePolicyType = "Disabled" | "PreApproved" | "All" | 0 | 1 | 2;

export interface AutoUpdateSettings {
  enabled: boolean;
  checkEveryHours: number;
  allowUserDelay: boolean;
  maxDelayHours: number;
  forceRestartDelay: boolean;
  restartDelayHours: number;
  updateOnLogon: boolean;
  maintenanceWindows?: Record<string, unknown>[];
  silentInstall: boolean;
  autoRollbackOnFailure: boolean;
}

export interface AIIntegrationSettings {
  enabled: boolean;
  chatAIEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  mspServers?: string[];
  timeoutMs?: number;
  maxTokensPerRequest?: number;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingBaseUrl?: string;
  embeddingApiKey?: string;
  promptTemplate?: string;
  temperature?: number;
  embeddingEnabled?: boolean;
  embeddingArticlesEnabled?: boolean;
  maxHistoryMessages?: number;
  maxKbContextTokens?: number;
  rateLimitPerMinute?: number;
  tokenBudgetDaily?: number;
  costControlEnabled?: boolean;
  minSimilarityScore?: number;
  maxKbChunks?: number;
  // ── Fase 3: Sampling Parameters ──
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number | null;
  // ── OpenRouter features ──
  reasoningEnabled?: boolean;
  reasoningEffort?: string | null;
  webSearchEnabled?: boolean;
  responseFormat?: string | null;
  // ── Fase 4: Rerank ──
  rerankEnabled?: boolean;
  rerankModel?: string;
  rerankTopN?: number;
  // ── Fase 5: Chunking ──
  chunkingStrategy?: string;
  chunkSizeTokens?: number;
  chunkOverlapTokens?: number;
  // ── Fase 6: Citations ──
  citationsEnabled?: boolean;
}

export interface AIIntegrationSettingsOverride {
  enabled?: boolean;
  chatAIEnabled?: boolean;
  knowledgeBaseEnabled?: boolean;
  chatModel?: string;
  promptTemplate?: string;
  temperature?: number;
  maxTokensPerRequest?: number;
  maxHistoryMessages?: number;
  maxKbContextTokens?: number;
  maxKbChunks?: number;
  minSimilarityScore?: number;
}

export interface ReportingSettings {
  databaseRetentionDays: number;
  fileRetentionDays: number;
  allowedRetentionDays?: number[];
}

export interface NatsSettingsRequest {
  natsEnabled?: boolean | null;
  natsAuthEnabled?: boolean | null;
  natsUseWssExternal?: boolean | null;
  natsServerHostInternal?: string | null;
  natsServerHostExternal?: string | null;
  natsAgentJwtTtlMinutes?: number | null;
  natsUserJwtTtlMinutes?: number | null;
}

export interface NatsConnectionTestRequest {
  url?: string | null;
  user?: string | null;
  password?: string | null;
}

export interface ServerRetentionSettings {
  logRetentionDays?: number | null;
  notificationRetentionDays?: number | null;
  agentCommandRetentionDays?: number | null;
  sessionRetentionDays?: number | null;
  tokenExpiredGraceDays?: number | null;
  syncPingRetentionDays?: number | null;
  telemetryRetentionDays?: number | null;
  automationReportRetentionDays?: number | null;
  databaseMaintenance?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface TriggerMaintenanceRequest {
  jobs?: string[] | null;
}

export interface AiCredentialQuery {
  scopeType?: string;
  clientId?: string;
  siteId?: string;
}

export interface AiProviderCredentialUpsertRequest {
  scopeType: string;
  clientId?: string | null;
  siteId?: string | null;
  provider: string;
  baseUrl?: string | null;
  embeddingBaseUrl?: string | null;
  apiKey?: string | null;
  embeddingApiKey?: string | null;
}

export interface AiModelQuery {
  provider?: string;
  capability?: string;
  search?: string;
  refresh?: boolean;
  freeOnly?: boolean;
  clientId?: string;
  siteId?: string;
}

export interface AiModelScopeQuery {
  clientId?: string;
  siteId?: string;
}

export interface AiModelValidationRequest {
  modelId: string;
  capability?: string | null;
  clientId?: string | null;
  siteId?: string | null;
}

export interface BrandingSettings {
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
}

export interface ServerConfiguration {
  id: string;
  recoveryEnabled: boolean;
  discoveryEnabled: boolean;
  p2PFilesEnabled: boolean;
  cloudBootstrapEnabled: boolean;
  chatAIEnabled: boolean;
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
  meshCentralGroupPolicyProfile: string;
  reportingSettingsJson?: string;
  ticketAttachmentSettingsJson?: string;
  objectStorageBucketName?: string;
  objectStorageEndpoint?: string;
  objectStorageRegion?: string;
  objectStorageAccessKey?: string;
  objectStorageSecretKey?: string;
  objectStorageUrlTtlHours?: number;
  objectStorageUsePathStyle?: boolean;
  objectStorageSslVerify?: boolean;
  natsEnabled?: boolean;
  natsAuthEnabled?: boolean;
  natsUseWssExternal?: boolean;
  natsServerHostInternal?: string;
  natsServerHostExternal?: string;
  natsAgentJwtTtlMinutes?: number;
  natsUserJwtTtlMinutes?: number;
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
  cloudBootstrapEnabled?: boolean | null;
  chatAIEnabled?: boolean | null;
  supportEnabled?: boolean | null;
  knowledgeBaseEnabled?: boolean | null;
  appStorePolicy?: AppStorePolicyType | null;
  aiIntegrationSettingsJson?: string | null;
  meshCentralGroupPolicyProfile?: string | null;
  inventoryIntervalHours?: number | null;
  autoUpdateSettingsJson?: string | null;
  tokenExpirationDays?: number | null;
  maxTokensPerAgent?: number | null;
  agentHeartbeatIntervalSeconds?: number | null;
  agentOfflineThresholdSeconds?: number | null;
  lockedFieldsJson?: string | null;
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
  cloudBootstrapEnabled?: boolean | null;
  chatAIEnabled?: boolean | null;
  supportEnabled?: boolean | null;
  knowledgeBaseEnabled?: boolean | null;
  appStorePolicy?: AppStorePolicyType | null;
  aiIntegrationSettingsJson?: string | null;
  meshCentralGroupPolicyProfile?: string | null;
  inventoryIntervalHours?: number | null;
  autoUpdateSettingsJson?: string | null;
  timezone?: string | null;
  location?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  lockedFieldsJson?: string | null;
  meshCentralGroupName?: string | null;
  meshCentralMeshId?: string | null;
  meshCentralAppliedGroupPolicyProfile?: string | null;
  meshCentralAppliedGroupPolicyAt?: string | null;
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
  cloudBootstrapEnabled: boolean;
  chatAIEnabled: boolean;
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
  meshCentralGroupPolicyProfile?: string | null;
  inheritance?: Record<string, number>;
  blockedFields?: string[];
  resolvedAt: string;
  [key: string]: ConfigurationValue | null | undefined;
}

export interface ConfigurationFieldMetadata {
  sourceType?: ConfigurationPriorityType;
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

// ── Power Management DTOs ──────────────────────────────

export interface RestartRequest {
  delaySeconds?: number;
  force?: boolean;
  message?: string;
}

export interface ShutdownRequest {
  delaySeconds?: number;
  force?: boolean;
  message?: string;
}

export interface WakeOnLanRequest {
  broadcastAddress?: string;
}

export interface WakeOnLanResponse {
  dispatchId: string;
  onlineAgentsInSite: number;
  onlineAgentHostnames: string[];
  targetMacAddress: string;
  targetHostname: string;
  broadcastAddress: string;
  expiresAtUtc: string;
}

export interface PowerCommandResponse {
  commandId: string;
  agentId: string;
  commandType: string;
  delaySeconds: number;
  force: boolean;
  status: string;
}

// ── Site Power Management DTOs ─────────────────────────

export interface SiteRestartRequest {
  delaySeconds?: number;
  force?: boolean;
  message?: string;
}

export interface SiteShutdownRequest {
  delaySeconds?: number;
  force?: boolean;
  message?: string;
}

export interface SiteFanoutResponseDto {
  dispatchId: string;
  subject: string;
  targetScope: string;
  idempotencyKey: string | null;
  onlineAgents: number;
}

export interface SiteWakeOnLanResponse {
  dispatchId: string;
  targetCount: number;
  onlineRelayCount: number;
  targetAgentNames: string[];
  macAddresses: string[];
  expiresAtUtc: string;
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
  customFieldValues?: Record<string, unknown>;
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

export interface CreateDeployTokenAndDownloadRequest {
  clientId: string;
  siteId: string;
  description: string | null;
  expiresInHours: number | null;
  multiUse: boolean | null;
  installerType: DeployInstallerType;
}

export interface CreateApiTokenRequest {
  name: string;
  expiresAt?: string | null;
}

export interface CreateMonitoringEventRequest {
  clientId: string;
  siteId?: string | null;
  agentId: string;
  alertCode: string;
  severity: number;
  title?: string | null;
  message?: string | null;
  metricKey?: string | null;
  metricValue?: number | string | null;
  payloadJson?: string | null;
  labels?: string[] | null;
  source: number;
  sourceRefId?: string | null;
  correlationId?: string | null;
  occurredAt?: string | null;
  evaluateAutoTicket?: boolean;
}

export interface DeployInstallerOptionsRequest {
  rawToken: string;
}

export interface DownloadDeployInstallerRequest {
  rawToken: string;
  installerType: DeployInstallerTypeInput;
}

export interface DownloadPackageRequest {
  rawToken: string;
  artifact: string | null;
}

// CreateLogRequest removido — logs são gerados automaticamente pela API (LoggingActionFilter).
// O frontend não deve criar logs diretamente.

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
  /**
   * Ignorado pelo backend: o autor é sempre resolvido do usuário autenticado
   * (HttpContext.Items["Username"]) a partir do token JWT.
   */
  author?: string | null;
  isPinned?: boolean;
}

export interface UpdateNoteRequest {
  content: string;
  /**
   * Ignorado pelo backend: o autor é sempre resolvido do usuário autenticado.
   */
  author?: string | null;
  isPinned?: boolean;
}

export type KnowledgeSearchMode = "semantic" | "keyword" | "hybrid";
export type ArticleStatus = "Draft" | "Published" | "Internal";

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  createdBy: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  status: ArticleStatus;
  scope: string;
  scopeOrigin?: string | null;
  clientId: string | null;
  siteId: string | null;
  clientName?: string | null;
  siteName?: string | null;
  departmentId: string | null;
  currentVersionNumber: number;
  publishedAt: string | null;
  chunkCount: number;
  embeddingsReady: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Sub-páginas internas do artigo (estilo Notion) ──────────────

export interface ArticlePageTreeNode {
  id: string;
  articleId: string;
  parentPageId: string | null;
  title: string;
  content: string;
  sortOrder: number;
  childCount: number;
  children: ArticlePageTreeNode[];
}

export interface ArticlePage {
  id: string;
  articleId: string;
  parentPageId: string | null;
  title: string;
  content: string;
  sortOrder: number;
  childCount: number;
  children: ArticlePage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateArticlePageRequest {
  title: string;
  content: string;
  parentPageId?: string | null;
  sortOrder?: number;
}

export interface UpdateArticlePageRequest {
  title: string;
  content: string;
  parentPageId?: string | null;
  sortOrder?: number;
}

export interface ArticleListPage {
  items: KnowledgeArticle[];
  count: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ArticleVersion {
  id: string;
  articleId: string;
  versionNumber: number;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  status: string;
  editedBy: string | null;
  changeSummary: string | null;
  createdAt: string;
}

export interface CreateKnowledgeArticleRequest {
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  createdBy?: string | null;
  clientId: string | null;
  siteId: string | null;
  departmentId?: string | null;
}

export interface UpdateKnowledgeArticleRequest {
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  lastEditedBy?: string | null;
}

export interface PublishArticleRequest {
  status: "Published" | "Internal";
  lastEditedBy?: string | null;
  changeSummary?: string | null;
}

export interface KbSearchRequest {
  query: string;
  clientId?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  mode?: KnowledgeSearchMode;
  maxResults?: number;
}

export interface KnowledgeListQuery {
  clientId?: string;
  siteId?: string;
  status?: ArticleStatus;
  departmentId?: string;
  category?: string;
  scopeMode?: "all-visible";
  cursor?: string;
  limit?: number;
}

export interface KnowledgeSearchQuery {
  q: string;
  clientId?: string;
  siteId?: string;
  departmentId?: string;
  mode?: KnowledgeSearchMode;
  maxResults?: number;
  scopeMode?: "all-visible";
}

export interface LinkTicketKnowledgeRequest {
  articleId: string;
  linkedBy?: string | null;
  note?: string | null;
}

export interface TicketKnowledgeSuggestQuery {
  q: string;
  clientId?: string;
  siteId?: string;
  departmentId?: string;
  maxResults?: number;
}

export interface KbSearchResult {
  articleId: string;
  articleTitle: string;
  sectionTitle: string | null;
  excerpt: string;
  category: string | null;
  scope: string;
  scopeOrigin?: string | null;
  clientId: string | null;
  siteId: string | null;
  clientName?: string | null;
  siteName?: string | null;
  score: number | null;
}

export interface KbSuggestResult {
  suggestions: KbSearchResult[];
}

// ── Ticket Attachments ─────────────────────────────────

export interface TicketAttachment {
  id: string;
  entityType: string;
  entityId: string;
  clientId: string;
  fileName: string;
  storageObjectKey: string;
  storageBucket: string;
  contentType: string;
  sizeBytes: number;
  storageChecksum: string | null;
  storageProviderType: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresignedUploadRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignedUploadResponse {
  attachmentId: string;
  objectKey: string;
  uploadUrl: string;
  httpMethod: string;
  expiresAtUtc: string;
}

export interface CompleteUploadRequest {
  attachmentId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}

export interface TicketAttachmentSettings {
  enabled: boolean;
  maxFileSizeBytes: number;
  allowedContentTypes: string[];
  presignedUploadUrlTtlMinutes: number;
}

export enum PsadtAlertType {
  Toast = 0,
  Modal = 1,
}

export enum AlertScopeType {
  Agent = 0,
  Site = 1,
  Client = 2,
  Label = 3,
}

export interface TicketAlertRule {
  id: string;
  workflowStateId: string;
  title: string;
  message: string;
  alertType: PsadtAlertType;
  timeoutSeconds?: number | null;
  actionsJson?: string | null;
  defaultAction?: string | null;
  icon: AgentAlertIcon;
  scopePreference: AlertScopeType;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTicketAlertRuleRequest {
  workflowStateId: string;
  title: string;
  message: string;
  alertType: PsadtAlertType;
  timeoutSeconds?: number | null;
  actionsJson?: string | null;
  defaultAction?: string | null;
  icon?: AgentAlertIcon | null;
  scopePreference: AlertScopeType;
  isEnabled?: boolean | null;
}

export enum AgentAlertScopeType {
  Agent = 0,
  Site = 1,
  Client = 2,
  Label = 3,
}

export type AgentAlertStatus = number;

export interface AgentAlert {
  id: string;
  title: string;
  message: string;
  alertType: number;
  timeoutSeconds?: number | null;
  actionsJson?: string | null;
  defaultAction?: string | null;
  icon?: AgentAlertIcon | null;
  scopeType: AgentAlertScopeType;
  scopeAgentId?: string | null;
  scopeSiteId?: string | null;
  scopeClientId?: string | null;
  scopeLabelName?: string | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  ticketId?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: AgentAlertStatus | null;
}

export interface AgentAlertsQuery {
  status?: AgentAlertStatus;
  scopeType?: AgentAlertScopeType;
  scopeClientId?: string;
  scopeSiteId?: string;
  scopeAgentId?: string;
  ticketId?: string;
  cursor?: string;
  limit?: number;
}

export interface AgentAlertScopeOptionAgent {
  id: string;
  label: string;
  hostname: string | null;
  status: string | number | null;
  clientId?: string | null;
  siteId?: string | null;
}

export interface AgentAlertScopeOptionClient {
  id: string;
  name: string;
}

export interface AgentAlertScopeOptionsResponse {
  agents: AgentAlertScopeOptionAgent[];
  clients: AgentAlertScopeOptionClient[];
  labels: string[];
}

export type AgentAlertIcon = "info" | "success" | "warning" | "error" | string;

export interface CreateAgentAlertRequest {
  title: string;
  message: string;
  alertType: number;
  timeoutSeconds?: number | null;
  actionsJson?: string | null;
  defaultAction?: string | null;
  icon?: AgentAlertIcon | null;
  scopeType: AgentAlertScopeType;
  scopeAgentId?: string | null;
  scopeSiteId?: string | null;
  scopeClientId?: string | null;
  scopeLabelName?: string | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  ticketId?: string | null;
  createdBy?: string | null;
}

export interface AgentAlertTestDispatchRequest {
  testAgentId: string;
  title: string;
  message: string;
  alertType: number;
  timeoutSeconds?: number | null;
  icon?: AgentAlertIcon | null;
  actionsJson?: string | null;
  defaultAction?: string | null;
}

export interface AgentAlertTestDispatchResponse {
  message: string;
  testAgentId: string;
  alertId: string;
}

// ── Query params ───────────────────────────────────────

export interface LogsQuery {
  clientId?: string;
  siteId?: string;
  agentId?: string;
  type?: LogType;
  level?: LogLevel;
  source?: LogSource;
  search?: string;
  traceId?: string;
  correlationId?: string;
  requestPath?: string;
  statusCode?: number;
  period?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface TicketsQuery {
  clientId?: string;
  siteId?: string;
  workflowStateId?: string;
  agentId?: string;
  departmentId?: string;
  workflowProfileId?: string;
  assignedToUserId?: string;
  priority?: TicketPriority;
  slaBreached?: boolean;
  isClosed?: boolean;
  text?: string;
  cursor?: string;
  limit?: number;
}

// ── Reports ────────────────────────────────────────────

// ── Report Enums ──────────────────────────────────────────────

export enum ReportDatasetType {
  SoftwareInventory = 0,
  Logs = 1,
  ConfigurationAudit = 2,
  Tickets = 3,
  AgentHardware = 4,
  AgentInventoryComposite = 5,
  AgentLabels = 6,
  AutomaticLabelRules = 7,
  AutomationExecutions = 8,
  AgentMonitoringEvents = 9,
  AgentAlerts = 10,
  P2pTelemetry = 11,
  AgentDisks = 12,
  NetworkAdapters = 13,
  ListeningPorts = 14,
  Printers = 15,
  SoftwareCatalog = 16,
  AutomationScripts = 17,
  AppPackages = 18,
  TicketActivity = 19,
  TicketEscalations = 20,
  CustomFields = 21,
  KnowledgeBase = 22,
}

export enum ReportFormat {
  Xlsx = 0,
  Pdf = 1,
  Csv = 2,
  Markdown = 3,
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

export enum AgentLabelsOrderBy {
  Label = "label",
  SourceType = "sourceType",
  AgentHostname = "agentHostname",
  UpdatedAt = "updatedAt",
}

export enum KnowledgeBaseOrderBy {
  Title = "title",
  Category = "category",
  Author = "author",
  UpdatedAt = "updatedAt",
}

export enum AgentInventoryCompositeOrderBy {
  SiteName = "siteName",
  AgentHostname = "agentHostname",
  SoftwareName = "softwareName",
  CollectedAt = "collectedAt",
}

export enum AutomaticLabelRulesOrderBy {
  RuleName = "ruleName",
  LabelName = "labelName",
  MatchCount = "matchCount",
  CreatedAt = "createdAt",
}

export enum AutomationExecutionsOrderBy {
  Timestamp = "timestamp",
  AgentHostname = "agentHostname",
  Status = "status",
  ExitCode = "exitCode",
}

// ── Join Compatibility ──────────────────────────────────────

export interface JoinCompatibilityItem {
  sourceA: string;
  sourceB: string;
  commonKeys: string[];
  preferredKey: string;
  recommendedJoinType: string;
}

export interface JoinCompatibilityResponse {
  compatibility: Record<string, string[]>;
  joinSuggestions: JoinCompatibilityItem[];
  note: string;
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

export interface DatasetFilterDefinition {
  name: string;
  type: string;
  required: boolean;
  label?: string;
}

export type ReportFormatString =
  | "pdf"
  | "xlsx"
  | "csv"
  | "markdown"
  | "Pdf"
  | "Xlsx"
  | "Csv"
  | "Markdown";
export type ReportFormatValue = ReportFormat | ReportFormatString;
export type PreviewMode = "document" | "html";
export type ResponseDisposition = "inline" | "attachment";
export type ScopeTypeString = "global" | "client" | "site" | "agent";
export type ReportDatasetTypeValue = ReportDatasetType | string;

export interface ReportDatasetFieldMetadata {
  field: string;
  label?: string;
  reference?: string;
  dataType?: string;
  isJoinKey?: boolean;
  defaultAlias?: string;
  datasetName?: string;
  description?: string;
}

export interface ReportDatasetJoinCapability {
  sourceDatasetType?: ReportDatasetTypeValue;
  targetDatasetType?: ReportDatasetTypeValue;
  sourceKey: string;
  targetKey: string;
  joinTypes?: string[];
  description?: string;
}

export interface LayoutSchemaLimits {
  maxLayoutJsonLength?: number;
  maxColumns?: number;
  maxSections?: number;
  maxSectionColumns?: number;
  maxSummaries?: number;
  maxGroupDetails?: number;
}

export interface LayoutSchemaResponse {
  previewModes: PreviewMode[];
  responseDispositions: ResponseDisposition[];
  supportedOrientations: string[];
  supportedColumnFormats: string[];
  supportedSummaryAggregates: string[];
  multiSource?: {
    enabled?: boolean;
    fieldReferenceMode?: string;
    dataSources?: Array<{
      datasetType: ReportDatasetTypeValue;
      datasetName?: string;
      defaultAlias?: string;
      description?: string;
    }>;
    joinTypes?: string[];
    joinRules?: Array<{
      sourceDatasetType?: ReportDatasetTypeValue;
      targetDatasetType?: ReportDatasetTypeValue;
      sourceKey: string;
      targetKey: string;
      joinType?: string;
      description?: string;
    }>;
    notes?: string[];
  };
  limits?: LayoutSchemaLimits;
  notes?: string[];
}

export interface ReportLayoutColumnDefinition {
  field: string;
  header?: string;
  label?: string;
  format?: string;
  width?: string;
  align?: "left" | "center" | "right" | string;
}

export interface ReportLayoutDetailDefinition {
  field: string;
  label: string;
}

export interface ReportLayoutSummaryDefinition {
  field?: string;
  label: string;
  aggregate: string;
}

export interface ReportLayoutSectionDefinition {
  title: string;
  source?: string;
  columns: ReportLayoutColumnDefinition[];
}

export interface ReportLayoutDataSourceJoinDefinition {
  joinToAlias: string;
  sourceKey: string;
  targetKey: string;
  joinType?: string;
}

export interface ReportLayoutDataSourceDefinition {
  datasetType: ReportDatasetTypeValue;
  alias: string;
  join?: ReportLayoutDataSourceJoinDefinition;
}

export interface ReportLayoutStyleDefinition {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  alternateRowColor?: string;
  borderColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  logoMaxHeightPx?: number;
  showRowStripes?: boolean;
}

export interface ReportLayoutWatermarkDefinition {
  text?: string;
  color?: string;
  fontSize?: number;
  angle?: number;
  repeat?: boolean;
  useLogo?: boolean;
  logoUrl?: string;
  imageUrl?: string;
  imageFit?: "contain" | "cover" | string;
  imageOpacity?: number;
}

export interface ReportLayoutDefinition {
  title: string;
  subtitle?: string;
  orientation?: string;
  logoUrl?: string;
  dataSources?: ReportLayoutDataSourceDefinition[];
  groupBy?: string;
  groupTitleTemplate?: string;
  groupTitlePrefix?: string;
  hideGroupColumn?: boolean;
  columns?: ReportLayoutColumnDefinition[];
  sections?: ReportLayoutSectionDefinition[];
  groupDetails?: ReportLayoutDetailDefinition[];
  summaries?: ReportLayoutSummaryDefinition[];
  groupSummaries?: ReportLayoutSummaryDefinition[];
  style?: ReportLayoutStyleDefinition;
  watermark?: ReportLayoutWatermarkDefinition;
}

export interface ReportTemplateContractInput {
  name: string;
  datasetKey?: string;
  datasetType?: ReportDatasetTypeValue;
  description?: string | null;
  format?: ReportFormatValue;
  defaultFormat?: ReportFormatValue;
  scopeType?: ScopeTypeString | ReportScopeType;
  filtersJson?: string | null;
  layoutJson?: string;
}

export interface PreviewReportRequest {
  templateId?: string;
  template?: ReportTemplateContractInput;
  format?: ReportFormatValue;
  filtersJson?: string | null;
  fileName?: string;
  responseDisposition?: ResponseDisposition;
  previewMode?: PreviewMode;
}

export interface PreviewReportResponse {
  mode: PreviewMode;
  contentType: string;
  headers: {
    rowCount?: number;
    title?: string;
    format?: string;
    isPreview: boolean;
    disposition?: string | null;
  };
  html?: string;
  blob?: Blob;
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
  type?: string;
  key?: string;
  datasetType?: ReportDatasetTypeValue;
  name?: string;
  description?: string;
  fields?: string[];
  formats?: ReportFormat[];
  supportedFormats?: ReportFormatString[];
  defaultFormat?: ReportFormatString;
  filters?: DatasetFilterDefinition[];
  fieldMetadata?: ReportDatasetFieldMetadata[];
  joinCapabilities?: ReportDatasetJoinCapability[];
  executionSchema?: ReportExecutionSchema;
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
  datasetKey?: string;
  datasetType: ReportDatasetTypeValue;
  instructions?: string | null;
  executionSchema: ReportExecutionSchema;
  executionSchemaJson?: Record<string, any> | null;
  format?: ReportFormatValue;
  defaultFormat: ReportFormatValue;
  scopeType?: ScopeTypeString | ReportScopeType;
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
  datasetKey?: string;
  datasetType: ReportDatasetTypeValue;
  instructions?: string | null;
  executionSchemaJson?: Record<string, any> | null;
  format?: ReportFormatValue;
  defaultFormat?: ReportFormatValue;
  scopeType?: ScopeTypeString | ReportScopeType;
  layoutJson?: string;
  filtersJson?: string | null;
  createdBy?: string | null;
}

export interface UpdateReportTemplateRequest {
  name?: string;
  description?: string | null;
  datasetKey?: string;
  datasetType?: ReportDatasetTypeValue;
  instructions?: string | null;
  executionSchemaJson?: Record<string, any> | null;
  format?: ReportFormatValue;
  defaultFormat?: ReportFormatValue;
  scopeType?: ScopeTypeString | ReportScopeType;
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
  datasetType: ReportDatasetTypeValue;
  defaultFormat: ReportFormatValue;
  layoutJson: string;
  filtersJson: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface ReportAutocompleteItem {
  datasetType: ReportDatasetTypeValue;
  datasetKey?: string;
  datasetName?: string;
  field: string;
  reference: string;
  dataType?: string;
  isJoinKey?: boolean;
  defaultAlias?: string;
}

export interface ReportAutocompleteResponse {
  fieldReferenceMode?: string;
  total: number;
  items: ReportAutocompleteItem[];
}

// ── Report Schedules ──────────────────────────────────────

export enum ReportScheduleFrequency {
  Daily = 0,
  Weekly = 1,
  Monthly = 2,
}

export interface ReportSchedule {
  id: string;
  templateId: string;
  clientId: string | null;
  name: string;
  frequency: ReportScheduleFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  minuteUtc: number;
  format: ReportFormatValue;
  filtersJson: string | null;
  recipients: string[] | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportScheduleRequest {
  templateId: string;
  clientId?: string | null;
  name: string;
  frequency: ReportScheduleFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hourUtc: number;
  minuteUtc: number;
  format?: ReportFormatValue;
  filtersJson?: string | null;
  recipients?: string[] | null;
  isActive?: boolean;
}

export interface UpdateReportScheduleRequest {
  name?: string;
  frequency?: ReportScheduleFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hourUtc?: number;
  minuteUtc?: number;
  format?: ReportFormatValue;
  filtersJson?: string | null;
  recipients?: string[] | null;
  isActive?: boolean;
}

// ── Report Library Templates ──────────────────────────────

export interface ReportLibraryTemplate {
  id: string;
  name: string;
  description: string | null;
  datasetType: ReportDatasetTypeValue;
  defaultFormat: ReportFormatValue;
  layoutJson: string;
  filtersJson: string | null;
  isBuiltIn: boolean;
  category: string | null;
  tags: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

// ── Knowledge Feedback ────────────────────────────────────

export interface KbLinkFeedbackRequest {
  useful: boolean;
}

// ── Agent Approve Zero-Touch ──────────────────────────────

export interface ApproveZeroTouchResponse {
  message: string;
  agentId: string;
}

// ── App Store ──────────────────────────────────────────────

export enum AppInstallationType {
  Winget = 0,
  Chocolatey = 1,
  Custom = 2,
}

export enum AppApprovalScopeType {
  Global = 0,
  Client = 1,
  Site = 2,
  Agent = 3,
}

export enum AppApprovalActionType {
  Allow = 0,
  Deny = 1,
}

export enum AppApprovalAuditChangeType {
  Created = 0,
  Updated = 1,
  Deleted = 2,
}

export interface AppStoreCatalogPackage {
  packageId: string;
  name: string | null;
  publisher: string | null;
  description: string | null;
  version: string | null;
  architecture: string | null;
  installationType: AppInstallationType;
  installCommand?: string | null;
  lastUpdated?: string | null;
  installerUrlsByArch?: Record<string, string>;
  icon?: string | null;
  homepage?: string | null;
  license?: string | null;
  category?: string | null;
  tags?: string[] | null;
}

export interface AppStoreCatalogPage {
  items: AppStoreCatalogPackage[];
  count: number;
  generatedAt?: string | null;
  totalPackagesInSource?: number;
  returnedItems?: number;
  cursor: string | null;
  nextCursor: string | null;
  limit?: number;
  hasMore: boolean;
  search?: string | null;
  architecture?: string | null;
}

export interface SyncChocolateyCatalogResponse {
  installationType?: AppInstallationType | null;
  success: boolean;
  packagesUpserted: number;
  pagesProcessed?: number;
  syncedAt?: string | null;
  sourceGeneratedAt?: string | null;
  duration?: string | null;
  error?: string | null;
}

export interface AppApprovalRule {
  ruleId: string;
  id?: string;
  scopeType: AppApprovalScopeType;
  scopeId: string | null;
  installationType: AppInstallationType;
  packageId: string;
  packageName: string | null;
  action: AppApprovalActionType;
  autoUpdateEnabled: boolean | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppApprovalRulesResponse {
  scopeType: AppApprovalScopeType;
  scopeId: string | null;
  installationType: AppInstallationType;
  count: number;
  items: AppApprovalRule[];
}

export interface CreateAppApprovalRuleRequest {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType: AppInstallationType;
  packageId: string;
  action: AppApprovalActionType;
  autoUpdateEnabled?: boolean;
  reason?: string;
}

export interface AppEffectiveEntry {
  packageId: string;
  name?: string | null;
  installCommand?: string | null;
  installerUrlsByArch?: Record<string, string>;
  autoUpdateEnabled: boolean | null;
  sourceScope?: AppApprovalScopeType;
  installationType: AppInstallationType;
  iconUrl?: string | null;
  publisher?: string | null;
  description?: string | null;
  version?: string | null;
}

export interface AppEffectivePage {
  items: AppEffectiveEntry[];
  scopeType?: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
  search?: string | null;
  returnedItems: number;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AppApprovalAuditEntry {
  auditId: string;
  packageId: string;
  scopeType: AppApprovalScopeType;
  scopeId: string | null;
  installationType: AppInstallationType;
  action: AppApprovalActionType;
  autoUpdateEnabled: boolean | null;
  reason: string | null;
  changeType: AppApprovalAuditChangeType;
  changedBy: string | null;
  changedAt: string;
}

export interface AppApprovalAuditPage {
  items: AppApprovalAuditEntry[];
  installationType?: AppInstallationType;
  packageId?: string | null;
  scopeType?: AppApprovalScopeType;
  scopeId?: string | null;
  returnedItems: number;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AppDiffEntry {
  packageId: string;
  packageName: string | null;
  effectiveAction: AppApprovalActionType | null;
  inheritedAction: AppApprovalActionType | null;
  ownAction: AppApprovalActionType | null;
  overridden: boolean;
  installationType: AppInstallationType;
}

export interface AppDiffPage {
  items: AppDiffEntry[];
  count: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Automation ─────────────────────────────────────────────

export enum AutomationTaskActionType {
  InstallPackage = 0,
  UpdatePackage = 1,
  RunScript = 2,
  CustomCommand = 3,
  RemovePackage = 4,
  UpdateOrInstallPackage = 5,
}

export enum AutomationScriptType {
  PowerShell = 0,
  Shell = 1,
  Python = 2,
  Batch = 3,
  Custom = 4,
}

export enum AutomationExecutionSourceType {
  RunNow = 0,
  Scheduled = 1,
  ForceSync = 2,
  AgentManual = 3,
}

export enum AutomationExecutionStatus {
  Dispatched = 0,
  Acknowledged = 1,
  Completed = 2,
  Failed = 3,
}

export enum AutomationScriptChangeType {
  Created = 0,
  Updated = 1,
  Deleted = 2,
  Consumed = 3,
  Activated = 4,
  Deactivated = 5,
}

export enum AutomationTaskChangeType {
  Created = 0,
  Updated = 1,
  Deleted = 2,
  Activated = 3,
  Deactivated = 4,
  Synced = 5,
}

export interface AutomationScriptSummary {
  id: string;
  clientId: string | null;
  name: string;
  summary: string;
  scriptType: AutomationScriptType | string | number;
  version: string;
  executionFrequency: string;
  triggerModes: string[];
  isActive: boolean;
  lastUpdatedAt: string;
  createdAt: string;
}

export interface AutomationScriptDetail extends AutomationScriptSummary {
  content: string;
  contentHashSha256: string;
  parametersSchemaJson: string | null;
  metadataJson: string | null;
  updatedAt: string;
}

export interface AutomationScriptConsume extends AutomationScriptDetail {
  scriptId: string;
}

export interface CreateAutomationScriptRequest {
  clientId?: string | null;
  name: string;
  summary: string;
  scriptType: AutomationScriptType;
  version?: string | null;
  executionFrequency?: string | null;
  triggerModes: string[];
  content: string;
  parametersSchemaJson?: string | null;
  metadataJson?: string | null;
  isActive?: boolean;
}

export interface UpdateAutomationScriptRequest extends CreateAutomationScriptRequest {
  reason?: string | null;
}

export interface AutomationScriptAudit {
  id: string;
  scriptId: string;
  changeType: AutomationScriptChangeType | string | number;
  reason: string | null;
  oldValueJson: string | null;
  newValueJson: string | null;
  changedBy: string | null;
  ipAddress: string | null;
  correlationId: string | null;
  changedAt: string;
}

export interface AutomationTaskSummary {
  id: string;
  name: string;
  description: string | null;
  actionType: AutomationTaskActionType | string | number;
  scopeType: AppApprovalScopeType | string | number;
  scopeId: string | null;
  scopeName?: string | null;
  clientName?: string | null;
  siteName?: string | null;
  agentName?: string | null;
  deletedAt?: string | null;
  isDeleted?: boolean;
  isActive: boolean;
  requiresApproval: boolean;
  lastUpdatedAt: string;
}

export interface AutomationTaskDetail extends AutomationTaskSummary {
  installationType: AppInstallationType | string | number | null;
  packageId: string | null;
  scriptId: string | null;
  commandPayload: string | null;
  includeTags: string[];
  excludeTags: string[];
  triggerImmediate: boolean;
  triggerRecurring: boolean;
  triggerOnUserLogin: boolean;
  triggerOnAgentCheckIn: boolean;
  scheduleCron: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationTaskRequest {
  name: string;
  description?: string | null;
  actionType: AutomationTaskActionType;
  installationType?: AppInstallationType | null;
  packageId?: string | null;
  scriptId?: string | null;
  commandPayload?: string | null;
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  includeTags?: string[];
  excludeTags?: string[];
  triggerImmediate?: boolean;
  triggerRecurring?: boolean;
  triggerOnUserLogin?: boolean;
  triggerOnAgentCheckIn?: boolean;
  scheduleCron: string | null;
  requiresApproval?: boolean;
  isActive?: boolean;
}

export interface UpdateAutomationTaskRequest extends CreateAutomationTaskRequest {
  reason?: string | null;
}

export interface AutomationTaskAudit {
  id: string;
  taskId: string;
  changeType: AutomationTaskChangeType | string | number;
  reason: string | null;
  oldValueJson: string | null;
  newValueJson: string | null;
  changedBy: string | null;
  ipAddress: string | null;
  correlationId: string | null;
  changedAt: string;
}

export interface AutomationRunNowTaskResponse {
  command: AgentCommand;
  taskId: string;
  taskName?: string | null;
}

export interface AutomationRunNowScriptResponse {
  command: AgentCommand;
  scriptId: string;
  version?: string | null;
  contentHashSha256?: string | null;
}

export interface AutomationForceSyncRequest {
  policies?: boolean;
  inventory?: boolean;
  software?: boolean;
  appStore?: boolean;
}

export interface AutomationExecutionReport {
  id: string;
  commandId: string;
  agentId: string;
  taskId: string | null;
  scriptId: string | null;
  sourceType: AutomationExecutionSourceType | string | number;
  status: AutomationExecutionStatus | string | number;
  correlationId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resultReceivedAt: string | null;
  exitCode: number | null;
  errorMessage: string | null;
  requestMetadataJson: string | null;
  ackMetadataJson: string | null;
  resultMetadataJson: string | null;
}

// ── Agent Transfer ─────────────────────────────────────

export interface TransferAgentRequest {
  targetSiteId: string;
  reason?: string;
}

export interface TransferAgentBulkRequest {
  agentIds: string[];
  targetSiteId: string;
  reason?: string;
}

export interface TransferAgentResponse {
  agent: Agent;
  previousSiteId: string;
  previousClientId: string;
  targetClientId: string;
  isCrossClient: boolean;
  reason: string | null;
}

export interface TransferBulkResult {
  results: TransferAgentResponse[];
  errors: { agentId: string; error: string }[];
  successCount: number;
  errorCount: number;
}

export interface ValidateTransferResponse {
  isValid: boolean;
  messages: string[];
  isCrossClient: boolean;
  previousSiteName: string | null;
  targetSiteName: string | null;
  previousClientName: string | null;
  targetClientName: string | null;
}

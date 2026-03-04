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

export enum TicketPriority {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3,
}

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
  title: string;
  description: string;
  priority: TicketPriority;
  category: string | null;
  assignedTo: string | null;
  workflowStateId: string | null;
  createdAt: string;
  updatedAt: string;
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
  title: string;
  description: string;
  priority: TicketPriority;
  category: string | null;
}

export interface UpdateTicketRequest {
  title: string;
  description: string;
  priority: TicketPriority;
  assignedTo: string | null;
  category: string | null;
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
  limit?: number;
  offset?: number;
}

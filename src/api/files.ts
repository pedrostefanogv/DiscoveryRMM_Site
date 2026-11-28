import { api, API_VERSION_PREFIX } from "./client";

async function apiRequest<T>(path: string, init?: { method?: string; body?: string }): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
  const fullPath = path.startsWith("/api/")
    ? path
    : `${API_VERSION_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
  if (method === "POST") return api.post<T>(fullPath, parsedBody);
  if (method === "PATCH") return api.patch<T>(fullPath, parsedBody);
  if (method === "DELETE") return api.del<T>(fullPath);
  return api.get<T>(fullPath);
}

export type FileScope = 0 | 1 | 2; // 0=Global, 1=Client, 2=Site
export type FileVisibility = 0 | 1 | 2 | 3; // 0=Private, 1=AgentOnly, 2=Public, 3=PublicWebOnly
export type FileSource = 0 | 1; // 0=AdminUpload, 1=ClientUploadLink

export function normalizeFileScope(value: unknown): FileScope {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "client") return 1;
    if (s === "site") return 2;
  }
  return 0;
}

export function normalizeFileVisibility(value: unknown): FileVisibility {
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  if (value === 3 || value === "3") return 3;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "agentonly" || s === "agent_only") return 1;
    if (s === "public") return 2;
    if (s === "publicwebonly" || s === "public_web_only") return 3;
  }
  return 0;
}

export function normalizeFileSource(value: unknown): FileSource {
  if (value === 1 || value === "1") return 1;
  if (typeof value === "string" && value.trim().toLowerCase() === "clientuploadlink") return 1;
  return 0;
}

function normalizeManagedSummary(s: ManagedFileSummaryDto): ManagedFileSummaryDto {
  return {
    ...s,
    scope: normalizeFileScope(s.scope),
    folderPath: s.folderPath || "/",
  };
}

function normalizeManagedFile(f: ManagedFileDto): ManagedFileDto {
  return {
    ...f,
    scope: normalizeFileScope(f.scope),
    visibility: normalizeFileVisibility(f.visibility),
    source: normalizeFileSource(f.source),
    folderPath: f.folderPath || "/",
  };
}

function normalizeManagedFolder(f: ManagedFileFolderDto): ManagedFileFolderDto {
  return {
    ...f,
    scope: normalizeFileScope(f.scope),
    visibility: normalizeFileVisibility(f.visibility),
    path: f.path || "/",
    parentPath: f.parentPath || "/",
  };
}

function normalizeShareLink(l: FileShareLinkDto): FileShareLinkDto {
  return {
    ...l,
    files: (l.files || []).map(normalizeManagedSummary),
  };
}

export interface ManagedFileDto {
  id: string;
  name: string;
  fileName: string;
  description?: string | null;
  category?: string | null;
  folderPath: string;
  tags: string[];
  scope: FileScope;
  clientId?: string | null;
  clientName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  visibility: FileVisibility;
  source: FileSource;
  sourceUploadLinkId?: string | null;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  downloadCount: number;
  isActive: boolean;
  expiresAtUtc?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedFileSummaryDto {
  id: string;
  name: string;
  fileName: string;
  description?: string | null;
  category?: string | null;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  scope: FileScope;
  folderPath: string;
}

export interface ManagedFileFolderDto {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  description?: string | null;
  scope: FileScope;
  clientId?: string | null;
  clientName?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  visibility: FileVisibility;
  fileCount: number;
  subfolderCount: number;
  isVirtual: boolean;
  createdBy?: string | null;
  createdAt: string;
}

export interface PagedFilesResult {
  items: ManagedFileDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface FileHubStatsDto {
  totalFiles: number;
  totalBytes: number;
  globalBytes: number;
  clientBytes: number;
  siteBytes: number;
  totalDownloads: number;
  activeShareLinks: number;
  activeUploadLinks: number;
}

export interface FileShareLinkDto {
  id: string;
  shortCode: string;
  title: string;
  message?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  requirePasscode: boolean;
  expiresAtUtc: string;
  maxDownloads?: number | null;
  downloadCount: number;
  isRevoked: boolean;
  isExpired: boolean;
  files: ManagedFileSummaryDto[];
  createdBy?: string | null;
  createdAt: string;
  folderPath?: string | null;
}

export interface FileUploadLinkDto {
  id: string;
  shortCode: string;
  title: string;
  description?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  targetFolderPath: string;
  requirePasscode: boolean;
  expiresAtUtc: string;
  allowMultiple: boolean;
  maxFiles: number;
  uploadedFilesCount: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
  uploadedTotalBytes: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  fileRetentionDays?: number | null;
  notifyOnUpload: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  createdBy?: string | null;
  createdAt: string;
  ticketId?: string | null;
}

export interface FileAccessLogDto {
  id: string;
  eventType: string;
  managedFileId?: string | null;
  shareLinkId?: string | null;
  uploadLinkId?: string | null;
  agentId?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  detailsJson?: string | null;
  createdAt: string;
}

export interface MultipartPartState {
  partNumber: number;
  eTag: string;
  sizeBytes: number;
}

export async function listManagedFiles(params?: {
  scope?: FileScope;
  clientId?: string;
  siteId?: string;
  visibility?: FileVisibility;
  source?: FileSource;
  category?: string;
  folderPath?: string;
  search?: string;
  /** Id do link de upload (File Drop): lista só os arquivos recebidos por ele. */
  sourceUploadLinkId?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<PagedFilesResult> {
  const qs = new URLSearchParams();
  if (params?.scope !== undefined) qs.set("scope", String(params.scope));
  if (params?.clientId) qs.set("clientId", params.clientId);
  if (params?.siteId) qs.set("siteId", params.siteId);
  if (params?.visibility !== undefined) qs.set("visibility", String(params.visibility));
  if (params?.source !== undefined) qs.set("source", String(params.source));
  if (params?.category) qs.set("category", params.category);
  if (params?.folderPath) qs.set("folderPath", params.folderPath);
  if (params?.search) qs.set("search", params.search);
  if (params?.sourceUploadLinkId) qs.set("sourceUploadLinkId", params.sourceUploadLinkId);
  if (params?.includeInactive) qs.set("includeInactive", "true");
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  const res = await apiRequest<PagedFilesResult>(`/files${query ? `?${query}` : ""}`);
  return {
    ...res,
    items: (res.items || []).map(normalizeManagedFile),
  };
}

export async function listManagedFolders(params?: {
  parentPath?: string;
  includeAll?: boolean;
  scope?: FileScope;
  clientId?: string;
  siteId?: string;
  visibility?: FileVisibility;
}): Promise<ManagedFileFolderDto[]> {
  const qs = new URLSearchParams();
  if (params?.parentPath) qs.set("parentPath", params.parentPath);
  if (params?.includeAll) qs.set("includeAll", "true");
  if (params?.scope !== undefined) qs.set("scope", String(params.scope));
  if (params?.clientId) qs.set("clientId", params.clientId);
  if (params?.siteId) qs.set("siteId", params.siteId);
  if (params?.visibility !== undefined) qs.set("visibility", String(params.visibility));
  const query = qs.toString();
  const list = await apiRequest<ManagedFileFolderDto[]>(`/files/folders${query ? `?${query}` : ""}`);
  return (list || []).map(normalizeManagedFolder);
}

export async function createManagedFolder(body: {
  name: string;
  parentPath?: string;
  description?: string | null;
  scope: FileScope;
  clientId?: string | null;
  siteId?: string | null;
  visibility: FileVisibility;
}): Promise<ManagedFileFolderDto> {
  const created = await apiRequest<ManagedFileFolderDto>("/files/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeManagedFolder(created);
}

export async function updateManagedFolder(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    visibility?: FileVisibility;
  },
): Promise<ManagedFileFolderDto> {
  const updated = await apiRequest<ManagedFileFolderDto>(`/files/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return normalizeManagedFolder(updated);
}

export function deleteManagedFolder(id: string, moveFilesToParent = true): Promise<void> {
  return apiRequest<void>(`/files/folders/${id}?moveFilesToParent=${moveFilesToParent ? "true" : "false"}`, {
    method: "DELETE",
  });
}

export function getFileHubStats(): Promise<FileHubStatsDto> {
  return apiRequest<FileHubStatsDto>("/files/stats");
}

export async function uploadManagedFile(
  file: File,
  meta: {
    name: string;
    scope: FileScope;
    clientId?: string | null;
    siteId?: string | null;
    visibility: FileVisibility;
    description?: string;
    category?: string;
    folderPath?: string;
    tags?: string[];
    expiresAtUtc?: string | null;
  },
  onProgress?: (percent: number) => void,
): Promise<ManagedFileDto> {
  const contentType = file.type || "application/octet-stream";
  const begin = await apiRequest<{
    fileId: string;
    objectKey: string;
    mode: "single" | "multipart";
    uploadUrl?: string | null;
    uploadId?: string | null;
    partSizeBytes: number;
  }>("/files/upload/begin", {
    method: "POST",
    body: JSON.stringify({
      name: meta.name,
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
      scope: meta.scope,
      clientId: meta.clientId || null,
      siteId: meta.siteId || null,
      visibility: meta.visibility,
      description: meta.description || null,
      category: meta.category || null,
      folderPath: meta.folderPath || "/",
      tags: meta.tags || [],
      expiresAtUtc: meta.expiresAtUtc || null,
    }),
  });

  if (begin.mode === "single" && begin.uploadUrl) {
    await putBlobWithProgress(begin.uploadUrl, file, contentType, onProgress);
    const completed = await apiRequest<ManagedFileDto>("/files/upload/complete", {
      method: "POST",
      body: JSON.stringify({
        fileId: begin.fileId,
        objectKey: begin.objectKey,
        name: meta.name,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        scope: meta.scope,
        clientId: meta.clientId || null,
        siteId: meta.siteId || null,
        visibility: meta.visibility,
        description: meta.description || null,
        category: meta.category || null,
        folderPath: meta.folderPath || "/",
        tags: meta.tags || [],
        expiresAtUtc: meta.expiresAtUtc || null,
      }),
    });
    return normalizeManagedFile(completed);
  }

  // Multipart direto ao S3
  const uploadId = begin.uploadId!;
  const partSize = begin.partSizeBytes || 10 * 1024 * 1024;
  const totalParts = Math.ceil(file.size / partSize);
  const parts: MultipartPartState[] = [];
  let uploadedBytes = 0;

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const chunk = file.slice(start, end);

      const { url } = await apiRequest<{ partNumber: number; url: string }>(
        `/files/upload/part-url?objectKey=${encodeURIComponent(begin.objectKey)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
        { method: "POST" },
      );

      const eTag = await putBlobWithProgress(url, chunk, undefined, (partPct) => {
        const current = uploadedBytes + (chunk.size * partPct) / 100;
        onProgress?.(Math.min(99, Math.round((current / file.size) * 100)));
      });
      uploadedBytes += chunk.size;
      parts.push({ partNumber, eTag, sizeBytes: chunk.size });
    }

    onProgress?.(100);
    const completed = await apiRequest<ManagedFileDto>("/files/upload/complete", {
      method: "POST",
      body: JSON.stringify({
        fileId: begin.fileId,
        objectKey: begin.objectKey,
        name: meta.name,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        scope: meta.scope,
        clientId: meta.clientId || null,
        siteId: meta.siteId || null,
        visibility: meta.visibility,
        description: meta.description || null,
        category: meta.category || null,
        folderPath: meta.folderPath || "/",
        tags: meta.tags || [],
        expiresAtUtc: meta.expiresAtUtc || null,
        uploadId,
        parts,
      }),
    });
    return normalizeManagedFile(completed);
  } catch (err) {
    await apiRequest(
      `/files/upload/abort?objectKey=${encodeURIComponent(begin.objectKey)}&uploadId=${encodeURIComponent(uploadId)}`,
      { method: "POST" },
    ).catch(() => {});
    throw err;
  }
}

export function putBlobWithProgress(
  url: string,
  blob: Blob,
  contentType?: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (contentType) {
      xhr.setRequestHeader("Content-Type", contentType);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag")?.replace(/"/g, "") ?? "";
        resolve(etag);
      } else {
        reject(new Error(`Falha no upload ao storage (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Erro de rede durante o upload para o storage."));
    xhr.send(blob);
  });
}

export async function updateManagedFile(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    category: string | null;
    folderPath: string;
    scope: FileScope;
    clientId: string | null;
    siteId: string | null;
    visibility: FileVisibility;
    isActive: boolean;
  }>,
): Promise<ManagedFileDto> {
  const updated = await apiRequest<ManagedFileDto>(`/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return normalizeManagedFile(updated);
}

export function deleteManagedFile(id: string): Promise<void> {
  return apiRequest<void>(`/files/${id}`, { method: "DELETE" });
}

export function getManagedFileDownloadUrl(id: string): Promise<{
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
  sha256?: string | null;
}> {
  return apiRequest(`/files/${id}/download-url`);
}

export async function listShareLinks(params?: {
  clientId?: string;
  siteId?: string;
}): Promise<FileShareLinkDto[]> {
  const qs = new URLSearchParams();
  if (params?.clientId) qs.set("clientId", params.clientId);
  if (params?.siteId) qs.set("siteId", params.siteId);
  const query = qs.toString();
  const list = await apiRequest<FileShareLinkDto[]>(`/files/share-links${query ? `?${query}` : ""}`);
  return (list || []).map(normalizeShareLink);
}

export async function createShareLink(body: {
  title: string;
  message?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  fileIds?: string[];
  folderPath?: string | null;
  folderScope?: FileScope | null;
  expiresAtUtc: string;
  requirePasscode: boolean;
  passcode?: string | null;
  maxDownloads?: number | null;
}): Promise<FileShareLinkDto> {
  const created = await apiRequest<FileShareLinkDto>("/files/share-links", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeShareLink(created);
}

export function revokeShareLink(id: string): Promise<void> {
  return apiRequest<void>(`/files/share-links/${id}`, { method: "DELETE" });
}

export function listUploadLinks(params?: {
  clientId?: string;
  siteId?: string;
}): Promise<FileUploadLinkDto[]> {
  const qs = new URLSearchParams();
  if (params?.clientId) qs.set("clientId", params.clientId);
  if (params?.siteId) qs.set("siteId", params.siteId);
  const query = qs.toString();
  return apiRequest<FileUploadLinkDto[]>(`/files/upload-links${query ? `?${query}` : ""}`);
}

export function createUploadLink(body: {
  title: string;
  description?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  targetFolderPath?: string | null;
  expiresAtUtc: string;
  requirePasscode: boolean;
  passcode?: string | null;
  allowMultiple: boolean;
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  fileRetentionDays?: number | null;
  notifyOnUpload: boolean;
  ticketId?: string | null;
}): Promise<FileUploadLinkDto> {
  return apiRequest<FileUploadLinkDto>("/files/upload-links", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function revokeUploadLink(id: string): Promise<void> {
  return apiRequest<void>(`/files/upload-links/${id}`, { method: "DELETE" });
}

export function listTicketUploadLinks(ticketId: string): Promise<FileUploadLinkDto[]> {
  return apiRequest<FileUploadLinkDto[]>(`/tickets/${ticketId}/upload-links`);
}

export function createTicketUploadLink(
  ticketId: string,
  body: {
    title: string;
    description?: string | null;
    expiresAtUtc: string;
    requirePasscode: boolean;
    passcode?: string | null;
    allowMultiple: boolean;
    maxFiles: number;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
    allowedExtensions?: string[];
    allowedMimeTypes?: string[];
    fileRetentionDays?: number | null;
    notifyOnUpload: boolean;
  },
): Promise<FileUploadLinkDto> {
  return apiRequest<FileUploadLinkDto>(`/tickets/${ticketId}/upload-links`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function revokeTicketUploadLink(ticketId: string, linkId: string): Promise<void> {
  return apiRequest<void>(`/tickets/${ticketId}/upload-links/${linkId}`, { method: "DELETE" });
}

export function listFileAccessLogs(eventType?: string): Promise<FileAccessLogDto[]> {
  const qs = eventType ? `?eventType=${encodeURIComponent(eventType)}` : "";
  return apiRequest<FileAccessLogDto[]>(`/files/logs${qs}`);
}

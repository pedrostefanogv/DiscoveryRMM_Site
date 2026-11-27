import { API_BASE_URL, API_VERSION_PREFIX } from "./client";
import { putBlobWithProgress, type ManagedFileSummaryDto, type MultipartPartState } from "./files";

const PUBLIC_BASE = `${API_BASE_URL}${API_VERSION_PREFIX}/public`;

export interface PublicZeroTouchInfo {
  enabled: boolean;
  available: boolean;
  version?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
}

export interface PublicFolderDto {
  path: string;
  name: string;
  parentPath: string;
  description?: string | null;
  fileCount: number;
}

export interface PublicPortalDto {
  enabled: boolean;
  title?: string | null;
  description?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  zeroTouch: PublicZeroTouchInfo;
  files: ManagedFileSummaryDto[];
  categories: string[];
  folders: PublicFolderDto[];
}

export interface PublicShareInfoDto {
  shortCode: string;
  title: string;
  message?: string | null;
  requirePasscode: boolean;
  unlocked: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  isLimitReached: boolean;
  isLocked: boolean;
  lockedUntilUtc?: string | null;
  expiresAtUtc: string;
  maxDownloads?: number | null;
  downloadCount: number;
  files: ManagedFileSummaryDto[];
}

export interface PublicUploadInfoDto {
  shortCode: string;
  title: string;
  description?: string | null;
  requirePasscode: boolean;
  unlocked: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  isQuotaReached: boolean;
  isLocked: boolean;
  lockedUntilUtc?: string | null;
  expiresAtUtc: string;
  allowMultiple: boolean;
  maxFiles: number;
  uploadedFilesCount: number;
  remainingFiles: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
  uploadedTotalBytes: number;
  remainingBytes: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
}

export interface PresignedDownloadResponse {
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
  sha256?: string | null;
  expiresInSeconds: number;
}

async function publicFetch<T>(path: string, init?: RequestInit, sessionToken?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (sessionToken) {
    headers["X-Share-Session"] = sessionToken;
  }

  const res = await fetch(`${PUBLIC_BASE}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Erro HTTP ${res.status}`);
  }
  return data as T;
}

export function getPublicPortal(search?: string, category?: string, folder?: string): Promise<PublicPortalDto> {
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (category) qs.set("category", category);
  if (folder) qs.set("folder", folder);
  const q = qs.toString();
  return publicFetch<PublicPortalDto>(`/downloads/portal${q ? `?${q}` : ""}`);
}

export function getPublicFileDownloadUrl(id: string): Promise<PresignedDownloadResponse> {
  return publicFetch<PresignedDownloadResponse>(`/downloads/files/${id}/download`, {
    method: "POST",
  });
}

export function getZeroTouchDownloadUrl(): string {
  return `${PUBLIC_BASE}/downloads/zerotouch`;
}

export function getPublicShareInfo(shortCode: string, sessionToken?: string | null): Promise<PublicShareInfoDto> {
  return publicFetch<PublicShareInfoDto>(`/downloads/share/${encodeURIComponent(shortCode)}`, undefined, sessionToken);
}

export function verifyPublicSharePasscode(
  shortCode: string,
  passcode: string,
): Promise<{ valid: boolean; sessionToken?: string | null; expiresAtUtc?: string | null; error?: string | null }> {
  return publicFetch(`/downloads/share/${encodeURIComponent(shortCode)}/verify`, {
    method: "POST",
    body: JSON.stringify({ passcode }),
  });
}

export function downloadPublicShareFile(
  shortCode: string,
  fileId: string,
  sessionToken?: string | null,
): Promise<PresignedDownloadResponse> {
  return publicFetch<PresignedDownloadResponse>(
    `/downloads/share/${encodeURIComponent(shortCode)}/files/${fileId}/download`,
    { method: "POST" },
    sessionToken,
  );
}

export function getPublicUploadInfo(shortCode: string, sessionToken?: string | null): Promise<PublicUploadInfoDto> {
  return publicFetch<PublicUploadInfoDto>(`/uploads/${encodeURIComponent(shortCode)}`, undefined, sessionToken);
}

export function verifyPublicUploadPasscode(
  shortCode: string,
  passcode: string,
): Promise<{ valid: boolean; sessionToken?: string | null; expiresAtUtc?: string | null; error?: string | null }> {
  return publicFetch(`/uploads/${encodeURIComponent(shortCode)}/verify`, {
    method: "POST",
    body: JSON.stringify({ passcode }),
  });
}

export async function uploadFileViaPublicLink(
  shortCode: string,
  file: File,
  sessionToken?: string | null,
  onProgress?: (percent: number) => void,
): Promise<ManagedFileSummaryDto> {
  const contentType = file.type || "application/octet-stream";
  const init = await publicFetch<{
    fileId: string;
    objectKey: string;
    mode: "single" | "multipart";
    uploadUrl?: string | null;
    uploadId?: string | null;
    partSizeBytes: number;
  }>(
    `/uploads/${encodeURIComponent(shortCode)}/initiate`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      }),
    },
    sessionToken,
  );

  if (init.mode === "single" && init.uploadUrl) {
    await putBlobWithProgress(init.uploadUrl, file, contentType, onProgress);
    return publicFetch<ManagedFileSummaryDto>(
      `/uploads/${encodeURIComponent(shortCode)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          fileId: init.fileId,
          objectKey: init.objectKey,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      },
      sessionToken,
    );
  }

  const uploadId = init.uploadId!;
  const partSize = init.partSizeBytes || 10 * 1024 * 1024;
  const totalParts = Math.ceil(file.size / partSize);
  const parts: MultipartPartState[] = [];
  let uploadedBytes = 0;

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const chunk = file.slice(start, end);

      const { url } = await publicFetch<{ partNumber: number; url: string }>(
        `/uploads/${encodeURIComponent(shortCode)}/part-url?objectKey=${encodeURIComponent(init.objectKey)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
        { method: "POST" },
        sessionToken,
      );

      const eTag = await putBlobWithProgress(url, chunk, undefined, (partPct) => {
        const current = uploadedBytes + (chunk.size * partPct) / 100;
        onProgress?.(Math.min(99, Math.round((current / file.size) * 100)));
      });
      uploadedBytes += chunk.size;
      parts.push({ partNumber, eTag, sizeBytes: chunk.size });
    }

    onProgress?.(100);
    return await publicFetch<ManagedFileSummaryDto>(
      `/uploads/${encodeURIComponent(shortCode)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          fileId: init.fileId,
          objectKey: init.objectKey,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          uploadId,
          parts,
        }),
      },
      sessionToken,
    );
  } catch (err) {
    await publicFetch(
      `/uploads/${encodeURIComponent(shortCode)}/abort?objectKey=${encodeURIComponent(init.objectKey)}&uploadId=${encodeURIComponent(uploadId)}`,
      { method: "POST" },
      sessionToken,
    ).catch(() => {});
    throw err;
  }
}

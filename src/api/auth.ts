import { api } from "./client";

export interface LoginRequest {
  loginOrEmail: string;
  password: string;
}

export interface LoginResponse {
  mfaToken: string;
  mfaRequired: boolean;
  mfaConfigured: boolean;
  firstAccessRequired: boolean;
  mustChangePassword: boolean;
  mustChangeProfile: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface FirstAccessStatus {
  firstAccessRequired: boolean;
  mustChangePassword: boolean;
  mustChangeProfile: boolean;
  mfaRequired: boolean;
  mfaConfigured: boolean;
}

export interface CompleteFirstAccessRequest {
  newLogin: string;
  newEmail: string;
  newFullName: string;
  currentPassword: string;
  newPassword: string;
}

export interface BeginFido2Response {
  options: string;
}

export interface CompleteFido2AssertionRequest {
  assertionResponseJson: string;
}

export interface CompleteFido2RegistrationRequest {
  attestationResponseJson: string;
  keyName: string;
}

export interface CompleteFido2RegistrationResponse {
  keyId: string;
  message: string;
}

export interface MfaKey {
  id: string;
  name: string;
  keyType: 0 | 1;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RenameMfaKeyRequest {
  keyName: string;
}

export interface MeshCentralEmbedUrlRequest {
  clientId: string;
  siteId: string;
  meshUsername: string;
  agentId?: string | null;
  viewMode?: number | null;
  hideMask?: number | null;
  meshNodeId?: string | null;
  gotoDeviceName?: string | null;
}

export interface MeshCentralEmbedUrlResponse {
  url: string;
  expiresAtUtc: string;
  viewMode: number;
  hideMask: number;
  clientId: string;
  siteId: string;
  agentId?: string | null;
  meshUsername: string;
}

export interface ApiMessageResponse {
  message: string;
}

function withBearer(token: string) {
  return {
    auth: false as const,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

export const authApi = {
  login: (request: LoginRequest) =>
    api.post<LoginResponse>("/api/auth/login", request, { auth: false }),

  refresh: (request: RefreshTokenRequest) =>
    api.post<TokenPair>("/api/auth/refresh", request, {
      auth: false,
      retryOnAuthError: false,
    }),

  logout: (accessToken: string, refreshToken: string | null) =>
    api.post<void>(
      "/api/auth/logout",
      { refreshToken },
      withBearer(accessToken),
    ),

  getFirstAccessStatus: (token: string) =>
    api.get<FirstAccessStatus>(
      "/api/auth/first-access/status",
      {},
      withBearer(token),
    ),

  completeFirstAccess: (token: string, request: CompleteFirstAccessRequest) =>
    api.post<ApiMessageResponse>(
      "/api/auth/first-access/complete",
      request,
      withBearer(token),
    ),

  beginLoginFido2: (token: string) =>
    api.post<BeginFido2Response>(
      "/api/auth/mfa/fido2/begin",
      undefined,
      withBearer(token),
    ),

  completeLoginFido2: (token: string, request: CompleteFido2AssertionRequest) =>
    api.post<TokenPair>(
      "/api/auth/mfa/fido2/complete",
      request,
      withBearer(token),
    ),

  beginRegistrationFido2: (token: string) =>
    api.post<BeginFido2Response>(
      "/api/mfa/fido2/register/begin",
      undefined,
      withBearer(token),
    ),

  completeRegistrationFido2: (
    token: string,
    request: CompleteFido2RegistrationRequest,
  ) =>
    api.post<CompleteFido2RegistrationResponse>(
      "/api/mfa/fido2/register/complete",
      request,
      withBearer(token),
    ),

  listMfaKeys: () => api.get<MfaKey[]>("/api/mfa/keys"),

  renameMfaKey: (keyId: string, request: RenameMfaKeyRequest) =>
    api.patch<void>(`/api/mfa/keys/${keyId}/name`, request),

  deleteMfaKey: (keyId: string) => api.del<void>(`/api/mfa/keys/${keyId}`),

  getMeshCentralEmbedUrl: (request: MeshCentralEmbedUrlRequest) =>
    api.post<MeshCentralEmbedUrlResponse>(
      "/api/meshcentral/embed-url",
      request,
    ),
};

import { api } from "./client";
import type { MfaRequirement } from "./types";

export interface LoginRequest {
  loginOrEmail: string;
  password: string;
}

export interface LoginResponse {
  mfaToken?: string;
  MfaToken?: string;
  mfaRequired: boolean;
  mfaConfigured?: boolean;
  firstAccessRequired: boolean;
  mustChangePassword: boolean;
  mustChangeProfile: boolean;
  roleMfaRequirement?: MfaRequirement;
  sessionEstablished?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  RoleMfaRequirement?: MfaRequirement;
  SessionEstablished?: boolean;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresInSeconds?: number;
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

export interface CompleteOtpLoginRequest {
  code: string;
}

export interface BeginTotpRegistrationResponse {
  secretBase32: string;
  qrCodeUri: string;
  message: string;
}

export interface CompleteTotpRegistrationRequest {
  secretBase32: string;
  verificationCode: string;
  keyName: string;
}

export interface CompleteTotpRegistrationResponse {
  message: string;
  backupCodes: string[];
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
    api.post<LoginResponse>("/api/v1/auth/login", request, { auth: false }),

  refresh: (request: RefreshTokenRequest) =>
    api.post<TokenPair>("/api/v1/auth/refresh", request, {
      auth: false,
      retryOnAuthError: false,
    }),

  logout: (accessToken: string, refreshToken: string | null) =>
    api.post<void>(
      "/api/v1/auth/logout",
      { refreshToken },
      withBearer(accessToken),
    ),

  getFirstAccessStatus: (token: string) =>
    api.get<FirstAccessStatus>(
      "/api/v1/auth/first-access/status",
      {},
      withBearer(token),
    ),

  completeFirstAccess: (token: string, request: CompleteFirstAccessRequest) =>
    api.post<ApiMessageResponse>(
      "/api/v1/auth/first-access/complete",
      request,
      withBearer(token),
    ),

  beginLoginFido2: (token: string) =>
    api.post<BeginFido2Response>(
      "/api/v1/auth/mfa/fido2/begin",
      undefined,
      withBearer(token),
    ),

  completeLoginFido2: (token: string, request: CompleteFido2AssertionRequest) =>
    api.post<TokenPair>(
      "/api/v1/auth/mfa/fido2/complete",
      request,
      withBearer(token),
    ),

  completeLoginOtp: (token: string, request: CompleteOtpLoginRequest) =>
    api.post<TokenPair>(
      "/api/v1/auth/mfa/otp/complete",
      request,
      withBearer(token),
    ),

  beginRegistrationFido2: (token: string) =>
    api.post<BeginFido2Response>(
      "/api/v1/mfa/fido2/register/begin",
      undefined,
      withBearer(token),
    ),

  completeRegistrationFido2: (
    token: string,
    request: CompleteFido2RegistrationRequest,
  ) =>
    api.post<CompleteFido2RegistrationResponse>(
      "/api/v1/mfa/fido2/register/complete",
      request,
      withBearer(token),
    ),

  beginRegistrationTotp: (token: string) =>
    api.post<BeginTotpRegistrationResponse>(
      "/api/v1/mfa/totp/register/begin",
      undefined,
      withBearer(token),
    ),

  completeRegistrationTotp: (
    token: string,
    request: CompleteTotpRegistrationRequest,
  ) =>
    api.post<CompleteTotpRegistrationResponse>(
      "/api/v1/mfa/totp/register/complete",
      request,
      withBearer(token),
    ),

  listMfaKeys: () => api.get<MfaKey[]>("/api/v1/mfa/keys"),

  renameMfaKey: (keyId: string, request: RenameMfaKeyRequest) =>
    api.patch<void>(`/api/v1/mfa/keys/${keyId}/name`, request),

  deleteMfaKey: (keyId: string) => api.del<void>(`/api/v1/mfa/keys/${keyId}`),
};

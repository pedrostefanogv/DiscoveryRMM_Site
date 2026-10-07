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
  /** Perfil atual: permite exibir os dados já cadastrados quando só a senha muda. */
  login: string;
  email: string;
  fullName: string;
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

/** Token de step-up (reautenticação por senha) para operações sensíveis da conta. */
export interface StepUpToken {
  stepUpToken: string;
  expiresInSeconds: number;
}

function withTokenHeader(token?: string) {
  return token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : {};
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
      {
        ...withBearer(accessToken),
        // Sem retry: se o access token expirou, um refresh aqui criaria uma
        // sessão nova no servidor pouco antes de o logout limpar a sessão local.
        retryOnAuthError: false,
      },
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

  // Renomear/remover chave exige step-up: o token (5 min) é obtido em stepUp().
  renameMfaKey: (keyId: string, request: RenameMfaKeyRequest, token?: string) =>
    api.patch<void>(`/api/v1/mfa/keys/${keyId}/name`, request, withTokenHeader(token)),

  deleteMfaKey: (keyId: string, token?: string) =>
    api.del<void>(`/api/v1/mfa/keys/${keyId}`, withTokenHeader(token)),

  /** Reautentica por senha e devolve o token de step-up. */
  stepUp: (password: string) =>
    api.post<StepUpToken>("/api/v1/auth/step-up", { password }),
};

import type { LoginResponse } from "@/api/auth";

export type AuthStage =
  | "anonymous"
  | "login-submitting"
  | "first-access"
  | "mfa-register-begin"
  | "mfa-register-complete"
  | "mfa-assert-begin"
  | "mfa-assert-complete"
  | "authenticated"
  | "refreshing"
  | "logout";

export interface AuthSessionState {
  stage: AuthStage;
  accessToken: string | null;
  refreshToken: string | null;
  temporaryMfaToken: string | null;
  expiresAt: number | null;
  loginResponse: LoginResponse | null;
}

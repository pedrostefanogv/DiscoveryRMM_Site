import type { AuthSessionState } from "@/auth/types";

const AUTH_STORAGE_KEY = "discovery.auth.session.v1";
const KEEP_SIGNED_IN_KEY = "discovery.auth.keep-signed-in.v1";

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface TestJwtClaims {
  sub?: string;
  unique_name?: string;
  name?: string;
  exp?: number;
  iat?: number;
  permissions?: string[];
  role?: string;
  [key: string]: unknown;
}

export function makeTestJwt(claims: TestJwtClaims = {}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    sub: claims.sub ?? "user-e2e-1",
    unique_name: claims.unique_name ?? "operator.e2e",
    name: claims.name ?? "E2E Operator",
    iat: claims.iat ?? nowSec,
    exp: claims.exp ?? nowSec + 3600,
    ...claims,
  };
  return `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}.e2e-signature`;
}

export interface SeedAuthOptions {
  keepSignedIn?: boolean;
  accessToken?: string;
  refreshToken?: string;
  permissions?: string[];
  userId?: string;
  username?: string;
  expiresAt?: string;
}

export function seedAuthStorage(opts: SeedAuthOptions = {}): AuthSessionState {
  const keepSignedIn = opts.keepSignedIn ?? false;
  const accessToken =
    opts.accessToken ??
    makeTestJwt({
      sub: opts.userId ?? "user-e2e-1",
      unique_name: opts.username ?? "operator.e2e",
      permissions: opts.permissions ?? ["admin.*"],
    });
  const expiresAt =
    opts.expiresAt ?? new Date(Date.now() + 3600_000).toISOString();

  const state: AuthSessionState = {
    stage: "authenticated",
    accessToken,
    refreshToken: opts.refreshToken ?? "e2e-refresh-token",
    temporaryMfaToken: null,
    expiresAt,
    loginResponse: {
      accessToken,
      refreshToken: opts.refreshToken ?? "e2e-refresh-token",
      expiresAt,
      requiresMfa: false,
      requiresMfaEnrollment: false,
      user: {
        id: opts.userId ?? "user-e2e-1",
        username: opts.username ?? "operator.e2e",
        email: "operator@e2e.local",
        displayName: "E2E Operator",
        role: "Admin",
        permissions: opts.permissions ?? ["admin.*"],
      },
    } as unknown as AuthSessionState["loginResponse"],
  };

  window.localStorage.setItem(KEEP_SIGNED_IN_KEY, keepSignedIn ? "1" : "0");
  const targetStorage = keepSignedIn ? window.localStorage : window.sessionStorage;
  const otherStorage = keepSignedIn ? window.sessionStorage : window.localStorage;
  otherStorage.removeItem(AUTH_STORAGE_KEY);
  targetStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));

  return state;
}

export function clearSeededAuthStorage(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(KEEP_SIGNED_IN_KEY);
}

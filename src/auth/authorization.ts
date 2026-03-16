import { useMemo } from "react";
import { useAuth } from "./AuthContext";

type JwtPayload = Record<string, unknown>;

const PERMISSION_KEYS = [
  "permissions",
  "permission",
  "perms",
  "scope",
  "scp",
  "role_permissions",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/permission",
];

const ROLE_KEYS = [
  "roles",
  "role",
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
];

function decodeBase64Url(value: string): string {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
  } catch {
    return atob(base64);
  }
}

function parseJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    return JSON.parse(decodeBase64Url(segments[1])) as JwtPayload;
  } catch {
    return null;
  }
}

function coerceValues(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((value) => (typeof value === "string" ? value : null))
      .filter((value): value is string => !!value);
  }

  if (typeof input === "string") {
    if (input.includes(" ")) {
      return input
        .split(" ")
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
    return [input];
  }

  return [];
}

function collectClaims(payload: JwtPayload | null, keys: string[]): string[] {
  if (!payload) return [];

  const values = keys.flatMap((key) => coerceValues(payload[key]));
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function matchesPermission(granted: string, required: string): boolean {
  if (granted === "*" || required === "*") return true;
  if (granted === required) return true;

  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -2);
    return required.startsWith(`${prefix}.`);
  }

  if (required.endsWith(".*")) {
    const prefix = required.slice(0, -2);
    return granted.startsWith(`${prefix}.`);
  }

  return false;
}

export function useAuthorization() {
  const { session } = useAuth();

  const authz = useMemo(() => {
    const payload = parseJwtPayload(session.accessToken);
    const permissions = collectClaims(payload, PERMISSION_KEYS);
    const roles = collectClaims(payload, ROLE_KEYS);

    const allowByDefault = permissions.length === 0;

    const hasPermission = (permission: string) => {
      if (allowByDefault) return true;
      return permissions.some((granted) =>
        matchesPermission(granted, permission),
      );
    };

    const hasAnyPermission = (requiredPermissions: string[]) => {
      if (allowByDefault) return true;
      return requiredPermissions.some((permission) =>
        hasPermission(permission),
      );
    };

    const hasAllPermissions = (requiredPermissions: string[]) => {
      if (allowByDefault) return true;
      return requiredPermissions.every((permission) =>
        hasPermission(permission),
      );
    };

    return {
      permissions,
      roles,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      allowByDefault,
    };
  }, [session.accessToken]);

  return {
    ...authz,
    canManageIdentity:
      authz.hasAnyPermission([
        "identity.*",
        "users.*",
        "groups.*",
        "roles.*",
        "permissions.*",
        "admin.*",
      ]) || authz.roles.some((role) => role.toLowerCase().includes("admin")),
  };
}

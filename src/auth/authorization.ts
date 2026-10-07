import { useMemo } from "react";
import { useAuth } from "@/auth/AuthContext";
import { decodeBase64Url } from "@/utils/base64";

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

/** Indica se o token traz explicitamente o claim (mesmo que vazio). */
function hasClaim(payload: JwtPayload | null, keys: string[]): boolean {
  if (!payload) return false;
  return keys.some((key) => payload[key] !== undefined && payload[key] !== null);
}

/**
 * Vocabulário dos gates do console → recursos reais do backend (ResourceType).
 *
 * O console usa famílias "amigáveis" (settings, identity, groups, software...)
 * enquanto a API autoriza por recurso (ServerConfig/ClientConfig/SiteConfig, Users,
 * AppStore/Agents...). Sem esta tradução, um usuário legítimo veria o menu vazio
 * agora que os gates passaram a ser aplicados de verdade.
 */
const PERMISSION_FAMILY_ALIASES: Record<string, string[]> = {
  settings: ["serverconfig", "clientconfig", "siteconfig"],
  identity: ["users"],
  groups: ["users"],
  roles: ["users"],
  permissions: ["users"],
  software: ["appstore", "agents"],
  inventory: ["appstore", "agents"],
  deploy: ["deployment"],
  deployment: ["deployment"],
};

/** Ações usadas pelos gates → ações reais (ActionType). */
const ACTION_ALIASES: Record<string, string[]> = {
  read: ["view"],
  write: ["edit", "create", "delete", "execute"],
  manage: ["edit", "create", "delete"],
};

function expandPermission(permission: string): string[] {
  const normalized = permission.trim().toLowerCase();
  if (!normalized) return [];

  const separatorIndex = normalized.indexOf(".");
  const family = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  const action = separatorIndex === -1 ? "*" : normalized.slice(separatorIndex + 1);

  const families = [family, ...(PERMISSION_FAMILY_ALIASES[family] ?? [])];
  const actions = action === "*" ? ["*"] : [action, ...(ACTION_ALIASES[action] ?? [])];

  const expanded = new Set<string>();
  for (const currentFamily of families) {
    for (const currentAction of actions) {
      expanded.add(
        currentAction === "*" ? `${currentFamily}.*` : `${currentFamily}.${currentAction}`,
      );
    }
  }

  // Mantém o literal (permite permissões fora do padrão Recurso.Ação).
  expanded.add(normalized);
  return Array.from(expanded);
}

function matchesSinglePermission(granted: string, required: string): boolean {
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

function matchesPermission(granted: string, required: string): boolean {
  // Case-insensitive: os gates misturam "Users.View", "users.view" e "identity.*".
  const normalizedGranted = granted.trim().toLowerCase();
  if (!normalizedGranted) return false;
  if (normalizedGranted === "*") return true;

  return expandPermission(required).some((candidate) =>
    matchesSinglePermission(normalizedGranted, candidate),
  );
}

export function useAuthorization() {
  const { session } = useAuth();

  const authz = useMemo(() => {
    const payload = parseJwtPayload(session.accessToken);
    const permissions = collectClaims(payload, PERMISSION_KEYS);
    const roles = collectClaims(payload, ROLE_KEYS);

    /**
     * FAIL-CLOSED.
     *
     * Antes: `allowByDefault = permissions.length === 0` e todo gate retornava true
     * quando o token não tinha claims — que era SEMPRE o caso, porque o backend não
     * emitia permissões. Resultado: os gates do console não bloqueavam nada.
     *
     * Agora: sem o claim de permissões não há como afirmar o que o usuário pode fazer,
     * então negamos. O backend passou a emitir `permissions`/`roles` no access token.
     */
    const permissionsLoaded = hasClaim(payload, PERMISSION_KEYS);

    const hasPermission = (permission: string) => {
      if (!permissionsLoaded) return false;
      return permissions.some((granted) =>
        matchesPermission(granted, permission),
      );
    };

    const hasAnyPermission = (requiredPermissions: string[]) => {
      if (!permissionsLoaded) return false;
      return requiredPermissions.some((permission) =>
        hasPermission(permission),
      );
    };

    const hasAllPermissions = (requiredPermissions: string[]) => {
      if (!permissionsLoaded) return false;
      return requiredPermissions.every((permission) =>
        hasPermission(permission),
      );
    };

    return {
      permissions,
      roles,
      permissionsLoaded,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    };
  }, [session.accessToken]);

  return {
    ...authz,
    canViewDeploy: authz.hasAnyPermission([
      "deploy.*",
      "deploy.read",
      "deployment.*",
      "admin.*",
    ]),
    canViewSoftware: authz.hasAnyPermission([
      "software.*",
      "software.read",
      "inventory.*",
      "inventory.read",
      "admin.*",
    ]),
    canViewAutomation: authz.hasAnyPermission([
      "automation.*",
      "automation.read",
      "admin.*",
    ]),
    canViewReports: authz.hasAnyPermission([
      "reports.*",
      "reports.read",
      "admin.*",
    ]),
    canViewSettings: authz.hasAnyPermission([
      "settings.*",
      "settings.read",
      "admin.*",
    ]),
    // A heurística anterior liberava "admin" para qualquer role cujo nome contivesse
    // "admin" (ex.: "AdminReadOnly"). Agora vale apenas a permissão efetiva.
    canManageIdentity: authz.hasAnyPermission([
      "identity.*",
      "users.*",
      "groups.*",
      "roles.*",
      "permissions.*",
      "admin.*",
    ]),
  };
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Loading } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { useAuthorization } from "./authorization";

export function RequireAuth() {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <Loading message="Verificando sessão..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function PublicOnlyAuth() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <Loading message="Verificando sessão..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

interface RequirePermissionProps {
  anyOf?: string[];
  allOf?: string[];
  fallbackPath?: string;
}

export function RequirePermission({
  anyOf,
  allOf,
  fallbackPath = "/",
}: RequirePermissionProps) {
  const location = useLocation();
  const { hasAnyPermission, hasAllPermissions } = useAuthorization();

  const allowedByAny = !anyOf?.length || hasAnyPermission(anyOf);
  const allowedByAll = !allOf?.length || hasAllPermissions(allOf);
  const allowed = allowedByAny && allowedByAll;

  if (!allowed) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

interface PermissionGateProps extends RequirePermissionProps {
  children: ReactNode;
}

export function PermissionGate({
  children,
  anyOf,
  allOf,
  fallbackPath = "/",
}: PermissionGateProps) {
  const location = useLocation();
  const { hasAnyPermission, hasAllPermissions } = useAuthorization();

  const allowedByAny = !anyOf?.length || hasAnyPermission(anyOf);
  const allowedByAll = !allOf?.length || hasAllPermissions(allOf);

  if (!(allowedByAny && allowedByAll)) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
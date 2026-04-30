import { useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';

/**
 * Pass-through routes that should bypass the SPA entirely.
 * These hit the backend directly and should never render inside React Router.
 * In dev mode, Vite proxy forwards them. In production, nginx/IIS must
 * exclude these paths from the SPA fallback rewrite rule.
 */
const BACKEND_ROUTES = ['/scalar', '/openapi'];

export function CatchAllRoute() {
  const location = useLocation();

  useEffect(() => {
    // If the user navigated to a backend route, force a full page navigation
    // so it hits the actual server instead of the SPA catch-all.
    const isBackendRoute = BACKEND_ROUTES.some((prefix) =>
      location.pathname.startsWith(prefix),
    );

    if (isBackendRoute) {
      window.location.href = location.pathname + location.search + location.hash;
    }
  }, [location]);

  // During the redirect, show nothing (it'll be immediate)
  const isBackendRoute = BACKEND_ROUTES.some((prefix) =>
    location.pathname.startsWith(prefix),
  );

  if (isBackendRoute) {
    return null;
  }

  // For unknown routes that are NOT backend docs, redirect to dashboard
  return <Navigate to="/" replace />;
}

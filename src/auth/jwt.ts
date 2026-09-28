import { decodeBase64Url } from "@/utils/base64";

export function getUserIdFromJwt(token: string | null) {
  if (!token) return null;

  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<
      string,
      unknown
    >;
    const candidates = [
      payload[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
      ],
      payload.nameidentifier,
      payload.sub,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Resolve o login (username) do usuário autenticado a partir do access token.
 *
 * É o MESMO valor gravado como autor dos comentários no backend
 * (HttpContext.Items["Username"], alimentado pelo claim `unique_name`), então
 * serve para identificar quais comentários são do próprio usuário na conversa.
 */
export function getUserNameFromJwt(token: string | null) {
  if (!token) return null;

  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<
      string,
      unknown
    >;
    const candidates = [
      payload.unique_name,
      payload[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
      ],
      payload.name,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

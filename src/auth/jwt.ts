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

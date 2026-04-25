function decodeBase64Url(value: string) {
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

export function getUserIdFromJwt(token: string | null) {
  if (!token) return null;

  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<string, unknown>;
    const candidates = [
      payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"],
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
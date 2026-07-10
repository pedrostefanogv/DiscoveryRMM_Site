/**
 * Decodifica uma string base64url (RFC 7515) para UTF-8.
 * Usada na decodificação de payloads JWT.
 */
export function decodeBase64Url(value: string): string {
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

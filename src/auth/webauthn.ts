type JsonRecord = Record<string, unknown>;

interface WebAuthnEnvironmentInfo {
  isSecureContext: boolean;
  protocol: string;
  host: string;
  origin: string;
  hasPublicKeyCredential: boolean;
}

interface SerializedCredentialResponse {
  clientDataJSON: string;
  attestationObject?: string;
  authenticatorData?: string;
  signature?: string;
  userHandle?: string | null;
  transports?: string[];
}

interface SerializedCredential {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment: string | null;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  response: SerializedCredentialResponse;
}

function toBase64Url(input: ArrayBuffer | ArrayBufferView | null | undefined) {
  if (!input) {
    return null;
  }

  const bytes =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function parseOptionsJson<T extends JsonRecord>(serialized: string): T {
  return JSON.parse(serialized) as T;
}

function getOption<T>(
  source: JsonRecord,
  camelCaseKey: string,
  pascalCaseKey = `${camelCaseKey[0]?.toUpperCase() ?? ""}${camelCaseKey.slice(1)}`,
): T | undefined {
  return (source[camelCaseKey] ?? source[pascalCaseKey]) as T | undefined;
}

function getNestedRecord(source: JsonRecord, camelCaseKey: string): JsonRecord {
  const value = getOption<JsonRecord>(source, camelCaseKey);
  return value && typeof value === "object" ? value : {};
}

function normalizeHostLikeValue(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isIpv4Address(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return false;
  }

  return value
    .split(".")
    .every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function isIpv6Address(value: string) {
  return value.includes(":");
}

function isIpAddress(value: string) {
  return isIpv4Address(value) || isIpv6Address(value);
}

function getCurrentHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeHostLikeValue(window.location.hostname);
}

function isRpIdCompatibleWithHostname(rpId: string, hostname: string) {
  const normalizedRpId = normalizeHostLikeValue(rpId);

  if (!normalizedRpId || !hostname) {
    return true;
  }

  if (normalizedRpId === hostname) {
    return true;
  }

  // IPs must match exactly; suffix matching only applies to domain names.
  if (isIpAddress(normalizedRpId) || isIpAddress(hostname)) {
    return false;
  }

  return hostname.endsWith(`.${normalizedRpId}`);
}

function ensureRpIdMatchesCurrentHost(
  rpId: string | undefined,
  flow: "assertion" | "registration",
) {
  if (!rpId) {
    return;
  }

  const normalizedRpId = normalizeHostLikeValue(rpId);
  if (!normalizedRpId) {
    return;
  }

  const hostname = getCurrentHostname();
  if (!hostname) {
    return;
  }

  if (isRpIdCompatibleWithHostname(normalizedRpId, hostname)) {
    return;
  }

  const flowLabel = flow === "assertion" ? "validacao" : "registro";
  throw new Error(
    `RP ID WebAuthn incompativel no fluxo de ${flowLabel}. rpId recebido: "${normalizedRpId}". Host atual: "${hostname}". Verifique se o backend gerou o challenge para este mesmo dominio.`,
  );
}

function normalizeCredentialDescriptor(
  descriptor: JsonRecord,
): PublicKeyCredentialDescriptor {
  return {
    ...descriptor,
    type:
      getOption<PublicKeyCredentialType>(descriptor, "type") ?? "public-key",
    id: fromBase64Url(String(getOption<string>(descriptor, "id") ?? "")),
    transports: Array.isArray(getOption<unknown[]>(descriptor, "transports"))
      ? (getOption<unknown[]>(descriptor, "transports") ?? []).map(
          (item) => String(item) as AuthenticatorTransport,
        )
      : undefined,
  };
}

export function parseAssertionOptions(
  serializedOptions: string,
): PublicKeyCredentialRequestOptions {
  const options = parseOptionsJson<JsonRecord>(serializedOptions);
  const challenge = getOption<string>(options, "challenge");
  const timeout = getOption<number>(options, "timeout");
  const rpId = getOption<string>(options, "rpId");
  const allowCredentials = getOption<unknown[]>(options, "allowCredentials");
  const userVerification = getOption<UserVerificationRequirement>(
    options,
    "userVerification",
  );
  const extensions = getOption<AuthenticationExtensionsClientInputs>(
    options,
    "extensions",
  );

  ensureRpIdMatchesCurrentHost(rpId, "assertion");

  const normalizedChallenge = fromBase64Url(String(challenge ?? ""));
  const normalizedAllowCredentials = Array.isArray(allowCredentials)
    ? allowCredentials.map((item) =>
        normalizeCredentialDescriptor(item as JsonRecord),
      )
    : undefined;

  const normalizedOptions: PublicKeyCredentialRequestOptions = {
    challenge: normalizedChallenge,
    allowCredentials: normalizedAllowCredentials,
  };

  if (typeof timeout === "number") {
    normalizedOptions.timeout = timeout;
  }

  if (typeof rpId === "string" && rpId.trim()) {
    normalizedOptions.rpId = rpId;
  }

  if (userVerification) {
    normalizedOptions.userVerification = userVerification;
  }

  if (extensions && typeof extensions === "object") {
    normalizedOptions.extensions = extensions;
  }

  return normalizedOptions;
}

export function parseRegistrationOptions(
  serializedOptions: string,
): PublicKeyCredentialCreationOptions {
  const options = parseOptionsJson<JsonRecord>(serializedOptions);
  const challenge = getOption<string>(options, "challenge");
  const rp = getNestedRecord(options, "rp");
  const rpId = getOption<string>(rp, "id");
  const user = getNestedRecord(options, "user");
  const excludeCredentials = getOption<unknown[]>(
    options,
    "excludeCredentials",
  );

  ensureRpIdMatchesCurrentHost(rpId, "registration");

  return {
    ...options,
    challenge: fromBase64Url(String(challenge ?? "")),
    user: {
      ...user,
      id: fromBase64Url(String(getOption<string>(user, "id") ?? "")),
    },
    excludeCredentials: Array.isArray(excludeCredentials)
      ? excludeCredentials.map((item) =>
          normalizeCredentialDescriptor(item as JsonRecord),
        )
      : undefined,
  } as PublicKeyCredentialCreationOptions;
}

export function serializeAssertionCredential(
  credential: PublicKeyCredential,
): SerializedCredential {
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId) ?? "",
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON) ?? "",
      authenticatorData: toBase64Url(response.authenticatorData) ?? "",
      signature: toBase64Url(response.signature) ?? "",
      userHandle: toBase64Url(response.userHandle),
    },
  };
}

export function serializeRegistrationCredential(
  credential: PublicKeyCredential,
): SerializedCredential {
  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId) ?? "",
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON) ?? "",
      attestationObject: toBase64Url(response.attestationObject) ?? "",
      transports:
        typeof response.getTransports === "function"
          ? response.getTransports()
          : undefined,
    },
  };
}

export function getWebAuthnEnvironmentInfo(): WebAuthnEnvironmentInfo {
  if (typeof window === "undefined") {
    return {
      isSecureContext: false,
      protocol: "unknown:",
      host: "unknown",
      origin: "unknown",
      hasPublicKeyCredential: false,
    };
  }

  return {
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
    host: window.location.host,
    origin: window.location.origin,
    hasPublicKeyCredential: typeof window.PublicKeyCredential !== "undefined",
  };
}

export function describeWebAuthnError(error: unknown): string {
  if (error instanceof DOMException) {
    const detail = error.message?.trim()
      ? ` Detalhe do navegador: ${error.message.trim()}`
      : "";

    switch (error.name) {
      case "SecurityError": {
        const environment = getWebAuthnEnvironmentInfo();
        return environment.isSecureContext
          ? `O navegador bloqueou o WebAuthn por incompatibilidade de dominio, RP ID ou politica de seguranca da pagina. Host atual: ${environment.host}. Verifique se o challenge foi gerado para este host e sem troca de dominio entre begin e complete.${detail}`
          : "O navegador exige contexto seguro para WebAuthn. Em localhost isso costuma funcionar, mas IPs, hosts customizados ou paginas inseguras em HTTP podem ser bloqueados.";
      }
      case "NotAllowedError":
        return `A operacao WebAuthn foi cancelada, expirou ou foi bloqueada pelo navegador/autenticador.${detail}`;
      case "InvalidStateError":
        return `Esta chave ja parece estar registrada neste autenticador para este site.${detail}`;
      case "ConstraintError":
        return `O autenticador nao conseguiu atender aos requisitos pedidos para esta credencial.${detail}`;
      case "AbortError":
        return `A operacao WebAuthn foi interrompida antes da conclusao.${detail}`;
      case "NotSupportedError":
        return `O autenticador ou o navegador nao suportam os parametros WebAuthn enviados pelo backend.${detail}`;
      default:
        return error.message || "Falha inesperada ao usar WebAuthn.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Falha inesperada ao usar WebAuthn.";
}

export function ensureWebAuthnSupport() {
  const environment = getWebAuthnEnvironmentInfo();

  if (!environment.isSecureContext) {
    throw new Error(
      "WebAuthn exige contexto seguro. Use HTTPS ou localhost verdadeiro; hosts customizados ou IPs em HTTP podem ser bloqueados.",
    );
  }

  if (
    typeof window === "undefined" ||
    typeof window.PublicKeyCredential === "undefined" ||
    !navigator.credentials
  ) {
    throw new Error("Este navegador nao suporta WebAuthn/FIDO2.");
  }
}

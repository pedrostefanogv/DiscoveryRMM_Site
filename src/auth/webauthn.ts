type JsonRecord = Record<string, unknown>;

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

function normalizeCredentialDescriptor(
  descriptor: JsonRecord,
): PublicKeyCredentialDescriptor {
  return {
    ...descriptor,
    type:
      (descriptor.type as PublicKeyCredentialType | undefined) ?? "public-key",
    id: fromBase64Url(String(descriptor.id ?? "")),
    transports: Array.isArray(descriptor.transports)
      ? descriptor.transports.map(
          (item) => String(item) as AuthenticatorTransport,
        )
      : undefined,
  };
}

export function parseAssertionOptions(
  serializedOptions: string,
): PublicKeyCredentialRequestOptions {
  const options = parseOptionsJson<JsonRecord>(serializedOptions);

  return {
    ...options,
    challenge: fromBase64Url(String(options.challenge ?? "")),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((item) =>
          normalizeCredentialDescriptor(item as JsonRecord),
        )
      : undefined,
  } as PublicKeyCredentialRequestOptions;
}

export function parseRegistrationOptions(
  serializedOptions: string,
): PublicKeyCredentialCreationOptions {
  const options = parseOptionsJson<JsonRecord>(serializedOptions);
  const user = (options.user ?? {}) as JsonRecord;

  return {
    ...options,
    challenge: fromBase64Url(String(options.challenge ?? "")),
    user: {
      ...user,
      id: fromBase64Url(String(user.id ?? "")),
    },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((item) =>
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

export function ensureWebAuthnSupport() {
  if (
    typeof window === "undefined" ||
    typeof window.PublicKeyCredential === "undefined" ||
    !navigator.credentials
  ) {
    throw new Error("Este navegador nao suporta WebAuthn/FIDO2.");
  }
}

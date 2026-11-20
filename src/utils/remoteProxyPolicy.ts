/**
 * Lógica da allowlist de proxy do acesso remoto (espelha RemoteProxyPolicy do
 * backend, em Discovery.Core.Configuration.RemoteProxyPolicy.cs).
 *
 * Fica separada da tela de propósito: a validação de CIDR/IP/porta é a parte
 * que precisa de teste unitário, e a tela só a consome. Manter as duas em
 * sincronia é o que evita o backend recusar (TryParseStrict) um JSON que a UI
 * deixou salvar.
 */

/** Modo "somente pré-aprovados" — default e fallback de qualquer erro. */
export const PROXY_MODE_ALLOWLIST = "allowlist";

/** Modo "liberado geral" (mapeia para enabled=false no agent). */
export const PROXY_MODE_OPEN = "open";

export interface RemoteProxyEntry {
  /** CIDR (192.168.10.0/24) ou IP avulso (10.0.0.5). */
  cidr: string;
  /** Portas permitidas para este destino. Vazio = todas as portas. */
  ports: number[];
  /** Anotação livre para o operador. */
  note?: string | null;
}

export interface RemoteProxyPolicy {
  mode: string;
  entries: RemoteProxyEntry[];
  allowLoopback: boolean;
  allowedPorts: number[];
  maxResponseBytes: number;
}

export const EMPTY_POLICY: RemoteProxyPolicy = {
  mode: PROXY_MODE_ALLOWLIST,
  entries: [],
  allowLoopback: false,
  allowedPorts: [],
  maxResponseBytes: 0,
};

const IPV4_OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Valida um IPv4 em forma decimal pontuada. Rejeita "01" e afins para não
 * aceitar notação ambígua que o backend (netip) recusaria.
 */
export function isValidIPv4(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => IPV4_OCTET.test(part) && !/^0\d/.test(part));
}

/**
 * Valida CIDR (10.0.0.0/8) ou IP avulso (10.0.0.5).
 *
 * Cobre IPv4 (o caso real das redes de cliente) e aceita IPv6 literal/CIDR de
 * forma permissiva — a validação definitiva é do backend, que usa netip.
 */
export function isValidCidrOrIp(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;

  const slash = raw.lastIndexOf("/");
  if (slash >= 0) {
    const addr = raw.slice(0, slash);
    const bitsRaw = raw.slice(slash + 1);
    if (!/^\d{1,3}$/.test(bitsRaw)) return false;
    const bits = Number(bitsRaw);

    if (isValidIPv4(addr)) return bits >= 0 && bits <= 32;
    // IPv6: validação permissiva (o backend confirma).
    if (addr.includes(":")) return bits >= 0 && bits <= 128;
    return false;
  }

  if (isValidIPv4(raw)) return true;
  // IPv6 literal: exige ao menos dois grupos e hex válido.
  return raw.includes(":") && /^[0-9a-fA-F:.]+$/.test(raw);
}

/** Porta válida (1..65535). */
export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * Interpreta a lista de portas digitada pelo operador ("22, 80,443").
 * Devolve as portas válidas e as entradas rejeitadas, para a UI avisar em vez
 * de descartar silenciosamente.
 */
export function parsePorts(input: string): { ports: number[]; invalid: string[] } {
  const ports: number[] = [];
  const invalid: string[] = [];

  for (const piece of input.split(/[,;\s]+/)) {
    const token = piece.trim();
    if (!token) continue;
    const parsed = Number(token);
    if (!isValidPort(parsed)) {
      invalid.push(token);
      continue;
    }
    if (!ports.includes(parsed)) ports.push(parsed);
  }

  return { ports: ports.sort((a, b) => a - b), invalid };
}

/** Renderiza portas para o input ("22, 80"). */
export function formatPorts(ports: number[] | null | undefined): string {
  return (ports ?? []).join(", ");
}

/**
 * Parse TOLERANTE do JSON persistido. Espelha o fail-closed do backend: JSON
 * vazio/inválido cai em allowlist vazia — NUNCA em modo "open". Sem isso, um
 * JSON corrompido abriria a tela mostrando "liberado geral" e um salvar
 * subsequente consolidaria essa liberação.
 */
export function parsePolicy(json: string | null | undefined): RemoteProxyPolicy {
  if (!json || !json.trim() || json.trim() === "{}") {
    return { ...EMPTY_POLICY, entries: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...EMPTY_POLICY, entries: [] };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_POLICY, entries: [] };
  }

  const obj = raw as Record<string, unknown>;
  const mode =
    typeof obj.mode === "string" && obj.mode.trim().toLowerCase() === PROXY_MODE_OPEN
      ? PROXY_MODE_OPEN
      : PROXY_MODE_ALLOWLIST;

  const entries: RemoteProxyEntry[] = [];
  if (Array.isArray(obj.entries)) {
    for (const item of obj.entries) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const cidr = typeof entry.cidr === "string" ? entry.cidr.trim() : "";
      if (!cidr) continue;
      const ports = Array.isArray(entry.ports)
        ? entry.ports
            .map((p) => (typeof p === "number" ? p : Number(p)))
            .filter((p) => isValidPort(p))
        : [];
      entries.push({
        cidr,
        ports: [...new Set(ports)].sort((a, b) => a - b),
        note: typeof entry.note === "string" && entry.note.trim() ? entry.note.trim() : null,
      });
    }
  }

  const allowedPorts = Array.isArray(obj.allowedPorts)
    ? obj.allowedPorts
        .map((p) => (typeof p === "number" ? p : Number(p)))
        .filter((p) => isValidPort(p))
    : [];

  return {
    mode,
    entries,
    allowLoopback: obj.allowLoopback === true,
    allowedPorts: [...new Set(allowedPorts)].sort((a, b) => a - b),
    maxResponseBytes:
      typeof obj.maxResponseBytes === "number" && obj.maxResponseBytes > 0
        ? obj.maxResponseBytes
        : 0,
  };
}

/** Serializa para persistência, omitindo campos vazios (JSON enxuto). */
export function serializePolicy(policy: RemoteProxyPolicy): string {
  const payload: Record<string, unknown> = {
    mode: policy.mode === PROXY_MODE_OPEN ? PROXY_MODE_OPEN : PROXY_MODE_ALLOWLIST,
  };

  const entries = policy.entries
    .filter((entry) => entry.cidr.trim())
    .map((entry) => {
      const out: Record<string, unknown> = { cidr: entry.cidr.trim() };
      if (entry.ports.length) out.ports = entry.ports;
      if (entry.note && entry.note.trim()) out.note = entry.note.trim();
      return out;
    });

  if (entries.length) payload.entries = entries;
  if (policy.allowLoopback) payload.allowLoopback = true;
  if (policy.allowedPorts.length) payload.allowedPorts = policy.allowedPorts;
  if (policy.maxResponseBytes > 0) payload.maxResponseBytes = policy.maxResponseBytes;

  return JSON.stringify(payload);
}

export interface PolicyValidationIssue {
  /** Índice da entrada com problema; -1 para erros de escopo global. */
  entryIndex: number;
  message: string;
}

/**
 * Valida a política inteira antes de salvar. Devolve TODOS os problemas (não só
 * o primeiro) para o operador corrigir de uma vez.
 */
export function validatePolicy(policy: RemoteProxyPolicy): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];

  policy.entries.forEach((entry, index) => {
    if (!entry.cidr.trim()) {
      issues.push({ entryIndex: index, message: "Informe um IP ou CIDR." });
    } else if (!isValidCidrOrIp(entry.cidr)) {
      issues.push({
        entryIndex: index,
        message: `"${entry.cidr}" não é um IP/CIDR válido. Ex.: 192.168.10.0/24 ou 10.0.0.5`,
      });
    }

    for (const port of entry.ports) {
      if (!isValidPort(port)) {
        issues.push({ entryIndex: index, message: `Porta ${port} fora da faixa 1-65535.` });
      }
    }
  });

  for (const port of policy.allowedPorts) {
    if (!isValidPort(port)) {
      issues.push({ entryIndex: -1, message: `Porta global ${port} fora da faixa 1-65535.` });
    }
  }

  return issues;
}

/** Presets de rede oferecidos como atalho na tela. */
export const CIDR_PRESETS: { label: string; cidr: string; note: string }[] = [
  { label: "Rede local 192.168.x.x", cidr: "192.168.0.0/16", note: "Faixa doméstica/pequeno escritório" },
  { label: "Rede local 10.x.x.x", cidr: "10.0.0.0/8", note: "Faixa corporativa" },
  { label: "Rede local 172.16-31.x.x", cidr: "172.16.0.0/12", note: "Faixa corporativa (RFC1918)" },
];

/** Portas comuns oferecidas como atalho. */
export const PORT_PRESETS: { label: string; port: number }[] = [
  { label: "SSH (22)", port: 22 },
  { label: "HTTP (80)", port: 80 },
  { label: "HTTPS (443)", port: 443 },
  { label: "RDP (3389)", port: 3389 },
  { label: "Proxmox (8006)", port: 8006 },
];

/**
 * Destinos navegáveis derivados da allowlist de proxy.
 *
 * A allowlist cadastrada guarda CIDR/IP + PORTAS — que são a política de rede,
 * não URLs navegáveis. Esta camada traduz uma entrada em sugestões de URL para o
 * operador, que é o que a barra de navegação do console precisa.
 *
 * Motivação direta: o console tinha três atalhos CHUMBADOS no código
 * ("Roteador" 192.168.1.1, "Router Alt" 192.168.0.1, "Impressora"
 * 192.168.1.100). Eles não existem em nenhum cadastro — apareciam para todo
 * cliente, inclusive nos que não têm esses equipamentos, e clicar neles
 * resultava em bloqueio pela allowlist. Agora as sugestões vêm do que foi
 * REALMENTE aprovado para aquele escopo.
 */

import { isValidCidrOrIp } from '@/utils/remoteProxyPolicy';

export interface ProxyPolicyEntryLike {
  cidr?: string | null;
  ports?: number[] | null;
  note?: string | null;
}

export interface ProxyPolicyLike {
  mode?: string | null;
  entries?: ProxyPolicyEntryLike[] | null;
  allowedPorts?: number[] | null;
  allowLoopback?: boolean | null;
  insecureSkipVerify?: boolean | null;
}

export interface BrowsableDestination {
  /** Rótulo exibido no botão. */
  label: string;
  /** URL sugerida (sempre com esquema e barra final). */
  url: string;
  /** Host derivado, para deduplicação/preferência. */
  host: string;
  /** Porta usada, se houver. */
  port?: number;
  /** True quando a URL é apenas o HOST sem porta explícita. */
  fromCidr: boolean;
}

/** Portas que fazem sentido abrir como HTTP/HTTPS navegável. */
const WEB_PORTS = new Set([80, 81, 88, 443, 8000, 8006, 8080, 8443, 8888, 9000]);

/** Portas que implicam HTTPS quando não há porta (só 443). */
const TLS_PORTS = new Set([443, 8443]);

/**
 * Deriva o HOST navegável de um CIDR ou IP.
 *
 * Para um IP avulso ("192.168.10.250") o host é ele mesmo.
 * Para um CIDR ("192.168.10.0/24") não existe "o" endereço do equipamento — o
 * .0 é o endereço de rede e não responde. Nesses casos propomos a convenção
 * histórica de gateway: o primeiro host utilizável (.1). É uma SUGESTÃO de
 * partida, e o rótulo deixa isso explícito para o operador não achar que é um
 * endereço descoberto.
 */
export function hostFromEntry(cidr: string): {
  host: string | null;
  fromCidr: boolean;
} {
  const raw = (cidr ?? '').trim();
  if (!raw || !isValidCidrOrIp(raw)) return { host: null, fromCidr: false };

  if (!raw.includes('/')) {
    return { host: raw, fromCidr: false };
  }

  const [addr, bitsRaw] = raw.split('/');
  const bits = Number(bitsRaw);

  // Só IPv4 tem a convenção de gateway bem definida; IPv6 fica de fora.
  if (addr.includes(':') || !Number.isFinite(bits)) {
    return { host: null, fromCidr: true };
  }

  const octets = addr.split('.').map((o) => Number(o));
  if (octets.length !== 4 || octets.some((o) => !Number.isFinite(o))) {
    return { host: null, fromCidr: true };
  }

  // /32 ou /31: o próprio endereço já é o host (não há faixa para percorrer).
  if (bits >= 31) return { host: addr, fromCidr: true };

  // Primeiro host utilizável da faixa (endereço de rede + 1).
  const base = octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (base & mask) >>> 0;
  const first = (network + 1) >>> 0;

  return {
    host: [24, 16, 8, 0].map((shift) => (first >>> shift) & 0xff).join('.'),
    fromCidr: true,
  };
}

/** Monta a URL sugerida para um host/porta. */
export function buildDestinationUrl(host: string, port?: number): string {
  if (!port || port === 80) return `http://${host}/`;
  if (port === 443) return `https://${host}/`;
  const scheme = TLS_PORTS.has(port) ? 'https' : (port === 8443 ? 'https' : 'http');
  return `${scheme}://${host}:${port}/`;
}

/** Porta preferida para abrir a entrada, ou undefined para usar a padrão. */
function preferredPort(entryPorts: number[] | null | undefined, globalPorts: number[] | null | undefined): number | undefined {
  const candidates = [
    ...(entryPorts ?? []),
    ...(globalPorts ?? []),
  ];
  if (candidates.length === 0) return undefined;

  // Prefere uma porta claramente web; senão a menor (determinístico).
  const web = candidates.filter((p) => WEB_PORTS.has(p)).sort((a, b) => a - b);
  if (web.length > 0) return web[0];
  return [...candidates].sort((a, b) => a - b)[0];
}

/**
 * Converte a política em sugestões de navegação.
 *
 * No modo "open" não há lista cadastrada; devolvemos vazio (a UI mostra a
 * orientação de digitar a URL) em vez de inventar destinos.
 */
export function browsableDestinations(policy: ProxyPolicyLike | null | undefined): BrowsableDestination[] {
  if (!policy) return [];
  if ((policy.mode ?? '').toLowerCase() === 'open') return [];

  const out: BrowsableDestination[] = [];
  const seen = new Set<string>();

  for (const entry of policy.entries ?? []) {
    const { host, fromCidr } = hostFromEntry(entry?.cidr ?? '');
    if (!host) continue;

    const port = preferredPort(entry?.ports, policy.allowedPorts);
    const url = buildDestinationUrl(host, port);

    if (seen.has(url)) continue;
    seen.add(url);

    const note = (entry?.note ?? '').trim();
    const label = note || (fromCidr ? `${host} (rede)` : host);

    out.push({ label, url, host, port, fromCidr });
  }

  return out;
}

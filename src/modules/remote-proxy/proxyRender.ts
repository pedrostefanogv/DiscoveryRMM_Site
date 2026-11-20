/**
 * Utilitários de renderização do proxy HTTP.
 *
 * O proxy devolve o HTML de UM documento e o console o injeta no iframe via
 * `srcdoc`. Nesse formato o navegador não conhece a URL de origem, então todo
 * recurso relativo ("/assets/app.css", "favicon.ico") é resolvido contra
 * `about:srcdoc` e falha — a página aparece SEM ESTILO, "quebrada".
 *
 * A correção é injetar um `<base href>` com a URL efetiva da resposta (o agent
 * já devolve `finalUrl`, inclusive após redirects).
 *
 * LIMITE IMPORTANTE: o `<base>` corrige a RESOLUÇÃO das URLs relativas, mas o
 * navegador ainda tentará buscar esses sub-recursos DIRETO da internet — o
 * proxy HTTP atual transporta um documento, não é um navegador. Numa rede
 * isolada (o caso de uso do proxy) esses recursos continuarão indisponíveis, e
 * um site com CSP restritiva pode recusá-los mesmo com rede. O `<base>` é
 * necessário, porém não suficiente para páginas complexas: para navegar um site
 * completo, o modo Túnel TCP/SSH é o caminho correto.
 */

/** Extrai a origem (scheme://host[:port]) de uma URL; null quando inválida. */
export function originOf(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Decide a URL-base do documento.
 *
 * Prefere `finalUrl` (a URL EFETIVA após redirects) e cai para a URL pedida
 * quando o agent não a devolve. Sem isso um "http://host/" que redireciona para
 * "/portal/" continuaria resolvendo os relativos contra o caminho errado.
 */
export function resolveBaseUrl(
  requestedUrl: string,
  finalUrl?: string | null,
): string | null {
  return originOf(finalUrl) ? normalizeForBase(finalUrl!) : normalizeForBase(requestedUrl);
}

/** Normaliza para uso em <base href>: mantém path/query, remove fragmento. */
function normalizeForBase(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** True quando o documento já declara um <base>. */
export function hasBaseTag(html: string): boolean {
  return /<base\s[^>]*href\s*=/i.test(html);
}

/**
 * Injeta `<base href="...">` no HTML, logo após `<head>` quando existir.
 *
 * Não injeta se o documento já tem um `<base>` (respeita a decisão do site) nem
 * quando a URL-base não pôde ser determinada.
 */
export function injectBaseTag(html: string, baseUrl: string | null): string {
  if (!baseUrl) return html;
  if (hasBaseTag(html)) return html;

  // Escapa aspas: a URL entra num atributo HTML.
  const safe = baseUrl.replace(/"/g, '&quot;');
  const tag = `<base href="${safe}">`;

  const headOpen = html.match(/<head\b[^>]*>/i);
  if (headOpen && headOpen.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }

  // Sem <head>: injeta antes do primeiro <html> ou no início.
  const htmlOpen = html.match(/<html\b[^>]*>/i);
  if (htmlOpen && htmlOpen.index !== undefined) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return html.slice(0, at) + `<head>${tag}</head>` + html.slice(at);
  }

  return tag + html;
}

/**
 * Detecta recursos EXTERNOS no HTML que o proxy não consegue transportar.
 *
 * Serve para a UI avisar o operador em vez de deixá-lo achando que o proxy
 * quebrou: esses sub-recursos dependem de acesso direto do navegador à internet
 * e/ou de uma CSP que o srcdoc não satisfaz.
 */
export function detectExternalDependencies(html: string): {
  hasExternalAssets: boolean;
  hasCspMeta: boolean;
} {
  const hasExternalAssets =
    /<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']?https?:\/\//i.test(html);

  const hasCspMeta = /<meta\s[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(html);

  return { hasExternalAssets, hasCspMeta };
}

import { describe, expect, it } from 'vitest';
import {
  detectExternalDependencies,
  hasBaseTag,
  injectBaseTag,
  originOf,
  resolveBaseUrl,
} from '@/modules/remote-proxy/proxyRender';

/**
 * Testes da renderização do proxy HTTP.
 *
 * O defeito que originou estes testes: o HTML vinha do agent e era injetado no
 * iframe via `srcdoc` SEM `<base>`. Sem origem, o navegador resolve todo
 * recurso relativo contra `about:srcdoc` e falha — a página aparece sem estilo,
 * "quebrada" (relatado ao abrir 1.1.1.1).
 *
 * O agent já devolvia `finalUrl` (proxy.go) e o tipo TS já o declarava; o
 * console simplesmente nunca o usava.
 */
describe('originOf', () => {
  it('extrai a origem de http/https', () => {
    expect(originOf('https://1.1.1.1/')).toBe('https://1.1.1.1');
    expect(originOf('http://192.168.10.250:8006/index.html')).toBe('http://192.168.10.250:8006');
  });

  it('rejeita esquemas não navegáveis e URLs inválidas', () => {
    // javascript:/data: num <base> seria um vetor de injeção.
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('data:text/html,<h1>x</h1>')).toBeNull();
    expect(originOf('nao-e-url')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf(null)).toBeNull();
  });
});

describe('resolveBaseUrl', () => {
  it('prefere finalUrl (URL efetiva após redirect)', () => {
    // "http://host/" que redireciona para "/portal/" precisa resolver os
    // relativos a partir do caminho FINAL, não do pedido.
    expect(resolveBaseUrl('http://host/', 'http://host/portal/')).toBe('http://host/portal/');
  });

  it('cai para a URL pedida quando o agent não devolve finalUrl', () => {
    expect(resolveBaseUrl('https://1.1.1.1/', undefined)).toBe('https://1.1.1.1/');
    expect(resolveBaseUrl('https://1.1.1.1/', '')).toBe('https://1.1.1.1/');
  });

  it('ignora finalUrl inválida e usa a pedida', () => {
    expect(resolveBaseUrl('https://1.1.1.1/', 'javascript:alert(1)')).toBe('https://1.1.1.1/');
  });

  it('remove o fragmento (não faz parte da resolução)', () => {
    expect(resolveBaseUrl('https://host/page#secao')).toBe('https://host/page');
  });

  it('devolve null para URL não navegável', () => {
    expect(resolveBaseUrl('nao-e-url')).toBeNull();
  });
});

describe('injectBaseTag', () => {
  it('injeta logo após <head>', () => {
    const html = '<html><head><title>T</title></head><body>x</body></html>';
    const out = injectBaseTag(html, 'https://1.1.1.1/');

    expect(out).toContain('<base href="https://1.1.1.1/">');
    // Precisa vir ANTES dos recursos para valer para eles.
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<title>'));
  });

  it('respeita o <base> já declarado pelo site', () => {
    const html = '<head><base href="https://cdn.example.com/"></head>';
    const out = injectBaseTag(html, 'https://1.1.1.1/');

    expect(out).toBe(html);
    expect(out).not.toContain('1.1.1.1');
  });

  it('lida com <head> com atributos', () => {
    const html = '<html><head lang="pt-BR"><meta charset="utf-8"></head>';
    const out = injectBaseTag(html, 'https://host/');

    expect(out).toContain('<base href="https://host/">');
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<meta'));
  });

  it('cria <head> quando o documento não tem', () => {
    const html = '<html><body>conteudo</body></html>';
    const out = injectBaseTag(html, 'https://host/');

    expect(out).toContain('<head><base href="https://host/"></head>');
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<body>'));
  });

  it('injeta no início quando não há nem html nem head (fragmento)', () => {
    const out = injectBaseTag('<p>oi</p>', 'https://host/');
    expect(out.startsWith('<base href="https://host/">')).toBe(true);
  });

  it('não altera nada quando a base é null', () => {
    const html = '<head></head>';
    expect(injectBaseTag(html, null)).toBe(html);
  });

  it('escapa aspas da URL para não quebrar o atributo', () => {
    const out = injectBaseTag('<head></head>', 'https://host/"><script>x</script>');

    expect(out).not.toContain('"><script>');
    expect(out).toContain('&quot;');
  });

  it('não duplica o <base> em chamadas repetidas', () => {
    const once = injectBaseTag('<head></head>', 'https://host/');
    const twice = injectBaseTag(once, 'https://host/');

    expect(twice.match(/<base/g)?.length).toBe(1);
  });
});

describe('hasBaseTag', () => {
  it('detecta a tag independente de caixa e atributos', () => {
    expect(hasBaseTag('<base href="x">')).toBe(true);
    expect(hasBaseTag('<BASE HREF="x">')).toBe(true);
    expect(hasBaseTag('<base target="_blank" href="x">')).toBe(true);
  });

  it('não confunde outras tags', () => {
    expect(hasBaseTag('<head><basefont></head>')).toBe(false);
    expect(hasBaseTag('<p>base</p>')).toBe(false);
  });
});

describe('detectExternalDependencies', () => {
  it('detecta CSS/JS externos', () => {
    const html = '<head><link rel="stylesheet" href="https://cdn.example.com/a.css"></head>';
    expect(detectExternalDependencies(html).hasExternalAssets).toBe(true);
  });

  it('não acusa recursos relativos', () => {
    const html = '<head><link rel="stylesheet" href="/assets/a.css"></head>';
    expect(detectExternalDependencies(html).hasExternalAssets).toBe(false);
  });

  it('detecta meta CSP', () => {
    const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">';
    expect(detectExternalDependencies(html).hasCspMeta).toBe(true);
  });

  it('página simples não acusa nada', () => {
    const deps = detectExternalDependencies('<html><body><h1>ok</h1></body></html>');
    expect(deps.hasExternalAssets).toBe(false);
    expect(deps.hasCspMeta).toBe(false);
  });
});

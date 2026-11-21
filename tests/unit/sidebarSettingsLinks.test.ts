import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDEBAR_SRC = readFileSync(
  resolve(__dirname, '../../src/components/layout/Sidebar.tsx'),
  'utf8',
);

const ROUTER_SRC = readFileSync(
  resolve(__dirname, '../../src/router.tsx'),
  'utf8',
);

const SERVER_PAGE_SRC = readFileSync(
  resolve(__dirname, '../../src/pages/settings/ServerConfigurationPage.tsx'),
  'utf8',
);

/**
 * Guardas do menu lateral de Configurações.
 *
 * Estes testes existem por causa de dois defeitos reais:
 *
 *  1. O menu "Configurações" é uma lista PRÓPRIA (settingsLinks) e NÃO deriva
 *     das rotas. Registrar uma página em router.tsx a torna acessível por URL,
 *     mas ela continua invisível no menu — foi o que aconteceu com
 *     /settings/proxy-policy, que só abria digitando o endereço.
 *
 *  2. O submenu aberto usava max-height FIXO (max-h-96 = 384px) com
 *     overflow-hidden. Com 13 itens (~32px cada = 416px) os últimos eram
 *     cortados sem barra de rolagem, dando a impressão de menu incompleto.
 *
 * O teste lê o fonte porque o alvo é a CONSISTÊNCIA entre a lista do menu e as
 * rotas registradas — exatamente o que quebrou.
 */

/** Extrai os destinos de um array literal de links do sidebar. */
function extractLinkTargets(source: string, arrayName: string): string[] {
  const start = source.indexOf(`const ${arrayName} = [`);
  if (start < 0) throw new Error(`array ${arrayName} não encontrado no Sidebar`);
  const end = source.indexOf('];', start);
  const block = source.slice(start, end);
  return [...block.matchAll(/to:\s*'([^']+)'/g)].map((match) => match[1]);
}

describe('menu lateral de Configurações', () => {
  it('expõe Acesso Remoto unificado (Consentimento, Proxy e WebRTC)', () => {
    const targets = extractLinkTargets(SIDEBAR_SRC, 'settingsLinks');

    expect(targets).toContain('/settings/remote-access');
    expect(ROUTER_SRC).toContain("path: 'settings/remote-consent'");
    expect(ROUTER_SRC).toContain("path: 'settings/proxy-policy'");
    expect(ROUTER_SRC).toContain("path: 'settings/remote-webrtc'");
  });

  it('todo destino de settingsLinks tem rota registrada', () => {
    const targets = extractLinkTargets(SIDEBAR_SRC, 'settingsLinks');

    const missing = targets.filter((to) => {
      if (to === '/settings') return false; // rota de índice
      const path = to.replace(/^\//, '');
      return !ROUTER_SRC.includes(`path: '${path}'`);
    });

    // Um item de menu apontando para rota inexistente daria 404 silencioso.
    expect(missing, `destinos sem rota: ${missing.join(', ')}`).toEqual([]);
  });

  it('a política de proxy não é editada na tela genérica de Servidor', () => {
    // A política do proxy tem tela própria (Destinos do Proxy) com validação de
    // CIDR/porta e herança. Expor o mesmo campo na seção "Acesso remoto" de
    // Servidor criaria duas fontes de verdade — e um JSON cru malformado ali
    // derruba o proxy para bloqueio total (fail-closed) em silêncio.
    const excluded = SERVER_PAGE_SRC.match(
      /REMOTE_ACCESS_SEPARATE_KEYS = new Set\(\[([^\]]+)\]\)/,
    );
    expect(excluded, 'esperava a lista de exclusão dos campos de tela própria').not.toBeNull();

    const listed = excluded![1];
    expect(listed).toContain('remoteProxyPolicyJson');
    expect(listed).toContain('remoteProxyGlobalEntriesEnabled');

    // E o filtro da renderização precisa USAR essa lista.
    expect(SERVER_PAGE_SRC).toMatch(
      /remoteAccessFields = serverEditableFields\.filter\([\s\S]{0,200}REMOTE_ACCESS_SEPARATE_KEYS/,
    );
  });

  it('o submenu aberto comporta todos os itens de Configurações', () => {
    // max-h-[32rem] = 512px comporta ~16 itens de 32px. O valor fixo anterior
    // (max-h-96 = 384px) cortava a lista de 13+ itens.
    expect(SIDEBAR_SRC).not.toMatch(/isOpen\s*\?\s*'max-h-96/);

    const match = SIDEBAR_SRC.match(/isOpen\s*\?\s*'max-h-\[(\d+)rem\]/);
    expect(match, 'esperava um teto em rem no estado aberto').not.toBeNull();

    const remValue = Number(match![1]);
    const itemCount = extractLinkTargets(SIDEBAR_SRC, 'settingsLinks').length;
    const estimatedPx = itemCount * 32; // py-1.5 + text-sm

    expect(remValue * 16).toBeGreaterThan(estimatedPx);
  });
});

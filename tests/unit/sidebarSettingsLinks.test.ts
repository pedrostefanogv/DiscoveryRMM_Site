import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SIDEBAR_GROUPS, collectAllSidebarLinks } from '@/components/layout/sidebarConfig';

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

/** Extrai blocos de rotas `<Navigate ... />` registrados no router.tsx. */
function isRedirectRoute(routePath: string): boolean {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `path:\\s*'${escaped}',\\s*\\n\\s*element:\\s*<Navigate\\b`,
  );
  return pattern.test(ROUTER_SRC);
}

describe('consistência do menu lateral e rotas', () => {
  it('todo destino do menu lateral possui rota registrada em router.tsx', () => {
    const links = collectAllSidebarLinks(SIDEBAR_GROUPS);

    const missing = links.filter(({ to }) => {
      if (to === '/') return false; // rota index
      const routePath = to.replace(/^\//, '');
      return !ROUTER_SRC.includes(`path: '${routePath}'`);
    });

    expect(
      missing.map((item) => `${item.label} (${item.to})`),
      'destinos do menu sem rota registrada',
    ).toEqual([]);
  });

  it('nenhum destino do menu lateral aponta para rota de redirecionamento (<Navigate />)', () => {
    const links = collectAllSidebarLinks(SIDEBAR_GROUPS);

    const redirects = links.filter(({ to }) => {
      if (to === '/') return false;
      const routePath = to.replace(/^\//, '');
      return isRedirectRoute(routePath);
    });

    expect(
      redirects.map((item) => `${item.label} (${item.to})`),
      'itens de menu que apontam para <Navigate /> causam salto de menu',
    ).toEqual([]);
  });

  it('não há destinos duplicados entre seções do menu lateral', () => {
    const links = collectAllSidebarLinks(SIDEBAR_GROUPS);
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const link of links) {
      const existing = seen.get(link.to);
      if (existing) {
        duplicates.push(`${link.to}: "${existing}" vs "${link.label}"`);
      } else {
        seen.set(link.to, link.label);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it('expõe Acesso Remoto unificado (Consentimento, Proxy e WebRTC) em Configurações', () => {
    const settingsSection = SIDEBAR_GROUPS.flatMap((g) => g.items).find(
      (item) => item.kind === 'accordion' && item.id === 'settings',
    );
    expect(settingsSection).toBeDefined();
    if (settingsSection?.kind !== 'accordion') return;

    const remoteAccess = settingsSection.children.find(
      (child) => child.to === '/settings/remote-access',
    );
    expect(remoteAccess).toBeDefined();
    expect(remoteAccess?.matchPrefixes).toContain('/settings/remote-consent');
    expect(remoteAccess?.matchPrefixes).toContain('/settings/proxy-policy');
    expect(remoteAccess?.matchPrefixes).toContain('/settings/remote-webrtc');

    expect(ROUTER_SRC).toContain("path: 'settings/remote-consent'");
    expect(ROUTER_SRC).toContain("path: 'settings/proxy-policy'");
    expect(ROUTER_SRC).toContain("path: 'settings/remote-webrtc'");
  });

  it('agrupa Workflow e Perfis de SLA em Configurações sem duplicar em Suporte', () => {
    const links = collectAllSidebarLinks(SIDEBAR_GROUPS);
    const workflowInTickets = links.filter(
      (link) => link.sectionId === 'tickets' && link.to.includes('workflow'),
    );
    expect(workflowInTickets).toEqual([]);

    const settingsSection = SIDEBAR_GROUPS.flatMap((g) => g.items).find(
      (item) => item.kind === 'accordion' && item.id === 'settings',
    );
    expect(settingsSection?.kind).toBe('accordion');
    if (settingsSection?.kind !== 'accordion') return;

    const workflowItem = settingsSection.children.find(
      (child) => child.to === '/settings/workflow',
    );
    expect(workflowItem).toBeDefined();
    expect(workflowItem?.matchPrefixes).toContain('/settings/workflow-profiles');
  });

  it('a política de proxy não é editada na tela genérica de Servidor', () => {
    const excluded = SERVER_PAGE_SRC.match(
      /REMOTE_ACCESS_SEPARATE_KEYS = new Set\(\[([^\]]+)\]\)/,
    );
    expect(excluded, 'esperava a lista de exclusão dos campos de tela própria').not.toBeNull();

    const listed = excluded![1];
    expect(listed).toContain('remoteProxyPolicyJson');
    expect(listed).toContain('remoteProxyGlobalEntriesEnabled');

    expect(SERVER_PAGE_SRC).toMatch(
      /remoteAccessFields = serverEditableFields\.filter\([\s\S]{0,200}REMOTE_ACCESS_SEPARATE_KEYS/,
    );
  });

  it('usa transição fluida em grid nos submenus sem max-height fixo restritivo', () => {
    expect(SIDEBAR_SRC).not.toMatch(/max-h-96/);
    expect(SIDEBAR_SRC).toContain('grid-rows-[1fr]');
    expect(SIDEBAR_SRC).toContain('grid-rows-[0fr]');
  });
});

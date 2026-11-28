import type { MaterialSymbolName } from '@/components/ui';

export type SidebarAccordionSection =
  | 'tickets'
  | 'software'
  | 'patches'
  | 'automation'
  | 'reports'
  | 'identity'
  | 'settings';

export interface SidebarSubItem {
  to: string;
  label: string;
  end?: boolean;
  matchPrefixes?: string[];
  anyOfPermissions?: string[];
  keywords?: string[];
}

export interface SidebarLinkItem {
  kind: 'link';
  id: string;
  to: string;
  label: string;
  icon: MaterialSymbolName;
  end?: boolean;
  matchPrefixes?: string[];
  anyOfPermissions?: string[];
  keywords?: string[];
  alternateRoutes?: Array<{
    to: string;
    anyOfPermissions: string[];
  }>;
}

export interface SidebarAccordionItem {
  kind: 'accordion';
  id: SidebarAccordionSection;
  label: string;
  icon: MaterialSymbolName;
  matchPrefixes?: string[];
  anyOfPermissions?: string[];
  keywords?: string[];
  children: SidebarSubItem[];
}

export type SidebarNavItem = SidebarLinkItem | SidebarAccordionItem;

export interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarNavItem[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    items: [
      {
        kind: 'link',
        id: 'dashboard',
        to: '/',
        label: 'Dashboard',
        icon: 'dashboard',
        end: true,
      },
      {
        kind: 'link',
        id: 'service-board',
        to: '/service-board',
        label: 'Service Board',
        icon: 'checklist',
        anyOfPermissions: ['tickets.*', 'tickets.view', 'admin.*'],
        keywords: ['fila', 'chamados', 'patches', 'automacao'],
      },
    ],
  },
  {
    id: 'support',
    label: 'Atendimento',
    items: [
      {
        kind: 'accordion',
        id: 'tickets',
        label: 'Suporte',
        icon: 'confirmation_number',
        matchPrefixes: ['/tickets'],
        children: [
          {
            to: '/tickets',
            label: 'Chamados',
            end: true,
            anyOfPermissions: ['tickets.*', 'tickets.view', 'admin.*'],
          },
          {
            to: '/tickets/alerts',
            label: 'Alertas',
            anyOfPermissions: ['tickets.*', 'tickets.view', 'admin.*'],
          },
          {
            to: '/tickets/auto-rules',
            label: 'Auto-Ticket',
            matchPrefixes: ['/tickets/auto-rules', '/tickets/auto-policy'],
            anyOfPermissions: ['tickets.*', 'tickets.edit', 'admin.*'],
          },
          {
            to: '/tickets/sla',
            label: 'SLA e Calendários',
            anyOfPermissions: ['tickets.*', 'tickets.view', 'admin.*'],
          },
          {
            to: '/tickets/departments',
            label: 'Departamentos',
            anyOfPermissions: ['settings.*', 'settings.read', 'departments.*', 'admin.*'],
          },
          {
            to: '/tickets/templates',
            label: 'Templates',
            anyOfPermissions: ['tickets.*', 'tickets.edit', 'admin.*'],
          },
          {
            to: '/tickets/macros',
            label: 'Macros',
            anyOfPermissions: ['tickets.*', 'tickets.edit', 'admin.*'],
          },
          {
            to: '/tickets/csat',
            label: 'Satisfação (CSAT)',
            anyOfPermissions: ['tickets.*', 'tickets.view', 'reports.*', 'settings.*', 'admin.*'],
          },
        ],
      },
      {
        kind: 'link',
        id: 'knowledge',
        to: '/knowledge',
        label: 'Base de Conhecimento',
        icon: 'menu_book',
        matchPrefixes: ['/knowledge'],
        anyOfPermissions: [
          'KnowledgeBase.View',
          'KnowledgeBase.*',
          'knowledgebase.view',
          'knowledgebase.*',
          'admin.*',
        ],
        keywords: ['kb', 'artigos', 'documentacao', 'wiki'],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Frota e Operações',
    items: [
      {
        kind: 'link',
        id: 'clients',
        to: '/clients',
        label: 'Clientes e Sites',
        icon: 'group',
        matchPrefixes: ['/clients', '/sites'],
        alternateRoutes: [
          { to: '/clients', anyOfPermissions: ['Clients.View', 'clients.*', 'admin.*'] },
          { to: '/sites', anyOfPermissions: ['Sites.View', 'sites.*', 'admin.*'] },
        ],
      },
      {
        kind: 'link',
        id: 'agents',
        to: '/agents',
        label: 'Agentes',
        icon: 'desktop_windows',
        matchPrefixes: ['/agents'],
        anyOfPermissions: ['agents.*', 'agents.view', 'admin.*'],
      },
      {
        kind: 'link',
        id: 'sensors',
        to: '/sensors',
        label: 'Sensores',
        icon: 'sensors',
        matchPrefixes: ['/sensors'],
        anyOfPermissions: ['Sensors.View', 'sensors.view', 'sensors.*', 'admin.*'],
      },
      {
        kind: 'accordion',
        id: 'software',
        label: 'Softwares',
        icon: 'web_asset',
        matchPrefixes: ['/software', '/software-inventory'],
        anyOfPermissions: [
          'software.*',
          'software.read',
          'inventory.*',
          'inventory.read',
          'admin.*',
        ],
        children: [
          {
            to: '/software/inventory',
            label: 'Inventário Detalhado',
            matchPrefixes: ['/software/inventory', '/software-inventory'],
          },
          {
            to: '/software/store',
            label: 'Loja de Aplicativos',
            matchPrefixes: ['/software/store'],
          },
        ],
      },
      {
        kind: 'accordion',
        id: 'patches',
        label: 'Patches',
        icon: 'gpp_maybe',
        matchPrefixes: ['/patches'],
        anyOfPermissions: ['patches.*', 'patches.read', 'admin.*'],
        children: [
          {
            to: '/patches',
            label: 'Visão Geral',
            end: true,
          },
          {
            to: '/patches/compliance',
            label: 'Conformidade',
          },
          {
            to: '/patches/updates',
            label: 'Atualizações e Pendências',
            matchPrefixes: ['/patches/updates', '/patches/inventory', '/patches/pending'],
          },
          {
            to: '/patches/approvals',
            label: 'Aprovações e Auditoria',
          },
          {
            to: '/patches/policy',
            label: 'Política',
          },
        ],
      },
      {
        kind: 'accordion',
        id: 'automation',
        label: 'Automação',
        icon: 'build',
        matchPrefixes: ['/automation'],
        anyOfPermissions: ['automation.*', 'automation.read', 'admin.*'],
        children: [
          {
            to: '/automation',
            label: 'Visão Geral',
            end: true,
          },
          {
            to: '/automation/scripts',
            label: 'Scripts',
          },
          {
            to: '/automation/tasks',
            label: 'Tarefas',
          },
          {
            to: '/automation/operations',
            label: 'Operações',
          },
          {
            to: '/automation/agent-labels',
            label: 'Labels Automáticas',
            anyOfPermissions: ['agents.*', 'agents.view', 'Agents.View', 'admin.*'],
          },
          {
            to: '/automation/audit',
            label: 'Auditoria',
          },
        ],
      },
      {
        kind: 'link',
        id: 'files',
        to: '/files',
        label: 'Arquivos',
        icon: 'folder',
        matchPrefixes: ['/files'],
        anyOfPermissions: ['Files.View', 'files.*', 'admin.*'],
      },
      {
        kind: 'link',
        id: 'deploy',
        to: '/deploy',
        label: 'Deploy',
        icon: 'key',
        matchPrefixes: ['/deploy'],
        anyOfPermissions: ['deploy.*', 'deploy.read', 'deployment.*', 'admin.*'],
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Análise',
    items: [
      {
        kind: 'accordion',
        id: 'reports',
        label: 'Relatórios',
        icon: 'insert_chart',
        matchPrefixes: ['/reports'],
        anyOfPermissions: ['reports.*', 'reports.read', 'admin.*'],
        children: [
          {
            to: '/reports/templates',
            label: 'Templates',
            matchPrefixes: ['/reports/templates', '/reports/run'],
          },
          {
            to: '/reports/executions',
            label: 'Execuções',
          },
          {
            to: '/reports/schedules',
            label: 'Agendamentos',
          },
        ],
      },
      {
        kind: 'link',
        id: 'logs',
        to: '/logs',
        label: 'Logs',
        icon: 'article',
        matchPrefixes: ['/logs'],
        anyOfPermissions: ['logs.*', 'logs.read', 'admin.*'],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administração',
    items: [
      {
        kind: 'accordion',
        id: 'identity',
        label: 'Identidade',
        icon: 'verified_user',
        matchPrefixes: ['/identity'],
        children: [
          {
            to: '/identity/authentication',
            label: 'Perfil e Segurança',
          },
          {
            to: '/identity/access',
            label: 'Usuários, Grupos e Roles',
            matchPrefixes: [
              '/identity/access',
              '/identity/users',
              '/identity/groups',
              '/identity/roles',
            ],
            anyOfPermissions: [
              'identity.*',
              'users.*',
              'groups.*',
              'roles.*',
              'permissions.*',
              'admin.*',
            ],
          },
        ],
      },
      {
        kind: 'accordion',
        id: 'settings',
        label: 'Configurações',
        icon: 'settings',
        matchPrefixes: ['/settings'],
        children: [
          {
            to: '/settings',
            label: 'Geral',
            end: true,
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/server',
            label: 'Servidor',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/scope',
            label: 'Escopo (Cliente / Site)',
            matchPrefixes: [
              '/settings/scope',
              '/settings/client',
              '/settings/site',
              '/settings/effective',
            ],
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/remote-access',
            label: 'Acesso Remoto',
            matchPrefixes: [
              '/settings/remote-access',
              '/settings/remote-consent',
              '/settings/proxy-policy',
              '/settings/remote-webrtc',
            ],
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*', 'identity.*'],
          },
          {
            to: '/settings/workflow',
            label: 'Workflow e Perfis',
            matchPrefixes: ['/settings/workflow', '/settings/workflow-profiles'],
            anyOfPermissions: ['settings.*', 'settings.read', 'workflow.*', 'admin.*'],
            keywords: ['workflow profiles', 'estados', 'transicoes', 'sla'],
          },
          {
            to: '/settings/notifications',
            label: 'Notificações',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/custom-fields',
            label: 'Campos Personalizados',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/agent-updates',
            label: 'Atualizações do Agente',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
            keywords: ['agent updates', 'rollout'],
          },
          {
            to: '/settings/mcp-tools',
            label: 'Ferramentas de IA (MCP)',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/ai-cost',
            label: 'Cockpit de Custo IA',
            anyOfPermissions: ['ai_chat.*', 'ai_chat.view', 'settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/branding',
            label: 'Branding',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/audit',
            label: 'Auditoria de Configurações',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
          {
            to: '/settings/database-maintenance',
            label: 'Manutenção do Banco',
            anyOfPermissions: ['settings.*', 'settings.read', 'admin.*'],
          },
        ],
      },
    ],
  },
];

/** Normaliza texto para busca insensível a acentos e caixa. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Verifica correspondência exata ou por segmento de caminho (`/a` casa `/a` e `/a/b`, mas não `/ab`). */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Determina se um link ou subitem deve ficar destacado para o pathname atual. */
export function isRouteActive(
  pathname: string,
  item: { to: string; end?: boolean; matchPrefixes?: string[] },
): boolean {
  if (item.matchPrefixes && item.matchPrefixes.length > 0) {
    return item.matchPrefixes.some((prefix) => matchesPathPrefix(pathname, prefix));
  }
  if (item.end) return pathname === item.to;
  return matchesPathPrefix(pathname, item.to);
}

/** Filtra grupos, links e subitens com base nas permissões do usuário. */
export function filterSidebarGroups(
  groups: SidebarGroup[],
  hasAnyPermission: (permissions: string[]) => boolean,
): SidebarGroup[] {
  const result: SidebarGroup[] = [];

  for (const group of groups) {
    const visibleItems: SidebarNavItem[] = [];

    for (const item of group.items) {
      if (item.kind === 'link') {
        if (item.alternateRoutes && item.alternateRoutes.length > 0) {
          const allowedRoute = item.alternateRoutes.find((route) =>
            hasAnyPermission(route.anyOfPermissions),
          );
          if (!allowedRoute) continue;
          visibleItems.push({ ...item, to: allowedRoute.to });
          continue;
        }

        if (item.anyOfPermissions && !hasAnyPermission(item.anyOfPermissions)) {
          continue;
        }
        visibleItems.push(item);
        continue;
      }

      if (item.anyOfPermissions && !hasAnyPermission(item.anyOfPermissions)) {
        continue;
      }

      const visibleChildren = item.children.filter(
        (child) => !child.anyOfPermissions || hasAnyPermission(child.anyOfPermissions),
      );
      if (visibleChildren.length === 0) continue;

      visibleItems.push({ ...item, children: visibleChildren });
    }

    if (visibleItems.length > 0) {
      result.push({ ...group, items: visibleItems });
    }
  }

  return result;
}

function matchesQuery(
  query: string,
  label: string,
  keywords?: string[],
): boolean {
  if (normalizeSearchText(label).includes(query)) return true;
  if (!keywords || keywords.length === 0) return false;
  return keywords.some((keyword) => normalizeSearchText(keyword).includes(query));
}

/** Filtra grupos e subitens pelo termo de busca, mantendo acordeões cujo título casar. */
export function filterSidebarGroupsByQuery(
  groups: SidebarGroup[],
  rawQuery: string,
): SidebarGroup[] {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query) return groups;

  const result: SidebarGroup[] = [];

  for (const group of groups) {
    const filteredItems: SidebarNavItem[] = [];

    for (const item of group.items) {
      if (item.kind === 'link') {
        if (matchesQuery(query, item.label, item.keywords)) {
          filteredItems.push(item);
        }
        continue;
      }

      if (matchesQuery(query, item.label, item.keywords)) {
        filteredItems.push(item);
        continue;
      }

      const matchingChildren = item.children.filter((child) =>
        matchesQuery(query, child.label, child.keywords),
      );
      if (matchingChildren.length > 0) {
        filteredItems.push({ ...item, children: matchingChildren });
      }
    }

    if (filteredItems.length > 0) {
      result.push({ ...group, items: filteredItems });
    }
  }

  return result;
}

/** Resolve qual seção acordeão deve iniciar/manter-se aberta para o pathname atual. */
export function resolveActiveAccordionSection(
  pathname: string,
  groups: SidebarGroup[],
): SidebarAccordionSection | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.kind !== 'accordion') continue;
      if (
        item.children.some((child) => isRouteActive(pathname, child)) ||
        (item.matchPrefixes?.some((prefix) => matchesPathPrefix(pathname, prefix)) ?? false)
      ) {
        return item.id;
      }
    }
  }
  return null;
}

/** Coleta todos os links declarados na sidebar para verificação em testes. */
export function collectAllSidebarLinks(
  groups: SidebarGroup[] = SIDEBAR_GROUPS,
): Array<{ groupId: string; sectionId?: string; to: string; label: string }> {
  const links: Array<{ groupId: string; sectionId?: string; to: string; label: string }> = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (item.kind === 'link') {
        links.push({ groupId: group.id, to: item.to, label: item.label });
      } else {
        for (const child of item.children) {
          links.push({
            groupId: group.id,
            sectionId: item.id,
            to: child.to,
            label: child.label,
          });
        }
      }
    }
  }

  return links;
}

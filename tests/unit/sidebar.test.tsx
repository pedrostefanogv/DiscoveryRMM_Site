// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

const mockState = {
  permissions: ['admin.*'] as string[],
};

vi.mock('@/theme/ThemeContext', () => ({
  useTheme: () => ({
    branding: {
      appName: 'Discovery RMM',
      logoUrl: null,
    },
  }),
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({
    hasAnyPermission: (required: string[]) => {
      if (mockState.permissions.includes('admin.*')) return true;
      return required.some((perm) =>
        mockState.permissions.some(
          (granted) => granted.toLowerCase() === perm.toLowerCase(),
        ),
      );
    },
  }),
}));

vi.mock('@/components/ui', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className} aria-hidden="true" />
  ),
}));

function renderSidebar(
  initialPath = '/',
  overrides: Partial<React.ComponentProps<typeof Sidebar>> = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar
        collapsed={false}
        onToggle={vi.fn()}
        isDesktop={true}
        mobileOpen={false}
        onCloseMobile={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockState.permissions = ['admin.*'];
  });

  describe('filtragem por permissões', () => {
    it('oculta links e grupos sem permissão quando usuário só possui Agents.View', () => {
      mockState.permissions = ['Agents.View'];
      renderSidebar('/agents');

      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Agentes' })).toBeTruthy();

      expect(screen.queryByRole('button', { name: 'Automação' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Service Board' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Suporte' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Base de Conhecimento' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Configurações' })).toBeNull();
      expect(screen.queryByText('Análise')).toBeNull();
    });

    it('exibe Labels Automáticas em Automação apenas quando possui automation.read e Agents.View', () => {
      mockState.permissions = ['automation.read'];
      const { unmount } = renderSidebar('/automation');
      expect(screen.getByRole('button', { name: 'Automação' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Labels Automáticas' })).toBeNull();
      unmount();

      mockState.permissions = ['automation.read', 'Agents.View'];
      renderSidebar('/automation');
      expect(screen.getByRole('link', { name: 'Labels Automáticas' })).toBeTruthy();
    });

    it('exibe Base de Conhecimento e grupo Atendimento quando usuário possui KnowledgeBase.View', () => {
      mockState.permissions = ['KnowledgeBase.View'];
      renderSidebar('/knowledge');

      expect(screen.getByText('Atendimento')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Base de Conhecimento' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Suporte' })).toBeNull();
    });
  });

  describe('destaque ativo e abertura de seção em rotas alias', () => {
    it('em /settings/workflow-profiles abre Configurações e marca Workflow e Perfis (não Suporte)', () => {
      renderSidebar('/settings/workflow-profiles');

      const settingsBtn = screen.getByRole('button', { name: 'Configurações' });
      const supportBtn = screen.getByRole('button', { name: 'Suporte' });

      expect(settingsBtn.getAttribute('aria-expanded')).toBe('true');
      expect(supportBtn.getAttribute('aria-expanded')).toBe('false');

      const workflowLink = screen.getByRole('link', { name: 'Workflow e Perfis' });
      expect(workflowLink.getAttribute('aria-current')).toBe('page');
    });

    it('em /settings/proxy-policy marca Acesso Remoto como ativo', () => {
      renderSidebar('/settings/proxy-policy');

      const remoteLink = screen.getByRole('link', { name: 'Acesso Remoto' });
      expect(remoteLink.getAttribute('aria-current')).toBe('page');
    });

    it('em /patches/pending marca Atualizações e Pendências como ativo', () => {
      renderSidebar('/patches/pending');

      const updatesLink = screen.getByRole('link', { name: 'Atualizações e Pendências' });
      expect(updatesLink.getAttribute('aria-current')).toBe('page');
    });

    it('em /identity/roles marca Usuários, Grupos e Roles como ativo', () => {
      renderSidebar('/identity/roles');

      const accessLink = screen.getByRole('link', { name: 'Usuários, Grupos e Roles' });
      expect(accessLink.getAttribute('aria-current')).toBe('page');
    });

    it('em /sites marca Clientes e Sites como ativo', () => {
      renderSidebar('/sites');

      const clientsLink = screen.getByRole('link', { name: 'Clientes e Sites' });
      expect(clientsLink.getAttribute('aria-current')).toBe('page');
    });
  });

  describe('filtro rápido do menu', () => {
    it('filtra itens ignorando acentos, limpa com botão ou Escape e exibe estado vazio', () => {
      renderSidebar('/');

      const searchInput = screen.getByLabelText('Filtrar menu') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'manutencao' } });

      expect(screen.getByRole('link', { name: 'Manutenção do Banco' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();

      // Limpar com Escape
      fireEvent.keyDown(searchInput, { key: 'Escape' });
      expect(searchInput.value).toBe('');
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();

      // Estado vazio
      fireEvent.change(searchInput, { target: { value: 'xyzinexistente' } });
      expect(screen.getByText('Nenhum item encontrado')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro' }));
      expect(searchInput.value).toBe('');
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    });
  });

  describe('acessibilidade no modo recolhido e drawer mobile', () => {
    it('mantém nomes acessíveis nos links quando sidebar está recolhida', () => {
      renderSidebar('/', { collapsed: true, isDesktop: true });

      const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
      expect(dashboardLink.getAttribute('title')).toBe('Dashboard');
      expect(screen.getByRole('button', { name: 'Configurações' })).toBeTruthy();
    });

    it('marca aside como inert e aria-hidden quando drawer mobile está fechado', () => {
      const { container } = renderSidebar('/', { isDesktop: false, mobileOpen: false });
      const aside = container.querySelector('#main-sidebar');

      expect(aside?.getAttribute('aria-hidden')).toBe('true');
      expect(aside?.hasAttribute('inert')).toBe(true);
    });

    it('expõe aside como dialog modal quando drawer mobile está aberto', () => {
      renderSidebar('/', { isDesktop: false, mobileOpen: true });

      const dialog = screen.getByRole('dialog', { name: 'Menu lateral' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(screen.getByRole('button', { name: 'Fechar menu lateral' })).toBeTruthy();
    });
  });
});

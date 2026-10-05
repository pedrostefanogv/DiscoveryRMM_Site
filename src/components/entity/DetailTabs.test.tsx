import { fireEvent, render, screen } from '@testing-library/react';
import { Building2, Monitor } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { DetailTabs, resolveDetailTab, type DetailTab } from './DetailTabs';

type Id = 'sites' | 'agentes';

const TABS: DetailTab<Id>[] = [
  { id: 'sites', label: 'Sites', icon: Building2 },
  { id: 'agentes', label: 'Agentes', icon: Monitor },
];

const IDS: Id[] = ['sites', 'agentes'];

describe('DetailTabs', () => {
  it('renderiza os rótulos e marca apenas a aba ativa', () => {
    render(<DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" />);

    const sites = screen.getByRole('tab', { name: /Sites/ });
    const agentes = screen.getByRole('tab', { name: /Agentes/ });

    expect(sites.getAttribute('aria-selected')).toBe('true');
    expect(agentes.getAttribute('aria-selected')).toBe('false');
    expect(sites.className).toContain('bg-primary/20');
    expect(agentes.className).not.toContain('bg-primary/20');
  });

  it('usa o mesmo recipiente visual de Departamentos', () => {
    render(<DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" />);
    const tablist = screen.getByRole('tablist', { name: 'Seções' });
    expect(tablist.className).toContain('bg-surface-light');
    expect(tablist.className).toContain('rounded-xl');
  });

  it('chama onChange com o id da aba clicada', () => {
    const onChange = vi.fn();
    render(<DetailTabs tabs={TABS} active="sites" onChange={onChange} ariaLabel="Seções" />);

    fireEvent.click(screen.getByRole('tab', { name: /Agentes/ }));

    expect(onChange).toHaveBeenCalledWith('agentes');
  });

  it('liga as abas ao painel e usa roving tabindex', () => {
    render(
      <DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" panelIdPrefix="t" />,
    );

    const sites = screen.getByRole('tab', { name: /Sites/ });
    const agentes = screen.getByRole('tab', { name: /Agentes/ });

    expect(sites.id).toBe('t-tab-sites');
    expect(sites.getAttribute('aria-controls')).toBe('t-panel');
    expect(sites.getAttribute('tabindex')).toBe('0');
    expect(agentes.getAttribute('tabindex')).toBe('-1');
  });

  it('navega com as setas do teclado', () => {
    const onChange = vi.fn();
    render(<DetailTabs tabs={TABS} active="sites" onChange={onChange} ariaLabel="Seções" />);

    fireEvent.keyDown(screen.getByRole('tab', { name: /Sites/ }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('agentes');
  });

  it('exibe o contador opcional e omite quando não informado', () => {
    render(
      <DetailTabs
        tabs={[
          { id: 'sites', label: 'Sites', icon: Building2, badge: 3 },
          { id: 'agentes', label: 'Agentes', icon: Monitor },
        ]}
        active="sites"
        onChange={() => {}}
        ariaLabel="Seções"
      />,
    );

    const sites = screen.getByRole('tab', { name: /Sites/ });
    const agentes = screen.getByRole('tab', { name: /Agentes/ });

    expect(sites.textContent).toContain('3');
    expect(agentes.querySelector('span')).toBeNull();
  });

  it('resolveDetailTab usa o valor conhecido e cai no fallback para nulo/desconhecido', () => {
    expect(resolveDetailTab('agentes', IDS, 'sites')).toBe('agentes');
    expect(resolveDetailTab(null, IDS, 'sites')).toBe('sites');
    expect(resolveDetailTab('inexistente', IDS, 'sites')).toBe('sites');
  });
});

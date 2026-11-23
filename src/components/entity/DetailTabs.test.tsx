import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailTabs, resolveDetailTab, type DetailTab } from './DetailTabs';

type Id = 'sites' | 'agentes';

const TABS: DetailTab<Id>[] = [
  { id: 'sites', label: 'Sites', icon: "apartment" },
  { id: 'agentes', label: 'Agentes', icon: "desktop_windows" },
];

const IDS: Id[] = ['sites', 'agentes'];

describe('DetailTabs', () => {
  it('renderiza os rótulos e marca apenas a aba ativa', () => {
    render(<DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" />);

    const sites = screen.getByRole('tab', { name: /Sites/ });
    const agentes = screen.getByRole('tab', { name: /Agentes/ });

    expect(sites.getAttribute('aria-selected')).toBe('true');
    expect(agentes.getAttribute('aria-selected')).toBe('false');
    // Estilo vigente: aba ativa é a que tem o sublinhado (o antigo fundo
    // "bg-primary/20" era da versão em pílula, que não existe mais).
    expect(sites.className).toContain('after:border-primary');
    expect(agentes.className).not.toContain('after:border-primary');
  });

  it('usa o recipiente de aba vigente (linha com borda inferior)', () => {
    render(<DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" />);
    const tablist = screen.getByRole('tablist', { name: 'Seções' });

    expect(tablist.className).toContain('border-b');
    expect(tablist.className).toContain('border-border');
    expect(tablist.className).toContain('overflow-x-auto');
    // Não é mais a "pílula" com fundo e cantos arredondados.
    expect(tablist.className).not.toContain('rounded-xl');
    expect(tablist.className).not.toContain('bg-surface-light');
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
    // O painel é renderizado pelo chamador com id `${prefix}-panel`; a aba
    // precisa apontar para ele (a11y).
    expect(sites.getAttribute('aria-controls')).toBe('t-panel');
    expect(agentes.getAttribute('aria-controls')).toBe('t-panel');
    expect(sites.getAttribute('tabindex')).toBe('0');
    expect(agentes.getAttribute('tabindex')).toBe('-1');
  });

  it('sem panelIdPrefix não emite aria-controls órfão', () => {
    render(<DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" />);

    // Sem prefixo estável o id do painel seria o gerado pelo useId (que o
    // chamador não conhece): apontar para ele seria pior que omitir.
    expect(screen.getByRole('tab', { name: /Sites/ }).getAttribute('aria-controls')).toBeNull();
  });

  it('prefixo vazio conta como ausente (não gera aria-controls órfão)', () => {
    render(
      <DetailTabs tabs={TABS} active="sites" onChange={() => {}} ariaLabel="Seções" panelIdPrefix="" />,
    );

    const sites = screen.getByRole('tab', { name: /Sites/ });
    expect(sites.getAttribute('aria-controls')).toBeNull();
    expect(sites.id.endsWith('-tab-sites')).toBe(true);
    expect(sites.id.startsWith('-')).toBe(false);
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
          { id: 'sites', label: 'Sites', icon: "apartment", badge: 3 },
          { id: 'agentes', label: 'Agentes', icon: "desktop_windows" },
        ]}
        active="sites"
        onChange={() => {}}
        ariaLabel="Seções"
      />,
    );

    const sites = screen.getByRole('tab', { name: /Sites/ });
    const agentes = screen.getByRole('tab', { name: /Agentes/ });

    // O contador é o único elemento com fundo arredondado dentro da aba.
    expect(sites.querySelector('.rounded-full')?.textContent).toContain('3');
    expect(agentes.querySelector('.rounded-full')).toBeNull();
  });

  it('resolveDetailTab usa o valor conhecido e cai no fallback para nulo/desconhecido', () => {
    expect(resolveDetailTab('agentes', IDS, 'sites')).toBe('agentes');
    expect(resolveDetailTab(null, IDS, 'sites')).toBe('sites');
    expect(resolveDetailTab('inexistente', IDS, 'sites')).toBe('sites');
  });
});

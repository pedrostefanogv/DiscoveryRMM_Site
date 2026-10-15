import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Seletor de agente da Loja de Softwares (escopo Agente).
 *
 * O que estes testes protegem:
 *  - os selects de cliente/site têm rótulo (antes apareciam soltos, só com o
 *    nome do cliente/site, o que deixava a seleção confusa);
 *  - o nome do agente não aparece duplicado quando displayName == hostname;
 *  - a confirmação da seleção mostra o nome e o status, não o UUID cru.
 */

const mocks = vi.hoisted(() => ({
  clients: [{ id: 'c1', name: 'Geral' }],
  sites: [{ id: 's1', name: 'Site geral' }],
  agents: [
    { id: '01a13ccf-dc1c-7497-91e8-547504120a89', hostname: 'AORUSAXV2', displayName: 'AORUSAXV2', isOnline: true },
    { id: 'b2', hostname: 'NTBookPositivo', displayName: 'NTBookPositivo', isOnline: false },
  ],
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: mocks.clients }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({ data: mocks.sites }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgentsBySite: () => ({ data: mocks.agents, isLoading: false }),
}));

import { AgentPicker } from './AgentPicker';

const SELECTED_ID = mocks.agents[0].id;

function chooseSite() {
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText('Site'), { target: { value: 's1' } });
}

describe('AgentPicker', () => {
  afterEach(() => cleanup());

  it('rotula cliente e site e orienta antes de escolher o site', () => {
    render(<AgentPicker value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Cliente')).toBeTruthy();
    expect(screen.getByLabelText('Site')).toBeTruthy();
    expect(screen.getByText('Selecione o cliente e o site para listar os agentes disponíveis.')).toBeTruthy();
    // Sem site escolhido não há busca nem lista.
    expect(screen.queryByPlaceholderText('Buscar agente...')).toBeNull();
  });

  it('não repete o nome do agente quando displayName == hostname', () => {
    render(<AgentPicker value="" onChange={vi.fn()} />);
    chooseSite();

    expect(screen.getAllByText('AORUSAXV2')).toHaveLength(1);
    expect(screen.getAllByText('NTBookPositivo')).toHaveLength(1);
  });

  it('confirma a seleção com nome e status, sem expor o UUID', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AgentPicker value="" onChange={onChange} />);
    chooseSite();

    fireEvent.click(screen.getByText('AORUSAXV2'));
    expect(onChange).toHaveBeenCalledWith(SELECTED_ID);

    rerender(<AgentPicker value={SELECTED_ID} onChange={onChange} />);
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.queryByText(SELECTED_ID)).toBeNull();
  });

  it('mostra o hostname quando ele difere do displayName', () => {
    mocks.agents[0].displayName = 'Notebook da Diretoria';
    try {
      render(<AgentPicker value={SELECTED_ID} onChange={vi.fn()} />);
      chooseSite();

      // Aparece na lista e na confirmação da seleção.
      expect(screen.getAllByText('Notebook da Diretoria')).toHaveLength(2);
      expect(screen.getByText('Online · AORUSAXV2')).toBeTruthy();
    } finally {
      mocks.agents[0].displayName = 'AORUSAXV2';
    }
  });

  it('abre no contexto informado e avisa o dono do filtro quando ele muda', () => {
    const onContextChange = vi.fn();
    render(
      <AgentPicker
        value=""
        onChange={vi.fn()}
        initialClientId="c1"
        initialSiteId="s1"
        onContextChange={onContextChange}
      />,
    );

    expect((screen.getByLabelText('Cliente') as HTMLSelectElement).value).toBe('c1');
    expect((screen.getByLabelText('Site') as HTMLSelectElement).value).toBe('s1');
    // Com o contexto já preenchido a lista aparece sem nova escolha.
    expect(screen.getByText('AORUSAXV2')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Site'), { target: { value: '' } });
    expect(onContextChange).toHaveBeenCalledWith('c1', '');
  });
});

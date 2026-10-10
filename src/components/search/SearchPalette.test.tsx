import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchPalette } from './SearchPalette';
import type { SearchResultItem, UniversalSearchResult } from '@/api';

function agentItem(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    id: '019faa6f-8eaa-7c38-9878-36cc96f9be3e',
    title: 'AORUSAXV2',
    subtitle: 'Windows 11 Pro',
    description: 'AORUSAXV2 · pedro',
    entityType: 'agent',
    clientId: 'c1',
    clientName: 'Geral',
    siteId: 's1',
    siteName: 'Site_Teste',
    url: '/agents/019faa6f-8eaa-7c38-9878-36cc96f9be3e',
    ...overrides,
  };
}

function resultsWith(items: SearchResultItem[]): UniversalSearchResult {
  return {
    groups: [{ entityType: 'agents', label: 'Agentes', icon: 'monitor', items }],
    totalResults: items.length,
    generatedAtUtc: '2026-10-10T18:00:00Z',
  };
}

function renderPalette(results: UniversalSearchResult) {
  return render(
    <MemoryRouter>
      <SearchPalette query="pedro" results={results} loading={false} error={null} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe('SearchPalette', () => {
  afterEach(() => cleanup());

  it('mostra o usuário logado no resultado de agente, junto de cliente e site', () => {
    renderPalette(resultsWith([agentItem({ loggedUser: 'pedro' })]));

    expect(screen.getByText('Geral · Site_Teste · pedro')).toBeTruthy();
  });

  it('omite o usuário quando o agent não reporta sessão', () => {
    renderPalette(resultsWith([agentItem({ loggedUser: null })]));

    expect(screen.getByText('Geral · Site_Teste')).toBeTruthy();
    expect(screen.queryByText(/Geral · Site_Teste ·/)).toBeNull();
  });

  it('tolera resposta antiga da API sem o campo loggedUser', () => {
    renderPalette(resultsWith([agentItem({ loggedUser: undefined })]));

    expect(screen.getByText('Geral · Site_Teste')).toBeTruthy();
  });

  it('não anexa usuário a resultados que não são de agente', () => {
    renderPalette(
      resultsWith([
        agentItem({ entityType: 'client', title: 'Cliente Geral', loggedUser: 'pedro', siteName: null }),
      ]),
    );

    expect(screen.getByText('Cliente Geral')).toBeTruthy();
    expect(screen.queryByText('Geral · pedro')).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Modal "Nova Regra de Aprovação".
 *
 * Dois ajustes que a revisão cobriu:
 *  - o tipo de instalação fica travado quando o pacote vem do catálogo (antes
 *    dava para montar uma regra Winget para um pacote Custom e a API devolvia
 *    400);
 *  - o escopo/agente já filtrados na aba chegam prontos, e o seletor de agente
 *    reencontra o agente escolhido (antes a confirmação só mostrava o UUID).
 */

vi.mock('@/hooks/useAppStore', () => ({
  useCreateApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Geral' }] }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({ data: [{ id: 's1', name: 'Site geral' }] }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgentsBySite: () => ({
    data: [
      {
        id: 'a1',
        hostname: 'AORUSAXV2',
        displayName: 'AORUSAXV2',
        isOnline: true,
      },
    ],
    isLoading: false,
  }),
}));

import { ApprovalFormModal } from './ApprovalFormModal';
import { AppApprovalScopeType, AppInstallationType } from '@/api/types';

afterEach(() => cleanup());

describe('ApprovalFormModal', () => {
  it('abre com o escopo/agente filtrados na aba e mostra o nome do agente', () => {
    render(
      <ApprovalFormModal
        open
        onClose={vi.fn()}
        prefillInstallationType={AppInstallationType.Custom}
        prefillScopeType={AppApprovalScopeType.Agent}
        prefillClientId="c1"
        prefillSiteId="s1"
        prefillAgentId="a1"
      />,
    );

    expect((screen.getByLabelText('Tipo de instalação') as HTMLSelectElement).value).toBe(
      String(AppInstallationType.Custom),
    );
    expect((screen.getByLabelText('Cliente') as HTMLSelectElement).value).toBe('c1');
    expect((screen.getByLabelText('Site') as HTMLSelectElement).value).toBe('s1');
    // Agente reencontrado pelo contexto inicial: nome na confirmação, sem UUID.
    expect(screen.getAllByText('AORUSAXV2').length).toBeGreaterThan(0);
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.queryByText('a1')).toBeNull();
  });

  it('trava o tipo de instalação quando o pacote vem do catálogo', () => {
    render(
      <ApprovalFormModal open onClose={vi.fn()} prefillPackageId="foxit_editor" lockPackageId />,
    );

    expect((screen.getByLabelText('Tipo de instalação') as HTMLSelectElement).disabled).toBe(true);
  });

  it('mantém o tipo editável quando a regra é criada pela aba Aprovações', () => {
    render(<ApprovalFormModal open onClose={vi.fn()} />);

    expect((screen.getByLabelText('Tipo de instalação') as HTMLSelectElement).disabled).toBe(false);
  });

  it('limpa o motivo ao reabrir (não reaproveita justificativa antiga)', () => {
    const { rerender } = render(<ApprovalFormModal open onClose={vi.fn()} />);

    const reasonField = () => screen.getByLabelText('Motivo (opcional)') as HTMLInputElement;
    fireEvent.change(reasonField(), { target: { value: 'motivo antigo' } });
    expect(reasonField().value).toBe('motivo antigo');

    rerender(<ApprovalFormModal open={false} onClose={vi.fn()} />);
    rerender(<ApprovalFormModal open onClose={vi.fn()} />);

    expect(reasonField().value).toBe('');
  });

  it('limita o motivo ao tamanho da coluna (500)', () => {
    render(<ApprovalFormModal open onClose={vi.fn()} />);

    expect(screen.getByLabelText('Motivo (opcional)').getAttribute('maxlength')).toBe('500');
  });
});

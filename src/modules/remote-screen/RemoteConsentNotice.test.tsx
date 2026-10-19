import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RemoteConsentNotice from './RemoteConsentNotice';

describe('RemoteConsentNotice', () => {
  it('mostra quem solicitou, a ação padrão (negar) e a política', () => {
    render(
      <RemoteConsentNotice
        operator="Ana"
        timeoutAction="deny"
        policySource="Site"
        deadlineAt={Date.now() + 42_000}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('Aguardando o usuário remoto autorizar o acesso')).toBeTruthy();
    expect(screen.getByText('Ana solicitou acesso remoto a este computador.')).toBeTruthy();
    expect(screen.getByText('NEGADO')).toBeTruthy();
    expect(screen.getByText('Política: Site')).toBeTruthy();
    // Contador é VISUAL (anel animado): nenhum número de segundos na tela.
    expect(screen.getByTestId('remote-consent-countdown')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b\d+s\b/);
  });

  it('mostra PERMITIDO quando a política aprova no timeout', () => {
    render(
      <RemoteConsentNotice
        operator="Ana"
        timeoutAction="approve"
        deadlineAt={Date.now() + 30_000}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('PERMITIDO')).toBeTruthy();
  });

  it('sem metadados usa fallback e animação indeterminada', () => {
    render(<RemoteConsentNotice onCancel={() => undefined} />);

    expect(screen.getByText('Solicitação de acesso remoto enviada ao computador.')).toBeTruthy();
    expect(screen.getByText(/ação padrão da política será aplicada automaticamente/)).toBeTruthy();
    expect(screen.getByTestId('remote-consent-countdown')).toBeTruthy();
  });

  it('deadline já vencido não quebra (anel mínimo de 1s)', () => {
    render(
      <RemoteConsentNotice
        operator="Ana"
        timeoutAction="deny"
        deadlineAt={Date.now() - 5_000}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByTestId('remote-consent-countdown')).toBeTruthy();
    expect(screen.getByText('NEGADO')).toBeTruthy();
  });

  it('dispara o cancelamento da solicitação', () => {
    const onCancel = vi.fn();
    render(<RemoteConsentNotice operator="Ana" onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancelar solicitação'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Após solicitar, o botão entra em "Cancelando..." e não dispara de novo.
    expect(screen.getByText('Cancelando...')).toBeTruthy();
    expect((screen.getByText('Cancelando...') as HTMLButtonElement).disabled).toBe(true);
  });
});

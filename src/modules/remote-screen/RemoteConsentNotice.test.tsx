import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RemoteConsentNotice from './RemoteConsentNotice';

describe('RemoteConsentNotice', () => {
  it('mostra a mensagem, a contagem e a origem da política', () => {
    render(
      <RemoteConsentNotice
        message="Ana solicita acesso remoto."
        remainingSeconds={42}
        policySource="Site"
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('Aguardando autorização')).toBeTruthy();
    expect(screen.getByText('Ana solicita acesso remoto.')).toBeTruthy();
    expect(screen.getByText('42s')).toBeTruthy();
    expect(screen.getByText('Política: Site')).toBeTruthy();
  });

  it('não mostra contagem negativa e dispara o cancelamento', () => {
    const onCancel = vi.fn();
    render(<RemoteConsentNotice remainingSeconds={-5} onCancel={onCancel} />);

    expect(screen.getByText('0s')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancelar solicitação'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

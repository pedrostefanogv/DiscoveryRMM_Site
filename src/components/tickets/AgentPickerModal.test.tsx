import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentPickerModal } from './AgentPickerModal';

const agents = [
  { id: 'a1', hostname: 'PC-ANA', displayName: 'Notebook Ana' },
  { id: 'a2', hostname: 'SRV-TI', displayName: 'Servidor TI' },
] as never[];

describe('AgentPickerModal', () => {
  afterEach(() => cleanup());

  it('não renderiza fechado', () => {
    const { container } = render(
      <AgentPickerModal open={false} agents={agents} selectedId={null} onClose={() => {}} onSave={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('busca por hostname, seleciona e salva o agent', () => {
    const onSave = vi.fn();
    render(<AgentPickerModal open agents={agents} selectedId={null} onClose={() => {}} onSave={onSave} />);

    expect(screen.getByText('Notebook Ana')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar agent'), { target: { value: 'srv' } });
    expect(screen.queryByText('Notebook Ana')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Servidor TI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith('a2');
  });

  it('permite remover o agent vinculado', () => {
    const onSave = vi.fn();
    render(<AgentPickerModal open agents={agents} selectedId="a1" onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Remover agent/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('avisa quando não há agent no escopo', () => {
    render(<AgentPickerModal open agents={[]} selectedId={null} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByText('Nenhum agent neste escopo.')).toBeTruthy();
  });
});

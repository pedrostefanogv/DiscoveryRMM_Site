import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileIcon } from './fileIcons';

describe('FileIcon', () => {
  it('anuncia o tipo do arquivo via aria-label', () => {
    render(<FileIcon name="logs.db" />);
    expect(screen.getByRole('img', { name: 'Banco de dados' })).toBeTruthy();
  });

  it('usa o icone de pasta para diretorios e de pasta superior na linha ".."', () => {
    const { rerender } = render(<FileIcon name="qualquer.txt" isDir />);
    expect(screen.getByRole('img', { name: 'Pasta' })).toBeTruthy();

    rerender(<FileIcon parent />);
    expect(screen.getByRole('img', { name: 'Pasta superior' })).toBeTruthy();
  });

  it('ignora a extensao quando a entrada e diretorio', () => {
    render(<FileIcon name="pasta.zip" isDir />);
    expect(screen.getByRole('img', { name: 'Pasta' })).toBeTruthy();
  });

  it('adiciona o selo de atalho quando a entrada e link', () => {
    const { container } = render(<FileIcon name="atalho" isDir isLink />);
    // Icone principal + seta do atalho (a seta e aria-hidden).
    expect(container.querySelectorAll('svg').length).toBe(2);
  });

  it('nao adiciona selo em arquivo comum', () => {
    const { container } = render(<FileIcon name="comum.txt" />);
    expect(container.querySelectorAll('svg').length).toBe(1);
  });

  it('esmaece o icone e anuncia "(oculto)" para item oculto', () => {
    render(<FileIcon name="pasta-oculta" isDir isHidden />);
    const img = screen.getByRole('img', { name: 'Pasta (oculto)' });
    expect(img.className).toContain('opacity-40');
  });

  it('nao aplica opacidade em item visivel', () => {
    render(<FileIcon name="visivel.txt" />);
    const img = screen.getByRole('img', { name: 'Arquivo de texto' });
    expect(img.className).not.toContain('opacity-40');
  });
});

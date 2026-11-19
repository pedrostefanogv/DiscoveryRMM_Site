import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Regressão do "lavado" no tema claro.
 *
 * Dois vetores, ambos corrigidos:
 *  1. o container de status tinha bg-black/40 (backdrop escuro do canvas). As
 *     caixas translúcidas (bg-danger/20) por cima viravam marrom dessaturado;
 *  2. os próprios chips/caixas usavam fundo semântico translúcido (20% de
 *     opacidade) com texto na cor semântica, que no tema claro resulta em texto
 *     escuro sobre fundo quase branco.
 *
 * Regra adotada: cor semântica usa fundo SÓLIDO + texto branco, que independe do
 * que está atrás e funciona nos dois temas.
 */
describe('cores do WebRDP legíveis nos dois temas', () => {
  it('o container de status NÃO tem backdrop escuro', () => {
    // bg-black/40 sob caixas translúcidas era a causa do aspecto lavado.
    expect(RDP_SRC).not.toContain('bg-black/40');
  });

  it('o fundo preto fica apenas no canvas (letterbox do desktop)', () => {
    const canvasIdx = RDP_SRC.indexOf('<canvas');
    expect(canvasIdx).toBeGreaterThan(-1);
    expect(RDP_SRC).toContain('bg-black');
  });

  it('alertas usam fundo sólido com texto branco', () => {
    expect(RDP_SRC).toContain('bg-danger px-3 py-2 text-white');
    expect(RDP_SRC).toContain('bg-success px-3 py-2 text-white');
  });

  it('não usa mais fundos semânticos translúcidos', () => {
    // bg-danger/10, bg-danger/20, bg-success/10, bg-warning/10 sobre backdrop
    // arbitrário é o padrão que lavava.
    expect(RDP_SRC).not.toMatch(/bg-danger\/\d+/);
    expect(RDP_SRC).not.toMatch(/bg-success\/\d+/);
    expect(RDP_SRC).not.toMatch(/bg-warning\/\d+/);
  });

  it('chips de estado seguem a mesma regra (sólido + branco)', () => {
    expect(RDP_SRC).toContain('bg-success text-white');
    expect(RDP_SRC).toContain('bg-danger text-white');
    expect(RDP_SRC).toContain('bg-warning text-white');
  });
});

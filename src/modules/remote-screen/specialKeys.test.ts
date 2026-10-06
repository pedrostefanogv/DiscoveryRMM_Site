import { describe, expect, it } from 'vitest';
import {
  SPECIAL_KEY_GROUPS,
  SPECIAL_KEY_IDS,
  buildSpecialKeyInput,
  isSpecialKeyId,
} from './specialKeys';

// A lista precisa espelhar a allow-list fechada do agent (input_combo.go).
// A paridade é verificada do lado do Go (input_combo_test.go), que consegue ler
// o arquivo do viewer sem depender de tipos do Node no tsconfig do site.
describe('specialKeys (teclas especiais do acesso remoto)', () => {
  it('não tem ids duplicados', () => {
    expect(new Set(SPECIAL_KEY_IDS).size).toBe(SPECIAL_KEY_IDS.length);
  });

  it('inclui as combinações não injetáveis por SendInput', () => {
    expect(SPECIAL_KEY_IDS).toContain('ctrl+alt+del');
    expect(SPECIAL_KEY_IDS).toContain('win+l');
  });

  it('marca apenas SAS/bloqueio como API dedicada', () => {
    const dedicated = SPECIAL_KEY_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.dedicated)
      .map((item) => item.id)
      .sort();
    expect(dedicated).toEqual(['ctrl+alt+del', 'win+l']);
  });

  it('todo item tem id e rótulo preenchidos', () => {
    for (const item of SPECIAL_KEY_GROUPS.flatMap((group) => group.items)) {
      expect(item.id.trim().length).toBeGreaterThan(0);
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('monta o payload keycombo aceito pelo agent', () => {
    expect(buildSpecialKeyInput('alt+tab')).toEqual({ type: 'keycombo', combo: 'alt+tab' });
  });

  it('rejeita id fora da allow-list', () => {
    expect(isSpecialKeyId('shutdown')).toBe(false);
    expect(() => buildSpecialKeyInput('shutdown')).toThrow(/não suportada/);
  });
});

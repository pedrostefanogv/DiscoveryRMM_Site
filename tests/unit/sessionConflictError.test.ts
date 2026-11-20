import { describe, expect, it } from 'vitest';
import { isSessionConflictError } from '@/pages/agents/RemoteSession';

/**
 * O backend recusa uma segunda sessão no mesmo agent com:
 *   "Agent already has 1 active Rdp session(s) (max 1). Use force=true to override."
 *
 * A detecção exigia a substring colada "active session", mas a mensagem real
 * traz o TIPO no meio ("active **Rdp** session(s)"). Resultado: a função
 * retornava false, o aviso de conflito NÃO aparecia e o operador só via o toast
 * de erro — sem o botão "Forçar reconexão".
 */
describe('isSessionConflictError', () => {
  it('reconhece a mensagem REAL do backend (Rdp no meio)', () => {
    const real = 'Agent already has 1 active Rdp session(s) (max 1). Use force=true to override.';
    expect(isSessionConflictError(new Error(real))).toBe(true);
  });

  it('reconhece os outros kinds', () => {
    for (const kind of ['Rdp', 'Screen', 'Terminal', 'Processes', 'Files', 'Proxy']) {
      const msg = `Agent already has 1 active ${kind} session(s) (max 1). Use force=true to override.`;
      expect(isSessionConflictError(new Error(msg)), kind).toBe(true);
    }
  });

  it('aceita a forma sem o kind (compatibilidade)', () => {
    expect(isSessionConflictError(new Error('Agent already has 1 active session(s) (max 1).'))).toBe(true);
  });

  it('aceita "have" (plural)', () => {
    expect(isSessionConflictError(new Error('Agent already have 2 active Rdp session(s).'))).toBe(true);
  });

  it('não confunde erros de outra natureza', () => {
    expect(isSessionConflictError(new Error('Connection refused'))).toBe(false);
    expect(isSessionConflictError(new Error('Já existe uma sessão'))).toBe(false);
    expect(isSessionConflictError(new Error('active session'))).toBe(false);
    expect(isSessionConflictError(null)).toBe(false);
    expect(isSessionConflictError(undefined)).toBe(false);
    expect(isSessionConflictError('qualquer string')).toBe(false);
  });
});

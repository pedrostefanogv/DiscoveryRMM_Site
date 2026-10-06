import { describe, expect, it } from 'vitest';
import {
  INPUT_LOCK_LEASE_SECONDS,
  buildInputLockCommand,
  buildInputLockQuery,
  describeInputLockEvent,
  inputLockButtonLabel,
  inputLockButtonTitle,
  parseInputLockChanged,
  type InputLockChangedState,
} from './inputLock';

function changed(payload: Record<string, unknown>) {
  return {
    v: 1,
    type: 'inputLockChanged' as const,
    sessionId: 'sess-1',
    from: 'agent' as const,
    payload,
  };
}

describe('inputLock (bloqueio de entrada do host remoto)', () => {
  it('monta o comando de travar com lease', () => {
    const env = buildInputLockCommand('sess-1', 7, true);
    expect(env.type).toBe('inputLock');
    expect(env.from).toBe('viewer');
    expect(env.sessionId).toBe('sess-1');
    expect(env.sequence).toBe(7);
    expect(env.payload).toEqual({ locked: true, leaseSeconds: INPUT_LOCK_LEASE_SECONDS });
  });

  it('monta o comando de destravar', () => {
    expect(buildInputLockCommand('sess-1', 8, false).payload).toEqual({
      locked: false,
      leaseSeconds: INPUT_LOCK_LEASE_SECONDS,
    });
  });

  it('monta a consulta de estado', () => {
    expect(buildInputLockQuery('sess-1', 1).payload).toEqual({ query: true });
  });

  it('interpreta o estado publicado pelo agent', () => {
    const state = parseInputLockChanged(
      changed({ locked: true, method: 'blockinput', reason: 'locked', leaseRemainingSeconds: 42 }),
    );
    expect(state).toEqual({
      locked: true,
      method: 'blockinput',
      reason: 'locked',
      leaseRemainingSeconds: 42,
    });
  });

  it('ignora envelopes de outros tipos e campos ausentes vira default', () => {
    expect(parseInputLockChanged(null)).toBeNull();
    expect(
      parseInputLockChanged({ v: 1, type: 'pong', sessionId: 's', from: 'agent' }),
    ).toBeNull();
    expect(parseInputLockChanged(changed({ locked: false }))).toEqual({
      locked: false,
      method: '',
      reason: '',
      leaseRemainingSeconds: 0,
    });
  });

  it('avisa em falha de bloqueio e liberação automática', () => {
    const base: InputLockChangedState = {
      locked: false,
      method: '',
      reason: '',
      leaseRemainingSeconds: 0,
    };
    expect(
      describeInputLockEvent({ ...base, reason: 'block_failed: acesso negado' }),
    ).toContain('Não foi possível bloquear');
    expect(describeInputLockEvent({ ...base, reason: 'lease_expired' })).toContain(
      'liberada automaticamente',
    );
    expect(describeInputLockEvent({ ...base, reason: 'max_duration' })).toContain(
      'tempo máximo',
    );
    expect(
      describeInputLockEvent({ ...base, locked: true, reason: 'unblock_failed: errno=5' }),
    ).toContain('Falha ao liberar');
    expect(describeInputLockEvent({ ...base, reason: 'viewer_request' })).toBeNull();
    expect(describeInputLockEvent({ ...base, locked: true, reason: 'locked' })).toBeNull();
  });

  it('rótulo e tooltip refletem o estado', () => {
    const state: InputLockChangedState = {
      locked: true,
      method: 'blockinput',
      reason: 'locked',
      leaseRemainingSeconds: 30,
    };
    expect(inputLockButtonLabel(state)).toContain('bloqueada');
    expect(inputLockButtonTitle(state)).toContain('30s');
    expect(inputLockButtonLabel(null)).toContain('Bloquear');
    expect(inputLockButtonTitle(null)).toContain('MÁQUINA REMOTA');
  });
});

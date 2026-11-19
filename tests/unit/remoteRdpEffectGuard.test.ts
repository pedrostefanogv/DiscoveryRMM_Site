import { describe, expect, it } from 'vitest';

/**
 * Modela a lógica de guarda do efeito IronRDP em RemoteRdp.tsx APÓS a correção.
 *
 * Antes: a guarda usava `preflightError`, que o próprio efeito escrevia em caso
 * de falha. Como estava nas dependências, uma falha bloqueava todas as
 * tentativas seguintes (dead-end sem retry).
 *
 * Agora: a guarda usa `rdpUnavailable` (só quando o AGENT reporta o RDP fora do
 * ar) e erros de conexão vivem em `connectError`, com retry explícito via
 * `connectAttempt`.
 */
interface State {
  rdpUnavailable: boolean;
  connectError: string | null;
  connectAttempt: number;
}

function shouldAttemptConnect(s: State): boolean {
  return !s.rdpUnavailable;
}

/** Simula falhas de conexão e retries explícitos do operador. */
function simulateWithRetries(totalAttempts: number, retries: number): boolean[] {
  const s: State = { rdpUnavailable: false, connectError: null, connectAttempt: 0 };
  const tentou: boolean[] = [];
  let retriesUsed = 0;

  for (let i = 0; i < totalAttempts; i++) {
    if (!shouldAttemptConnect(s)) {
      tentou.push(false);
      continue;
    }
    tentou.push(true);
    // Conexão falha (transitório: TermService subindo, rede, ticket expirado).
    s.connectError = 'Falha no handshake TLS com o servidor RDP.';
    // O efeito re-executa (connectAttempt mudou) — a guarda NÃO bloqueia.
    if (retriesUsed < retries) {
      retriesUsed++;
      s.connectAttempt++;
    }
  }
  return tentou;
}

describe('guarda do efeito IronRDP (após correção)', () => {
  it('permite retry após falha de conexão transitória', () => {
    const tentou = simulateWithRetries(4, 3);
    expect(tentou).toEqual([true, true, true, true]);
  });

  it('erro de conexão NÃO bloqueia a guarda', () => {
    const s: State = { rdpUnavailable: false, connectError: 'erro qualquer', connectAttempt: 0 };
    expect(shouldAttemptConnect(s)).toBe(true);
  });

  it('rdpUnavailable (agent diz RDP fora do ar) SIM bloqueia', () => {
    const s: State = { rdpUnavailable: true, connectError: null, connectAttempt: 0 };
    expect(shouldAttemptConnect(s)).toBe(false);
  });

  it('após o agent reportar RDP disponível, volta a tentar', () => {
    const s: State = { rdpUnavailable: true, connectError: null, connectAttempt: 0 };
    expect(shouldAttemptConnect(s)).toBe(false);
    s.rdpUnavailable = false; // preflight passou a reportar ready=true
    expect(shouldAttemptConnect(s)).toBe(true);
  });
});

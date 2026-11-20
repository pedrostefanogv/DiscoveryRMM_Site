import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Regressão: reconexão em loop a cada tecla digitada.
 *
 * O efeito de conexão do IronRDP faz o connect COMPLETO (pede ticket, abre
 * WebSocket, roda o handshake RDCleanPath). Quando `username` entrou nas
 * dependências, cada CARACTERE digitado no formulário disparava esse ciclo:
 * novo ticket, novo handshake, e o anterior descartado.
 *
 * Sintoma observado em produção: tela presa em "Negociando RDP…", e no NATS o
 * MESMO response RDCleanPath de 808 bytes repetido várias vezes (o agent
 * refazendo o handshake a cada reconexão).
 */
describe('efeito de conexão não reconecta a cada tecla', () => {
  it('as dependências do efeito NÃO incluem a string username', () => {
    // Pega o array de dependências do efeito do IronRDP.
    const m = RDP_SRC.match(
      /\}, \[sessionId, jwt, natsUrl, agentId, rdpUnavailable, connectAttempt,([^\]]*)\]/,
    );
    expect(m).not.toBeNull();
    const deps = m![1];

    // `username` (string) reconectaria a cada tecla. Deve ser o booleano.
    expect(deps).not.toMatch(/\busername\b/);
    expect(deps).toContain('hasUsername');
  });

  it('o gate usa o booleano, não a string', () => {
    expect(RDP_SRC).toContain('if (!hasUsername)');
    expect(RDP_SRC).not.toContain('if (!username.trim()) {\n      setNeedsCredentials');
  });

  it('hasUsername é derivado de username.trim()', () => {
    expect(RDP_SRC).toContain('const hasUsername = username.trim().length > 0');
  });
});

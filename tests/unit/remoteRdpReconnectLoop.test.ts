import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeCredentialFailure, describeIronError, isCredentialError } from '@/modules/remote-rdp/ironRdpClient';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Regressão de DOIS bugs reais causados por usar os campos do formulário como
 * dependência do efeito de conexão (que faz o connect completo: ticket +
 * WebSocket + handshake RDCleanPath).
 *
 * Bug 1 — reconexão a cada tecla: com `username` (string) nas dependências,
 *   cada caractere disparava um ciclo novo; a tela ficava presa em
 *   "Negociando RDP...".
 *
 * Bug 2 — TRUNCAMENTO DO USUÁRIO: com `hasUsername` (booleano) nas
 *   dependências, o efeito disparava na PRIMEIRA tecla. Digitando "pedro", a
 *   conexão era feita com "p" e o Windows respondia STATUS_NO_SUCH_USER
 *   (0xc0000064). Provado pelo evento 4625 na máquina: user=p.
 *
 * Correção: a conexão usa um SNAPSHOT (`submitted`) gravado no clique de
 * Conectar — nunca o valor em digitação.
 */
describe('efeito de conexão usa o snapshot, não os campos vivos', () => {
  it('as dependências do efeito incluem submitted e NÃO username/hasUsername', () => {
    const m = RDP_SRC.match(
      /\}, \[sessionId, jwt, natsUrl, agentId, rdpUnavailable, connectAttempt,([^\]]*)\]/,
    );
    expect(m).not.toBeNull();
    const deps = m![1];

    expect(deps).toContain('submitted');
    // Qualquer um destes reintroduz os bugs 1 ou 2.
    expect(deps).not.toMatch(/\busername\b/);
    expect(deps).not.toMatch(/\bhasUsername\b/);
    expect(deps).not.toMatch(/\bpassword\b/);
    expect(deps).not.toMatch(/\bdomain\b/);
  });

  it('o gate de credenciais olha o snapshot', () => {
    expect(RDP_SRC).toContain('if (!submitted)');
    expect(RDP_SRC).not.toContain('if (!hasUsername)');
  });

  it('a conexão recebe as credenciais do snapshot', () => {
    // Nunca passar os campos vivos: era o que truncava "pedro" em "p".
    expect(RDP_SRC).toContain('username: submitted.username');
    expect(RDP_SRC).toContain('password: submitted.password');
    expect(RDP_SRC).toContain('domain: submitted.domain');
  });

  it('submitCredentials grava o snapshot com o valor já normalizado', () => {
    expect(RDP_SRC).toContain('setSubmitted({ username: u, password, domain: domain.trim() })');
    expect(RDP_SRC).toContain('const u = username.trim()');
  });

  it('não existe mais o booleano hasUsername em CÓDIGO', () => {
    // Remove comentários: o arquivo MENCIONA hasUsername num comentário que
    // explica o bug. Checar o texto cru daria falso positivo (mesma armadilha
    // do teste de localStorage, que casava o próprio comentário).
    const code = RDP_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('hasUsername');
    // Garante que o strip não esvaziou o arquivo.
    expect(code).toContain('submitted');
  });
});

describe('falha de credencial do Windows é reconhecida e traduzida', () => {
  // Mensagem real do IronRDP observada em produção.
  const realMsg =
    '[CredSSP] CredSSP: InvalidToken: CredSSP server returned an error status; status is STATUS_LOGON_FAILURE [0xc000006d]';

  it('reconhece STATUS_LOGON_FAILURE como erro de credencial', () => {
    const info = describeIronError(new Error(realMsg));
    expect(info.needsCredentials).toBe(true);
  });

  it('traduz o erro cru do CredSSP para texto acionável', () => {
    const friendly = describeCredentialFailure(realMsg);
    expect(friendly).toBeTruthy();
    expect(friendly).toContain('Usuário ou senha incorretos');
    // Não deve vazar jargão do protocolo para o operador.
    expect(friendly).not.toContain('InvalidToken');
  });

  it('cobre outros status do Windows', () => {
    expect(describeCredentialFailure('status is STATUS_NO_SUCH_USER [0xc0000064]')).toContain('não existe');
    expect(describeCredentialFailure('status is STATUS_ACCOUNT_LOCKED_OUT [0xc0000234]')).toContain('bloqueada');
    expect(describeCredentialFailure('status is STATUS_ACCOUNT_DISABLED [0xc0000072]')).toContain('desabilitada');
    expect(describeCredentialFailure('status is STATUS_PASSWORD_EXPIRED [0xc0000071]')).toContain('expirou');
  });

  it('retorna null para erro que não é de credencial', () => {
    expect(describeCredentialFailure('Connection refused')).toBeNull();
    expect(describeCredentialFailure('')).toBeNull();
  });

  it('isCredentialError cobre os códigos NTSTATUS', () => {
    expect(isCredentialError({ kind: 'General', message: 'STATUS_LOGON_FAILURE' })).toBe(true);
    expect(isCredentialError({ kind: 'General', message: '0xc0000064' })).toBe(true);
  });
});

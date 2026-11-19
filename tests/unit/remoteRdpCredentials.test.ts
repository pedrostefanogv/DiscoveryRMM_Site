import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeIronError, isCredentialError } from '@/modules/remote-rdp/ironRdpClient';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Regressão do defeito "username missing".
 *
 * O IronRDP RECUSA connect() quando o builder não recebeu usuário — e a falha
 * acontece ANTES de abrir o WebSocket. Com username vazio, o operador via um
 * erro terminal sem forma de informar credenciais.
 */
describe('falha de credencial é detectada e vira formulário', () => {
  it('reconhece "username missing" como erro de credencial', () => {
    const info = describeIronError(new Error('username missing'));
    expect(info.needsCredentials).toBe(true);
  });

  it('reconhece WrongPassword/LogonFailure/AccessDenied por kind', () => {
    for (const kind of [1, 2, 3]) {
      const info = describeIronError({ kind: () => kind, message: 'x' });
      expect(info.needsCredentials).toBe(true);
    }
  });

  it('NÃO classifica erro de rede como credencial', () => {
    const info = describeIronError(new Error('Connection refused'));
    expect(info.needsCredentials).toBe(false);
  });

  it('NÃO classifica erro RDCleanPath 103 como credencial', () => {
    const info = describeIronError({
      kind: () => 4,
      rdcleanpathDetails: () => ({ errorCode: 103 }),
    });
    expect(info.needsCredentials).toBe(false);
  });

  it('isCredentialError cobre variações textuais do IronRDP', () => {
    for (const msg of ['password missing', 'credentials required', 'missing username']) {
      expect(isCredentialError({ kind: 'General', message: msg })).toBe(true);
    }
  });
});

describe('RemoteRdp passa credenciais ao IronRDP', () => {
  it('envia username/password/domain (não mais vazio)', () => {
    expect(RDP_SRC).not.toMatch(/username:\s*''/);
    expect(RDP_SRC).toContain('username,');
    expect(RDP_SRC).toContain('password,');
    expect(RDP_SRC).toContain('domain,');
  });

  it('tem formulário de credenciais com campo obrigatório', () => {
    expect(RDP_SRC).toContain('needsCredentials');
    expect(RDP_SRC).toContain('type="password"');
    expect(RDP_SRC).toContain('required');
  });

  it('não persiste credenciais em storage do navegador', () => {
    // Remove comentários antes de checar: o arquivo MENCIONA localStorage num
    // comentário explicando justamente que não o usa. Checar o texto cru daria
    // falso positivo.
    const code = RDP_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('sessionStorage');
    // Garante que o teste não passou por o arquivo estar vazio.
    expect(code).toContain('canvasRef');
  });

  it('limpa a senha ao desmontar o componente', () => {
    expect(RDP_SRC).toContain("setPassword('')");
  });
});

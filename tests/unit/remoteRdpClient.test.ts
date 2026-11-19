import { describe, expect, it } from 'vitest';
import { describeIronError } from '@/modules/remote-rdp/ironRdpClient';
// buildProxyUrl vive em RemoteRdp.tsx (exportado para teste sem montar React).
import { buildProxyUrl as buildProxyUrlFromComponent } from '@/modules/remote-rdp/RemoteRdp';

describe('buildProxyUrl (WebRDP /tunnel/ws)', () => {
  const agentId = '11111111-1111-1111-1111-111111111111';
  const sessionId = '22222222-2222-2222-2222-222222222222';

  it('deriva a base https de uma URL NATS wss', () => {
    const url = buildProxyUrlFromComponent('wss://rmm.exemplo.com/nats', agentId, sessionId);
    expect(url).toBe(
      `https://rmm.exemplo.com/api/v1/remote-sessions/${agentId}/${sessionId}/tunnel/ws`,
    );
  });

  it('deriva a base http de uma URL NATS ws', () => {
    const url = buildProxyUrlFromComponent('ws://127.0.0.1:4222', agentId, sessionId);
    expect(url).toContain('http://127.0.0.1:4222/api/v1/remote-sessions/');
  });

  it('anexa o ticket na query string', () => {
    const url = buildProxyUrlFromComponent('wss://a.com', agentId, sessionId, 'tok-123');
    expect(url).toContain('?ticket=tok-123');
  });

  it('NUNCA usa access_token (o backend recusa em /tunnel/ws)', () => {
    const url = buildProxyUrlFromComponent('wss://a.com', agentId, sessionId, 'tok-123');
    expect(url).not.toContain('access_token');
  });

  it('escapa caracteres perigosos do ticket', () => {
    const url = buildProxyUrlFromComponent('wss://a.com', agentId, sessionId, 'a&b=c d');
    expect(url).toContain('ticket=a%26b%3Dc%20d');
    expect(url).not.toContain('a&b=c d');
  });

  it('funciona sem ticket (URL base)', () => {
    const url = buildProxyUrlFromComponent('wss://a.com', agentId, sessionId);
    expect(url).not.toContain('?ticket=');
  });
});

describe('describeIronError (mapeamento de codigos RDCleanPath)', () => {
  // Espelha os codigos que o agent Go emite (rdcleanpath/pdu.go).
  const withCode = (code: number, httpStatus?: number) => ({
    kind: () => 'RDCleanPath',
    rdcleanpathDetails: () => ({ errorCode: code, httpStatusCode: httpStatus }),
  });

  it('traduz 103 (alvo inalcancavel) com dica acionavel', () => {
    const info = describeIronError(withCode(103));
    expect(info.rdcleanpathCode).toBe(103);
    expect(info.message).toContain('inalcancavel');
    expect(info.message).toContain('127.0.0.1:3389');
  });

  it('traduz 105 (falha TLS)', () => {
    expect(describeIronError(withCode(105)).message).toContain('TLS');
  });

  it('traduz 100 (credencial expirada)', () => {
    expect(describeIronError(withCode(100)).message).toContain('expirada');
  });

  it('inclui o HTTP status quando presente', () => {
    const info = describeIronError(withCode(1, 401));
    expect(info.httpStatusCode).toBe(401);
    expect(info.message).toContain('401');
  });

  it('trata codigo implementation-specific (16384..32767)', () => {
    const info = describeIronError(withCode(20000));
    expect(info.message).toContain('20000');
  });

  it('nao lanca para entrada invalida', () => {
    expect(() => describeIronError(null)).not.toThrow();
    expect(() => describeIronError(undefined)).not.toThrow();
    expect(() => describeIronError('texto')).not.toThrow();
    expect(() => describeIronError(new Error('falha qualquer'))).not.toThrow();
    expect(describeIronError(null).kind).toBe('unknown');
  });

  it('usa a mensagem do erro quando nao ha codigo RDCleanPath', () => {
    const info = describeIronError(new Error('sem rota para o host'));
    expect(info.message).toContain('sem rota para o host');
  });
});

import { describe, expect, it } from 'vitest';
import { describeIronError } from '@/modules/remote-rdp/ironRdpClient';

/**
 * Regressão do defeito "[object Object]": a UI exibia literalmente isso porque
 * String(objeto) era usado como mensagem. Erros do wasm-bindgen são objetos
 * simples (não Error), então a causa real da falha ficava invisível.
 */
describe('describeIronError nunca renderiza [object Object]', () => {
  it('objeto sem message não vira [object Object]', () => {
    const info = describeIronError({ foo: 'bar' });
    expect(info.message).not.toContain('[object Object]');
    expect(info.message).toContain('bar');
  });

  it('objeto vazio produz mensagem explicativa (não [object Object])', () => {
    const info = describeIronError({});
    expect(info.message).not.toContain('[object Object]');
    expect(info.message.length).toBeGreaterThan(10);
  });

  it('erro do wasm-bindgen com kind=ProxyConnect explica o WebSocket', () => {
    const info = describeIronError({ kind: () => 5, message: '' });
    expect(info.kind).toBe('ProxyConnect');
    expect(info.message).toContain('proxy');
    expect(info.message).not.toContain('[object Object]');
  });

  it('converte kind numérico em nome legível', () => {
    expect(describeIronError({ kind: () => 3 }).kind).toBe('AccessDenied');
    expect(describeIronError({ kind: () => 6 }).kind).toBe('NegotiationFailure');
    expect(describeIronError({ kind: () => 4 }).kind).toBe('RDCleanPath');
  });

  it('extrai message de erro nativo', () => {
    const info = describeIronError(new Error('falha concreta'));
    expect(info.message).toBe('falha concreta');
  });

  it('extrai de campos alternativos (reason/error)', () => {
    expect(describeIronError({ reason: 'motivo real' }).message).toBe('motivo real');
    expect(describeIronError({ error: 'erro real' }).message).toBe('erro real');
  });

  it('segue a causa aninhada', () => {
    const info = describeIronError({ cause: { message: 'raiz do problema' } });
    expect(info.message).toBe('raiz do problema');
  });

  it('não quebra com objeto circular', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => describeIronError(circular)).not.toThrow();
    expect(describeIronError(circular).message).not.toContain('[object Object]');
  });

  it('prioriza o código RDCleanPath quando presente', () => {
    const info = describeIronError({
      kind: () => 4,
      rdcleanpathDetails: () => ({ errorCode: 103, httpStatusCode: 502 }),
    });
    expect(info.rdcleanpathCode).toBe(103);
    expect(info.httpStatusCode).toBe(502);
    expect(info.message).toContain('inalcancavel');
  });

  it('expõe wsaErrorCode quando presente', () => {
    const info = describeIronError({
      kind: () => 5,
      rdcleanpathDetails: () => ({ errorCode: 1, wsaErrorCode: 10061 }),
    });
    expect(info.wsaErrorCode).toBe(10061);
  });

  it('nunca lança para entradas hostis', () => {
    for (const bad of [null, undefined, 0, '', [], NaN, Symbol('x'), () => {}]) {
      expect(() => describeIronError(bad)).not.toThrow();
      expect(describeIronError(bad).message).not.toContain('[object Object]');
    }
  });
});

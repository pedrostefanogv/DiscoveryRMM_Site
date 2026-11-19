import { describe, expect, it } from 'vitest';
import { describeIronError } from '@/modules/remote-rdp/ironRdpClient';

/**
 * Regressão do defeito '{"__wbg_ptr":2100144}' na UI.
 *
 * O IronError do wasm-bindgen tem os dados em MÉTODOS de protótipo
 * (kind/rdcleanpathDetails/backtrace) e apenas __wbg_ptr como propriedade
 * própria. Serializar Object.entries vazava o ponteiro da memória linear do
 * WASM — detalhe interno e inútil para o operador.
 */
describe('IronError do wasm-bindgen não vaza __wbg_ptr', () => {
  it('não expõe __wbg_ptr quando é a única propriedade', () => {
    const info = describeIronError({ __wbg_ptr: 2100144 });
    expect(info.message).not.toContain('__wbg_ptr');
    expect(info.message).not.toContain('2100144');
    // Deve cair na explicação por kind (que é acionável).
    expect(info.message.length).toBeGreaterThan(10);
  });

  it('usa backtrace() quando não há mensagem', () => {
    const info = describeIronError({
      __wbg_ptr: 1,
      kind: () => 5,
      backtrace: () => 'RDCleanPath proxy connection refused\n  at ironrdp::...',
    });
    expect(info.message).toContain('connection refused');
    expect(info.message).not.toContain('__wbg_ptr');
  });

  it('aceita backtrace como campo string', () => {
    const info = describeIronError({ __wbg_ptr: 1, backtrace: 'falha na cadeia rust' });
    expect(info.message).toContain('falha na cadeia rust');
  });

  it('prefere o código RDCleanPath ao backtrace', () => {
    const info = describeIronError({
      __wbg_ptr: 9,
      kind: () => 4,
      rdcleanpathDetails: () => ({ errorCode: 103 }),
      backtrace: () => 'detalhe interno irrelevante',
    });
    expect(info.message).toContain('inalcancavel');
    expect(info.message).not.toContain('detalhe interno irrelevante');
  });

  it('ignora __wbg_ptr mas mantém outros campos úteis', () => {
    const info = describeIronError({ __wbg_ptr: 5, status: 502 });
    expect(info.message).toContain('502');
    expect(info.message).not.toContain('__wbg_ptr');
  });

  it('nunca lança com handle wasm puro', () => {
    expect(() => describeIronError({ __wbg_ptr: 0 })).not.toThrow();
    expect(() => describeIronError({ __wbg_ptr: 999999, backtrace: () => { throw new Error('x'); } })).not.toThrow();
  });
});

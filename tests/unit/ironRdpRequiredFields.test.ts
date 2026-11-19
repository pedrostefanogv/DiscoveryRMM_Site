import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);

/**
 * O connect() do IronRDP WASM valida uma LISTA FECHADA de campos e aborta se
 * qualquer um faltar. A lista foi extraída da tabela de strings do binário
 * (rdp_client_bg.wasm):
 *
 *   username missing / destination missing / password missing /
 *   proxy_address missing / auth_token missing / render_canvas missing /
 *   set_cursor_style_callback missing / set_cursor_style_callback_context missing
 *
 * Cada um destes já quebrou a conexão em produção pelo menos uma vez, sempre com
 * a conexão abortando ANTES de abrir o WebSocket (por isso não havia /tunnel/ws
 * no HAR). Este teste trava a regressão de todos de uma vez.
 */
const REQUIRED_BUILDER_CALLS: Array<{ wasm: string; call: string }> = [
  { wasm: 'username missing', call: 'builder.username(' },
  { wasm: 'password missing', call: 'builder.password(' },
  { wasm: 'destination missing', call: 'builder.destination(' },
  { wasm: 'proxy_address missing', call: 'builder.proxyAddress(' },
  { wasm: 'auth_token missing', call: 'builder.authToken(' },
  { wasm: 'render_canvas missing', call: 'builder.renderCanvas(' },
  { wasm: 'set_cursor_style_callback missing', call: 'builder.setCursorStyleCallback(' },
  { wasm: 'set_cursor_style_callback_context missing', call: 'builder.setCursorStyleCallbackContext(' },
];

describe('todos os campos exigidos pelo WASM são definidos', () => {
  for (const { wasm, call } of REQUIRED_BUILDER_CALLS) {
    it(`define o que evita "${wasm}"`, () => {
      expect(CLIENT_SRC).toContain(call);
    });
  }

  it('os dois setters de cursor são um PAR: um sem o outro quebra', () => {
    // Remover só um deles troca um erro pelo outro — foi exatamente o que
    // aconteceu ao remover o callback para "corrigir" o contexto.
    const hasCallback = CLIENT_SRC.includes('builder.setCursorStyleCallback(');
    const hasContext = CLIENT_SRC.includes('builder.setCursorStyleCallbackContext(');
    expect(hasCallback).toBe(hasContext);
  });
});

describe('campos obrigatórios não são condicionais', () => {
  // Se estiverem atrás de um `if`, uma chamada some e o WASM aborta com
  // "X missing". Eles devem ser definidos SEMPRE.
  it('username/password/authToken são incondicionais', () => {
    expect(CLIENT_SRC).toContain("builder.username(username ?? '')");
    expect(CLIENT_SRC).toContain("builder.password(password ?? '')");
    expect(CLIENT_SRC).toContain("builder.authToken(authToken ?? '')");
  });

  it('não usa guarda condicional nesses três', () => {
    expect(CLIENT_SRC).not.toMatch(/if \(username\)\s*builder\.username/);
    expect(CLIENT_SRC).not.toMatch(/if \(password\)\s*builder\.password/);
    expect(CLIENT_SRC).not.toMatch(/if \(authToken\)\s*builder\.authToken/);
  });
});

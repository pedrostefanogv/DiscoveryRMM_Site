import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Testes de regressão dos bugs encontrados na revisão das correções.
 *
 * Estes casos são de INTEGRAÇÃO (ordem de chamadas e ciclo de vida), que é
 * justamente o tipo de defeito que testes de unidade de função pura não pegam —
 * os três bugs abaixo passaram por 1883 testes verdes do site.
 */

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);
const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);

describe('ticket do /tunnel/ws é pedido APÓS o preload do WASM', () => {
  it('preloadIronRdp aparece antes de issueTunnelTicket', () => {
    const preloadIdx = RDP_SRC.indexOf('await preloadIronRdp()');
    const ticketIdx = RDP_SRC.indexOf('issueTunnelTicket(');
    expect(preloadIdx).toBeGreaterThan(-1);
    expect(ticketIdx).toBeGreaterThan(-1);
    // O ticket tem TTL de 60s e o WASM ~4,89 MB: pedir antes arriscava expirar
    // o ticket durante o download e tomar 401 no upgrade do WebSocket.
    expect(preloadIdx).toBeLessThan(ticketIdx);
  });

  it('preloadIronRdp é exportado pelo cliente', () => {
    expect(CLIENT_SRC).toContain('export async function preloadIronRdp');
  });

  it('o módulo WASM é memoizado (init uma vez por página)', () => {
    expect(CLIENT_SRC).toContain('ironRdpModulePromise');
    // Falha no init não pode envenenar o cache permanentemente.
    expect(CLIENT_SRC).toContain('ironRdpModulePromise = null');
  });
});

describe('canvas é relido após os awaits (não usar nó destacado)', () => {
  it('usa liveCanvas obtido depois do preload', () => {
    expect(RDP_SRC).toContain('const liveCanvas = canvasRef.current');
    expect(RDP_SRC).toContain('canvas: liveCanvas');
    // Referências ao nó capturado antes dos awaits seriam obsoletas.
    expect(RDP_SRC).not.toMatch(/width:s*canvas.width/);
    expect(RDP_SRC).not.toMatch(/height:s*canvas.height/);
  });
});

describe('authToken é enviado (proxy_auth não pode ir vazio)', () => {
  it('passa o ticket como authToken', () => {
    expect(RDP_SRC).toContain('authToken: ticket.ticket');
  });

  it('o cliente repassa authToken ao builder do WASM', () => {
    expect(CLIENT_SRC).toContain('builder.authToken(authToken)');
  });
});

describe('setCursorStyleCallback não é registrado sem contexto', () => {
  it('não chama setCursorStyleCallback (WASM aborta sem o context)', () => {
    // O IronRDP exige setCursorStyleCallbackContext() ANTES de
    // setCursorStyleCallback(). Registrar só o callback fazia o WASM abortar a
    // conexão com "set_cursor_style_callback_context missing" — o erro que o
    // operador via sem nenhum RDP ser tentado.
    const calls = CLIENT_SRC.match(/builder\.setCursorStyleCallback\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it('documenta o requisito na interface do builder', () => {
    expect(CLIENT_SRC).toContain('setCursorStyleCallbackContext');
    expect(CLIENT_SRC).toContain('set_cursor_style_callback_context missing');
  });
});

describe('chips de estado são legíveis nos dois temas', () => {
  it('usa fundo sólido em vez de bg-*/20 com texto escuro', () => {
    // bg-success/20 + text-success lava no tema claro (texto #15803d sobre fundo
    // quase branco). O padrão correto é fundo sólido com texto branco.
    expect(RDP_SRC).toContain('bg-success text-white');
    expect(RDP_SRC).toContain('bg-danger text-white');
    expect(RDP_SRC).not.toMatch(/bg-success\/20 text-success/);
  });
});

describe('erros nunca renderizam [object Object]', () => {
  it('não usa String(err) como fallback de mensagem', () => {
    expect(CLIENT_SRC).not.toContain('message: String(err)');
  });

  it('ctrl.error é normalizado antes de ir para o estado', () => {
    // O agent envia JSON; um erro objeto iria cru para o JSX.
    expect(RDP_SRC).toContain("typeof ctrl.error === 'string'");
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);
const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Regressão: o desktop remoto aparecia mas NÃO aceitava entrada.
 *
 * renderCanvas() apenas DESENHA a tela remota — não captura mouse nem teclado.
 * Sem handlers próprios, o clique/tecla vai para a PÁGINA: o sintoma mais
 * visível era o clique direito abrindo o menu do NAVEGADOR em vez de ir para o
 * Windows remoto.
 *
 * O input precisa virar DeviceEvent + InputTransaction e ser entregue via
 * session.applyInputs().
 */
describe('captura de entrada do WebRDP', () => {
  it('bloqueia o menu de contexto do navegador no canvas', () => {
    // ESTE é o handler que resolve o sintoma relatado do clique direito.
    expect(CLIENT_SRC).toContain("addEventListener('contextmenu'");
    expect(CLIENT_SRC).toContain("onContextMenu = (e: Event) => e.preventDefault()");
  });

  it('captura mouse, teclado e roda', () => {
    for (const ev of ['mousemove', 'mousedown', 'mouseup', 'keydown', 'keyup', 'wheel']) {
      expect(CLIENT_SRC).toContain("addEventListener('" + ev + "'");
    }
  });

  it('envia os eventos via applyInputs (não só registra listeners)', () => {
    expect(CLIENT_SRC).toContain('session.applyInputs(tx)');
    expect(CLIENT_SRC).toContain('DeviceEvent.keyPressed(');
    expect(CLIENT_SRC).toContain('DeviceEvent.keyReleased(');
    expect(CLIENT_SRC).toContain('DeviceEvent.mouseMove(');
    expect(CLIENT_SRC).toContain('DeviceEvent.mouseButtonPressed(');
    expect(CLIENT_SRC).toContain('DeviceEvent.mouseButtonReleased(');
    expect(CLIENT_SRC).toContain('DeviceEvent.wheelRotations(');
  });

  it('escala as coordenadas do mouse para a resolução do canvas', () => {
    // A tela remota tem resolução própria; sem escalar, o cursor fica deslocado.
    expect(CLIENT_SRC).toContain('canvas.width / rect.width');
    expect(CLIENT_SRC).toContain('canvas.height / rect.height');
  });

  it('remove os listeners no dispose (sem vazamento)', () => {
    expect(CLIENT_SRC).toContain('input.detach()');
    expect(CLIENT_SRC).toContain('removeEventListener(');
  });

  it('o mapa de scancodes cobre teclas essenciais', () => {
    // Scancode errado faz a tecla sair trocada no destino.
    expect(CLIENT_SRC).toContain('Escape: 0x01');
    expect(CLIENT_SRC).toContain('Enter: 0x1c');
    expect(CLIENT_SRC).toContain('Space: 0x39');
    expect(CLIENT_SRC).toContain('KeyA: 0x1e');
    // Teclas estendidas levam prefixo 0xE0.
    expect(CLIENT_SRC).toContain('ArrowUp: 0xe048');
    expect(CLIENT_SRC).toContain('ControlRight: 0xe01d');
  });

  it('o canvas é focável para capturar teclado', () => {
    expect(RDP_SRC).toContain('tabIndex={0}');
  });
});

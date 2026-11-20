import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);
const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);

/**
 * Ajustes de UI/UX pedidos após o WebRDP entrar em produção:
 *  1. remover a linha redundante "Sessão RDP ativa" abaixo dos badges;
 *  2. remover o botão "Baixar arquivo .rdp" (não faz sentido com o WebRDP
 *     funcionando — o .rdp apontava para uma porta local que exigia o
 *     forwarder rodando na máquina do operador);
 *  3. adicionar rodapé com teclas especiais (Ctrl+Alt+Del etc.), que o teclado
 *     físico não consegue enviar porque o SO do operador as intercepta.
 */
describe('ajustes de UI do WebRDP', () => {
  it('não tem mais o botão de baixar .rdp', () => {
    expect(RDP_SRC).not.toContain('Baixar arquivo .rdp');
    expect(RDP_SRC).not.toContain('handleDownloadRdp');
    // Nem o código que ele usava.
    expect(RDP_SRC).not.toContain('rdp-file?localPort');
    expect(RDP_SRC).not.toContain('rdpLocalPort');
  });

  it('não tem mais a caixa redundante de detalhe', () => {
    // "Sessão RDP ativa" era um box extra abaixo dos badges.
    expect(RDP_SRC).not.toContain('ironDetail');
  });

  it('mantém os badges de estado (que são a informação útil)', () => {
    expect(RDP_SRC).toContain('STATUS_LABEL[status]');
    expect(RDP_SRC).toContain('IRON_LABEL[ironStatus]');
  });

  it('tem o rodapé de teclas especiais', () => {
    expect(RDP_SRC).toContain('SPECIAL_KEYS');
    expect(RDP_SRC).toContain('Teclas especiais');
    expect(RDP_SRC).toContain('sendSpecialKeys');
  });

  it('oferece Ctrl+Alt+Del e as combinações essenciais', () => {
    for (const label of ['Ctrl+Alt+Del', 'Ctrl+Shift+Esc', 'Alt+Tab', 'Alt+F4']) {
      expect(RDP_SRC).toContain(label);
    }
  });

  it('as teclas ficam desabilitadas enquanto não há sessão', () => {
    expect(RDP_SRC).toContain("disabled={ironStatus !== 'connected'}");
  });
});

describe('sequências de teclas especiais', () => {
  it('define scancodes para cada combinação', () => {
    expect(CLIENT_SRC).toContain('SPECIAL_KEY_SEQUENCES');
    // Ctrl+Alt+Del: Ctrl(1D) + Alt(38) + Del(extendido E053).
    expect(CLIENT_SRC).toContain("'ctrl-alt-del': [0x1d, 0x38, 0xe053]");
    expect(CLIENT_SRC).toContain("'alt-tab': [0x38, 0x0f]");
    expect(CLIENT_SRC).toContain("'ctrl-shift-esc': [0x1d, 0x2a, 0x01]");
  });

  it('solta as teclas na ordem inversa', () => {
    // Soltar o modificador antes da tecla deixaria a tecla "presa" no destino.
    expect(CLIENT_SRC).toContain('[...seq].reverse()');
  });

  it('envia via applyInputs', () => {
    expect(CLIENT_SRC).toContain('session.applyInputs(tx)');
    expect(CLIENT_SRC).toContain('DeviceEvent.keyPressed(sc)');
    expect(CLIENT_SRC).toContain('DeviceEvent.keyReleased(sc)');
  });
});

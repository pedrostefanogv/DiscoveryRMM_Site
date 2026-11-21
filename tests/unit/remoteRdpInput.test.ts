import { describe, expect, it } from 'vitest';
import { mapPointerToRemote } from '@/modules/remote-rdp/ironRdpClient';
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
/**
 * Mapeamento do ponteiro com `object-fit: contain`.
 *
 * O canvas ocupa toda a área útil e a imagem é escalada mantendo a proporção,
 * criando faixas (letterbox). Usar só `larguraRemota / larguraExibida` — erro
 * comum — desloca o clique exatamente nas faixas.
 */
describe('mapPointerToRemote', () => {
  it('1:1 quando a proporção da janela bate com a resolução remota', () => {
    // 1280x800 exibido em 1280x800: sem escala nem faixa.
    expect(mapPointerToRemote(100, 50, 1280, 800, 1280, 800)).toEqual({ x: 100, y: 50 });
    // Aumentando janela e resolução na mesma proporção: continua 1:1.
    expect(mapPointerToRemote(200, 100, 2560, 1600, 2560, 1600)).toEqual({ x: 200, y: 100 });
  });

  it('escala para baixo mantendo a proporção', () => {
    // 1920x1080 remoto exibido em 960x540: metade, sem faixas.
    expect(mapPointerToRemote(480, 270, 960, 540, 1920, 1080)).toEqual({ x: 960, y: 540 });
  });

  it('desconta a FAIXA HORIZONTAL (janela mais larga que a imagem)', () => {
    // Remoto 1000x1000 (1:1) numa janela 1200x1000: escala 1, faixa de 100px
    // em cada lado. O ponto (600,500) é o CENTRO da janela -> centro da imagem.
    expect(mapPointerToRemote(600, 500, 1200, 1000, 1000, 1000)).toEqual({ x: 500, y: 500 });
    // O primeiro pixel da imagem começa após a faixa de 100px.
    expect(mapPointerToRemote(100, 0, 1200, 1000, 1000, 1000)).toEqual({ x: 0, y: 0 });
  });

  it('desconta a FAIXA VERTICAL (janela mais alta que a imagem)', () => {
    // Remoto 1000x1000 numa janela 1000x1400: faixa de 200px em cima e embaixo.
    expect(mapPointerToRemote(500, 700, 1000, 1400, 1000, 1000)).toEqual({ x: 500, y: 500 });
    expect(mapPointerToRemote(0, 200, 1000, 1400, 1000, 1000)).toEqual({ x: 0, y: 0 });
  });

  it('devolve null nas faixas preta (nada a enviar ao Windows)', () => {
    // Janela 1200x1000 com imagem 1000x1000 escalada: faixas de 100px nos lados.
    expect(mapPointerToRemote(50, 500, 1200, 1000, 1000, 1000)).toBeNull();
    expect(mapPointerToRemote(1150, 500, 1200, 1000, 1000, 1000)).toBeNull();
    // Faixa vertical.
    expect(mapPointerToRemote(500, 50, 1000, 1400, 1000, 1000)).toBeNull();
    expect(mapPointerToRemote(500, 1350, 1000, 1400, 1000, 1000)).toBeNull();
  });

  it('mapeia o canto inferior direito da imagem', () => {
    // Sem faixas: o último pixel válido é (largura-1, altura-1).
    expect(mapPointerToRemote(1279, 799, 1280, 800, 1280, 800)).toEqual({ x: 1279, y: 799 });
    // Um pixel além já é fora.
    expect(mapPointerToRemote(1280, 799, 1280, 800, 1280, 800)).toBeNull();
  });

  it('lida com medidas degeneradas sem gerar NaN', () => {
    for (const args of [
      [0, 0, 0, 0, 1280, 800],
      [10, 10, 100, 100, 0, 0],
      [-5, -5, 100, 100, 1280, 800],
    ] as const) {
      const r = mapPointerToRemote(args[0], args[1], args[2], args[3], args[4], args[5]);
      if (r) {
        expect(Number.isFinite(r.x)).toBe(true);
        expect(Number.isFinite(r.y)).toBe(true);
      }
    }
  });
});

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

  it('mapeia o ponteiro descontando escala E letterbox', () => {
    // Ver a matemática em mapPointerToRemote (testada abaixo). Aqui garantimos
    // que o handler USA esse mapeamento, e não a razão simples largura/largura.
    expect(CLIENT_SRC).toContain('mapPointerToRemote(');
    expect(CLIENT_SRC).not.toContain('canvas.width / rect.width');
  });

  it('move o ponteiro ANTES de pressionar o botão', () => {
    // Se o mousemove anterior caiu na faixa preta (descartado), o clique
    // aconteceria na posição antiga do cursor no Windows.
    const down = CLIENT_SRC.slice(
      CLIENT_SRC.indexOf('const onMouseDown'),
      CLIENT_SRC.indexOf('const onMouseUp'),
    );
    expect(down.indexOf('mouseMove')).toBeGreaterThan(-1);
    expect(down.indexOf('mouseMove')).toBeLessThan(down.indexOf('mouseButtonPressed'));
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

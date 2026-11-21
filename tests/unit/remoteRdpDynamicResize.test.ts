import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeDesktopSize, MIN_DESKTOP_FHD, MIN_DESKTOP_HD } from '@/modules/remote-rdp/ironRdpClient';

const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);
const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);
const SESSION_SRC = readFileSync(
  resolve(__dirname, '../../src/pages/agents/RemoteSession.tsx'),
  'utf8',
);

const HD = MIN_DESKTOP_HD;

/**
 * A resolução do Windows remoto acompanha a janela do navegador (via Display
 * Control do RDP), mas nunca fica abaixo de um mínimo.
 *
 * Ponto crítico: quando a janela é menor que o mínimo, a escala precisa ser
 * UNIFORME. Se cada eixo fosse forçado independentemente, a proporção do
 * desktop remoto ficaria diferente da janela e o navegador ESTICARIA a imagem,
 * distorcendo texto e janelas do Windows.
 */
describe('computeDesktopSize', () => {
  it('usa 1:1 quando a janela já é maior que o mínimo', () => {
    const r = computeDesktopSize(1920, 1080, HD.width, HD.height);
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('nunca desce abaixo do mínimo', () => {
    const r = computeDesktopSize(800, 600, HD.width, HD.height);
    expect(r.width).toBeGreaterThanOrEqual(HD.width);
    expect(r.height).toBeGreaterThanOrEqual(HD.height);
  });

  it('mantém a proporção da janela ao escalar (sem distorção)', () => {
    const cssW = 800;
    const cssH = 600;
    const r = computeDesktopSize(cssW, cssH, HD.width, HD.height);
    // A razão tem de ser preservada (tolerância de 1px por arredondamento).
    expect(Math.abs(r.width / r.height - cssW / cssH)).toBeLessThan(0.01);
  });

  it('respeita o mínimo em FHD quando configurado', () => {
    const r = computeDesktopSize(1024, 768, MIN_DESKTOP_FHD.width, MIN_DESKTOP_FHD.height);
    expect(r.width).toBeGreaterThanOrEqual(MIN_DESKTOP_FHD.width);
    expect(r.height).toBeGreaterThanOrEqual(MIN_DESKTOP_FHD.height);
  });

  it('janela larga e baixa ainda respeita a altura mínima', () => {
    // Caso comum: janela muito larga e de pouca altura (barra de tarefas etc.).
    const r = computeDesktopSize(2400, 400, HD.width, HD.height);
    expect(r.height).toBeGreaterThanOrEqual(HD.height);
    expect(r.width).toBeGreaterThan(2400);
  });

  it('lida com medidas degeneradas sem gerar NaN/zero', () => {
    for (const [w, h] of [[0, 0], [-10, 50], [0.4, 0.4]]) {
      const r = computeDesktopSize(w, h, HD.width, HD.height);
      expect(Number.isFinite(r.width)).toBe(true);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });
});

describe('redimensionamento dinâmico ligado ao canvas', () => {
  it('observa o tamanho do canvas', () => {
    expect(CLIENT_SRC).toContain('new ResizeObserver(');
    expect(CLIENT_SRC).toContain('observer.observe(canvas)');
  });

  it('usa o canal oficial de Display Control do RDP', () => {
    // Não é só esticar a imagem: o Windows remapeia a área de trabalho.
    expect(CLIENT_SRC).toContain('session.resize(target.width, target.height)');
  });

  it('CONFIRMA o resize pelo desktopSize() em vez de assumir que aplicou', () => {
    // O Display Control só fica pronto DEPOIS da conexão: pedir cedo demais é
    // descartado em silêncio ("capabilities have not been received"). Sem
    // confirmar/retentar, a resolução ficava na antiga.
    expect(CLIENT_SRC).toContain('session.desktopSize()');
    expect(CLIENT_SRC).toContain('attemptResize');
    expect(CLIENT_SRC).toContain('RESIZE_MAX_ATTEMPTS');
  });

  it('agrupa eventos para não spammar PDUs de resize', () => {
    expect(CLIENT_SRC).toContain('clearTimeout(timer)');
    expect(CLIENT_SRC).toContain('setTimeout(apply, 150)');
  });

  it('a resolução inicial vem do tamanho real do canvas', () => {
    expect(CLIENT_SRC).toContain('canvas.getBoundingClientRect()');
    expect(CLIENT_SRC).toContain('computeDesktopSize(rect.width, rect.height');
  });

  it('remove o observer no dispose (sem vazamento)', () => {
    expect(CLIENT_SRC).toContain('resize.detach()');
    expect(CLIENT_SRC).toContain('observer?.disconnect()');
  });

  it('a resolução aparece no rodapé unificado do PAI', () => {
    // Foi para o rodapé compartilhado, junto dos controles — sem rodapé próprio
    // no viewer (dois rodapés empilhados).
    expect(RDP_SRC).toContain('onDesktopResize');
    expect(SESSION_SRC).toContain('rdpDesktopRes');
    expect(SESSION_SRC).toMatch(/\{rdpDesktopRes\.width\}×\{rdpDesktopRes\.height\}/);
  });

  /**
   * Achados da revisão de bugs.
   */
  it('não desiste do resize em DEFINITIVO após esgotar as tentativas', () => {
    // Antes o alvo ficava preso: o apply() retornava cedo (mesmo tamanho) e um
    // resize posterior nunca era tentado.
    const body = CLIENT_SRC.slice(
      CLIENT_SRC.indexOf('const attemptResize'),
      CLIENT_SRC.indexOf('const scheduleResize'),
    );
    const esgotou = body.slice(body.indexOf('attempt <= RESIZE_MAX_ATTEMPTS'));
    expect(esgotou).toContain('pending = null');
  });

  it('só confia no desktopSize() DEPOIS de enviar um resize', () => {
    // Se o IronRDP reportasse o valor PEDIDO e não o aplicado, confiar na
    // primeira checagem faria desistir sem nunca ter pedido nada.
    expect(CLIENT_SRC).toContain('if (attempt > 0 && cur && cur.width === target.width');
  });

  it('zera o timer de retry ao disparar (sem timer órfão)', () => {
    expect(CLIENT_SRC).toContain('retryTimer = null;');
  });

  it('libera objetos wasm-bindgen (memória vive no heap do WASM)', () => {
    // FinalizationRegistry cobre, mas depender do GC acumulava memória: a
    // transação é criada a CADA evento de mouse.
    expect(CLIENT_SRC).toContain('function freeWasm(');
    expect(CLIENT_SRC).toContain('freeWasm(tx)');
    expect(CLIENT_SRC).toContain('freeWasm(data)');
  });

  it('não tem código morto de resize (reapply removido)', () => {
    expect(CLIENT_SRC).not.toContain('reapply');
  });

  it('o mínimo é configurável (HD por padrão, FHD disponível)', () => {
    expect(CLIENT_SRC).toContain('MIN_DESKTOP_HD');
    expect(CLIENT_SRC).toContain('MIN_DESKTOP_FHD');
    expect(RDP_SRC).toContain('minDesktopWidth');
  });
});

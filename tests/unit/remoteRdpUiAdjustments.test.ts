import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RDP_SPECIAL_KEY_SEQUENCES } from '@/modules/remote-rdp/ironRdpClient';
import { SPECIAL_KEY_IDS } from '@/modules/remote-screen/specialKeys';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);
const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);
const MENU_SRC = readFileSync(
  resolve(__dirname, '../../src/components/SpecialKeysMenu.tsx'),
  'utf8',
);
const SESSION_SRC = readFileSync(
  resolve(__dirname, '../../src/pages/agents/RemoteSession.tsx'),
  'utf8',
);

describe('ajustes de UI do WebRDP', () => {
  it('não tem mais o botão de baixar .rdp', () => {
    expect(RDP_SRC).not.toContain('Baixar arquivo .rdp');
    expect(RDP_SRC).not.toContain('handleDownloadRdp');
    expect(RDP_SRC).not.toContain('rdp-file?localPort');
    expect(RDP_SRC).not.toContain('rdpLocalPort');
  });

  it('não tem mais a caixa redundante de detalhe', () => {
    expect(RDP_SRC).not.toContain('ironDetail');
  });

  it('mantém os badges de estado (que são a informação útil)', () => {
    expect(RDP_SRC).toContain('STATUS_LABEL[status]');
    expect(RDP_SRC).toContain('IRON_LABEL[ironStatus]');
  });

  it('o rodapé ficou só informativo (sem botões de tecla)', () => {
    // Checa o BLOCO do rodapé, não o arquivo inteiro: um comentário explicativo
    // no topo menciona "Teclas especiais:" e daria falso positivo (mesma
    // armadilha do teste de localStorage, que casava o próprio comentário).
    const footer = RDP_SRC.slice(RDP_SRC.indexOf('{/* Rodapé: apenas INFORMAÇÃO'));
    expect(footer.length).toBeGreaterThan(0);
    // Sem botões e sem a lista de teclas nesse bloco.
    expect(footer).not.toContain('<button');
    expect(footer).not.toContain('SPECIAL_KEY_GROUPS');
    // Mas continua mostrando resolução e área de transferência.
    expect(footer).toContain('desktopRes');
    expect(footer).toContain('clipboardNote');
  });
});

/**
 * Teclas especiais viraram um MENU sob um ícone de teclado, como a barra de
 * conexão do mstsc — antes eram 7 botões soltos ocupando a largura toda.
 *
 * O menu REAPROVEITA SPECIAL_KEY_GROUPS do acesso remoto de tela (mesmos IDs,
 * rótulos, agrupamento e hints do agent); o mapeamento para scancodes do RDP
 * fica em RDP_SPECIAL_KEY_SEQUENCES.
 */
describe('menu de teclas especiais (componente COMPARTILHADO)', () => {
  it('o RDP usa o mesmo componente do acesso remoto de tela', () => {
    // Este é o ponto do reaproveitamento: um único menu para os dois viewers.
    expect(RDP_SRC).toContain('SpecialKeysMenu');
    expect(RDP_SRC).toContain("from '@/components/SpecialKeysMenu'");
    expect(SESSION_SRC).toContain('SpecialKeysMenu');
    expect(SESSION_SRC).toContain("from '@/components/SpecialKeysMenu'");
  });

  it('nenhum dos dois mantém menu próprio duplicado', () => {
    // Se voltar a duplicar, os rótulos divergem com o tempo.
    expect(RDP_SRC).not.toContain('SPECIAL_KEY_GROUPS.map');
    expect(SESSION_SRC).not.toContain('SPECIAL_KEY_GROUPS.map');
  });

  it('usa um ícone de teclado com menu (mesmo ícone do acesso remoto)', () => {
    expect(MENU_SRC).toContain('⌨');
    expect(MENU_SRC).toContain('aria-haspopup="menu"');
    expect(MENU_SRC).toContain('role="menu"');
  });

  it('reaproveita os grupos canônicos (mesma allow-list do agent)', () => {
    expect(MENU_SRC).toContain('SPECIAL_KEY_GROUPS');
    expect(MENU_SRC).toContain("from '@/modules/remote-screen/specialKeys'");
  });

  it('marca as teclas que exigem API dedicada no agent', () => {
    expect(MENU_SRC).toContain('item.dedicated');
  });

  it('fecha ao clicar fora e com Esc', () => {
    expect(MENU_SRC).toContain('rootRef');
    expect(MENU_SRC).toContain("e.key === 'Escape'");
    expect(MENU_SRC).toContain("addEventListener('pointerdown'");
  });

  it('permite abrir para cima (rodapé) ou para baixo (barra superior)', () => {
    // O viewer de tela tem o botão no rodapé; sem 'up' o menu sairia da tela.
    expect(MENU_SRC).toContain("direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'");
    expect(RDP_SRC).toContain('direction="down"');
    expect(SESSION_SRC).toContain('direction="up"');
  });

  it('devolve o foco ao canvas após enviar (teclado segue indo para o RDP)', () => {
    expect(RDP_SRC).toContain('canvasRef.current?.focus()');
  });
});

describe('mapeamento de scancodes do RDP', () => {
  it('cobre TODOS os IDs da allow-list canônica', () => {
    // Se um ID novo entrar no specialKeys e não for mapeado aqui, o item
    // apareceria no menu sem efeito ao clicar.
    const missing = SPECIAL_KEY_IDS.filter((id) => !(id in RDP_SPECIAL_KEY_SEQUENCES));
    expect(missing).toEqual([]);
  });

  it('não mapeia IDs que não existem na allow-list', () => {
    const extra = Object.keys(RDP_SPECIAL_KEY_SEQUENCES).filter(
      (id) => !SPECIAL_KEY_IDS.includes(id),
    );
    expect(extra).toEqual([]);
  });

  it('usa os scancodes corretos das combinações críticas', () => {
    // Ctrl(1D) + Alt(38) + Del(estendido E053).
    expect(RDP_SPECIAL_KEY_SEQUENCES['ctrl+alt+del']).toEqual([0x1d, 0x38, 0xe053]);
    expect(RDP_SPECIAL_KEY_SEQUENCES['alt+tab']).toEqual([0x38, 0x0f]);
    expect(RDP_SPECIAL_KEY_SEQUENCES['ctrl+shift+esc']).toEqual([0x1d, 0x2a, 0x01]);
    // Win (MetaLeft) é tecla estendida.
    expect(RDP_SPECIAL_KEY_SEQUENCES['win']).toEqual([0xe05b]);
  });

  it('solta as teclas na ordem inversa', () => {
    expect(CLIENT_SRC).toContain('[...seq].reverse()');
  });
});

/**
 * Tela cheia: reaproveita fullscreenApi (que já tem fallbacks webkit/ms e o
 * listener de fullscreenchange) em vez de chamar a API do navegador direto.
 */
describe('tela cheia', () => {
  it('reaproveita o utilitário existente de fullscreen', () => {
    expect(RDP_SRC).toContain("from '@/utils/fullscreen'");
    expect(RDP_SRC).toContain('fullscreenApi.toggle(');
  });

  it('sincroniza o estado pelo listener (cobre Esc e o próprio navegador)', () => {
    expect(RDP_SRC).toContain('fullscreenApi.onChange(');
  });

  it('expande o container inteiro, não só o canvas', () => {
    expect(RDP_SRC).toContain('rootRef');
    expect(RDP_SRC).toMatch(/isFullscreen \? 'h-screen w-screen'/);
  });

  it('tem botão com rótulo que muda conforme o estado', () => {
    expect(RDP_SRC).toContain("'Tela cheia'");
    expect(RDP_SRC).toContain("'Sair da tela cheia'");
  });
});

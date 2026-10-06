/**
 * Teclas especiais do acesso remoto (viewer → agent, type `keycombo` no
 * subject `.input`).
 *
 * Por que existe: combinações como Ctrl+Alt+Del, Win+L, Alt+Tab e a própria
 * tecla Win são capturadas pelo SO do OPERADOR antes de chegarem ao navegador.
 * Se o operador tentasse "digitar", a máquina LOCAL bloquearia, trocaria de
 * janela ou abriria o menu Iniciar — a combinação nunca chegaria ao host
 * remoto. Este menu envia um evento único que o agent injeta no Windows do
 * host remoto (SendInput; e SendSAS/LockWorkStation para as que o kernel
 * intercepta).
 *
 * Os ids são a allow-list FECHADA do agent (`input_combo.go`) — não renomeie
 * sem atualizar os dois lados.
 */
export interface SpecialKeyItem {
  /** Id canônico aceito pelo agent. */
  id: string;
  /** Rótulo exibido no menu. */
  label: string;
  /** Texto de ajuda (title). */
  hint?: string;
  /**
   * Requer API dedicada no agent (SendSAS/LockWorkStation): o Windows não
   * deixa injetar a combinação por SendInput.
   */
  dedicated?: boolean;
}

export interface SpecialKeyGroup {
  title: string;
  items: SpecialKeyItem[];
}

export const SPECIAL_KEY_GROUPS: readonly SpecialKeyGroup[] = [
  {
    title: 'Segurança',
    items: [
      {
        id: 'ctrl+alt+del',
        label: 'Ctrl+Alt+Del (SAS)',
        dedicated: true,
        hint: 'Gera a Secure Attention Sequence no host remoto. Pode ser recusada se a política SoftwareSASGeneration estiver desabilitada no Windows remoto.',
      },
      {
        id: 'win+l',
        label: 'Win+L (bloquear estação)',
        dedicated: true,
        hint: 'Bloqueia a estação remota sem bloquear a sua.',
      },
    ],
  },
  {
    title: 'Gerenciamento',
    items: [
      { id: 'ctrl+shift+esc', label: 'Ctrl+Shift+Esc (Gerenciador de Tarefas)' },
      { id: 'ctrl+esc', label: 'Ctrl+Esc (menu Iniciar)' },
      { id: 'alt+tab', label: 'Alt+Tab (alternar janela)' },
      { id: 'alt+shift+tab', label: 'Alt+Shift+Tab (alternar ao contrário)' },
      { id: 'alt+f4', label: 'Alt+F4 (fechar janela)' },
      // ctrl+alt+end NÃO entra: só é SAS dentro de uma sessão RDP e o worker
      // injeta sempre na sessão do console — seria um item sem efeito.
    ],
  },
  {
    title: 'Windows',
    items: [
      { id: 'win', label: 'Win (menu Iniciar)' },
      { id: 'win+d', label: 'Win+D (mostrar área de trabalho)' },
      { id: 'win+e', label: 'Win+E (Explorer)' },
      { id: 'win+r', label: 'Win+R (Executar)' },
      { id: 'win+x', label: 'Win+X (menu rápido)' },
      { id: 'win+tab', label: 'Win+Tab (visão de tarefas)' },
    ],
  },
  {
    title: 'Captura de tela',
    items: [
      { id: 'printscreen', label: 'Print Screen' },
      { id: 'alt+printscreen', label: 'Alt+Print Screen (janela ativa)' },
    ],
  },
];

/** Todos os ids conhecidos, na ordem de exibição. */
export const SPECIAL_KEY_IDS: readonly string[] = SPECIAL_KEY_GROUPS.flatMap((group) =>
  group.items.map((item) => item.id),
);

/** Valida um id contra a lista suportada pelo agent. */
export function isSpecialKeyId(id: string): boolean {
  return SPECIAL_KEY_IDS.includes(id);
}

/** Evento de teclado publicado no `.input` para o agent injetar a combinação. */
export interface SpecialKeyInput {
  type: 'keycombo';
  combo: string;
}

/**
 * Monta o payload do evento `keycombo`. Lança para ids desconhecidos — evita
 * enviar ao agent um valor que ele rejeitaria silenciosamente.
 */
export function buildSpecialKeyInput(id: string): SpecialKeyInput {
  if (!isSpecialKeyId(id)) {
    throw new Error(`Combinação de teclas não suportada: ${id}`);
  }
  return { type: 'keycombo', combo: id };
}

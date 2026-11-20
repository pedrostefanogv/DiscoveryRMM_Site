import { useCallback, useEffect, useRef, useState } from 'react';
import { SPECIAL_KEY_GROUPS } from '@/modules/remote-screen/specialKeys';

/**
 * Menu de teclas especiais (Ctrl+Alt+Del, Win+L, Alt+Tab, tecla Win…).
 *
 * COMPARTILHADO entre o viewer de TELA e o viewer RDP. Os dois precisam das
 * mesmas combinações: o SO do OPERADOR intercepta essas teclas antes de o
 * navegador recebê-las, então elas só chegam ao host remoto por injeção. Manter
 * dois menus separados faria rótulos e agrupamento divergirem com o tempo.
 *
 * A allow-list vem de `remote-screen/specialKeys.ts` — a MESMA que o agent
 * valida. Este componente cuida apenas da apresentação e da interação.
 *
 * O ícone é o mesmo do acesso remoto normal (⌨), por consistência visual entre
 * as duas abas.
 */
export interface SpecialKeysMenuProps {
  /** Recebe o id canônico da combinação escolhida. */
  onSelect: (id: string) => void;
  /** Desabilita o botão (ex.: sessão ainda não conectada). */
  disabled?: boolean;
  /**
   * Direção de abertura: 'down' quando o botão está na barra SUPERIOR;
   * 'up' quando está no rodapé (senão o menu sairia da tela).
   */
  direction?: 'down' | 'up';
  /** Texto de ajuda do botão. */
  title?: string;
  /** Classes extras do botão (para casar com a barra onde ele vive). */
  className?: string;
}

export default function SpecialKeysMenu({
  onSelect,
  disabled = false,
  direction = 'down',
  title = 'Enviar uma combinação de teclas ao host remoto (Ctrl+Alt+Del, Win+L, Alt+Tab…)',
  className = 'px-2 py-1 bg-surface-hover hover:bg-border text-foreground rounded',
}: SpecialKeysMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Fecha ao clicar fora: sem isso o menu fica preso aberto sobre o desktop
  // remoto, atrapalhando a interação com a sessão.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A sessão pode cair com o menu aberto; não faz sentido mantê-lo.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const handleSelect = useCallback((id: string) => {
    setOpen(false);
    onSelect(id);
  }, [onSelect]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${className} disabled:opacity-40 disabled:cursor-not-allowed`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        ⌨ Teclas
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Teclas especiais"
          className={`absolute right-0 z-30 max-h-72 w-64 overflow-auto rounded border border-border bg-surface p-1.5 text-xs shadow-lg ${
            direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {SPECIAL_KEY_GROUPS.map((group) => (
            <div key={group.title} className="mb-1.5 last:mb-0">
              <div className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {group.title}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded px-1.5 py-1 text-left text-foreground hover:bg-surface-hover transition-colors"
                  title={item.hint ?? `Enviar ${item.label} ao host remoto`}
                  onClick={() => handleSelect(item.id)}
                >
                  {item.label}
                  {item.dedicated && (
                    <span
                      className="ml-1 text-[10px] text-warning"
                      title="Enviada por API dedicada no agent (SAS/bloqueio)"
                    >
                      ★
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

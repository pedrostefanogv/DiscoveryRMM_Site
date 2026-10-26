import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Icon } from "@/components/ui";
import { createPortal } from 'react-dom';

// Contador de modais abertos: com modais aninhados (ex.: formulário aberto
// dentro de outro modal), fechar o interno não pode liberar o scroll do body
// enquanto o externo continua aberto.
let openModalCount = 0;

/** Elementos que participam do ciclo de Tab dentro do diálogo. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * O app esconde conteúdo com a classe `hidden` do Tailwind (display:none), com
 * `[hidden]`/`aria-hidden` e com painéis de aba inativos. Um alvo invisível na
 * lista faz o Tab "sumir" (nunca é igual ao último) e o foco vaza para os campos
 * atrás do overlay — exatamente o que o trap deveria impedir.
 */
function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;

  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** Focáveis VISÍVEIS dentro do diálogo, na ordem do DOM. */
function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
    };
  }, [open]);

  // Foco: entra no diálogo ao abrir e volta para o elemento anterior ao fechar.
  // Sem isso, tabular navegava pelos campos do formulário que ficava ATRÁS do
  // overlay (o modal não prende o foco) — clássico "digitei no formulário errado".
  // Não rouba o foco quando ele já está dentro (caso de campo com autoFocus).
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const first = focusableElements(dialog)[0];
      (first ?? dialog).focus();
    }

    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  /** Mantém o Tab circulando dentro do diálogo. */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = focusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  const modalContent = (
    <div
      ref={overlayRef}
      className="animate-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`animate-modal-in flex max-h-[calc(100dvh-2rem)] w-full ${maxWidth} flex-col rounded-xl border border-border bg-surface shadow-2xl outline-none`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-light hover:text-foreground transition-colors"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {/* Body — rola quando o conteúdo excede a viewport (modais longos). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

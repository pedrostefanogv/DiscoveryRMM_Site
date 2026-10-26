import { useEffect, useRef } from 'react';
import { Icon } from "@/components/ui";
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  open: boolean;
  /** URL (blob autenticado) da imagem a ampliar. */
  src?: string | null;
  alt?: string;
  onClose: () => void;
  /**
   * Chamado quando o navegador NÃO consegue renderizar a imagem (arquivo
   * corrompido/renomeado). Sem isso o modal fica em branco — o mesmo sintoma do
   * PDF que ia parar dentro de um `<img>`.
   */
  onError?: () => void;
}

/**
 * Modal de imagem (lightbox) para anexos de conversa: amplia a imagem SEM
 * baixar o arquivo. Fecha com Esc, clique no fundo ou no botão X.
 */
export function ImageLightbox({ open, src, alt, onClose, onError }: ImageLightboxProps) {
  // onClose via ref: o efeito depende só de "open", senão cada re-render do
  // anexo re-registra o listener e alterna o lock de scroll do body.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // A11y: leva o foco para dentro do modal, mantém Tab preso nele (só o
    // botão Fechar é focável) e devolve o foco ao gatilho ao fechar.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open || !src) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Visualizar imagem: ${alt}` : 'Visualizar imagem'}
      className="animate-backdrop-in fixed inset-0 z-[110] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg bg-surface/90 p-2 text-muted-foreground transition-colors hover:bg-surface-light hover:text-foreground"
      >
        <Icon name="close" className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt ?? ''}
        onError={onError}
        className="max-h-[calc(100dvh-4rem)] max-w-[calc(100vw-4rem)] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}

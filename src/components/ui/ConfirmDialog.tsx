import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  isLoading?: boolean;
  /**
   * Quando informado, exige que o usuário digite exatamente este texto
   * (trim + case-insensitive) para habilitar a confirmação. Usado em ações
   * irreversíveis (exclusão definitiva, desinstalação remota).
   */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Diálogo de confirmação padronizado (substitui window.confirm e modais ad-hoc).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  isLoading = false,
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState('');

  // Cada abertura começa com o campo vazio — nunca reaproveita o texto de uma
  // confirmação anterior.
  useEffect(() => {
    if (open) setTypedText('');
  }, [open]);

  const normalizedRequired = (requireText ?? '').trim().toLowerCase();
  const canConfirm =
    normalizedRequired.length === 0 ||
    typedText.trim().toLowerCase() === normalizedRequired;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">{message}</div>
        </div>

        {normalizedRequired.length > 0 && (
          <div className="space-y-2">
            <label htmlFor="confirm-dialog-required-text" className="text-sm font-medium text-foreground">
              Digite <span className="font-semibold text-danger">{requireText?.trim()}</span> para confirmar:
            </label>
            <Input
              id="confirm-dialog-required-text"
              value={typedText}
              autoComplete="off"
              onChange={(event) => setTypedText(event.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            onClick={onConfirm}
            loading={isLoading}
            disabled={isLoading || !canConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

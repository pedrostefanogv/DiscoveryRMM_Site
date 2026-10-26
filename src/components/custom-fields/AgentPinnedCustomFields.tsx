import toast from 'react-hot-toast';
import type { CustomFieldSchemaItem } from '@/api';
import { Icon, Button } from '@/components/ui';
import { isSchemaValueCopyable, schemaValueText } from './customFieldSchemaValue';

interface Props {
  /** Campos visíveis no portal (webRead) — o filtro é do endpoint de schema. */
  items: CustomFieldSchemaItem[];
}

/**
 * Resumo enxuto dos campos customizados DESTACADOS (`isPinned`) dentro do card
 * "Informações" do agente: uma linha por campo no formato "Rótulo: valor", com
 * o botão de copiar quando há valor textual. Campos sem destaque continuam
 * acessíveis (com o detalhe completo) na aba "Extras".
 */
export function AgentPinnedCustomFields({ items }: Props) {
  const pinned = items
    .filter(item => item.isPinned)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  // Sem campo destacado a seção some por inteiro — inclusive o separador — para
  // não deixar um bloco vazio no card.
  if (pinned.length === 0) return null;

  async function handleCopy(item: CustomFieldSchemaItem) {
    const text = schemaValueText(item);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${item.label} copiado.`);
    } catch {
      toast.error('Não foi possível copiar o valor.');
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Extras</dt>
      <dd className="mt-2 space-y-2">
        {pinned.map(item => {
          const text = schemaValueText(item);
          const copyable = isSchemaValueCopyable(item);

          return (
            <div key={item.definitionId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-muted">{item.label}:</span>
              {text ? (
                <span className="break-all font-mono text-foreground">{text}</span>
              ) : (
                <span className="text-muted">Não informado</span>
              )}
              {copyable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Copiar valor de ${item.label}`}
                  title="Copiar valor"
                  onClick={() => void handleCopy(item)}
                >
                  <Icon name="content_copy" className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </dd>
    </div>
  );
}

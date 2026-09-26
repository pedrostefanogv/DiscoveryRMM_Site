import { Modal } from '@/components/ui';
import type { TicketTemplateDto } from '@/api';
import { TemplateDetailsView } from './TemplateDetailsView';

/**
 * Conferência rápida de um template (inclusive excluído) sem sair da
 * listagem. A visualização completa fica em /tickets/templates/:id.
 */
export function TemplateDetailsModal({
  template,
  clientName,
  departmentName,
  onClose,
}: {
  template: TicketTemplateDto | null;
  clientName?: string | null;
  departmentName?: string | null;
  onClose: () => void;
}) {
  if (!template) return null;

  return (
    <Modal open onClose={onClose} title={template.title || template.name} maxWidth="max-w-2xl">
      <TemplateDetailsView template={template} clientName={clientName} departmentName={departmentName} />
    </Modal>
  );
}

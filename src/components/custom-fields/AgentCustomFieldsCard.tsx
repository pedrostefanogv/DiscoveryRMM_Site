import { useAgentCustomFieldSchema, useUpsertAgentCustomFieldValue } from '@/hooks';
import { CustomFieldsCard } from './CustomFieldsCard';

interface Props {
  agentId: string;
  /** false = somente leitura (sem permissão de edição do agente). */
  canEdit: boolean;
}

/** Card "Campos customizados" da aba Info do agente. */
export function AgentCustomFieldsCard({ agentId, canEdit }: Props) {
  const schemaQuery = useAgentCustomFieldSchema(agentId);
  const upsertValue = useUpsertAgentCustomFieldValue(agentId);

  return (
    <CustomFieldsCard
      items={schemaQuery.data ?? []}
      isLoading={schemaQuery.isLoading}
      isError={schemaQuery.isError}
      canEdit={canEdit}
      emptyMessage="Nenhum campo customizado visível para este agente. Os campos são criados em Configurações → Campos customizados."
      onSave={(item, value) =>
        upsertValue.mutateAsync({ definitionId: item.definitionId, value }).then(() => undefined)
      }
    />
  );
}

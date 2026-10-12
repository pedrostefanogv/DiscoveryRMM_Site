import { CustomFieldScopeType } from '@/api';
import { useEntityCustomFieldSchema, useUpsertEntityCustomFieldValue } from '@/hooks';
import { CustomFieldsCard } from './CustomFieldsCard';

interface Props {
  clientId: string;
  canEdit: boolean;
}

/** Card "Campos customizados" do detalhe do cliente. */
export function ClientCustomFieldsCard({ clientId, canEdit }: Props) {
  const target = { entityId: clientId };
  const schemaQuery = useEntityCustomFieldSchema(CustomFieldScopeType.Client, target);
  const upsertValue = useUpsertEntityCustomFieldValue(CustomFieldScopeType.Client, target);

  return (
    <CustomFieldsCard
      items={schemaQuery.data ?? []}
      isLoading={schemaQuery.isLoading}
      isError={schemaQuery.isError}
      canEdit={canEdit}
      emptyMessage="Nenhum campo customizado visível para este cliente."
      onSave={(item, value) =>
        upsertValue.mutateAsync({ definitionId: item.definitionId, value }).then(() => undefined)
      }
    />
  );
}

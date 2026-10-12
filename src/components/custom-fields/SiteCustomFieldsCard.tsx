import { CustomFieldScopeType } from '@/api';
import { useEntityCustomFieldSchema, useUpsertEntityCustomFieldValue } from '@/hooks';
import { CustomFieldsCard } from './CustomFieldsCard';

interface Props {
  clientId: string;
  siteId: string;
  canEdit: boolean;
}

/** Card "Campos customizados" do detalhe do site. */
export function SiteCustomFieldsCard({ clientId, siteId, canEdit }: Props) {
  const target = { entityId: siteId, clientId };
  const schemaQuery = useEntityCustomFieldSchema(CustomFieldScopeType.Site, target);
  const upsertValue = useUpsertEntityCustomFieldValue(CustomFieldScopeType.Site, target);

  return (
    <CustomFieldsCard
      items={schemaQuery.data ?? []}
      isLoading={schemaQuery.isLoading}
      isError={schemaQuery.isError}
      canEdit={canEdit}
      emptyMessage="Nenhum campo customizado visível para este site."
      onSave={(item, value) =>
        upsertValue.mutateAsync({ definitionId: item.definitionId, value }).then(() => undefined)
      }
    />
  );
}

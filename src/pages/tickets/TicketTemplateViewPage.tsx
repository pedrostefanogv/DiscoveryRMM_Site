import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArchiveRestore, Pencil, Power, Trash2 } from 'lucide-react';
import {
  Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Loading, PageHeader,
} from '@/components/ui';
import {
  useDeleteTicketTemplate, usePurgeTicketTemplate, useRestoreTicketTemplate,
  useTicketTemplates, useUpdateTicketTemplate,
} from '@/hooks/useSupportProductivity';
import { useClients } from '@/hooks/useClients';
import { useDepartments } from '@/hooks/useDepartments';
import { ApiError } from '@/api';
import { TemplateDetailsView } from '@/components/tickets/TemplateDetailsView';
import toast from 'react-hot-toast';

/**
 * Visualização de um template de chamado (/tickets/templates/:id): página
 * própria, somente leitura, com as ações (editar, ativar/desativar, lixeira,
 * restaurar). A listagem leva para cá ao clicar no template.
 */
export default function TicketTemplateViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [forcePurge, setForcePurge] = useState(false);

  const templates = useTicketTemplates(
    { includeGlobal: true, includeInactive: true, includeDeleted: true, allClients: true },
    { refetchOnMount: 'always' },
  );
  const update = useUpdateTicketTemplate();
  const remove = useDeleteTicketTemplate();
  const purge = usePurgeTicketTemplate();
  const restore = useRestoreTicketTemplate();
  const clients = useClients();
  const departments = useDepartments();

  const template = useMemo(
    () => (id ? (templates.data ?? []).find((item) => item.id === id) ?? null : null),
    [id, templates.data],
  );

  // Enquanto o refetch de montagem não conclui, a tela não parte de cache.
  const mountedAtRef = useRef(Date.now());
  const awaitingFreshTemplate =
    templates.isFetching && templates.dataUpdatedAt < mountedAtRef.current;

  const clientName = useMemo(
    () => (template?.clientId ? (clients.data ?? []).find((c) => c.id === template.clientId)?.name ?? null : null),
    [clients.data, template?.clientId],
  );
  const departmentName = useMemo(
    () => (template?.departmentId ? (departments.data ?? []).find((d) => d.id === template.departmentId)?.name ?? null : null),
    [departments.data, template?.departmentId],
  );

  const backToList = () => navigate('/tickets/templates');

  if (templates.isError) {
    return <ErrorDisplay onRetry={() => templates.refetch()} />;
  }

  if (templates.isLoading || awaitingFreshTemplate) {
    return <Loading message="Carregando template..." />;
  }

  if (!template) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Template não encontrado"
          description="Ele pode ter sido excluído definitivamente ou estar fora do seu escopo."
          onBack={backToList}
        />
        <Card>
          <p className="text-sm text-muted">
            Não encontramos este template no catálogo.{' '}
            <button
              type="button"
              onClick={backToList}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Voltar para a lista
            </button>
          </p>
        </Card>
      </div>
    );
  }

  const isDeleted = Boolean(template.deletedAt);

  const toggleActive = () => {
    update.mutate(
      {
        id: template.id,
        data: {
          clientId: template.clientId ?? null,
          departmentId: template.departmentId ?? null,
          name: template.name,
          title: template.title,
          description: template.description,
          priority: template.priority,
          category: template.category,
          customFieldDefaultsJson: template.customFieldDefaultsJson,
          questionsJson: template.questionsJson,
          isActive: !template.isActive,
        },
      },
      {
        onSuccess: () => toast.success(template.isActive ? 'Template desativado' : 'Template ativado'),
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao alterar o template'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.title || template.name}
        description={
          isDeleted
            ? 'Template na lixeira — restaure para voltar a usá-lo.'
            : template.isActive
              ? 'Template de chamado'
              : 'Template INATIVO — não aparece na abertura de chamados. Ative para usá-lo.'
        }
        onBack={backToList}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!isDeleted && (
            <>
              <Button size="sm" onClick={() => navigate(`/tickets/templates/${template.id}/edit`)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="secondary" onClick={toggleActive} loading={update.isPending}>
                <Power className="h-4 w-4" /> {template.isActive ? 'Desativar' : 'Ativar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Mover para a lixeira
              </Button>
            </>
          )}
          {isDeleted && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={restore.isPending}
                onClick={() =>
                  restore.mutate(
                    { id: template.id },
                    {
                      onSuccess: () => {
                        toast.success('Template restaurado');
                        void templates.refetch();
                      },
                      onError: (error: unknown) =>
                        toast.error(error instanceof Error ? error.message : 'Erro ao restaurar template'),
                    },
                  )
                }
              >
                <ArchiveRestore className="h-4 w-4" /> Restaurar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmPurge(true)}>
                <Trash2 className="h-4 w-4" /> Excluir definitivamente
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      <Card>
        <CardHeader title="Dados do template" subtitle="Somente leitura — use Editar para alterar." />
        <TemplateDetailsView
          template={template}
          clientName={clientName}
          departmentName={departmentName}
        />
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Mover template para a lixeira"
        message={`O template "${template.title || template.name}" será movido para a lixeira e poderá ser restaurado depois. Os chamados já abertos não são afetados.`}
        confirmLabel="Mover para a lixeira"
        isLoading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(
            { id: template.id },
            {
              onSuccess: () => {
                toast.success('Template movido para a lixeira');
                setConfirmDelete(false);
              },
              onError: (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Erro ao excluir template'),
            },
          )
        }
      />

      <ConfirmDialog
        open={confirmPurge}
        title="Excluir definitivamente"
        message={`O template "${template.title || template.name}" será removido do banco, sem possibilidade de restauração.`}
        confirmLabel="Excluir definitivamente"
        isLoading={purge.isPending}
        onClose={() => setConfirmPurge(false)}
        onConfirm={() =>
          purge.mutate(
            { id: template.id },
            {
              onSuccess: () => {
                toast.success('Template excluído definitivamente');
                setConfirmPurge(false);
                backToList();
              },
              onError: (error: unknown) => {
                const status = error instanceof ApiError ? error.status : undefined;
                if (status === 409) {
                  setForcePurge(true);
                  setConfirmPurge(false);
                  return;
                }
                toast.error(error instanceof Error ? error.message : 'Erro ao excluir template');
              },
            },
          )
        }
      />

      <ConfirmDialog
        open={forcePurge}
        title="Template usado por chamados"
        message={`O template "${template.title || template.name}" já foi usado para abrir chamados. O nome usado continuará no histórico de cada chamado, mas o template será removido do banco. Excluir definitivamente?`}
        confirmLabel="Excluir definitivamente"
        isLoading={purge.isPending}
        onClose={() => setForcePurge(false)}
        onConfirm={() =>
          purge.mutate(
            { id: template.id, force: true },
            {
              onSuccess: () => {
                toast.success('Template excluído definitivamente');
                setForcePurge(false);
                backToList();
              },
              onError: (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Erro ao excluir template'),
            },
          )
        }
      />
    </div>
  );
}

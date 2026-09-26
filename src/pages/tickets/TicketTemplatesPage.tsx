import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, LayoutTemplate, Globe, Building2, ArchiveRestore, Power, Undo2,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Loading } from '@/components/ui';
import {
  useAdminTicketTemplates, useDeleteTicketTemplate, usePurgeTicketTemplate,
  useRestoreTicketTemplate, useUpdateTicketTemplate,
} from '@/hooks/useSupportProductivity';
import { useClients } from '@/hooks/useClients';
import { ApiError } from '@/api';
import type { TicketTemplateDto } from '@/api';
import { parseTemplateQuestions } from '@/utils/templateQuestions';
import toast from 'react-hot-toast';

/**
 * Listagem de templates de chamado: catálogo (com inativos), lixeira
 * (restaurar/excluir definitivamente) e acesso à página de edição.
 * A listagem administrativa usa allClients para também enxergar templates
 * por cliente (antes ficavam invisíveis).
 */
export default function TicketTemplatesPage() {
  const navigate = useNavigate();
  const [showInactive, setShowInactive] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TicketTemplateDto | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TicketTemplateDto | null>(null);
  const [forcePurgeTarget, setForcePurgeTarget] = useState<TicketTemplateDto | null>(null);

  const templates = useAdminTicketTemplates({
    includeGlobal: true,
    includeInactive: showInactive || showTrash,
    includeDeleted: showTrash,
  });
  const remove = useDeleteTicketTemplate();
  const purge = usePurgeTicketTemplate();
  const restore = useRestoreTicketTemplate();
  const update = useUpdateTicketTemplate();
  const clients = useClients();

  const clientMap = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );

  // A API devolve "tudo" quando includeDeleted=true (o form precisa localizar
  // também templates excluídos); a lixeira mostra apenas os excluídos.
  const visibleTemplates = useMemo(() => {
    const data = templates.data ?? [];
    return showTrash ? data.filter((t) => t.deletedAt !== null) : data;
  }, [templates.data, showTrash]);

  const openCreate = () => navigate('/tickets/templates/new');
  const openEdit = (t: TicketTemplateDto) => navigate(`/tickets/templates/${t.id}/edit`);

  const toggleActive = (t: TicketTemplateDto) => {
    update.mutate(
      {
        id: t.id,
        data: {
          clientId: t.clientId, departmentId: t.departmentId, name: t.name, title: t.title,
          description: t.description, priority: t.priority, category: t.category,
          customFieldDefaultsJson: t.customFieldDefaultsJson, questionsJson: t.questionsJson,
          isActive: !t.isActive,
        },
      },
      {
        onSuccess: () => toast.success(t.isActive ? 'Template desativado' : 'Template ativado'),
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao alterar o template'),
      },
    );
  };

  const handlePurgeError = (error: unknown, target: TicketTemplateDto) => {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 409) {
      setForcePurgeTarget(target);
      setPurgeTarget(null);
      return;
    }
    toast.error(error instanceof Error ? error.message : 'Erro ao excluir template');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {showTrash ? 'Templates excluídos' : 'Templates de chamado'}
          </h1>
          <p className="text-sm text-muted">
            {showTrash
              ? 'Templates na lixeira. Restaure para voltar ao catálogo ou exclua definitivamente.'
              : 'Pré-preenchem título, descrição, prioridade, categoria e os campos personalizados do departamento na abertura.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!showTrash && (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-border bg-surface-light"
                />
                Mostrar inativos
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setShowTrash(true); setShowInactive(false); }}>
                <Trash2 className="h-4 w-4" /> Lixeira
              </Button>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Novo template</Button>
            </>
          )}
          {showTrash && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowTrash(false)}>
              <Undo2 className="h-4 w-4" /> Voltar ao catálogo
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader
          title={showTrash ? 'Excluídos' : 'Templates'}
          subtitle={`${visibleTemplates.length} template(s)`}
        />
        {templates.isLoading && <Loading />}
        {templates.isError && <ErrorDisplay onRetry={() => templates.refetch()} />}
        <div className="divide-y divide-white/5">
          {visibleTemplates.map((t) => {
            const fieldCount = countDefaultFields(t.customFieldDefaultsJson);
            const questionCount = parseTemplateQuestions(t.questionsJson).length;
            const isDeleted = t.deletedAt !== null;
            return (
              <div key={t.id} className="flex items-start gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                  {isDeleted
                    ? <ArchiveRestore className="h-4 w-4 text-muted" />
                    : <LayoutTemplate className="h-4 w-4 text-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => { if (!isDeleted) openEdit(t); }}
                    disabled={isDeleted}
                    className={`text-left font-medium text-foreground ${isDeleted ? 'cursor-default' : 'hover:text-primary hover:underline'}`}
                  >
                    {t.name}
                  </button>
                  <p className="truncate text-xs text-muted">{t.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.clientId ? (
                      <Badge color="slate">
                        <Building2 className="mr-0.5 inline h-3 w-3" />
                        {clientMap.get(t.clientId) ?? 'Cliente'}
                      </Badge>
                    ) : (
                      <Badge color="slate"><Globe className="mr-0.5 inline h-3 w-3" />Global</Badge>
                    )}
                    {t.departmentId && <Badge color="accent">Departamento</Badge>}
                    {questionCount > 0 && <Badge color="success">{questionCount} pergunta(s)</Badge>}
                    {fieldCount > 0 && <Badge color="slate">{fieldCount} campo(s) padrão</Badge>}
                    {isDeleted && <Badge color="danger">Excluído {formatDeletedAt(t.deletedAt)}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isDeleted && t.priority && <Badge color="accent">{t.priority}</Badge>}
                  {!isDeleted && !t.isActive && <Badge color="warning">Inativo</Badge>}
                  {isDeleted ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={restore.isPending}
                        onClick={() =>
                          restore.mutate(
                            { id: t.id },
                            {
                              onSuccess: () => toast.success('Template restaurado'),
                              onError: (error: unknown) =>
                                toast.error(error instanceof Error ? error.message : 'Erro ao restaurar template'),
                            },
                          )
                        }
                      >
                        <ArchiveRestore className="h-4 w-4" /> Restaurar
                      </Button>
                      <button
                        onClick={() => setPurgeTarget(t)}
                        aria-label="Excluir definitivamente"
                        title="Excluir definitivamente"
                        className="p-1 text-muted hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleActive(t)}
                        aria-label={t.isActive ? 'Desativar template' : 'Ativar template'}
                        title={t.isActive ? 'Desativar (sai da abertura de chamados)' : 'Ativar template'}
                        className={`p-1 ${t.isActive ? 'text-muted hover:text-warning' : 'text-warning hover:text-success'}`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(t)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(t)} aria-label="Excluir" title="Mover para a lixeira" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {visibleTemplates.length === 0 && !templates.isLoading && (
            <p className="py-6 text-center text-sm text-muted">
              {showTrash ? 'A lixeira está vazia.' : 'Nenhum template cadastrado.'}
            </p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Mover template para a lixeira"
        message={`O template "${deleteTarget?.name ?? ''}" será movido para a lixeira e poderá ser restaurado depois. Os chamados já abertos não são afetados. Continuar?`}
        confirmLabel="Mover para a lixeira"
        isLoading={remove.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(
            { id: deleteTarget.id },
            {
              onSuccess: () => { toast.success('Template movido para a lixeira'); setDeleteTarget(null); },
              onError: (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Erro ao excluir template'),
            },
          );
        }}
      />

      <ConfirmDialog
        open={purgeTarget !== null}
        title="Excluir definitivamente"
        message={`O template "${purgeTarget?.name ?? ''}" será removido do banco, sem possibilidade de restauração. Continuar?`}
        confirmLabel="Excluir definitivamente"
        isLoading={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => {
          if (!purgeTarget) return;
          purge.mutate(
            { id: purgeTarget.id },
            {
              onSuccess: () => { toast.success('Template excluído definitivamente'); setPurgeTarget(null); },
              onError: (error: unknown) => handlePurgeError(error, purgeTarget),
            },
          );
        }}
      />

      <ConfirmDialog
        open={forcePurgeTarget !== null}
        title="Template usado por chamados"
        message={`O template "${forcePurgeTarget?.name ?? ''}" já foi usado para abrir chamados. O nome usado continuará registrado no histórico de cada chamado (somente leitura), mas o template será removido do banco. Excluir definitivamente?`}
        confirmLabel="Excluir definitivamente"
        isLoading={purge.isPending}
        onClose={() => setForcePurgeTarget(null)}
        onConfirm={() => {
          if (!forcePurgeTarget) return;
          purge.mutate(
            { id: forcePurgeTarget.id, force: true },
            {
              onSuccess: () => { toast.success('Template excluído definitivamente'); setForcePurgeTarget(null); },
              onError: (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Erro ao excluir template'),
            },
          );
        }}
      />
    </div>
  );
}

/** Data amigável do soft delete; vazio quando o template não está na lixeira. */
function formatDeletedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `em ${date.toLocaleDateString('pt-BR')}`;
}

function countDefaultFields(json: string): number {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    return Object.values(parsed as Record<string, unknown>).filter((v) => v !== null && v !== undefined).length;
  } catch {
    return 0;
  }
}

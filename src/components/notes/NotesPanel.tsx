import { formatDateTime } from '@/utils/format';
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  TextArea,
} from "@/components/ui";
import {
  useClientNotesPage,
  useSiteNotesPage,
  useAgentNotesPage,
  useCreateClientNote,
  useCreateSiteNote,
  useCreateAgentNote,
  useUpdateNote,
  useDeleteNote,
} from "@/hooks/useNotes";
import type { Note } from "@/api";
import toast from "react-hot-toast";

type EntityType = "client" | "site" | "agent";

interface NotesPanelProps {
  entityType: EntityType;
  entityId: string;
  title?: string;
  subtitle?: string;
  /** Permissão de edição/criação/exclusão (default true). */
  canEdit?: boolean;
  /**
   * Substantivo no singular usado em textos/botões (ex.: "nota" ou "anotação").
   * Mantém a terminologia da tela que hospeda o painel.
   */
  singular?: string;
  /** Substantivo no plural correspondente ao singular. */
  plural?: string;
}

function getNoteDate(note: Note): number {
  const value = note.updatedAt || note.createdAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Extrai mensagem útil do erro (ApiError/Error genérico) para exibir ao usuário. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function NotesPanel({
  entityType,
  entityId,
  title = "Notas",
  subtitle,
  canEdit = true,
  singular = "nota",
  plural = "notas",
}: NotesPanelProps) {
  const LIMIT = 20;
  const singularCap = singular.charAt(0).toUpperCase() + singular.slice(1);

  const clientNotesQuery = useClientNotesPage(entityType === "client" ? entityId : "", LIMIT);
  const siteNotesQuery = useSiteNotesPage(entityType === "site" ? entityId : "", LIMIT);
  const agentNotesQuery = useAgentNotesPage(entityType === "agent" ? entityId : "", LIMIT);
  const notesQuery =
    entityType === "client" ? clientNotesQuery : entityType === "site" ? siteNotesQuery : agentNotesQuery;

  const allNotes = useMemo(() => {
    return notesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  }, [notesQuery.data]);

  const totalCount = allNotes.length;
  const hasMore = notesQuery.data?.pages[notesQuery.data.pages.length - 1]?.hasMore ?? false;
  const isFetchingNextPage = notesQuery.isFetchingNextPage;

  const createClientNote = useCreateClientNote();
  const createSiteNote = useCreateSiteNote();
  const createAgentNote = useCreateAgentNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [newContent, setNewContent] = useState("");
  const [newPinned, setNewPinned] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingPinned, setEditingPinned] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function handleOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  const sortedNotes = useMemo(() => {
    return [...allNotes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return getNoteDate(b) - getNoteDate(a);
    });
  }, [allNotes]);

  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedNotes;
    return sortedNotes.filter(
      (n) =>
        n.content.toLowerCase().includes(q) ||
        (n.author ?? "").toLowerCase().includes(q),
    );
  }, [sortedNotes, search]);

  const handleCreate = () => {
    const content = newContent.trim();
    if (content.length < 3) {
      toast.error(`O conteúdo da ${singular} deve ter ao menos 3 caracteres`);
      return;
    }

    const payload = {
      content,
      isPinned: newPinned,
    };

    const onSuccess = () => {
      toast.success(`${singularCap} criada`);
      setNewContent("");
      setNewPinned(false);
      setShowCreateForm(false);
    };

    const onError = (error: unknown) =>
      toast.error(errorMessage(error, `Erro ao criar ${singular}`));

    if (entityType === "client") {
      createClientNote.mutate({ clientId: entityId, data: payload }, { onSuccess, onError });
      return;
    }

    if (entityType === "site") {
      createSiteNote.mutate({ siteId: entityId, data: payload }, { onSuccess, onError });
      return;
    }

    createAgentNote.mutate({ agentId: entityId, data: payload }, { onSuccess, onError });
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditingContent(note.content);
    setEditingPinned(note.isPinned);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
    setEditingPinned(false);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const content = editingContent.trim();
    if (content.length < 3) {
      toast.error(`O conteúdo da ${singular} deve ter ao menos 3 caracteres`);
      return;
    }

    updateNote.mutate(
      {
        id: editingId,
        data: {
          content,
          isPinned: editingPinned,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${singularCap} atualizada`);
          cancelEdit();
        },
        onError: (error: unknown) =>
          toast.error(errorMessage(error, `Erro ao atualizar ${singular}`)),
      },
    );
  };

  const handleTogglePin = (note: Note) => {
    setOpenMenuId(null);
    updateNote.mutate(
      {
        id: note.id,
        data: {
          content: note.content,
          isPinned: !note.isPinned,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            !note.isPinned ? `${singularCap} fixada` : `${singularCap} desafixada`,
          );
        },
        onError: (error: unknown) =>
          toast.error(errorMessage(error, `Erro ao atualizar ${singular}`)),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    deleteNote.mutate(deleteTargetId, {
      onSuccess: () => {
        toast.success(`${singularCap} excluída`);
        setDeleteTargetId(null);
      },
      onError: (error: unknown) =>
        toast.error(errorMessage(error, `Erro ao excluir ${singular}`)),
    });
  };

  const isCreating = createClientNote.isPending || createSiteNote.isPending || createAgentNote.isPending;
  const isEditing = updateNote.isPending;
  const isDeleting = deleteNote.isPending;

  const toggleMenu = (noteId: string) =>
    setOpenMenuId((prev) => (prev === noteId ? null : noteId));

  const handleMenuEdit = (note: Note) => {
    setOpenMenuId(null);
    startEdit(note);
  };

  const handleMenuDelete = (noteId: string) => {
    setOpenMenuId(null);
    setDeleteTargetId(noteId);
  };

  const hasNotes = sortedNotes.length > 0;
  const createFormVisible = canEdit && (!hasNotes || showCreateForm);

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle ?? `${totalCount} ${totalCount === 1 ? singular : plural}`}
        action={
          canEdit && hasNotes ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCreateForm((v) => !v)}
              aria-label={showCreateForm ? "Fechar formulário" : `Nova ${singular}`}
            >
              <Icon name={showCreateForm ? "close" : "add"} className="h-4 w-4" />
              {showCreateForm ? "Fechar" : `Nova ${singular}`}
            </Button>
          ) : undefined
        }
      />

      {notesQuery.isLoading ? (
        <Loading message={`Carregando ${plural}...`} />
      ) : notesQuery.isError ? (
        <ErrorDisplay onRetry={() => notesQuery.refetch()} />
      ) : (
        <div className="space-y-4">
          {createFormVisible && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-light/60 p-4">
              <p className="text-sm font-medium text-foreground">Nova {singular}</p>
              <TextArea
                label="Conteúdo"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                placeholder={`Escreva a ${singular}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newPinned}
                    onChange={(e) => setNewPinned(e.target.checked)}
                    className="rounded border-border bg-surface-light accent-[var(--primary)]"
                  />
                  Fixar {singular}
                </label>
                <div className="flex gap-2">
                  {hasNotes && (
                    <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                      <Icon name="close" className="h-4 w-4" /> Cancelar
                    </Button>
                  )}
                  <Button size="sm" onClick={handleCreate} loading={isCreating}>
                    Salvar {singular}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {sortedNotes.length > 3 && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filtrar ${plural}...`}
            />
          )}

          <div className="space-y-3">
            {visibleNotes.map((note) => {
              const isCurrentEdit = editingId === note.id;
              const wasEdited = Boolean(note.updatedAt && note.updatedAt !== note.createdAt);
              return (
                <div key={note.id} className="rounded-lg border border-border bg-surface-light p-3">
                  {isCurrentEdit ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted">
                        Por <span className="text-foreground">{note.author ?? "Sem autor"}</span>
                      </p>
                      <TextArea
                        label="Conteúdo"
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={4}
                      />
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={editingPinned}
                          onChange={(e) => setEditingPinned(e.target.checked)}
                          className="rounded border-border bg-surface-light"
                        />
                        Fixar {singular}
                      </label>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          <Icon name="close" className="h-4 w-4" />
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={submitEdit} loading={isEditing}>
                          <Icon name="save" className="h-4 w-4" />
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{note.author ?? "Sem autor"}</p>
                            {note.isPinned && (
                              <Badge color="warning" className="text-[11px]">
                                <Icon name="push_pin" className="h-3 w-3" />
                                Fixada
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted">
                            {formatDateTime(note.createdAt)}
                            {wasEdited ? ` · editada em ${formatDateTime(note.updatedAt)}` : ""}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <div className="relative" ref={openMenuId === note.id ? menuRef : null}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleMenu(note.id)}
                                aria-label={`Opções da ${singular}`}
                                aria-haspopup="true"
                                aria-expanded={openMenuId === note.id}
                              >
                                <Icon name="more_vert" className="h-4 w-4" />
                              </Button>
                              {openMenuId === note.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
                                >
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-hover"
                                    onClick={() => handleTogglePin(note)}
                                  >
                                    <Icon name="push_pin" className="h-3.5 w-3.5 text-muted" />
                                    {note.isPinned ? "Desafixar" : "Fixar"}
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-hover"
                                    onClick={() => handleMenuEdit(note)}
                                  >
                                    <Icon name="edit" className="h-3.5 w-3.5 text-muted" />
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-danger transition-colors hover:bg-surface-hover"
                                    onClick={() => handleMenuDelete(note.id)}
                                    disabled={isDeleting}
                                  >
                                    <Icon name="delete" className="h-3.5 w-3.5" />
                                    Excluir
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
                    </>
                  )}
                </div>
              );
            })}

            {sortedNotes.length === 0 && (
              <p className="text-sm text-muted">Nenhuma {singular} cadastrada</p>
            )}

            {sortedNotes.length > 0 && visibleNotes.length === 0 && (
              <p className="text-sm text-muted">Nenhuma {singular} encontrada para o filtro informado.</p>
            )}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => notesQuery.fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  <Icon name="expand_more" className="h-4 w-4" />
                  Carregar mais {plural}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={`Excluir ${singular}`}
        message={`Deseja excluir esta ${singular}? Esta ação não pode ser desfeita.`}
        confirmLabel={`Excluir ${singular}`}
        tone="danger"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!isDeleting) setDeleteTargetId(null);
        }}
      />
    </Card>
  );
}

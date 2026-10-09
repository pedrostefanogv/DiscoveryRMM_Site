import { useMemo, useRef, useState } from "react";
import { Pin, Trash2, Save, X, Plus, ChevronUp, Settings2, Pencil, ChevronDown } from "lucide-react";
import { Card, CardHeader, Button, Badge, TextArea, Loading, ErrorDisplay } from "@/components/ui";
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

/** Extrai mensagem útil do erro (ApError/Error genérico) para exibir ao usuário. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && error.message.trim().length > 0) {
    // Evita mostrar placeholder genérico de status quando há detalhe real.
    return error.message;
  }
  return fallback;
}

export function NotesPanel({
  entityType,
  entityId,
  title = "Notas",
  subtitle,
  singular = "nota",
  plural = "notas",
}: NotesPanelProps) {
  const LIMIT = 20;
  const singularCap = singular.charAt(0).toUpperCase() + singular.slice(1);

  // REGRA DOS HOOKS: os três hooks são chamados SEMPRE, na mesma ordem. O id
  // vazio desliga a query inativa (enabled: !!id em useNotes), então não há
  // request extra. A versão anterior escolhia o hook por ternário, o que muda a
  // ORDEM/quantidade de hooks quando entityType muda (React error #310).
  const clientNotesQuery = useClientNotesPage(entityType === "client" ? entityId : "", LIMIT);
  const siteNotesQuery = useSiteNotesPage(entityType === "site" ? entityId : "", LIMIT);
  const agentNotesQuery = useAgentNotesPage(entityType === "agent" ? entityId : "", LIMIT);
  const notesQuery =
    entityType === "client" ? clientNotesQuery : entityType === "site" ? siteNotesQuery : agentNotesQuery;

  // Flatten all pages into a single array
  const allNotes = useMemo(() => {
    return notesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  }, [notesQuery.data]);

  const totalCount = notesQuery.data?.pages[0]?.returnedItems != null
    ? allNotes.length // approximate; cursor pagination doesn't give total
    : allNotes.length;

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

  const sortedNotes = useMemo(() => {
    return [...allNotes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return getNoteDate(b) - getNoteDate(a);
    });
  }, [allNotes]);

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

  const removeNote = (noteId: string) => {
    if (!confirm(`Deseja excluir esta ${singular}?`)) return;
    deleteNote.mutate(noteId, {
      onSuccess: () => toast.success(`${singularCap} excluída`),
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
    removeNote(noteId);
  };

  const hasNotes = sortedNotes.length > 0;
  const createFormVisible = !hasNotes || showCreateForm;

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle ?? `${totalCount} ${totalCount === 1 ? singular : plural}`}
        action={
          hasNotes ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCreateForm((v) => !v)}
              aria-label={showCreateForm ? "Fechar formulário" : `Nova ${singular}`}
            >
              {showCreateForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          ) : undefined
        }
      />

      {notesQuery.isLoading ? (
        <Loading message={`Carregando ${plural}...`} />
      ) : notesQuery.isError ? (
        <ErrorDisplay onRetry={() => notesQuery.refetch()} />
      ) : (
        <>
          <div className="space-y-3">
            {sortedNotes.map((note) => {
              const isCurrentEdit = editingId === note.id;
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
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={submitEdit} loading={isEditing}>
                          <Save className="h-4 w-4" />
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
                              <Badge color="warning" className="text-[10px]">
                                <Pin className="h-3 w-3" />
                                Fixada
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted">
                            {new Date(note.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
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
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            {openMenuId === note.id && (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface-light shadow-xl"
                                onMouseLeave={() => setOpenMenuId(null)}
                              >
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
                                  onClick={() => handleMenuEdit(note)}
                                >
                                  <Pencil className="h-3.5 w-3.5 text-muted" />
                                  Editar
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-hover transition-colors"
                                  onClick={() => handleMenuDelete(note.id)}
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Excluir
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
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

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => notesQuery.fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  <ChevronDown className="h-4 w-4" />
                  Carregar mais {plural}
                </Button>
              </div>
            )}
          </div>

          {createFormVisible && <div className="mt-4 space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Nova {singular}</p>
            <TextArea
              label="Conteúdo"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder={`Escreva a ${singular}`}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={newPinned}
                onChange={(e) => setNewPinned(e.target.checked)}
                className="rounded border-border bg-surface-light"
              />
              Fixar {singular}
            </label>
            <div className="flex justify-end gap-2">
              {hasNotes && (
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
              )}
              <Button size="sm" onClick={handleCreate} loading={isCreating}>
                Salvar {singular}
              </Button>
            </div>
          </div>}
        </>
      )}
    </Card>
  );
}

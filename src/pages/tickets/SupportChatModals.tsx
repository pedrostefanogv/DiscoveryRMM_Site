import { useEffect, useState } from "react";
import { iamApi, type UserDto } from "@/api/iam";
import type { LinkSupportChatToTicketRequest } from "@/api/ticket-chat";
import { Button } from "@/components/ui";

interface TransferChatModalProps {
  open: boolean;
  isLoading: boolean;
  onConfirm: (targetUserId: string) => void;
  onClose: () => void;
}

export function TransferChatModal({ open, isLoading, onConfirm, onClose }: TransferChatModalProps) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUsers(true);
    void iamApi
      .listUsers()
      .then((list) => {
        if (cancelled) return;
        const active = (list ?? []).filter((u) => u.isActive !== false);
        setUsers(active);
        if (active.length > 0 && !selectedUserId) {
          setSelectedUserId(active[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isLoading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-chat-modal-title"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="transfer-chat-modal-title" className="text-base font-semibold text-foreground">
          Transferir atendimento
        </h3>
        <p className="mt-1 text-xs text-muted">
          Escolha o técnico que assumirá esta conversa ao vivo.
        </p>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-foreground">Técnico destino</label>
          {loadingUsers ? (
            <p className="text-xs text-muted">Carregando técnicos…</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-danger">Nenhum técnico disponível encontrado.</p>
          ) : (
            <select
              autoFocus
              className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName ? `${u.fullName} (${u.login})` : u.login}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => selectedUserId && onConfirm(selectedUserId)}
            disabled={isLoading || !selectedUserId}
          >
            {isLoading ? "Transferindo…" : "Transferir"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface LinkTicketModalProps {
  open: boolean;
  isLoading: boolean;
  onConfirm: (payload: LinkSupportChatToTicketRequest) => void;
  onClose: () => void;
}

export function LinkTicketModal({ open, isLoading, onConfirm, onClose }: LinkTicketModalProps) {
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");
  const [existingTicketId, setExistingTicketId] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("create");
    setTitle("");
    setDescription("");
    setPriority("Medium");
    setExistingTicketId("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isLoading, onClose]);

  if (!open) return null;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const canSubmit =
    mode === "create"
      ? title.trim().length > 0
      : uuidPattern.test(existingTicketId.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-ticket-modal-title"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="link-ticket-modal-title" className="text-base font-semibold text-foreground">
          Converter conversa em chamado
        </h3>
        <p className="mt-1 text-xs text-muted">
          O histórico completo desta conversa será vinculado ao chamado.
        </p>

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant={mode === "create" ? "primary" : "ghost"}
            onClick={() => setMode("create")}
          >
            Novo chamado
          </Button>
          <Button
            size="sm"
            variant={mode === "existing" ? "primary" : "ghost"}
            onClick={() => setMode("existing")}
          >
            Chamado existente
          </Button>
        </div>

        {mode === "create" ? (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Título *</label>
              <input
                autoFocus
                type="text"
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="Ex.: Erro ao acessar sistema financeiro"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Prioridade</label>
              <select
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "Low" | "Medium" | "High" | "Critical")
                }
              >
                <option value="Low">Baixa</option>
                <option value="Medium">Média</option>
                <option value="High">Alta</option>
                <option value="Critical">Crítica</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Descrição</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                placeholder="Detalhes adicionais (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-foreground">ID do chamado *</label>
            <input
              autoFocus
              type="text"
              className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="UUID do chamado"
              value={existingTicketId}
              onChange={(e) => setExistingTicketId(e.target.value)}
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={isLoading || !canSubmit}
            onClick={() => {
              if (mode === "create") {
                onConfirm({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  priority,
                });
              } else {
                onConfirm({ existingTicketId: existingTicketId.trim() });
              }
            }}
          >
            {isLoading ? "Vinculando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

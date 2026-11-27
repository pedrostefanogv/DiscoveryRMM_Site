import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createTicketUploadLink,
  listTicketUploadLinks,
  revokeTicketUploadLink,
} from "@/api/files";
import { formatBytes } from "@/pages/public/PublicPortalLayout";
import { Icon } from "@/components/ui";

function defaultExpiryLocal(days = 7): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function generatePin(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function TicketUploadLinksPanel({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("Envio de arquivos para o chamado");
  const [description, setDescription] = useState("");
  const [expires, setExpires] = useState(() => defaultExpiryLocal(7));
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [maxFiles, setMaxFiles] = useState("5");
  const [maxFileMb, setMaxFileMb] = useState("100");
  const [maxTotalMb, setMaxTotalMb] = useState("500");
  const [extensions, setExtensions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const linksQuery = useQuery({
    queryKey: ["ticket-upload-links", ticketId],
    queryFn: () => listTicketUploadLinks(ticketId),
    enabled: Boolean(ticketId),
  });

  const copyLink = async (shortCode: string, pin?: string) => {
    const url = `${window.location.origin}/download/upload/${shortCode}`;
    const text = pin ? `${url}\nContra-senha: ${pin}` : url;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link de envio copiado!");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Copie o link manualmente.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const pinToCopy = requirePasscode ? passcode.trim() : undefined;
      const created = await createTicketUploadLink(ticketId, {
        title: title.trim() || "Envio de arquivos para o chamado",
        description: description.trim() || null,
        expiresAtUtc: new Date(expires).toISOString(),
        requirePasscode,
        passcode: pinToCopy || null,
        allowMultiple,
        maxFiles: Number(maxFiles) || 5,
        maxFileSizeBytes: (Number(maxFileMb) || 100) * 1024 * 1024,
        maxTotalSizeBytes: (Number(maxTotalMb) || 500) * 1024 * 1024,
        allowedExtensions: extensions.split(",").map((s) => s.trim()).filter(Boolean),
        notifyOnUpload: true,
      });
      setShowModal(false);
      setPasscode("");
      qc.invalidateQueries({ queryKey: ["ticket-upload-links", ticketId] });
      await copyLink(created.shortCode, pinToCopy);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar link de envio.");
    } finally {
      setSubmitting(false);
    }
  };

  const links = linksQuery.data || [];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Icon name="drive_folder_upload" size={18} className="text-blue-600" />
            <span>Receber arquivos de outro local (sem Agent)</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gere um link temporário (com validade e contra-senha opcional) para o cliente enviar arquivos diretamente para este chamado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0"
        >
          <Icon name="link" size={15} />
          <span>Gerar link de envio</span>
        </button>
      </div>

      {links.length > 0 && (
        <div className="space-y-2 pt-1">
          {links.map((l) => {
            const isQuotaReached =
              l.uploadedFilesCount >= l.maxFiles ||
              l.uploadedTotalBytes >= l.maxTotalSizeBytes;
            return (
              <div
                key={l.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {l.title} {l.requirePasscode ? "• Com contra-senha" : ""}
                  </div>
                  <div className="text-slate-500 font-mono truncate">
                    /download/upload/{l.shortCode} • {l.uploadedFilesCount}/{l.maxFiles} arq(s) ({formatBytes(l.uploadedTotalBytes)}) • Expira em{" "}
                    {new Date(l.expiresAtUtc).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      l.isRevoked
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : l.isExpired
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : isQuotaReached
                            ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {l.isRevoked
                      ? "Revogado"
                      : l.isExpired
                        ? "Expirado"
                        : isQuotaReached
                          ? "Cota atingida"
                          : "Ativo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyLink(l.shortCode)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Copiar
                  </button>
                  {!l.isRevoked && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await revokeTicketUploadLink(ticketId, l.id);
                          qc.invalidateQueries({ queryKey: ["ticket-upload-links", ticketId] });
                          toast.success("Link revogado.");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Erro ao revogar link.");
                        }
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-3 shadow-xl border border-slate-200 dark:border-slate-800"
          >
            <h3 className="text-base font-bold">Gerar Link de Upload para o Chamado</h3>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instruções opcionais para o cliente..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div>
              <label className="text-xs text-slate-500">Válido até</label>
              <input
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500">Máx. arq.</label>
                <input
                  type="number"
                  min={1}
                  value={maxFiles}
                  onChange={(e) => setMaxFiles(e.target.value)}
                  disabled={!allowMultiple}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Máx/arq MB</label>
                <input
                  type="number"
                  min={1}
                  value={maxFileMb}
                  onChange={(e) => setMaxFileMb(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Total MB</label>
                <input
                  type="number"
                  min={1}
                  value={maxTotalMb}
                  onChange={(e) => setMaxTotalMb(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
            </div>
            <input
              type="text"
              value={extensions}
              onChange={(e) => setExtensions(e.target.value)}
              placeholder="Extensões permitidas (ex.: .zip, .log, .pdf) — vazio = todas"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
                <span>Múltiplos arquivos</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={requirePasscode} onChange={(e) => setRequirePasscode(e.target.checked)} />
                <span>Exigir contra-senha</span>
              </label>
            </div>
            {requirePasscode && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Contra-senha / código"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setPasscode(generatePin())}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Gerar
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-50"
              >
                {submitting ? "Gerando..." : "Criar e Copiar Link"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

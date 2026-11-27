import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getPublicUploadInfo,
  uploadFileViaPublicLink,
  verifyPublicUploadPasscode,
} from "@/api/publicDownloads";
import { PublicPortalLayout, formatBytes } from "./PublicPortalLayout";
import { Icon } from "@/components/ui/Icon";

interface QueuedItem {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function PublicClientUploadPage() {
  const { shortCode = "" } = useParams<{ shortCode: string }>();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-upload", shortCode, sessionToken],
    queryFn: () => getPublicUploadInfo(shortCode, sessionToken),
    enabled: Boolean(shortCode),
    retry: false,
  });

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setVerifying(true);
    try {
      const res = await verifyPublicUploadPasscode(shortCode, passcode.trim());
      if (res.valid && res.sessionToken) {
        setSessionToken(res.sessionToken);
        toast.success("Acesso liberado para envio!");
      } else {
        toast.error(res.error || "Contra-senha inválida.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Contra-senha inválida.");
    } finally {
      setVerifying(false);
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || !data) return;
    const selected = Array.from(fileList);
    if (!data.allowMultiple && selected.length > 1) {
      toast.error("Este link permite apenas 1 arquivo por envio.");
      return;
    }

    const items: QueuedItem[] = selected.map((file) => {
      if (file.size > data.maxFileSizeBytes) {
        return {
          id: `${file.name}-${Math.random()}`,
          file,
          progress: 0,
          status: "error",
          error: `Excede o limite por arquivo (${formatBytes(data.maxFileSizeBytes)})`,
        };
      }
      if (data.allowedExtensions.length > 0) {
        const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : "";
        if (!data.allowedExtensions.some((e) => e.toLowerCase() === ext)) {
          return {
            id: `${file.name}-${Math.random()}`,
            file,
            progress: 0,
            status: "error",
            error: `Extensão não permitida (${data.allowedExtensions.join(", ")})`,
          };
        }
      }
      return {
        id: `${file.name}-${Math.random()}`,
        file,
        progress: 0,
        status: "pending",
      };
    });

    setQueue((prev) => (data.allowMultiple ? [...prev, ...items] : items));
  };

  const startUpload = async () => {
    const pending = queue.filter((q) => q.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);
    for (const item of pending) {
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", progress: 0 } : q)));
      try {
        await uploadFileViaPublicLink(shortCode, item.file, sessionToken, (pct) => {
          setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, progress: pct } : q)));
        });
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "done", progress: 100 } : q)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro no envio.";
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: msg } : q)));
      }
    }
    setUploading(false);
    await refetch();
    toast.success("Processamento de envio concluído!");
  };

  if (isLoading) {
    return (
      <PublicPortalLayout subtitle="Envio de Arquivos">
        <div className="py-20 text-center text-slate-500">Carregando informações do link de envio...</div>
      </PublicPortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PublicPortalLayout subtitle="Envio de Arquivos">
        <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-8 text-center max-w-md mx-auto mt-10">
          <Icon name="link_off" size={36} className="mx-auto text-red-500 mb-3" />
          <h1 className="text-lg font-semibold mb-1">Link de envio não encontrado</h1>
          <p className="text-sm text-slate-500">Verifique o endereço recebido.</p>
        </div>
      </PublicPortalLayout>
    );
  }

  const unavailableReason = data.isRevoked
    ? "Este link de envio foi revogado."
    : data.isExpired
      ? "Este link de envio expirou."
      : data.isQuotaReached
        ? "A cota máxima de arquivos/espaço deste link já foi atingida."
        : data.isLocked
          ? "Link temporariamente bloqueado por excesso de tentativas incorretas."
          : null;

  return (
    <PublicPortalLayout subtitle={data.title}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">{data.title}</h1>
              {data.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">{data.description}</p>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
              Válido até {new Date(data.expiresAtUtc).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-200">Modo</div>
              <div>{data.allowMultiple ? "Múltiplos" : "Arquivo único"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-200">Restantes</div>
              <div>{data.remainingFiles} arquivo(s)</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-200">Máx/arquivo</div>
              <div>{formatBytes(data.maxFileSizeBytes)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-200">Cota livre</div>
              <div>{formatBytes(data.remainingBytes)}</div>
            </div>
          </div>

          {(data.allowedExtensions.length > 0 || data.allowedMimeTypes.length > 0) && (
            <div className="text-xs text-slate-500">
              Tipos aceitos:{" "}
              <span className="font-mono">
                {[...data.allowedExtensions, ...data.allowedMimeTypes].join(", ")}
              </span>
            </div>
          )}
        </div>

        {unavailableReason ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
            <Icon name="warning" size={32} className="mx-auto text-amber-500 mb-2" />
            <p className="font-medium text-amber-900 dark:text-amber-200">{unavailableReason}</p>
          </div>
        ) : !data.unlocked ? (
          <form
            onSubmit={handleVerify}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon name="lock" size={18} className="text-blue-600" />
              <span>Informe a contra-senha para liberar o envio de arquivos</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Digite a contra-senha / código..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={verifying || !passcode.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
              >
                {verifying ? "Validando..." : "Liberar Envio"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-white dark:bg-slate-900 p-8 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={data.allowMultiple}
                accept={data.allowedExtensions.join(",") || undefined}
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <Icon name="cloud_upload" size={36} className="mx-auto text-blue-600 mb-2" />
              <p className="font-medium text-sm">Clique ou arraste {data.allowMultiple ? "os arquivos" : "o arquivo"} aqui</p>
              <p className="text-xs text-slate-500 mt-1">Envio direto e criptografado ao storage</p>
            </div>

            {queue.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                {queue.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium truncate">{item.file.name}</span>
                      <span className="text-slate-500 shrink-0">
                        {formatBytes(item.file.size)} •{" "}
                        {item.status === "done"
                          ? "Enviado"
                          : item.status === "error"
                            ? "Erro"
                            : item.status === "uploading"
                              ? `${item.progress}%`
                              : "Aguardando"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          item.status === "error"
                            ? "bg-red-500"
                            : item.status === "done"
                              ? "bg-emerald-500"
                              : "bg-blue-600"
                        }`}
                        style={{ width: `${item.status === "error" ? 100 : item.progress}%` }}
                      />
                    </div>
                    {item.error && <div className="text-[11px] text-red-500">{item.error}</div>}
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setQueue([])}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    disabled={uploading || !queue.some((q) => q.status === "pending")}
                    onClick={startUpload}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium"
                  >
                    {uploading ? "Enviando..." : "Enviar Arquivos"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicPortalLayout>
  );
}

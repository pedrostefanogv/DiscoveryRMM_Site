import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  downloadPublicShareFile,
  getPublicShareInfo,
  verifyPublicSharePasscode,
} from "@/api/publicDownloads";
import { PublicPortalLayout, formatBytes } from "./PublicPortalLayout";
import { Icon } from "@/components/ui/Icon";

export default function PublicShareDownloadPage() {
  const { shortCode = "" } = useParams<{ shortCode: string }>();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-share", shortCode, sessionToken],
    queryFn: () => getPublicShareInfo(shortCode, sessionToken),
    enabled: Boolean(shortCode),
    retry: false,
  });

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setVerifying(true);
    try {
      const res = await verifyPublicSharePasscode(shortCode, passcode.trim());
      if (res.valid && res.sessionToken) {
        setSessionToken(res.sessionToken);
        toast.success("Acesso liberado!");
      } else {
        toast.error(res.error || "Contra-senha inválida.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Contra-senha inválida.");
    } finally {
      setVerifying(false);
    }
  };

  const handleDownload = async (fileId: string) => {
    setDownloadingId(fileId);
    try {
      const res = await downloadPublicShareFile(shortCode, fileId, sessionToken);
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar arquivo.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <PublicPortalLayout subtitle="Link Compartilhado">
        <div className="py-20 text-center text-slate-500">Carregando informações do link...</div>
      </PublicPortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PublicPortalLayout subtitle="Link Compartilhado">
        <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 p-8 text-center max-w-md mx-auto mt-10">
          <Icon name="link_off" size={36} className="mx-auto text-red-500 mb-3" />
          <h1 className="text-lg font-semibold mb-1">Link não encontrado</h1>
          <p className="text-sm text-slate-500">Verifique se o endereço foi copiado corretamente.</p>
        </div>
      </PublicPortalLayout>
    );
  }

  const unavailableReason = data.isRevoked
    ? "Este link foi revogado pelo administrador."
    : data.isExpired
      ? "Este link expirou e não está mais disponível."
      : data.isLimitReached
        ? "O limite máximo de downloads deste link foi atingido."
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
              {data.folderPath && (
                <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-mono">
                  <Icon name="folder" size={14} />
                  <span>Pasta: {data.folderPath}</span>
                </div>
              )}
              {data.message && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">{data.message}</p>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
              Válido até {new Date(data.expiresAtUtc).toLocaleString("pt-BR")}
            </span>
          </div>
          {data.maxDownloads && (
            <div className="text-xs text-slate-500">
              Downloads realizados: {data.downloadCount} / {data.maxDownloads}
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
              <span>Este link é protegido por contra-senha</span>
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
                {verifying ? "Validando..." : "Desbloquear"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {data.files.map((file) => (
              <div
                key={file.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{file.name}</div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    {file.folderPath && file.folderPath !== "/" ? `${file.folderPath}/` : ""}
                    {file.fileName} • {formatBytes(file.sizeBytes)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={downloadingId === file.id}
                  onClick={() => handleDownload(file.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium shrink-0"
                >
                  <Icon name="download" size={16} />
                  <span>{downloadingId === file.id ? "Preparando..." : "Baixar"}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PublicPortalLayout>
  );
}

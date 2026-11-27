import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/api/client";
import {
  createShareLink,
  createUploadLink,
  deleteManagedFile,
  getFileHubStats,
  getManagedFileDownloadUrl,
  listFileAccessLogs,
  listManagedFiles,
  listShareLinks,
  listUploadLinks,
  revokeShareLink,
  revokeUploadLink,
  uploadManagedFile,
  type FileScope,
  type FileVisibility,
  type ManagedFileDto,
} from "@/api/files";
import { formatBytes } from "@/pages/public/PublicPortalLayout";
import { Icon } from "@/components/ui/Icon";

type HubTab = "files" | "shares" | "uploads" | "logs";

interface ClientItem {
  id: string;
  name: string;
}

interface SiteItem {
  id: string;
  name: string;
  clientId: string;
}

const SCOPE_LABELS: Record<FileScope, string> = {
  0: "Global",
  1: "Cliente",
  2: "Site",
};

const VISIBILITY_LABELS: Record<FileVisibility, string> = {
  0: "Privado",
  1: "Somente Agent",
  2: "Público",
};

function defaultExpiryLocal(days = 7): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function FilesHubPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<HubTab>("files");
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("");
  const [visFilter, setVisFilter] = useState<string>("");

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadScope, setUploadScope] = useState<FileScope>(0);
  const [uploadClientId, setUploadClientId] = useState("");
  const [uploadSiteId, setUploadSiteId] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState<FileVisibility>(1);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Share link modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareFileIds, setShareFileIds] = useState<string[]>([]);
  const [shareExpires, setShareExpires] = useState(() => defaultExpiryLocal(7));
  const [shareRequirePasscode, setShareRequirePasscode] = useState(false);
  const [sharePasscode, setSharePasscode] = useState("");
  const [shareMaxDownloads, setShareMaxDownloads] = useState("");

  // Upload link (File Drop) modal
  const [showUploadLinkModal, setShowUploadLinkModal] = useState(false);
  const [ulTitle, setUlTitle] = useState("");
  const [ulDesc, setUlDesc] = useState("");
  const [ulClientId, setUlClientId] = useState("");
  const [ulSiteId, setUlSiteId] = useState("");
  const [ulExpires, setUlExpires] = useState(() => defaultExpiryLocal(7));
  const [ulRequirePasscode, setUlRequirePasscode] = useState(false);
  const [ulPasscode, setUlPasscode] = useState("");
  const [ulAllowMultiple, setUlAllowMultiple] = useState(true);
  const [ulMaxFiles, setUlMaxFiles] = useState("10");
  const [ulMaxFileMb, setUlMaxFileMb] = useState("100");
  const [ulMaxTotalMb, setUlMaxTotalMb] = useState("500");
  const [ulExtensions, setUlExtensions] = useState("");
  const [ulMimes, setUlMimes] = useState("");
  const [ulRetentionDays, setUlRetentionDays] = useState("30");

  const statsQuery = useQuery({ queryKey: ["files-stats"], queryFn: getFileHubStats });
  const filesQuery = useQuery({
    queryKey: ["managed-files", search, scopeFilter, visFilter],
    queryFn: () =>
      listManagedFiles({
        search: search || undefined,
        scope: scopeFilter !== "" ? (Number(scopeFilter) as FileScope) : undefined,
        visibility: visFilter !== "" ? (Number(visFilter) as FileVisibility) : undefined,
        pageSize: 100,
      }),
  });
  const shareLinksQuery = useQuery({ queryKey: ["file-share-links"], queryFn: listShareLinks, enabled: tab === "shares" });
  const uploadLinksQuery = useQuery({ queryKey: ["file-upload-links"], queryFn: listUploadLinks, enabled: tab === "uploads" });
  const logsQuery = useQuery({ queryKey: ["file-access-logs"], queryFn: () => listFileAccessLogs(), enabled: tab === "logs" });

  const clientsQuery = useQuery({
    queryKey: ["clients-minimal-files"],
    queryFn: () => api.get<ClientItem[]>("/clients"),
  });
  const sitesQuery = useQuery({
    queryKey: ["sites-minimal-files"],
    queryFn: () => api.get<SiteItem[]>("/sites"),
  });

  const filteredUploadSites = (sitesQuery.data || []).filter((s) => !uploadClientId || s.clientId === uploadClientId);
  const filteredUlSites = (sitesQuery.data || []).filter((s) => !ulClientId || s.clientId === ulClientId);

  const copyLink = async (path: string, passcode?: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    const text = passcode ? `${fullUrl}\nCódigo/Senha: ${passcode}` : fullUrl;
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Selecione um arquivo.");
      return;
    }
    try {
      setUploadProgress(0);
      await uploadManagedFile(
        uploadFile,
        {
          name: uploadName.trim() || uploadFile.name,
          description: uploadDesc.trim() || undefined,
          category: uploadCategory.trim() || undefined,
          scope: uploadScope,
          clientId: uploadScope >= 1 ? uploadClientId : null,
          siteId: uploadScope === 2 ? uploadSiteId : null,
          visibility: uploadVisibility,
        },
        setUploadProgress,
      );
      toast.success("Arquivo enviado para o S3!");
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName("");
      setUploadDesc("");
      setUploadProgress(null);
      qc.invalidateQueries({ queryKey: ["managed-files"] });
      qc.invalidateQueries({ queryKey: ["files-stats"] });
    } catch (err) {
      setUploadProgress(null);
      toast.error(err instanceof Error ? err.message : "Erro ao enviar arquivo.");
    }
  };

  const handleDownload = async (file: ManagedFileDto) => {
    try {
      const res = await getManagedFileDownloadUrl(file.id);
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar link.");
    }
  };

  const handleDelete = async (file: ManagedFileDto) => {
    if (!window.confirm(`Excluir "${file.name}" do storage S3?`)) return;
    try {
      await deleteManagedFile(file.id);
      toast.success("Arquivo excluído.");
      qc.invalidateQueries({ queryKey: ["managed-files"] });
      qc.invalidateQueries({ queryKey: ["files-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shareFileIds.length === 0) {
      toast.error("Selecione ao menos um arquivo.");
      return;
    }
    try {
      const created = await createShareLink({
        title: shareTitle.trim() || "Arquivos Compartilhados",
        message: shareMessage.trim() || null,
        fileIds: shareFileIds,
        expiresAtUtc: new Date(shareExpires).toISOString(),
        requirePasscode: shareRequirePasscode,
        passcode: shareRequirePasscode ? sharePasscode.trim() : null,
        maxDownloads: shareMaxDownloads ? Number(shareMaxDownloads) : null,
      });
      await copyLink(`/download/share/${created.shortCode}`, shareRequirePasscode ? sharePasscode.trim() : undefined);
      setShowShareModal(false);
      setShareTitle("");
      setShareMessage("");
      setShareFileIds([]);
      setSharePasscode("");
      setTab("shares");
      qc.invalidateQueries({ queryKey: ["file-share-links"] });
      qc.invalidateQueries({ queryKey: ["files-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar link.");
    }
  };

  const handleCreateUploadLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createUploadLink({
        title: ulTitle.trim() || "Envio de Arquivos",
        description: ulDesc.trim() || null,
        clientId: ulClientId || null,
        siteId: ulSiteId || null,
        expiresAtUtc: new Date(ulExpires).toISOString(),
        requirePasscode: ulRequirePasscode,
        passcode: ulRequirePasscode ? ulPasscode.trim() : null,
        allowMultiple: ulAllowMultiple,
        maxFiles: Number(ulMaxFiles) || 10,
        maxFileSizeBytes: (Number(ulMaxFileMb) || 100) * 1024 * 1024,
        maxTotalSizeBytes: (Number(ulMaxTotalMb) || 500) * 1024 * 1024,
        allowedExtensions: ulExtensions.split(",").map((s) => s.trim()).filter(Boolean),
        allowedMimeTypes: ulMimes.split(",").map((s) => s.trim()).filter(Boolean),
        fileRetentionDays: ulRetentionDays ? Number(ulRetentionDays) : null,
        notifyOnUpload: true,
      });
      await copyLink(`/download/upload/${created.shortCode}`, ulRequirePasscode ? ulPasscode.trim() : undefined);
      setShowUploadLinkModal(false);
      setUlTitle("");
      setUlDesc("");
      setUlPasscode("");
      setTab("uploads");
      qc.invalidateQueries({ queryKey: ["file-upload-links"] });
      qc.invalidateQueries({ queryKey: ["files-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar link de upload.");
    }
  };

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Arquivos (S3)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie arquivos públicos (/download), distribuição para Agents (Global → Cliente → Site) e links temporários.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copyLink("/download")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Icon name="link" size={16} />
            <span>Copiar /download</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUploadLinkModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Icon name="drive_folder_upload" size={16} />
            <span>Solicitar Upload</span>
          </button>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Icon name="link" size={16} />
            <span>Link de Download</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm"
          >
            <Icon name="upload" size={16} />
            <span>Enviar Arquivo</span>
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500">Arquivos Ativos</div>
            <div className="text-2xl font-bold mt-1">{stats.totalFiles}</div>
            <div className="text-xs text-slate-400 mt-0.5">{formatBytes(stats.totalBytes)} no S3</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500">Downloads Totais</div>
            <div className="text-2xl font-bold mt-1">{stats.totalDownloads}</div>
            <div className="text-xs text-slate-400 mt-0.5">Global: {formatBytes(stats.globalBytes)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500">Links de Download Ativos</div>
            <div className="text-2xl font-bold mt-1">{stats.activeShareLinks}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500">Links de Upload Ativos</div>
            <div className="text-2xl font-bold mt-1">{stats.activeUploadLinks}</div>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6 text-sm">
        {(
          [
            ["files", "Arquivos"],
            ["shares", "Links de Download"],
            ["uploads", "Links de Upload (File Drop)"],
            ["logs", "Auditoria"],
          ] as [HubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`pb-2.5 border-b-2 font-medium transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou arquivo..."
              className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            />
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">Todos os escopos</option>
              <option value="0">Global</option>
              <option value="1">Cliente</option>
              <option value="2">Site</option>
            </select>
            <select
              value={visFilter}
              onChange={(e) => setVisFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">Todas visibilidades</option>
              <option value="2">Público (/download)</option>
              <option value="1">Somente Agent</option>
              <option value="0">Privado</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Arquivo</th>
                  <th className="px-4 py-3">Escopo</th>
                  <th className="px-4 py-3">Visibilidade</th>
                  <th className="px-4 py-3">Tamanho</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(filesQuery.data?.items || []).map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{f.fileName}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        {SCOPE_LABELS[f.scope]}
                        {f.clientName ? ` • ${f.clientName}` : ""}
                        {f.siteName ? ` / ${f.siteName}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{VISIBILITY_LABELS[f.visibility]}</td>
                    <td className="px-4 py-3 text-xs">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs">{f.downloadCount}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShareFileIds([f.id]);
                          setShareTitle(`Download: ${f.name}`);
                          setShowShareModal(true);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Compartilhar
                      </button>
                      <button type="button" onClick={() => handleDownload(f)} className="text-xs text-slate-600 dark:text-slate-300 hover:underline">
                        Baixar
                      </button>
                      <button type="button" onClick={() => handleDelete(f)} className="text-xs text-red-600 hover:underline">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {(filesQuery.data?.items || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      Nenhum arquivo encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "shares" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Arquivos</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Downloads</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(shareLinksQuery.data || []).map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.title}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      /download/share/{l.shortCode} {l.requirePasscode ? "• 🔒 Com senha" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.files.length}</td>
                  <td className="px-4 py-3 text-xs">{new Date(l.expiresAtUtc).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-xs">{l.downloadCount}{l.maxDownloads ? ` / ${l.maxDownloads}` : ""}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.isRevoked ? "Revogado" : l.isExpired ? "Expirado" : "Ativo"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" onClick={() => copyLink(`/download/share/${l.shortCode}`)} className="text-xs text-blue-600 hover:underline">
                      Copiar Link
                    </button>
                    {!l.isRevoked && (
                      <button
                        type="button"
                        onClick={async () => {
                          await revokeShareLink(l.id);
                          qc.invalidateQueries({ queryKey: ["file-share-links"] });
                          toast.success("Link revogado.");
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "uploads" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Limites</th>
                <th className="px-4 py-3">Recebidos</th>
                <th className="px-4 py-3">Validade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(uploadLinksQuery.data || []).map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.title}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      /download/upload/{l.shortCode} {l.requirePasscode ? "• 🔒 Com senha" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {l.allowMultiple ? `Até ${l.maxFiles} arqs` : "Único"} • Máx {formatBytes(l.maxFileSizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {l.uploadedFilesCount} ({formatBytes(l.uploadedTotalBytes)})
                  </td>
                  <td className="px-4 py-3 text-xs">{new Date(l.expiresAtUtc).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-xs">{l.isRevoked ? "Revogado" : l.isExpired ? "Expirado" : "Ativo"}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" onClick={() => copyLink(`/download/upload/${l.shortCode}`)} className="text-xs text-blue-600 hover:underline">
                      Copiar Link
                    </button>
                    {!l.isRevoked && (
                      <button
                        type="button"
                        onClick={async () => {
                          await revokeUploadLink(l.id);
                          qc.invalidateQueries({ queryKey: ["file-upload-links"] });
                          toast.success("Link revogado.");
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "logs" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(logsQuery.data || []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 text-xs">{new Date(log.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{log.eventType}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{log.clientIp || "-"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono truncate max-w-md">{log.detailsJson || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Upload de Arquivo */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleUploadSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Enviar Arquivo para o S3</h2>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f && !uploadName) setUploadName(f.name);
              }}
              className="w-full text-sm"
              required
            />
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Nome de exibição"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              type="text"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              placeholder="Categoria (ex.: Instaladores, Drivers, Ferramentas)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <textarea
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="Descrição opcional..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={uploadScope}
                onChange={(e) => setUploadScope(Number(e.target.value) as FileScope)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value={0}>Global</option>
                <option value={1}>Cliente</option>
                <option value={2}>Site</option>
              </select>
              <select
                value={uploadVisibility}
                onChange={(e) => setUploadVisibility(Number(e.target.value) as FileVisibility)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value={2}>Público (/download + Agent)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado (Links/Admin)</option>
              </select>
            </div>
            {uploadScope >= 1 && (
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={uploadClientId}
                  onChange={(e) => { setUploadClientId(e.target.value); setUploadSiteId(""); }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  required
                >
                  <option value="">Selecione o Cliente</option>
                  {(clientsQuery.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {uploadScope === 2 && (
                  <select
                    value={uploadSiteId}
                    onChange={(e) => setUploadSiteId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    required
                  >
                    <option value="">Selecione o Site</option>
                    {filteredUploadSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            )}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="text-xs text-slate-500">Enviando: {uploadProgress}%</div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" disabled={uploadProgress !== null} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium disabled:opacity-50">
                Enviar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Criar Link de Download */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateShareLink} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Criar Link de Download</h2>
            <input
              type="text"
              value={shareTitle}
              onChange={(e) => setShareTitle(e.target.value)}
              placeholder="Título do compartilhamento"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
            />
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              placeholder="Mensagem opcional para o cliente..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-1">
              {(filesQuery.data?.items || []).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                  <input
                    type="checkbox"
                    checked={shareFileIds.includes(f.id)}
                    onChange={(e) =>
                      setShareFileIds((prev) => (e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)))
                    }
                  />
                  <span className="truncate">{f.name} ({formatBytes(f.sizeBytes)})</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Válido até</label>
                <input
                  type="datetime-local"
                  value={shareExpires}
                  onChange={(e) => setShareExpires(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Limite de downloads (opc.)</label>
                <input
                  type="number"
                  min={1}
                  value={shareMaxDownloads}
                  onChange={(e) => setShareMaxDownloads(e.target.value)}
                  placeholder="Ilimitado"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={shareRequirePasscode} onChange={(e) => setShareRequirePasscode(e.target.checked)} />
              <span>Exigir contra-senha / código</span>
            </label>
            {shareRequirePasscode && (
              <input
                type="text"
                value={sharePasscode}
                onChange={(e) => setSharePasscode(e.target.value)}
                placeholder="Digite o código/contra-senha"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                required
              />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowShareModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium">
                Criar e Copiar Link
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Criar Link de Upload (File Drop) */}
      {showUploadLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateUploadLink} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Criar Link de Upload (File Drop)</h2>
            <input
              type="text"
              value={ulTitle}
              onChange={(e) => setUlTitle(e.target.value)}
              placeholder="Título (ex.: Envio de Logs / Backup)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
            />
            <textarea
              value={ulDesc}
              onChange={(e) => setUlDesc(e.target.value)}
              placeholder="Instruções para o cliente..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={ulClientId}
                onChange={(e) => { setUlClientId(e.target.value); setUlSiteId(""); }}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">Cliente (opcional)</option>
                {(clientsQuery.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={ulSiteId}
                onChange={(e) => setUlSiteId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">Site (opcional)</option>
                {filteredUlSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Válido até</label>
                <input
                  type="datetime-local"
                  value={ulExpires}
                  onChange={(e) => setUlExpires(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Retenção (dias, opc.)</label>
                <input
                  type="number"
                  min={1}
                  value={ulRetentionDays}
                  onChange={(e) => setUlRetentionDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500">Máx. arquivos</label>
                <input type="number" min={1} value={ulMaxFiles} onChange={(e) => setUlMaxFiles(e.target.value)} disabled={!ulAllowMultiple} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Máx/arq (MB)</label>
                <input type="number" min={1} value={ulMaxFileMb} onChange={(e) => setUlMaxFileMb(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Cota total (MB)</label>
                <input type="number" min={1} value={ulMaxTotalMb} onChange={(e) => setUlMaxTotalMb(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
              </div>
            </div>
            <input
              type="text"
              value={ulExtensions}
              onChange={(e) => setUlExtensions(e.target.value)}
              placeholder="Extensões permitidas (ex.: .pdf, .zip, .png) — vazio = todas"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              type="text"
              value={ulMimes}
              onChange={(e) => setUlMimes(e.target.value)}
              placeholder="MIMEs permitidos (ex.: application/pdf, image/*) — vazio = todos"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ulAllowMultiple} onChange={(e) => setUlAllowMultiple(e.target.checked)} />
                <span>Permitir múltiplos arquivos</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ulRequirePasscode} onChange={(e) => setUlRequirePasscode(e.target.checked)} />
                <span>Exigir contra-senha</span>
              </label>
            </div>
            {ulRequirePasscode && (
              <input
                type="text"
                value={ulPasscode}
                onChange={(e) => setUlPasscode(e.target.value)}
                placeholder="Digite o código/contra-senha"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                required
              />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowUploadLinkModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium">
                Criar e Copiar Link
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

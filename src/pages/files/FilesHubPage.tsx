import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/api/client";
import {
  createManagedFolder,
  createShareLink,
  createUploadLink,
  deleteManagedFile,
  deleteManagedFolder,
  getFileHubStats,
  getManagedFileDownloadUrl,
  listFileAccessLogs,
  listManagedFiles,
  listManagedFolders,
  listShareLinks,
  listUploadLinks,
  revokeShareLink,
  revokeUploadLink,
  updateManagedFile,
  updateManagedFolder,
  uploadManagedFile,
  type FileScope,
  type FileVisibility,
  type ManagedFileDto,
  type ManagedFileFolderDto,
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
  2: "Público (/download)",
};

function getVisibilityRowBorder(vis: FileVisibility): string {
  if (vis === 2) return "border-l-4 border-l-emerald-500";
  if (vis === 1) return "border-l-4 border-l-blue-500";
  return "border-l-4 border-l-slate-400 dark:border-l-slate-600";
}

function getFolderIconColor(vis: FileVisibility): string {
  if (vis === 2) return "text-emerald-500";
  if (vis === 1) return "text-blue-500";
  return "text-slate-500";
}

function renderVisibilityBadge(vis: FileVisibility) {
  if (vis === 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70">
        <Icon name="download" size={12} />
        <span>Público (/download)</span>
      </span>
    );
  }
  if (vis === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70">
        <span>Somente Agent</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200/80 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
      <Icon name="lock" size={12} />
      <span>Privado</span>
    </span>
  );
}

function defaultExpiryLocal(days = 7): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function FilesHubPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<HubTab>("files");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("");
  const [visFilter, setVisFilter] = useState<string>("");

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadFolderPath, setUploadFolderPath] = useState("/");
  const [uploadScope, setUploadScope] = useState<FileScope>(0);
  const [uploadClientId, setUploadClientId] = useState("");
  const [uploadSiteId, setUploadSiteId] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState<FileVisibility>(1);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderScope, setNewFolderScope] = useState<FileScope>(0);
  const [newFolderClientId, setNewFolderClientId] = useState("");
  const [newFolderSiteId, setNewFolderSiteId] = useState("");
  const [newFolderVisibility, setNewFolderVisibility] = useState<FileVisibility>(2);

  const [editingFolder, setEditingFolder] = useState<ManagedFileFolderDto | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderDesc, setEditFolderDesc] = useState("");
  const [editFolderVisibility, setEditFolderVisibility] = useState<FileVisibility>(2);

  // Edit/move file modal state
  const [editingFile, setEditingFile] = useState<ManagedFileDto | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editFileCategory, setEditFileCategory] = useState("");
  const [editFileDesc, setEditFileDesc] = useState("");
  const [editFileFolderPath, setEditFileFolderPath] = useState("/");
  const [editFileVisibility, setEditFileVisibility] = useState<FileVisibility>(1);

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
  const [ulTargetFolder, setUlTargetFolder] = useState("/recebidos");
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

  const isSearching = search.trim().length > 0;
  const statsQuery = useQuery({ queryKey: ["files-stats"], queryFn: getFileHubStats });
  const filesQuery = useQuery({
    queryKey: ["managed-files", currentFolder, search, scopeFilter, visFilter],
    queryFn: () =>
      listManagedFiles({
        folderPath: isSearching ? undefined : currentFolder,
        search: search || undefined,
        scope: scopeFilter !== "" ? (Number(scopeFilter) as FileScope) : undefined,
        visibility: visFilter !== "" ? (Number(visFilter) as FileVisibility) : undefined,
        pageSize: 100,
      }),
  });
  const foldersQuery = useQuery({
    queryKey: ["managed-folders", currentFolder, scopeFilter, visFilter],
    queryFn: () =>
      listManagedFolders({
        parentPath: currentFolder,
        scope: scopeFilter !== "" ? (Number(scopeFilter) as FileScope) : undefined,
        visibility: visFilter !== "" ? (Number(visFilter) as FileVisibility) : undefined,
      }),
    enabled: tab === "files" && !isSearching,
  });
  const allFoldersQuery = useQuery({
    queryKey: ["managed-folders-all"],
    queryFn: () => listManagedFolders({ includeAll: true }),
    enabled: tab === "files" || showUploadModal || showNewFolderModal || Boolean(editingFile) || showUploadLinkModal,
  });
  const shareFilesQuery = useQuery({
    queryKey: ["managed-files-share-picker"],
    queryFn: () => listManagedFiles({ pageSize: 200 }),
    enabled: showShareModal,
  });
  const shareLinksQuery = useQuery({ queryKey: ["file-share-links"], queryFn: listShareLinks, enabled: tab === "shares" });
  const uploadLinksQuery = useQuery({ queryKey: ["file-upload-links"], queryFn: listUploadLinks, enabled: tab === "uploads" });
  const logsQuery = useQuery({ queryKey: ["file-access-logs"], queryFn: () => listFileAccessLogs(), enabled: tab === "logs" });

  const clientsQuery = useQuery({
    queryKey: ["clients-minimal-files"],
    queryFn: () => api.get<ClientItem[]>("/api/v1/clients"),
  });
  const sitesQuery = useQuery({
    queryKey: ["sites-minimal-files"],
    queryFn: () => api.get<SiteItem[]>("/api/v1/sites"),
  });

  const filteredUploadSites = (sitesQuery.data || []).filter((s) => !uploadClientId || s.clientId === uploadClientId);
  const filteredNewFolderSites = (sitesQuery.data || []).filter((s) => !newFolderClientId || s.clientId === newFolderClientId);
  const filteredUlSites = (sitesQuery.data || []).filter((s) => !ulClientId || s.clientId === ulClientId);

  const uniqueFolderPaths = Array.from(
    new Set(["/", ...(allFoldersQuery.data || []).map((f) => f.path)]),
  ).sort((a, b) => a.localeCompare(b));

  const nonPublicFolderPaths = Array.from(
    new Set(["/recebidos", ...(allFoldersQuery.data || []).filter((f) => f.visibility !== 2).map((f) => f.path)]),
  ).sort((a, b) => a.localeCompare(b));

  const findFolderMeta = (path: string) =>
    (allFoldersQuery.data || []).find((f) => f.path.toLowerCase() === (path || "/").toLowerCase());

  const currentFolderMeta = currentFolder === "/" ? undefined : findFolderMeta(currentFolder);
  const selectedUploadFolder = uploadFolderPath === "/" ? undefined : findFolderMeta(uploadFolderPath);
  const selectedEditFileFolder = editFileFolderPath === "/" ? undefined : findFolderMeta(editFileFolderPath);

  const breadcrumbSegments = currentFolder === "/" ? [] : currentFolder.split("/").filter(Boolean);

  const copyLink = async (path: string, passcode?: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    const text = passcode ? `${fullUrl}\nCódigo/Senha: ${passcode}` : fullUrl;
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado para a área de transferência!");
  };

  const openUploadModal = () => {
    const folderMeta = (allFoldersQuery.data || []).find(
      (f) => f.path.toLowerCase() === currentFolder.toLowerCase(),
    );
    setUploadFolderPath(currentFolder);
    if (folderMeta) {
      setUploadScope(folderMeta.scope);
      setUploadClientId(folderMeta.clientId || "");
      setUploadSiteId(folderMeta.siteId || "");
      setUploadVisibility(folderMeta.visibility);
    } else {
      setUploadScope(0);
      setUploadClientId("");
      setUploadSiteId("");
      setUploadVisibility(1);
    }
    setShowUploadModal(true);
  };

  const openNewFolderModal = () => {
    const folderMeta = (allFoldersQuery.data || []).find(
      (f) => f.path.toLowerCase() === currentFolder.toLowerCase(),
    );
    if (folderMeta) {
      setNewFolderScope(folderMeta.scope);
      setNewFolderClientId(folderMeta.clientId || "");
      setNewFolderSiteId(folderMeta.siteId || "");
      setNewFolderVisibility(folderMeta.visibility);
    } else {
      setNewFolderScope(0);
      setNewFolderClientId("");
      setNewFolderSiteId("");
      setNewFolderVisibility(2);
    }
    setShowNewFolderModal(true);
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
          folderPath: uploadFolderPath || "/",
          scope: uploadScope,
          clientId: uploadScope >= 1 ? uploadClientId : null,
          siteId: uploadScope === 2 ? uploadSiteId : null,
          visibility: selectedUploadFolder ? selectedUploadFolder.visibility : uploadVisibility,
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
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
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
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["files-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast.error("Informe o nome da pasta.");
      return;
    }
    try {
      await createManagedFolder({
        name: newFolderName.trim(),
        parentPath: currentFolder,
        description: newFolderDesc.trim() || null,
        scope: newFolderScope,
        clientId: newFolderScope >= 1 ? newFolderClientId || null : null,
        siteId: newFolderScope === 2 ? newFolderSiteId || null : null,
        visibility: currentFolderMeta ? currentFolderMeta.visibility : newFolderVisibility,
      });
      toast.success("Pasta criada!");
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pasta.");
    }
  };

  const openEditFolderModal = (folder: ManagedFileFolderDto) => {
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderDesc(folder.description || "");
    setEditFolderVisibility(folder.visibility);
  };

  const handleEditFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder) return;
    if (
      editingFolder.parentPath === "/" &&
      editFolderVisibility !== editingFolder.visibility &&
      !window.confirm(
        `Alterar a visibilidade da pasta "${editingFolder.name}" para "${VISIBILITY_LABELS[editFolderVisibility]}" será aplicado em cascata para todas as subpastas e arquivos dentro dela. Deseja continuar?`,
      )
    ) {
      return;
    }
    try {
      await updateManagedFolder(editingFolder.id, {
        name: editFolderName.trim() || undefined,
        description: editFolderDesc.trim(),
        visibility: editingFolder.parentPath === "/" ? editFolderVisibility : undefined,
      });
      toast.success("Pasta atualizada!");
      setEditingFolder(null);
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
      qc.invalidateQueries({ queryKey: ["managed-files"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar pasta.");
    }
  };

  const handleDeleteFolder = async (folder: ManagedFileFolderDto) => {
    const msg =
      folder.fileCount > 0 || folder.subfolderCount > 0
        ? `Excluir a pasta "${folder.name}"? Os ${folder.fileCount} arquivo(s) e subpastas serão movidos para a pasta pai.`
        : `Excluir a pasta vazia "${folder.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteManagedFolder(folder.id, true);
      toast.success("Pasta excluída.");
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
      qc.invalidateQueries({ queryKey: ["managed-files"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir pasta.");
    }
  };

  const openEditFileModal = (file: ManagedFileDto) => {
    setEditingFile(file);
    setEditFileName(file.name);
    setEditFileCategory(file.category || "");
    setEditFileDesc(file.description || "");
    setEditFileFolderPath(file.folderPath || "/");
    setEditFileVisibility(file.visibility);
  };

  const handleEditFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile) return;
    try {
      await updateManagedFile(editingFile.id, {
        name: editFileName.trim() || undefined,
        category: editFileCategory.trim(),
        description: editFileDesc.trim(),
        folderPath: editFileFolderPath || "/",
        visibility: selectedEditFileFolder ? selectedEditFileFolder.visibility : editFileVisibility,
      });
      toast.success("Arquivo atualizado!");
      setEditingFile(null);
      qc.invalidateQueries({ queryKey: ["managed-files"] });
      qc.invalidateQueries({ queryKey: ["managed-folders"] });
      qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar arquivo.");
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
        targetFolderPath: ulTargetFolder.trim() || "/recebidos",
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
            onClick={openUploadModal}
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
            <button
              type="button"
              onClick={openNewFolderModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
            >
              <Icon name="create_new_folder" size={16} />
              <span>Nova Pasta</span>
            </button>
          </div>

          {!isSearching && (
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Icon
                  name="folder"
                  size={15}
                  className={currentFolderMeta ? getFolderIconColor(currentFolderMeta.visibility) : "text-amber-500"}
                />
                <button
                  type="button"
                  onClick={() => setCurrentFolder("/")}
                  className={`hover:underline font-medium ${currentFolder === "/" ? "text-slate-900 dark:text-slate-100" : "text-blue-600 dark:text-blue-400"}`}
                >
                  Raiz (/)
                </button>
                {breadcrumbSegments.map((seg, idx) => {
                  const path = `/${breadcrumbSegments.slice(0, idx + 1).join("/")}`;
                  const isLast = idx === breadcrumbSegments.length - 1;
                  return (
                    <span key={path} className="inline-flex items-center gap-1.5">
                      <Icon name="chevron_right" size={14} className="text-slate-400" />
                      {isLast ? (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{seg}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentFolder(path)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          {seg}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              {currentFolderMeta && (
                <div className="flex items-center gap-2">
                  {renderVisibilityBadge(currentFolderMeta.visibility)}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {currentFolderMeta.visibility === 2
                      ? "Todos os itens aqui aparecem em /download"
                      : "Invisível em /download (herdado nos novos uploads)"}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Arquivo / Pasta</th>
                  <th className="px-4 py-3">Escopo</th>
                  <th className="px-4 py-3">Visibilidade</th>
                  <th className="px-4 py-3">Tamanho / Itens</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {!isSearching &&
                  (foldersQuery.data || []).map((folder) => (
                    <tr
                      key={`folder-${folder.scope}-${folder.clientId || ""}-${folder.siteId || ""}-${folder.path}`}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${getVisibilityRowBorder(folder.visibility)}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setCurrentFolder(folder.path)}
                          className="flex items-center gap-2 text-left font-medium hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <Icon name="folder" size={18} className={`${getFolderIconColor(folder.visibility)} shrink-0`} />
                          <span>{folder.name}</span>
                        </button>
                        {folder.description && (
                          <div className="text-xs text-slate-500 ml-6 truncate max-w-md">{folder.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                          {SCOPE_LABELS[folder.scope]}
                          {folder.clientName ? ` • ${folder.clientName}` : ""}
                          {folder.siteName ? ` / ${folder.siteName}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{renderVisibilityBadge(folder.visibility)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {folder.fileCount} {folder.fileCount === 1 ? "arquivo" : "arquivos"}
                        {folder.subfolderCount > 0 ? ` • ${folder.subfolderCount} subpasta(s)` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">-</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {folder.visibility === 2 && (
                          <button
                            type="button"
                            onClick={() => copyLink(`/download?folder=${encodeURIComponent(folder.path)}`)}
                            className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
                          >
                            Link /download
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCurrentFolder(folder.path)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Abrir
                        </button>
                        {!folder.isVirtual && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditFolderModal(folder)}
                              className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFolder(folder)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                {(filesQuery.data?.items || []).map((f) => (
                  <tr key={f.id} className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${getVisibilityRowBorder(f.visibility)}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{f.name}</span>
                        {isSearching && f.folderPath && f.folderPath !== "/" && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearch("");
                              setCurrentFolder(f.folderPath);
                            }}
                            className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-mono hover:underline"
                          >
                            {f.folderPath}
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{f.fileName}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        {SCOPE_LABELS[f.scope]}
                        {f.clientName ? ` • ${f.clientName}` : ""}
                        {f.siteName ? ` / ${f.siteName}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{renderVisibilityBadge(f.visibility)}</td>
                    <td className="px-4 py-3 text-xs">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs">{f.downloadCount}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditFileModal(f)}
                        className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
                      >
                        Editar/Mover
                      </button>
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
                {(filesQuery.data?.items || []).length === 0 && (isSearching || (foldersQuery.data || []).length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      Nenhum arquivo ou pasta encontrado.
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
            <div>
              <label className="text-xs text-slate-500">Pasta de destino</label>
              <select
                value={uploadFolderPath}
                onChange={(e) => {
                  const nextPath = e.target.value;
                  setUploadFolderPath(nextPath);
                  const meta = nextPath === "/" ? undefined : findFolderMeta(nextPath);
                  if (meta) {
                    setUploadVisibility(meta.visibility);
                    setUploadScope(meta.scope);
                    setUploadClientId(meta.clientId || "");
                    setUploadSiteId(meta.siteId || "");
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {Array.from(new Set([uploadFolderPath || "/", ...uniqueFolderPaths])).map((p) => (
                  <option key={p} value={p}>{p === "/" ? "/ (Raiz)" : p}</option>
                ))}
              </select>
            </div>
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
              <div>
                <select
                  value={selectedUploadFolder ? selectedUploadFolder.visibility : uploadVisibility}
                  onChange={(e) => setUploadVisibility(Number(e.target.value) as FileVisibility)}
                  disabled={Boolean(selectedUploadFolder)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
                >
                  <option value={2}>Público (/download + Agent)</option>
                  <option value={1}>Somente Agent</option>
                  <option value={0}>Privado (Links/Admin)</option>
                </select>
                {selectedUploadFolder && (
                  <div className="text-[11px] text-slate-500 mt-1">Herdado da pasta selecionada</div>
                )}
              </div>
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
              {(shareFilesQuery.data?.items || filesQuery.data?.items || []).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                  <input
                    type="checkbox"
                    checked={shareFileIds.includes(f.id)}
                    onChange={(e) =>
                      setShareFileIds((prev) => (e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)))
                    }
                  />
                  <span className="truncate">
                    {f.folderPath && f.folderPath !== "/" ? `[${f.folderPath}] ` : ""}
                    {f.name} ({formatBytes(f.sizeBytes)})
                  </span>
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
            <div>
              <label className="text-xs text-slate-500">Pasta de destino dos uploads</label>
              <input
                type="text"
                list="filehub-folder-options"
                value={ulTargetFolder}
                onChange={(e) => setUlTargetFolder(e.target.value)}
                placeholder="/recebidos"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <datalist id="filehub-folder-options">
                {nonPublicFolderPaths.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="text-[11px] text-slate-500 mt-1">
                Por segurança, links de upload aceitam apenas pastas privadas (ex.: /recebidos).
              </div>
            </div>
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

      {/* Modal: Nova Pasta */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolderSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Nova Pasta</h2>
            <div className="text-xs text-slate-500">
              Será criada dentro de: <span className="font-mono">{currentFolder}</span>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta (ex.: Drivers, Instaladores)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
              autoFocus
            />
            <textarea
              value={newFolderDesc}
              onChange={(e) => setNewFolderDesc(e.target.value)}
              placeholder="Descrição opcional..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newFolderScope}
                onChange={(e) => setNewFolderScope(Number(e.target.value) as FileScope)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value={0}>Global</option>
                <option value={1}>Cliente</option>
                <option value={2}>Site</option>
              </select>
              <div>
                <select
                  value={currentFolderMeta ? currentFolderMeta.visibility : newFolderVisibility}
                  onChange={(e) => setNewFolderVisibility(Number(e.target.value) as FileVisibility)}
                  disabled={Boolean(currentFolderMeta)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
                >
                  <option value={2}>Público (/download + Agent)</option>
                  <option value={1}>Somente Agent</option>
                  <option value={0}>Privado</option>
                </select>
                {currentFolderMeta && (
                  <div className="text-[11px] text-slate-500 mt-1">
                    Herdado da pasta pai — subpastas seguem a visibilidade da pasta raiz.
                  </div>
                )}
              </div>
            </div>
            {newFolderScope >= 1 && (
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newFolderClientId}
                  onChange={(e) => { setNewFolderClientId(e.target.value); setNewFolderSiteId(""); }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  required
                >
                  <option value="">Selecione o Cliente</option>
                  {(clientsQuery.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {newFolderScope === 2 && (
                  <select
                    value={newFolderSiteId}
                    onChange={(e) => setNewFolderSiteId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    required
                  >
                    <option value="">Selecione o Site</option>
                    {filteredNewFolderSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewFolderModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium">
                Criar Pasta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Renomear/Editar Pasta */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleEditFolderSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Editar Pasta</h2>
            <input
              type="text"
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              placeholder="Nome da pasta"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
            />
            <textarea
              value={editFolderDesc}
              onChange={(e) => setEditFolderDesc(e.target.value)}
              placeholder="Descrição opcional..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div>
              <select
                value={editFolderVisibility}
                onChange={(e) => setEditFolderVisibility(Number(e.target.value) as FileVisibility)}
                disabled={editingFolder.parentPath !== "/"}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
              >
                <option value={2}>Público (/download + Agent)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado</option>
              </select>
              {editingFolder.parentPath !== "/" ? (
                <div className="text-[11px] text-slate-500 mt-1">
                  A visibilidade de subpastas é herdada da pasta raiz.
                </div>
              ) : editFolderVisibility !== editingFolder.visibility ? (
                <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  A alteração de visibilidade será aplicada em cascata para todas as subpastas e arquivos dentro desta pasta.
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingFolder(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Editar / Mover Arquivo */}
      {editingFile && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleEditFileSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold">Editar / Mover Arquivo</h2>
            <input
              type="text"
              value={editFileName}
              onChange={(e) => setEditFileName(e.target.value)}
              placeholder="Nome de exibição"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              required
            />
            <div>
              <label className="text-xs text-slate-500">Pasta</label>
              <select
                value={editFileFolderPath}
                onChange={(e) => {
                  const nextPath = e.target.value;
                  setEditFileFolderPath(nextPath);
                  const meta = nextPath === "/" ? undefined : findFolderMeta(nextPath);
                  if (meta) {
                    setEditFileVisibility(meta.visibility);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {Array.from(new Set([editFileFolderPath || "/", ...uniqueFolderPaths])).map((p) => (
                  <option key={p} value={p}>{p === "/" ? "/ (Raiz)" : p}</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={editFileCategory}
              onChange={(e) => setEditFileCategory(e.target.value)}
              placeholder="Categoria"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <textarea
              value={editFileDesc}
              onChange={(e) => setEditFileDesc(e.target.value)}
              placeholder="Descrição"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div>
              <select
                value={selectedEditFileFolder ? selectedEditFileFolder.visibility : editFileVisibility}
                onChange={(e) => setEditFileVisibility(Number(e.target.value) as FileVisibility)}
                disabled={Boolean(selectedEditFileFolder)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
              >
                <option value={2}>Público (/download + Agent)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado</option>
              </select>
              {selectedEditFileFolder && (
                <div className="text-[11px] text-slate-500 mt-1">Herdado da pasta selecionada</div>
              )}
              {selectedEditFileFolder && selectedEditFileFolder.visibility !== editingFile.visibility && (
                <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  Ao mover para esta pasta, a visibilidade mudará de{" "}
                  <strong>{VISIBILITY_LABELS[editingFile.visibility]}</strong> para{" "}
                  <strong>{VISIBILITY_LABELS[selectedEditFileFolder.visibility]}</strong>.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingFile(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

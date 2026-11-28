import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createManagedFolder,
  createShareLink,
  createUploadLink,
  deleteManagedFile,
  deleteManagedFolder,
  getManagedFileDownloadUrl,
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
import { ticketsApi } from "@/api/tickets";
import { formatBytes } from "@/pages/public/PublicPortalLayout";
import { Icon } from "@/components/ui/Icon";
import {
  FILE_ACTION_BTN,
  FILE_ACTION_BTN_DANGER,
  FILE_ACTION_BTN_PRIMARY,
} from "@/components/files/fileActionStyles";

interface ScopedFilesTabProps {
  scope: 1 | 2; // 1 = Client, 2 = Site
  clientId: string;
  siteId?: string;
  entityName: string;
}

type ScopedSubTab = "files" | "shares" | "uploads";

const VISIBILITY_LABELS: Record<FileVisibility, string> = {
  0: "Privado",
  1: "Somente Agent",
  2: "Público (/download + Agent)",
  3: "Somente Página Web (/download)",
};

function isWebPublicVisibility(vis: FileVisibility): boolean {
  return vis === 2 || vis === 3;
}

function getVisibilityRowBorder(vis: FileVisibility): string {
  if (vis === 2) return "border-l-4 border-l-emerald-500";
  if (vis === 3) return "border-l-4 border-l-teal-500";
  if (vis === 1) return "border-l-4 border-l-blue-500";
  return "border-l-4 border-l-slate-400 dark:border-l-slate-600";
}

function getFolderIconColor(vis: FileVisibility): string {
  if (vis === 2) return "text-emerald-500";
  if (vis === 3) return "text-teal-500";
  if (vis === 1) return "text-blue-500";
  return "text-slate-500";
}

function renderVisibilityBadge(vis: FileVisibility) {
  if (vis === 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70">
        <Icon name="download" size={12} />
        <span>Público (/download + Agent)</span>
      </span>
    );
  }
  if (vis === 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70">
        <Icon name="download" size={12} />
        <span>Somente Página Web</span>
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

function generateRandomPasscode(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const UPLOAD_FILE_TYPE_PRESETS: { label: string; extensions: string[]; mimes: string[] }[] = [
  { label: "Imagens", extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif"], mimes: ["image/*"] },
  { label: "PDF", extensions: [".pdf"], mimes: ["application/pdf"] },
  {
    label: "Documentos Office",
    extensions: [".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"],
    mimes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ],
  },
  { label: "Compactados", extensions: [".zip", ".7z", ".rar", ".tar", ".gz"], mimes: ["application/zip", "application/x-7z-compressed", "application/gzip"] },
  { label: "Logs / Diagnóstico", extensions: [".log", ".txt", ".json", ".xml", ".evtx", ".dmp"], mimes: ["text/plain", "application/json", "application/xml"] },
  { label: "Instaladores", extensions: [".exe", ".msi", ".msix"], mimes: ["application/x-msdownload", "application/x-msi"] },
];

export function ScopedFilesTab({ scope, clientId, siteId, entityName }: ScopedFilesTabProps) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<ScopedSubTab>("files");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [search, setSearch] = useState("");
  const [visFilter, setVisFilter] = useState<string>("");
  // Link de upload cujos arquivos recebidos estão sendo exibidos na aba Arquivos
  // ("Ver arquivos" na aba de Links de Upload).
  const [linkFilter, setLinkFilter] = useState<{ id: string; title: string } | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadFolderPath, setUploadFolderPath] = useState("/");
  const [uploadVisibility, setUploadVisibility] = useState<FileVisibility>(1);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderVisibility, setNewFolderVisibility] = useState<FileVisibility>(1);

  const [editingFolder, setEditingFolder] = useState<ManagedFileFolderDto | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderDesc, setEditFolderDesc] = useState("");
  const [editFolderVisibility, setEditFolderVisibility] = useState<FileVisibility>(1);

  // Edit/move file modal
  const [editingFile, setEditingFile] = useState<ManagedFileDto | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editFileCategory, setEditFileCategory] = useState("");
  const [editFileDesc, setEditFileDesc] = useState("");
  const [editFileFolderPath, setEditFileFolderPath] = useState("/");
  const [editFileVisibility, setEditFileVisibility] = useState<FileVisibility>(1);

  // Share link modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareMode, setShareMode] = useState<"folder" | "file">("folder");
  const [shareFolderPath, setShareFolderPath] = useState("");
  const [shareFileFolderFilter, setShareFileFolderFilter] = useState("/");
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
  const [ulTicketId, setUlTicketId] = useState("");
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
  const scopeParams = {
    scope: scope as FileScope,
    clientId,
    siteId: scope === 2 ? siteId : undefined,
  };

  const filesQuery = useQuery({
    queryKey: ["scoped-managed-files", scope, clientId, siteId, currentFolder, search, visFilter, linkFilter?.id],
    queryFn: () =>
      listManagedFiles({
        ...scopeParams,
        // Com filtro de link ativo, pasta/busca não se aplicam: o objetivo é
        // ver TODOS os arquivos recebidos por aquele link.
        folderPath: linkFilter || isSearching ? undefined : currentFolder,
        search: linkFilter ? undefined : search || undefined,
        sourceUploadLinkId: linkFilter?.id,
        visibility: visFilter !== "" ? (Number(visFilter) as FileVisibility) : undefined,
        pageSize: 100,
      }),
  });

  const foldersQuery = useQuery({
    queryKey: ["scoped-managed-folders", scope, clientId, siteId, currentFolder, visFilter],
    queryFn: () =>
      listManagedFolders({
        ...scopeParams,
        parentPath: currentFolder,
        visibility: visFilter !== "" ? (Number(visFilter) as FileVisibility) : undefined,
      }),
    enabled: subTab === "files" && !isSearching && !linkFilter,
  });

  const allFoldersQuery = useQuery({
    queryKey: ["scoped-managed-folders-all", scope, clientId, siteId],
    queryFn: () => listManagedFolders({ ...scopeParams, includeAll: true }),
    enabled: subTab === "files" || showUploadModal || showNewFolderModal || showShareModal || Boolean(editingFile) || showUploadLinkModal,
  });

  const shareFilesQuery = useQuery({
    queryKey: ["scoped-share-picker", scope, clientId, siteId, shareFileFolderFilter],
    queryFn: () => listManagedFiles({ ...scopeParams, folderPath: shareFileFolderFilter || "/", pageSize: 200 }),
    enabled: showShareModal && shareMode === "file",
  });

  const shareLinksQuery = useQuery({
    queryKey: ["scoped-file-share-links", clientId, siteId],
    queryFn: () => listShareLinks({ clientId, siteId: scope === 2 ? siteId : undefined }),
    enabled: subTab === "shares",
  });

  const uploadLinksQuery = useQuery({
    queryKey: ["scoped-file-upload-links", clientId, siteId],
    queryFn: () => listUploadLinks({ clientId, siteId: scope === 2 ? siteId : undefined }),
    enabled: subTab === "uploads",
  });

  const ticketsQuery = useQuery({
    queryKey: ["scoped-tickets-for-upload-link", clientId, siteId],
    queryFn: () => ticketsApi.list({ limit: 50, clientId, siteId: scope === 2 ? siteId : undefined }),
    enabled: showUploadLinkModal,
  });

  const uniqueFolderPaths = Array.from(
    new Set(["/", ...(allFoldersQuery.data || []).map((f) => f.path)]),
  ).sort((a, b) => a.localeCompare(b));

  const nonPublicFolderPaths = Array.from(
    new Set(["/recebidos", ...(allFoldersQuery.data || []).filter((f) => !isWebPublicVisibility(f.visibility)).map((f) => f.path)]),
  ).sort((a, b) => a.localeCompare(b));

  const shareableFolders = (allFoldersQuery.data || []).filter((f) => f.path !== "/");
  const findFolderMeta = (path: string) =>
    (allFoldersQuery.data || []).find((f) => f.path.toLowerCase() === (path || "/").toLowerCase());

  const currentFolderMeta = currentFolder === "/" ? undefined : findFolderMeta(currentFolder);
  const selectedUploadFolder = uploadFolderPath === "/" ? undefined : findFolderMeta(uploadFolderPath);
  const selectedEditFileFolder = editFileFolderPath === "/" ? undefined : findFolderMeta(editFileFolderPath);
  const breadcrumbSegments = currentFolder === "/" ? [] : currentFolder.split("/").filter(Boolean);

  // "Ver arquivos": leva para a aba Arquivos já filtrada pelos arquivos que este
  // link de upload recebeu — sem precisar procurar na pasta de destino.
  const openUploadedFiles = (link: { id: string; title: string }) => {
    setLinkFilter({ id: link.id, title: link.title });
    setSearch("");
    setCurrentFolder("/");
    // Os arquivos recebidos por um link são Visibility=Private: um filtro de
    // visibilidade ativo esconderia exatamente o que o usuário pediu para ver.
    setVisFilter("");
    setSubTab("files");
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["scoped-managed-files"] });
    qc.invalidateQueries({ queryKey: ["scoped-managed-folders"] });
    qc.invalidateQueries({ queryKey: ["scoped-managed-folders-all"] });
    qc.invalidateQueries({ queryKey: ["managed-files"] });
    qc.invalidateQueries({ queryKey: ["managed-folders"] });
    qc.invalidateQueries({ queryKey: ["managed-folders-all"] });
    qc.invalidateQueries({ queryKey: ["files-stats"] });
  };

  const copyLink = async (path: string, passcode?: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    const text = passcode ? `${fullUrl}\nCódigo/Senha: ${passcode}` : fullUrl;
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado para a área de transferência!");
  };

  const openUploadModal = () => {
    setUploadFolderPath(currentFolder);
    setUploadVisibility(currentFolderMeta ? currentFolderMeta.visibility : 1);
    setShowUploadModal(true);
  };

  const openNewFolderModal = () => {
    setNewFolderVisibility(currentFolderMeta ? currentFolderMeta.visibility : 1);
    setShowNewFolderModal(true);
  };

  const openShareForFile = (file: ManagedFileDto) => {
    setShareMode("file");
    setShareFolderPath("");
    setShareFileFolderFilter(file.folderPath || "/");
    setShareFileIds([file.id]);
    setShareTitle(`Download: ${file.name}`);
    setShowShareModal(true);
  };

  const openShareForFolder = (folder: ManagedFileFolderDto) => {
    setShareMode("folder");
    setShareFolderPath(folder.path);
    setShareFileIds([]);
    setShareTitle(`Pasta: ${folder.name}`);
    setShowShareModal(true);
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
          scope,
          clientId,
          siteId: scope === 2 ? siteId || null : null,
          visibility: selectedUploadFolder ? selectedUploadFolder.visibility : uploadVisibility,
        },
        setUploadProgress,
      );
      toast.success("Arquivo enviado!");
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName("");
      setUploadDesc("");
      setUploadProgress(null);
      invalidateAll();
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
      invalidateAll();
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
        scope,
        clientId,
        siteId: scope === 2 ? siteId || null : null,
        visibility: currentFolderMeta ? currentFolderMeta.visibility : newFolderVisibility,
      });
      toast.success("Pasta criada!");
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      invalidateAll();
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
      if (editingFolder.isVirtual) {
        await createManagedFolder({
          name: editFolderName.trim() || editingFolder.name,
          parentPath: editingFolder.parentPath,
          description: editFolderDesc.trim() || null,
          scope: editingFolder.scope,
          clientId: editingFolder.clientId || null,
          siteId: editingFolder.siteId || null,
          visibility: editFolderVisibility,
        });
      } else {
        await updateManagedFolder(editingFolder.id, {
          name: editFolderName.trim() || undefined,
          description: editFolderDesc.trim(),
          visibility: editingFolder.parentPath === "/" ? editFolderVisibility : undefined,
        });
      }
      toast.success("Pasta atualizada!");
      setEditingFolder(null);
      invalidateAll();
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
      invalidateAll();
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
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar arquivo.");
    }
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shareMode === "folder" && !shareFolderPath) {
      toast.error("Selecione uma pasta específica para compartilhar.");
      return;
    }
    if (shareMode === "file" && shareFileIds.length === 0) {
      toast.error("Selecione ao menos um arquivo.");
      return;
    }
    try {
      const created = await createShareLink({
        title: shareTitle.trim() || "Arquivos Compartilhados",
        message: shareMessage.trim() || null,
        clientId,
        siteId: scope === 2 ? siteId || null : null,
        fileIds: shareMode === "file" ? shareFileIds : undefined,
        folderPath: shareMode === "folder" ? shareFolderPath : null,
        folderScope: shareMode === "folder" ? scope : null,
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
      setSubTab("shares");
      qc.invalidateQueries({ queryKey: ["scoped-file-share-links"] });
      qc.invalidateQueries({ queryKey: ["file-share-links"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar link.");
    }
  };

  const handleCreateUploadLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createUploadLink({
        title: ulTitle.trim() || `Envio de Arquivos - ${entityName}`,
        description: ulDesc.trim() || null,
        clientId,
        siteId: scope === 2 ? siteId || null : null,
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
        ticketId: ulTicketId || null,
      });
      await copyLink(`/download/upload/${created.shortCode}`, ulRequirePasscode ? ulPasscode.trim() : undefined);
      setShowUploadLinkModal(false);
      setUlTitle("");
      setUlDesc("");
      setUlTicketId("");
      setUlPasscode("");
      setSubTab("uploads");
      qc.invalidateQueries({ queryKey: ["scoped-file-upload-links"] });
      qc.invalidateQueries({ queryKey: ["file-upload-links"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar link de upload.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 text-sm">
          {(
            [
              ["files", "Arquivos e Pastas"],
              ["shares", "Links de Download"],
              ["uploads", "Links de Upload (File Drop)"],
            ] as [ScopedSubTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`pb-2 border-b-2 font-medium transition-colors ${
                subTab === key
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowUploadLinkModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Icon name="drive_folder_upload" size={16} />
            <span>Solicitar Upload</span>
          </button>
          <button
            type="button"
            onClick={openNewFolderModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 text-xs font-semibold"
          >
            <Icon name="create_new_folder" size={16} />
            <span>Nova Pasta</span>
          </button>
          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm"
          >
            <Icon name="upload" size={16} />
            <span>Enviar Arquivo</span>
          </button>
        </div>
      </div>

      {subTab === "files" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar arquivos..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
            <select
              value={visFilter}
              onChange={(e) => setVisFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">Todas visibilidades</option>
              <option value="2">Público (/download + Agent)</option>
              <option value="3">Somente Página Web (/download)</option>
              <option value="1">Somente Agent</option>
              <option value="0">Privado</option>
            </select>
          </div>

          {linkFilter && (
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-3.5 py-2.5 text-blue-800 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <Icon name="filter_alt" size={15} />
                <span>
                  Mostrando os arquivos recebidos pelo link <strong>{linkFilter.title}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLinkFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/70 font-medium"
              >
                <Icon name="close" size={13} />
                <span>Limpar filtro</span>
              </button>
            </div>
          )}

          {!isSearching && !linkFilter && (
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {currentFolder !== "/" && (
                  <button
                    type="button"
                    onClick={() => {
                      const parent = breadcrumbSegments.length <= 1 ? "/" : `/${breadcrumbSegments.slice(0, -1).join("/")}`;
                      setCurrentFolder(parent);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 mr-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                  >
                    <Icon name="arrow_back" size={13} />
                    <span>Voltar</span>
                  </button>
                )}
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
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Arquivo / Pasta</th>
                  <th className="px-4 py-3">Visibilidade</th>
                  <th className="px-4 py-3">Tamanho / Itens</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {!isSearching && !linkFilter &&
                  (foldersQuery.data || []).map((folder) => (
                    <tr
                      key={`folder-${folder.path}`}
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
                      <td className="px-4 py-3 text-xs">{renderVisibilityBadge(folder.visibility)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {folder.fileCount} {folder.fileCount === 1 ? "arquivo" : "arquivos"}
                        {folder.subfolderCount > 0 ? ` • ${folder.subfolderCount} subpasta(s)` : ""}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">-</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openShareForFolder(folder)}
                            className={FILE_ACTION_BTN_PRIMARY}
                          >
                            Compartilhar
                          </button>
                          <button
                            type="button"
                            onClick={() => setCurrentFolder(folder.path)}
                            className={FILE_ACTION_BTN}
                          >
                            Abrir
                          </button>
                          {(!folder.isVirtual || folder.parentPath === "/") && (
                            <button
                              type="button"
                              onClick={() => openEditFolderModal(folder)}
                              className={FILE_ACTION_BTN}
                            >
                              Editar
                            </button>
                          )}
                          {!folder.isVirtual && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFolder(folder)}
                              className={FILE_ACTION_BTN_DANGER}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
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
                    <td className="px-4 py-3 text-xs">{renderVisibilityBadge(f.visibility)}</td>
                    <td className="px-4 py-3 text-xs">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-4 py-3 text-xs">{f.downloadCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openEditFileModal(f)}
                          className={FILE_ACTION_BTN}
                        >
                          Editar/Mover
                        </button>
                        <button
                          type="button"
                          onClick={() => openShareForFile(f)}
                          className={FILE_ACTION_BTN_PRIMARY}
                        >
                          Compartilhar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(f)}
                          className={FILE_ACTION_BTN}
                        >
                          Baixar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(f)}
                          className={FILE_ACTION_BTN_DANGER}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(filesQuery.data?.items || []).length === 0 && (isSearching || linkFilter || (foldersQuery.data || []).length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500 text-sm">
                      {linkFilter
                        ? "Nenhum arquivo recebido por este link até agora."
                        : isSearching
                          ? "Nenhum arquivo encontrado para a busca."
                          : `Nenhum arquivo ou pasta vinculado a ${entityName} neste local.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "shares" && (
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{l.title}</span>
                      {l.folderPath && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-mono">
                          <Icon name="folder" size={12} />
                          <span>{l.folderPath}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      /download/share/{l.shortCode} {l.requirePasscode ? "• 🔒 Com senha" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.files.length}</td>
                  <td className="px-4 py-3 text-xs">{new Date(l.expiresAtUtc).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-xs">{l.downloadCount}{l.maxDownloads ? ` / ${l.maxDownloads}` : ""}</td>
                  <td className="px-4 py-3 text-xs">{l.isRevoked ? "Revogado" : l.isExpired ? "Expirado" : "Ativo"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                      <button type="button" onClick={() => copyLink(`/download/share/${l.shortCode}`)} className={FILE_ACTION_BTN_PRIMARY}>
                        Copiar Link
                      </button>
                      {!l.isRevoked && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeShareLink(l.id);
                            qc.invalidateQueries({ queryKey: ["scoped-file-share-links"] });
                            toast.success("Link revogado.");
                          }}
                          className={FILE_ACTION_BTN_DANGER}
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(shareLinksQuery.data || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    Nenhum link de download criado para {entityName}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "uploads" && (
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
                    {l.uploadedFilesCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => openUploadedFiles(l)}
                        className="hover:underline font-medium text-blue-600 dark:text-blue-400"
                        title="Ver os arquivos recebidos por este link"
                      >
                        {l.uploadedFilesCount} ({formatBytes(l.uploadedTotalBytes)})
                      </button>
                    ) : (
                      <span>{l.uploadedFilesCount} ({formatBytes(l.uploadedTotalBytes)})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{new Date(l.expiresAtUtc).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-xs">{l.isRevoked ? "Revogado" : l.isExpired ? "Expirado" : "Ativo"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                      {l.uploadedFilesCount > 0 && (
                        <button type="button" onClick={() => openUploadedFiles(l)} className={FILE_ACTION_BTN}>
                          Ver arquivos ({l.uploadedFilesCount})
                        </button>
                      )}
                      <button type="button" onClick={() => copyLink(`/download/upload/${l.shortCode}`)} className={FILE_ACTION_BTN_PRIMARY}>
                        Copiar Link
                      </button>
                      {!l.isRevoked && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeUploadLink(l.id);
                            qc.invalidateQueries({ queryKey: ["scoped-file-upload-links"] });
                            toast.success("Link revogado.");
                          }}
                          className={FILE_ACTION_BTN_DANGER}
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(uploadLinksQuery.data || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    Nenhum link de upload criado para {entityName}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Upload de Arquivo */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleUploadSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Enviar Arquivo — {entityName}</h2>
              <button type="button" onClick={() => setShowUploadModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
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
              placeholder="Categoria (opcional)"
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
                  if (meta) setUploadVisibility(meta.visibility);
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
            <div>
              <select
                value={selectedUploadFolder ? selectedUploadFolder.visibility : uploadVisibility}
                onChange={(e) => setUploadVisibility(Number(e.target.value) as FileVisibility)}
                disabled={Boolean(selectedUploadFolder)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
              >
                <option value={2}>Público (/download + Agent)</option>
                <option value={3}>Somente Página Web (/download)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado (Links/Admin)</option>
              </select>
              {selectedUploadFolder && (
                <div className="text-[11px] text-slate-500 mt-1">Herdado da pasta selecionada</div>
              )}
            </div>
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

      {/* Modal: Nova Pasta */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolderSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Nova Pasta — {entityName}</h2>
              <button type="button" onClick={() => setShowNewFolderModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Será criada dentro de: <span className="font-mono">{currentFolder}</span>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta"
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
            <div>
              <select
                value={currentFolderMeta ? currentFolderMeta.visibility : newFolderVisibility}
                onChange={(e) => setNewFolderVisibility(Number(e.target.value) as FileVisibility)}
                disabled={Boolean(currentFolderMeta)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
              >
                <option value={2}>Público (/download + Agent)</option>
                <option value={3}>Somente Página Web (/download)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado</option>
              </select>
              {currentFolderMeta && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Herdado da pasta pai — subpastas seguem a visibilidade da pasta raiz.
                </div>
              )}
            </div>
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

      {/* Modal: Editar Pasta */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleEditFolderSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Editar Pasta</h2>
              <button type="button" onClick={() => setEditingFolder(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
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
                <option value={3}>Somente Página Web (/download)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado</option>
              </select>
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
          <form onSubmit={handleEditFileSubmit} className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Editar / Mover Arquivo</h2>
              <button type="button" onClick={() => setEditingFile(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
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
                  if (meta) setEditFileVisibility(meta.visibility);
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
                <option value={3}>Somente Página Web (/download)</option>
                <option value={1}>Somente Agent</option>
                <option value={0}>Privado</option>
              </select>
              {selectedEditFileFolder && (
                <div className="text-[11px] text-slate-500 mt-1">Herdado da pasta selecionada</div>
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

      {/* Modal: Criar Link de Download */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateShareLink} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Criar Link de Download</h2>
              <button type="button" onClick={() => setShowShareModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setShareMode("folder")}
                className={`py-1.5 rounded-lg ${shareMode === "folder" ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600" : ""}`}
              >
                Pasta específica (dinâmico)
              </button>
              <button
                type="button"
                onClick={() => setShareMode("file")}
                className={`py-1.5 rounded-lg ${shareMode === "file" ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600" : ""}`}
              >
                Arquivo(s) de uma pasta
              </button>
            </div>
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
              placeholder="Mensagem opcional..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            {shareMode === "folder" ? (
              <select
                value={shareFolderPath}
                onChange={(e) => setShareFolderPath(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                required
              >
                <option value="">Selecione uma pasta específica...</option>
                {shareableFolders.map((f) => (
                  <option key={f.path} value={f.path}>{f.path} ({f.fileCount})</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <select
                  value={shareFileFolderFilter}
                  onChange={(e) => { setShareFileFolderFilter(e.target.value); setShareFileIds([]); }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {uniqueFolderPaths.map((p) => (
                    <option key={p} value={p}>{p === "/" ? "/ (Raiz)" : p}</option>
                  ))}
                </select>
                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-1">
                  {(shareFilesQuery.data?.items || []).map((f) => (
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
              </div>
            )}
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sharePasscode}
                  onChange={(e) => setSharePasscode(e.target.value)}
                  placeholder="Digite o código/contra-senha"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setSharePasscode(generateRandomPasscode(10))}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium shrink-0"
                >
                  Gerar
                </button>
              </div>
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

      {/* Modal: Solicitar Upload (File Drop) */}
      {showUploadLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateUploadLink} className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Solicitar Upload — {entityName}</h2>
              <button type="button" onClick={() => setShowUploadLinkModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <Icon name="close" size={18} />
              </button>
            </div>
            <input
              type="text"
              value={ulTitle}
              onChange={(e) => setUlTitle(e.target.value)}
              placeholder={`Título (ex.: Envio de Arquivos - ${entityName})`}
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
                list="scoped-folder-options"
                value={ulTargetFolder}
                onChange={(e) => setUlTargetFolder(e.target.value)}
                placeholder="/recebidos"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <datalist id="scoped-folder-options">
                {nonPublicFolderPaths.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-slate-500">Vincular a um chamado (opcional)</label>
              <select
                value={ulTicketId}
                onChange={(e) => setUlTicketId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">Nenhum chamado vinculado</option>
                {(ticketsQuery.data?.items || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">Tipos permitidos (presets)</span>
                {(ulExtensions || ulMimes) && (
                  <button type="button" onClick={() => { setUlExtensions(""); setUlMimes(""); }} className="text-[11px] text-slate-500 underline">
                    Limpar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {UPLOAD_FILE_TYPE_PRESETS.map((preset) => {
                  const currentExts = ulExtensions.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                  const active = preset.extensions.every((ext) => currentExts.includes(ext));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const nextExts = new Set(currentExts);
                        const nextMimes = new Set(ulMimes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
                        if (active) {
                          preset.extensions.forEach((e) => nextExts.delete(e));
                          preset.mimes.forEach((m) => nextMimes.delete(m));
                        } else {
                          preset.extensions.forEach((e) => nextExts.add(e));
                          preset.mimes.forEach((m) => nextMimes.add(m));
                        }
                        setUlExtensions(Array.from(nextExts).join(", "));
                        setUlMimes(Array.from(nextMimes).join(", "));
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${active ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 dark:border-slate-700"}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={ulExtensions}
                onChange={(e) => setUlExtensions(e.target.value)}
                placeholder="Extensões permitidas (vazio = todas)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                type="text"
                value={ulMimes}
                onChange={(e) => setUlMimes(e.target.value)}
                placeholder="MIMEs permitidos (vazio = todos)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ulPasscode}
                  onChange={(e) => setUlPasscode(e.target.value)}
                  placeholder="Digite o código/contra-senha"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setUlPasscode(generateRandomPasscode(10))}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium shrink-0"
                >
                  Gerar
                </button>
              </div>
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

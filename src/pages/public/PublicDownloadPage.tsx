import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getPublicFileDownloadUrl, getPublicPortal, getZeroTouchDownloadUrl } from "@/api/publicDownloads";
import { PublicPortalLayout, formatBytes } from "./PublicPortalLayout";
import { Icon } from "@/components/ui/Icon";

function normalizeFolder(path?: string | null): string {
  if (!path) return "/";
  const parts = path.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..");
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

export default function PublicDownloadPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolder = normalizeFolder(searchParams.get("folder"));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const navigateToFolder = (path: string) => {
    const norm = normalizeFolder(path);
    const next = new URLSearchParams(searchParams);
    if (norm === "/") {
      next.delete("folder");
    } else {
      next.set("folder", norm);
    }
    setSearchParams(next);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-portal", debouncedSearch, category],
    queryFn: () => getPublicPortal(debouncedSearch || undefined, category || undefined),
    retry: 1,
  });

  const handleDownloadFile = async (id: string) => {
    setDownloadingId(id);
    try {
      const res = await getPublicFileDownloadUrl(id);
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar download.");
    } finally {
      setDownloadingId(null);
    }
  };

  const copyHash = async (sha256: string) => {
    try {
      await navigator.clipboard.writeText(sha256);
      toast.success("SHA-256 copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  if (isLoading) {
    return (
      <PublicPortalLayout subtitle="Central de Downloads">
        <div className="flex items-center justify-center py-20 text-slate-500">
          Carregando portal de downloads...
        </div>
      </PublicPortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PublicPortalLayout subtitle="Central de Downloads">
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-6 text-center">
          <p className="text-red-700 dark:text-red-300 font-medium">
            Não foi possível carregar o portal de downloads.
          </p>
        </div>
      </PublicPortalLayout>
    );
  }

  if (!data.enabled) {
    return (
      <PublicPortalLayout brandName={data.brandName} logoUrl={data.logoUrl} subtitle="Central de Downloads">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center max-w-lg mx-auto mt-10">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
            <Icon name="lock" size={24} />
          </div>
          <h1 className="text-lg font-semibold mb-2">Portal de downloads desativado</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O portal público de downloads não está habilitado neste servidor. Se você recebeu um link direto de
            compartilhamento ou upload, acesse o link completo enviado pelo suporte.
          </p>
        </div>
      </PublicPortalLayout>
    );
  }

  return (
    <PublicPortalLayout
      brandName={data.brandName}
      logoUrl={data.logoUrl}
      subtitle={data.title || "Central de Downloads Públicos"}
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{data.title || "Arquivos Públicos"}</h1>
          {data.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{data.description}</p>
          )}
        </div>

        {data.zeroTouch.enabled && (
          <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-600 text-white">
                  Zero-Touch
                </span>
                <h2 className="font-semibold text-base">Instalador do Agent Discovery</h2>
                {data.zeroTouch.version && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">v{data.zeroTouch.version}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Instalador genérico com provisionamento automático na rede.
                {data.zeroTouch.sizeBytes ? ` Tamanho: ${formatBytes(data.zeroTouch.sizeBytes)}.` : ""}
              </p>
              {data.zeroTouch.sha256 && (
                <button
                  type="button"
                  onClick={() => copyHash(data.zeroTouch.sha256!)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-blue-600 dark:text-slate-400"
                  title="Copiar SHA-256"
                >
                  <span>SHA-256: {data.zeroTouch.sha256.slice(0, 16)}...</span>
                  <Icon name="content_copy" size={12} />
                </button>
              )}
            </div>
            <a
              href={getZeroTouchDownloadUrl()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors shrink-0"
            >
              <Icon name="download" size={18} />
              <span>Baixar Agent</span>
            </a>
          </div>
        )}

        {/* Busca e filtro de categoria */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar arquivos públicos..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {data.categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as categorias</option>
              {data.categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>

        {(() => {
          const isFiltering = Boolean(debouncedSearch.trim() || category);
          const folders = data.folders || [];
          const currentFolderLower = currentFolder.toLowerCase();
          const subfolders = isFiltering
            ? []
            : folders.filter((f) => normalizeFolder(f.parentPath).toLowerCase() === currentFolderLower);
          const visibleFiles = isFiltering
            ? data.files
            : data.files.filter((f) => normalizeFolder(f.folderPath).toLowerCase() === currentFolderLower);
          const segments = currentFolder === "/" ? [] : currentFolder.split("/").filter(Boolean);
          const parentFolder = segments.length <= 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;

          return (
            <div className="space-y-4">
              {!isFiltering && currentFolder !== "/" && (
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => navigateToFolder("/")}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Início
                    </button>
                    {segments.map((seg, idx) => {
                      const path = `/${segments.slice(0, idx + 1).join("/")}`;
                      const isLast = idx === segments.length - 1;
                      return (
                        <span key={path} className="inline-flex items-center gap-1.5">
                          <Icon name="chevron_right" size={14} className="text-slate-400" />
                          {isLast ? (
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{seg}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigateToFolder(path)}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              {seg}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToFolder(parentFolder)}
                    className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 font-medium"
                  >
                    <Icon name="arrow_back" size={14} />
                    <span>Voltar</span>
                  </button>
                </div>
              )}

              {subfolders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {subfolders.map((folder) => (
                    <button
                      key={folder.path}
                      type="button"
                      onClick={() => navigateToFolder(folder.path)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-400 dark:hover:border-blue-700 transition-colors flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Icon name="folder" size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm truncate">{folder.name}</span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                            {folder.fileCount} {folder.fileCount === 1 ? "arquivo" : "arquivos"}
                          </span>
                        </div>
                        {folder.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {folder.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {visibleFiles.length === 0 && subfolders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
                  {currentFolder !== "/" && !isFiltering
                    ? "Esta pasta está vazia."
                    : "Nenhum arquivo público disponível no momento."}
                </div>
              ) : visibleFiles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleFiles.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-4 hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-sm truncate" title={file.name}>{file.name}</h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isFiltering && file.folderPath && file.folderPath !== "/" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSearch("");
                                  setDebouncedSearch("");
                                  setCategory("");
                                  navigateToFolder(file.folderPath);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:underline"
                                title="Abrir pasta"
                              >
                                <Icon name="folder" size={12} />
                                <span>{file.folderPath}</span>
                              </button>
                            )}
                            {file.category && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {file.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{file.fileName}</div>
                        {file.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{file.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{formatBytes(file.sizeBytes)}</span>
                          {file.sha256 && (
                            <button
                              type="button"
                              onClick={() => copyHash(file.sha256!)}
                              className="inline-flex items-center gap-1 hover:text-blue-600 font-mono text-[11px]"
                              title={`SHA-256: ${file.sha256}`}
                            >
                              <Icon name="verified" size={13} />
                              <span>SHA-256</span>
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={downloadingId === file.id}
                          onClick={() => handleDownloadFile(file.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                        >
                          <Icon name="download" size={16} />
                          <span>{downloadingId === file.id ? "Gerando..." : "Baixar"}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>
    </PublicPortalLayout>
  );
}

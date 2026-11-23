import { useEffect, useState } from "react";
import { Button, ErrorDisplay, Icon, Input, Loading, Modal, Select } from "@/components/ui";
import { AppInstallationType } from "@/api";
import { useAppStoreCatalog } from "@/hooks/useAppStore";

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  const safeText = String(text ?? "");
  if (!highlight.trim() || !safeText) return <>{safeText}</>;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = safeText.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 !== 0 ? (
          <mark
            key={i}
            className="rounded-sm bg-yellow-400/30 px-0.5 text-yellow-900 dark:text-yellow-200"
          >
            {part}
          </mark>
        ) : part ? (
          <span key={i}>{part}</span>
        ) : null,
      )}
    </>
  );
}

interface TaskPackagePickerModalProps {
  open: boolean;
  onClose: () => void;
  installationType: string;
  onInstallationTypeChange: (value: string) => void;
  onSelectPackage: (packageId: string) => void;
}

export function TaskPackagePickerModal({
  open,
  onClose,
  installationType,
  onInstallationTypeChange,
  onSelectPackage,
}: TaskPackagePickerModalProps) {
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [view, setView] = useState<"list" | "card">("list");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const packageCatalog = useAppStoreCatalog(
    {
      installationType: Number(installationType) as AppInstallationType,
      search: searchDebounced.trim() || undefined,
      limit: 50,
    },
    { enabled: open },
  );

  const handlePick = (packageId: string) => {
    onSelectPackage(packageId);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Selecionar pacote" maxWidth="max-w-4xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Select
              label="Tipo de instalador"
              options={[
                { value: String(AppInstallationType.Winget), label: "Winget" },
                { value: String(AppInstallationType.Chocolatey), label: "Chocolatey" },
                { value: String(AppInstallationType.Custom), label: "Custom" },
              ]}
              value={installationType}
              onChange={(e) => {
                onInstallationTypeChange(e.target.value);
                setSearch("");
              }}
            />
          </div>
          <div className="min-w-0 flex-[2]">
            <Input
              label="Pesquisar"
              placeholder="Digite nome ou package id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 pb-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded p-1.5 transition-colors ${
                view === "list"
                  ? "bg-primary-600 text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              title="Visualização em lista"
              aria-label="Visualização em lista"
            >
              <Icon name="list" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("card")}
              className={`rounded p-1.5 transition-colors ${
                view === "card"
                  ? "bg-primary-600 text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              title="Visualização em cards"
              aria-label="Visualização em cards"
            >
              <Icon name="grid_view" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {packageCatalog.isLoading && <Loading message="Carregando catálogo..." />}
        {packageCatalog.isError && <ErrorDisplay onRetry={() => packageCatalog.refetch()} />}

        {!packageCatalog.isLoading && !packageCatalog.isError && (
          <div className="max-h-[55vh] overflow-y-auto">
            {view === "list" ? (
              <div className="space-y-1.5">
                {(packageCatalog.data?.items ?? []).map((pkg) => (
                  <div
                    key={pkg.packageId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover"
                    onClick={() => handlePick(pkg.packageId)}
                  >
                    <div className="shrink-0">
                      {pkg.icon ? (
                        <img
                          src={pkg.icon}
                          alt=""
                          className="h-8 w-8 rounded bg-surface-light object-contain"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-xs font-bold text-muted-foreground">
                          {(pkg.name || pkg.packageId).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        <HighlightText
                          text={pkg.name || pkg.packageId}
                          highlight={searchDebounced}
                        />
                      </p>
                      <p className="truncate font-mono text-xs text-muted">
                        <HighlightText text={pkg.packageId} highlight={searchDebounced} />
                      </p>
                    </div>
                    <p className="max-w-[120px] shrink-0 truncate text-xs text-muted">
                      {pkg.publisher || ""}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePick(pkg.packageId);
                      }}
                    >
                      Selecionar
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(packageCatalog.data?.items ?? []).map((pkg) => (
                  <div
                    key={pkg.packageId}
                    className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-surface-light p-3 transition-colors hover:bg-surface-hover"
                    onClick={() => handlePick(pkg.packageId)}
                  >
                    <div className="flex items-center gap-2">
                      {pkg.icon ? (
                        <img
                          src={pkg.icon}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded bg-surface-light object-contain"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-700 text-sm font-bold text-muted-foreground">
                          {(pkg.name || pkg.packageId).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
                        <HighlightText
                          text={pkg.name || pkg.packageId}
                          highlight={searchDebounced}
                        />
                      </p>
                    </div>
                    <p className="truncate font-mono text-xs text-muted">
                      <HighlightText text={pkg.packageId} highlight={searchDebounced} />
                    </p>
                    {pkg.publisher && (
                      <p className="truncate text-xs text-muted">{pkg.publisher}</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="mt-auto w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePick(pkg.packageId);
                      }}
                    >
                      Selecionar
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {!packageCatalog.data?.items?.length && (
              <p className="py-4 text-center text-sm text-muted">Nenhum pacote encontrado.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

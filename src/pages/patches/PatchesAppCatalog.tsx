import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, CardHeader, ErrorDisplay, Input, Loading, PageHeader, Select } from "@/components/ui";
import {
  useActivateCatalogEntry,
  useAppCatalog,
  useIngestWingetManifest,
  useRevokeCatalogEntry,
} from "@/hooks/usePatches";
import type { AppCatalogEntry } from "@/api/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando curadoria",
  active: "Ativa (auto-aprova)",
  revoked: "Revogada",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  active: "border-success/40 bg-success/10 text-success",
  revoked: "border-danger/40 bg-danger/10 text-danger",
};

function shortHash(hash: string): string {
  return hash.length > 16 ? hash.slice(0, 16) + "..." : hash;
}

export default function PatchesAppCatalog() {
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [manifest, setManifest] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const filters = useMemo(
    () => ({ source: source || undefined, status: status || undefined, search: search || undefined }),
    [source, status, search],
  );

  const catalog = useAppCatalog(filters);
  const ingest = useIngestWingetManifest();
  const activate = useActivateCatalogEntry();
  const revoke = useRevokeCatalogEntry();

  const handleIngest = async () => {
    if (!manifest.trim()) {
      toast.error("Cole o conteudo do arquivo .installer.yaml.");
      return;
    }
    try {
      await ingest.mutateAsync(manifest);
      toast.success("Manifesto importado como pendente de curadoria.");
      setManifest("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar manifesto.");
    }
  };

  const handleActivate = async (entry: AppCatalogEntry) => {
    try {
      await activate.mutateAsync(entry.id);
      toast.success(entry.packageId + " " + entry.version + " ativada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ativar versao.");
    }
  };

  const handleRevoke = async (entry: AppCatalogEntry) => {
    const confirmed = window.confirm(
      "Revogar " + entry.packageId + " " + entry.version + "? Versoes revogadas saem da auto-aprovacao.",
    );
    if (!confirmed) return;
    try {
      await revoke.mutateAsync({ id: entry.id, reason: revokeReason || undefined });
      toast.success("Versao revogada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao revogar versao.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogo de aplicativos"
        description="Curadoria de apps de terceiros: so versoes ativas podem ser auto-aprovadas e instaladas com hash verificado."
      />

      <Card>
        <CardHeader
          title="Importar manifesto (winget-pkgs)"
          subtitle="Cole o conteudo do arquivo .installer.yaml. A entrada entra como pendente e nao e instalada ate ser ativada."
        />
        <textarea
          className="min-h-40 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs text-foreground"
          placeholder="PackageIdentifier: Vendor.App"
          value={manifest}
          onChange={(event) => setManifest(event.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void handleIngest()} disabled={ingest.isPending}>
            {ingest.isPending ? "Importando..." : "Importar manifesto"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Versoes catalogadas" subtitle="Ativar libera auto-aprovacao; revogar remove na hora (CVE/regressao)." />
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Select
            label="Origem"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            options={[
              { value: "", label: "Todas" },
              { value: "winget", label: "winget" },
              { value: "msi", label: "MSI (catalogo proprio)" },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: "", label: "Todos" },
              { value: "pending", label: "Pendentes" },
              { value: "active", label: "Ativas" },
              { value: "revoked", label: "Revogadas" },
            ]}
          />
          <Input label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} hint="nome ou id" />
          <Input
            label="Motivo da revogacao"
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            hint="opcional, registrado na trilha"
          />
        </div>

        {catalog.isLoading ? (
          <Loading />
        ) : catalog.isError ? (
          <ErrorDisplay onRetry={() => void catalog.refetch()} />
        ) : (catalog.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma versao catalogada com estes filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Aplicativo</th>
                  <th className="py-2 pr-3">Versao</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">SHA-256</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {(catalog.data ?? []).map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.packageId}</p>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{entry.version}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={"inline-flex rounded-full border px-2 py-0.5 text-[11px] " + (STATUS_CLASSES[entry.status] ?? "border-border text-muted-foreground")}
                      >
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                      {entry.revokedAt ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          revogada em {new Date(entry.revokedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]" title={entry.sha256}>
                      {shortHash(entry.sha256)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{entry.installerType ?? "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {entry.status !== "active" ? (
                          <Button onClick={() => void handleActivate(entry)} disabled={activate.isPending}>
                            Ativar
                          </Button>
                        ) : null}
                        {entry.status !== "revoked" ? (
                          <Button onClick={() => void handleRevoke(entry)} disabled={revoke.isPending}>
                            Revogar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

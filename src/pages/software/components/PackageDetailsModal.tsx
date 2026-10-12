import { Badge, Button, ErrorDisplay, Loading, Modal } from '@/components/ui';
import { ExternalLink, FileArchive, FileBox, Hash, Terminal } from 'lucide-react';
import { useAppStorePackage } from '@/hooks/useAppStore';
import { AppInstallationType, type AppStoreCatalogPackage } from '@/api/types';
import { PackageIcon } from './PackageIcon';
import { MarkdownDescription } from './MarkdownDescription';
import { normalizeInstallationType } from '../softwareStoreUtils';

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function shortChecksum(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.length > 24 ? `${trimmed.slice(0, 12)}…${trimmed.slice(-8)}` : trimmed;
}

interface PackageDetailsModalProps {
  open: boolean;
  onClose: () => void;
  pkg: AppStoreCatalogPackage | null;
  installationType: AppInstallationType;
}

export function PackageDetailsModal({ open, onClose, pkg, installationType }: PackageDetailsModalProps) {
  const detailsQuery = useAppStorePackage(pkg?.packageId, installationType);
  const details = detailsQuery.data ?? pkg;
  const detailsDownloadUrl =
    details?.installerUrlsByArch
      ? Object.values(details.installerUrlsByArch).find((value) => Boolean(value)) ?? null
      : null;
  const installationLabel =
    normalizeInstallationType(details?.installationType) === AppInstallationType.Winget
      ? 'Winget'
      : normalizeInstallationType(details?.installationType) === AppInstallationType.Chocolatey
        ? 'Chocolatey'
        : 'Custom';
  const isCustomPackage = installationLabel === 'Custom';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={details?.name ?? details?.packageId ?? 'Detalhes do pacote'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {detailsQuery.isLoading && !details && <Loading />}
        {detailsQuery.isError && (
          <ErrorDisplay
            message="Não foi possível carregar os detalhes completos do pacote."
            onRetry={() => detailsQuery.refetch()}
          />
        )}

        {details && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-light p-3">
              <PackageIcon
                url={details.icon}
                homepage={details.homepage}
                downloadUrl={detailsDownloadUrl}
                name={details.name}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{details.name ?? details.packageId}</div>
                <div className="mt-1 font-mono text-xs text-muted">{details.packageId}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {details.version && <Badge color="slate">{details.version}</Badge>}
                  {details.architecture && <Badge color="accent">{details.architecture}</Badge>}
                  {details.category && <Badge color="primary">{details.category}</Badge>}
                  {details.license && <Badge color="warning">{details.license}</Badge>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Publisher</div>
                <div className="mt-1 text-sm text-foreground">{details.publisher ?? '\u2014'}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Tipo</div>
                <div className="mt-1 text-sm text-foreground">{installationLabel}</div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-light p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Descrição</div>
              <div className="mt-1">
                <MarkdownDescription content={details.description} variant="full" emptyText="Sem descrição." />
              </div>
            </div>

            {isCustomPackage && (
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                  <FileBox className="h-3.5 w-3.5" /> Instalador publicado
                </div>

                {details.hasFile ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate font-mono text-sm text-foreground">
                        {details.fileName || 'arquivo do instalador'}
                      </span>
                      {details.extractZip && (
                        <Badge color="warning">
                          <span className="inline-flex items-center gap-1">
                            <FileArchive className="h-3 w-3" /> ZIP — extrair no host
                          </span>
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-border/60 px-2.5 py-2">
                        <div className="text-muted">Tamanho</div>
                        <div className="mt-0.5 font-mono text-foreground">{formatBytes(details.fileSizeBytes)}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 px-2.5 py-2">
                        <div className="text-muted">Tipo</div>
                        <div className="mt-0.5 truncate font-mono text-foreground">{details.fileContentType || '—'}</div>
                      </div>
                    </div>

                    {shortChecksum(details.fileChecksum) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Hash className="h-3 w-3" />
                        <span className="text-muted-foreground">Checksum:</span>
                        <span className="font-mono text-foreground" title={details.fileChecksum ?? ''}>
                          {shortChecksum(details.fileChecksum)}
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      O arquivo fica no object storage e é baixado pelo agent autenticado no momento da instalação.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum arquivo anexado a este pacote. Edite o modelo custom para enviar um instalador ao S3.
                  </p>
                )}
              </div>
            )}

            {isCustomPackage && (
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                  <Terminal className="h-3.5 w-3.5" /> Comandos
                </div>

                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-xs text-muted">Instalação</div>
                    {details.installCommand?.trim() ? (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border/60 bg-black/20 px-2.5 py-2 font-mono text-xs text-foreground">
                        {details.installCommand}
                      </pre>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Nenhum comando de instalação registrado.</p>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-muted">Desinstalação</div>
                    {details.uninstallCommand?.trim() ? (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border/60 bg-black/20 px-2.5 py-2 font-mono text-xs text-foreground">
                        {details.uninstallCommand}
                      </pre>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Sem comando de desinstalação.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!!details.tags?.length && (
              <div className="rounded-xl border border-border bg-surface-light p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Tags</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {details.tags.map((tag) => (
                    <Badge key={tag} color="slate">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {details.homepage && (
                <a
                  href={details.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  <ExternalLink className="h-4 w-4" /> Site do app
                </a>
              )}
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

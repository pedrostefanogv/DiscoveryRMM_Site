import { Badge, Button, ErrorDisplay, Loading, Modal } from '@/components/ui';
import { ExternalLink } from 'lucide-react';
import { useAppStorePackage } from '@/hooks/useAppStore';
import { AppInstallationType, type AppStoreCatalogPackage } from '@/api/types';
import { PackageIcon } from './PackageIcon';
import { MarkdownDescription } from './MarkdownDescription';
import { normalizeInstallationType } from '../softwareStoreUtils';

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

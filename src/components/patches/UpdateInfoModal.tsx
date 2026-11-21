import { Badge, Button, Icon, Modal } from "@/components/ui";
import {
  buildUpdateInfoLinks,
  formatDownloadSizeLabel,
  formatKbList,
  formatPatchDate,
  severityColor,
  updateSourceLabel,
  updateTypeLabel,
} from "@/pages/patches/patchesUtils";

export interface UpdateDetailsInput {
  title: string;
  description?: string | null;
  kbIds?: string[] | null;
  groupKey?: string | null;
  updateKey?: string | null;
  classification?: string | null;
  severity?: string | null;
  updateType?: string | null;
  isOptional?: boolean;
  isMandatory?: boolean;
  requiresReboot?: boolean;
  source?: string | null;
  supportUrl?: string | null;
  publishedAt?: string | null;
  minDownloadSize?: number | null;
  maxDownloadSize?: number | null;
}

export function UpdateDetailsSection({ item }: { item: UpdateDetailsInput }) {
  const links = buildUpdateInfoLinks({
    supportUrl: item.supportUrl,
    kbIds: item.kbIds,
    groupKey: item.groupKey,
    title: item.title,
  });
  const sizeLabel = formatDownloadSizeLabel(item.minDownloadSize, item.maxDownloadSize);
  const keyText = item.updateKey ?? item.groupKey;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.severity ? (
          <Badge color={severityColor(item.severity)}>{item.severity}</Badge>
        ) : null}
        {item.updateType === "feature" ? (
          <Badge color="accent">recursos</Badge>
        ) : null}
        {item.isOptional ? <Badge color="slate">opcional</Badge> : null}
        {item.isMandatory ? <Badge color="warning">obrigatória</Badge> : null}
        {item.requiresReboot ? (
          <Badge color="warning" className="gap-1">
            <Icon name="restart_alt" className="h-3 w-3" />
            reinício
          </Badge>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Sobre esta atualização
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-foreground">
          {item.description?.trim() ||
            "O sistema operacional não informou uma descrição detalhada para este pacote. Consulte os links de referência abaixo para ver as notas de lançamento."}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-2 border-t border-border/60 pt-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted">KB(s)</dt>
          <dd className="font-mono font-medium text-foreground">
            {formatKbList(item.kbIds)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Classificação</dt>
          <dd className="font-medium text-foreground">
            {item.classification ?? "Sem classificação"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Tipo</dt>
          <dd className="font-medium text-foreground">
            {updateTypeLabel(item.updateType)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Origem</dt>
          <dd className="font-medium text-foreground">
            {updateSourceLabel(item.source)}
          </dd>
        </div>
        {item.publishedAt ? (
          <div>
            <dt className="text-muted">Publicada em</dt>
            <dd className="font-medium text-foreground">
              {formatPatchDate(item.publishedAt)}
            </dd>
          </div>
        ) : null}
        {sizeLabel ? (
          <div>
            <dt className="text-muted">Tamanho estimado</dt>
            <dd className="font-medium text-foreground">{sizeLabel}</dd>
          </div>
        ) : null}
        {keyText ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-muted">Identificador</dt>
            <dd className="truncate font-mono text-[11px] text-muted-foreground" title={keyText}>
              {keyText}
            </dd>
          </div>
        ) : null}
      </dl>

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2.5">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
            >
              <Icon name="open_in_new" className="h-3.5 w-3.5" />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpdateInfoModal({
  update,
  onClose,
}: {
  update: UpdateDetailsInput | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={update !== null}
      onClose={onClose}
      title={update?.title ?? "Detalhes da atualização"}
      maxWidth="max-w-2xl"
    >
      {update ? (
        <div className="space-y-4">
          <UpdateDetailsSection item={update} />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

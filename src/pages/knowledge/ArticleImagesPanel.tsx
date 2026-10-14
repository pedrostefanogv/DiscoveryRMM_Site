import { useState } from 'react';
import { Eraser, ImageOff, ImagePlus, MapPin, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ErrorDisplay, Loading } from '@/components/ui';
import type { KbImageListItem } from '@/api';
import {
  KB_IMAGE_SIZE_MAX_PX,
  KB_IMAGE_SIZE_PRESETS,
  buildKbImageToken,
  countKbImageOccurrences,
  kbImageSizeInMarkdown,
  normalizeKbImageSize,
} from '@/utils/kbImage';

/** Onde uma imagem aparece: Home (pageId null) ou uma sub-página. */
export interface KbImageLocation {
  id: string | null;
  label: string;
}

interface ArticleImagesPanelProps {
  images: KbImageListItem[];
  isLoading: boolean;
  isError: boolean;
  /** Conteúdo aberto no editor (home ou sub-página ativa). */
  activeContent: string;
  /** Rótulo do conteúdo aberto ("Home" ou título da sub-página). */
  activeLabel: string;
  /** Permissão de exclusão (KnowledgeBase.Delete) — controla o hard delete. */
  canDeletePermanently: boolean;
  locationsOf: (attachmentId: string) => KbImageLocation[];
  onChangeSize: (attachmentId: string, size: string | null) => void;
  onOpenLocation: (pageId: string | null) => void;
  /** Insere/reinsere o token no conteúdo aberto. */
  onInsert: (token: string) => void;
  onDelete: (attachmentId: string) => void;
  onPermanentDelete: (attachmentId: string) => void;
  deletingId?: string | null;
  permanentDeletingId?: string | null;
  onRetry: () => void;
}

/**
 * Painel de imagens do artigo (lado do editor).
 *
 * Resolve duas lacunas do Markdown:
 * - não há atributo de largura → cada imagem tem seletor de tamanho que reescreve
 *   o token no conteúdo ABERTO (a gravação ocorre no "Salvar" normal);
 * - remover o token do texto NÃO apaga o anexo → a imagem continua listada (com
 *   as páginas onde aparece) e pode ser reinserida com um clique, ou excluída
 *   (soft delete de 30 dias) / excluída definitivamente (remove do storage).
 */
export default function ArticleImagesPanel({
  images,
  isLoading,
  isError,
  activeContent,
  activeLabel,
  canDeletePermanently,
  locationsOf,
  onChangeSize,
  onOpenLocation,
  onInsert,
  onDelete,
  onPermanentDelete,
  deletingId,
  permanentDeletingId,
  onRetry,
}: ArticleImagesPanelProps) {
  const unused = images.filter(
    (image) => locationsOf(image.id).length === 0,
  ).length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Imagens do artigo
        </h3>
        <span className="text-xs text-muted">
          {images.length} imagem{images.length === 1 ? '' : 's'}
          {unused > 0 && ` · ${unused} fora do texto`}
        </span>
      </div>

      {isLoading ? (
        <Loading message="Carregando imagens..." />
      ) : isError ? (
        <ErrorDisplay message="Falha ao carregar as imagens." onRetry={onRetry} />
      ) : images.length === 0 ? (
        <p className="text-xs text-muted">
          Nenhuma imagem anexada ainda. Use “Inserir imagem” no editor, cole
          (Ctrl+V) ou arraste a foto para o texto.
        </p>
      ) : (
        <ul className="space-y-3">
          {images.map((image) => (
            <ImageRow
              key={image.id}
              image={image}
              activeContent={activeContent}
              activeLabel={activeLabel}
              canDeletePermanently={canDeletePermanently}
              locations={locationsOf(image.id)}
              onChangeSize={onChangeSize}
              onOpenLocation={onOpenLocation}
              onInsert={onInsert}
              onDelete={onDelete}
              onPermanentDelete={onPermanentDelete}
              deleting={deletingId === image.id}
              permanentDeleting={permanentDeletingId === image.id}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ImageRow({
  image,
  activeContent,
  activeLabel,
  canDeletePermanently,
  locations,
  onChangeSize,
  onOpenLocation,
  onInsert,
  onDelete,
  onPermanentDelete,
  deleting,
  permanentDeleting,
}: {
  image: KbImageListItem;
  activeContent: string;
  activeLabel: string;
  canDeletePermanently: boolean;
  locations: KbImageLocation[];
  onChangeSize: (attachmentId: string, size: string | null) => void;
  onOpenLocation: (pageId: string | null) => void;
  onInsert: (token: string) => void;
  onDelete: (attachmentId: string) => void;
  onPermanentDelete: (attachmentId: string) => void;
  deleting: boolean;
  permanentDeleting: boolean;
}) {
  const occurrencesHere = countKbImageOccurrences(activeContent, image.id);
  const currentSize = kbImageSizeInMarkdown(activeContent, image.id);
  const [customPx, setCustomPx] = useState('');

  const presetValues = KB_IMAGE_SIZE_PRESETS.map((preset) => preset.value ?? '');
  const isCustom = !!currentSize && !presetValues.includes(currentSize);

  return (
    <li className="rounded-lg border border-border bg-surface-light p-3">
      <div className="flex flex-wrap items-start gap-3">
        {image.url ? (
          <img
            src={image.url}
            alt={image.fileName}
            loading="lazy"
            className="h-16 w-24 rounded border border-border object-cover"
          />
        ) : (
          <span className="flex h-16 w-24 items-center justify-center rounded border border-border bg-background">
            <ImageOff className="h-5 w-5 text-muted" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-xs font-medium text-foreground">
            {image.fileName}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Tamanho</span>
            <select
              value={isCustom ? '__custom__' : (currentSize ?? '')}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '__custom__') return;
                setCustomPx('');
                onChangeSize(image.id, value || null);
              }}
              disabled={occurrencesHere === 0}
              aria-label={`Tamanho de ${image.fileName}`}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-60"
            >
              {KB_IMAGE_SIZE_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value ?? ''}>
                  {preset.label}
                </option>
              ))}
              {isCustom && (
                <option value="__custom__">
                  Personalizado ({currentSize?.endsWith('%') ? currentSize : `${currentSize}px`})
                </option>
              )}
            </select>

            <input
              type="number"
              min={1}
              max={KB_IMAGE_SIZE_MAX_PX}
              value={customPx}
              onChange={(event) => setCustomPx(event.target.value)}
              onBlur={() => {
                const normalized = normalizeKbImageSize(customPx);
                if (normalized) onChangeSize(image.id, normalized);
                setCustomPx('');
              }}
              disabled={occurrencesHere === 0}
              placeholder="px"
              aria-label={`Largura em pixels de ${image.fileName}`}
              className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {locations.length === 0 ? (
              <span>não usada em nenhum texto</span>
            ) : (
              locations.map((location) => (
                <button
                  key={location.id ?? 'home'}
                  type="button"
                  onClick={() => onOpenLocation(location.id)}
                  className={
                    'rounded-full border px-2 py-0.5 ' +
                    (location.label === activeLabel
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-border hover:border-primary/60')
                  }
                >
                  {location.label}
                </button>
              ))
            )}
          </div>

          {occurrencesHere === 0 && (
            <p className="text-[11px] text-muted">
              O tamanho é aplicado no texto aberto ({activeLabel}). Use “Inserir
              no texto” para recolocar a imagem aqui.
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                occurrencesHere > 0 &&
                !window.confirm(
                  `"${image.fileName}" já está neste texto. Inserir de novo (vai duplicar a referência)?`,
                )
              ) {
                return;
              }
              onInsert(buildKbImageToken(image.id, image.fileName, currentSize));
            }}
            title={`Inserir "${image.fileName}" no fim de ${activeLabel}`}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            loading={deleting}
            onClick={() => {
              if (
                !window.confirm(
                  `Excluir "${image.fileName}"? A referência sai do texto e a imagem fica 30 dias recuperável.`,
                )
              ) {
                return;
              }
              onDelete(image.id);
            }}
            title="Excluir (recuperável por 30 dias)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {canDeletePermanently && (
            <Button
              variant="ghost"
              size="sm"
              loading={permanentDeleting}
              onClick={() => {
                if (
                  !window.confirm(
                    `Excluir DEFINITIVAMENTE "${image.fileName}"? O arquivo sai do storage agora e links pré-assinados já emitidos deixam de funcionar. Não há recuperação.`,
                  )
                ) {
                  return;
                }
                if (
                  !window.confirm(
                    'Confirmar exclusão permanente? Esta ação não pode ser desfeita.',
                  )
                ) {
                  return;
                }
                onPermanentDelete(image.id);
              }}
              title="Excluir definitivamente (sem recuperação)"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {occurrencesHere > 1 && (
        <Badge color="slate">usada {occurrencesHere}x neste texto</Badge>
      )}
    </li>
  );
}

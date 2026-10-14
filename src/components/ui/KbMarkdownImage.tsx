import { useEffect, useRef, useState } from "react";
import { knowledgeApi } from "@/api";
import { useKnowledgeImageUrl } from "@/hooks";
import { kbImageSizeStyle, parseKbImageSrc } from "@/utils/kbImage";

interface KbMarkdownImageProps {
  /** Artigo ao qual a imagem pertence (necessário para resolver kbimage:). */
  articleId: string;
  src?: string;
  alt?: string;
  /**
   * Título do Markdown: carrega o tamanho opcional da imagem ("w=50%" / "w=420").
   * Não é repassado ao DOM (evita tooltip com o valor bruto).
   */
  title?: string;
}

/**
 * Renderiza uma imagem referenciada no Markdown da Base de Conhecimento.
 *
 * - `kbimage:<attachmentId>`: imagem privada — resolve a URL pré-assinada pela
 *   API e mostra placeholder enquanto carrega. Se o presign falhar (endpoint S3
 *   inacessível do navegador, storage fora), cai no STREAM AUTENTICADO da API
 *   (blob same-origin) antes de desistir: a imagem continua sem URL pública.
 * - `http(s)`, `data:`, `blob:` e demais esquemas: `<img>` normal.
 */
export function KbMarkdownImage({
  articleId,
  src,
  alt,
  title,
}: KbMarkdownImageProps) {
  // Largura vinda do token; sem título válido a imagem usa a largura natural
  // limitada a 100% do container (comportamento anterior).
  const sizeStyle = kbImageSizeStyle(title);

  const attachmentId = parseKbImageSrc(src);
  // isLoading não é usado aqui: enquanto não houver URL resolvida mostramos o
  // placeholder (o mesmo estado cobre "carregando" e "refazendo após expirar").
  const { url, isError } = useKnowledgeImageUrl(
    articleId,
    attachmentId ?? "",
    !!articleId && !!attachmentId,
  );

  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  // Ref, não state: o efeito de reset precisa rodar antes do de download quando
  // o `src` muda (troca de imagem no mesmo componente).
  const fallbackStarted = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fallbackStarted.current = false;
    setFallbackUrl(null);
    setFallbackFailed(false);
  }, [attachmentId]);

  useEffect(() => {
    if (!attachmentId || !isError || fallbackStarted.current) return;
    fallbackStarted.current = true;

    let alive = true;
    knowledgeApi
      .downloadImage(articleId, attachmentId)
      .then((blob) => {
        if (!alive) return;
        // Blob URL revogado no unmount (abaixo): nada de vazar memória.
        objectUrlRef.current = URL.createObjectURL(blob);
        setFallbackUrl(objectUrlRef.current);
      })
      .catch(() => {
        if (alive) setFallbackFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [articleId, attachmentId, isError]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    },
    [],
  );

  if (attachmentId) {
    const resolved = url ?? fallbackUrl;

    if (resolved) {
      return (
        <img
          src={resolved}
          alt={alt ?? ""}
          loading="lazy"
          style={sizeStyle}
          className="max-w-full rounded-lg"
        />
      );
    }

    // Só considera falha quando o presign E o stream autenticado falharam.
    if (isError && fallbackFailed) {
      return (
        <span
          data-testid="kb-image-error"
          className="inline-flex items-center rounded-lg border border-border bg-surface-light px-2 py-1 align-middle text-xs text-muted"
        >
          Imagem indisponível
        </span>
      );
    }

    return (
      <span
        data-testid="kb-image-loading"
        role="img"
        aria-label={alt || "Carregando imagem"}
        className="inline-block h-24 w-40 animate-pulse rounded-lg bg-surface-hover align-middle"
      />
    );
  }

  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      style={sizeStyle}
      className="max-w-full rounded-lg"
    />
  );
}

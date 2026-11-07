import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetchResponse, parseErrorMessage } from '@/api/client';

interface RecordingPlayerProps {
  /** URL do endpoint autenticado de download (obtida da API, não montada à mão). */
  downloadUrl?: string;
  containerFormat?: 'webm' | 'mp4';
  title?: string;
  /** Nome sugerido do arquivo no download. */
  fileName?: string;
}

/** Tempo que o object URL do download permanece vivo após o clique. */
const BLOB_DOWNLOAD_REVOKE_MS = 30_000;

/**
 * Player de gravação de acesso remoto.
 *
 * DEFEITO C2 CORRIGIDO (2026-11-07): antes este componente usava
 * <a href={downloadUrl} download> e <source src={downloadUrl}>. São NAVEGAÇÕES
 * NATIVAS do navegador, que nunca enviam o header Authorization — a API
 * autentica apenas por Bearer em memória (client.ts:380-385), então os dois
 * davam 401 sempre. Agora o conteúdo é buscado por fetch autenticado e exposto
 * via object URL (mesmo padrão de api/tickets.ts:31-56 e utils/chatAttachment.ts:82).
 */
export function RecordingPlayer({
  downloadUrl,
  containerFormat = 'webm',
  title = 'Reprodução da Sessão',
  fileName,
}: RecordingPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Guarda o object URL vigente para revogar no unmount sem depender do estado.
  const objectUrlRef = useRef<string | null>(null);

  const mimeType = containerFormat === 'mp4' ? 'video/mp4' : 'video/webm';
  const resolvedFileName = fileName ?? `gravacao-sessao.${containerFormat}`;

  /** Busca o vídeo por fetch autenticado e troca o object URL antigo. */
  const loadVideo = useCallback(async () => {
    if (!downloadUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetchResponse(downloadUrl, { method: 'GET' });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new ApiError(response.status, message);
      }

      const rawBlob = await response.blob();
      // Anota o MIME a partir de containerFormat: o Content-Type do servidor não
      // é confiável para o <video> em todos os navegadores, e o formato é
      // conhecido pela prop. Reencadear o tipo só quando divergir evita copiar
      // o blob à toa.
      const blob =
        rawBlob.type === mimeType ? rawBlob : rawBlob.slice(0, rawBlob.size, mimeType);

      // Revoga o anterior ANTES de publicar o novo: sem isto, cada recarga
      // vazaria um object URL (o blob fica retido até a aba fechar).
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const next = URL.createObjectURL(blob);
      objectUrlRef.current = next;
      setObjectUrl(next);
    } catch (err) {
      setError(describePlayerError(err));
    } finally {
      setIsLoading(false);
    }
  }, [downloadUrl]);

  // Carrega assim que houver URL; revoga o object URL ao desmontar.
  useEffect(() => {
    if (downloadUrl) {
      void loadVideo();
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [downloadUrl, loadVideo]);

  /**
   * Baixa o blob AUTENTICADO e dispara um <a download> temporário com o object
   * URL — o <a href> apontando para o endpoint protegido é o defeito original.
   */
  const handleDownload = useCallback(async () => {
    if (!downloadUrl) return;

    setIsDownloading(true);
    setError(null);

    try {
      const response = await apiFetchResponse(downloadUrl, { method: 'GET' });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new ApiError(response.status, message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resolvedFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revogação ADIADA: revogar no mesmo tick cancela o download em parte dos
      // navegadores (Firefox interrompe a leitura do blob) — ver
      // utils/chatAttachment.ts:73-79.
      setTimeout(() => URL.revokeObjectURL(url), BLOB_DOWNLOAD_REVOKE_MS);
    } catch (err) {
      setError(describePlayerError(err));
    } finally {
      setIsDownloading(false);
    }
  }, [downloadUrl, resolvedFileName]);

  if (!downloadUrl) {
    return (
      <div className="flex items-center justify-center h-40 bg-surface rounded text-muted text-sm">
        Nenhuma gravação disponível
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="px-2 py-1 text-xs bg-surface-hover text-muted-foreground rounded hover:bg-border transition-colors disabled:opacity-50"
        >
          {isDownloading ? 'Baixando…' : '⬇ Download'}
        </button>
      </div>

      {error ? (
        <div className="flex items-center justify-center h-40 bg-surface rounded text-danger text-sm">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-40 bg-surface rounded text-muted text-sm">
          Carregando gravação…
        </div>
      ) : objectUrl ? (
        <video
          controls
          className="w-full rounded bg-black"
          // O object URL aponta para o BLOB já autenticado, não para o endpoint
          // protegido — é isso que corrige o 401 do <source src> original.
          onError={() => setError('Falha ao reproduzir a gravação')}
        >
          <source src={objectUrl} type={mimeType} />
          Seu navegador não suporta o elemento de vídeo.
        </video>
      ) : (
        <div className="flex items-center justify-center h-40 bg-surface rounded text-muted text-sm">
          Nenhuma gravação disponível
        </div>
      )}
    </div>
  );
}

/** Separa falha de autenticação de falha de rede, para a mensagem ser acionável. */
function describePlayerError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Sessão expirada. Faça login novamente para ver a gravação.';
    if (err.status === 403) return 'Sem permissão para acessar esta gravação.';
    if (err.status === 404) return 'Gravação não encontrada.';
    return `Falha ao carregar a gravação (${err.status}).`;
  }
  if (err instanceof TypeError) return 'Falha de rede ao carregar a gravação.';
  return err instanceof Error ? err.message : 'Falha ao carregar a gravação';
}

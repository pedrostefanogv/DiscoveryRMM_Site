import { useState, useCallback, useEffect } from 'react';
import { ApiError, apiFetchResponse, parseErrorMessage } from '@/api/client';
import { remoteSessionsApi } from '@/api/remote-sessions';

interface UseRecordingParams {
  sessionId: string;
  agentId: string;
}

/**
 * Estado da gravação de uma sessão remota.
 *
 * IMPORTANTE (defeito C2 corrigido em 2026-11-07): o download NÃO devolve uma
 * URL pronta para <a href>/<video src>. O navegador faz navegação nativa nesses
 * casos e NUNCA envia o header Authorization — a API autentica só por Bearer em
 * memória (client.ts:380-385), então a URL crua daria 401 sempre. O que se
 * expõe aqui é o CONTEÚDO (blob), obtido por fetch autenticado.
 *
 * A URL crua anterior também estava malformada: faltava o sessionId, e a rota
 * real é {agentId:guid}/{sessionId:guid}/recording/download
 * (RemoteSessionsController.cs:222) — mesmo autenticado daria 404.
 */
export function useRecording({ agentId, sessionId }: UseRecordingParams) {
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRecording(false);
    }
  }, []);

  /**
   * Para a gravação e já baixa o blob autenticado.
   *
   * A URL vem do cliente tipado (remoteSessionsApi.getRecordingDownload) — não
   * há mais string de URL montada à mão. Dois passos distintos podem falhar e a
   * mensagem os separa: obter a URL (stop) e buscar o conteúdo (download).
   */
  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    setIsDownloading(true);
    setError(null);

    try {
      await remoteSessionsApi.stopRecording(agentId, sessionId);
    } catch (err) {
      // A gravação pode já ter sido encerrada; não impede tentar o download.
      setError(describeError(err, 'Falha ao encerrar a gravação'));
      setIsDownloading(false);
      return;
    }

    try {
      const blob = await fetchRecordingBlob(agentId, sessionId);
      setRecording(blob);
    } catch (err) {
      setError(describeError(err, 'Falha ao baixar a gravação'));
    } finally {
      setIsDownloading(false);
    }
  }, [agentId, sessionId]);

  // Libera o object URL anterior quando o blob é substituído ou no unmount.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(recording);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  return {
    isRecording,
    recording,
    objectUrl,
    isDownloading,
    error,
    startRecording,
    stopRecording,
  };
}

/**
 * Distingue falha de autenticação de falha de rede — a UX precisa dizer ao
 * operador se o problema é sessão expirada (relogin) ou conectividade (retry).
 */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Sessão expirada. Faça login novamente para baixar a gravação.';
    if (err.status === 403) return 'Sem permissão para baixar esta gravação.';
    if (err.status === 404) return 'Gravação não encontrada para esta sessão.';
    return `${fallback} (${err.status}).`;
  }

  // TypeError é o que fetch lança quando a rede falha (DNS, offline, CORS).
  if (err instanceof TypeError) return 'Falha de rede ao contactar o servidor.';

  return err instanceof Error ? err.message : fallback;
}

/**
 * Busca o conteúdo da gravação por fetch AUTENTICADO (same-origin, com
 * Authorization) e devolve o blob.
 *
 * A URL devolvida pela API pode ser um path local da própria API OU uma URL
 * pré-assinada do storage. No segundo caso a URL já carrega a própria
 * autorização na query string, então NÃO se envia Authorization — mandar o
 * Bearer para o storage externo vazaria o token para outro host.
 */
export async function fetchRecordingBlob(
  agentId: string,
  sessionId: string,
): Promise<Blob> {
  // A URL vem do cliente TIPADO (não mais montada à mão): o endpoint é
  // {agentId}/{sessionId}/recording/download e a resposta pode apontar para um
  // path local da API OU para uma URL pré-assinada do storage.
  const { downloadUrl } = await remoteSessionsApi.getRecordingDownload(agentId, sessionId);

  if (!downloadUrl) {
    throw new ApiError(404, 'A API não devolveu uma URL de download para esta gravação.');
  }

  const isAbsolute = /^https?:\/\//i.test(downloadUrl);
  const isSameOrigin =
    !isAbsolute ||
    (typeof window !== 'undefined' && downloadUrl.startsWith(window.location.origin));

  const response = await apiFetchResponse(downloadUrl, {
    method: 'GET',
    // URL externa já assinada: NÃO anexar o Bearer da sessão, senão o token
    // vaza para outro host. Para o path local da própria API, autenticamos.
    auth: isSameOrigin,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  return response.blob();
}

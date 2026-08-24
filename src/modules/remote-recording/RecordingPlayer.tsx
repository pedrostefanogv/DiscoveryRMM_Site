import { useState } from 'react';

interface RecordingPlayerProps {
  downloadUrl?: string;
  containerFormat?: 'webm' | 'mp4';
  title?: string;
}

export function RecordingPlayer({
  downloadUrl,
  containerFormat = 'webm',
  title = 'Reprodução da Sessão',
}: RecordingPlayerProps) {
  const [error, setError] = useState<string | null>(null);

  const mimeType = containerFormat === 'mp4' ? 'video/mp4' : 'video/webm';

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
        <a
          href={downloadUrl}
          download
          className="px-2 py-1 text-xs bg-surface-hover text-muted-foreground rounded hover:bg-border transition-colors"
        >
          ⬇ Download
        </a>
      </div>

      {error ? (
        <div className="flex items-center justify-center h-40 bg-surface rounded text-danger text-sm">
          {error}
        </div>
      ) : (
        <video
          controls
          className="w-full rounded bg-black"
          onError={() => setError('Falha ao carregar o vídeo')}
        >
          <source src={downloadUrl} type={mimeType} />
          Seu navegador não suporta o elemento de vídeo.
        </video>
      )}
    </div>
  );
}

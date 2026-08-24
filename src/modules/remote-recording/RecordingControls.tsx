import { useState, useCallback } from 'react';
import { remoteSessionsApi } from '@/api/remote-sessions';

interface RecordingControlsProps {
  sessionId?: string;
  agentId?: string;
  onError?: (msg: string) => void;
  isRecording?: boolean;
}

export function RecordingControls({
  sessionId,
  agentId,
  onError,
  isRecording: initialRecording = false,
}: RecordingControlsProps) {
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRecording = useCallback(async () => {
    if (!sessionId || !agentId) return;
    setLoading(true);
    setError(null);

    try {
      if (isRecording) {
        await remoteSessionsApi.stopRecording(agentId, sessionId);
        setIsRecording(false);
      } else {
        await remoteSessionsApi.startRecording(agentId, sessionId);
        setIsRecording(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [isRecording, sessionId, agentId, onError]);

  return (
    <>
      {error && <span className="text-danger">{error}</span>}
      <button
        className={`px-2 py-0.5 rounded ${isRecording ? 'bg-danger text-white animate-pulse' : 'bg-surface-hover text-foreground hover:bg-border'}`}
        onClick={toggleRecording}
        disabled={loading || !sessionId || !agentId}
      >
        {isRecording ? '⏹ STOP REC' : '⏺ REC'}
      </button>
    </>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { remoteSessionsApi } from '@/api/remote-sessions';

interface RecordingControlsProps {
  sessionId: string;
  agentId: string;
  isRecording: boolean;
  onRecordingChange?: (recording: boolean) => void;
}

export function RecordingControls({
  sessionId,
  agentId,
  isRecording: initialRecording,
  onRecordingChange,
}: RecordingControlsProps) {
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsRecording(initialRecording);
  }, [initialRecording]);

  const toggleRecording = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Placeholder: chamaria endpoints /start e /stop
      // Por enquanto, simula toggle
      await new Promise(r => setTimeout(r, 300));
      const newState = !isRecording;
      setIsRecording(newState);
      onRecordingChange?.(newState);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [isRecording, onRecordingChange]);

  return (
    <div className="flex items-center gap-2">
      <button
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
          isRecording
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
        }`}
        onClick={toggleRecording}
        disabled={loading}
        title={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
      >
        <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
        {loading ? '...' : isRecording ? 'Gravando' : 'Gravar'}
        {isRecording && (
          <span className="text-[10px] opacity-60 ml-1">●REC</span>
        )}
      </button>

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';

interface RecordingControlsProps {
  sessionId?: string;
  agentId?: string;
  onError?: (msg: string) => void;
  isRecording?: boolean;
}

export function RecordingControls({
  sessionId: _sessionId,
  agentId: _agentId,
  onError,
  isRecording: initialRecording = false,
}: RecordingControlsProps) {
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRecording = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(r => setTimeout(r, 300));
      const newState = !isRecording;
      setIsRecording(newState);
    } catch (err) {
      const msg = String(err);
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [isRecording, onError]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border-t border-slate-700 text-xs">
      {error && <span className="text-red-400">{error}</span>}
      <button
        className={`px-2 py-0.5 rounded ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
        onClick={toggleRecording}
        disabled={loading}
      >
        {isRecording ? '⏹ STOP REC' : '⏺ REC'}
      </button>
    </div>
  );
}

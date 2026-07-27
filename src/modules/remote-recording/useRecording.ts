import { useState, useCallback } from 'react';

interface UseRecordingParams {
    sessionId: string;
    agentId: string;
}

export function useRecording({ sessionId, agentId }: UseRecordingParams) {
    const [isRecording, setIsRecording] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const startRecording = useCallback(async () => {
        try {
            setIsRecording(true);
            setError(null);
        } catch (err) {
            setError(String(err));
            setIsRecording(false);
        }
    }, []);

    const stopRecording = useCallback(async () => {
        try {
            setIsRecording(false);
            setDownloadUrl(`/api/v1/remote-sessions/${agentId}/recording/download`);
        } catch (err) {
            setError(String(err));
        }
    }, [agentId]);

    return {
        isRecording,
        downloadUrl,
        error,
        startRecording,
        stopRecording,
    };
}

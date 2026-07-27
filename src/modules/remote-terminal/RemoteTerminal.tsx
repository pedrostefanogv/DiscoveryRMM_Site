import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteSessionsApi } from '@/api/remote-sessions';

interface RemoteTerminalProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
}

export default function RemoteTerminal({
  sessionId,
  agentId,
}: RemoteTerminalProps) {
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [status, setStatus] = useState<'connected' | 'disconnected'>('connected');

  const appendOutput = useCallback((text: string) => {
    setOutput(prev => [...prev.slice(-1000), text]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    appendOutput(`\nC:\\> ${cmd}`);

    // Placeholder: enviar comando via NATS (Fase 5)
    // Por enquanto, simula resposta
    setTimeout(() => {
      appendOutput(`Comando "${cmd}" enviado. Resposta pendente do agent.`);
    }, 500);

    setCommandHistory(prev => [...prev, cmd]);
    setHistoryIdx(-1);
  }, [appendOutput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = (e.target as HTMLInputElement).value;
      sendCommand(cmd);
      (e.target as HTMLInputElement).value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIdx = historyIdx < commandHistory.length - 1 ? historyIdx + 1 : historyIdx;
      setHistoryIdx(newIdx);
      if (commandHistory.length > 0 && newIdx >= 0) {
        inputRef.current!.value = commandHistory[commandHistory.length - 1 - newIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIdx = historyIdx > 0 ? historyIdx - 1 : -1;
      setHistoryIdx(newIdx);
      if (newIdx >= 0 && commandHistory.length > 0) {
        inputRef.current!.value = commandHistory[commandHistory.length - 1 - newIdx];
      } else {
        inputRef.current!.value = '';
      }
    }
  }, [sendCommand, commandHistory, historyIdx]);

  // Stop session on unmount
  useEffect(() => {
    return () => {
      remoteSessionsApi.stopSession(agentId, sessionId).catch(() => {});
    };
  }, [agentId, sessionId]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-xs text-slate-500">
        <span>Terminal Remoto</span>
        <span className={`inline-flex items-center gap-1 ${status === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {status === 'connected' ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* Terminal output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto p-3 font-mono text-sm text-slate-300 bg-slate-950"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        <div className="text-slate-500 text-xs mb-2 select-none">
          ── DiscoveryRMM Terminal (Fase 3) ──
        </div>
        {output.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Input line */}
      <div className="flex items-center px-3 py-2 bg-slate-900 border-t border-slate-800">
        <span className="text-emerald-400 font-mono text-sm mr-2 select-none">C:\&gt;</span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-slate-300 font-mono text-sm"
          placeholder="Digite um comando..."
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
}

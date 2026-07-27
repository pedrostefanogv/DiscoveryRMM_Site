import { useState, useCallback } from 'react';
import type { StartRemoteSessionRequest } from '@/api/remote-sessions';

interface CodecSelectorProps {
  value: StartRemoteSessionRequest['codec'];
  onChange: (codec: StartRemoteSessionRequest['codec']) => void;
  disabled?: boolean;
}

const CODECS: { value: StartRemoteSessionRequest['codec']; label: string; desc: string }[] = [
  { value: 'jpeg', label: 'JPEG', desc: 'Melhor compatibilidade' },
  { value: 'webp', label: 'WebP', desc: 'Melhor compressão' },
  { value: 'h264', label: 'H.264', desc: 'GPU acelerado' },
];

export function CodecSelector({ value, onChange, disabled }: CodecSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {CODECS.map(c => (
        <button
          key={c.value}
          disabled={disabled}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            value === c.value
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-slate-800 text-slate-400 hover:text-slate-300 border border-slate-700'
          } disabled:opacity-50`}
          onClick={() => onChange(c.value)}
          title={c.desc}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

interface QualitySelectorProps {
  value: StartRemoteSessionRequest['quality'];
  onChange: (quality: StartRemoteSessionRequest['quality']) => void;
  disabled?: boolean;
}

const QUALITIES: { value: StartRemoteSessionRequest['quality']; label: string; fps: number }[] = [
  { value: 'ultra', label: 'Ultra', fps: 30 },
  { value: 'high', label: 'Alta', fps: 20 },
  { value: 'medium', label: 'Média', fps: 15 },
  { value: 'low', label: 'Baixa', fps: 10 },
  { value: 'ultralow', label: 'Min', fps: 5 },
] as const;

// Map ultralow to correct wire value
function toWireQuality(q: string): StartRemoteSessionRequest['quality'] {
  if (q === 'ultralow') return 'ultralow' as StartRemoteSessionRequest['quality'];
  return q as StartRemoteSessionRequest['quality'];
}

export function QualitySelector({ value, onChange, disabled }: QualitySelectorProps) {
  const wireValue = value === 'ultralow' ? 'ultralow' : value;
  return (
    <div className="flex items-center gap-1">
      {QUALITIES.map(q => (
        <button
          key={q.value}
          disabled={disabled}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            wireValue === q.value
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-slate-800 text-slate-400 hover:text-slate-300 border border-slate-700'
          } disabled:opacity-50`}
          onClick={() => onChange(toWireQuality(q.value))}
          title={`${q.fps} FPS`}
        >
          {q.label} <span className="text-[10px] opacity-60">{q.fps}fps</span>
        </button>
      ))}
    </div>
  );
}

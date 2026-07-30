import { useCallback, useEffect, useState } from 'react';
import { useFilesStream } from './useFilesStream';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
}

interface RemoteFilesProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  jwt?: string;
  nkeySeed?: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function RemoteFiles({
  sessionId: _sessionId,
  agentId: _agentId,
  natsSubject,
  jwt,
  nkeySeed: _nkeySeed,
}: RemoteFilesProps) {
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, sendRequest } = useFilesStream({
    natsSubject: natsSubject || '',
    natsUrl: '', // será preenchido pelo RemoteSession com credenciais
    jwt: jwt || '',
  });

  const loadFiles = useCallback(async (path: string) => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await sendRequest('list', path);
      if (resp.success && resp.entries) {
        setFiles(resp.entries);
      } else {
        setError(resp.error || 'Erro ao listar');
      }
    } catch (err) {
      setError(`Erro ao listar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [sendRequest, isConnected]);

  useEffect(() => {
    if (isConnected) loadFiles(currentPath);
  }, [currentPath, isConnected, loadFiles]);

  const navigateTo = (dir: string) => {
    if (dir === '..') {
      const parts = currentPath.replace(/\\+$/, '').split('\\');
      parts.pop();
      setCurrentPath(parts.join('\\') + '\\');
    } else {
      setCurrentPath(dir.endsWith('\\') ? dir : dir + '\\');
    }
  };

  const isRoot = currentPath === 'C:\\' || currentPath.match(/^[A-Z]:\\$/) !== null;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <span className="text-slate-500">📁</span>
        <span className="font-mono text-slate-400">{currentPath}</span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-red-900/40 text-red-300 text-xs">{error}</div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-1.5 w-8"></th>
                <th className="text-left px-3 py-1.5">Nome</th>
                <th className="text-right px-3 py-1.5 w-24">Tamanho</th>
                <th className="text-right px-3 py-1.5 w-40">Modificado</th>
              </tr>
            </thead>
            <tbody>
              {!isRoot && (
                <tr className="hover:bg-slate-800 cursor-pointer border-b border-slate-800/50" onClick={() => navigateTo('..')}>
                  <td className="px-3 py-2">📁</td>
                  <td className="px-3 py-2 text-slate-400">..</td>
                  <td></td><td></td>
                </tr>
              )}
              {files.map((f, i) => (
                <tr key={i} className={`hover:bg-slate-800 border-b border-slate-800/50 ${f.isDir ? 'cursor-pointer' : ''}`} onClick={() => f.isDir && navigateTo(f.path)}>
                  <td className="px-3 py-2">{f.isDir ? '📁' : '📄'}</td>
                  <td className="px-3 py-2 font-mono">{f.name}</td>
                  <td className="px-3 py-2 text-right text-slate-500 font-mono text-xs">{f.isDir ? '—' : formatSize(f.size)}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">{f.modTime.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

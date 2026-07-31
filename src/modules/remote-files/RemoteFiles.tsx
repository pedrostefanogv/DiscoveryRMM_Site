import { useCallback, useEffect, useRef, useState } from 'react';
import { useFilesStream, decodeFileData, type FilesResponse } from './useFilesStream';

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
  natsUrl?: string;
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

// Chunk size para upload/download (256KB — alinhado ao agent Transfer)
const CHUNK_SIZE = 256 * 1024;
// Limite de download em memória: 512MB — acima disso, cancela com aviso
const MAX_DOWNLOAD_MEMORY = 512 * 1024 * 1024;

export default function RemoteFiles({
  sessionId: _sessionId,
  agentId: _agentId,
  natsSubject,
  natsUrl,
  jwt,
  nkeySeed: _nkeySeed,
}: RemoteFilesProps) {
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // ação em andamento (feedback)
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { isConnected, sendRequest } = useFilesStream({
    natsSubject: natsSubject || '',
    natsUrl: natsUrl || '',
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

  // ── Ações ──

  const runAction = async (label: string, fn: () => Promise<FilesResponse>) => {
    setBusy(label);
    setError(null);
    try {
      const resp = await fn();
      if (!resp.success) {
        setError(`${label}: ${resp.error || 'falha'}`);
        return false;
      }
      return true;
    } catch (err) {
      setError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    if (entry.isDir) return;
    await runAction(`Download ${entry.name}`, async () => {
      // Chunked download: pede chunk por chunk até totalChunks
      const chunks: Uint8Array[] = [];
      let totalChunks = 1;
      let totalSize = 0;
      let chunkIndex = 0;
      do {
        const resp = await sendRequest('get', entry.path, undefined, { chunkIndex, chunkSize: CHUNK_SIZE });
        if (!resp.success) return resp;
        const bytes = decodeFileData(resp.data);
        if (bytes.length > 0) {
          totalSize += bytes.length;
          if (totalSize > MAX_DOWNLOAD_MEMORY) {
            return { success: false, error: `Arquivo muito grande para download em memória (limite ${MAX_DOWNLOAD_MEMORY / 1024 / 1024}MB).` };
          }
          chunks.push(bytes);
        }
        totalChunks = resp.totalChunks ?? 1;
        chunkIndex++;
      } while (chunkIndex < totalChunks);

      if (chunks.length === 0) {
        return { success: false, error: 'Arquivo vazio ou falha ao ler.' };
      }

      // Monta Blob e dispara download
      const blob = new Blob(chunks.map(c => c.slice().buffer as ArrayBuffer), { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { success: true, size: totalSize };
    });
  };

  const handleUpload = async (file: File) => {
    const targetPath = currentPath + file.name;
    await runAction(`Upload ${file.name}`, async () => {
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = new Uint8Array(await file.slice(start, end).arrayBuffer());
        const resp = await sendRequest('put', targetPath, chunk, { chunkIndex: i, chunkSize: CHUNK_SIZE, totalChunks });
        if (!resp.success) return resp;
      }
      return { success: true };
    });
    if (isConnected) loadFiles(currentPath);
  };

  const handleRename = async (entry: FileEntry) => {
    const newName = window.prompt(`Renomear "${entry.name}" para:`, entry.name);
    if (!newName || newName === entry.name) return;
    const newPath = (entry.path.includes('\\') ? entry.path.slice(0, entry.path.lastIndexOf('\\') + 1) : '') + newName;
    const ok = await runAction(`Renomear ${entry.name}`, () => sendRequest('rename', entry.path, undefined, { newPath }));
    if (ok) loadFiles(currentPath);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!window.confirm(`Apagar "${entry.name}"?${entry.isDir ? ' (recursivo)' : ''}`)) return;
    const ok = await runAction(`Apagar ${entry.name}`, () => sendRequest('delete', entry.path));
    if (ok) loadFiles(currentPath);
  };

  const handleMkdir = async () => {
    const name = window.prompt('Nome da nova pasta:');
    if (!name) return;
    const ok = await runAction(`Criar pasta ${name}`, () => sendRequest('mkdir', currentPath + name));
    if (ok) loadFiles(currentPath);
  };

  const handleRefresh = () => loadFiles(currentPath);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-xs">
        <span className="text-slate-500">📁</span>
        <span className="font-mono text-slate-400 flex-1 truncate">{currentPath}</span>
        <button
          className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
          onClick={handleRefresh}
          disabled={loading || !isConnected}
          title="Atualizar"
        >
          ↻
        </button>
        <button
          className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
          onClick={handleMkdir}
          disabled={busy !== null || !isConnected}
          title="Nova pasta"
        >
          + Pasta
        </button>
        <button
          className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null || !isConnected}
          title="Enviar arquivo para o PC remoto"
        >
          ↑ Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Status / error banner */}
      {busy && (
        <div className="px-3 py-1.5 bg-blue-900/40 text-blue-300 text-xs">{busy}...</div>
      )}
      {error && (
        <div className="px-3 py-1.5 bg-red-900/40 text-red-300 text-xs">{error}</div>
      )}
      {!isConnected && (
        <div className="px-3 py-1.5 bg-amber-900/40 text-amber-300 text-xs">
          Conectando ao agent... (aguardando NATS)
        </div>
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
                <th className="text-right px-3 py-1.5 w-32">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!isRoot && (
                <tr className="hover:bg-slate-800 cursor-pointer border-b border-slate-800/50" onClick={() => navigateTo('..')}>
                  <td className="px-3 py-2">📁</td>
                  <td className="px-3 py-2 text-slate-400">..</td>
                  <td></td><td></td><td></td>
                </tr>
              )}
              {files.map((f) => (
                <tr
                  key={f.path || f.name}
                  className={`hover:bg-slate-800 border-b border-slate-800/50 ${f.isDir ? 'cursor-pointer' : ''} ${selected?.path === f.path ? 'bg-slate-800/60' : ''}`}
                  onClick={() => { if (f.isDir) navigateTo(f.path); else setSelected(f); }}
                >
                  <td className="px-3 py-2">{f.isDir ? '📁' : '📄'}</td>
                  <td className="px-3 py-2 font-mono">{f.name}</td>
                  <td className="px-3 py-2 text-right text-slate-500 font-mono text-xs">{f.isDir ? '—' : formatSize(f.size)}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">{f.modTime.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!f.isDir && (
                      <button
                        className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-sky-300 disabled:opacity-40"
                        title="Baixar"
                        disabled={busy !== null}
                        onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                      >
                        ↓
                      </button>
                    )}
                    <button
                      className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-amber-300 disabled:opacity-40"
                      title="Renomear"
                      disabled={busy !== null}
                      onClick={(e) => { e.stopPropagation(); handleRename(f); }}
                    >
                      ✎
                    </button>
                    <button
                      className="px-1.5 py-0.5 text-xs text-slate-400 hover:text-red-300 disabled:opacity-40"
                      title="Apagar"
                      disabled={busy !== null}
                      onClick={(e) => { e.stopPropagation(); handleDelete(f); }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

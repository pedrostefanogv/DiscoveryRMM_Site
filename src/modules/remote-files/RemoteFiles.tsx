import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFilesStream, decodeFileData, type FilesResponse, type FilesReadyInfo } from './useFilesStream';

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

function formatSpeed(bps: number): string {
  if (!isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function formatEta(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

interface TransferState {
  kind: 'upload' | 'download';
  name: string;
  loadedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
}

// Abstrações mínimas da File System Access API (showSaveFilePicker) para
// download em streaming — evita depender dos tipos globais do lib.dom.
interface FsWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
interface FsFileHandle {
  createWritable(): Promise<{ getWriter(): FsWriter }>;
}

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
  const busyRef = useRef(false); // espelho síncrono de `busy` para o callback de progresso
  const [transfer, setTransfer] = useState<TransferState | null>(null); // progresso de up/down
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set()); // múltipla seleção (paths)
  const [pathInput, setPathInput] = useState('C:\\'); // valor do input editável de caminho
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isRootPath = useRef<string | null>(null); // rootPath efetivo informado pelo agent
  const mountedRef = useRef(true); // evita setState após desmontar (timers de pós-transferência)
  const [modal, setModal] = useState<{
    title: string;
    message?: string;
    inputLabel?: string;
    inputValue?: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: (value?: string) => void;
  } | null>(null);
  const [modalInput, setModalInput] = useState('');

  const openPrompt = (title: string, inputLabel: string, initial: string, onConfirm: (value?: string) => void) => {
    setModalInput(initial);
    setModal({ title, inputLabel, inputValue: initial, confirmLabel: 'OK', onConfirm });
  };

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({ title, message, confirmLabel: 'Confirmar', danger: true, onConfirm });
  };

  const closeModal = () => setModal(null);

  const submitModal = () => {
    if (!modal) return;
    const value = modal.inputLabel !== undefined ? modalInput : undefined;
    closeModal();
    modal.onConfirm(value);
  };

  const { isConnected, sendRequest, onReady, onProgress } = useFilesStream({
    natsSubject: natsSubject || '',
    natsUrl: natsUrl || '',
    jwt: jwt || '',
  });

  // Progresso de operações longas (copy/move/zip/unzip) via files.progress.
  // O agent publica {requestId, loaded, total}; correlacionamos com a ação
  // em andamento (busy) e atualizamos a barra de transferência.
  const [opProgress, setOpProgress] = useState<{ loaded: number; total: number } | null>(null);

  useEffect(() => {
    const off = onProgress((info) => {
      // Usa busyRef (síncrono) em vez do estado busy para não perder os
      // primeiros eventos de progresso (race de render do React).
      if (!busyRef.current) return;
      const loaded = info.loaded ?? 0;
      const total = info.total ?? 0;
      if (total > 0) setOpProgress({ loaded, total });
    });
    return off;
  }, [onProgress]);

  // Marca o componente como desmontado no cleanup (evita warnings de setState).
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Monotonic counter para ignorar respostas de listagem desatualizadas
  // (navegação rápida entre pastas poderia sobrescrever a lista mais recente).
  const loadSeqRef = useRef(0);

  const loadFiles = useCallback(async (path: string, attempt = 1, seq?: number) => {
    // Requer conexão; NÃO exige isReady aqui (o files.ready pode ser perdido).
    if (!isConnected) return;
    // Reaproveita o seq no retry (mesma requisição) para que a resposta antiga
    // não sobrescreva a navegação mais recente.
    const mySeq = seq ?? ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const resp = await sendRequest('list', path);
      if (mySeq !== loadSeqRef.current) return; // resposta desatualizada — ignora
      if (resp.success) {
        setFiles(resp.entries ?? []);
      } else {
        setError(resp.error || 'Erro ao listar');
      }
      setLoading(false);
    } catch (err) {
      if (mySeq !== loadSeqRef.current) return; // desatualizada — ignora
      // Retry com backoff (evita perder o primeiro list por race de subscribe) —
      // mantém o loading ativo entre tentativas e aborta se o usuário já navegou.
      if (attempt < 3) {
        setTimeout(() => { if (mountedRef.current) loadFiles(path, attempt + 1, mySeq); }, 400 * attempt);
      } else {
        setError(`Erro ao listar: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    }
  }, [sendRequest, isConnected]);

  useEffect(() => {
    // Carrega assim que conecta (sem gate de isReady): o files.ready pode ser
    // perdido (NATS fire-and-forget), e o retry do loadFiles cobre a race de
    // subscribe. Isso torna a navegação imediata em vez de esperar 10s.
    if (isConnected) loadFiles(currentPath);
  }, [currentPath, isConnected, loadFiles]);

  // Fallback: se o agente já publicou files.ready antes do mount (reconexão),
  // o onReady garante o load mesmo sem o isReady ter sido observado.
  // Também usa o rootPath informado pelo agent como caminho inicial (em vez de
  // assumir C:\ fixo — o rootPath pode ser customizado no start da sessão).
  // O load em si é disparado pelo useEffect [currentPath, isConnected] acima.
  useEffect(() => {
    const off = onReady((info: FilesReadyInfo) => {
      // Ajusta o caminho inicial para o rootPath real do agent (uma vez).
      if (info?.rootPath) {
        isRootPath.current = info.rootPath.replace(/[\\/]+$/, '') + '\\';
        if (currentPath === 'C:\\') {
          setCurrentPath(isRootPath.current); // dispara o load do caminho correto
        }
      }
    });
    return off;
  }, [onReady, currentPath]);

  const normalizePath = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();

  // Raiz = final de volume Windows (C:\, D:\) OU o rootPath informado pelo agent
  // (que pode ser customizado, ex.: C:\Users\Admin\Documents).
  const isRoot = isRootPath.current
    ? normalizePath(currentPath) === normalizePath(isRootPath.current)
    : /^[A-Za-z]:\\$/.test(currentPath);

  const goTo = (path: string) => {
    setCurrentPath(path.endsWith('\\') || path.endsWith('/') ? path : path + '\\');
  };

  const goUp = () => {
    // Já na raiz (volume ou rootPath custom) — não sobe.
    if (isRoot) return;
    const trimmed = currentPath.replace(/[\\/]+$/, '');
    const parts = trimmed.split(/[\\/]/);
    parts.pop();
    if (parts.length === 0) return; // 'C:' — defensivo
    const parent = parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])
      ? parts[0] + '\\' // 'C:' → 'C:\'
      : parts.join('\\') + '\\';
    setCurrentPath(parent);
  };

  const navigateTo = (dir: string) => {
    if (dir === '..') goUp();
    else goTo(dir);
  };

  // Sincroniza o input de caminho com o caminho efetivo.
  useEffect(() => {
    setPathInput(currentPath);
  }, [currentPath]);

  const submitPath = () => {
    const trimmed = pathInput.trim();
    if (!trimmed || trimmed === currentPath) {
      setPathInput(currentPath);
      return;
    }
    goTo(trimmed);
  };

  // ── Ações ──

  const runAction = async (label: string, fn: () => Promise<FilesResponse>) => {
    setBusy(label);
    busyRef.current = true;
    setError(null);
    setOpProgress(null);
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
      busyRef.current = false;
      setBusy(null);
      setOpProgress(null);
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    if (entry.isDir) return;
    setError(null);
    setBusy(`Download ${entry.name}`);

    const startedAt = performance.now();
    let loadedBytes = 0;
    let totalBytes = 0;
    let lastEmit = 0;
    let writer: FsWriter | null = null;
    let closed = false;
    const memoryChunks: Uint8Array[] = [];

    // Atualiza a barra de progresso com throttle (~150ms) — suficiente para
    // indicar o andamento sem custo de re-render por chunk.
    const emitProgress = (force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 150) return;
      lastEmit = now;
      const elapsed = (now - startedAt) / 1000;
      const speedBps = elapsed > 0 ? loadedBytes / elapsed : 0;
      const etaSeconds = speedBps > 0 && totalBytes > 0 ? (totalBytes - loadedBytes) / speedBps : null;
      setTransfer({ kind: 'download', name: entry.name, loadedBytes, totalBytes, speedBps, etaSeconds });
    };

    try {
      // File System Access API: grava direto em disco (sem limite de memória),
      // permitindo baixar arquivos grandes (1GB+) sem truncar em ~500MB.
      const picker = (window as unknown as { showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<FsFileHandle> }).showSaveFilePicker;
      if (typeof picker === 'function') {
        try {
          const handle = await picker({ suggestedName: entry.name });
          writer = (await handle.createWritable()).getWriter();
        } catch (e) {
          if ((e as DOMException)?.name === 'AbortError') {
            setBusy(null); // usuário cancelou o diálogo de salvar
            return;
          }
          writer = null; // não suportado → fallback para blob em memória
        }
      }

      let totalChunks = 1;
      let chunkIndex = 0;
      do {
        const resp = await sendRequest('get', entry.path, undefined, { chunkIndex, chunkSize: CHUNK_SIZE });
        if (!resp.success) {
          setError(`Download ${entry.name}: ${resp.error || 'falha'}`);
          return;
        }
        const bytes = decodeFileData(resp.data);
        if (totalBytes === 0) totalBytes = resp.size ?? 0;
        totalChunks = resp.totalChunks ?? 1;

        if (bytes.length > 0) {
          loadedBytes += bytes.length;
          if (writer) {
            await writer.write(bytes);
          } else {
            memoryChunks.push(bytes);
          }
          emitProgress();
        }
        chunkIndex++;
      } while (chunkIndex < totalChunks);

      emitProgress(true);

      if (writer) {
        await writer.close();
        closed = true;
      } else {
        const blob = new Blob(memoryChunks.map((c) => c.slice().buffer as ArrayBuffer), { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      // Mantém a barra em 100% por um instante antes de limpar.
      setTimeout(() => { if (mountedRef.current) setTransfer(null); }, 800);
    } catch (err) {
      setError(`Download ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
      if (mountedRef.current) setTransfer(null);
    } finally {
      if (writer && !closed) {
        try { await writer.abort(); } catch { /* noop */ }
      }
      setBusy(null);
    }
  };

  const handleUpload = async (file: File) => {
    const targetPath = currentPath + file.name;
    setError(null);
    setBusy(`Upload ${file.name}`);

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const startedAt = performance.now();
    let loadedBytes = 0;
    let lastEmit = 0;

    const emitProgress = (force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 150) return;
      lastEmit = now;
      const elapsed = (now - startedAt) / 1000;
      const speedBps = elapsed > 0 ? loadedBytes / elapsed : 0;
      const etaSeconds = speedBps > 0 ? (file.size - loadedBytes) / speedBps : null;
      setTransfer({ kind: 'upload', name: file.name, loadedBytes, totalBytes: file.size, speedBps, etaSeconds });
    };

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = new Uint8Array(await file.slice(start, end).arrayBuffer());
        const resp = await sendRequest('put', targetPath, chunk, { chunkIndex: i, chunkSize: CHUNK_SIZE, totalChunks });
        if (!resp.success) {
          setError(`Upload ${file.name}: ${resp.error || 'falha'}`);
          return;
        }
        loadedBytes += chunk.length;
        emitProgress();
      }
      emitProgress(true);
      setTimeout(() => { if (mountedRef.current) setTransfer(null); }, 800);
      if (isConnected) loadFiles(currentPath);
    } catch (err) {
      setError(`Upload ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      if (mountedRef.current) setTransfer(null);
    } finally {
      setBusy(null);
    }
  };

  const handleRename = async (entry: FileEntry) => {
    openPrompt(
      `Renomear "${entry.name}"`,
      'Novo nome',
      entry.name,
      async (newName) => {
        if (!newName || newName === entry.name) return;
        const newPath = (entry.path.includes('\\') ? entry.path.slice(0, entry.path.lastIndexOf('\\') + 1) : '') + newName;
        const ok = await runAction(`Renomear ${entry.name}`, () => sendRequest('rename', entry.path, undefined, { newPath }));
        if (ok) loadFiles(currentPath);
      },
    );
  };

  const handleDelete = async (entry: FileEntry) => {
    openConfirm(
      `Apagar "${entry.name}"?`,
      entry.isDir ? 'Esta ação apagará a pasta e todo o seu conteúdo (recursivo).' : 'Esta ação apagará o arquivo permanentemente.',
      async () => {
        const ok = await runAction(`Apagar ${entry.name}`, () => sendRequest('delete', entry.path));
        if (ok) loadFiles(currentPath);
      },
    );
  };

  const handleMkdir = async () => {
    openPrompt('Nova pasta', 'Nome da nova pasta', '', async (name) => {
      if (!name) return;
      const ok = await runAction(`Criar pasta ${name}`, () => sendRequest('mkdir', currentPath + name));
      if (ok) loadFiles(currentPath);
    });
  };

  const handleRefresh = () => loadFiles(currentPath);

  // ── Clipboard (copiar/recortar/colar) ──
  const [clipboard, setClipboard] = useState<{ path: string; cut: boolean; paths?: string[] } | null>(null);

  const handleCopy = (entry: FileEntry) => {
    setClipboard({ path: entry.path, cut: false, paths: [entry.path] });
    setError(null);
  };

  const handleCut = (entry: FileEntry) => {
    setClipboard({ path: entry.path, cut: true, paths: [entry.path] });
    setError(null);
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    const paths = clipboard.paths ?? [clipboard.path];
    if (paths.some((src) => {
      const name = src.split(/[\\/]/).pop() || '';
      return src === currentPath + name;
    })) {
      setError('Origem e destino são o mesmo caminho.');
      return;
    }
    const results = await Promise.allSettled(
      paths.map((src) => {
        const name = src.split(/[\\/]/).pop() || '';
        const dest = currentPath + name;
        return runAction(
          `${clipboard.cut ? 'Mover' : 'Copiar'} ${name}`,
          () => sendRequest(clipboard.cut ? 'move' : 'copy', src, undefined, { newPath: dest }),
        );
      }),
    );
    const anyOk = results.some((r) => r.status === 'fulfilled' && r.value === true);
    if (anyOk) {
      setClipboard(null);
      loadFiles(currentPath);
    }
  };

  const handleZip = async (entry: FileEntry) => {
    const name = entry.name + '.zip';
    const ok = await runAction(`Compactar ${entry.name}`, () =>
      sendRequest('zip', entry.path, undefined, { newPath: currentPath + name, paths: [entry.path] }),
    );
    if (ok) loadFiles(currentPath);
  };

  // Compacta múltiplos itens selecionados em um único .zip.
  const handleZipSelection = async () => {
    if (selectedPaths.size === 0) return;
    const list = [...selectedPaths];
    // Nome do zip: usa o primeiro item ou "selecao".
    const first = list[0].split(/[\\/]/).pop() || 'selecao';
    const zipName = first.replace(/\.[^.]+$/, '') + '.zip';
    const ok = await runAction(`Compactar ${list.length} item(ns)`, () =>
      sendRequest('zip', list[0], undefined, { newPath: currentPath + zipName, paths: list }),
    );
    if (ok) {
      clearSelection();
      loadFiles(currentPath);
    }
  };

  const handleUnzip = async (entry: FileEntry) => {
    if (entry.isDir) return;
    const base = entry.name.replace(/\.zip$/i, '') || 'extraido';
    const dest = currentPath + base;
    const ok = await runAction(`Descompactar ${entry.name}`, () =>
      sendRequest('unzip', entry.path, undefined, { newPath: dest }),
    );
    if (ok) loadFiles(currentPath);
  };

  // ── Múltipla seleção ──
  const isSelected = (path: string) => selectedPaths.has(path);

  const toggleSelect = (entry: FileEntry, additive: boolean) => {
    setSelectedPaths((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  };

  const handleRowClick = (f: FileEntry, e: React.MouseEvent) => {
    if (f.isDir) {
      // Clique simples em pasta sempre navega (com Ctrl/Shift ainda seleciona,
      // mas navegação é a ação natural — mantém UX de explorador simples).
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        toggleSelect(f, true);
      } else {
        setSelectedPaths(new Set());
        navigateTo(f.path);
      }
      return;
    }
    // Arquivo: Ctrl/⌘ alterna; Shift adiciona; clique simples seleciona só este.
    toggleSelect(f, e.ctrlKey || e.metaKey || e.shiftKey);
  };

  const clearSelection = () => setSelectedPaths(new Set());

  const handleCopySelection = () => {
    if (selectedPaths.size === 0) return;
    // Clipboard multi-item: guarda a lista de paths.
    setClipboard({ path: [...selectedPaths][0], cut: false, paths: [...selectedPaths] });
    setError(null);
  };

  const handleCutSelection = () => {
    if (selectedPaths.size === 0) return;
    setClipboard({ path: [...selectedPaths][0], cut: true, paths: [...selectedPaths] });
    setError(null);
  };

  const handleDeleteSelection = () => {
    if (selectedPaths.size === 0) return;
    const list = [...selectedPaths];
    openConfirm(
      `Apagar ${list.length} item(ns)?`,
      'Estes itens serão apagados permanentemente.',
      async () => {
        let ok = false;
        for (const p of list) {
          ok = await runAction(`Apagar`, () => sendRequest('delete', p)) || ok;
        }
        if (ok) {
          clearSelection();
          loadFiles(currentPath);
        }
      },
    );
  };

  // ── Menu de contexto (clique direito) ──
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const [ctxPos, setCtxPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);

  const openContextMenu = (e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    // Clique direito em um item não selecionado: seleciona só ele (contexto
    // natural). Se já está na seleção múltipla, preserva a seleção.
    if (entry && !selectedPaths.has(entry.path)) {
      setSelectedPaths(new Set([entry.path]));
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
    setCtxPos({ left: e.clientX, top: e.clientY });
  };

  // Reposiciona o menu se ele estourar os limites da viewport.
  useLayoutEffect(() => {
    if (!ctxMenu) return;
    const el = ctxMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = ctxMenu.x;
    let top = ctxMenu.y;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (left !== ctxPos.left || top !== ctxPos.top) setCtxPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxMenu, ctxPos.left, ctxPos.top]);

  // Fecha o menu ao clicar fora ou pressionar Esc.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  const runCtx = (fn: () => void) => {
    setCtxMenu(null);
    fn();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-xs">
        <span className="text-slate-500">📁</span>
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitPath();
            if (e.key === 'Escape') setPathInput(currentPath);
          }}
          onBlur={() => setPathInput(currentPath)}
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent font-mono text-slate-300 text-xs px-1 py-0.5 rounded border border-transparent focus:border-sky-500 focus:outline-none"
          title="Caminho atual — pressione Enter para navegar"
        />
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
        {clipboard && (
          <button
            className="px-2 py-0.5 bg-sky-800/60 text-sky-200 rounded hover:bg-sky-700 disabled:opacity-50"
            onClick={handlePaste}
            disabled={busy !== null || !isConnected}
            title={`Colar ${clipboard.cut ? '(recortado)' : '(copiado)'}: ${clipboard.path}`}
          >
            📋 Colar {clipboard.cut ? '(mover)' : ''}
          </button>
        )}
      </div>

      {/* Status / error banner */}
      {busy && !transfer && !opProgress && (
        <div className="px-3 py-1.5 bg-blue-900/40 text-blue-300 text-xs">{busy}...</div>
      )}
      {transfer && <TransferProgressBar transfer={transfer} />}
      {opProgress && !transfer && (
        <OperationProgressBar label={busy ?? 'Operação'} progress={opProgress} />
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
      <div
        className="flex-1 min-h-0 overflow-auto"
        onContextMenu={(e) => openContextMenu(e, null)}
      >
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
                <tr
                  className="hover:bg-slate-800 cursor-pointer border-b border-slate-800/50"
                  onClick={() => navigateTo('..')}
                  onContextMenu={(e) => openContextMenu(e, null)}
                >
                  <td className="px-3 py-2">📁</td>
                  <td className="px-3 py-2 text-slate-400">..</td>
                  <td></td><td></td>
                </tr>
              )}
              {files.map((f) => (
                <tr
                  key={f.path || f.name}
                  className={`hover:bg-slate-800 border-b border-slate-800/50 ${f.isDir ? 'cursor-pointer' : 'cursor-default'} ${isSelected(f.path) ? 'bg-slate-700/60' : ''}`}
                  onClick={(e) => handleRowClick(f, e)}
                  onContextMenu={(e) => openContextMenu(e, f)}
                >
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

      {/* Menu de contexto (clique direito) */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[180px] max-w-[280px] bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 text-xs overflow-y-auto"
          style={{ left: ctxPos.left, top: ctxPos.top, maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.entry && (
            <>
              {selectedPaths.size <= 1 && !ctxMenu.entry.isDir && (
                <button
                  className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                  onClick={() => runCtx(() => handleDownload(ctxMenu.entry!))}
                >
                  ⬇ Baixar
                </button>
              )}
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(() => { selectedPaths.size > 1 ? handleCopySelection() : handleCopy(ctxMenu.entry!); })}
              >
                📄 {selectedPaths.size > 1 ? `Copiar (${selectedPaths.size})` : 'Copiar'}
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(() => { selectedPaths.size > 1 ? handleCutSelection() : handleCut(ctxMenu.entry!); })}
              >
                ✂ {selectedPaths.size > 1 ? `Recortar (${selectedPaths.size})` : 'Recortar'}
              </button>
              {selectedPaths.size <= 1 && (
                <>
                  <button
                    className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                    onClick={() => runCtx(() => handleRename(ctxMenu.entry!))}
                  >
                    ✎ Renomear
                  </button>
                  {!ctxMenu.entry.isDir && ctxMenu.entry.name.toLowerCase().endsWith('.zip') && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                      onClick={() => runCtx(() => handleUnzip(ctxMenu.entry!))}
                    >
                      📂 Descompactar
                    </button>
                  )}
                </>
              )}
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(() => { selectedPaths.size > 1 ? handleZipSelection() : handleZip(ctxMenu.entry!); })}
              >
                🗜 {selectedPaths.size > 1 ? `Compactar (${selectedPaths.size})` : 'Compactar (.zip)'}
              </button>
              <div className="my-1 border-t border-slate-700" />
              <button
                className="w-full text-left px-3 py-1.5 text-red-300 hover:bg-red-900/40"
                onClick={() => runCtx(() => { selectedPaths.size > 1 ? handleDeleteSelection() : handleDelete(ctxMenu.entry!); })}
              >
                🗑 {selectedPaths.size > 1 ? `Apagar (${selectedPaths.size})` : 'Apagar'}
              </button>
            </>
          )}
          {!ctxMenu.entry && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(handleMkdir)}
              >
                + Nova pasta
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(() => fileInputRef.current?.click())}
              >
                ↑ Upload
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-slate-200 hover:bg-slate-700"
                onClick={() => runCtx(handleRefresh)}
              >
                ↻ Atualizar
              </button>
              {clipboard && (
                <button
                  className="w-full text-left px-3 py-1.5 text-sky-200 hover:bg-slate-700"
                  onClick={() => runCtx(handlePaste)}
                >
                  📋 Colar {clipboard.cut ? '(mover)' : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal inline (prompt/confirm) */}
      {modal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div
            className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-96 max-w-[90%] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-200 mb-2">{modal.title}</h3>
            {modal.message && <p className="text-xs text-slate-400 mb-3">{modal.message}</p>}
            {modal.inputLabel !== undefined && (
              <label className="block text-xs text-slate-400 mb-1">{modal.inputLabel}</label>
            )}
            {modal.inputLabel !== undefined && (
              <input
                autoFocus
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitModal(); if (e.key === 'Escape') closeModal(); }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 mb-3 focus:outline-none focus:border-sky-500"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                className={`px-3 py-1.5 rounded text-xs font-medium ${modal.danger ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
                onClick={submitModal}
              >
                {modal.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Barra de progresso de transferência (upload/download) com percentual,
// velocidade média e tempo estimado de conclusão.
function TransferProgressBar({ transfer }: { transfer: TransferState }) {
  const pct = transfer.totalBytes > 0
    ? Math.min(100, (transfer.loadedBytes / transfer.totalBytes) * 100)
    : 0;
  const isUpload = transfer.kind === 'upload';
  return (
    <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-slate-300 truncate">
          {isUpload ? '⬆' : '⬇'} {transfer.name}
        </span>
        <span className="text-slate-400 whitespace-nowrap">
          {formatSize(transfer.loadedBytes)} / {formatSize(transfer.totalBytes)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
        <div
          className={`h-full transition-[width] duration-150 ease-linear ${isUpload ? 'bg-sky-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1 text-slate-500">
        <span>{formatSpeed(transfer.speedBps)}</span>
        <span>Restante: {formatEta(transfer.etaSeconds)}</span>
      </div>
    </div>
  );
}

// Barra de progresso de operações longas no agent (copy/move/zip/unzip),
// alimentada pelos eventos files.progress.
function OperationProgressBar({ label, progress }: { label: string; progress: { loaded: number; total: number } }) {
  const pct = progress.total > 0
    ? Math.min(100, (progress.loaded / progress.total) * 100)
    : 0;
  return (
    <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-slate-300 truncate">{label}</span>
        <span className="text-slate-400 whitespace-nowrap">
          {formatSize(progress.loaded)} / {formatSize(progress.total)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
        <div
          className="h-full transition-[width] duration-150 ease-linear bg-violet-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

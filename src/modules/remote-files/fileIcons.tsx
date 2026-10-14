import {
  AppWindow,
  ArrowUpRight,
  Binary,
  BookText,
  Cog,
  Database,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  FolderUp,
  HardDrive,
  Music,
  Presentation,
  ScrollText,
  Video,
  type LucideIcon,
} from 'lucide-react';

/**
 * Classificacao visual de arquivos do navegador remoto.
 *
 * O icone e derivado da extensao (nao do conteudo), igual ao Explorer: cada
 * familia recebe um icone Lucide e uma cor. O objetivo e o operador reconhecer
 * .db, .log, .zip, .exe etc. de relance, sem ler o nome.
 */
export type FileKind =
  | 'folder'
  | 'parent'
  | 'archive'
  | 'database'
  | 'log'
  | 'text'
  | 'code'
  | 'config'
  | 'sheet'
  | 'document'
  | 'pdf'
  | 'slide'
  | 'image'
  | 'video'
  | 'audio'
  | 'executable'
  | 'font'
  | 'disk'
  | 'binary'
  | 'file';

const EXTENSION_KINDS: Record<string, FileKind> = {
  // Compactados
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  tgz: 'archive', bz2: 'archive', xz: 'archive', zst: 'archive', cab: 'archive',
  // Bancos de dados
  db: 'database', sqlite: 'database', sqlite3: 'database', db3: 'database',
  mdb: 'database', accdb: 'database', dbf: 'database',
  // Logs e texto
  log: 'log', txt: 'text', md: 'text', rtf: 'text', nfo: 'text',
  // Codigo / scripts
  ps1: 'code', psm1: 'code', psd1: 'code', bat: 'code', cmd: 'code', sh: 'code',
  bash: 'code', zsh: 'code', py: 'code', js: 'code', jsx: 'code', mjs: 'code',
  cjs: 'code', ts: 'code', tsx: 'code', cs: 'code', go: 'code', java: 'code',
  php: 'code', rb: 'code', pl: 'code', lua: 'code', c: 'code', h: 'code',
  cpp: 'code', hpp: 'code', vb: 'code', vbs: 'code', sql: 'code', html: 'code',
  htm: 'code', css: 'code', scss: 'code', less: 'code', vue: 'code', svelte: 'code',
  // Configuracao
  json: 'config', xml: 'config', yml: 'config', yaml: 'config', ini: 'config',
  cfg: 'config', conf: 'config', toml: 'config', properties: 'config', env: 'config',
  reg: 'config', inf: 'config', plist: 'config',
  // Planilhas
  csv: 'sheet', tsv: 'sheet', xls: 'sheet', xlsx: 'sheet', xlsm: 'sheet', ods: 'sheet',
  // Documentos
  doc: 'document', docx: 'document', odt: 'document', pdf: 'pdf',
  ppt: 'slide', pptx: 'slide', odp: 'slide',
  // Midia
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image',
  webp: 'image', svg: 'image', ico: 'image', tif: 'image', tiff: 'image',
  heic: 'image', avif: 'image',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video',
  flv: 'video', webm: 'video', m4v: 'video', mpg: 'video', mpeg: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
  aac: 'audio', wma: 'audio', opus: 'audio',
  // Executaveis / bibliotecas
  exe: 'executable', msi: 'executable', msix: 'executable', dll: 'executable',
  sys: 'executable', com: 'executable', scr: 'executable', appx: 'executable',
  // Fontes
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  // Imagens de disco / bruto
  iso: 'disk', img: 'disk', vhd: 'disk', vhdx: 'disk', vmdk: 'disk',
  bin: 'binary', dat: 'binary', bak: 'binary', tmp: 'binary', dump: 'binary',
};

const KIND_VISUALS: Record<FileKind, { Icon: LucideIcon; className: string; label: string }> = {
  folder: { Icon: Folder, className: 'text-amber-500', label: 'Pasta' },
  parent: { Icon: FolderUp, className: 'text-muted', label: 'Pasta superior' },
  archive: { Icon: FileArchive, className: 'text-violet-500', label: 'Arquivo compactado' },
  database: { Icon: Database, className: 'text-cyan-500', label: 'Banco de dados' },
  log: { Icon: ScrollText, className: 'text-sky-500', label: 'Arquivo de log' },
  text: { Icon: FileText, className: 'text-muted', label: 'Arquivo de texto' },
  code: { Icon: FileCode, className: 'text-emerald-500', label: 'Script / codigo' },
  config: { Icon: Cog, className: 'text-teal-500', label: 'Configuracao' },
  sheet: { Icon: FileSpreadsheet, className: 'text-green-500', label: 'Planilha' },
  document: { Icon: BookText, className: 'text-blue-500', label: 'Documento' },
  pdf: { Icon: BookText, className: 'text-rose-500', label: 'Documento PDF' },
  slide: { Icon: Presentation, className: 'text-orange-500', label: 'Apresentacao' },
  image: { Icon: FileImage, className: 'text-pink-500', label: 'Imagem' },
  video: { Icon: Video, className: 'text-purple-500', label: 'Video' },
  audio: { Icon: Music, className: 'text-fuchsia-500', label: 'Audio' },
  executable: { Icon: AppWindow, className: 'text-orange-400', label: 'Executavel' },
  font: { Icon: FileType, className: 'text-indigo-500', label: 'Fonte' },
  disk: { Icon: HardDrive, className: 'text-yellow-500', label: 'Imagem de disco' },
  binary: { Icon: Binary, className: 'text-red-500', label: 'Arquivo binario' },
  file: { Icon: File, className: 'text-muted', label: 'Arquivo' },
};

/** Extensao em minusculas, sem o ponto. String vazia quando nao ha extensao. */
export function extensionOf(name: string): string {
  const base = name.trim();
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** Define a familia visual a partir do nome (ou pasta, quando isDir). */
export function fileKindOf(name: string, isDir = false): FileKind {
  if (isDir) return 'folder';
  const base = name.trim();
  // Dotfiles (.gitignore, .env) sao tratados como configuracao.
  if (base.startsWith('.') && base.lastIndexOf('.') === 0) return 'config';
  const ext = extensionOf(base);
  if (!ext) return 'file';
  return EXTENSION_KINDS[ext] ?? 'file';
}

interface FileIconProps {
  name?: string;
  isDir?: boolean;
  isLink?: boolean;
  /** Renderiza o icone de "pasta superior" (linha ..). */
  parent?: boolean;
  className?: string;
}

/**
 * Icone quadrado (16px) com cor por tipo. Links ganham um selo de atalho no
 * canto, no lugar do antigo emoji colado ao nome.
 */
export function FileIcon({ name = '', isDir = false, isLink = false, parent = false, className }: FileIconProps) {
  const visual = parent ? KIND_VISUALS.parent : KIND_VISUALS[fileKindOf(name, isDir)];
  const Icon = visual.Icon;
  return (
    <span
      className={'relative inline-flex h-4 w-4 shrink-0 items-center justify-center ' + (className ?? '')}
      title={visual.label}
      aria-label={visual.label}
      role="img"
    >
      <Icon className={'h-4 w-4 ' + visual.className} strokeWidth={1.75} aria-hidden="true" />
      {isLink && (
        <ArrowUpRight
          className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-surface text-accent"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export default FileIcon;

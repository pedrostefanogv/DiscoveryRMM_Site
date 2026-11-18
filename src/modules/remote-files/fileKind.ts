/**
 * Classificacao visual de arquivos do navegador remoto.
 *
 * O icone e derivado da extensao (nao do conteudo), igual ao Explorer: cada
 * familia recebe um icone Material Symbol e uma cor. O objetivo e o operador
 * reconhecer .db, .log, .zip, .exe etc. de relance, sem ler o nome.
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

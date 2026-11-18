
import { Icon, type MaterialSymbolName } from '@/components/ui';
import { fileKindOf, type FileKind } from './fileKind';

const KIND_VISUALS: Record<FileKind, { icon: MaterialSymbolName; className: string; label: string }> = {
  folder: { icon: "folder", className: 'text-amber-500', label: 'Pasta' },
  parent: { icon: "drive_folder_upload", className: 'text-muted', label: 'Pasta superior' },
  archive: { icon: "folder_zip", className: 'text-violet-500', label: 'Arquivo compactado' },
  database: { icon: "database", className: 'text-cyan-500', label: 'Banco de dados' },
  log: { icon: "article", className: 'text-sky-500', label: 'Arquivo de log' },
  text: { icon: "description", className: 'text-muted', label: 'Arquivo de texto' },
  code: { icon: "code", className: 'text-emerald-500', label: 'Script / codigo' },
  config: { icon: "settings", className: 'text-teal-500', label: 'Configuracao' },
  sheet: { icon: "table", className: 'text-green-500', label: 'Planilha' },
  document: { icon: "menu_book", className: 'text-blue-500', label: 'Documento' },
  pdf: { icon: "menu_book", className: 'text-rose-500', label: 'Documento PDF' },
  slide: { icon: "present_to_all", className: 'text-orange-500', label: 'Apresentacao' },
  image: { icon: "image", className: 'text-pink-500', label: 'Imagem' },
  video: { icon: "videocam", className: 'text-purple-500', label: 'Video' },
  audio: { icon: "music_note", className: 'text-fuchsia-500', label: 'Audio' },
  executable: { icon: "web_asset", className: 'text-orange-400', label: 'Executavel' },
  font: { icon: "description", className: 'text-indigo-500', label: 'Fonte' },
  disk: { icon: "storage", className: 'text-yellow-500', label: 'Imagem de disco' },
  binary: { icon: "code", className: 'text-red-500', label: 'Arquivo binario' },
  file: { icon: "draft", className: 'text-muted', label: 'Arquivo' },
};

interface FileIconProps {
  name?: string;
  isDir?: boolean;
  isLink?: boolean;
  /** Renderiza o icone de "pasta superior" (linha ..). */
  parent?: boolean;
  /** Esmaece o icone quando o item tem atributo HIDDEN no Windows. */
  isHidden?: boolean;
  className?: string;
}

/**
 * Icone quadrado (16px) com cor por tipo. Links ganham um selo de atalho no
 * canto, no lugar do antigo emoji colado ao nome. Itens ocultos ficam com
 * opacidade reduzida e o rotulo ganha o sufixo "(oculto)".
 */
export function FileIcon({ name = '', isDir = false, isLink = false, parent = false, isHidden = false, className }: FileIconProps) {
  const visual = parent ? KIND_VISUALS.parent : KIND_VISUALS[fileKindOf(name, isDir)];
  const label = isHidden ? `${visual.label} (oculto)` : visual.label;
  return (
    <span
      className={'relative inline-flex h-4 w-4 shrink-0 items-center justify-center ' + (isHidden ? 'opacity-40 ' : '') + (className ?? '')}
      title={label}
      aria-label={label}
      role="img"
    >
      <Icon name={visual.icon} className={'h-4 w-4 ' + visual.className} aria-hidden="true" />
      {isLink && (
        <Icon name="arrow_outward"
          className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-surface text-accent"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export default FileIcon;

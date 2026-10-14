import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
  type DragEvent,
} from 'react';
import toast from 'react-hot-toast';
import { ImagePlus } from 'lucide-react';
import type { Components } from 'react-markdown';
import { useTheme } from '@/theme/ThemeContext';
import {
  KB_IMAGE_ACCEPT,
  kbUrlTransform,
  parseKbImageSrc,
  validateKbImageFile,
} from '@/utils/kbImage';
import { KbMarkdownImage } from './KbMarkdownImage';

// Editor Markdown (pacote @uiw/react-md-editor ~1.2 MB) carregado sob demanda.
// Compartilhado entre o editor do artigo e o gerenciador de sub-páginas.
const MarkdownEditorLazy = lazy(() =>
  import('@uiw/react-md-editor').then((m) => ({ default: m.default })),
);

type MdEditorProps = ComponentProps<typeof MarkdownEditorLazy>;
type MdCommand = NonNullable<MdEditorProps['extraCommands']>[number];
type MdPreviewOptions = NonNullable<MdEditorProps['previewOptions']>;

/** Filtra apenas arquivos de imagem de um DataTransfer/Clipboard. */
function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Altura do editor em px (padrão 200). */
  height?: number;
  /** Rótulo exibido acima do editor. */
  label?: string;
  /** Texto de ajuda exibido abaixo do editor. */
  hint?: string;
  /** Artigo dono das imagens (habilita a resolução de kbimage: no preview). */
  articleId?: string;
  /**
   * Envia uma imagem e devolve o token Markdown a inserir. Sem este handler a
   * inserção de imagens (toolbar, colar e arrastar/soltar) fica desabilitada.
   */
  /**
   * Envia uma imagem e devolve o token Markdown a inserir. `size` é o tamanho
   * escolhido no seletor da barra do editor (null = natural).
   */
  onImageUpload?: (file: File, size: string | null) => Promise<string | null>;
  /** Explicação exibida quando o upload de imagem está indisponível. */
  imageDisabledReason?: string;
}

/**
 * Editor Markdown reutilizável (estilo Notion), carregado sob demanda.
 * Usa o mesmo `@uiw/react-md-editor` em toda a base de conhecimento,
 * respeitando o tema claro/escuro.
 */
export function MarkdownEditor({
  value,
  onChange,
  height = 200,
  label,
  hint,
  articleId,
  onImageUpload,
  imageDisabledReason,
}: MarkdownEditorProps) {
  const { mode } = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guarda COMO inserir o token depois do upload disparado pela toolbar.
  const insertTokenRef = useRef<((token: string) => void) | null>(null);
  // Valor mais recente do editor: o upload leva segundos e o snapshot da closure
  // de paste/drop apagaria o que o usuário digitasse nesse intervalo.
  const valueRef = useRef(value);
  valueRef.current = value;

  const imagesDisabled = !onImageUpload;
  const disabledReason = imageDisabledReason ?? 'Envio de imagens indisponível.';

  // Tamanho aplicado nas PRÓXIMAS imagens inseridas (toolbar/colar/soltar).
  // O ajuste do que já está no texto é feito pelo painel de imagens do artigo.
  const [imageSize, setImageSize] = useState<string | null>(null);
  const [customPx, setCustomPx] = useState('');
  const effectiveSize = normalizeKbImageSize(customPx) ?? imageSize;

  // Envia os arquivos em sequência; `insert` decide onde o token entra.
  const processFiles = useCallback(
    async (files: File[], insert: (token: string) => void, size: string | null) => {
      if (!onImageUpload || files.length === 0) return;

      for (const file of files) {
        const validationError = validateKbImageFile(file);
        if (validationError) {
          toast.error(validationError);
          continue;
        }

        const toastId = toast.loading(`Enviando ${file.name}...`);
        try {
          const token = await onImageUpload(file, size);
          if (!token) {
            toast.error(`Não foi possível enviar ${file.name}.`, { id: toastId });
            continue;
          }
          insert(token);
          toast.success(`Imagem inserida: ${file.name}`, { id: toastId });
        } catch (error) {
          const detail =
            error instanceof Error && error.message ? error.message : 'falha no envio';
          toast.error(`Não foi possível enviar ${file.name} — ${detail}`, { id: toastId });
        }
      }
    },
    [onImageUpload],
  );

  // Atalho local: usa o tamanho atual do seletor em toolbar/colar/soltar.
  const runUpload = useCallback(
    (files: File[], insert: (token: string) => void) =>
      processFiles(files, insert, effectiveSize),
    [effectiveSize, processFiles],
  );

  // Toolbar: o `<input type="file">` escondido resolve o diálogo do sistema.
  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      // Captura a função de inserção ANTES do loop: com vários arquivos o
      // mesmo api.replaceSelection insere cada token em sequência.
      const insert = insertTokenRef.current;
      insertTokenRef.current = null;
      void processFiles(files, (token) => insert?.(token));
    },
    [processFiles],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = imageFilesFrom(event.clipboardData?.files);
      if (files.length === 0) return;
      event.preventDefault();

      if (!onImageUpload) {
        toast.error(disabledReason);
        return;
      }

      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const snapshot = value;
      // Acumula os tokens e insere UMA vez, preservando a ordem e evitando que
      // inserções sucessivas sobrescrevam umas às outras (o value é imutável).
      const tokens: string[] = [];
      void processFiles(files, (token) => {
        tokens.push(token);
      }).then(() => {
        if (tokens.length === 0) return;
        const current = valueRef.current;
        // Se o usuário digitou durante o envio, a posição capturada não vale mais:
        // insere no fim do texto atual em vez de descartar a digitação.
        const insertAt = current === snapshot ? start : current.length;
        const insertEnd = current === snapshot ? end : current.length;
        onChange(
          `${current.slice(0, insertAt)}${tokens.join("")}${current.slice(insertEnd)}`,
        );
      });
    },
    [disabledReason, onChange, onImageUpload, processFiles, value],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      const dropped = event.dataTransfer?.files;
      if (!dropped || dropped.length === 0) return;
      // Soltar QUALQUER arquivo no editor não pode cair na navegação padrão do
      // webview (abrir o arquivo e perder o trabalho não salvo).
      event.preventDefault();

      const files = imageFilesFrom(dropped);
      if (files.length === 0) {
        toast.error('Só imagens podem ser anexadas ao artigo.');
        return;
      }

      if (!onImageUpload) {
        toast.error(disabledReason);
        return;
      }

      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const snapshot = value;
      const tokens: string[] = [];
      void processFiles(files, (token) => {
        tokens.push(token);
      }).then(() => {
        if (tokens.length === 0) return;
        const current = valueRef.current;
        const insertAt = current === snapshot ? start : current.length;
        const insertEnd = current === snapshot ? end : current.length;
        onChange(
          `${current.slice(0, insertAt)}${tokens.join("")}${current.slice(insertEnd)}`,
        );
      });
    },
    [disabledReason, onChange, onImageUpload, processFiles, value],
  );

  const extraCommands = useMemo<MdCommand[]>(
    () => [
      {
        name: 'insert-image',
        keyCommand: 'insert-image',
        icon: <ImagePlus className="h-4 w-4" aria-hidden="true" />,
        buttonProps: {
          'aria-label': 'Inserir imagem',
          title: imagesDisabled ? disabledReason : 'Inserir imagem',
          disabled: imagesDisabled,
        },
        execute: (_state, api) => {
          if (!onImageUpload) return;
          // Insere no ponto/seleção atual do textarea no momento em que o
          // arquivo é escolhido (o diálogo modal não altera o cursor). Se havia
          // seleção, o replaceSelection a substitui pelo token — mesmo
          // comportamento dos atalhos nativos do editor.
          insertTokenRef.current = (token: string) => {
            api.replaceSelection(token);
          };
          inputRef.current?.click();
        },
      },
    ],
    [disabledReason, imagesDisabled, onImageUpload],
  );

  // O preview do editor também precisa do urlTransform: sem ele o
  // defaultUrlTransform do react-markdown apaga o src de kbimage:.
  const previewOptions = useMemo<MdPreviewOptions>(() => {
    const components: Components = articleId
      ? {
          img: ({ src, alt }: ComponentProps<'img'>) => (
            <KbMarkdownImage articleId={articleId} src={src} alt={alt} />
          ),
        }
      : {
          img: ({ src, alt }: ComponentProps<'img'>) => {
            if (parseKbImageSrc(src)) {
              return (
                <span className="text-xs text-muted">
                  Imagem privada — salve o artigo para visualizá-la.
                </span>
              );
            }
            return src ? <img src={src} alt={alt ?? ''} /> : null;
          },
        };

    return { components, urlTransform: kbUrlTransform };
  }, [articleId]);

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div
        data-color-mode={mode}
        className="overflow-hidden rounded-xl border border-border bg-background"
      >
        <Suspense fallback={<MarkdownEditorSkeleton height={height} />}>
          <MarkdownEditorLazy
            value={value}
            height={height}
            onChange={(next) => onChange(next ?? '')}
            extraCommands={extraCommands}
            textareaProps={{ onPaste: handlePaste, onDrop: handleDrop }}
            previewOptions={previewOptions}
          />
        </Suspense>
        <input
          ref={inputRef}
          type="file"
          accept={KB_IMAGE_ACCEPT}
          multiple
          hidden
          onChange={handleInputChange}
        />
      </div>
      {imagesDisabled && imageDisabledReason && (
        <p className="mt-2 text-xs text-muted">{imageDisabledReason}</p>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Fallback enquanto o editor Markdown pesado é carregado (evita flash).
function MarkdownEditorSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-light px-1 py-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="h-6 w-6 animate-pulse rounded bg-surface-hover" />
        ))}
      </div>
      <div className="flex flex-1 gap-px bg-border">
        <div className="flex-1 animate-pulse bg-background p-3">
          <div className="h-4 w-2/3 rounded bg-surface-hover" />
          <div className="mt-2 h-4 w-1/2 rounded bg-surface-hover" />
          <div className="mt-2 h-4 w-3/4 rounded bg-surface-hover" />
        </div>
      </div>
    </div>
  );
}

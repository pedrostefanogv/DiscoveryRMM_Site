import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle, ArrowLeft, CheckCircle2, FileArchive, Image as ImageIcon, Loader2, Package, RotateCcw, Save, Search,
  Terminal, Trash2, Upload, X,
} from 'lucide-react';
import { Button, Card, ConfirmDialog, ErrorDisplay, Input, Loading, Select, TextArea } from '@/components/ui';
import {
  ASSET_MULTIPART_MIN_BYTES,
  appStoreApi,
  discardUnlinkedAsset,
  forgetUploadedAsset,
} from '@/api/app-store';
import type { UploadProgress } from '@/api/client';
import {
  AppCommandKind, AppDetectionMode, AppInstallationType,
} from '@/api/types';
import { useAppStorePackage, useDeleteCustomPackageFile, useUpsertCustomPackage } from '@/hooks/useAppStore';
import { MarkdownField } from './components/MarkdownField';
import { SoftwareInventoryPicker, type InventorySoftwareSelection } from './components/SoftwareInventoryPicker';
import { formatBytes, formatEta, slugifyPackageId } from './softwareStoreUtils';

const STORE_PATH = '/software/store';

/** Limite do servidor para o comando de detecção (varchar(2000)). */
const DETECTION_COMMAND_MAX = 2000;
/** Limite do servidor para os comandos de instalação/desinstalação. */
const COMMAND_MAX = 1000;

const commandKindOptions = [
  { value: String(AppCommandKind.Command), label: 'Comando único (cmd /C)' },
  { value: String(AppCommandKind.CmdScript), label: 'Script CMD/BAT (.cmd)' },
  { value: String(AppCommandKind.PowerShellScript), label: 'Script PowerShell (.ps1)' },
];

const detectionModeOptions = [
  { value: String(AppDetectionMode.None), label: 'Nenhuma' },
  { value: String(AppDetectionMode.InventoryLink), label: 'Vincular a app do inventário' },
  { value: String(AppDetectionMode.Command), label: 'Comando de detecção (PowerShell)' },
];

/**
 * Texto de ajuda exato do contrato (§1.4 do plano): explica o que cada
 * placeholder significa e o erro clássico de repetir o nome do arquivo.
 */
function PlaceholderHelp() {
  return (
    <div className="rounded-lg border border-border bg-surface-light p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Placeholders disponíveis nos comandos</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        <li>
          <code className="font-mono text-foreground">{'{{installer}}'}</code> = <strong className="text-foreground">caminho completo
          do arquivo baixado, já incluindo o nome do arquivo</strong> (ex.:{' '}
          <code className="font-mono">{'C:\\Users\\...\\Temp\\discovery-custom-123\\Setup.exe'}</code>). Use entre aspas quando
          houver espaços. <strong className="text-foreground">Não</strong> acrescente o nome do arquivo depois do placeholder.
        </li>
        <li>
          <code className="font-mono text-foreground">{'{{installerDir}}'}</code> = <strong className="text-foreground">pasta</strong>{' '}
          onde o arquivo foi baixado (sem o nome). Quando “O arquivo é um ZIP” está marcado, é a pasta raiz do conteúdo extraído.
        </li>
        <li>
          Aliases aceitos: <code className="font-mono text-foreground">%INSTALLER%</code> e{' '}
          <code className="font-mono text-foreground">%INSTALLER_DIR%</code>.
        </li>
      </ul>
      <p className="mt-1.5">
        Use <strong className="text-foreground">Comando único</strong> para uma linha, <strong className="text-foreground">Script
        CMD/BAT</strong> ou <strong className="text-foreground">Script PowerShell</strong> para vários passos (extrair ZIP, copiar
        arquivos, registrar serviço etc.).
      </p>
    </div>
  );
}

interface FormState {
  packageId: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  iconUrl: string;
  installCommand: string;
  installCommandKind: AppCommandKind;
  uninstallCommand: string;
  uninstallCommandKind: AppCommandKind;
  extractZip: boolean;
  detectionMode: AppDetectionMode;
  inventorySoftwareId: string;
  detectionName: string;
  detectionPublisher: string;
  detectionMinVersion: string;
  detectionCommand: string;
}

const EMPTY_FORM: FormState = {
  packageId: '',
  name: '',
  version: '',
  publisher: '',
  description: '',
  iconUrl: '',
  installCommand: '',
  installCommandKind: AppCommandKind.Command,
  uninstallCommand: '',
  uninstallCommandKind: AppCommandKind.Command,
  extractZip: false,
  detectionMode: AppDetectionMode.None,
  inventorySoftwareId: '',
  detectionName: '',
  detectionPublisher: '',
  detectionMinVersion: '',
  detectionCommand: '',
};

interface AssetState {
  objectKey: string;
  bucket: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  checksum?: string | null;
}

/**
 * Envio de um asset iniciado NO PRÓPRIO CARD do arquivo (ao selecionar), e não
 * no "Salvar": o upload de um instalador de vários GiB demora, então ele tem
 * progresso, estado e retentativa próprios — e o Salvar fica só com os metadados.
 */
type AssetUpload = {
  status: 'uploading' | 'done' | 'error' | 'canceled';
  fileName: string;
  loaded: number;
  total: number;
  percent: number;
  error?: string;
  /** Velocidade medida pelo XHR (bytes/s) — alimenta a estimativa de tempo. */
  bytesPerSecond?: number;
  /** Segundos restantes estimados; undefined enquanto não dá para estimar. */
  etaSeconds?: number;
};

const ASSET_UPLOAD_LABEL: Record<'installer' | 'icon', string> = {
  installer: 'Enviando o instalador para o object storage…',
  icon: 'Enviando o ícone/capa para o object storage…',
};

/** Campos comparados para saber o que realmente mudou antes de salvar. */
type ChangeKey =
  | 'name' | 'version' | 'publisher' | 'description' | 'iconUrl'
  | 'installCommand' | 'installCommandKind'
  | 'uninstallCommand' | 'uninstallCommandKind'
  | 'extractZip' | 'detection' | 'installer' | 'icon';

const CHANGE_LABEL: Record<ChangeKey, string> = {
  name: 'título',
  version: 'versão',
  publisher: 'fabricante',
  description: 'descrição',
  iconUrl: 'URL do ícone',
  installCommand: 'comando de instalação',
  installCommandKind: 'tipo do comando de instalação',
  uninstallCommand: 'comando de desinstalação',
  uninstallCommandKind: 'tipo do comando de desinstalação',
  extractZip: 'arquivo ZIP',
  detection: 'detecção',
  installer: 'novo instalador',
  icon: 'novo ícone',
};

/**
 * Resumo do instalador vinculado ao pacote (ou enviado agora nesta edição).
 * Antes era uma linha solta ("Instalador publicado: arquivo.exe (49 MB)") — a
 * informação curta escondia tipo, ZIP e checksum, que são o que o operador
 * confere antes de aprovar a instalação.
 */
function PublishedAssetInfo({
  fileName,
  sizeBytes,
  contentType,
  checksum,
  extractZip,
  isNew,
}: {
  fileName: string;
  sizeBytes: number | null;
  contentType?: string | null;
  checksum?: string | null;
  extractZip: boolean;
  isNew: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyChecksum() {
    if (!checksum) return;
    try {
      await navigator.clipboard.writeText(checksum);
      setCopied(true);
      toast.success('Checksum copiado.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar o checksum.');
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-light p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {isNew ? 'Novo instalador (enviado agora)' : 'Instalador publicado'}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Package className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate" title={fileName}>
              {fileName}
            </span>
          </p>
        </div>
        <span
          className={
            isNew
              ? 'shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] text-warning'
              : 'shrink-0 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] text-success'
          }
        >
          {isNew ? 'será vinculado ao salvar' : 'no object storage'}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Tamanho</dt>
          <dd className="font-mono text-foreground">
            {sizeBytes != null ? `${formatBytes(sizeBytes)} (${sizeBytes.toLocaleString('pt-BR')} bytes)` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tipo</dt>
          <dd className="truncate font-mono text-foreground" title={contentType ?? undefined}>
            {contentType || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ZIP</dt>
          <dd className="text-foreground">{extractZip ? 'Sim — extrai antes de instalar' : 'Não'}</dd>
        </div>
      </dl>

      <div className="mt-2">
        <p className="text-xs text-muted-foreground">SHA-256 (usado pelo agent para validar o download)</p>
        <div className="mt-0.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={checksum ?? undefined}>
            {checksum || '—'}
          </code>
          {checksum && (
            <Button variant="ghost" size="sm" onClick={copyChecksum} title="Copiar o SHA-256">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Painel de progresso/estado do envio do arquivo, exibido dentro do card. */
function AssetUploadPanel({
  kind,
  upload,
  onRetry,
  onCancel,
  onDiscard,
}: {
  kind: 'installer' | 'icon';
  upload: AssetUpload | null;
  onRetry: () => void;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  if (!upload) return null;

  // A retomada só preserva progresso no caminho multipart (arquivos grandes).
  const resumable = upload.total > ASSET_MULTIPART_MIN_BYTES;

  const isUploading = upload.status === 'uploading';
  const isError = upload.status === 'error';
  const isCanceled = upload.status === 'canceled';
  const eta = formatEta(upload.etaSeconds);
  const speed = upload.bytesPerSecond && upload.bytesPerSecond > 0
    ? `${formatBytes(upload.bytesPerSecond)}/s`
    : null;

  const tone = isError
    ? 'border-danger/40 bg-danger/10'
    : isUploading
      ? 'border-primary/40 bg-primary/10'
      : isCanceled
        ? 'border-warning/40 bg-warning/10'
        : 'border-success/40 bg-success/10';

  return (
    <div className={`mt-3 rounded-xl border p-3 ${tone}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          {isError ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
          ) : isUploading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : isCanceled ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          )}
          <span className="truncate">
            {isError
              ? 'Falha ao enviar o arquivo'
              : isUploading
                ? ASSET_UPLOAD_LABEL[kind]
                : isCanceled
                  ? 'Envio cancelado'
                  : 'Arquivo publicado no object storage'}
          </span>
        </span>

        {isUploading && upload.total > 0 && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{upload.percent}%</span>
        )}
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {upload.fileName}
        {upload.status === 'done' ? ` · ${formatBytes(upload.total)}` : ''}
      </p>

      {isUploading && (
        <>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            {upload.total > 0 ? (
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(upload.percent, 2)}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {upload.total > 0
                ? `${formatBytes(upload.loaded)} de ${formatBytes(upload.total)} enviados`
                : 'Aguarde a conclusão…'}
              {speed ? ` · ${speed}` : ''}
              {eta ? ` · ≈ ${eta} restantes` : ''}
            </p>
            <Button variant="ghost" size="sm" onClick={onCancel} title="Cancelar o envio (o progresso é preservado)">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        </>
      )}

      {isError && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-danger">{upload.error}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDiscard} title="Descartar as partes já enviadas">
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </Button>
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={!isError}>
              <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {isCanceled && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-warning">
            {resumable
              ? `O envio parou em ${upload.percent}% — os blocos já enviados continuam no storage e a retomada começa de onde parou.`
              : `O envio parou em ${upload.percent}% — neste tamanho o arquivo vai numa requisição única, então continuar reenvia desde o começo.`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onDiscard} title="Descartar as partes já enviadas">
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </Button>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" /> Continuar envio
            </Button>
          </div>
        </div>
      )}

      {upload.status === 'done' && (
        <p className="mt-1 text-xs text-success">
          O arquivo será vinculado ao pacote quando você salvar.
        </p>
      )}
    </div>
  );
}

/**
 * Editor dedicado (não modal) de pacotes custom da loja.
 *
 * Rotas: `/software/store/custom/new` (cadastro) e
 * `/software/store/custom/:packageId/edit` (edição).
 */
export default function CustomPackageEditorPage() {
  const { packageId } = useParams<{ packageId?: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(packageId);

  const packageQuery = useAppStorePackage(packageId, AppInstallationType.Custom);
  const upsert = useUpsertCustomPackage();
  const deleteFile = useDeleteCustomPackageFile();

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [installerFile, setInstallerFile] = useState<File | null>(null);
  const [installerAsset, setInstallerAsset] = useState<AssetState | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconAsset, setIconAsset] = useState<AssetState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [installerUpload, setInstallerUpload] = useState<AssetUpload | null>(null);
  const [iconUpload, setIconUpload] = useState<AssetUpload | null>(null);
  // Aborta o XHR em voo quando o usuário cancela (o progresso no storage fica).
  const installerAbortRef = useRef<AbortController | null>(null);
  const iconAbortRef = useRef<AbortController | null>(null);
  // Sequência de envio por arquivo: um upload cancelado pode emitir um último
  // evento (ou cair no catch) DEPOIS de outro upload já ter assumido o painel —
  // sem esta guarda o estado do novo apareceria misturado/atrasado.
  const installerSeqRef = useRef(0);
  const iconSeqRef = useRef(0);

  // Sair da página no meio de um envio de vários GiB: aborta em vez de deixar o
  // XHR terminar "invisível" (poderia publicar um objeto sem vínculo). O abort
  // com motivo 'cancel' preserva as partes no storage e o estado para retomar.
  useEffect(
    () => () => {
      installerAbortRef.current?.abort('cancel');
      iconAbortRef.current?.abort('cancel');
    },
    [],
  );
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<FormState>({ ...EMPTY_FORM });
  const [confirmDeleteFileOpen, setConfirmDeleteFileOpen] = useState(false);
  const [initializedPackageId, setInitializedPackageId] = useState<string | null>(null);

  const loaded = packageQuery.data;

  // Anexar arquivo só depois do cadastro existir: o asset é publicado no storage
  // no momento da seleção, então num pacote ainda não salvo o operador poderia
  // trocar/apagar o arquivo e deixar GiBs órfãos (e não haveria onde vinculá-lo).
  const canAttachFiles = isEditing && Boolean(loaded);

  const uploading =
    installerUpload?.status === 'uploading' || iconUpload?.status === 'uploading';
  const submitting = saving || upsert.isPending || uploading;

  // Blob URL criado uma única vez por arquivo e revogado ao trocar/desmontar.
  const iconPreview = useMemo(
    () => (iconFile ? URL.createObjectURL(iconFile) : null),
    [iconFile],
  );
  useEffect(() => () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);

  // Preenche o formulário uma vez por pacote carregado (não reescreve o que o
  // usuário já editou em um refetch de fundo).
  useEffect(() => {
    if (!loaded || initializedPackageId === loaded.packageId) return;
    setInitializedPackageId(loaded.packageId);
    const filled: FormState = {
      packageId: loaded.packageId ?? '',
      name: loaded.name ?? '',
      version: loaded.version ?? '',
      publisher: loaded.publisher ?? '',
      description: loaded.description ?? '',
      iconUrl: loaded.icon ?? '',
      installCommand: loaded.installCommand ?? '',
      installCommandKind: (loaded.installCommandKind ?? AppCommandKind.Command) as AppCommandKind,
      uninstallCommand: loaded.uninstallCommand ?? '',
      uninstallCommandKind: (loaded.uninstallCommandKind ?? AppCommandKind.Command) as AppCommandKind,
      extractZip: Boolean(loaded.extractZip),
      detectionMode: (loaded.detectionMode ?? AppDetectionMode.None) as AppDetectionMode,
      inventorySoftwareId: loaded.inventorySoftwareId ?? '',
      detectionName: loaded.detectionName ?? '',
      detectionPublisher: loaded.detectionPublisher ?? '',
      detectionMinVersion: loaded.detectionMinVersion ?? '',
      detectionCommand: loaded.detectionCommand ?? '',
    };
    setForm(filled);
    // Guarda o estado carregado: o "Salvar" compara com ele para gravar apenas o
    // que o usuário realmente alterou.
    setBaseline(filled);
  }, [loaded, initializedPackageId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Envia o instalador assim que o arquivo é escolhido, mostrando o progresso
   * dentro do próprio card. O Salvar NÃO reenvia nada: ele só grava os metadados
   * e vincula o asset já publicado.
   */
  async function uploadInstaller(file: File) {
    if (!canAttachFiles) return;

    // Descartar o arquivo ANTERIOR só quando ele é realmente outro arquivo: o
    // "Continuar envio" chama esta função com o MESMO arquivo e precisa RETOMAR
    // (o descarte apagaria as partes já enviadas ou o objeto já publicado).
    if (installerFile && installerFile !== file && installerUpload?.status !== 'uploading') {
      void discardUnlinkedAsset(installerFile, 'installer');
    }

    installerAbortRef.current?.abort();
    const controller = new AbortController();
    installerAbortRef.current = controller;
    const seq = ++installerSeqRef.current;

    // Este envio ainda "manda" no painel? Um worker/XHR sobrevivente NÃO pode
    // ressuscitar o estado depois do fim (senão a UI trava em "enviando": some o
    // "Tentar novamente", o "Cancelar" vira no-op e o Salvar fica bloqueado).
    let active = true;

    // Preserva o que já foi enviado apenas no caminho RETOMÁVEL (multipart): no
    // envio em requisição única o progresso não existe no servidor, então herdar
    // o percentual antigo mostraria uma retomada que não aconteceu.
    const resumeFrom =
      installerFile === file && file.size > ASSET_MULTIPART_MIN_BYTES ? installerUpload : null;
    const startLoaded = resumeFrom?.loaded ?? 0;
    const startPercent = resumeFrom?.percent ?? 0;

    setInstallerFile(file);
    setInstallerAsset(null);
    setInstallerUpload({
      status: 'uploading',
      fileName: file.name,
      loaded: startLoaded,
      total: file.size,
      percent: startPercent,
    });

    try {
      const asset = await appStoreApi.uploadCustomAsset(
        file,
        'installer',
        (progress: UploadProgress) => {
          if (!active || controller.signal.aborted || seq !== installerSeqRef.current) return;

          setInstallerUpload({
            status: 'uploading',
            fileName: file.name,
            loaded: progress.loaded,
            total: progress.total || file.size,
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            etaSeconds: progress.etaSeconds,
          });
        },
        controller.signal,
      );

      if (seq !== installerSeqRef.current) return;

      active = false;
      installerAbortRef.current = null;
      setInstallerAsset(asset);
      setInstallerUpload({
        status: 'done',
        fileName: asset.fileName,
        loaded: asset.sizeBytes,
        total: asset.sizeBytes,
        percent: 100,
      });
      toast.success(`Instalador enviado ao object storage (${formatBytes(asset.sizeBytes)}).`);
    } catch (error) {
      // Um upload mais novo já assumiu o painel: este erro não é mais relevante.
      if (seq !== installerSeqRef.current) return;

      active = false;
      installerAbortRef.current = null;

      if (controller.signal.aborted) {
        // Descartado: o estado já foi limpo e o objeto/partes foram apagados no
        // storage — não recriar o painel.
        if (String(controller.signal.reason) === 'discard') return;

        // Cancelado: nada é descartado — o storage guarda os blocos e o
        // "Continuar envio" retoma exatamente de onde parou.
        setInstallerUpload((current) => ({
          status: 'canceled',
          fileName: file.name,
          loaded: current?.loaded ?? 0,
          total: file.size,
          percent: current?.percent ?? 0,
        }));
        toast('Envio cancelado. O progresso foi preservado.', { icon: '⏸️' });
        return;
      }

      const message = error instanceof Error ? error.message : 'Falha ao enviar o instalador.';
      // Com blocos já confirmados no storage, o progresso não pode ser zerado: o
      // "Tentar novamente" retoma dali.
      const resumable = file.size > ASSET_MULTIPART_MIN_BYTES;
      setInstallerUpload({
        status: 'error',
        fileName: file.name,
        loaded: resumable ? (installerUpload?.loaded ?? 0) : 0,
        total: file.size,
        percent: resumable ? (installerUpload?.percent ?? 0) : 0,
        error: message,
      });
      toast.error(message);
    }
  }

  /** Cancela o envio em voo (o storage mantém os blocos; o estado local fica). */
  function cancelUpload(kind: 'installer' | 'icon') {
    const ref = kind === 'installer' ? installerAbortRef : iconAbortRef;
    // O motivo distingue "cancelar" (mantém o progresso) de "descartar" (apaga).
    ref.current?.abort('cancel');
  }

  /** Descarta o envio: apaga as partes/objeto no storage e limpa o estado local. */
  function discardUpload(kind: 'installer' | 'icon') {
    const file = kind === 'installer' ? installerFile : iconFile;
    if (file) void discardUnlinkedAsset(file, kind);

    if (kind === 'installer') {
      installerSeqRef.current++;
      installerAbortRef.current?.abort('discard');
      installerAbortRef.current = null;
      setInstallerFile(null);
      setInstallerAsset(null);
      setInstallerUpload(null);
    } else {
      iconSeqRef.current++;
      iconAbortRef.current?.abort('discard');
      iconAbortRef.current = null;
      setIconFile(null);
      setIconAsset(null);
      setIconUpload(null);
    }
  }

  /** Mesmo fluxo para o ícone/capa (arquivo pequeno, mas com o estado no card). */
  async function uploadIcon(file: File) {
    if (!canAttachFiles) return;

    if (iconFile && iconFile !== file && iconUpload?.status !== 'uploading') {
      void discardUnlinkedAsset(iconFile, 'icon');
    }

    iconAbortRef.current?.abort();
    const controller = new AbortController();
    iconAbortRef.current = controller;
    const seq = ++iconSeqRef.current;

    // Mesma guarda do instalador (nenhum callback atrasado ressuscita o painel).
    let active = true;

    // [B4] Retomada: preserva o progresso exibido no caminho retomável.
    const resumeFrom =
      iconFile === file && file.size > ASSET_MULTIPART_MIN_BYTES ? iconUpload : null;

    setIconFile(file);
    setIconAsset(null);
    setIconUpload({
      status: 'uploading',
      fileName: file.name,
      loaded: resumeFrom?.loaded ?? 0,
      total: file.size,
      percent: resumeFrom?.percent ?? 0,
    });

    try {
      const asset = await appStoreApi.uploadCustomAsset(
        file,
        'icon',
        (progress: UploadProgress) => {
          if (!active || controller.signal.aborted || seq !== iconSeqRef.current) return;

          setIconUpload({
            status: 'uploading',
            fileName: file.name,
            loaded: progress.loaded,
            total: progress.total || file.size,
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            etaSeconds: progress.etaSeconds,
          });
        },
        controller.signal,
      );

      if (seq !== iconSeqRef.current) return;

      active = false;
      iconAbortRef.current = null;
      setIconAsset(asset);
      setIconUpload({
        status: 'done',
        fileName: asset.fileName,
        loaded: asset.sizeBytes,
        total: asset.sizeBytes,
        percent: 100,
      });
      toast.success('Ícone/capa enviado ao object storage.');
    } catch (error) {
      if (seq !== iconSeqRef.current) return;

      active = false;
      iconAbortRef.current = null;

      if (controller.signal.aborted) {
        if (String(controller.signal.reason) === 'discard') return;

        setIconUpload((current) => ({
          status: 'canceled',
          fileName: file.name,
          loaded: current?.loaded ?? 0,
          total: file.size,
          percent: current?.percent ?? 0,
        }));
        toast('Envio cancelado. O progresso foi preservado.', { icon: '⏸️' });
        return;
      }

      const message = error instanceof Error ? error.message : 'Falha ao enviar o ícone.';
      const resumableIcon = file.size > ASSET_MULTIPART_MIN_BYTES;
      setIconUpload({
        status: 'error',
        fileName: file.name,
        loaded: resumableIcon ? (iconUpload?.loaded ?? 0) : 0,
        total: file.size,
        percent: resumableIcon ? (iconUpload?.percent ?? 0) : 0,
        error: message,
      });
      toast.error(message);
    }
  }

  // O que realmente mudou em relação ao pacote carregado (ou ao vazio, no
  // cadastro novo). Salvar sem alteração não deve chamar a API.
  const changedFields = useMemo<ChangeKey[]>(() => {
    const changed: ChangeKey[] = [];
    const differs = (current: string, initial: string) => current.trim() !== initial.trim();

    if (differs(form.name, baseline.name)) changed.push('name');
    if (differs(form.version, baseline.version)) changed.push('version');
    if (differs(form.publisher, baseline.publisher)) changed.push('publisher');
    if (differs(form.description, baseline.description)) changed.push('description');
    if (differs(form.iconUrl, baseline.iconUrl)) changed.push('iconUrl');
    if (differs(form.installCommand, baseline.installCommand)) changed.push('installCommand');
    if (form.installCommandKind !== baseline.installCommandKind) changed.push('installCommandKind');
    if (differs(form.uninstallCommand, baseline.uninstallCommand)) changed.push('uninstallCommand');
    if (form.uninstallCommandKind !== baseline.uninstallCommandKind) changed.push('uninstallCommandKind');
    if (form.extractZip !== baseline.extractZip) changed.push('extractZip');

    const detectionChanged =
      form.detectionMode !== baseline.detectionMode ||
      differs(form.inventorySoftwareId, baseline.inventorySoftwareId) ||
      differs(form.detectionName, baseline.detectionName) ||
      differs(form.detectionPublisher, baseline.detectionPublisher) ||
      differs(form.detectionMinVersion, baseline.detectionMinVersion) ||
      differs(form.detectionCommand, baseline.detectionCommand);
    if (detectionChanged) changed.push('detection');

    if (installerAsset && installerUpload?.status === 'done') changed.push('installer');
    if (iconAsset && iconUpload?.status === 'done') changed.push('icon');

    return changed;
  }, [form, baseline, installerAsset, installerUpload, iconAsset, iconUpload]);

  const hasPendingChanges = !isEditing || changedFields.length > 0;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Informe o título exibido na loja.';
    if (!form.packageId.trim()) next.packageId = 'Informe o ID do pacote.';
    if (!form.installCommand.trim()) next.installCommand = 'Informe o comando de instalação.';
    if (form.detectionMode === AppDetectionMode.InventoryLink && !form.detectionName.trim()) {
      next.detectionName = 'Escolha o app do inventário (ou informe o nome a ser procurado no host).';
    }
    if (form.detectionMode === AppDetectionMode.Command && !form.detectionCommand.trim()) {
      next.detectionCommand = 'Informe o comando PowerShell de detecção.';
    }
    if (form.detectionCommand.length > DETECTION_COMMAND_MAX) {
      next.detectionCommand = `O comando de detecção deve ter no máximo ${DETECTION_COMMAND_MAX} caracteres.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    // O envio acontece no card, ao escolher o arquivo. Salvar só grava o que
    // mudou — nunca reenvia um instalador já publicado.
    if (uploading) {
      toast.error('Aguarde o envio do arquivo terminar para salvar.');
      return;
    }
    if ((installerFile && !installerAsset) || (iconFile && !iconAsset)) {
      const canceled = installerUpload?.status === 'canceled' || iconUpload?.status === 'canceled';
      const resumable =
        (installerFile?.size ?? 0) > ASSET_MULTIPART_MIN_BYTES ||
        (iconFile?.size ?? 0) > ASSET_MULTIPART_MIN_BYTES;

      toast.error(
        canceled
          ? resumable
            ? 'O envio está cancelado. Use "Continuar envio" (retoma de onde parou) antes de salvar.'
            : 'O envio está cancelado. Use "Continuar envio" (reenvia o arquivo) antes de salvar.'
          : 'O envio do arquivo não foi concluído. Use "Tentar novamente" antes de salvar.',
      );
      return;
    }
    if (!hasPendingChanges) {
      toast('Nenhuma alteração para salvar.', { icon: 'ℹ️' });
      return;
    }

    try {
      // Asset só existe quando o usuário enviou um arquivo NOVO nesta edição;
      // sem arquivo novo o backend preserva o instalador/ícone já publicado.
      const fileAsset: AssetState | null = installerAsset;
      const iconAssetState: AssetState | null = iconAsset;
      const iconObjectKey = iconAssetState?.objectKey ?? null;
      const iconUrl = iconObjectKey ? null : form.iconUrl.trim() || null;

      setSaving(true);

      await upsert.mutateAsync({
        packageId: form.packageId.trim(),
        name: form.name.trim(),
        publisher: form.publisher.trim() || null,
        version: form.version.trim() || null,
        description: form.description.trim() || null,
        iconUrl,
        iconObjectKey,
        installCommand: form.installCommand.trim(),
        uninstallCommand: form.uninstallCommand.trim() || null,
        extractZip: form.extractZip,
        installCommandKind: form.installCommandKind,
        uninstallCommandKind: form.uninstallCommandKind,
        detectionMode: form.detectionMode,
        inventorySoftwareId:
          form.detectionMode === AppDetectionMode.InventoryLink
            ? form.inventorySoftwareId.trim() || null
            : null,
        detectionName:
          form.detectionMode === AppDetectionMode.InventoryLink
            ? form.detectionName.trim() || null
            : null,
        detectionPublisher:
          form.detectionMode === AppDetectionMode.InventoryLink
            ? form.detectionPublisher.trim() || null
            : null,
        detectionMinVersion:
          form.detectionMode === AppDetectionMode.InventoryLink
            ? form.detectionMinVersion.trim() || null
            : null,
        detectionCommand:
          form.detectionMode === AppDetectionMode.Command
            ? form.detectionCommand.trim() || null
            : null,
        // Só envia metadados de arquivo quando houve novo upload, para não
        // apagar o instalador já existente numa edição de metadados.
        fileObjectKey: fileAsset?.objectKey ?? null,
        fileBucket: fileAsset?.bucket ?? null,
        fileContentType: fileAsset?.contentType ?? null,
        fileSizeBytes: fileAsset?.sizeBytes ?? null,
        fileChecksum: fileAsset?.checksum ?? null,
        // Nome do asset (sanitizado pelo backend), não o nome cru do navegador:
        // o objeto no storage usa a versão sanitizada e os dois precisam bater.
        fileName: fileAsset?.fileName ?? installerFile?.name ?? null,
      });

      // Assets vinculados: o estado de upload não é mais necessário (e não pode
      // permitir descartar um objeto que agora está em uso).
      if (installerFile && installerAsset) forgetUploadedAsset(installerFile, 'installer');
      if (iconFile && iconAsset) forgetUploadedAsset(iconFile, 'icon');

      if (isEditing) {
        toast.success(`Alterações salvas (${changedFields.length} ${changedFields.length === 1 ? 'campo' : 'campos'}).`);
        navigate(STORE_PATH);
      } else {
        // Cadastro criado: o anexo do instalador só é habilitado com o pacote
        // existindo, então segue direto para a edição em vez de voltar à loja.
        toast.success('Pacote criado. Agora você pode anexar o instalador.');
        navigate(`${STORE_PATH}/custom/${encodeURIComponent(form.packageId.trim())}/edit`, { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar o pacote custom.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteInstaller() {
    if (!packageId) return;
    try {
      await deleteFile.mutateAsync(packageId);
      // NÃO limpa installerFile/installerAsset: se o usuário já escolheu (ou já
      // enviou) um substituto, apagar o publicado não pode descartar a seleção
      // nem orfanizar um asset recém-enviado ao S3. O substituto entra no próximo
      // salvamento.
      setConfirmDeleteFileOpen(false);
      toast.success('Instalador excluído do object storage.');
      await packageQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir o instalador.');
    }
  }

  const inventorySelection: InventorySoftwareSelection | null = form.inventorySoftwareId || form.detectionName
    ? {
        softwareId: form.inventorySoftwareId,
        name: form.detectionName,
        publisher: form.detectionPublisher || null,
      }
    : null;

  if (isEditing && packageQuery.isLoading && !loaded) {
    return (
      <div className="space-y-4">
        <Loading />
      </div>
    );
  }

  if (isEditing && packageQuery.isError) {
    return (
      <div className="space-y-4">
        <ErrorDisplay
          message="Não foi possível carregar o pacote custom."
          onRetry={() => packageQuery.refetch()}
        />
        <Button variant="ghost" onClick={() => navigate(STORE_PATH)}>
          <ArrowLeft className="h-4 w-4" /> Voltar para a loja
        </Button>
      </div>
    );
  }

  const hasPublishedFile = Boolean(loaded?.hasFile);
  const publishedFileName = installerAsset?.fileName ?? loaded?.fileName ?? null;

  // O que exibir no resumo do card: o asset enviado agora tem prioridade sobre o
  // que já estava publicado (nome, tamanho, tipo e checksum vêm dele).
  const shownFile: { fileName: string; sizeBytes: number | null; contentType?: string | null; checksum?: string | null; isNew: boolean } | null =
    installerAsset
      ? {
          fileName: installerAsset.fileName,
          sizeBytes: installerAsset.sizeBytes,
          contentType: installerAsset.contentType,
          checksum: installerAsset.checksum,
          isNew: true,
        }
      : hasPublishedFile && publishedFileName
        ? {
            fileName: publishedFileName,
            sizeBytes: loaded?.fileSizeBytes ?? null,
            contentType: loaded?.fileContentType,
            checksum: loaded?.fileChecksum,
            isNew: false,
          }
        : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEditing ? 'Editar pacote custom' : 'Novo modelo custom'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Cadastro manual de um instalador próprio, com script de instalação e detecção para o agent.
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(STORE_PATH)} disabled={submitting}>
          <ArrowLeft className="h-4 w-4" /> Voltar para a loja
        </Button>
      </div>

      {/* Identificação */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Identificação</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Título"
            value={form.name}
            error={errors.name}
            disabled={submitting}
            maxLength={500}
            placeholder="Ex.: Sistema de Gestão XPTO"
            onChange={(event) => update('name', event.target.value)}
          />
          <Input
            label="ID do pacote"
            value={form.packageId}
            error={errors.packageId}
            disabled={isEditing || submitting}
            maxLength={300}
            placeholder="Ex.: xpto-gestao"
            hint={isEditing ? 'O ID não pode ser alterado.' : 'Identificador único (sem espaços).'}
            onChange={(event) => update('packageId', event.target.value)}
            onBlur={() => {
              if (!form.packageId.trim() && form.name.trim()) {
                update('packageId', slugifyPackageId(form.name));
              }
            }}
          />
          <Input
            label="Versão"
            value={form.version}
            disabled={submitting}
            maxLength={100}
            placeholder="Ex.: 1.4.2"
            onChange={(event) => update('version', event.target.value)}
          />
          <Input
            label="Fabricante"
            value={form.publisher}
            disabled={submitting}
            maxLength={500}
            placeholder="Ex.: XPTO Software"
            onChange={(event) => update('publisher', event.target.value)}
          />
        </div>
      </Card>

      {/* Descrição */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Descrição</h2>
        <MarkdownField
          label="Descrição exibida na loja"
          value={form.description}
          onChange={(next) => update('description', next)}
          disabled={submitting}
          rows={6}
          placeholder="Descreva o aplicativo. Aceita Markdown (negrito, listas, links, código)."
          hint="O preview abaixo do alternador usa o mesmo renderizador da loja."
        />
      </Card>

      {/* Instalador */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Package className="h-4 w-4" /> Instalador
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <label
            className={
              canAttachFiles
                ? 'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50'
                : 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-muted opacity-60'
            }
            title={canAttachFiles ? undefined : 'Salve o cadastro do pacote antes de anexar o arquivo'}
          >
            <Upload className="h-4 w-4" />
            {hasPublishedFile || installerFile ? 'Trocar instalador' : 'Selecionar instalador'}
            <input
              type="file"
              className="hidden"
              disabled={submitting || !canAttachFiles}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                // O envio começa aqui, no card — não no "Salvar".
                if (file) void uploadInstaller(file);
              }}
            />
          </label>

          {hasPublishedFile && (
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting || deleteFile.isPending}
              onClick={() => setConfirmDeleteFileOpen(true)}
              title="Excluir o instalador publicado no object storage"
            >
              <Trash2 className="h-4 w-4" /> Excluir instalador
            </Button>
          )}

          {(installerFile || installerAsset) && installerUpload?.status !== 'uploading' && (
            <button
              type="button"
              disabled={submitting}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
              onClick={() => {
                if (installerFile && installerUpload?.status !== 'uploading') {
                  void discardUnlinkedAsset(installerFile, 'installer');
                }
                setInstallerFile(null);
                setInstallerAsset(null);
                setInstallerUpload(null);
              }}
            >
              <X className="h-3.5 w-3.5" /> Remover seleção
            </button>
          )}

          {installerUpload?.status === 'uploading' ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              enviando {installerUpload.percent}%…
            </span>
          ) : installerUpload?.status === 'error' ? (
            <span className="text-xs text-danger">envio não concluído — use "Tentar novamente"</span>
          ) : !canAttachFiles ? (
            <span className="text-xs text-muted-foreground">
              Salve o cadastro primeiro para poder anexar o instalador.
            </span>
          ) : !shownFile ? (
            <span className="text-xs text-muted-foreground">Nenhum instalador publicado.</span>
          ) : null}
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.extractZip}
            disabled={submitting}
            onChange={(event) => update('extractZip', event.target.checked)}
          />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <FileArchive className="h-3.5 w-3.5" /> O arquivo é um ZIP
            </span>
            <span className="text-xs text-muted-foreground">
              O agent extrai o conteúdo no host antes de executar o comando; {'{{installerDir}}'} passa a apontar para a pasta extraída.
            </span>
          </span>
        </label>

        {shownFile && <PublishedAssetInfo {...shownFile} extractZip={form.extractZip} />}

        <AssetUploadPanel
          kind="installer"
          upload={installerUpload}
          onRetry={() => {
            if (installerFile) void uploadInstaller(installerFile);
          }}
          onCancel={() => cancelUpload('installer')}
          onDiscard={() => discardUpload('installer')}
        />
      </Card>

      {/* Ícone / capa */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ImageIcon className="h-4 w-4" /> Ícone / capa
        </h2>
        <div className="flex flex-wrap items-start gap-3">
          {(iconFile || form.iconUrl) && (
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-light">
              <img
                src={iconPreview ?? form.iconUrl}
                alt="Pré-visualização do ícone"
                className="h-full w-full object-contain"
              />
            </div>
          )}
          <div className="min-w-48 flex-1 space-y-2">
            <Input
              label="URL do ícone (ou envie um arquivo)"
              value={form.iconUrl}
              placeholder="https://.../logo.png"
              disabled={Boolean(iconFile) || Boolean(iconAsset) || submitting}
              maxLength={2000}
              hint={
                canAttachFiles
                  ? iconAsset
                    ? 'Arquivo enviado ao S3 — o ícone será o da imagem enviada.'
                    : undefined
                  : 'Salve o cadastro primeiro para poder enviar a imagem.'
              }
              onChange={(event) => update('iconUrl', event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                className={
                  canAttachFiles
                    ? 'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50'
                    : 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-muted opacity-60'
                }
                title={canAttachFiles ? undefined : 'Salve o cadastro do pacote antes de enviar a imagem'}
              >
                <Upload className="h-4 w-4" />
                {iconFile || iconAsset ? 'Trocar imagem' : 'Enviar imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={submitting || !canAttachFiles}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = '';
                    if (file) void uploadIcon(file);
                  }}
                />
              </label>
              {(iconFile || iconAsset) && (
                <button
                  type="button"
                  disabled={submitting}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                  onClick={() => {
                    if (iconFile && iconUpload?.status !== 'uploading') {
                      void discardUnlinkedAsset(iconFile, 'icon');
                    }
                    setIconFile(null);
                    setIconAsset(null);
                    setIconUpload(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Remover seleção
                </button>
              )}
            </div>

            <AssetUploadPanel
              kind="icon"
              upload={iconUpload}
              onRetry={() => {
                if (iconFile) void uploadIcon(iconFile);
              }}
              onCancel={() => cancelUpload('icon')}
              onDiscard={() => discardUpload('icon')}
            />
          </div>
        </div>
      </Card>

      {/* Comandos */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Terminal className="h-4 w-4" /> Comandos
        </h2>

        <PlaceholderHelp />

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <Select
              label="Tipo do comando de instalação"
              options={commandKindOptions}
              value={String(form.installCommandKind)}
              disabled={submitting}
              onChange={(event) => update('installCommandKind', Number(event.target.value) as AppCommandKind)}
            />
            <TextArea
              label="Comando de instalação"
              className="font-mono text-xs"
              value={form.installCommand}
              error={errors.installCommand}
              disabled={submitting}
              maxLength={COMMAND_MAX}
              rows={8}
              placeholder='Ex.: "{{installer}}" /S   ou   msiexec /i "{{installer}}" /qn'
              onChange={(event) => update('installCommand', event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <Select
              label="Tipo do comando de desinstalação"
              options={commandKindOptions}
              value={String(form.uninstallCommandKind)}
              disabled={submitting}
              onChange={(event) => update('uninstallCommandKind', Number(event.target.value) as AppCommandKind)}
            />
            <TextArea
              label="Comando de desinstalação (opcional)"
              className="font-mono text-xs"
              value={form.uninstallCommand}
              disabled={submitting}
              maxLength={COMMAND_MAX}
              rows={8}
              placeholder={'Ex.: "C:\\Program Files\\XPTO\\uninstall.exe" /S'}
              onChange={(event) => update('uninstallCommand', event.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Detecção / inventário */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4" /> Detecção / inventário
        </h2>

        <div className="space-y-4">
          <Select
            label="Modo de detecção"
            options={detectionModeOptions}
            value={String(form.detectionMode)}
            disabled={submitting}
            hint="A detecção permite que a automação saiba se o app já está instalado no host."
            onChange={(event) => update('detectionMode', Number(event.target.value) as AppDetectionMode)}
          />

          {form.detectionMode === AppDetectionMode.InventoryLink && (
            <div className="space-y-3">
              <SoftwareInventoryPicker
                value={inventorySelection}
                disabled={submitting}
                onChange={(selection) => {
                  update('inventorySoftwareId', selection?.softwareId ?? '');
                  update('detectionName', selection?.name ?? '');
                  update('detectionPublisher', selection?.publisher ?? '');
                }}
              />
              {errors.detectionName && <p className="text-xs text-danger">{errors.detectionName}</p>}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Nome do app no host"
                  value={form.detectionName}
                  disabled={submitting}
                  maxLength={500}
                  placeholder="Ex.: Sistema de Gestão XPTO"
                  hint="O agent procura este nome (normalizado) no inventário local."
                  onChange={(event) => update('detectionName', event.target.value)}
                />
                <Input
                  label="Fabricante (opcional)"
                  value={form.detectionPublisher}
                  disabled={submitting}
                  maxLength={500}
                  placeholder="Ex.: XPTO Software"
                  onChange={(event) => update('detectionPublisher', event.target.value)}
                />
              </div>

              <Input
                label="Versão mínima (opcional)"
                value={form.detectionMinVersion}
                disabled={submitting}
                maxLength={100}
                placeholder="Ex.: 1.4.0"
                hint="Quando informada, a versão instalada precisa ser maior ou igual a ela."
                onChange={(event) => update('detectionMinVersion', event.target.value)}
              />
            </div>
          )}

          {form.detectionMode === AppDetectionMode.Command && (
            <TextArea
              label="Comando de detecção (PowerShell)"
              className="font-mono text-xs"
              value={form.detectionCommand}
              error={errors.detectionCommand}
              disabled={submitting}
              maxLength={DETECTION_COMMAND_MAX}
              rows={8}
              placeholder={'Ex.: if (Test-Path "C:\\Program Files\\XPTO\\app.exe") { exit 0 } else { exit 1 }'}
              hint="Exit 0 = já instalado; qualquer outra saída é tratada como não instalado."
              onChange={(event) => update('detectionCommand', event.target.value)}
            />
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {uploading
            ? 'Enviando o arquivo… o salvamento libera quando o envio terminar.'
            : !hasPendingChanges
              ? 'Nenhuma alteração pendente — nada será enviado à API.'
              : changedFields.length > 0
                ? `Será salvo: ${changedFields.map((key) => CHANGE_LABEL[key]).join(', ')}.`
                : 'Preencha o cadastro para salvar.'}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate(STORE_PATH)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            loading={submitting || upsert.isPending}
            disabled={uploading || (isEditing && !hasPendingChanges)}
            title={
              isEditing && !hasPendingChanges
                ? 'Nenhuma alteração pendente para salvar'
                : undefined
            }
          >
            <Save className="h-4 w-4" />
            {isEditing ? 'Salvar alterações' : 'Cadastrar pacote'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteFileOpen}
        title="Excluir instalador publicado"
        message={
          <span>
            O arquivo {publishedFileName ? <strong>{publishedFileName}</strong> : null} será apagado do object storage. Os
            comandos do pacote continuam cadastrados e você pode enviar outro instalador em seguida.
          </span>
        }
        confirmLabel="Excluir instalador"
        tone="danger"
        isLoading={deleteFile.isPending}
        onClose={() => setConfirmDeleteFileOpen(false)}
        onConfirm={handleDeleteInstaller}
      />
    </div>
  );
}

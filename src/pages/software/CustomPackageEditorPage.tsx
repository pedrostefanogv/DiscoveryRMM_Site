import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CheckCircle2, FileArchive, Image as ImageIcon, Loader2, Package, Save, Search, Terminal, Trash2, Upload, X,
} from 'lucide-react';
import { Button, Card, ConfirmDialog, ErrorDisplay, Input, Loading, Select, TextArea } from '@/components/ui';
import { appStoreApi } from '@/api/app-store';
import type { UploadProgress } from '@/api/client';
import {
  AppCommandKind, AppDetectionMode, AppInstallationType,
} from '@/api/types';
import { useAppStorePackage, useDeleteCustomPackageFile, useUpsertCustomPackage } from '@/hooks/useAppStore';
import { MarkdownField } from './components/MarkdownField';
import { SoftwareInventoryPicker, type InventorySoftwareSelection } from './components/SoftwareInventoryPicker';
import { formatBytes, slugifyPackageId } from './softwareStoreUtils';

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

type UploadStage = {
  kind: 'installer' | 'icon' | 'saving';
  fileName?: string;
  loaded: number;
  total: number;
  percent: number;
};

const UPLOAD_STAGE_LABEL: Record<UploadStage['kind'], string> = {
  installer: 'Enviando instalador para o S3…',
  icon: 'Enviando ícone/capa para o S3…',
  saving: 'Salvando cadastro na API…',
};

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
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [confirmDeleteFileOpen, setConfirmDeleteFileOpen] = useState(false);
  const [initializedPackageId, setInitializedPackageId] = useState<string | null>(null);

  const loaded = packageQuery.data;
  const submitting = stage !== null;

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
    setForm({
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
    });
  }, [loaded, initializedPackageId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reportProgress(stageKind: UploadStage['kind'], fileName?: string) {
    return (progress: UploadProgress) => {
      setStage({
        kind: stageKind,
        fileName,
        loaded: progress.loaded,
        total: progress.total,
        percent: progress.percent,
      });
    };
  }

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
    try {
      // Só envia o arquivo uma vez: se a gravação falhar, o retry reaproveita o
      // asset já publicado no S3 em vez de subir de novo.
      let fileAsset: AssetState | null = installerAsset;
      if (installerFile && !installerAsset) {
        setStage({
          kind: 'installer',
          fileName: installerFile.name,
          loaded: 0,
          total: installerFile.size,
          percent: 0,
        });
        const uploaded = await appStoreApi.uploadCustomAsset(
          installerFile,
          'installer',
          reportProgress('installer', installerFile.name),
        );
        setInstallerAsset(uploaded);
        fileAsset = uploaded;
      }

      // Ícone/capa: só sobe quando há arquivo novo; sem arquivo novo preserva
      // o asset já publicado (o backend mantém o IconObjectKey da edição).
      let iconAssetState: AssetState | null = iconAsset;
      if (iconFile && !iconAsset) {
        setStage({ kind: 'icon', fileName: iconFile.name, loaded: 0, total: iconFile.size, percent: 0 });
        const uploaded = await appStoreApi.uploadCustomAsset(
          iconFile,
          'icon',
          reportProgress('icon', iconFile.name),
        );
        setIconAsset(uploaded);
        iconAssetState = uploaded;
      }
      const iconObjectKey = iconAssetState?.objectKey ?? null;
      const iconUrl = iconObjectKey ? null : form.iconUrl.trim() || null;

      setStage({ kind: 'saving', loaded: 0, total: 0, percent: 0 });

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
        fileName: installerFile?.name ?? fileAsset?.fileName ?? null,
      });

      toast.success(isEditing ? 'Pacote custom atualizado.' : 'Pacote custom cadastrado.');
      navigate(STORE_PATH);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar o pacote custom.');
    } finally {
      setStage(null);
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

  const publishedFileSize = installerFile?.size ?? installerAsset?.sizeBytes ?? loaded?.fileSizeBytes ?? null;
  const hasPublishedFile = Boolean(loaded?.hasFile);
  const publishedFileName = installerAsset?.fileName ?? loaded?.fileName ?? null;

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
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50">
            <Upload className="h-4 w-4" />
            {hasPublishedFile || installerFile ? 'Trocar instalador' : 'Selecionar instalador'}
            <input
              type="file"
              className="hidden"
              disabled={submitting}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setInstallerFile(file);
                setInstallerAsset(null);
                event.target.value = '';
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

          {installerAsset ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {installerAsset.fileName} · {formatBytes(installerAsset.sizeBytes)} — enviado ao S3
            </span>
          ) : installerFile ? (
            <span className="text-xs text-muted-foreground">
              {installerFile.name} · {formatBytes(installerFile.size)} · será enviado ao salvar
            </span>
          ) : hasPublishedFile ? (
            <span className="text-xs text-success">
              Instalador publicado{publishedFileName ? `: ${publishedFileName}` : ''} ({formatBytes(publishedFileSize) || '—'}).
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Nenhum instalador publicado.</span>
          )}
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

        {publishedFileSize ? (
          <p className="mt-2 text-xs text-muted">Tamanho: {formatBytes(publishedFileSize)}</p>
        ) : null}

        {loaded?.fileChecksum && !installerFile && (
          <p className="mt-1 text-xs text-muted">
            Checksum: <span className="font-mono">{loaded.fileChecksum}</span>
          </p>
        )}

        {submitting && stage && (
          <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span className="truncate">{UPLOAD_STAGE_LABEL[stage.kind]}</span>
              </span>
              {stage.kind !== 'saving' && stage.total > 0 && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{stage.percent}%</span>
              )}
            </div>

            {stage.fileName && <p className="mt-1 truncate text-xs text-muted-foreground">{stage.fileName}</p>}

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              {stage.total > 0 ? (
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.max(stage.percent, 2)}%` }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              )}
            </div>

            {stage.total > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(stage.loaded)} de {formatBytes(stage.total)} enviados
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Aguarde a conclusão…</p>
            )}
          </div>
        )}
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
              hint={iconAsset ? 'Arquivo enviado ao S3 — o ícone será o da imagem enviada.' : undefined}
              onChange={(event) => update('iconUrl', event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50">
                <Upload className="h-4 w-4" />
                {iconFile || iconAsset ? 'Trocar imagem' : 'Enviar imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={submitting}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setIconFile(file);
                    setIconAsset(null);
                    event.target.value = '';
                  }}
                />
              </label>
              {(iconFile || iconAsset) && (
                <button
                  type="button"
                  disabled={submitting}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                  onClick={() => { setIconFile(null); setIconAsset(null); }}
                >
                  <X className="h-3.5 w-3.5" /> Remover seleção
                </button>
              )}
            </div>
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

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(STORE_PATH)} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSave} loading={submitting || upsert.isPending}>
          <Save className="h-4 w-4" />
          {isEditing ? 'Salvar alterações' : 'Cadastrar pacote'}
        </Button>
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

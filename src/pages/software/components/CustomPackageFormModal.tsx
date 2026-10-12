import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, FileArchive, Image as ImageIcon, Loader2, Package, Upload, X } from 'lucide-react';
import { Button, Input, Modal, TextArea } from '@/components/ui';
import { appStoreApi } from '@/api/app-store';
import type { UploadProgress } from '@/api/client';
import type { AppStoreCatalogPackage } from '@/api/types';
import { useUpsertCustomPackage } from '@/hooks/useAppStore';

interface CustomPackageFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Pacote existente quando em modo edição; null/undefined para cadastro novo. */
  editing?: AppStoreCatalogPackage | null;
}

interface AssetState {
  objectKey: string;
  bucket: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  checksum?: string | null;
}

type UploadStageKind = 'installer' | 'icon' | 'saving';

interface UploadStage {
  kind: UploadStageKind;
  fileName?: string;
  loaded: number;
  total: number;
  percent: number;
}

const UPLOAD_STAGE_LABEL: Record<UploadStageKind, string> = {
  installer: 'Enviando instalador para o S3…',
  icon: 'Enviando ícone/capa para o S3…',
  saving: 'Salvando cadastro na API…',
};

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const EMPTY = {
  packageId: '',
  name: '',
  version: '',
  publisher: '',
  description: '',
  installCommand: '',
  uninstallCommand: '',
  siteUrl: '',
  iconUrl: '',
  extractZip: false,
};

export function CustomPackageFormModal({ open, onClose, editing }: CustomPackageFormModalProps) {
  const isEditing = Boolean(editing);
  const [form, setForm] = useState({ ...EMPTY });
  const [installerFile, setInstallerFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [installerAsset, setInstallerAsset] = useState<AssetState | null>(null);
  const [iconAsset, setIconAsset] = useState<AssetState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<UploadStage | null>(null);
  const upsert = useUpsertCustomPackage();
  const submitting = stage !== null;

  function reportProgress(kind: UploadStageKind, fileName?: string) {
    return (progress: UploadProgress) => {
      setStage({ kind, fileName, loaded: progress.loaded, total: progress.total, percent: progress.percent });
    };
  }

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setInstallerFile(null);
    setIconFile(null);
    setInstallerAsset(null);
    setIconAsset(null);
    if (editing) {
      setForm({
        packageId: editing.packageId ?? '',
        name: editing.name ?? '',
        version: editing.version ?? '',
        publisher: editing.publisher ?? '',
        description: editing.description ?? '',
        installCommand: editing.installCommand ?? '',
        uninstallCommand: editing.uninstallCommand ?? '',
        siteUrl: editing.homepage ?? '',
        iconUrl: editing.icon ?? '',
        extractZip: Boolean(editing.extractZip),
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, editing]);

  const totalInstallerSize = useMemo(
    () => installerFile?.size ?? installerAsset?.sizeBytes ?? editing?.fileSizeBytes ?? null,
    [installerFile, installerAsset, editing],
  );

  // Blob URL criado uma única vez por arquivo e revogado ao trocar/fechar.
  const iconPreview = useMemo(
    () => (iconFile ? URL.createObjectURL(iconFile) : null),
    [iconFile],
  );
  useEffect(() => () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Informe o título exibido na loja.';
    if (!form.packageId.trim()) next.packageId = 'Informe o ID do pacote.';
    if (!form.installCommand.trim()) next.installCommand = 'Informe o comando de instalação.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    try {
      // Só envia cada arquivo uma vez: se a gravação falhar, o retry reaproveita
      // o asset já publicado no S3 em vez de subir de novo.
      let fileAsset: AssetState | null = installerAsset;
      if (installerFile && !installerAsset) {
        setStage({ kind: 'installer', fileName: installerFile.name, loaded: 0, total: installerFile.size, percent: 0 });
        const uploaded = await appStoreApi.uploadCustomAsset(
          installerFile,
          'installer',
          reportProgress('installer', installerFile.name),
        );
        setInstallerAsset(uploaded);
        fileAsset = uploaded;
      }

      let iconObjectKey: string | null = iconAsset?.objectKey ?? null;
      let iconUrl: string | null = iconObjectKey ? null : form.iconUrl.trim() || null;
      if (iconFile && !iconAsset) {
        setStage({ kind: 'icon', fileName: iconFile.name, loaded: 0, total: iconFile.size, percent: 0 });
        const uploaded = await appStoreApi.uploadCustomAsset(
          iconFile,
          'icon',
          reportProgress('icon', iconFile.name),
        );
        setIconAsset(uploaded);
        iconObjectKey = uploaded.objectKey;
        iconUrl = null;
      }

      setStage({ kind: 'saving', loaded: 0, total: 0, percent: 0 });

      await upsert.mutateAsync({
        packageId: form.packageId.trim(),
        name: form.name.trim(),
        publisher: form.publisher.trim() || null,
        version: form.version.trim() || null,
        description: form.description.trim() || null,
        iconUrl,
        iconObjectKey,
        siteUrl: form.siteUrl.trim() || null,
        installCommand: form.installCommand.trim(),
        uninstallCommand: form.uninstallCommand.trim() || null,
        extractZip: form.extractZip,
        // Só envia metadados de arquivo quando houve novo upload, para não
        // apagar o instalador já existente em uma edição de metadados.
        fileObjectKey: fileAsset?.objectKey ?? null,
        fileBucket: fileAsset?.bucket ?? null,
        fileContentType: fileAsset?.contentType ?? null,
        fileSizeBytes: fileAsset?.sizeBytes ?? null,
        fileChecksum: fileAsset?.checksum ?? null,
        fileName: installerFile?.name ?? fileAsset?.fileName ?? null,
      });

      toast.success(isEditing ? 'Pacote custom atualizado.' : 'Pacote custom cadastrado.');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar o pacote custom.');
    } finally {
      setStage(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={isEditing ? `Editar pacote custom — ${editing?.name ?? editing?.packageId}` : 'Novo modelo custom'}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-light p-3 text-xs text-muted-foreground">
          O instalador e o ícone são enviados para o object storage (S3) e ficam disponíveis para os agentes
          aprovados. Use <code className="font-mono">{'{{installer}}'}</code> para o caminho do arquivo baixado e{' '}
          <code className="font-mono">{'{{installerDir}}'}</code> para a pasta (após extrair ZIPs) dentro do comando.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Título"
            value={form.name}
            error={errors.name}
            disabled={submitting}
            maxLength={500}
            placeholder="Ex.: Sistema de Gestão XPTO"
            onChange={(e) => update('name', e.target.value)}
          />
          <Input
            label="ID do pacote"
            value={form.packageId}
            error={errors.packageId}
            disabled={isEditing || submitting}
            maxLength={300}
            placeholder="Ex.: xpto-gestao"
            hint={isEditing ? 'O ID não pode ser alterado.' : 'Identificador único (sem espaços).'}
            onChange={(e) => update('packageId', e.target.value)}
            onBlur={() => {
              if (!form.packageId.trim() && form.name.trim()) update('packageId', slugify(form.name));
            }}
          />
          <Input label="Versão" value={form.version} disabled={submitting} maxLength={100} placeholder="Ex.: 1.4.2" onChange={(e) => update('version', e.target.value)} />
          <Input label="Fabricante" value={form.publisher} disabled={submitting} maxLength={500} placeholder="Ex.: XPTO Software" onChange={(e) => update('publisher', e.target.value)} />
        </div>

        <TextArea
          label="Descrição"
          value={form.description}
          disabled={submitting}
          rows={4}
          placeholder="Descrição exibida na loja (aceita Markdown)."
          onChange={(e) => update('description', e.target.value)}
        />

        <TextArea
          label="Comando de instalação"
          value={form.installCommand}
          error={errors.installCommand}
          disabled={submitting}
          maxLength={1000}
          rows={3}
          placeholder='Ex.: {{installerDir}}\\setup.exe /S   ou   msiexec /i "{{installer}}" /qn'
          onChange={(e) => update('installCommand', e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea
            label="Comando de desinstalação (opcional)"
            value={form.uninstallCommand}
            disabled={submitting}
            maxLength={1000}
            rows={2}
            placeholder='Ex.: "C:\\Program Files\\XPTO\\uninstall.exe" /S'
            onChange={(e) => update('uninstallCommand', e.target.value)}
          />
          <Input
            label="Site / homepage (opcional)"
            value={form.siteUrl}
            disabled={submitting}
            maxLength={2000}
            placeholder="https://fornecedor.com.br"
            onChange={(e) => update('siteUrl', e.target.value)}
          />
        </div>

        {/* Instalador */}
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Package className="h-4 w-4" /> Instalador
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50">
              <Upload className="h-4 w-4" />
              {installerFile ? 'Trocar arquivo' : 'Selecionar arquivo'}
              <input
                type="file"
                className="hidden"
                disabled={submitting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setInstallerFile(file);
                  setInstallerAsset(null);
                  e.target.value = '';
                }}
              />
            </label>
            {installerAsset ? (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {installerAsset.fileName} · {formatBytes(installerAsset.sizeBytes)} — enviado ao S3
              </span>
            ) : installerFile ? (
              <span className="text-xs text-muted-foreground">
                {installerFile.name} · {formatBytes(installerFile.size)} · será enviado ao salvar
              </span>
            ) : isEditing && editing?.hasFile ? (
              <span className="text-xs text-success">Instalador já publicado ({formatBytes(editing.fileSizeBytes)}).</span>
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
              onChange={(e) => update('extractZip', e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1 font-medium"><FileArchive className="h-3.5 w-3.5" /> O arquivo é um ZIP</span>
              <span className="text-xs text-muted-foreground">O agent extrai o conteúdo no host antes de executar o comando.</span>
            </span>
          </label>
          {totalInstallerSize ? (
            <p className="mt-2 text-xs text-muted">Tamanho: {formatBytes(totalInstallerSize)}</p>
          ) : null}
        </div>

        {/* Ícone / capa */}
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <ImageIcon className="h-4 w-4" /> Ícone / capa
          </p>
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
            <div className="flex-1 space-y-2">
              <Input
                label="URL do ícone (ou envie um arquivo)"
                value={form.iconUrl}
                placeholder="https://.../logo.png"
                disabled={Boolean(iconFile) || submitting}
                maxLength={2000}
                onChange={(e) => update('iconUrl', e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground hover:border-primary/50">
                  <Upload className="h-4 w-4" />
                  {iconFile ? 'Trocar imagem' : 'Enviar imagem'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setIconFile(file);
                      setIconAsset(null);
                      e.target.value = '';
                    }}
                  />
                </label>
                {iconFile && (
                  <button type="button" disabled={submitting} className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground" onClick={() => { setIconFile(null); setIconAsset(null); }}>
                    <X className="h-3.5 w-3.5" /> Remover seleção
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {submitting && stage && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 p-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span className="truncate">{UPLOAD_STAGE_LABEL[stage.kind]}</span>
              </span>
              {stage.kind !== 'saving' && stage.total > 0 && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{stage.percent}%</span>
              )}
            </div>

            {stage.fileName && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{stage.fileName}</p>
            )}

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

        {!submitting && (installerFile || iconFile) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted" />
            {installerAsset || iconAsset
              ? 'Arquivo já enviado ao S3; um novo envio só ocorre se você trocar o arquivo.'
              : 'Os arquivos selecionados serão enviados ao S3 ao salvar — o progresso aparece durante o envio.'}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={submitting || upsert.isPending}>
            {isEditing ? 'Salvar alterações' : 'Cadastrar pacote'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

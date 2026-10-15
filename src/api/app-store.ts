import { ApiError, api, type UploadProgress } from "./client";
import {
  AppCommandKind,
  AppDetectionMode,
  AppInstallationType,
} from "./types";
import type {
  AppApprovalScopeType,
  AppApprovalAuditChangeType,
  AppStoreCatalogPage,
  AppStoreCatalogPackage,
  AppApprovalRule,
  AppApprovalRulesResponse,
  CreateAppApprovalRuleRequest,
  AppEffectivePage,
  AppApprovalAuditPage,
  AppDiffEntry,
  AppDiffPage,
  SyncChocolateyCatalogResponse,
  CustomPackageAsset,
  UpsertCustomPackageRequest,
} from "./types";

const BASE = "/api/v1/app-store";

type RawCatalogPackage = Partial<AppStoreCatalogPackage> & {
  id?: string;
  packageIdentifier?: string;
  installCommand?: string;
};

type RawCatalogPage = Partial<Omit<AppStoreCatalogPage, "items">> & {
  items?: RawCatalogPackage[];
  returnedItems?: number;
};

type RawApprovalRule = Partial<AppApprovalRule> & {
  id?: string;
  ruleId?: string;
};

type RawApprovalRulesResponse = Omit<AppApprovalRulesResponse, "items"> & {
  items?: RawApprovalRule[];
};

function normalizeInstallationType(
  value: unknown,
  fallback?: AppInstallationType,
): AppInstallationType {
  if (value === AppInstallationType.Winget || value === 0 || value === "0") {
    return AppInstallationType.Winget;
  }
  if (
    value === AppInstallationType.Chocolatey ||
    value === 1 ||
    value === "1"
  ) {
    return AppInstallationType.Chocolatey;
  }
  if (value === AppInstallationType.Custom || value === 2 || value === "2") {
    return AppInstallationType.Custom;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "winget") return AppInstallationType.Winget;
    if (normalized === "chocolatey" || normalized === "choco") {
      return AppInstallationType.Chocolatey;
    }
    if (normalized === "custom") return AppInstallationType.Custom;
    if (normalized.includes("winget")) return AppInstallationType.Winget;
    if (normalized.includes("choco")) return AppInstallationType.Chocolatey;
  }
  return fallback ?? AppInstallationType.Winget;
}

/** Coage um valor cru (número ou string numérica) num enum numérico conhecido. */
function normalizeNumericEnum<T extends number>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && values.includes(numeric as T)) {
    return numeric as T;
  }
  return fallback;
}

const APP_COMMAND_KIND_VALUES = [
  AppCommandKind.Command,
  AppCommandKind.CmdScript,
  AppCommandKind.PowerShellScript,
] as const;

const APP_DETECTION_MODE_VALUES = [
  AppDetectionMode.None,
  AppDetectionMode.InventoryLink,
  AppDetectionMode.Command,
] as const;

/** String opcional do JSON: `undefined`/vazio viram `null` (nunca `undefined`). */
function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value.trim() : null;
}

function normalizeCatalogPackage(
  item: RawCatalogPackage,
  fallbackInstallationType?: AppInstallationType,
): AppStoreCatalogPackage {
  const packageId = item.packageId ?? item.id ?? item.packageIdentifier ?? "";

  const installationType = normalizeInstallationType(
    item.installationType ?? item.installCommand,
    fallbackInstallationType,
  );

  const homepage = item.homepage ?? null;
  const iconFromApi = item.icon ?? null;
  const fallbackIcon =
    installationType === AppInstallationType.Chocolatey &&
    !iconFromApi &&
    homepage
      ? `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(homepage)}`
      : null;

  return {
    packageId,
    name: item.name ?? null,
    publisher: item.publisher ?? null,
    description: item.description ?? null,
    version: item.version ?? null,
    architecture: item.architecture ?? null,
    installationType,
    installCommand: item.installCommand ?? null,
    uninstallCommand: item.uninstallCommand ?? null,
    extractZip: Boolean(item.extractZip),
    fileName: item.fileName ?? null,
    fileSizeBytes: item.fileSizeBytes ?? null,
    fileContentType: item.fileContentType ?? null,
    fileChecksum: item.fileChecksum ?? null,
    hasFile: Boolean(item.hasFile),
    lastUpdated: item.lastUpdated ?? null,
    installerUrlsByArch: item.installerUrlsByArch ?? {},
    icon: iconFromApi ?? fallbackIcon,
    homepage,
    license: item.license ?? null,
    category: item.category ?? null,
    tags: item.tags ?? null,
    // Tipo de comando e detecção/inventário dos pacotes custom. Registros
    // antigos (sem os campos) caem em Command/None, como no servidor.
    installCommandKind: normalizeNumericEnum(
      item.installCommandKind,
      APP_COMMAND_KIND_VALUES,
      AppCommandKind.Command,
    ),
    uninstallCommandKind: normalizeNumericEnum(
      item.uninstallCommandKind,
      APP_COMMAND_KIND_VALUES,
      AppCommandKind.Command,
    ),
    detectionMode: normalizeNumericEnum(
      item.detectionMode,
      APP_DETECTION_MODE_VALUES,
      AppDetectionMode.None,
    ),
    inventorySoftwareId: normalizeOptionalText(item.inventorySoftwareId),
    detectionName: normalizeOptionalText(item.detectionName),
    detectionPublisher: normalizeOptionalText(item.detectionPublisher),
    detectionMinVersion: normalizeOptionalText(item.detectionMinVersion),
    detectionCommand: normalizeOptionalText(item.detectionCommand),
  };
}

function normalizeCatalogPage(
  page: RawCatalogPage,
  fallbackInstallationType?: AppInstallationType,
): AppStoreCatalogPage {
  const returnedItems = page.returnedItems ?? page.items?.length ?? 0;

  return {
    count: page.count ?? returnedItems,
    generatedAt: page.generatedAt ?? null,
    totalPackagesInSource: page.totalPackagesInSource,
    returnedItems,
    cursor: page.cursor ?? null,
    nextCursor: page.nextCursor ?? null,
    limit: page.limit,
    hasMore: Boolean(page.hasMore) || Boolean(page.nextCursor),
    search: page.search ?? null,
    architecture: page.architecture ?? null,
    items: (page.items ?? []).map((item) =>
      normalizeCatalogPackage(item, fallbackInstallationType),
    ),
  };
}

function normalizeApprovalRule(item: RawApprovalRule): AppApprovalRule {
  const ruleId = item.ruleId ?? item.id ?? "";
  return {
    ruleId,
    id: ruleId,
    scopeType: item.scopeType ?? 0,
    scopeId: item.scopeId ?? null,
    installationType: normalizeInstallationType(item.installationType),
    packageId: item.packageId ?? "",
    packageName: item.packageName ?? null,
    action: item.action ?? 0,
    autoUpdateEnabled: item.autoUpdateEnabled ?? null,
    reason: item.reason ?? null,
    createdAt: item.createdAt ?? "",
    updatedAt: item.updatedAt ?? "",
  };
}

function normalizeApprovalsResponse(
  response: RawApprovalRulesResponse,
  fallbackInstallationType?: AppInstallationType,
): AppApprovalRulesResponse {
  return {
    scopeType: response.scopeType,
    scopeId: response.scopeId ?? null,
    installationType:
      response.installationType !== undefined
        ? normalizeInstallationType(response.installationType)
        : normalizeInstallationType(fallbackInstallationType),
    count: response.count ?? response.items?.length ?? 0,
    items: (response.items ?? []).map(normalizeApprovalRule),
  };
}

function normalizeSyncResponse(
  raw: Partial<SyncChocolateyCatalogResponse> & Record<string, unknown>,
): SyncChocolateyCatalogResponse {
  const pick = <T>(camel: string, pascal: string): T | undefined => {
    const value = raw[camel] ?? raw[pascal];
    return value === undefined ? undefined : (value as T);
  };
  const installationType = normalizeInstallationType(
    pick<unknown>("installationType", "InstallationType"),
  );
  return {
    installationType,
    success: Boolean(pick<boolean>("success", "Success") ?? true),
    packagesUpserted: pick<number>("packagesUpserted", "PackagesUpserted") ?? 0,
    pagesProcessed: pick<number>("pagesProcessed", "PagesProcessed"),
    syncedAt: pick<string>("syncedAt", "SyncedAt") ?? null,
    sourceGeneratedAt:
      pick<string>("sourceGeneratedAt", "SourceGeneratedAt") ?? null,
    duration: pick<string>("duration", "Duration") ?? null,
    error: pick<string>("error", "Error") ?? null,
  };
}

export interface AppStoreSyncStatus {
  running: boolean;
  lastResult: SyncChocolateyCatalogResponse | null;
}

function normalizeSyncStatus(
  raw: Partial<AppStoreSyncStatus> & Record<string, unknown>,
): AppStoreSyncStatus {
  const running = raw.running ?? raw.Running ?? false;
  const lastRaw = raw.lastResult ?? raw.LastResult;
  return {
    running: Boolean(running),
    lastResult: lastRaw
      ? normalizeSyncResponse(lastRaw as Record<string, unknown>)
      : null,
  };
}

export interface CatalogParams {
  installationType?: AppInstallationType;
  search?: string;
  architecture?: string;
  limit?: number;
  cursor?: string;
}

export interface ApprovalsParams {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
}

export interface AuditParams {
  installationType?: AppInstallationType;
  packageId?: string;
  scopeType?: AppApprovalScopeType;
  scopeId?: string;
  changedBy?: string;
  changedFrom?: string;
  changedTo?: string;
  changeType?: AppApprovalAuditChangeType;
  limit?: number;
  cursor?: string;
}

export interface EffectiveParams {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
  search?: string;
  limit?: number;
  cursor?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Upload multipart DIRETO no object storage (RustFS/S3)
// ═══════════════════════════════════════════════════════════════════════
//
// Instaladores grandes não podem subir num corpo único pela API: o Cloudflare
// recusa o corpo no edge (413). O fluxo correto é multipart DIRETO no storage —
// a API cria o multipart e só pré-assina cada bloco de 10 MiB; o navegador faz
// PUT na URL assinada. Como as partes ficam no storage até o complete, o envio
// é RETOMÁVEL: guardamos o uploadId + ETags em localStorage por impressão do
// arquivo (nome+tamanho+data), então um novo envio do mesmo arquivo continua
// exatamente de onde parou (inclusive depois de fechar/reabrir a página).

/**
 * Bloco do multipart direto: 10 MiB. O Cloudflare corta requisições em ~100 s,
 * então 50 MiB falhavam em links abaixo de ~5 Mbps; 10 MiB mantém folga (e segue
 * acima do mínimo de 5 MiB que o S3 exige para todas as partes menos a última).
 */
const ASSET_PART_SIZE = 10 * 1024 * 1024;

/**
 * Até este tamanho o arquivo vai numa requisição única para a API. Igual ao
 * bloco padrão (10 MiB): acima disso o multipart direto é sempre mais seguro
 * atrás do Cloudflare (o edge corta requisições longas em ~100 s).
 */
const SINGLE_REQUEST_MAX_BYTES = ASSET_PART_SIZE;

/**
 * Acima deste tamanho o envio é MULTIPART (retomável: cancelar não perde o que já
 * subiu). Até ele o arquivo vai numa requisição única — cancelar nesse caminho
 * não preserva progresso e continuar reenvia desde o começo.
 */
export const ASSET_MULTIPART_MIN_BYTES = SINGLE_REQUEST_MAX_BYTES;

const MULTIPART_STATE_PREFIX = "discovery:asset-multipart:";
const PART_MAX_ATTEMPTS = 4;
/**
 * Blocos enviados SIMULTANEAMENTE. O envio era sequencial e o gargalo não era o
 * link: era o "buraco" entre blocos (abrir XHR novo, esperar o storage confirmar
 * a parte, pedir a próxima URL). Com 3 blocos encadeados o link fica ocupado e o
 * tempo por arquivo cai bastante; mais que isso costuma competir com o próprio
 * storage/CPU do navegador sem ganho.
 */
const PART_CONCURRENCY = 3;

/**
 * Janela mínima entre atualizações de progresso na UI. Conclusões de bloco e
 * erros ignoram o throttle (report(true)).
 */
const PROGRESS_THROTTLE_MS = 200;

interface MultipartPart {
  partNumber: number;
  /** Pode chegar depois, via ListParts, quando o storage não expõe o header. */
  etag: string;
  sizeBytes: number;
}

/**
 * Coordenadas de um bloco no arquivo. Guardadas no estado porque com blocos em
 * paralelo eles terminam fora de ordem — e numa retomada "partNumber × tamanho
 * fixo" não reconstruiria os intervalos.
 */
interface PartRange {
  partNumber: number;
  start: number;
  end: number;
}

interface MultipartUploadState {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  fingerprint: string;
  parts: MultipartPart[];
  /** Plano de blocos (coordenadas) — permite retomar com blocos fora de ordem. */
  ranges?: PartRange[];
  /** Upload já finalizado no storage (aguardando vínculo com o pacote). */
  completed?: boolean;
}

/**
 * Parte devolvida pelo storage via API. O ETag chega como `eTag` (o serializador
 * usa camelCase: "ETag" -> "eTag"), então os dois nomes são aceitos — ler só
 * `etag` fazia a retomada perder os ETags e o complete falhar com "parte sem
 * ETag" mesmo com todos os blocos já enviados.
 */
interface MultipartReceivedPart {
  partNumber: number;
  eTag?: string;
  etag?: string;
  sizeBytes: number;
}

interface MultipartStatusResponse {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
  /** true = o storage já finalizou o objeto (basta devolver o asset). */
  completed?: boolean;
  receivedBytes: number;
  receivedParts: MultipartReceivedPart[];
  pendingParts: number[];
}

function normalizeReceivedParts(parts: MultipartReceivedPart[] | undefined): MultipartPart[] {
  return (parts ?? []).map((part) => ({
    partNumber: part.partNumber,
    etag: part.eTag ?? part.etag ?? '',
    sizeBytes: part.sizeBytes ?? 0,
  }));
}

interface MultipartSessionResponse {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
}

function multipartFingerprint(file: File, kind: string): string {
  return `${kind}:${file.name}:${file.size}:${file.lastModified}`;
}

function readMultipartState(key: string): MultipartUploadState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MultipartUploadState;
    return parsed?.uploadId ? parsed : null;
  } catch {
    return null;
  }
}

function writeMultipartState(key: string, state: MultipartUploadState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Modo privado / quota cheia: o envio continua, só perde a retomada.
  }
}

function clearMultipartState(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignorado
  }
}

/**
 * ETag de um bloco já enviado, perguntando ao storage (via API) quando o header
 * não veio na resposta do PUT.
 *
 * Isso acontece quando o endpoint pré-assinado NÃO é same-origin com a SPA
 * (S3/MinIO externo configurado no console): o navegador só lê headers expostos
 * por CORS, e o ETag do PUT não é. Sem este fallback o envio falharia mesmo com
 * o bloco corretamente armazenado.
 */
async function fetchPartEtagFromStorage(
  uploadId: string,
  partNumber: number,
  signal?: AbortSignal,
): Promise<string> {
  const status = await api.get<MultipartStatusResponse>(
    `${BASE}/custom/assets/multipart/${uploadId}`,
    {},
    { signal },
  );

  const received = normalizeReceivedParts(status.receivedParts);
  return received.find((part) => part.partNumber === partNumber)?.etag ?? '';
}

/** Pede URLs pré-assinadas de blocos específicos e devolve por número. */
async function requestPartUrls(
  uploadId: string,
  partNumbers: number[],
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const response = await api.post<{ parts: { partNumber: number; url: string }[] }>(
    `${BASE}/custom/assets/multipart/${uploadId}/parts`,
    { partNumbers },
    { signal },
  );

  return new Map(response.parts.map((part) => [part.partNumber, part.url]));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Envia um bloco direto ao storage, renovando a URL assinada se ela expirar. */
async function uploadPartWithRetry(
  partNumber: number,
  url: string,
  blob: Blob,
  refreshUrl: (partNumber: number) => Promise<string>,
  /** Recebe também a velocidade medida, para o ETA do ARQUIVO (não do bloco). */
  onProgress?: (loaded: number, total: number, bytesPerSecond?: number) => void,
  signal?: AbortSignal,
): Promise<MultipartPart> {
  let lastError: unknown = null;
  let currentUrl = url;

  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    try {
      const { etag } = await api.putPresignedPart(currentUrl, blob, {
        timeoutMs: 0,
        signal,
        onProgress: onProgress
          ? (progress) => onProgress(progress.loaded, progress.total, progress.bytesPerSecond)
          : undefined,
      });

      // ETag vazio NÃO é erro aqui: quando o storage não é same-origin o
      // navegador não lê o header (CORS) e o ETag é buscado no storage logo
      // depois, pelo fluxo principal.
      return { partNumber, etag, sizeBytes: blob.size };
    } catch (error) {
      lastError = error;

      // Cancelado pelo usuário: não gasta novas requisições nem esperas — o
      // painel precisa sair do "enviando" na hora.
      if (signal?.aborted) break;
      if (attempt === PART_MAX_ATTEMPTS) break;

      // 403/expiração: a URL assinada venceu (upload longo) — pede outra.
      currentUrl = await refreshUrl(partNumber).catch((refreshError) => {
        // 409 = a sessão já foi concluída (outra aba): deixe subir para o fluxo
        // cair no complete idempotente em vez de insistir com a URL morta.
        if (refreshError instanceof ApiError && refreshError.status === 409) throw refreshError;
        return currentUrl;
      });
      await delay(500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao enviar o bloco ao storage.");
}

/**
 * Upload multipart direto no storage com retomada. Devolve o asset publicado
 * (mesmo formato do upload único) já finalizado pelo storage.
 */
async function uploadCustomAssetDirect(
  file: File,
  kind: "installer" | "icon",
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<CustomPackageAsset> {
  const fingerprint = multipartFingerprint(file, kind);
  const stateKey = MULTIPART_STATE_PREFIX + fingerprint;

  let state = readMultipartState(stateKey);
  let alreadyCompleted = false;

  // 1) Tenta RETOMAR: o storage é a fonte de verdade das partes recebidas.
  if (state) {
    try {
      const status = await api.get<MultipartStatusResponse>(
        `${BASE}/custom/assets/multipart/${state.uploadId}`,
      );

      if (status.completed) {
        // Já foi finalizado (resposta anterior se perdeu): só falta devolver o asset.
        alreadyCompleted = true;
      } else if (
        // O plano persistido PRECISA representar a mesma divisão do arquivo que a
        // sessão do servidor: se o tamanho do bloco ou o total mudou (config
        // alterada, SPA antiga servida pelo service worker), as coordenadas
        // gravadas apontariam para faixas erradas — enviar assim corromperia o
        // arquivo. Nesse caso a sessão antiga é descartada e começa do zero.
        Array.isArray(state.ranges) &&
        state.ranges.length > 0 &&
        (state.partSizeBytes !== status.partSizeBytes || state.ranges.length !== status.totalParts)
      ) {
        void api.del(`${BASE}/custom/assets/multipart/${state.uploadId}`).catch(() => undefined);
        clearMultipartState(stateKey);
        state = null;
      } else {
        state = {
          ...state,
          objectKey: status.objectKey,
          partSizeBytes: status.partSizeBytes,
          parts: normalizeReceivedParts(status.receivedParts),
        };
      }
    } catch (error) {
      // 404 = a sessão não existe mais (expirou/abortada): recomeça do zero.
      // Qualquer outro erro é transitório; o estado local é a melhor informação
      // disponível e a API é idempotente no complete.
      if (error instanceof ApiError && error.status === 404) {
        clearMultipartState(stateKey);
        state = null;
      }
    }
  }

  // 2) Abre um novo multipart no storage.
  if (!state) {
    // Barra final de propósito: um nginx com "location .../multipart/" responde
    // 301 de /multipart para /multipart/ e o navegador transforma o POST em GET
    // (405). A API aceita a rota nas duas formas, então a barra elimina o redirect.
    const session = await api.post<MultipartSessionResponse>(`${BASE}/custom/assets/multipart/`, {
      kind,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    state = {
      uploadId: session.uploadId,
      objectKey: session.objectKey,
      partSizeBytes: session.partSizeBytes || ASSET_PART_SIZE,
      fingerprint,
      parts: [],
    };
    writeMultipartState(stateKey, state);
  }

  const sessionPartSize = state.partSizeBytes > 0 ? state.partSizeBytes : ASSET_PART_SIZE;

  // ── Progresso e ETA AGREGADOS ─────────────────────────────────────────
  // Medido no total (e não por bloco): com blocos encadeados, a taxa de um bloco
  // isolado subestima o envio e o tempo restante sairia irreal.
  let uploadedBytes = state.parts.reduce((sum, part) => sum + (part.sizeBytes ?? 0), 0);
  const inFlightBytes = new Map<number, number>();

  let aggLastAt = 0;
  let aggLastLoaded = 0;
  let aggRate = 0;

  let lastEmitAt = 0;

  /**
   * `force` emite mesmo dentro da janela de throttle (conclusão de bloco, erro) —
   * assim o painel sempre vê o fecho de cada bloco.
   *
   * Com blocos encadeados os eventos de progresso chegam 3× mais rápido; sem
   * throttle isso vira uma enxurrada de setState do React durante o envio.
   */
  const report = (force = false) => {
    if (!onProgress) return;

    const inFlight = [...inFlightBytes.values()].reduce((sum, value) => sum + value, 0);
    const sent = Math.min(file.size, uploadedBytes + inFlight);
    const now = performance.now();

    if (aggLastAt > 0) {
      const elapsed = (now - aggLastAt) / 1000;
      const delta = sent - aggLastLoaded;

      // Só reamostra em janelas úteis: eventos em rajada distorceriam a média.
      if (elapsed >= 0.4 && delta > 0) {
        const instant = delta / elapsed;
        aggRate = aggRate > 0 ? aggRate * 0.7 + instant * 0.3 : instant;
        aggLastAt = now;
        aggLastLoaded = sent;
      }
    } else {
      aggLastAt = now;
      aggLastLoaded = sent;
    }

    if (!force && lastEmitAt > 0 && now - lastEmitAt < PROGRESS_THROTTLE_MS) return;
    lastEmitAt = now;

    const remaining = Math.max(0, file.size - sent);
    const etaSeconds = aggRate > 0 && remaining > 0 ? remaining / aggRate : undefined;

    onProgress({
      loaded: sent,
      total: file.size,
      percent: file.size > 0 ? Math.min(100, Math.round((sent / file.size) * 100)) : 0,
      bytesPerSecond: aggRate > 0 ? aggRate : undefined,
      etaSeconds,
    });
  };

  report(true);

  // ── Plano de blocos (persistido) ──────────────────────────────────────
  const ranges: PartRange[] =
    Array.isArray(state.ranges) && state.ranges.length > 0 ? [...state.ranges] : [];

  if (ranges.length === 0) {
    for (let start = 0, partNumber = 1; start < file.size; partNumber++) {
      const end = Math.min(start + sessionPartSize, file.size);
      ranges.push({ partNumber, start, end });
      start = end;
    }

    state.ranges = ranges;
    writeMultipartState(stateKey, state);
  }

  const uploadedNumbers = new Set(state.parts.map((part) => part.partNumber));
  const pendingRanges = ranges.filter((range) => !uploadedNumbers.has(range.partNumber));

  // 3) Envia os blocos ENCADEADOS (N em paralelo) direto nas URLs assinadas.
  if (!alreadyCompleted && pendingRanges.length > 0) {
    // AbortController PRÓPRIO do envio: herda o cancelamento do usuário E corta os
    // XHRs em voo quando um bloco falha. Sem isso os workers sobreviventes
    // continuariam emitindo progresso e "ressuscitariam" o painel depois do erro.
    const run = new AbortController();

    // Herda o cancelamento do usuário e devolve o "unlink": o listener precisa
    // sair quando o envio termina (sem isso fica preso ao signal até ele ser
    // abortado — vazamento latente se o signal for reutilizado).
    const linkAbort = (outer?: AbortSignal): (() => void) => {
      if (!outer) return () => undefined;

      const onAbort = () => run.abort(outer.reason);
      if (outer.aborted) {
        run.abort(outer.reason);
        return () => undefined;
      }

      outer.addEventListener('abort', onAbort);
      return () => outer.removeEventListener('abort', onAbort);
    };

    const unlinkAbort = linkAbort(signal);
    const runSignal = run.signal;

    // Sessão concluída por outra aba: o /parts responde 409 e o envio deve cair
    // no complete idempotente em vez de insistir.
    let sessionCompletedElsewhere = false;

    const refreshUrl = async (partNumber: number): Promise<string> => {
      const refreshed = await requestPartUrls(state!.uploadId, [partNumber], runSignal);
      const url = refreshed.get(partNumber);
      if (!url) throw new Error(`Não foi possível renovar a URL do bloco ${partNumber}.`);
      return url;
    };

    // As URLs assinadas valem 1 HORA e são REAPROVEITADAS: o envio do arquivo
    // inteiro usa a mesma leva, pré-assinada em LOTES de 50 — em vez de uma
    // chamada por bloco. Numa rede rápida esse era um custo por bloco; e como a
    // validade é de 1 h, o lote cobre o envio inteiro. Se um bloco falhar por
    // expiração, o retry assina só aquele de novo.
    const URL_PREFETCH_BATCH = 50;
    const urlCache = new Map<number, string>();

    const prefetchUrls = async (from: number, count: number): Promise<void> => {
      const chunk = pendingRanges
        .slice(from, from + count)
        .map((range) => range.partNumber)
        .filter((partNumber) => !urlCache.has(partNumber));
      if (chunk.length === 0) return;

      try {
        const urls = await requestPartUrls(state.uploadId, chunk, runSignal);
        urls.forEach((url, partNumber) => urlCache.set(partNumber, url));
      } catch (error) {
        // Pré-assinar não é crítico: getUrl busca sob demanda. Mas o 409
        // ("sessão já concluída" em outra aba) é registrado para o fluxo cair no
        // complete idempotente.
        if (error instanceof ApiError && error.status === 409) sessionCompletedElsewhere = true;
      }
    };

    const getUrl = async (partNumber: number): Promise<string> => {
      const cached = urlCache.get(partNumber);
      if (cached) return cached;

      const url = await refreshUrl(partNumber);
      urlCache.set(partNumber, url);
      return url;
    };

    // Duas levas prontas antes de começar (para o 1º bloco não esperar) e o resto
    // sendo assinado em segundo plano, à frente dos workers.
    await prefetchUrls(0, URL_PREFETCH_BATCH * 2);
    let feedIndex = URL_PREFETCH_BATCH * 2;

    const queue = [...pendingRanges];
    const workerCount = Math.max(1, Math.min(PART_CONCURRENCY, queue.length));
    let failed = false;

    const feedUrls = async (): Promise<void> => {
      while (!failed && !runSignal.aborted && feedIndex < pendingRanges.length) {
        await prefetchUrls(feedIndex, URL_PREFETCH_BATCH);
        feedIndex += URL_PREFETCH_BATCH;
      }
    };

    void feedUrls();

    const runWorker = async (): Promise<void> => {
      while (!failed && !runSignal.aborted) {
        const range = queue.shift();
        if (!range) return;

        const blob = file.slice(range.start, range.end);

        // Progresso do bloco não pode REGREDIR numa retentativa (nova tentativa
        // recomeça em 0): guarda o máximo já enviado deste bloco.
        let partSent = 0;

        let uploaded;
        try {
          uploaded = await uploadPartWithRetry(
            range.partNumber,
            await getUrl(range.partNumber),
            blob,
            refreshUrl,
            (loaded) => {
              partSent = Math.max(partSent, loaded);
              inFlightBytes.set(range.partNumber, partSent);
              report();
            },
            runSignal,
          );
        } catch (error) {
          // Bloco falhou/cancelado: some com o "em voo" dele, senão o progresso
          // fica inflado e o painel parece travado num total que não existe.
          inFlightBytes.delete(range.partNumber);
          report(true);
          throw error;
        }

        // Sem ETag na resposta (storage externo atrás de CORS): busca no storage.
        if (!uploaded.etag) {
          uploaded.etag = await fetchPartEtagFromStorage(state.uploadId, range.partNumber, runSignal);
          if (!uploaded.etag) {
            inFlightBytes.delete(range.partNumber);
            throw new Error(
              `O bloco ${range.partNumber} subiu, mas não foi possível confirmar o ETag no storage. Tente novamente.`,
            );
          }
        }

        state.parts.push(uploaded);
        state.parts.sort((a, b) => a.partNumber - b.partNumber);

        // IMPORTANTE: somar aos concluídos ANTES de remover o em-voo. Se remover
        // primeiro, o progresso cai (barra volta) durante a confirmação do ETag.
        uploadedBytes += uploaded.sizeBytes;
        inFlightBytes.delete(range.partNumber);

        // Gravado a CADA bloco: se a página cair, o próximo envio retoma daqui.
        writeMultipartState(stateKey, state);
        report(true);
      }
    };

    try {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    } catch (error) {
      // Um bloco falhou: para de puxar novos blocos e CORTA os XHRs em voo, para
      // nenhum progresso atrasado mexer no painel depois do erro.
      failed = true;
      queue.length = 0;
      run.abort('failed');

      // 409 = outra aba/fluxo já concluiu este upload: não é erro, o complete
      // abaixo é idempotente e devolve o asset.
      if (!(sessionCompletedElsewhere || (error instanceof ApiError && error.status === 409))) throw error;
    } finally {
      // Terminou (sucesso, erro ou cancelamento): solta o listener do signal do
      // usuário e para o pré-assinador que ainda estivesse rodando.
      unlinkAbort();
      run.abort('finished');
    }
  }

  // 4) Finaliza no storage (a API só envia os ETags e publica o asset).
  // Sem timeout no cliente: a API ainda calcula o SHA-256 do arquivo montado
  // (passada de leitura no loopback) e um instalador de vários GiB demora.
  // A API é idempotente, então uma resposta perdida pode ser reconferida.
  let asset: CustomPackageAsset;
  try {
    asset = await api.post<CustomPackageAsset>(
      `${BASE}/custom/assets/multipart/${state.uploadId}/complete`,
      { parts: state.parts },
      { timeoutMs: 0, signal },
    );
  } catch (error) {
    // Cancelamento do usuário não deve virar retentativa.
    if (signal?.aborted) throw error;

    await delay(2000);
    asset = await api.post<CustomPackageAsset>(
      `${BASE}/custom/assets/multipart/${state.uploadId}/complete`,
      { parts: state.parts },
      { timeoutMs: 0, signal },
    );
  }

  // O estado NÃO é apagado aqui: enquanto o asset não for vinculado ao pacote
  // (salvar o cadastro), ele é a única forma de o site reencontrar o uploadId e
  // DESCARTAR o objeto quando o operador troca o arquivo. É limpo por
  // forgetUploadedAsset() após salvar ou por discardUnlinkedAsset() ao descartar.
  writeMultipartState(stateKey, { ...state, completed: true });

  return asset;
}

/**
 * O asset deste arquivo já foi vinculado ao pacote (salvamento concluído):
 * esquece o estado do upload. Sem isso o site continuaria "achando" o upload e
 * poderia tentar descartar um objeto que está em uso (a API responde 409).
 */
export function forgetUploadedAsset(file: File, kind: "installer" | "icon"): void {
  clearMultipartState(MULTIPART_STATE_PREFIX + multipartFingerprint(file, kind));
}

/**
 * Descarta um asset JÁ PUBLICADO (upload concluído) que ainda não foi vinculado
 * ao pacote — usado quando o operador troca o arquivo antes de salvar ou remove a
 * seleção. Sem isso, cada troca deixaria um objeto de vários GiB órfão no storage
 * (a limpeza automática só age depois de 24 h).
 *
 * Melhor esforço: falha aqui não pode impedir a troca do arquivo.
 */
export async function discardUnlinkedAsset(
  file: File,
  kind: "installer" | "icon",
): Promise<void> {
  const stateKey = MULTIPART_STATE_PREFIX + multipartFingerprint(file, kind);
  const state = readMultipartState(stateKey);
  if (!state) return;

  try {
    await api.del(`${BASE}/custom/assets/multipart/${state.uploadId}`);
    clearMultipartState(stateKey);
  } catch (error) {
    // 404 = sessão expirada; 409 = já vinculado ao pacote (a API se recusa a
    // apagar, e o handle local não serve mais).
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      clearMultipartState(stateKey);
    }
    // Outros erros (5xx/rede): MANTÉM o estado — é o único handle para tentar o
    // descarte de novo (e o índice do lado servidor também ficou).
  }
}

export const appStoreApi = {
  syncCatalog: async (installationType: AppInstallationType) => {
    // Dispara o job em background (202). O resultado é obtido via polling
    // de getSyncStatus feito pelo componente (useSyncCatalog + CatalogTab).
    await api.post<unknown>(
      `${BASE}/sync?installationType=${installationType}`,
    );
    return {
      installationType,
      success: true,
      packagesUpserted: 0,
      syncedAt: new Date().toISOString(),
    } satisfies SyncChocolateyCatalogResponse;
  },

  getSyncStatus: async (installationType: AppInstallationType) => {
    const response = await api.get<
      Partial<AppStoreSyncStatus> & Record<string, unknown>
    >(`${BASE}/sync/status`, { installationType });
    return normalizeSyncStatus(response ?? {});
  },

  getCatalog: async (params: CatalogParams = {}) => {
    const queryParams: Record<string, unknown> = { ...params };

    const response = await api.get<RawCatalogPage>(
      `${BASE}/catalog`,
      queryParams,
    );
    return normalizeCatalogPage(response, params.installationType);
  },

  getPackage: async (
    packageId: string,
    installationType?: AppInstallationType,
  ) => {
    const queryParams: Record<string, unknown> =
      installationType !== undefined ? { installationType } : {};

    const response = await api.get<RawCatalogPackage>(
      `${BASE}/catalog/${encodeURIComponent(packageId)}`,
      queryParams,
    );
    return normalizeCatalogPackage(response, installationType);
  },

  getApprovals: async (params: ApprovalsParams) => {
    const response = await api.get<RawApprovalRulesResponse>(
      `${BASE}/approvals`,
      params as unknown as Record<string, unknown>,
    );
    return normalizeApprovalsResponse(response, params.installationType);
  },

  createApproval: (data: CreateAppApprovalRuleRequest) =>
    api.post<AppApprovalRule>(`${BASE}/approvals`, data),

  deleteApproval: (ruleId: string, reason?: string) => {
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.del<void>(`${BASE}/approvals/${ruleId}${q}`);
  },

  getAudit: (params: AuditParams = {}) =>
    api.get<AppApprovalAuditPage>(
      `${BASE}/approvals/audit`,
      params as unknown as Record<string, unknown>,
    ),

  getEffective: (params: EffectiveParams) =>
    api.get<AppEffectivePage>(
      `${BASE}/effective`,
      params as unknown as Record<string, unknown>,
    ),

  getDiff: (
    packageId: string,
    params: Pick<EffectiveParams, "scopeType" | "scopeId" | "installationType">,
  ) =>
    api.get<AppDiffEntry>(
      `${BASE}/diff/${encodeURIComponent(packageId)}`,
      params as unknown as Record<string, unknown>,
    ),

  getDiffEffective: (params: EffectiveParams) =>
    api.get<AppDiffPage>(
      `${BASE}/diff/effective`,
      params as unknown as Record<string, unknown>,
    ),

  // ── Pacotes custom (cadastro manual) ──────────────────────────────

  /**
   * Envia instalador (kind=installer) ou ícone/capa (kind=icon) para o object
   * storage.
   *
   * Até 10 MiB: uma requisição multipart para a API. Acima disso: MULTIPART
   * DIRETO no storage (RustFS/S3) em blocos de 10 MiB — o arquivo não passa pela
   * API (o Cloudflare recusa corpo único de vários GiB com 413) e o envio é
   * retomável (partes ficam no storage entre tentativas).
   */
  uploadCustomAsset: async (
    file: File,
    kind: "installer" | "icon" = "installer",
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
  ) => {
    // Arquivos pequenos: caminho direto (1 requisição multipart).
    if (file.size <= SINGLE_REQUEST_MAX_BYTES) {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<CustomPackageAsset>(
        `${BASE}/custom/assets?kind=${kind}`,
        formData,
        { timeoutMs: 0, onProgress, signal },
      );
    }

    // Arquivos grandes: multipart DIRETO no storage, com retomada.
    return uploadCustomAssetDirect(file, kind, onProgress, signal);
  },

  /** Cria ou atualiza um pacote custom. */
  upsertCustomPackage: (data: UpsertCustomPackageRequest) =>
    api.post<AppStoreCatalogPackage>(`${BASE}/custom`, data),

  /** Remove um pacote custom. */
  deleteCustomPackage: (packageId: string) =>
    api.del<void>(`${BASE}/custom/${encodeURIComponent(packageId)}`),

  /**
   * Apaga APENAS o instalador publicado do pacote custom (metadados continuam).
   * O objeto é removido do object storage no servidor.
   */
  deleteCustomPackageFile: (packageId: string) =>
    api.del<void>(`${BASE}/custom/${encodeURIComponent(packageId)}/file`),
};
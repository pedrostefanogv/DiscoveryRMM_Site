import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverEditableFields } from "@/utils/configurationEditors";

/**
 * Regressão do bug de produção (HTTP 400 em /settings/server):
 * "Sensores de Monitoramento" é um campo kind=json no grupo "features". A página
 * roteava o render por GROUP e desenhava o blob JSON como switch; ao alternar, o
 * PATCH mandava um booleano para uma propriedade string e o backend respondia
 * "The requested operation requires an element of type String, but the target
 * element has type True."
 */

const FEATURE_TOGGLE_COUNT = serverEditableFields.filter(
  (field) => field.group === "features" && field.kind === "boolean",
).length;

const SENSORS_JSON = JSON.stringify({
  enabled: true,
  defaultIntervalSeconds: 300,
  autoTicketEnabled: true,
  notifyEnabled: true,
});

/** Configuração mínima: só recoveryEnabled ligado para o contador 1/N. */
const SERVER_CONFIG = {
  version: 7,
  recoveryEnabled: true,
  discoveryEnabled: false,
  p2PFilesEnabled: false,
  cloudBootstrapEnabled: false,
  chatAIEnabled: false,
  supportEnabled: false,
  knowledgeBaseEnabled: false,
  zeroTouchEnabled: false,
  windowsUpdateEnabled: false,
  SensorsSettingsJson: SENSORS_JSON,
  objectStorageEndpoint: "",
  objectStorageBucketName: "",
  natsEnabled: false,
  ticketAttachmentSettingsJson: JSON.stringify({
    enabled: true,
    maxFileSizeBytes: 10485760,
    maxLargeFileSizeBytes: 2147483648,
    allowedContentTypes: ["application/pdf"],
    presignedUploadUrlTtlMinutes: 15,
  }),
};

/**
 * Quantos toggles do grupo "features" aparecem LIGADOS com a SERVER_CONFIG
 * abaixo. O contador "Módulos ativos" da página usa exatamente esta regra: um
 * campo ligado é o que estiver true no servidor; sem valor no servidor, vale o
 * defaultValue declarado pelo campo (é o que espelha o appsettings).
 *
 * Antes este teste fixava "1/N" no texto: só recoveryEnabled estava ligado no
 * fixture. Os kill switches do GRUPO A (CFG-A) entraram no grupo com
 * defaultValue true (o mesmo do appsettings), então derivar o número evita
 * quebrar o teste a cada toggle novo — o que ele realmente protege é que o blob
 * JSON (SensorsSettingsJson) NÃO entre no denominador.
 */
const CONFIG_BY_KEY = SERVER_CONFIG as Record<string, unknown>;
const ACTIVE_FEATURE_TOGGLE_COUNT = serverEditableFields.filter((field) => {
  if (field.group !== "features" || field.kind !== "boolean") return false;
  const configured = CONFIG_BY_KEY[field.key];
  if (configured !== undefined && configured !== null) return configured === true;
  return field.defaultValue === "true";
}).length;

const { patchMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  patchMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: toastSuccess, error: toastError });
  return { default: toast };
});

vi.mock("@/hooks/useConfigurationApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useConfigurationApi")>();
  const noopMutation = () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  return {
    ...actual,
    useServerConfig: () => ({
      data: SERVER_CONFIG,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      error: null,
    }),
    useServerMetadata: () => ({ data: { agentHomeTabOptions: [] }, isLoading: false }),
    usePatchServerConfig: () => ({ mutateAsync: patchMutate, isPending: false }),
    usePatchServerNatsConfig: noopMutation,
    useResetServerConfig: noopMutation,
    useExportServerConfig: noopMutation,
    useImportServerConfig: noopMutation,
    useTestNatsServer: noopMutation,
    useTestObjectStorage: noopMutation,
    useTestStoredAiKey: noopMutation,
    useTicketAttachmentSettings: () => ({
      data: {
        enabled: true,
        maxFileSizeBytes: 10485760,
        maxLargeFileSizeBytes: 2147483648,
        allowedContentTypes: ["application/pdf"],
        presignedUploadUrlTtlMinutes: 15,
      },
      isLoading: false,
    }),
    useUpdateTicketAttachmentSettings: noopMutation,
  };
});

// Cards pesados (react-query/efeitos próprios) não interessam a este teste: o foco
// é o roteamento dos campos do grupo "features" por KIND. Os tokens de estilo e o
// ConfigurationFieldEditor continuam reais.
vi.mock("@/components/configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/configuration")>();
  const Null = () => null;
  return {
    ...actual,
    RemoteAccessConsentSection: Null,
    AiIntegrationCard: Null,
    MaintenanceWindowCard: Null,
    BackgroundProcessingCard: Null,
    ConfigHealthCard: Null,
    LockedFieldsEditor: Null,
  };
});

import ServerConfigurationPage from "./ServerConfigurationPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/server"]}>
      <ServerConfigurationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  patchMutate.mockReset();
  patchMutate.mockResolvedValue(undefined);
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => cleanup());

describe("ServerConfigurationPage — campos de funcionalidades por kind", () => {
  it("não renderiza switch para SensorsSettingsJson (campo kind json)", () => {
    renderPage();

    // Só os toggles booleanos do grupo continuam como switch cards.
    expect(screen.queryAllByRole("switch")).toHaveLength(FEATURE_TOGGLE_COUNT);
    expect(screen.queryByRole("switch", { name: /Sensores de Monitoramento/ })).toBeNull();

    // O campo aparece com o editor tipado (título + controles próprios).
    expect(screen.getByText("Sensores de Monitoramento")).toBeTruthy();
    expect(screen.getByLabelText(/Sensores habilitados/)).toBeTruthy();
  });

  it("conta apenas toggles booleanos em Módulos ativos", () => {
    renderPage();

    // O blob JSON não entra no denominador. O numerador conta os toggles
    // LIGADOS: recoveryEnabled (true no fixture) + os kill switches do GRUPO A
    // que não têm valor no fixture e caem no defaultValue true do catálogo.
    expect(FEATURE_TOGGLE_COUNT).toBeGreaterThan(0);
    expect(ACTIVE_FEATURE_TOGGLE_COUNT).toBeGreaterThan(0);
    expect(ACTIVE_FEATURE_TOGGLE_COUNT).toBeLessThan(FEATURE_TOGGLE_COUNT);
    expect(
      screen.getByText(ACTIVE_FEATURE_TOGGLE_COUNT + "/" + FEATURE_TOGGLE_COUNT),
    ).toBeTruthy();
  });

  it("alternar um módulo booleano continua enviando booleano no PATCH", async () => {
    renderPage();

    // Âncora no início: os cards de P2P e Zero-Touch CITAM "Descoberta de Rede"
    // na descrição, então um regex solto casaria com três switches.
    fireEvent.click(screen.getByRole("switch", { name: /^Descoberta de Rede/ }));

    await waitFor(() => expect(patchMutate).toHaveBeenCalledTimes(1));
    expect(patchMutate.mock.calls[0][0]).toEqual({ discoveryEnabled: true });
  });

  it("salvar o editor de sensores envia SensorsSettingsJson como STRING", async () => {
    renderPage();

    fireEvent.click(screen.getByLabelText(/Sensores habilitados/));
    fireEvent.click(screen.getAllByRole("button", { name: /Salvar alterações/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar e salvar/ }));

    await waitFor(() => expect(patchMutate).toHaveBeenCalledTimes(1));
    const payload = patchMutate.mock.calls[0][0] as Record<string, unknown>;

    // O bug era exatamente um booleano (true) nessa propriedade.
    expect(typeof payload.SensorsSettingsJson).toBe("string");
    expect(payload.SensorsSettingsJson).not.toBe(false);
    expect(JSON.parse(payload.SensorsSettingsJson as string)).toMatchObject({
      enabled: false,
      defaultIntervalSeconds: 300,
    });
  });
});

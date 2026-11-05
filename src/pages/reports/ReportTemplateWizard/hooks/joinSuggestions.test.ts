import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DatasetCatalogItem } from "@/api/types";
import { useJoinSuggestions } from "./useJoinSuggestions";
import type { SelectedDataset } from "./useWizardState";

function catalogItem(
  key: string,
  datasetType: string,
  alias: string,
  joinKeys: string[],
  joinCapabilities?: DatasetCatalogItem["joinCapabilities"],
): DatasetCatalogItem {
  return {
    key,
    type: key,
    datasetType,
    name: key,
    fields: joinKeys,
    fieldMetadata: joinKeys.map((field) => ({
      field,
      reference: field,
      isJoinKey: true,
      defaultAlias: `${alias}.${field}`,
    })),
    joinCapabilities,
  };
}

// agentSensors = dataset 29: no catalogo real chegava com capabilities VAZIAS
// por causa do teto de 200 sugestoes consumido em varredura sequencial.
const sensors = catalogItem("agentSensors", "29", "sns", ["agentId", "clientId", "siteId"], []);
const hardware = catalogItem("agentHardware", "4", "hw", ["agentId", "clientId", "siteId"]);

function selected(item: DatasetCatalogItem, alias: string, extra: Partial<SelectedDataset> = {}): SelectedDataset {
  return {
    catalogItem: item,
    alias,
    joinType: "left",
    isPrimary: false,
    ...extra,
  };
}

describe("useJoinSuggestions", () => {
  it("NAO depende de joinCapabilities para achar chave comum (dataset 29)", () => {
    // capability vazia + metadata presente => ainda sugere via agentId.
    const { result } = renderHook(() =>
      useJoinSuggestions([selected(hardware, "hw", { isPrimary: true })], [sensors]),
    );
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].preferredKey).toBe("agentId");
    expect(result.current.suggestions[0].targetDatasetName).toBe("agentSensors");
  });

  it("acusa fonte secundaria sem join configurado", () => {
    const { result } = renderHook(() =>
      useJoinSuggestions(
        [
          selected(hardware, "hw", { isPrimary: true }),
          selected(sensors, "sns", { joinToAlias: undefined }),
        ],
        [hardware, sensors],
      ),
    );
    expect(result.current.warnings.join(" ")).toContain("não tem join configurado");
    expect(result.current.issues[0].alias).toBe("sns");
  });

  it("acusa join para uma fonte POSTERIOR na ordem (regra do backend)", () => {
    const { result } = renderHook(() =>
      useJoinSuggestions(
        [
          selected(hardware, "hw", { isPrimary: true }),
          selected(
            sensors,
            "sns",
            // sns (indice 1) aponta para log (indice 2): posterior, invalido.
            { joinToAlias: "log", joinSourceKey: "agentId", joinTargetKey: "agentId" },
          ),
          selected(catalogItem("logs", "6", "log", ["agentId"]), "log"),
        ],
        [],
      ),
    );
    // O item de indice 2 tambem nao tem join; o aviso relevante e o da ordem.
    expect(result.current.warnings.join(" ")).toContain("depois dela na ordem");
  });

  it("acusa chave que nao existe no dataset de destino", () => {
    const other = catalogItem("logs", "6", "log", ["agentId", "clientId"]);
    const { result } = renderHook(() =>
      useJoinSuggestions(
        [
          selected(hardware, "hw", { isPrimary: true }),
          selected(other, "log", { joinToAlias: "hw", joinSourceKey: "siteId", joinTargetKey: "siteId" }),
        ],
        [],
      ),
    );
    expect(result.current.warnings.join(" ")).toContain("não é uma chave válida");
  });

  it("nao acusa nada com um join valido", () => {
    const { result } = renderHook(() =>
      useJoinSuggestions(
        [
          selected(hardware, "hw", { isPrimary: true }),
          selected(sensors, "sns", {
            joinToAlias: "hw",
            joinSourceKey: "agentId",
            joinTargetKey: "agentId",
          }),
        ],
        [],
      ),
    );
    expect(result.current.warnings).toEqual([]);
    expect(result.current.issues).toEqual([]);
  });
});

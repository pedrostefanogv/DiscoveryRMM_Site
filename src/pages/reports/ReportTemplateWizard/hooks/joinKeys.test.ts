import { describe, expect, it } from "vitest";
import type { DatasetCatalogItem } from "@/api/types";
import {
  findCommonJoinKeys,
  getDatasetKey,
  getDefaultAlias,
  getJoinKeys,
  indexCatalogByKey,
  pickPreferredJoinKey,
  stripAlias,
} from "./joinKeys";

/** Catalogo minimo no MESMO formato que GET /reports/datasets devolve. */
function catalogItem(
  key: string,
  datasetType: string,
  joinKeys: string[],
  extra: Partial<DatasetCatalogItem> = {},
): DatasetCatalogItem {
  return {
    key,
    type: key,
    datasetType,
    name: key,
    fields: [...joinKeys, "nome"],
    fieldMetadata: [
      ...joinKeys.map((field) => ({
        field,
        reference: field,
        isJoinKey: true,
      })),
      { field: "nome", reference: "nome", isJoinKey: false },
    ],
    ...extra,
  };
}

const hardware = catalogItem("agentHardware", "4", ["agentId", "clientId", "siteId"]);
// Dataset 29: era exatamente o que a matriz estatica OMITIA.
const sensors = catalogItem("agentSensors", "29", ["agentId", "clientId", "siteId"]);
const windowsUpdates = catalogItem("windowsUpdates", "31", ["agentId", "clientId"]);
const ticketAnswers = catalogItem("ticketAnswers", "34", ["ticketId"]);

describe("joinKeys", () => {
  it("deriva as chaves de fieldMetadata[].isJoinKey", () => {
    expect(getJoinKeys(sensors).sort()).toEqual(["agentId", "clientId", "siteId"]);
  });

  it("agentSensors (dataset 29) compartilha agentId com agentHardware", () => {
    // Regressao do bug: a matriz estatica omitia agentSensors, entao o
    // wizard dizia "nao compartilha chaves com nenhum outro dataset".
    const common = findCommonJoinKeys(sensors, hardware);
    expect(common).toContain("agentId");
    expect(common).toContain("clientId");
    expect(common).toContain("siteId");
    expect(pickPreferredJoinKey(common)).toBe("agentId");
  });

  it("nao depende de uma lista fixa de datasets (7 antes omitidos)", () => {
    for (const item of [sensors, windowsUpdates, ticketAnswers]) {
      expect(getJoinKeys(item).length).toBeGreaterThan(0);
    }
    expect(findCommonJoinKeys(windowsUpdates, hardware)).toContain("agentId");
  });

  it("usa joinCapabilities quando a metadata nao marca a chave", () => {
    const item: DatasetCatalogItem = {
      key: "agentSensors",
      datasetType: "29",
      fields: ["agentId"],
      fieldMetadata: [{ field: "agentId", reference: "agentId" }],
      joinCapabilities: [
        { sourceKey: "agentId", targetKey: "agentId", joinTypes: ["left", "inner"] },
      ],
    };
    expect(getJoinKeys(item)).toContain("agentId");
  });

  it("stripAlias remove o prefixo de alias dos dois lados", () => {
    expect(stripAlias("hw.agentId")).toBe("agentId");
    expect(stripAlias("agentId")).toBe("agentId");
    expect(stripAlias("")).toBe("");
  });

  it("normaliza reference com alias ao comparar datasets", () => {
    const aliased: DatasetCatalogItem = {
      key: "agentSensors",
      datasetType: "29",
      fields: ["agentId"],
      fieldMetadata: [{ field: "agentId", reference: "sns.agentId", isJoinKey: true }],
    };
    expect(findCommonJoinKeys(aliased, hardware)).toContain("agentId");
  });

  it("getDefaultAlias extrai o prefixo de defaultAlias \"{alias}.{field}\"", () => {
    // O backend emite DefaultAlias por CAMPO: "sns.agentId" (nao "sns").
    const item = catalogItem("agentSensors", "29", ["agentId"], {
      fieldMetadata: [
        { field: "agentId", reference: "agentId", isJoinKey: true, defaultAlias: "sns.agentId" },
      ],
    });
    expect(getDefaultAlias(item)).toBe("sns");
  });

  it("getDefaultAlias usa defaultAlias simples sem ponto", () => {
    const item = catalogItem("agentSensors", "29", ["agentId"], {
      fieldMetadata: [
        { field: "agentId", reference: "agentId", isJoinKey: true, defaultAlias: "sns" },
      ],
    });
    expect(getDefaultAlias(item)).toBe("sns");
  });

  it("getDefaultAlias cai para o prefixo da chave sem metadata", () => {
    expect(getDefaultAlias(catalogItem("agentSensors", "29", ["agentId"]))).toBe("age");
    expect(getDefaultAlias(catalogItem("agentHardware", "4", ["agentId"]))).toBe("age");
  });

  it("indexCatalogByKey encontra por datasetType, key e type", () => {
    const index = indexCatalogByKey([hardware, sensors]);
    expect(index.get("4")).toBe(hardware);
    expect(index.get("29")).toBe(sensors);
    expect(index.get("agentSensors")).toBe(sensors);
  });

  it("getDatasetKey cai para datasetType quando key/type ausentes", () => {
    expect(getDatasetKey({ datasetType: "29" })).toBe("29");
    expect(getDatasetKey(null)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { DatasetCatalogItem } from "@/api/types";
import { useWizardState } from "./useWizardState";

/**
 * Catalogo no formato real do backend: defaultAlias vem por CAMPO como
 * "{alias}.{field}" ("hw.agentId"), que e a fonte do alias do dataset.
 */
function catalogItem(
  key: string,
  datasetType: string,
  alias: string,
  joinKeys: string[],
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
        defaultAlias: `${alias}.${field}`,
      })),
      { field: "nome", reference: "nome", isJoinKey: false, defaultAlias: `${alias}.nome` },
    ],
  };
}

const hardware = catalogItem("agentHardware", "4", "hw", ["agentId", "clientId", "siteId"]);
const sensors = catalogItem("agentSensors", "29", "sns", ["agentId", "clientId", "siteId"]);
const logs = catalogItem("logs", "6", "log", ["agentId", "clientId"]);

describe("useWizardState - join e ordenacao", () => {
  it("sugere agentId ao adicionar Sensores depois de Hardware", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    const ds = result.current.state.selectedDatasets[1];
    expect(ds.joinToAlias).toBe(result.current.state.selectedDatasets[0].alias);
    expect(ds.joinSourceKey).toBe("agentId");
    expect(ds.joinTargetKey).toBe("agentId");
  });

  it("isPrimary e sempre derivado do indice (0)", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));
    expect(result.current.state.selectedDatasets.map((d) => d.isPrimary)).toEqual([
      true,
      false,
    ]);
  });

  it("removeDataset mantem a primeira fonte como principal", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));
    act(() => result.current.addDataset(logs));
    act(() =>
      result.current.removeDataset(result.current.state.selectedDatasets[0].alias),
    );
    expect(result.current.state.selectedDatasets).toHaveLength(2);
    expect(result.current.state.selectedDatasets[0].isPrimary).toBe(true);
    expect(result.current.state.selectedDatasets[1].isPrimary).toBe(false);
  });

  it("moveDataset down troca a fonte principal e repara o joinToAlias", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    const hwAlias = result.current.state.selectedDatasets[0].alias;
    act(() => result.current.moveDataset(hwAlias, "down"));

    const [first, second] = result.current.state.selectedDatasets;
    expect(first.catalogItem.key).toBe("agentSensors");
    expect(first.alias).toBe("sns");
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
    // O join que apontava para a antiga principal acompanha a nova base.
    expect(second.joinToAlias).toBe("sns");
  });

  it("moveDataset up nao faz nada no primeiro item", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));
    const before = result.current.state.selectedDatasets.map((d) => d.alias);
    act(() => result.current.moveDataset(before[0], "up"));
    expect(result.current.state.selectedDatasets.map((d) => d.alias)).toEqual(before);
  });

  it("setJoin atualiza apenas os campos informados", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));
    const alias = result.current.state.selectedDatasets[1].alias;

    act(() => result.current.setJoin(alias, { joinSourceKey: "clientId" }));
    const ds = result.current.state.selectedDatasets[1];
    expect(ds.joinSourceKey).toBe("clientId");
    expect(ds.joinTargetKey).toBe("agentId");

    act(() => result.current.setJoin(alias, { joinTargetKey: "siteId" }));
    const ds2 = result.current.state.selectedDatasets[1];
    expect(ds2.joinSourceKey).toBe("clientId");
    expect(ds2.joinTargetKey).toBe("siteId");

    act(() => result.current.setJoin(alias, { joinType: "inner" }));
    expect(result.current.state.selectedDatasets[1].joinType).toBe("inner");
  });

  it("gera dataSources com o join escolhido no layoutJson", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));
    const alias = result.current.state.selectedDatasets[1].alias;
    act(() =>
      result.current.setJoin(alias, {
        joinToAlias: result.current.state.selectedDatasets[0].alias,
        joinSourceKey: "agentId",
        joinTargetKey: "agentId",
        joinType: "left",
      }),
    );

    const layout = JSON.parse(result.current.buildLayoutJson());
    expect(layout.dataSources).toHaveLength(2);
    expect(layout.dataSources[1].join).toMatchObject({
      sourceKey: "agentId",
      targetKey: "agentId",
      joinType: "left",
    });
  });
});

describe("useWizardState - reidratacao do layout salvo", () => {
  it("mapeia dataSources por datasetType e restaura join e colunas", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        {
          dataSources: [
            { datasetType: "4", alias: "hw", join: undefined },
            {
              datasetType: "29",
              alias: "sns",
              join: {
                joinToAlias: "hw",
                sourceKey: "agentId",
                targetKey: "agentId",
                joinType: "left",
              },
            },
          ],
          columns: [
            { field: "hw.agentHostname", header: "Hostname" },
            { field: "hw.osName", header: "SO" },
          ],
          groupBy: "hw.agentId",
        },
        [hardware, sensors],
      ),
    );

    const datasets = result.current.state.selectedDatasets;
    expect(datasets).toHaveLength(2);
    expect(datasets[0].alias).toBe("hw");
    expect(datasets[0].isPrimary).toBe(true);
    expect(datasets[1].catalogItem.key).toBe("agentSensors");
    expect(datasets[1].joinSourceKey).toBe("agentId");
    expect(datasets[1].joinToAlias).toBe("hw");

    // Colunas voltam SEM o prefixo de alias (o builder o re-adiciona).
    expect(result.current.state.columns.map((c) => c.field)).toEqual([
      "agentHostname",
      "osName",
    ]);
    expect(result.current.state.groupBy).toBe("agentId");
  });

  it("descarta secao sem colunas validas (nao gera section invalida)", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        {
          dataSources: [
            { datasetType: "4", alias: "hw" },
            { datasetType: "29", alias: "sns" },
          ],
          sections: [
            { title: "Vazia", source: "sns", columns: [] },
            { title: "Sem field", source: "sns", columns: [{ header: "x" }] },
          ],
        },
        [hardware, sensors],
      ),
    );
    expect(result.current.state.subTables).toHaveLength(0);

    const layout = JSON.parse(result.current.buildLayoutJson());
    expect(layout.sections).toBeUndefined();
  });

  it("mantem secao com colunas validas", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        {
          dataSources: [
            { datasetType: "4", alias: "hw" },
            { datasetType: "29", alias: "sns" },
          ],
          sections: [
            { title: "Sensores", source: "sns", columns: [{ field: "sns.nome" }] },
          ],
        },
        [hardware, sensors],
      ),
    );
    expect(result.current.state.subTables).toHaveLength(1);
    expect(result.current.state.subTables[0].columns[0].field).toBe("nome");
    expect(result.current.state.subTables[0].sourceAlias).toBe("sns");
  });

  it("ignora datasetType fora do catalogo sem quebrar", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        { dataSources: [{ datasetType: "999", alias: "x" }] },
        [hardware, sensors],
      ),
    );
    expect(result.current.state.selectedDatasets).toHaveLength(0);
  });
});

describe("useWizardState - colunas padrao por dataset", () => {
  // Datasets que antes nao tinham DEFAULT_COLUMNS: selecionar qualquer um
  // deles deixava a tabela de colunas VAZIA no wizard. E o fluxo exato do
  // usuario que reportou o bug (Hardware + Sensores).
  const previouslyUnmapped = [
    "ticketAnswers",
    "windowsUpdates",
    "patchCompliance",
    "patchApprovals",
    "patchApprovalAudit",
    "agents",
    "agentSensors",
  ];

  it.each(previouslyUnmapped)(
    "'%s' preenche colunas quando e a fonte principal",
    (key) => {
      const item = catalogItem(key, "99", "xx", ["agentId"]);
      const { result } = renderHook(() => useWizardState());
      act(() => result.current.addDataset(item));

      expect(result.current.state.columns.length).toBeGreaterThan(0);
      // Toda coluna pertence a fonte principal e tem header legivel.
      for (const column of result.current.state.columns) {
        expect(column.sourceAlias).toBe("xx");
        expect(column.field).toBeTruthy();
        expect(column.header).toBeTruthy();
      }
    },
  );

  it("Hardware + Sensores: Sensores vira sub-tabela COM colunas", () => {
    // Fluxo reportado: o usuario escolhe Hardware e depois Sensores. Antes,
    // Sensores nao tinha DEFAULT_COLUMNS e a sub-tabela nascia vazia.
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    expect(result.current.state.columns.length).toBeGreaterThan(0);
    expect(result.current.state.subTables).toHaveLength(1);

    const subTable = result.current.state.subTables[0];
    expect(subTable.sourceAlias).toBe("sns");
    expect(subTable.columns.length).toBeGreaterThan(0);
    expect(subTable.columns.map((c) => c.field)).toContain("sensorName");
    expect(subTable.columns.map((c) => c.field)).toContain("severity");
  });

  it("agentSensors usa os campos reais, na ordem pedida", () => {
    const item = catalogItem("agentSensors", "29", "sns", ["agentId"]);
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(item));

    expect(result.current.state.columns.map((c) => c.field)).toEqual([
      "sensorName",
      "sensorType",
      "status",
      "severity",
      "primaryValue",
      "unit",
      "lastRunAt",
    ]);
  });

  it("as colunas padrao viram 'sns.campo' no layoutJson multi-source", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    const layout = JSON.parse(result.current.buildLayoutJson());
    const sectionFields = layout.sections[0].columns.map(
      (c: { field: string }) => c.field,
    );
    expect(sectionFields).toContain("sns.sensorName");
    expect(sectionFields).toContain("sns.severity");
    // E a principal continua qualificada com o alias dela.
    expect(layout.columns.map((c: { field: string }) => c.field)).toContain(
      "hw.agentHostname",
    );
  });
});

describe("useWizardState - marca 'base' (round-trip com o backend)", () => {
  it("serializa \"base\": true apenas na fonte principal", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    const layout = JSON.parse(result.current.buildLayoutJson());
    expect(layout.dataSources).toHaveLength(2);
    expect(layout.dataSources[0].base).toBe(true);
    // Nas demais a propriedade e OMITIDA (nunca "base": false).
    expect(layout.dataSources[1]).not.toHaveProperty("base");
  });

  it("nao emite 'base' em layout de fonte unica", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));

    const layout = JSON.parse(result.current.buildLayoutJson());
    // Fonte unica nao serializa dataSources (e nao ha ambiguidade de base).
    expect(layout.dataSources).toBeUndefined();
  });

  it("reordenar move a marca 'base' junto com a fonte", () => {
    const { result } = renderHook(() => useWizardState());
    act(() => result.current.addDataset(hardware));
    act(() => result.current.addDataset(sensors));

    // Move a principal (hw) para baixo: sns passa a ser a base.
    act(() => result.current.moveDataset("hw", "down"));

    const layout = JSON.parse(result.current.buildLayoutJson());
    expect(layout.dataSources[0].alias).toBe("sns");
    expect(layout.dataSources[0].base).toBe(true);
    expect(layout.dataSources[1].alias).toBe("hw");
    expect(layout.dataSources[1]).not.toHaveProperty("base");
  });

  it("round-trip: serializar -> reidratar preserva a principal", () => {
    const first = renderHook(() => useWizardState());
    act(() => first.result.current.addDataset(hardware));
    act(() => first.result.current.addDataset(sensors));
    const savedLayout = JSON.parse(first.result.current.buildLayoutJson());

    const second = renderHook(() => useWizardState());
    act(() =>
      second.result.current.hydrateFromLayout(savedLayout, [hardware, sensors]),
    );

    const datasets = second.result.current.state.selectedDatasets;
    expect(datasets[0].alias).toBe("hw");
    expect(datasets[0].isPrimary).toBe(true);
    expect(datasets[1].alias).toBe("sns");
    expect(datasets[1].isPrimary).toBe(false);
  });

  it("reidratacao REORDENA quando a base esta na 2a posicao", () => {
    // Caso chave: o backend grava a base marcada, mas ela pode vir em
    // qualquer posicao do array. A reidratacao tem de trazer para a posicao 0.
    const second = renderHook(() => useWizardState());
    act(() =>
      second.result.current.hydrateFromLayout(
        {
          dataSources: [
            {
              datasetType: "4",
              alias: "hw",
              join: {
                joinToAlias: "sns",
                sourceKey: "agentId",
                targetKey: "agentId",
                joinType: "left",
              },
            },
            { datasetType: "29", alias: "sns", base: true },
          ],
        },
        [hardware, sensors],
      ),
    );

    const datasets = second.result.current.state.selectedDatasets;
    expect(datasets).toHaveLength(2);
    expect(datasets[0].alias).toBe("sns");
    expect(datasets[0].isPrimary).toBe(true);
    expect(datasets[1].alias).toBe("hw");
    expect(datasets[1].isPrimary).toBe(false);
  });

  it("sem a marca, mantem dataSources[0] como principal (compatibilidade)", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        {
          dataSources: [
            { datasetType: "4", alias: "hw" },
            { datasetType: "29", alias: "sns" },
          ],
        },
        [hardware, sensors],
      ),
    );

    const datasets = result.current.state.selectedDatasets;
    expect(datasets[0].alias).toBe("hw");
    expect(datasets[0].isPrimary).toBe(true);
  });

  it("reidratar e reserializar mantem a marca na mesma fonte", () => {
    const { result } = renderHook(() => useWizardState());
    act(() =>
      result.current.hydrateFromLayout(
        {
          dataSources: [
            { datasetType: "4", alias: "hw" },
            { datasetType: "29", alias: "sns", base: true },
          ],
        },
        [hardware, sensors],
      ),
    );

    const layout = JSON.parse(result.current.buildLayoutJson());
    expect(layout.dataSources[0].alias).toBe("sns");
    expect(layout.dataSources[0].base).toBe(true);
    expect(layout.dataSources[1]).not.toHaveProperty("base");
  });
});

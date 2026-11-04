import { describe, expect, it } from "vitest";
import { AppApprovalScopeType } from "@/api/types";
import type { SensorChannel, SensorSeries } from "@/api";
import {
  DEFAULT_SUSTAIN_SAMPLES,
  MAX_SUSTAIN_SAMPLES,
  MIN_SUSTAIN_SAMPLES,
  SENSOR_NO_THRESHOLD_TYPES,
  SENSOR_THRESHOLD_REQUIRED_TYPES,
  SENSOR_TYPE_CHANNEL_FALLBACK,
  SENSOR_TYPE_GUIDE,
  buildRecommendedSensorRequests,
  sensorGuideExamples,
  sensorThresholdHint,
  defaultComparison,
  defaultThresholdUnit,
  describeSustainSamples,
  emptySensorChannelRow,
  escapeCsvField,
  formatSensorChannelValue,
  mergeSensorOptionsJson,
  normalizeSustainSamples,
  sensorChannelRowsFromChannels,
  sensorChannelsFromRows,
  sensorCsvFileName,
  sensorEnumChannelLabel,
  sensorOptionsFromJson,
  sensorSeriesToCsv,
  sensorTypeLabel,
  validateSensorChannelRows,
} from "./sensorUtils";

const CHANNELS: SensorChannel[] = [
  { key: "uso_cpu", label: "Uso de CPU", unit: "Percent", display: "chart", isPrimary: true },
  { key: "fila", label: "", unit: "Count", display: "chart", isPrimary: false },
];

describe("editor de canais do sensor Script", () => {
  it("converte as linhas para o contrato da API", () => {
    const rows = [
      { key: "  uso_cpu  ", label: " Uso de CPU ", unit: "Percent" as const, isPrimary: true },
      // Rótulo vazio cai para a chave; a chave é trimada.
      { key: "fila", label: "", unit: "Count" as const, isPrimary: false },
    ];

    expect(sensorChannelsFromRows(rows)).toEqual([
      { key: "uso_cpu", label: "Uso de CPU", unit: "Percent", display: "chart", isPrimary: true },
      { key: "fila", label: "fila", unit: "Count", display: "chart", isPrimary: false },
    ]);
  });

  it("descarta chave vazia/repetida e mantém no máximo um primário", () => {
    const channels = sensorChannelsFromRows([
      emptySensorChannelRow(),
      { key: "a", label: "A", unit: "Count", isPrimary: true },
      { key: "a", label: "A duplicado", unit: "Count", isPrimary: false },
      { key: "b", label: "B", unit: "Count", isPrimary: true },
    ]);

    expect(channels.map((channel) => channel.key)).toEqual(["a", "b"]);
    expect(channels.filter((channel) => channel.isPrimary).map((channel) => channel.key)).toEqual([
      "a",
    ]);
  });

  it("faz round-trip das linhas de uma definição existente", () => {
    const rows = sensorChannelRowsFromChannels(CHANNELS);
    expect(rows).toEqual([
      { key: "uso_cpu", label: "Uso de CPU", unit: "Percent", isPrimary: true },
      { key: "fila", label: "", unit: "Count", isPrimary: false },
    ]);
    expect(sensorChannelsFromRows(rows)).toEqual([
      CHANNELS[0],
      { ...CHANNELS[1], label: "fila" },
    ]);
  });

  it("valida chave obrigatória, sem espaços e sem duplicata", () => {
    expect(validateSensorChannelRows([])).toMatch(/ao menos um canal/);
    expect(validateSensorChannelRows([emptySensorChannelRow()])).toMatch(/Informe a chave/);
    expect(
      validateSensorChannelRows([{ key: "com espaco", label: "", unit: "Count", isPrimary: false }]),
    ).toMatch(/não pode conter espaços/);
    expect(
      validateSensorChannelRows([
        { key: "a", label: "", unit: "Count", isPrimary: false },
        { key: "a", label: "", unit: "Count", isPrimary: false },
      ]),
    ).toMatch(/duplicada/);
    expect(
      validateSensorChannelRows([{ key: "a", label: "", unit: "Count", isPrimary: false }]),
    ).toBeNull();
  });
});

describe("buildRecommendedSensorRequests", () => {
  const requests = buildRecommendedSensorRequests("agent-1");

  it("cria o conjunto mínimo de 4 sensores no escopo do agente", () => {
    expect(requests).toHaveLength(4);
    expect(requests.map((request) => request.sensorType)).toEqual([
      "DiskSpace",
      "Cpu",
      "Memory",
      "Uptime",
    ]);
    for (const request of requests) {
      expect(request.scopeType).toBe(AppApprovalScopeType.Agent);
      expect(request.agentId).toBe("agent-1");
      expect(request.isActive).toBe(true);
      expect(request.target).toBeNull();
    }
  });

  it("usa os limiares recomendados (disco/CPU/memória em %, uptime em segundos)", () => {
    const byType = Object.fromEntries(requests.map((request) => [request.sensorType, request]));

    expect(byType.DiskSpace.warningThreshold).toBe(15);
    expect(byType.DiskSpace.criticalThreshold).toBe(10);
    expect(byType.DiskSpace.comparison).toBe("LowerIsWorse");
    expect(byType.DiskSpace.thresholdUnit).toBe("Percent");

    expect(byType.Cpu.warningThreshold).toBe(85);
    expect(byType.Cpu.criticalThreshold).toBe(95);
    expect(byType.Cpu.comparison).toBe("HigherIsWorse");

    expect(byType.Memory.warningThreshold).toBe(85);
    expect(byType.Memory.criticalThreshold).toBe(95);
    expect(byType.Memory.comparison).toBe("HigherIsWorse");

    // Uptime: atenção 24h, sem crítico (o contrato aceita só atenção).
    expect(byType.Uptime.warningThreshold).toBe(86_400);
    expect(byType.Uptime.criticalThreshold).toBeNull();
    expect(byType.Uptime.comparison).toBe("LowerIsWorse");
    expect(byType.Uptime.thresholdUnit).toBe("Seconds");
  });

  it("gera chaves únicas (POST /sensors não pode colidir entre si)", () => {
    const keys = requests.map((request) => request.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("rótulos e limiares dos tipos novos", () => {
  const NOVOS = ["Bandwidth", "DiskIo", "EventLogRate", "SmartStatus", "CertificateExpiry", "DefenderStatus", "BitLocker"] as const;

  it("tem rótulo, unidade padrão e comparação para cada tipo novo", () => {
    for (const tipo of NOVOS) {
      expect(sensorTypeLabel(tipo)).toBeTruthy();
      expect(defaultThresholdUnit(tipo)).toBeTruthy();
      expect(defaultComparison(tipo)).toBeTruthy();
    }
    // Só "BitLocker" é nome próprio: o rótulo coincide com a chave de propósito.
    for (const tipo of NOVOS.filter((nome) => nome !== "BitLocker")) {
      expect(sensorTypeLabel(tipo)).not.toBe(tipo);
    }
    expect(sensorTypeLabel("EventLogRate")).toBe("Taxa de eventos (log)");
    expect(sensorTypeLabel("SmartStatus")).toBe("Saúde do disco (SMART)");
    expect(sensorTypeLabel("CertificateExpiry")).toBe("Expiração de certificado");
    expect(sensorTypeLabel("DefenderStatus")).toBe("Microsoft Defender");
    expect(sensorTypeLabel("BitLocker")).toBe("BitLocker");
  });

  it("trata expiração de certificado como quanto menor, pior", () => {
    expect(defaultComparison("CertificateExpiry")).toBe("LowerIsWorse");
    expect(defaultThresholdUnit("CertificateExpiry")).toBe("Days");
    expect(defaultThresholdUnit("EventLogRate")).toBe("Count");
  });

  it("cai no fallback local de canais quando a API não manda o catálogo", () => {
    expect(SENSOR_TYPE_CHANNEL_FALLBACK.EventLogRate.map((canal) => canal.key)).toContain("event_count");
    expect(SENSOR_TYPE_CHANNEL_FALLBACK.SmartStatus.map((canal) => canal.key)).toContain("smart_status");
    expect(SENSOR_TYPE_CHANNEL_FALLBACK.BitLocker.map((canal) => canal.key)).toContain("bitlocker_status");
  });

  it("decodifica os canais enumerados para texto em pt-BR", () => {
    expect(sensorEnumChannelLabel("smart_status", 1)).toBe("Bom");
    expect(sensorEnumChannelLabel("defender_real_time", 1)).toBe("Ligada");
    expect(sensorEnumChannelLabel("bitlocker_status", 1)).toBe("Protegido");
    expect(sensorEnumChannelLabel("bitlocker_status", 0)).toBe("Desconhecido");
    // Sem tradução o helper devolve null, e a tela cai no número cru (nunca "undefined").
    expect(sensorEnumChannelLabel("smart_status", 99)).toBeNull();
    expect(sensorEnumChannelLabel("canal_inexistente", 1)).toBeNull();
  });

  it("formata valores de canal (número, enum e instante)", () => {
    expect(formatSensorChannelValue("event_count", 12, "Count")).toBe("12");
    expect(formatSensorChannelValue("smart_status", 2, "Count")).toBe("Atenção");
    // Instante vira data legível, não epoch cru.
    expect(formatSensorChannelValue("last_event_at", 1700000000, "Count")).not.toBe("1700000000");
  });
});

describe("opções do sensor (optionsJson)", () => {
  it("lê a histerese e o reinício automático do JSON", () => {
    const options = sensorOptionsFromJson("{\"sustainSamples\":5,\"restartIfStopped\":true}");
    expect(options.sustainSamples).toBe(5);
    expect(options.restartIfStopped).toBe(true);
  });

  it("usa os padrões com JSON nulo, vazio ou inválido", () => {
    for (const raw of [null, undefined, "", "   ", "nao-e-json", "[1,2]", "42"]) {
      const options = sensorOptionsFromJson(raw as string | null | undefined);
      expect(options.sustainSamples).toBe(DEFAULT_SUSTAIN_SAMPLES);
      expect(options.restartIfStopped).toBe(false);
    }
  });

  it("normaliza a histerese para o intervalo 1..50", () => {
    expect(normalizeSustainSamples(0)).toBe(MIN_SUSTAIN_SAMPLES);
    expect(normalizeSustainSamples(-3)).toBe(MIN_SUSTAIN_SAMPLES);
    expect(normalizeSustainSamples(1)).toBe(1);
    expect(normalizeSustainSamples(999)).toBe(MAX_SUSTAIN_SAMPLES);
    expect(normalizeSustainSamples("7")).toBe(7);
    expect(normalizeSustainSamples(3.4)).toBe(3);
    expect(normalizeSustainSamples(Number.NaN)).toBe(DEFAULT_SUSTAIN_SAMPLES);
  });

  it("preserva chaves desconhecidas ao gravar as opções", () => {
    const merged = mergeSensorOptionsJson("{\"sustainSamples\":2,\"outraCoisa\":\"x\"}", {
      sustainSamples: 9,
      restartIfStopped: true,
    });
    expect(merged).not.toBeNull();
    expect(JSON.parse(merged as string)).toEqual({
      sustainSamples: 9,
      outraCoisa: "x",
      restartIfStopped: true,
    });
  });

  it("devolve null quando não há nenhuma opção a gravar", () => {
    expect(mergeSensorOptionsJson(null, {})).toBeNull();
  });

  it("descreve a histerese para o usuário", () => {
    expect(describeSustainSamples(1)).toMatch(/Sem histerese/);
    expect(describeSustainSamples(5)).toMatch(/5 amostras ruins/);
    expect(describeSustainSamples(5)).toMatch(/recuperação/);
  });
});
describe("exportação CSV do gráfico", () => {
  const serie: SensorSeries = {
    agentId: "agent-1",
    sensorId: "sensor-1",
    targetKey: "C:",
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-01T06:00:00.000Z",
    resolution: "raw",
    stepSeconds: 60,
    warningThreshold: null,
    criticalThreshold: null,
    comparison: "HigherIsWorse",
    thresholdUnit: "Percent",
    channels: [
      {
        key: "uso_cpu",
        label: "Uso de CPU",
        unit: "Percent",
        points: [
          { t: "2026-01-01T00:00:00.000Z", v: 10.5, min: 10, max: 11 },
          { t: "2026-01-01T00:01:00.000Z", v: null, min: null, max: null },
        ],
        stats: { min: 10, avg: 10.5, max: 11, p95: 11, last: 10.5, count: 1 },
      },
      {
        key: "memoria",
        label: "Memória",
        unit: "Percent",
        points: [{ t: "2026-01-01T00:00:00.000Z", v: 42, min: null, max: null }],
        stats: { min: 42, avg: 42, max: 42, p95: 42, last: 42, count: 1 },
      },
    ],
    statusStrips: [],
  };

  it("exporta uma linha por instante e uma coluna por canal", () => {
    const linhas = sensorSeriesToCsv(serie).split("\r\n");
    expect(linhas[0]).toBe("instante;uso_cpu;uso_cpu_min;uso_cpu_max;memoria");
    expect(linhas).toHaveLength(3);
    expect(linhas[1].startsWith("2026-01-01T00:00:00.000Z;")).toBe(true);
  });

  it("usa vírgula decimal e deixa vazio o ponto sem medição", () => {
    const linhas = sensorSeriesToCsv(serie).split("\r\n");
    // 10.5 vira 10,5 (Excel pt-BR); canal sem leitura naquele instante fica vazio.
    expect(linhas[1]).toContain("10,5");
    expect(linhas[2]).toBe("2026-01-01T00:01:00.000Z;;;;");
  });

  it("devolve string vazia quando não há pontos", () => {
    expect(sensorSeriesToCsv({ ...serie, channels: [] })).toBe("");
    expect(
      sensorSeriesToCsv({ ...serie, channels: [{ ...serie.channels[0], points: [] }] }),
    ).toBe("");
  });

  it("escapa campos com separador, aspas ou quebra de linha", () => {
    expect(escapeCsvField("simples")).toBe("simples");
    expect(escapeCsvField("com;ponto")).toBe("\"com;ponto\"");
    expect(escapeCsvField("com,virgula")).toBe("\"com,virgula\"");
    expect(escapeCsvField("com\"aspas")).toBe("\"com\"\"aspas\"");
  });

  it("monta um nome de arquivo sem acentos nem espaços", () => {
    const nome = sensorCsvFileName(serie, "Uso de CPU (C:)");
    expect(nome).toMatch(/^sensor-uso-de-cpu-c-/);
    expect(nome).toMatch(/\.csv$/);
    expect(nome).not.toMatch(/[\s\u00C0-\u00FF]/);
  });
});

describe("guia por tipo (SENSOR_TYPE_GUIDE)", () => {
  const todos = Object.keys(SENSOR_TYPE_GUIDE) as Array<keyof typeof SENSOR_TYPE_GUIDE>;

  it("cobre TODOS os tipos conhecidos e nenhum a mais", () => {
    // SENSOR_TYPE_GUIDE é Record total, mas o guard também vale em runtime:
    // um tipo novo em SensorType precisa de entrada aqui para o guia aparecer.
    const labels = Object.keys(sensorTypeLabelAll());
    expect([...todos].sort()).toEqual([...labels].sort());
    expect(todos).toContain("Cpu");
    expect(todos).toContain("Memory");
    expect(todos).toContain("Uptime");
    expect(todos).toContain("DiskIo");
  });

  it("todo tipo tem dica de alvo, campos relacionados e ao menos um exemplo", () => {
    for (const tipo of todos) {
      const guia = SENSOR_TYPE_GUIDE[tipo];
      expect(guia.targetHint.length, tipo).toBeGreaterThan(0);
      expect(guia.relatedFields.length, tipo).toBeGreaterThan(0);
      expect(guia.examples.length, tipo).toBeGreaterThan(0);
    }
  });

  it("os exemplos refletem o contrato real do coletor", () => {
    expect(SENSOR_TYPE_GUIDE.Bandwidth.optionsExample).toBe(jsonOf({ sampleMs: 1000 }));
    expect(SENSOR_TYPE_GUIDE.DiskIo.optionsExample).toBe(jsonOf({ disk: "C:" }));
    expect(SENSOR_TYPE_GUIDE.EventLogRate.optionsExample).toBe(
      jsonOf({ logName: "System", levels: [1, 2], windowMinutes: 60 }),
    );
    expect(SENSOR_TYPE_GUIDE.SmartStatus.optionsExample).toBe(
      jsonOf({ disk: "\\\\.\\PhysicalDrive0" }),
    );
    expect(SENSOR_TYPE_GUIDE.CertificateExpiry.optionsExample).toBe(
      jsonOf({ host: "example.com", port: 443 }),
    );
    expect(SENSOR_TYPE_GUIDE.DefenderStatus.optionsExample).toBe(jsonOf({}));
    expect(SENSOR_TYPE_GUIDE.BitLocker.optionsExample).toBe(jsonOf({ drive: "C:" }));
    expect(SENSOR_TYPE_GUIDE.Service.optionsExample).toBe(
      jsonOf({ restartIfStopped: true, restartWaitMs: 5000 }),
    );
    expect(SENSOR_TYPE_GUIDE.Service.examples).toContain("Spooler");
    expect(SENSOR_TYPE_GUIDE.TcpPort.examples).toContain("10.0.0.1:443");
  });

  it("sinaliza quando o tipo não usa limiar e quando ele é obrigatório", () => {
    for (const tipo of SENSOR_NO_THRESHOLD_TYPES) {
      expect(sensorThresholdHint(tipo), tipo).toContain("não usa limiar");
    }
    for (const tipo of SENSOR_THRESHOLD_REQUIRED_TYPES) {
      expect(sensorThresholdHint(tipo), tipo).toContain("exige ao menos um limiar");
    }
  });

  it("deixa o vazio (padrão) como última opção clicável", () => {
    const exemplos = sensorGuideExamples("DiskSpace");
    expect(exemplos[exemplos.length - 1]).toBe("");
    expect(exemplos).toContain("C:");
    // Sem duplicar o vazio, mesmo quando o tipo o declara nos examples.
    expect(sensorGuideExamples("Cpu").filter((v) => v === "").length).toBe(1);
  });
});
/** Chaves de rótulo: fonte independente do SensorType, para o guard de cobertura. */
function sensorTypeLabelAll(): Record<string, string> {
  return {
    DiskSpace: "1", Cpu: "1", Memory: "1", Uptime: "1", Service: "1",
    Process: "1", Ping: "1", TcpPort: "1", HttpProbe: "1", HttpThroughput: "1",
    DnsLatency: "1", Bandwidth: "1", DiskIo: "1", EventLogRate: "1",
    SmartStatus: "1", CertificateExpiry: "1", DefenderStatus: "1",
    BitLocker: "1", Script: "1",
  };
}

function jsonOf(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Página de autoria de sensor Script (/sensors/script).
 *
 * O bloco de Script do formulário do agente é deliberadamente mínimo (dois
 * campos JSON). Esta página é o editor completo: presets de exit code,
 * exemplos de extrator por tipo, documentação do protocolo MDZ e validação
 * em português antes de enviar.
 *
 * Importante: a página NÃO inventa contrato novo. Ela apenas monta as mesmas
 * strings (ExtractorsJson / ExitCodeMapJson) que a API já aceita — a
 * validação aqui só antecipa, em português, o que o servidor/agente
 * descartaria em silêncio.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Icon, PageHeader, Select, TextArea } from "@/components/ui";
import { useAutomationScripts } from "@/hooks/useAutomation";
import {
  SCRIPT_EXIT_PRESETS,
  SCRIPT_EXIT_SEVERITIES,
  SCRIPT_EXIT_STATUSES,
  SCRIPT_EXTRACTOR_EXAMPLES,
  SCRIPT_MDZ_EXAMPLE,
  extractorsSkeletonFromChannels,
  parseExtractorsJson,
  validateScriptSensor,
} from "@/utils/sensorScriptValidation";
/** Chaves de canal separadas por vírgula/linha, na ordem digitada. */
function parseChannelKeys(raw: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const piece of raw.split(/[,\n]/)) {
    const key = piece.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export default function ScriptSensorEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scripts = useAutomationScripts({ limit: 100, activeOnly: true });

  /** Valores vindos do modal (scriptId + JSONs já digitados). */
  const [scriptId, setScriptId] = useState(() => searchParams.get("scriptId") ?? "");
  const [extractorsJson, setExtractorsJson] = useState(() => searchParams.get("extractorsJson") ?? "");
  const [exitCodeMapJson, setExitCodeMapJson] = useState(() => searchParams.get("exitCodeMapJson") ?? "");
  const [channelKeys, setChannelKeys] = useState(() => searchParams.get("channels") ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  const declared = useMemo(() => parseChannelKeys(channelKeys), [channelKeys]);
  /** A validação roda a cada tecla: o operador vê o problema enquanto digita. */
  const result = useMemo(
    () => validateScriptSensor(extractorsJson, exitCodeMapJson, declared),
    [extractorsJson, exitCodeMapJson, declared],
  );
  const parsedExtractors = useMemo(() => parseExtractorsJson(extractorsJson), [extractorsJson]);

  const errorText = result.errors.length === 0 ? null : result.errors.join(" ");
  const channelsUsed = useMemo(
    () => new Set(parsedExtractors.extractors.map((item) => item.channel).filter(Boolean)),
    [parsedExtractors],
  );

  async function copiar(texto: string, chave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(chave);
    } catch {
      // Área de transferência bloqueada pelo navegador: o texto segue visível na tela.
      setCopied(null);
    }
  }

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /** Volta ao formulário do agente levando os JSONs já validados. */
  function voltarAoFormulario() {
    const params = new URLSearchParams();
    if (scriptId) params.set("scriptId", scriptId);
    params.set("extractorsJson", extractorsJson);
    params.set("exitCodeMapJson", exitCodeMapJson);
    if (channelKeys) params.set("channels", channelKeys);
    navigate(`/sensors?${params.toString()}`);
  }
  const scriptOptions = useMemo(() => {
    const items = scripts.data?.items ?? [];
    return [
      { value: "", label: "(nenhum — só copiar o JSON)" },
      ...items.map((item) => ({ value: item.id, label: item.name })),
    ];
  }, [scripts.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editor de sensor de script"
        description="Monte os extratores e o mapa de exit codes, valide em português e volte ao formulário do agente."
        onBack={voltarAoFormulario}
        backLabel="Voltar ao formulário do sensor"
        breadcrumb={
          <span>
            Sensores / <span className="text-foreground">Script</span>
          </span>
        }
      >
        <Button type="button" onClick={voltarAoFormulario}>
          <Icon name="arrow_back" className="h-4 w-4" />
          Usar estes valores
        </Button>
      </PageHeader>

      <div data-testid="script-editor-status">
        {errorText ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
          >
            <p className="font-medium">Corrija antes de salvar:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5"
            >
              {result.errors.map((erro) => (
                <li key={erro}>{erro}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm text-success"
          >
            Configuração válida para o contrato da API.
          </div>
        )}
        {result.warnings.length > 0 && (
          <div className="mt-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm text-warning"
          >
            <p className="font-medium">Vale conferir:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5"
            >
              {result.warnings.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader title="Script e canais"
          />
          <div className="space-y-4 p-4"
          >
            <Select
              label="Script do catálogo"
              options={scriptOptions}
              value={scriptId}
              onChange={(event) => setScriptId(event.target.value)}
              hint="O sensor executa este script no agente; a autoria do código é feita em Automação › Scripts."
            />
            <TextArea
              label="Canais de métrica (chaves)"
              value={channelKeys}
              onChange={(event) => setChannelKeys(event.target.value)}
              rows={3}
              placeholder="livre_gb, fila"
              hint="As mesmas chaves do formulário. Separe por vírgula ou linha."
            />
            {declared.length > 0 && (
              <div className="flex flex-wrap gap-2"
              >
                {declared.map((canal) => (
                  <Badge
                    key={canal}
                    color={channelsUsed.has(canal) ? "success" : "warning"}
                  >
                    {channelsUsed.has(canal) ? canal : `${canal} (sem extrator)`}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExtractorsJson(extractorsSkeletonFromChannels(declared))}
              disabled={declared.length === 0}
            >
              Gerar extratores mdz para os canais
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Protocolo MDZ no stdout"
          />
          <div className="space-y-3 p-4 text-sm text-muted-foreground"
          >
            <p>
              O script pode simplesmente imprimir as métricas: o agente consome as linhas de prefixo e
              usa o restante da saída como extrato de log.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface-light/60 p-3 text-xs text-foreground"
            >
              <code>{SCRIPT_MDZ_EXAMPLE}</code>
            </pre>
            <Button type="button" variant="ghost" onClick={() => copiar(SCRIPT_MDZ_EXAMPLE, "mdz")}>
              <Icon name="content_copy" className="h-4 w-4" />
              {copied === "mdz" ? "Copiado!" : "Copiar exemplo"}
            </Button>
          </div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader
            title="Extratores (JSON)"
            subtitle="Como o agente lê a saída do script. Sem extrator a chave só terá valor se o script emitir MDZ_METRIC."
          />
          <div className="space-y-4"
          >
            <TextArea
              label="Extratores (JSON)"
              value={extractorsJson}
              onChange={(event) => setExtractorsJson(event.target.value)}
              rows={10}
              placeholder='[ { "channel": "livre_gb", "type": "mdz" } ]'
              error={parsedExtractors.error ?? undefined}
            />
            <div className="space-y-2"
            >
              <p className="text-sm font-medium text-muted-foreground">Exemplos por tipo</p>
              {SCRIPT_EXTRACTOR_EXAMPLES.map((exemplo) => (
                <div
                  key={exemplo.id}
                  className="rounded-lg border border-border bg-surface-light/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2"
                  >
                    <p className="text-sm font-medium text-foreground">{exemplo.label}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Usar exemplo ${exemplo.id}`}
                      onClick={() => setExtractorsJson(exemplo.json)}
                    >
                      Usar
                    </Button>
                  </div>
                  <p className="text-xs text-muted">{exemplo.description}</p>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-foreground"
                  >
                    <code>{exemplo.json}</code>
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Mapa de exit codes (JSON)"
            subtitle="A lista é lida na ordem e a primeira regra que casa vence."
          />
          <div className="space-y-4"
          >
            <TextArea
              label="Mapa de exit codes (JSON)"
              value={exitCodeMapJson}
              onChange={(event) => setExitCodeMapJson(event.target.value)}
              rows={10}
              placeholder='[ { "codes": [0], "status": "Passing" } ]'
            />
            <div className="space-y-2"
            >
              <p className="text-sm font-medium text-muted-foreground">Presets prontos</p>
              {SCRIPT_EXIT_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="rounded-lg border border-border bg-surface-light/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2"
                  >
                    <p className="text-sm font-medium text-foreground">{preset.label}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Usar preset ${preset.id}`}
                      onClick={() => setExitCodeMapJson(preset.json)}
                    >
                      Usar
                    </Button>
                  </div>
                  <p className="text-xs text-muted">{preset.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-surface-light/60 p-3 text-xs text-muted"
            >
              <p className="font-medium text-foreground">Referência rápida</p>
              <p>status: {SCRIPT_EXIT_STATUSES.join(", ")}</p>
              <p>severity: {SCRIPT_EXIT_SEVERITIES.join(", ")}</p>
              <p>
                O objeto {`{ unlistedNonZero: { status, severity } }`} define o que acontece com códigos fora
                das regras (padrão: falha crítica).
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

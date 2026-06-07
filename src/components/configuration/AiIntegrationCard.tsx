import { useEffect, useState } from "react";
import { Bot, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Input, Modal, Select } from "@/components/ui";
import { configurationApi } from "@/api/configuration";
import type { AIIntegrationSettings } from "@/api";

// ── Provider definitions ────────────────────────────────────────────
const PROVIDERS = [
  { id: "openrouter", label: "OpenRouter (recomendado)", configurable: false },
  { id: "openai", label: "OpenAI", configurable: false },
  { id: "openai-compatible", label: "Personalizado (OpenAI-compatible)", configurable: true },
];

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: { prompt?: string; completion?: string };
  embeddingDimensions?: number;
  isFree?: boolean;
}

interface Props {
  aiSettings: AIIntegrationSettings | null;
  onSave: (json: string) => Promise<void>;
  saving?: boolean;
}

export function AiIntegrationCard({ aiSettings, onSave, saving }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEmbedding, setExpandedEmbedding] = useState(false);
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);

  // ── Local state ──
  const [provider, setProvider] = useState(aiSettings?.provider ?? "openrouter");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState(aiSettings?.chatModel ?? "");
  const [embeddingModel, setEmbeddingModel] = useState(aiSettings?.embeddingModel ?? "");
  const [embeddingDimensions, setEmbeddingDimensions] = useState(aiSettings?.embeddingDimensions ?? 1536);
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");
  const [temperature, setTemperature] = useState(aiSettings?.temperature ?? 0.7);
  const [topP, setTopP] = useState(aiSettings?.topP ?? 1.0);
  const [freqPen, setFreqPen] = useState(aiSettings?.frequencyPenalty ?? 0);
  const [presPen, setPresPen] = useState(aiSettings?.presencePenalty ?? 0);
  const [maxTokens, setMaxTokens] = useState(aiSettings?.maxTokensPerRequest ?? 2000);

  // ── Model lists ──
  const [chatModels, setChatModels] = useState<OpenRouterModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // ── Key validation ──
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenRouterModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchOpenRouterModels() {
    setLoadingModels(true);
    try {
      const res = await configurationApi.listOpenRouterModels();
      const data = res.data as unknown as {
        chatModels?: OpenRouterModel[];
        embeddingModels?: OpenRouterModel[];
      };
      setChatModels(data.chatModels ?? []);
      setEmbeddingModels(data.embeddingModels ?? []);
    } catch {
      // fallback to static catalog
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleValidateKey() {
    if (!apiKey.trim()) return;
    setValidating(true);
    setKeyValid(null);
    setKeyError(null);
    try {
      const res = await configurationApi.validateApiKey({ apiKey: apiKey.trim(), provider, baseUrl: getBaseUrl() });
      const data = res.data as unknown as { valid: boolean; error?: string };
      setKeyValid(data.valid);
      if (!data.valid) setKeyError(data.error ?? "Chave inválida");
    } catch (e: unknown) {
      setKeyValid(false);
      setKeyError(e instanceof Error ? e.message : "Erro ao validar chave");
    } finally {
      setValidating(false);
    }
  }

  function getBaseUrl(): string {
    if (provider === "openrouter") return "https://openrouter.ai/api/v1/";
    if (provider === "openai") return "https://api.openai.com/v1/";
    return "";
  }

  async function handleSave() {
    const settings: Record<string, unknown> = {
      ...aiSettings,
      provider,
      chatModel: chatModel || undefined,
      embeddingModel: embeddingModel || undefined,
      embeddingDimensions,
      temperature,
      topP,
      frequencyPenalty: freqPen,
      presencePenalty: presPen,
      maxTokensPerRequest: maxTokens,
    };
    if (apiKey.trim()) (settings as Record<string, unknown>).apiKey = apiKey.trim();
    if (embeddingApiKey.trim()) (settings as Record<string, unknown>).embeddingApiKey = embeddingApiKey.trim();

    const json = JSON.stringify(settings);
    await onSave(json);
  }

  return (
    <Card className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Integração com IA</p>
          <p className="mt-1 text-xs text-slate-300">
            Chave de API, modelo e parâmetros do provedor de IA. A chave é write-only e só deve ser enviada quando informada novamente.
          </p>
        </div>
      </CardHeader>

      <div className="grid gap-3">
        <p className="text-xs text-amber-300">ApiKey é write-only: o valor atual não é retornado pela API. Preencha apenas para trocar a chave.</p>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Provider */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Provider</label>
              <Select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
              />
            </div>

            {/* Chat Model */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Chat Model</label>
              <Select
                id="chat-model"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                options={[
                  { value: "", label: loadingModels ? "Carregando..." : "Selecione..." },
                  ...chatModels.map((m) => ({
                    value: m.id,
                    label: `${m.name}${m.isFree ? " (FREE)" : ""}${m.contextLength ? ` · ${(m.contextLength / 1024).toFixed(0)}K ctx` : ""}`,
                  })),
                ]}
              />
            </div>

            {/* Embedding Model */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding Model</label>
              <Select
                id="embedding-model"
                value={embeddingModel}
                onChange={(e) => {
                  setEmbeddingModel(e.target.value);
                  const dims = embeddingModels.find((m) => m.id === e.target.value)?.embeddingDimensions;
                  if (dims) setEmbeddingDimensions(dims);
                }}
                options={[
                  { value: "", label: loadingModels ? "Carregando..." : "Selecione..." },
                  ...embeddingModels.map((m) => ({
                    value: m.id,
                    label: `${m.name}${m.embeddingDimensions ? ` · ${m.embeddingDimensions}d` : ""}${m.isFree ? " (FREE)" : ""}`,
                  })),
                ]}
              />
            </div>

            {/* Embedding Dimensions */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding Dimensions</label>
              <Input
                id="embedding-dimensions"
                type="number"
                min={1}
                step={1}
                value={String(embeddingDimensions)}
                onChange={(e) => setEmbeddingDimensions(Number(e.target.value) || 0)}
                placeholder="1536"
              />
            </div>

            {/* API Key */}
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">API Key</label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); }}
                  placeholder="Preencha apenas para trocar a chave"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleValidateKey}
                  disabled={validating || !apiKey.trim()}
                >
                  {validating ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Validar"}
                </Button>
                {keyValid === true && <CheckCircle2 className="h-5 w-5 text-green-400 self-center" />}
                {keyValid === false && <XCircle className="h-5 w-5 text-red-400 self-center" title={keyError ?? ""} />}
              </div>
              {keyValid === false && keyError && <p className="text-xs text-red-400 mt-1">{keyError}</p>}
            </div>

            {/* Embedding API Key */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding API Key</label>
              <Input
                id="embedding-api-key"
                type="password"
                value={embeddingApiKey}
                onChange={(e) => setEmbeddingApiKey(e.target.value)}
                placeholder="Opcional — usa a mesma se vazio"
              />
            </div>
          </div>

          {/* ── Advanced Chat ── */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              onClick={() => setExpandedAdvanced(!expandedAdvanced)}
            >
              <span>Configuração Avançada (Chat)</span>
              {expandedAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedAdvanced && (
              <div className="mt-2 grid gap-3 p-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Temperature (0–2)</label>
                    <Input type="number" min={0} max={2} step={0.1} value={String(temperature)} onChange={(e) => setTemperature(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Top P (0–1)</label>
                    <Input type="number" min={0} max={1} step={0.05} value={String(topP)} onChange={(e) => setTopP(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Frequency Penalty (-2 a 2)</label>
                    <Input type="number" min={-2} max={2} step={0.1} value={String(freqPen)} onChange={(e) => setFreqPen(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Presence Penalty (-2 a 2)</label>
                    <Input type="number" min={-2} max={2} step={0.1} value={String(presPen)} onChange={(e) => setPresPen(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Max Tokens</label>
                    <Input type="number" min={1} step={100} value={String(maxTokens)} onChange={(e) => setMaxTokens(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save ── */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Comparar valor local com efetivo"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          <span className="hidden sm:inline">Comparar</span>
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </Card>
  );
}

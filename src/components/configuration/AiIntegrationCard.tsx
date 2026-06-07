import { useEffect, useState } from "react";
import { Bot, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import type { AIIntegrationSettings } from "@/api";

const FALLBACK_CHAT = [
  { id: "google/gemma-3-4b-it", name: "Google: Gemma 3 4B", contextLength: 8192, isFree: true },
  { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", contextLength: 1048576, isFree: false },
  { id: "google/gemini-2.5-pro", name: "Google: Gemini 2.5 Pro", contextLength: 1048576, isFree: false },
  { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o Mini", contextLength: 128000, isFree: false },
  { id: "openai/gpt-4o", name: "OpenAI: GPT-4o", contextLength: 128000, isFree: false },
  { id: "anthropic/claude-3.5-haiku", name: "Anthropic: Claude 3.5 Haiku", contextLength: 200000, isFree: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Anthropic: Claude 3.5 Sonnet", contextLength: 200000, isFree: false },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek: Chat V3", contextLength: 65536, isFree: false },
  { id: "meta-llama/llama-4-maverick", name: "Meta: Llama 4 Maverick", contextLength: 131072, isFree: false },
];
const FALLBACK_EMBED = [
  { id: "openai/text-embedding-3-small", name: "OpenAI: Text Embedding 3 Small", embeddingDimensions: 1536 },
  { id: "google/text-embedding-004", name: "Google: Text Embedding 004", embeddingDimensions: 768 },
  { id: "perplexity/pplx-embed-v1-0.6b", name: "Perplexity: Embed V1 0.6B", embeddingDimensions: 1024 },
];

interface ModelItem {
  id: string;
  name: string;
  contextLength?: number;
  embeddingDimensions?: number;
  isFree?: boolean;
}

interface Props {
  aiSettings: AIIntegrationSettings | null;
  onSave: (json: string) => Promise<void>;
  saving?: boolean;
}

export function AiIntegrationCard({ aiSettings, onSave, saving }: Props) {
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);

  const [provider, setProvider] = useState(aiSettings?.provider ?? "openrouter");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState(aiSettings?.chatModel ?? "");
  const [embeddingModel, setEmbeddingModel] = useState(aiSettings?.embeddingModel ?? "");
  const [embeddingDimensions, setEmbeddingDimensions] = useState(aiSettings?.embeddingDimensions ?? 1536);
  const [temperature, setTemperature] = useState(aiSettings?.temperature ?? 0.7);
  const [topP, setTopP] = useState(aiSettings?.topP ?? 1.0);
  const [freqPen, setFreqPen] = useState(aiSettings?.frequencyPenalty ?? 0);
  const [presPen, setPresPen] = useState(aiSettings?.presencePenalty ?? 0);
  const [maxTokens, setMaxTokens] = useState(aiSettings?.maxTokensPerRequest ?? 2000);

  const [chatModels, setChatModels] = useState<ModelItem[]>(FALLBACK_CHAT);
  const [embeddingModels, setEmbeddingModels] = useState<ModelItem[]>(FALLBACK_EMBED);
  const [fetchingModels, setFetchingModels] = useState(false);

  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchingModels(true);
      try {
        const res = await fetch("/api/v1/configurations/ai/openrouter/models", {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            if (data.chatModels?.length) setChatModels(data.chatModels);
            if (data.embeddingModels?.length) setEmbeddingModels(data.embeddingModels);
          }
        }
      } catch { /* keep fallback */ }
      finally { if (!cancelled) setFetchingModels(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  function getBaseUrl(): string {
    if (provider === "openrouter") return "https://openrouter.ai/api/v1/";
    if (provider === "openai") return "https://api.openai.com/v1/";
    return "";
  }

  async function handleValidateKey() {
    if (!apiKey.trim()) return;
    setValidating(true);
    setKeyValid(null);
    setKeyError(null);
    try {
      const res = await fetch("/api/v1/configurations/ai/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), provider, baseUrl: getBaseUrl() }),
      });
      const data = await res.json();
      setKeyValid(data.valid === true);
      if (!data.valid) setKeyError(data.error ?? "Chave invalida");
    } catch (e: unknown) {
      setKeyValid(false);
      setKeyError(e instanceof Error ? e.message : "Erro ao validar chave");
    } finally {
      setValidating(false);
    }
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
    if (apiKey.trim()) settings.apiKey = apiKey.trim();
    await onSave(JSON.stringify(settings));
  }

  return (
    <Card className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
      <CardHeader
        title="Integracao com IA"
        subtitle="Chave de API, modelo e parametros do provedor. A chave e unica para Chat e Embeddings."
      />
      <div className="grid gap-3">
        <p className="text-xs text-amber-300">ApiKey e write-only: o valor atual nao e retornado. Preencha apenas para trocar.</p>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Provider</label>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                options={[
                  { value: "openrouter", label: "OpenRouter (recomendado)" },
                  { value: "openai", label: "OpenAI" },
                  { value: "openai-compatible", label: "Personalizado" },
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">
                Chat Model {fetchingModels && <RefreshCw className="inline h-3 w-3 animate-spin text-slate-500" />}
              </label>
              <Select
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                options={[
                  { value: "", label: "Selecione..." },
                  ...chatModels.map((m) => ({
                    value: m.id,
                    label: `${m.name}${m.isFree ? " (FREE)" : ""}${m.contextLength ? ` \u00b7 ${Math.round(m.contextLength / 1024)}K` : ""}`,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding Model</label>
              <Select
                value={embeddingModel}
                onChange={(e) => {
                  setEmbeddingModel(e.target.value);
                  const dims = embeddingModels.find((m) => m.id === e.target.value)?.embeddingDimensions;
                  if (dims) setEmbeddingDimensions(dims);
                }}
                options={[
                  { value: "", label: "Selecione..." },
                  ...embeddingModels.map((m) => ({
                    value: m.id,
                    label: `${m.name}${m.embeddingDimensions ? ` \u00b7 ${m.embeddingDimensions}d` : ""}`,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">API Key (Chat + Embeddings)</label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); }}
                  placeholder="sk-or-v1-..."
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="ghost" onClick={handleValidateKey} disabled={validating || !apiKey.trim()}>
                  {validating ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Validar"}
                </Button>
                {keyValid === true && <CheckCircle2 className="h-5 w-5 text-green-400 self-center" />}
                {keyValid === false && <span title={keyError ?? ""}><XCircle className="h-5 w-5 text-red-400 self-center" /></span>}
              </div>
              {keyValid === false && keyError && <p className="text-xs text-red-400 mt-1">{keyError}</p>}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding Dimensions</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={String(embeddingDimensions)}
                onChange={(e) => setEmbeddingDimensions(Number(e.target.value) || 0)}
                placeholder="1536"
              />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              onClick={() => setExpandedAdvanced(!expandedAdvanced)}
            >
              <span>Configuracao Avancada (Chat)</span>
              {expandedAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedAdvanced && (
              <div className="mt-2 grid gap-3 p-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Temperature (0-2)</label>
                    <Input type="number" min={0} max={2} step={0.1} value={String(temperature)} onChange={(e) => setTemperature(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">Top P (0-1)</label>
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </Card>
  );
}

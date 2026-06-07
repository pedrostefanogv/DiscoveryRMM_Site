import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { configurationApi } from "@/api/configuration";
import type { AIIntegrationSettings } from "@/api";

// ── Fallback inicial (substituído pela API OpenRouter se disponível) ─
const FALLBACK_CHAT = [
  { id: "google/gemma-3-4b-it", name: "Google: Gemma 3 4B", contextLength: 8192, pricing: { prompt: "0", completion: "0" }, isFree: true },
  { id: "google/gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", contextLength: 1048576, pricing: { prompt: "0.00000015", completion: "0.00000060" }, isFree: false },
  { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o Mini", contextLength: 128000, pricing: { prompt: "0.00000015", completion: "0.00000060" }, isFree: false },
  { id: "anthropic/claude-3.5-haiku", name: "Anthropic: Claude 3.5 Haiku", contextLength: 200000, pricing: { prompt: "0.00000080", completion: "0.00000400" }, isFree: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Anthropic: Claude 3.5 Sonnet", contextLength: 200000, pricing: { prompt: "0.00000300", completion: "0.00001500" }, isFree: false },
];
const FALLBACK_EMBED = [
  { id: "openai/text-embedding-3-small", name: "OpenAI: Text Embedding 3 Small", embeddingDimensions: 1536, pricing: { prompt: "0.00000002" } },
  { id: "google/text-embedding-004", name: "Google: Text Embedding 004", embeddingDimensions: 768, pricing: { prompt: "0.00000002" } },
  { id: "perplexity/pplx-embed-v1-0.6b", name: "Perplexity: Embed V1 0.6B", embeddingDimensions: 1024, pricing: { prompt: "0.00000002" } },
];

interface OrModel {
  id: string;
  name: string;
  contextLength?: number;
  embeddingDimensions?: number;
  pricing?: { prompt?: string; completion?: string };
  isFree?: boolean;
}

interface Props {
  aiSettings: AIIntegrationSettings | null;
  onSave: (json: string) => Promise<void>;
  saving?: boolean;
}

function fmtPrice(s: string | undefined): string {
  if (!s) return "";
  const n = parseFloat(s);
  if (isNaN(n)) return "";
  if (n === 0) return "FREE";
  const perM = n * 1_000_000;
  if (perM < 0.01) return "<$0.01/M";
  return `$${perM.toFixed(2)}/M`;
}

function fmtCtx(n: number | undefined): string {
  if (!n) return "";
  const k = Math.round(n / 1024);
  return k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`;
}

function providerFromId(id: string): string {
  const p = id.split("/")[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : id;
}

export function AiIntegrationCard({ aiSettings, onSave, saving }: Props) {
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [expandedChat, setExpandedChat] = useState(false);
  const [expandedEmbed, setExpandedEmbed] = useState(false);

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

  const [allChat, setAllChat] = useState<OrModel[]>(FALLBACK_CHAT);
  const [allEmbed, setAllEmbed] = useState<OrModel[]>(FALLBACK_EMBED);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [chatSearch, setChatSearch] = useState("");
  const [embedSearch, setEmbedSearch] = useState("");

  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setFetching(true);
      try {
        const data = await configurationApi.listOpenRouterModels();
        if (!c) {
          const payload = data as unknown as { chatModels?: OrModel[]; embeddingModels?: OrModel[] };
          if (payload.chatModels?.length) setAllChat(payload.chatModels);
          if (payload.embeddingModels?.length) setAllEmbed(payload.embeddingModels);
        }
      } catch {
        if (!c) setFetchError(true);
      } finally {
        if (!c) setFetching(false);
      }
    })();
    return () => { c = true; };
  }, []);

  const filteredChat = useMemo(() => {
    const q = chatSearch.toLowerCase().trim();
    if (!q) return allChat;
    return allChat.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      providerFromId(m.id).toLowerCase().includes(q)
    );
  }, [allChat, chatSearch]);

  const filteredEmbed = useMemo(() => {
    const q = embedSearch.toLowerCase().trim();
    if (!q) return allEmbed;
    return allEmbed.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      providerFromId(m.id).toLowerCase().includes(q)
    );
  }, [allEmbed, embedSearch]);

  function getBaseUrl(): string {
    if (provider === "openrouter") return "https://openrouter.ai/api/v1/";
    if (provider === "openai") return "https://api.openai.com/v1/";
    return "";
  }

  async function handleValidateKey() {
    if (!apiKey.trim()) return;
    setValidating(true); setKeyValid(null); setKeyError(null);
    try {
      const res = await configurationApi.validateApiKey({
        apiKey: apiKey.trim(), provider, baseUrl: getBaseUrl(),
      });
      const data = res.data as unknown as { valid: boolean; error?: string };
      setKeyValid(data.valid === true);
      if (!data.valid) setKeyError(data.error ?? "Chave invalida");
    } catch (e: unknown) {
      setKeyValid(false);
      setKeyError(e instanceof Error ? e.message : "Erro");
    } finally { setValidating(false); }
  }

  async function handleSave() {
    const s: Record<string, unknown> = {
      ...aiSettings, provider,
      chatModel: chatModel || undefined,
      embeddingModel: embeddingModel || undefined,
      embeddingDimensions, temperature, topP,
      frequencyPenalty: freqPen, presencePenalty: presPen,
      maxTokensPerRequest: maxTokens,
    };
    if (apiKey.trim()) s.apiKey = apiKey.trim();
    await onSave(JSON.stringify(s));
  }

  return (
    <Card className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
      <CardHeader title="Integracao com IA" subtitle="Chave de API, modelo e parametros do provedor." />

      <div className="grid gap-3">
        <p className="text-xs text-amber-300">ApiKey nao e retornada pela API. Preencha apenas para trocar.</p>

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
                API Key (Chat + Embeddings){" "}
                {fetching && <RefreshCw className="inline h-3 w-3 animate-spin text-slate-500" />}
              </label>
              <div className="flex gap-2">
                <Input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); }} placeholder="sk-or-v1-..." className="flex-1" />
                <Button type="button" size="sm" variant="ghost" onClick={handleValidateKey} disabled={validating || !apiKey.trim()}>
                  {validating ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Validar"}
                </Button>
                {keyValid === true && <CheckCircle2 className="h-5 w-5 text-green-400 self-center" />}
                {keyValid === false && <span title={keyError ?? ""}><XCircle className="h-5 w-5 text-red-400 self-center" /></span>}
              </div>
              {keyValid === false && keyError && <p className="text-xs text-red-400 mt-1">{keyError}</p>}
            </div>
          </div>

          {/* ── Chat Model ── */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5" onClick={() => setExpandedChat(!expandedChat)}>
              <span>
                Chat Model{" "}
                {chatModel && <span className="text-slate-400">— {providerFromId(chatModel)}: {allChat.find((m) => m.id === chatModel)?.name ?? chatModel}</span>}
                {fetchError && !fetching && <span className="ml-2 text-amber-400">(offline)</span>}
              </span>
              {expandedChat ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedChat && (
              <div className="mt-2 space-y-2 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <Input
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder={`Buscar entre ${allChat.length} modelos de chat...`}
                    className="pl-8 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filteredChat.slice(0, 50).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setChatModel(m.id); setExpandedChat(false); setChatSearch(""); }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${chatModel === m.id ? "bg-primary/20 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{providerFromId(m.id)}: {m.name || m.id}</span>
                        <span className="shrink-0 text-slate-500 text-[10px] whitespace-nowrap">
                          {fmtCtx(m.contextLength)}{m.contextLength ? " ctx" : ""}
                          {m.pricing ? ` ${fmtPrice(m.pricing.prompt)}` : ""}
                          {m.isFree ? " FREE" : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredChat.length === 0 && <p className="text-xs text-slate-500 px-2 py-1">Nenhum modelo encontrado.</p>}
                </div>
                {filteredChat.length > 50 && <p className="text-xs text-slate-500 px-2">Mostrando 50 de {filteredChat.length}. Refine a busca.</p>}
              </div>
            )}
          </div>

          {/* ── Embedding Model ── */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5" onClick={() => setExpandedEmbed(!expandedEmbed)}>
              <span>
                Embedding Model{" "}
                {embeddingModel && <span className="text-slate-400">— {providerFromId(embeddingModel)}: {allEmbed.find((m) => m.id === embeddingModel)?.name ?? embeddingModel}</span>}
              </span>
              {expandedEmbed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedEmbed && (
              <div className="mt-2 space-y-2 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <Input
                    value={embedSearch}
                    onChange={(e) => setEmbedSearch(e.target.value)}
                    placeholder={`Buscar entre ${allEmbed.length} modelos de embedding...`}
                    className="pl-8 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filteredEmbed.slice(0, 50).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setEmbeddingModel(m.id);
                        if (m.embeddingDimensions) setEmbeddingDimensions(m.embeddingDimensions);
                        setExpandedEmbed(false); setEmbedSearch("");
                      }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${embeddingModel === m.id ? "bg-primary/20 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{providerFromId(m.id)}: {m.name || m.id}</span>
                        <span className="shrink-0 text-slate-500 text-[10px] whitespace-nowrap">
                          {m.embeddingDimensions ? `${m.embeddingDimensions}d` : ""}
                          {m.pricing ? ` ${fmtPrice(m.pricing.prompt)}` : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredEmbed.length === 0 && <p className="text-xs text-slate-500 px-2 py-1">Nenhum modelo encontrado.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Embedding Dimensions</label>
              <Input type="number" min={1} step={1} value={String(embeddingDimensions)} onChange={(e) => setEmbeddingDimensions(Number(e.target.value) || 0)} placeholder="1536" />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5" onClick={() => setExpandedAdvanced(!expandedAdvanced)}>
              <span>Configuracao Avancada (Parametros)</span>
              {expandedAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedAdvanced && (
              <div className="mt-2 grid gap-3 p-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><label className="block text-xs text-slate-400">Temperature (0-2)</label><Input type="number" min={0} max={2} step={0.1} value={String(temperature)} onChange={(e) => setTemperature(Number(e.target.value))} /></div>
                  <div className="space-y-1"><label className="block text-xs text-slate-400">Top P (0-1)</label><Input type="number" min={0} max={1} step={0.05} value={String(topP)} onChange={(e) => setTopP(Number(e.target.value))} /></div>
                  <div className="space-y-1"><label className="block text-xs text-slate-400">Max Tokens</label><Input type="number" min={1} step={100} value={String(maxTokens)} onChange={(e) => setMaxTokens(Number(e.target.value))} /></div>
                  <div className="space-y-1"><label className="block text-xs text-slate-400">Freq. Penalty (-2 a 2)</label><Input type="number" min={-2} max={2} step={0.1} value={String(freqPen)} onChange={(e) => setFreqPen(Number(e.target.value))} /></div>
                  <div className="space-y-1"><label className="block text-xs text-slate-400">Pres. Penalty (-2 a 2)</label><Input type="number" min={-2} max={2} step={0.1} value={String(presPen)} onChange={(e) => setPresPen(Number(e.target.value))} /></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />} Salvar
        </Button>
      </div>
    </Card>
  );
}

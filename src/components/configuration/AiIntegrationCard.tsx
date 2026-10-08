import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bot, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Search, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { listOpenRouterModels, validateApiKey } from "@/services/configurationApi";
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

// ── Orçamento de rounds de ferramentas (MCP) ──────────────────────────────
// Faixa aceita pelo servidor (AiChatHelpers.ResolveMaxToolIterations): mínimo 3
// (abaixo disso o turno quase não executa ferramentas) e teto 20, padrão 10.
// Valor inválido/fora da faixa é normalizado antes de salvar — senão o JSON
// guardava NaN/0 e o servidor caía silenciosamente no padrão.
const ROUNDS_MIN = 3;
const ROUNDS_MAX = 20;
const ROUNDS_DEFAULT = 10;

function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return ROUNDS_DEFAULT;
  return Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN, Math.round(value)));
}

// Campos numéricos: o input pode ficar vazio (NaN) e JSON.stringify(NaN) vira
// null, que o servidor NÃO desserializa para double/int — o JSON inteiro das
// configurações de IA era descartado e o servidor voltava ao PADRÃO (inclusive
// a API Key). Todo número é normalizado antes de sair daqui, e o servidor
// também passou a recusar JSON inválido (ConfigurationService).
function safeNum(value: number, fallback: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : fallback;
  return Math.min(max, Math.max(min, v));
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

function HelpText({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted">{children}</p>;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-surface-light p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      {hint ? <HelpText>{hint}</HelpText> : null}
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-sky-500" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function AiIntegrationCard({ aiSettings, onSave, saving }: Props) {
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [expandedChat, setExpandedChat] = useState(false);
  const [expandedEmbed, setExpandedEmbed] = useState(false);

  const [enabled, setEnabled] = useState(aiSettings?.enabled ?? false);
  const [provider, setProvider] = useState(aiSettings?.provider ?? "openrouter");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState(aiSettings?.chatModel ?? "");
  const [embeddingModel, setEmbeddingModel] = useState(aiSettings?.embeddingModel ?? "");
  const [embeddingDimensions, setEmbeddingDimensions] = useState(aiSettings?.embeddingDimensions ?? 1536);
  const [embeddingArticlesEnabled, setEmbeddingArticlesEnabled] = useState(aiSettings?.embeddingArticlesEnabled ?? true);
  // Opt-in: nasce desligado (envia respostas de chamados ao provedor de embeddings).
  const [embeddingTicketAnswersEnabled, setEmbeddingTicketAnswersEnabled] = useState(aiSettings?.embeddingTicketAnswersEnabled ?? false);
  const [temperature, setTemperature] = useState(aiSettings?.temperature ?? 0.7);
  const [topP, setTopP] = useState(aiSettings?.topP ?? 1.0);
  const [freqPen, setFreqPen] = useState(aiSettings?.frequencyPenalty ?? 0);
  const [presPen, setPresPen] = useState(aiSettings?.presencePenalty ?? 0);
  const [maxTokens, setMaxTokens] = useState(aiSettings?.maxTokensPerRequest ?? 2000);
  // Orçamento de rounds de ferramentas por turno (3 a 20, padrão 10). Ao esgotar
  // com ação pendente a IA pede autorização e renova no próximo turno.
  const [maxToolIterations, setMaxToolIterations] = useState(
    aiSettings?.maxToolCallIterations ?? ROUNDS_DEFAULT,
  );
  const roundsOutOfRange =
    !Number.isFinite(maxToolIterations) ||
    maxToolIterations < ROUNDS_MIN ||
    maxToolIterations > ROUNDS_MAX;

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
        const data = await listOpenRouterModels();
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

  // Dimensões do vetor são PROPRIEDADE DO MODELO de embedding (cada modelo produz
  // vetores de um tamanho fixo). Antes havia um campo numérico livre que podia
  // divergir do modelo e corromper a busca semântica; agora o valor acompanha a
  // escolha do modelo e é exibido apenas como informação.
  const selectedEmbedModel = allEmbed.find((m) => m.id === embeddingModel) ?? null;
  const embedDimensionsKnown = !!selectedEmbedModel?.embeddingDimensions;
  // Modelo escolhido que não está no catálogo (self-hosted / openai-compatible):
  // não há como derivar as dimensões, então o campo volta a ser editável — é a
  // única situação em que o admin precisa informá-las (senão a busca semântica
  // usaria um vetor de tamanho errado).
  const embedDimensionsEditable = !!embeddingModel && !embedDimensionsKnown;

  // Qualquer numérico vazio/ inválido é normalizado no save; avisa o admin para
  // ele conferir os valores em vez de descobrir depois.
  // Zero não é valor válido para top-p, tokens e dimensões (o provedor rejeita
  // top_p=0 e não existe vetor de 0 dimensões); esses campos entram como inválidos
  // quando o input é limpo, e o save usa o padrão.
  const numericFieldsInvalid =
    !Number.isFinite(temperature) ||
    !Number.isFinite(topP) ||
    topP <= 0 ||
    !Number.isFinite(freqPen) ||
    !Number.isFinite(presPen) ||
    !Number.isFinite(maxTokens) ||
    maxTokens < 100 ||
    !Number.isFinite(embeddingDimensions) ||
    embeddingDimensions < 1;

  function getBaseUrl(): string {
    if (provider === "openrouter") return "https://openrouter.ai/api/v1/";
    if (provider === "openai") return "https://api.openai.com/v1/";
    return "";
  }

  async function handleValidateKey() {
    if (!apiKey.trim()) return;
    setValidating(true); setKeyValid(null); setKeyError(null);
    try {
      const data = await validateApiKey({
        apiKey: apiKey.trim(), provider, baseUrl: getBaseUrl(),
      }) as unknown as { valid: boolean; error?: string };
      setKeyValid(data.valid === true);
      if (!data.valid) setKeyError(data.error ?? "Chave inválida");
    } catch (e: unknown) {
      setKeyValid(false);
      setKeyError(e instanceof Error ? e.message : "Erro");
    } finally { setValidating(false); }
  }

  async function handleSave() {
    const s: Record<string, unknown> = {
      ...aiSettings,
      enabled,
      chatAIEnabled: enabled,
      provider,
      chatModel: chatModel || undefined,
      embeddingModel: embeddingModel || undefined,
      // Onde zero não faz sentido (top-p, tokens, dimensões) um campo vazio cai no
      // valor padrão em vez de 0; onde zero é legítimo (temperatura, penalidades)
      // ele é preservado.
      embeddingDimensions: embeddingDimensions >= 1
        ? safeNum(embeddingDimensions, 1536, 1, 8192)
        : 1536,
      temperature: Number.isFinite(temperature) ? safeNum(temperature, 0.7, 0, 2) : 0.7,
      topP: topP > 0 ? safeNum(topP, 1, 0.01, 1) : 1,
      embeddingArticlesEnabled,
      embeddingTicketAnswersEnabled,
      frequencyPenalty: Number.isFinite(freqPen) ? safeNum(freqPen, 0, -2, 2) : 0,
      presencePenalty: Number.isFinite(presPen) ? safeNum(presPen, 0, -2, 2) : 0,
      maxTokensPerRequest: maxTokens >= 100 ? safeNum(maxTokens, 2000, 100, 32768) : 2000,
      maxToolCallIterations: clampRounds(maxToolIterations),
    };
    if (apiKey.trim()) s.apiKey = apiKey.trim();
    await onSave(JSON.stringify(s));
  }

  return (
    <Card className="space-y-3 rounded-lg border border-border bg-surface-light p-4">
      <CardHeader
        title="Integração com IA"
        subtitle="Provedor, modelos e parâmetros. Configuração GLOBAL do servidor (vale para todos os clientes e sites)."
      />

      <div className="grid gap-3">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          A API Key não é retornada pela API. Preencha apenas para trocá-la.
        </p>

        {/* ── 1. Disponibilidade ── */}
        <Section title="Disponibilidade">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Habilitar IA</p>
              <HelpText>
                Liga o chat, a triagem de chamados, os resumos e a busca semântica (embeddings) neste servidor.
                Com a IA desligada nenhuma chamada é enviada ao provedor e as opções abaixo ficam paradas.
              </HelpText>
            </div>
            <Toggle checked={enabled} onToggle={() => setEnabled(!enabled)} label="Habilitar IA" />
          </div>
        </Section>

        {/* ── 2. Provedor e credencial ── */}
        <Section title="Provedor e credencial">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-muted-foreground">Provider</label>
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
              <label className="block text-sm font-medium text-muted-foreground">
                API Key (Chat + Embeddings){" "}
                {fetching && <RefreshCw className="inline h-3 w-3 animate-spin text-muted" />}
              </label>
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
                {keyValid === true && <CheckCircle2 className="h-5 w-5 self-center text-green-600 dark:text-green-400" />}
                {keyValid === false && (
                  <span title={keyError ?? ""}>
                    <XCircle className="h-5 w-5 self-center text-red-600 dark:text-red-400" />
                  </span>
                )}
              </div>
              {keyValid === false && keyError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{keyError}</p>
              )}
              <HelpText>
                A mesma chave é usada pelo chat e pelos embeddings. "Validar" faz uma chamada de teste ao provedor.
              </HelpText>
            </div>
          </div>
        </Section>

        {/* ── 3. Modelos ── */}
        <Section title="Modelos" hint="O modelo de chat responde e executa ferramentas; o de embedding gera os vetores da busca semântica.">
          <div className="rounded-lg border border-border p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-light"
              onClick={() => setExpandedChat(!expandedChat)}
            >
              <span>
                Modelo de Chat{" "}
                {chatModel && (
                  <span className="text-muted">
                    — {providerFromId(chatModel)}: {allChat.find((m) => m.id === chatModel)?.name ?? chatModel}
                  </span>
                )}
                {fetchError && !fetching && <span className="ml-2 text-amber-600 dark:text-amber-400">(offline)</span>}
              </span>
              {expandedChat ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedChat && (
              <div className="mt-2 space-y-2 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                  <Input
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder={`Buscar entre ${allChat.length} modelos de chat...`}
                    className="pl-8 text-xs"
                  />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredChat.slice(0, 50).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setChatModel(m.id); setExpandedChat(false); setChatSearch(""); }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${chatModel === m.id ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-surface-light"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{providerFromId(m.id)}: {m.name || m.id}</span>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">
                          {fmtCtx(m.contextLength)}{m.contextLength ? " ctx" : ""}
                          {m.pricing ? ` ${fmtPrice(m.pricing.prompt)}` : ""}
                          {m.isFree ? " FREE" : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredChat.length === 0 && <p className="px-2 py-1 text-xs text-muted">Nenhum modelo encontrado.</p>}
                </div>
                {filteredChat.length > 50 && (
                  <p className="px-2 text-xs text-muted">Mostrando 50 de {filteredChat.length}. Refine a busca.</p>
                )}
              </div>
            )}
            <HelpText>
              Prefira um modelo com function calling (ferramentas) — o chat do agente depende disso para executar ações no computador.
              "openrouter/auto" escolhe o modelo a cada mensagem e pode cortar respostas longas (ex.: interfaces A2UI grandes);
              um modelo fixo é mais previsível.
            </HelpText>
          </div>

          <div className="rounded-lg border border-border p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-light"
              onClick={() => setExpandedEmbed(!expandedEmbed)}
            >
              <span>
                Modelo de Embedding{" "}
                {embeddingModel && (
                  <span className="text-muted">
                    — {providerFromId(embeddingModel)}: {allEmbed.find((m) => m.id === embeddingModel)?.name ?? embeddingModel}
                  </span>
                )}
              </span>
              {expandedEmbed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedEmbed && (
              <div className="mt-2 space-y-2 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                  <Input
                    value={embedSearch}
                    onChange={(e) => setEmbedSearch(e.target.value)}
                    placeholder={`Buscar entre ${allEmbed.length} modelos de embedding...`}
                    className="pl-8 text-xs"
                  />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredEmbed.slice(0, 50).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setEmbeddingModel(m.id);
                        // As dimensões SEMPRE acompanham o modelo escolhido.
                        if (m.embeddingDimensions) setEmbeddingDimensions(m.embeddingDimensions);
                        setExpandedEmbed(false); setEmbedSearch("");
                      }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${embeddingModel === m.id ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-surface-light"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{providerFromId(m.id)}: {m.name || m.id}</span>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">
                          {m.embeddingDimensions ? `${m.embeddingDimensions}d` : ""}
                          {m.pricing ? ` ${fmtPrice(m.pricing.prompt)}` : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredEmbed.length === 0 && <p className="px-2 py-1 text-xs text-muted">Nenhum modelo encontrado.</p>}
                </div>
              </div>
            )}

            {/* Dimensões: derivadas do modelo. Só voltam a ser editáveis quando o
                modelo escolhido não está no catálogo (self-hosted / personalizado),
                situação em que a única fonte possível é o admin. */}
            {embedDimensionsEditable ? (
              <div className="mt-2 space-y-1 rounded-md border border-amber-500/40 px-2 py-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Dimensões do vetor (modelo fora do catálogo)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={8192}
                  step={1}
                  value={String(embeddingDimensions)}
                  onChange={(e) => setEmbeddingDimensions(Number(e.target.value))}
                />
                <HelpText>
                  Modelos próprios/self-hosted não aparecem no catálogo: informe as dimensões EXATAS do provedor —
                  elas precisam corresponder ao modelo, senão a busca semântica fica imprecisa. Trocar de modelo
                  (ou de dimensões) exige REINDEXAR os conteúdos.
                </HelpText>
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Dimensões do vetor</p>
                    <HelpText>
                      Definidas automaticamente pelo modelo de embedding escolhido — não há o que configurar aqui.
                      Trocar de modelo (ou de dimensões) exige REINDEXAR os conteúdos para a busca semântica continuar precisa.
                    </HelpText>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {embeddingModel ? embeddingDimensions : "—"}
                  </span>
                </div>
                {!embeddingModel && (
                  <p className="mt-1 text-[11px] text-muted">
                    Escolha o modelo de embedding acima para definir as dimensões do vetor.
                  </p>
                )}
              </>
            )}
          </div>
        </Section>

        {/* ── 4. Busca semântica (depende do embedding acima) ── */}
        <Section
          title="Busca semântica — o que indexar"
          hint="Depende do modelo de embedding acima. Indexar envia o conteúdo ao provedor de embeddings (custo por token)."
        >
          {!enabled && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              IA desabilitada: a indexação não roda enquanto a IA estiver desligada.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Artigos da base de conhecimento</p>
              <HelpText>
                Gera embeddings dos artigos da base para a busca semântica (RAG) usada pela IA ao responder. É o conteúdo que você escreveu na base.
              </HelpText>
            </div>
            <Toggle
              checked={embeddingArticlesEnabled}
              onToggle={() => setEmbeddingArticlesEnabled(!embeddingArticlesEnabled)}
              label="Indexar artigos da base de conhecimento"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Respostas dos chamados</p>
              <HelpText>
                Indexa as respostas dos questionários para sugerir soluções em chamados parecidos.
                Envia dados de atendimento ao provedor; perguntas marcadas como sensíveis no template nunca são indexadas. Desligado por padrão.
              </HelpText>
            </div>
            <Toggle
              checked={embeddingTicketAnswersEnabled}
              onToggle={() => setEmbeddingTicketAnswersEnabled(!embeddingTicketAnswersEnabled)}
              label="Indexar respostas dos chamados"
            />
          </div>
        </Section>

        {/* ── 5. Avançado ── */}
        <div className="rounded-lg border border-border bg-surface-light p-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-light"
            onClick={() => setExpandedAdvanced(!expandedAdvanced)}
          >
            <span>Configuração Avançada (Parâmetros)</span>
            {expandedAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {expandedAdvanced && (
            <div className="mt-2 grid gap-3 p-2">
              {numericFieldsInvalid && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Há campo numérico vazio ou fora da faixa: esses campos serão salvos com o valor padrão.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-xs text-muted">Temperatura (0 a 2)</label>
                  <Input type="number" min={0} max={2} step={0.1} value={String(temperature)} onChange={(e) => setTemperature(Number(e.target.value))} />
                  <HelpText>
                    Quão variada é a resposta. 0 = direta e repetível (melhor para comandos e ferramentas);
                    2 = criativa e imprevisível. Padrão 0,7 — para automações, 0,2 a 0,4 costuma dar respostas mais estáveis.
                  </HelpText>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-muted">Top P (0,01 a 1)</label>
                  <Input type="number" min={0.01} max={1} step={0.05} value={String(topP)} onChange={(e) => setTopP(Number(e.target.value))} />
                  <HelpText>
                    Recorte do vocabulário considerado a cada palavra. 1 = considera todas as opções (padrão);
                    valores menores (ex.: 0,9) deixam o texto mais previsível; o provedor rejeita 0 — por isso o mínimo é 0,01.
                    Ajuste temperatura OU top-p — os dois juntos embaralham o efeito.
                  </HelpText>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-muted">Máx. tokens (saída)</label>
                  <Input type="number" min={100} max={32768} step={100} value={String(maxTokens)} onChange={(e) => setMaxTokens(Number(e.target.value))} />
                  <HelpText>
                    Teto do tamanho da resposta (1 token ≈ 4 caracteres). O valor efetivo nunca passa do que o modelo suporta.
                    Respostas cortadas no meio (JSON/A2UI truncado) costumam indicar teto baixo ou modelo com limite pequeno.
                  </HelpText>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-muted">
                    Rounds de ferramentas ({ROUNDS_MIN} a {ROUNDS_MAX})
                  </label>
                  <Input
                    type="number"
                    min={ROUNDS_MIN}
                    max={ROUNDS_MAX}
                    step={1}
                    value={String(maxToolIterations)}
                    onChange={(e) => setMaxToolIterations(Number(e.target.value))}
                  />
                  <HelpText>
                    Quantas rodadas de ferramentas (MCP) a IA pode executar por mensagem — cada round executa uma ferramenta.
                    Padrão 10, mínimo {ROUNDS_MIN}. Ao esgotar com uma ação pendente, a IA pergunta se pode continuar:
                    autorizando, o orçamento é renovado com este mesmo valor. Configuração GLOBAL do servidor.
                  </HelpText>
                  {roundsOutOfRange && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Valor fora da faixa {ROUNDS_MIN}-{ROUNDS_MAX}: será salvo como {clampRounds(maxToolIterations)}.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-muted">Penalidade de frequência (-2 a 2)</label>
                  <Input type="number" min={-2} max={2} step={0.1} value={String(freqPen)} onChange={(e) => setFreqPen(Number(e.target.value))} />
                  <HelpText>
                    Pune a repetição de palavras já usadas. 0 = neutro (padrão); positivo evita repetir, negativo incentiva.
                    Use no máximo 0,5 — valores altos deixam a resposta truncada e estranha.
                  </HelpText>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-muted">Penalidade de presença (-2 a 2)</label>
                  <Input type="number" min={-2} max={2} step={0.1} value={String(presPen)} onChange={(e) => setPresPen(Number(e.target.value))} />
                  <HelpText>
                    Incentiva trazer assuntos novos. 0 = neutro (padrão); positivo empurra para tópicos ainda não ditos,
                    negativo mantém o foco no que já foi falado. Valores altos fazem a IA fugir do assunto pedido.
                  </HelpText>
                </div>
              </div>
            </div>
          )}
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

import type {
  ClientConfiguration,
  ConfigurationFieldMetadata,
  ConfigurationOrigin,
  ConfigurationValue,
  ResolvedConfiguration,
  ServerConfiguration,
  SiteConfiguration,
} from "@/api";

export type EditableFieldKind =
  | "boolean"
  | "number"
  | "string"
  | "json"
  | "policy"
  | "select";

export type EditableFieldGroup =
  | "features"
  | "policy"
  | "remoteAccess"
  | "agent"
  | "tokens"
  | "advanced"
  | "storage"
  | "nats"
  | "siteProfile";

export interface EditableField {
  key: string;
  label: string;
  kind: EditableFieldKind;
  group?: EditableFieldGroup;
  description?: string;
  unit?: string;
  /** Opções para fields do tipo "select" (value = id enviado à API). */
  options?: { value: string; label: string }[];
  /**
   * Default do campo quando o servidor ainda não devolveu valor.
   *
   * Sem isto o form assume "false" para TODO booleano (fieldDefault). Nos kill
   * switches do GRUPO A isso inverteria a tela: 9 dos 10 são ligados no
   * appsettings, então a configuração abriria mostrando tudo desligado — e um
   * "salvar" desligaria features ativas em produção.
   */
  defaultValue?: string;
}

const AI_INTEGRATION_FIELD_KEY = "aiIntegrationSettingsJson";

/**
 * Política da Loja de Aplicativos (AppStorePolicyType no backend).
 * Os valores são enviados como 0/1/2 e o backend serializa o enum como número.
 */
export const APP_STORE_POLICY_LABELS: Record<number, string> = {
  0: "Desativado",
  1: "Pré-aprovados",
  2: "Todos",
};

export const APP_STORE_POLICY_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "0 - Desativado (nenhum aplicativo autorizado)" },
  { value: "1", label: "1 - Pré-aprovados (apenas aplicativos da lista)" },
  { value: "2", label: "2 - Todos (qualquer aplicativo autorizado)" },
];

/** Modo de autorização do acesso remoto (RemoteConsentMode no backend). */
export const REMOTE_CONSENT_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "Off", label: "Desligado (sem aviso nem pedido)" },
  { value: "NotifyOnly", label: "Apenas notificar (avisa e conecta)" },
  { value: "Prompt", label: "Solicitar autorização (aguarda decisão)" },
];

/** Ação quando a contagem regressiva termina sem resposta. */
export const REMOTE_CONSENT_TIMEOUT_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "Deny", label: "Negar automaticamente" },
  { value: "Approve", label: "Aprovar automaticamente" },
];

/**
 * Autorização por departamento (Tickets:DepartmentAuth:ShadowMode).
 *
 * O backend expõe o estado como BOOLEANO (DepartmentAuthShadowMode), NÃO como
 * enum: ITicketAccessPolicy.ShadowMode é bool e o controller deriva canTreat
 * dele (TicketsController.cs:1141). Um enum criaria duas representações do
 * mesmo estado.
 *
 * Por isso NÃO existe uma lista de options aqui: o campo é renderizado como
 * switch (kind "boolean") e mandar string no PATCH devolveria 400 — o mesmo
 * bug histórico do SensorsSettingsJson. Este rótulo só documenta o mapeamento
 * de negócio usado no label/description do campo.
 *
 * ATENÇÃO ao inverter: true = OBSERVAÇÃO (não bloqueia ninguém).
 */
export const DEPARTMENT_AUTH_SHADOW_MODE_LABELS = {
  true: "Observação",
  false: "Ativo",
} as const;

/**
 * Modo do contrato de realtime (RealtimeContract:Mode no appsettings).
 * Valores aceitos pelo backend; qualquer outro cai no default "auto".
 */
export const REALTIME_CONTRACT_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Automático (adapta ao emissor)" },
  { value: "strict", label: "Estrito (rejeita emissores legados)" },
  { value: "legacy", label: "Legado (aceita apenas o contrato antigo)" },
];

const REMOTE_CONSENT_FIELDS: EditableField[] = [
  {
    key: "remoteConsentMode",
    label: "Modo de autorização",
    kind: "select",
    group: "remoteAccess",
    options: REMOTE_CONSENT_MODE_OPTIONS,
    description:
      "Vale apenas para sessões de área de trabalho. Terminal, arquivos, proxy e processos não pedem autorização.",
  },
  {
    key: "remoteConsentTimeoutSeconds",
    label: "Tempo para o usuário responder",
    kind: "number",
    group: "remoteAccess",
    unit: "segundos",
    description:
      "Contagem regressiva do prompt. De 10 a 600 segundos (padrão do servidor: 60).",
  },
  {
    key: "remoteConsentTimeoutAction",
    label: "Se o usuário não responder",
    kind: "select",
    group: "remoteAccess",
    options: REMOTE_CONSENT_TIMEOUT_ACTION_OPTIONS,
    description: "Aprova ou nega automaticamente quando a contagem termina sem decisão.",
  },
  {
    key: "remoteConsentShowBanner",
    label: "Banner durante a sessão",
    kind: "boolean",
    group: "remoteAccess",
    description:
      "Exibe a faixa local (texto + operador + tempo de sessão) no computador acessado. A desconexão fica no ícone da bandeja e a faixa não aparece no stream remoto.",
  },
  {
    key: "remoteConsentMessage",
    label: "Mensagem do prompt",
    kind: "string",
    group: "remoteAccess",
    description:
      "Texto exibido na janela de consentimento (usado apenas no modo Solicitar autorização). Placeholders: {operator}, {client}, {site}, {agent}. Máximo 500 caracteres.",
  },
  {
    key: "remoteConsentBannerText",
    label: "Texto do banner",
    kind: "string",
    group: "remoteAccess",
    description:
      "Texto principal da faixa exibida durante a sessão; o agent acrescenta o operador quando o texto não o cita. Placeholders: {operator}, {client}, {site}, {agent}. Máximo 500 caracteres.",
  },
];

/**
 * Rótulos (i18n) e fallback local das abas da página inicial do agent.
 *
 * NÃO é a fonte de verdade da lista: os valores aceitos vêm do servidor em
 * `metadata.agentHomeTabOptions` (AgentHomeTabCatalog) e são usados via
 * `getAgentHomeTabOptions`. Este mapa só fornece os rótulos em pt-BR e cobre o
 * caso de a metadata não estar disponível (API antiga/offline).
 */
export const AGENT_HOME_TAB_OPTIONS: { value: string; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "store", label: "Loja" },
  { value: "updates", label: "Atualizações" },
  { value: "chat", label: "Chat IA" },
  { value: "support", label: "Suporte" },
  { value: "knowledge", label: "Base de Conhecimento" },
];

/**
 * Monta as opções de aba a partir dos valores publicados pelo servidor
 * (`metadata.agentHomeTabOptions`, fonte de verdade = AgentHomeTabCatalog).
 * Os rótulos continuam locais (i18n); valores sem rótulo conhecido aparecem
 * com o próprio id. Sem a lista do servidor, usa o fallback local.
 */
export function getAgentHomeTabOptions(
  allowedValues?: string[] | null,
): { value: string; label: string }[] {
  if (!allowedValues || allowedValues.length === 0) {
    return AGENT_HOME_TAB_OPTIONS;
  }

  const labels = new Map(
    AGENT_HOME_TAB_OPTIONS.map((option) => [option.value, option.label]),
  );

  return allowedValues.map((value) => ({
    value,
    label: labels.get(value) ?? value,
  }));
}

export const AGENT_HOME_TAB_DESCRIPTION =
  "Define qual aba o agent abre como página inicial. É herdável (servidor → cliente → site): vazio herda do nível acima. Se a aba estiver desativada para o agente, ele abre a aba Status.";

const APP_STORE_POLICY_NAMES: Record<string, number> = {
  Disabled: 0,
  PreApproved: 1,
  All: 2,
};

/**
 * Normaliza o valor da política vindo da API (0/1/2 numérico ou o nome do enum
 * como string, ex.: "PreApproved") para um rótulo legível em pt-BR.
 */
export function formatAppStorePolicyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return APP_STORE_POLICY_LABELS[value] ?? String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return "";
    }

    if (trimmed in APP_STORE_POLICY_NAMES) {
      return APP_STORE_POLICY_LABELS[APP_STORE_POLICY_NAMES[trimmed]];
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return APP_STORE_POLICY_LABELS[numeric] ?? trimmed;
    }

    return trimmed;
  }

  return String(value);
}

/**
 * Dependências entre funcionalidades. Chave = campo dependente; requiresAnyOf =
 * campos que precisam estar ativos (true) para a funcionalidade fazer sentido.
 * Espelha a regra aplicada no agent (resolveP2PFileTransferEnabled e o gate de
 * zero-touch), evitando que o painel permita uma combinação que o agent ignora.
 */
export const FEATURE_DEPENDENCIES: Record<
  string,
  { requiresAnyOf: string[]; reason: string }
> = {
  p2PFilesEnabled: {
    requiresAnyOf: ["discoveryEnabled", "cloudBootstrapEnabled"],
    reason:
      "A Transferência P2P de Arquivos requer Descoberta de Rede ou Bootstrap P2P via Nuvem ativos — sem um caminho de descoberta os agentes não se encontram.",
  },
  zeroTouchEnabled: {
    requiresAnyOf: ["discoveryEnabled"],
    reason:
      "O Zero-Touch requer Descoberta de Rede ativa para os agentes se encontrarem na rede.",
  },
};

function isFeatureValueTrue(
  values: Record<string, string | undefined>,
  key: string,
): boolean {
  return String(values[key] ?? "").trim() === "true";
}

/**
 * Retorna a razão pela qual a funcionalidade não pode ser ativada com os valores
 * atuais, ou null quando não há dependência pendente.
 */
export function getFeatureDependencyIssue(
  fieldKey: string,
  values: Record<string, string | undefined>,
): string | null {
  const dependency = FEATURE_DEPENDENCIES[fieldKey];
  if (!dependency) {
    return null;
  }

  const satisfied = dependency.requiresAnyOf.some((key) =>
    isFeatureValueTrue(values, key),
  );

  return satisfied ? null : dependency.reason;
}

/**
 * Ao desativar `changedKey`, devolve os campos dependentes que estão ativos e
 * perderiam o caminho de descoberta — devem ser desativados junto para o painel
 * não ficar num estado que o agent ignora.
 */
export function getDependentsToDisable(
  changedKey: string,
  values: Record<string, string | undefined>,
): string[] {
  const afterChange: Record<string, string | undefined> = {
    ...values,
    [changedKey]: "false",
  };

  return Object.keys(FEATURE_DEPENDENCIES).filter(
    (key) =>
      isFeatureValueTrue(values, key) &&
      getFeatureDependencyIssue(key, afterChange) !== null,
  );
}

function sanitizeAiIntegrationObject(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = { ...(value as Record<string, unknown>) };

  // ApiKey, apiKey, EmbeddingApiKey e embeddingApiKey sao write-only: nunca exibir valores existentes.
  if ("apiKey" in record) {
    delete record.apiKey;
  }
  if ("ApiKey" in record) {
    delete record.ApiKey;
  }
  if ("embeddingApiKey" in record) {
    delete record.embeddingApiKey;
  }
  if ("EmbeddingApiKey" in record) {
    delete record.EmbeddingApiKey;
  }

  return record;
}

const HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function isValidHostOnly(value: string): boolean {
  if (!value) {
    return true;
  }

  if (value.includes("://") || value.includes("/") || value.includes(":")) {
    return false;
  }

  if (IPV4_REGEX.test(value)) {
    return true;
  }

  const parts = value.split(".");
  if (parts.some((part) => part.length === 0)) {
    return false;
  }

  return parts.every((part) => HOST_LABEL_REGEX.test(part));
}

export const serverEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
    description:
      "Reinstala e reconfigura dispositivos que perderam a configuração ou foram formatados, reaproveitando a identidade e o histórico do agente.",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
    description: "Permite que agentes descubram dispositivos na rede local.",
  },
  {
    key: "p2PFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
    description:
      "Habilita o download e o compartilhamento de instaladores entre agentes via P2P. Requer Descoberta de Rede ou Bootstrap P2P via Nuvem ativos — sem um caminho de descoberta os agentes não se encontram e o P2P fica desativado no agent.",
  },
  {
    key: "cloudBootstrapEnabled",
    label: "Bootstrap P2P via Nuvem",
    kind: "boolean",
    group: "features",
    description:
      "Permite que agentes P2P se descubram entre VLANs e multi-redes diferentes: cada agent obtém do servidor (ciclo automático a cada 60 min ou botão Sincronizar) a lista de peers online do cliente com endereçamento libp2p. A chegada de agentes novos continua anunciada em tempo real via heartbeat."
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
    description: "Habilita o chat com IA para suporte no painel.",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
    description:
      "Exibe o menu de Chamados/Suporte no agent e permite abrir, consultar, comentar e fechar chamados, além das sessões de suporte remoto.",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
    description:
      "Habilita o módulo de base de conhecimento e artigos de suporte.",
  },
  {
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Permite que agentes sem credenciais se registrem sozinhos pela rede (P2P onboarding). Requer Descoberta de Rede ativa para os agentes se encontrarem.",
  },
  {
    key: "knowledgeEmbeddingEnabled",
    label: "Embeddings da Base de Conhecimento",
    kind: "boolean",
    group: "features",
    description:
      "Desliga o KnowledgeEmbeddingJob: para de re-chunkar artigos, de gerar embeddings em lote e de consumir a fila de artigos alterados (a busca semântica da base de conhecimento deixa de receber conteúdo novo). O gate é de AGENDAMENTO no Quartz — desligar exige reiniciar a API para o job sair do scheduler. Ligado por padrão no servidor.",
  },
  // ── Kill switches de feature (GRUPO A da auditoria appsettings × UI) ──────
  // Antes só existiam no appsettings.json: para ligar/desligar era preciso
  // editar o arquivo no servidor e reiniciar. O default de cada um reproduz o
  // valor que já estava em produção (zero surpresa ao subir esta versão).
  {
    // kind BOOLEAN de propósito (não select): a propriedade no backend é
    // bool? (DepartmentAuthShadowMode). Um "select" mandaria STRING no PATCH e
    // a API devolveria 400 — exatamente o bug histórico do SensorsSettingsJson
    // (JSON renderizado como switch). O estado Observação/Ativo é o MESMO
    // booleano: true = Observação, false = Ativo. O rótulo e a description
    // deixam o mapeamento explícito para o usuário.
    key: "departmentAuthShadowMode",
    label: "Autorização por departamento — Observação / Ativo",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Observação (ligado) = registra no log quem SERIA barrado, sem bloquear ninguém. Ativo (desligado) = somente o time do departamento trata o chamado; quem abriu só encerra o próprio. LIGAR SEM POPULAR OS TIMES BLOQUEIA TODOS que não têm acesso global. Padrão: Observação (ligado). Tem efeito imediato — não exige reiniciar a API.",
  },
  {
    key: "pushEnabled",
    label: "Notificações Push (Web Push)",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Envia notificações push para os navegadores inscritos. Desligado, nenhuma inscrição recebe aviso (as chaves VAPID continuam sendo lidas do ambiente). Exige reiniciar a API.",
  },
  {
    key: "wingetCatalogEnabled",
    label: "Catálogo Winget",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Habilita a sincronização do catálogo de aplicativos winget. Desligado, o sync do catálogo para e a Loja de Aplicativos deixa de receber pacotes novos (o que já foi sincronizado continua disponível). Exige reiniciar a API.",
  },
  {
    key: "remoteAccessEnabled",
    label: "Acesso Remoto",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Liga o acesso remoto (área de trabalho, terminal, arquivos, proxy e processos). Desligar derruba o acesso remoto de TODA a frota — os agentes recusam novas sessões. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingEnabled",
    label: "Gravação das Sessões Remotas",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Grava as sessões de acesso remoto para auditoria. Desligado, novas sessões não são gravadas (as gravações existentes são preservadas até expirar). Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingAutoDeleteExpired",
    label: "Excluir Gravações Expiradas Automaticamente",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Remove as gravações de sessão após o período de retenção. Desligado, as gravações vencidas continuam armazenadas e o consumo de disco cresce sem limite — a limpeza passa a ser manual. Exige reiniciar a API.",
  },
  {
    key: "automaticLoggingEnabled",
    label: "Log Automático",
    kind: "boolean",
    defaultValue: "true",
    group: "advanced",
    description:
      "Coleta automática de logs pelos agentes. Desligado, os agentes param de enviar logs e o visualizador de logs deixa de receber eventos novos (o histórico já coletado é preservado). Exige reiniciar a API.",
  },
  {
    key: "openTelemetryEnabled",
    label: "OpenTelemetry (traces e métricas)",
    kind: "boolean",
    defaultValue: "false",
    group: "advanced",
    description:
      "Liga a exportação de traces e métricas via OTLP. Exige um coletor OTLP configurado; sem ele não há export (a instrumentação fica ativa, mas nada é enviado). Padrão: desligado. Exige reiniciar a API.",
  },
  {
    key: "migrationsRunOnStartup",
    label: "Rodar Migrações na Inicialização",
    kind: "boolean",
    defaultValue: "true",
    group: "advanced",
    description:
      "Aplica as migrações do banco automaticamente quando a API sobe. Desligar impede que migrações rodem no boot — novas instalações ficam com schema desatualizado. Mantenha ligado a menos que aplique migrações manualmente. Exige reiniciar a API.",
  },
  {
    key: "realtimeContractMode",
    label: "Modo do Contrato de Realtime",
    kind: "select",
    defaultValue: "auto",
    group: "advanced",
    options: REALTIME_CONTRACT_MODE_OPTIONS,
    description:
      "Automático adapta o payload ao emissor; Estrito pode rejeitar emissores legados e quebrar o dashboard em tempo real; Legado aceita apenas o contrato antigo. Padrão: Automático. Exige reiniciar a API.",
  },
  {
    key: "windowsUpdateEnabled",
    label: "Gerenciador de Patches (Windows Update)",
    kind: "boolean",
    group: "features",
    description:
      "Habilita o inventário e a instalação de atualizações do Windows nos agentes. Desligado, o agente não roda scan nem aceita comandos de patch (o inventário já coletado é preservado).",
  },
  {
    key: "updatesTabEnabled",
    label: "Aba de Atualizações de Aplicativos",
    kind: "boolean",
    group: "features",
    description:
      "Exibe no agent a aba que lista os aplicativos com atualização pendente (winget/chocolatey) e permite aplicá-las. Desligado, a aba Atualizações fica oculta no painel do agent.",
  },
  {
    key: "windowsUpdateScanIntervalMinutes",
    label: "Intervalo de Varredura de Patches",
    kind: "number",
    group: "agent",
    description:
      "Com qual frequência (em minutos) os agentes varrem o Windows Update. Mínimo efetivo no agente: 60 minutos.",
    unit: "minutos",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
    description:
      "Controla quais aplicativos os agentes podem instalar: Desativado (nenhum), Pré-aprovados (lista whitelist) ou Todos.",
  },
  ...REMOTE_CONSENT_FIELDS,
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
    unit: "horas",
  },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    description:
      "Com qual frequência (em segundos) o agente envia um sinal de presença. Define se o agente está ativo e conectado ao servidor.",
    unit: "segundos",
  },
  {
    key: "agentOnlineGraceSeconds",
    label: "Janela de Tolerância para Offline",
    kind: "number",
    group: "agent",
    description:
      "Tempo (em segundos) sem receber heartbeat antes de considerar o agente offline. Deve ser maior que o intervalo de heartbeat.",
    unit: "segundos",
  },
  {
    key: "agentHomeTab",
    label: "Página Inicial do Agent",
    kind: "select",
    group: "agent",
    options: AGENT_HOME_TAB_OPTIONS,
    description: AGENT_HOME_TAB_DESCRIPTION,
  },
  {
    key: "brandingSettingsJson",
    label: "Personalização Visual (Branding)",
    kind: "json",
    group: "advanced",
    description: "Logotipo, cores e identidade visual exibidos pelos agentes.",
  },
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "Chave de API, modelo e parâmetros do provedor de IA. A chave é write-only e só deve ser enviada quando informada novamente.",
  },
  {
    key: "maintenanceWindowJson",
    label: "Janela de Manutenção (Reboot/Patches)",
    kind: "json",
    group: "policy",
    description: "Janela (dias + horário no fuso escolhido; padrão UTC) em que patches e reboots podem executar; fora dela o agent adia o comando (deferred_to_window).",
  },
  {
    key: "backgroundProcessingSettingsJson",
    label: "Processamento em Segundo Plano",
    kind: "json",
    group: "advanced",
    description:
      "Ciclos agendados: métricas por atendente (intervalo mínimo de 10 min) e triagem por IA em lotes. Clientes herdam estes valores e podem sobrescrever campo a campo.",
  },
  {
    key: "SensorsSettingsJson",
    label: "Sensores de Monitoramento",
    kind: "json",
    group: "features",
    description:
      "Configuração global dos sensores: enabled (kill switch do sync — desligado entrega 0 sensores aos agentes), defaultIntervalSeconds (30..86400, usado por sensores com intervalSeconds = 0), autoTicketEnabled (dispara auto-ticket a partir dos eventos de sensor) e notifyEnabled (notificações de e-mail/webhook/in-app dos alertas).",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos que não podem ser sobrescritos por clientes ou sites.",
  },
  // ── Object Storage (S3-compatible / MinIO) ─────────────────
  {
    key: "objectStorageInternal",
    label: "Usar RustFS interno (servidor)",
    kind: "boolean",
    group: "storage",
    description:
      "Liga o armazenamento interno deste servidor (RustFS). Nesse modo as credenciais e o endpoint de loopback vem da configuração do servidor (ObjectStorage__* no env) e o campo Endpoint S3 abaixo passa a ser a URL PUBLICA usada nas URLs pré-assinadas entregues ao agent e ao navegador. Desligando, o servidor usa o provedor externo configurado nos campos abaixo (o env interno só prevalece se o banco não tiver NENHUMA configuração externa — preencha endpoint, bucket e credenciais antes de salvar).",
  },
  {
    key: "objectStorageEndpoint",
    label: "Endpoint S3",
    kind: "string",
    group: "storage",
    description:
      "URL base do servidor S3-compatível, sem o bucket no caminho (ex.: https://s3.us-east-1.amazonaws.com; Cloudflare R2: https://<accountid>.r2.cloudflarestorage.com). Com o RustFS interno ligado, informe aqui a URL PUBLICA do servidor (ex.: https://portal.suaempresa.com.br) — o anexo entra por /<bucket>/. Deixe em branco para desabilitar o armazenamento.",
  },
  {
    key: "objectStorageBucketName",
    label: "Bucket",
    kind: "string",
    group: "storage",
    description: "Nome do bucket onde os arquivos serão armazenados.",
  },
  {
    key: "objectStorageRegion",
    label: "Região",
    kind: "string",
    group: "storage",
    description:
      "Região do bucket (ex.: us-east-1, sa-east-1). Pode ficar EM BRANCO: Cloudflare R2 não tem região (o servidor usa \"auto\"), a região da AWS é deduzida do endpoint e MinIO/RustFS ignoram o valor.",
  },
  {
    key: "objectStorageAccessKey",
    label: "Access Key",
    kind: "string",
    group: "storage",
    description: "Chave de acesso (Access Key ID) para autenticação no S3.",
  },
  {
    key: "objectStorageSecretKey",
    label: "Secret Key",
    kind: "string",
    group: "storage",
    description:
      "Chave secreta (Secret Access Key). Será mascarada na exibição.",
  },
  {
    key: "objectStorageUrlTtlHours",
    label: "TTL de URLs Assinadas",
    kind: "number",
    group: "storage",
    description:
      "Tempo de validade (em horas) das URLs pré-assinadas geradas pelo servidor.",
    unit: "horas",
  },
  {
    key: "objectStorageUsePathStyle",
    label: "Usar Path Style",
    kind: "boolean",
    group: "storage",
    description:
      "Ative para endpoints MinIO/compatíveis que exigem path-style (ex.: endpoint/bucket em vez de bucket.endpoint).",
  },
  {
    key: "objectStorageSslVerify",
    label: "Verificar SSL",
    kind: "boolean",
    group: "storage",
    description:
      "Valida o certificado TLS do endpoint. Desative apenas em ambientes de desenvolvimento com certificados autoassinados.",
  },
  // ── Anexos do chamado ──────────────────────────────────────────────────
  // Limites/tipos e allowlist são editados no card dedicado "Anexos de
  // Tickets" (TicketAttachmentSettingsJson). As colunas antigas
  // attachmentComment*/attachmentTicket* continuam existindo na API apenas
  // para compatibilidade e são sincronizadas por esse card — por isso não são
  // expostas aqui (editá-las não teria efeito sobre a configuração efetiva).
  {
    key: "attachmentTicketTotalQuotaBytes",
    label: "Anexos do chamado — cota total (bytes)",
    kind: "number",
    group: "storage",
    description: "Soma máxima de anexos por chamado. 0 = sem cota.",
  },
  // ── NATS (Server-only) ───────────────────────────────
  {
    key: "natsEnabled",
    label: "NATS Habilitado",
    kind: "boolean",
    group: "nats",
    description: "Ativa o servidor NATS para realtime e comunicação dos agentes.",
  },
  {
    key: "natsAuthEnabled",
    label: "Autenticação NATS",
    kind: "boolean",
    group: "nats",
    description: "Exige autenticação JWT na conexão com o broker NATS.",
  },
  {
    key: "natsUseWssExternal",
    label: "WSS Externo",
    kind: "boolean",
    group: "nats",
    description: "Usa WebSocket seguro (WSS) para conexões externas ao NATS.",
  },
  {
    key: "natsServerHostExternal",
    label: "NATS Host Externo (Agents)",
    kind: "string",
    group: "nats",
    description: "Host/IP utilizado pelos agents para conectar ao servidor NATS. Geralmente um endereço público ou acessível na rede dos agents. Sem protocolo e sem porta.",
  },
  {
    key: "natsServerHostInternal",
    label: "NATS Host Interno (Servidor)",
    kind: "string",
    group: "nats",
    description: "Host/IP utilizado pelo próprio servidor para conectar ao NATS. Pode ser localhost ou um endereço interno. Sem protocolo e sem porta.",
  },
  {
    key: "natsAgentJwtTtlMinutes",
    label: "TTL JWT do Agent",
    kind: "number",
    group: "nats",
    description: "Tempo de vida do JWT emitido para agents. Mínimo 15 min, máximo 4320 min (72h). Padrão: 1440 min (24h).",
    unit: "min",
  },
  {
    key: "natsUserJwtTtlMinutes",
    label: "TTL JWT do Usuário",
    kind: "number",
    group: "nats",
    description: "Tempo de vida do JWT emitido para usuários. Mínimo 15 min, máximo 4320 min (72h). Padrão: 1440 min (24h).",
    unit: "min",
  },
];

export const clientEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
  },
  {
    key: "p2PFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede neste escopo ou herdada, ou Bootstrap P2P via Nuvem neste escopo ou herdado do servidor.",
  },
  {
    key: "cloudBootstrapEnabled",
    label: "Bootstrap P2P via Nuvem",
    kind: "boolean",
    group: "features",
    description:
      "Permite que agentes deste cliente se descubram entre VLANs usando o servidor. Serve como caminho de descoberta alternativo para o P2P.",
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
  },
  {
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede ativa neste escopo ou herdada para os agentes se encontrarem.",
  },
  {
    key: "knowledgeEmbeddingEnabled",
    label: "Embeddings da Base de Conhecimento",
    kind: "boolean",
    group: "features",
    description:
      "Vazio herda do servidor (padrão: ligado). Desligar para de re-chunkar artigos e de gerar embeddings neste cliente; o gate é de AGENDAMENTO no Quartz, então é preciso reiniciar a API para reavaliar.",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
  },
  {
    key: "updatesTabEnabled",
    label: "Aba de Atualizações de Aplicativos",
    kind: "boolean",
    group: "features",
    description:
      "Exibe no agent a aba que lista os aplicativos com atualização pendente (winget/chocolatey) e permite aplicá-las. Vazio herda do servidor.",
  },
  // ── Kill switches herdáveis (GRUPO A da auditoria appsettings × UI) ───────
  // Vazio (null) = herda do servidor. Os campos que NÃO herdam
  // (openTelemetryEnabled, realtimeContractMode, migrationsRunOnStartup) ficam
  // só no escopo do servidor — enviá-los aqui devolveria 400.
  {
    key: "departmentAuthShadowMode",
    label: "Autorização por departamento — Observação / Ativo",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Observação (ligado) = registra no log quem SERIA barrado, sem bloquear ninguém. Ativo (desligado) = somente o time do departamento trata o chamado; quem abriu só encerra o próprio. LIGAR SEM POPULAR OS TIMES BLOQUEIA TODOS que não têm acesso global. Vazio herda do servidor (padrão: Observação). Exige reiniciar a API.",
  },
  {
    key: "pushEnabled",
    label: "Notificações Push (Web Push)",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Envia notificações push para os navegadores inscritos. Vazio herda do servidor. Exige reiniciar a API.",
  },
  {
    key: "wingetCatalogEnabled",
    label: "Catálogo Winget",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Habilita a sincronização do catálogo de aplicativos winget. Desligado, a Loja de Aplicativos deste cliente deixa de receber pacotes novos. Vazio herda do servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessEnabled",
    label: "Acesso Remoto",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Liga o acesso remoto (área de trabalho, terminal, arquivos, proxy e processos). Desligar derruba o acesso remoto de toda a frota DESTE cliente. Vazio herda do servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingEnabled",
    label: "Gravação das Sessões Remotas",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Grava as sessões de acesso remoto para auditoria. Desligado, novas sessões deste cliente não são gravadas. Vazio herda do servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingAutoDeleteExpired",
    label: "Excluir Gravações Expiradas Automaticamente",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Remove as gravações de sessão após o período de retenção. Desligado, as gravações vencidas continuam armazenadas e o consumo de disco cresce sem limite. Vazio herda do servidor. Exige reiniciar a API.",
  },
  {
    key: "automaticLoggingEnabled",
    label: "Log Automático",
    kind: "boolean",
    defaultValue: "true",
    group: "advanced",
    description:
      "Coleta automática de logs pelos agentes. Desligado, os agentes deste cliente param de enviar logs. Vazio herda do servidor. Exige reiniciar a API.",
  },
  ...REMOTE_CONSENT_FIELDS,
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "ApiKey e write-only: mantenha ausente no JSON e inclua somente quando quiser trocar a chave.",
  },
  {
    key: "maintenanceWindowJson",
    label: "Janela de Manutenção (Reboot/Patches)",
    kind: "json",
    group: "policy",
    description: "Override da janela de manutenção do servidor; vazia = herda.",
  },
  {
    key: "backgroundProcessingSettingsJson",
    label: "Processamento em Segundo Plano (override)",
    kind: "json",
    group: "advanced",
    description:
      "Sobrescreve os ciclos herdados do global. Envie apenas os campos que quiser mudar (ausentes herdam); ex.: Metrics.IntervalMinutes=60 ou Triage.Enabled=false.",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos bloqueados neste cliente para impedir override no nível de site.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    unit: "horas",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
  },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Com qual frequência (em segundos) o agente envia um sinal de presença. Define se o agente está ativo e conectado ao servidor.",
  },
  {
    key: "agentOnlineGraceSeconds",
    label: "Janela de Tolerância para Offline",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Tempo (em segundos) sem receber heartbeat antes de considerar o agente offline. Deve ser maior que o intervalo de heartbeat.",
  },
  {
    key: "agentHomeTab",
    label: "Página Inicial do Agent",
    kind: "select",
    group: "agent",
    options: AGENT_HOME_TAB_OPTIONS,
    description: AGENT_HOME_TAB_DESCRIPTION,
  },
];

export const siteEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
  },
  {
    key: "p2PFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede neste escopo ou herdada, ou Bootstrap P2P via Nuvem herdado do cliente/servidor.",
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
  },
  {
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede ativa neste escopo ou herdada para os agentes se encontrarem.",
  },
  {
    key: "knowledgeEmbeddingEnabled",
    label: "Embeddings da Base de Conhecimento",
    kind: "boolean",
    group: "features",
    description:
      "Vazio herda do cliente e, na ausência dele, do servidor (padrão: ligado). Desligar para de re-chunkar artigos e de gerar embeddings neste site; o gate é de AGENDAMENTO no Quartz, então é preciso reiniciar a API para reavaliar.",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
  },
  {
    key: "updatesTabEnabled",
    label: "Aba de Atualizações de Aplicativos",
    kind: "boolean",
    group: "features",
    description:
      "Exibe no agent a aba que lista os aplicativos com atualização pendente (winget/chocolatey) e permite aplicá-las. Vazio herda do cliente/servidor.",
  },
  // ── Kill switches herdáveis (GRUPO A da auditoria appsettings × UI) ───────
  // Vazio (null) = herda do cliente e, na ausência dele, do servidor. Os campos
  // que NÃO herdam (openTelemetryEnabled, realtimeContractMode,
  // migrationsRunOnStartup) ficam só no escopo do servidor.
  {
    key: "departmentAuthShadowMode",
    label: "Autorização por departamento — Observação / Ativo",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Observação (ligado) = registra no log quem SERIA barrado, sem bloquear ninguém. Ativo (desligado) = somente o time do departamento trata o chamado; quem abriu só encerra o próprio. LIGAR SEM POPULAR OS TIMES BLOQUEIA TODOS que não têm acesso global. Vazio herda do cliente/servidor (padrão: Observação). Exige reiniciar a API.",
  },
  {
    key: "pushEnabled",
    label: "Notificações Push (Web Push)",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Envia notificações push para os navegadores inscritos. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  {
    key: "wingetCatalogEnabled",
    label: "Catálogo Winget",
    kind: "boolean",
    defaultValue: "true",
    group: "features",
    description:
      "Habilita a sincronização do catálogo de aplicativos winget. Desligado, a Loja de Aplicativos deste site deixa de receber pacotes novos. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessEnabled",
    label: "Acesso Remoto",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Liga o acesso remoto (área de trabalho, terminal, arquivos, proxy e processos). Desligar derruba o acesso remoto de toda a frota DESTE site. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingEnabled",
    label: "Gravação das Sessões Remotas",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Grava as sessões de acesso remoto para auditoria. Desligado, novas sessões deste site não são gravadas. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  {
    key: "remoteAccessRecordingAutoDeleteExpired",
    label: "Excluir Gravações Expiradas Automaticamente",
    kind: "boolean",
    defaultValue: "true",
    group: "remoteAccess",
    description:
      "Remove as gravações de sessão após o período de retenção. Desligado, as gravações vencidas continuam armazenadas e o consumo de disco cresce sem limite. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  {
    key: "automaticLoggingEnabled",
    label: "Log Automático",
    kind: "boolean",
    defaultValue: "true",
    group: "advanced",
    description:
      "Coleta automática de logs pelos agentes. Desligado, os agentes deste site param de enviar logs. Vazio herda do cliente/servidor. Exige reiniciar a API.",
  },
  ...REMOTE_CONSENT_FIELDS,
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "ApiKey e write-only: mantenha ausente no JSON e inclua somente quando quiser trocar a chave.",
  },
  {
    key: "maintenanceWindowJson",
    label: "Janela de Manutenção (Reboot/Patches)",
    kind: "json",
    group: "policy",
    description: "Override da janela de manutenção do servidor; vazia = herda.",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos bloqueados neste site para impedir sobrescritas em níveis inferiores.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    unit: "horas",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
  },
  {
    key: "agentHomeTab",
    label: "Página Inicial do Agent",
    kind: "select",
    group: "agent",
    options: AGENT_HOME_TAB_OPTIONS,
    description: AGENT_HOME_TAB_DESCRIPTION,
  },
  {
    key: "timezone",
    label: "Fuso Horário",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "location",
    label: "Localização",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "contactPerson",
    label: "Contato Responsável",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "contactEmail",
    label: "Email de Contato",
    kind: "string",
    group: "siteProfile",
  },
];

export function formatFieldValue(
  value: ConfigurationValue | undefined | null,
  fieldKey?: string,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (fieldKey === AI_INTEGRATION_FIELD_KEY) {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        const sanitized = sanitizeAiIntegrationObject(parsed);
        if (sanitized) {
          return JSON.stringify(sanitized, null, 2);
        }
      } catch {
        return value;
      }
    }

    const sanitized = sanitizeAiIntegrationObject(value);
    if (sanitized) {
      return JSON.stringify(sanitized, null, 2);
    }
  }

  if (typeof value === "string") {
    if (fieldKey === "appStorePolicy") {
      if (value === "Disabled") return "0";
      if (value === "PreApproved") return "1";
      if (value === "All") return "2";
    }
    if (fieldKey === "remoteConsentMode") {
      if (value === "0") return "Off";
      if (value === "1") return "NotifyOnly";
      if (value === "2") return "Prompt";
    }
    if (fieldKey === "remoteConsentTimeoutAction") {
      if (value === "0") return "Deny";
      if (value === "1") return "Approve";
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    if (fieldKey === "appStorePolicy") {
      return String(value);
    }
    if (fieldKey === "remoteConsentMode") {
      return ["Off", "NotifyOnly", "Prompt"][value as number] ?? String(value);
    }
    if (fieldKey === "remoteConsentTimeoutAction") {
      return ["Deny", "Approve"][value as number] ?? String(value);
    }
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export function validateFieldValue(
  kind: EditableFieldKind,
  value: string,
  fieldKey?: string,
): string | true {
  const trimmed = value.trim();

  if (kind === "string") {
    if (
      fieldKey === "remoteConsentMessage" ||
      fieldKey === "remoteConsentBannerText"
    ) {
      return value.length <= 500
        ? true
        : "Máximo de 500 caracteres para o texto de consentimento";
    }

    if (
      fieldKey === "natsServerHostInternal" ||
      fieldKey === "natsServerHostExternal"
    ) {
      if (trimmed.length === 0) {
        return true;
      }

      return isValidHostOnly(trimmed)
        ? true
        : "Informe apenas host ou IP, sem porta e sem protocolo";
    }
    return true;
  }

  if (kind === "boolean") {
    return trimmed === "true" || trimmed === "false"
      ? true
      : "Use true ou false";
  }

  if (kind === "number") {
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      return "Informe um número valido";
    }

    const numeric = Number(trimmed);
    const ranges: Record<string, [number, number]> = {
      inventoryIntervalHours: [1, 168],
      // Limite validado no backend (ConfigurationService.CheckRange) para o
      // prompt de consentimento de acesso remoto.
      remoteConsentTimeoutSeconds: [10, 600],
      agentHeartbeatIntervalSeconds: [10, 3600],
      agentOnlineGraceSeconds: [60, 3600],
      objectStorageUrlTtlHours: [1, 168],
      natsAgentJwtTtlMinutes: [15, 4320],
      natsUserJwtTtlMinutes: [15, 4320],
    };

    const fieldRange = fieldKey ? ranges[fieldKey] : undefined;
    if (fieldRange && (numeric < fieldRange[0] || numeric > fieldRange[1])) {
      return `Valor fora da faixa permitida (${fieldRange[0]}..${fieldRange[1]})`;
    }

    // A API desserializa RemoteConsentTimeoutSeconds como int?: 15.5 gera 400.
    if (fieldKey === "remoteConsentTimeoutSeconds" && !Number.isInteger(numeric)) {
      return "Use um número inteiro de segundos";
    }

    return true;
  }

  if (kind === "json") {
    try {
      const parsed = JSON.parse(trimmed || "{}");
      if (fieldKey === "lockedFieldsJson") {
        if (
          !Array.isArray(parsed) ||
          !parsed.every((item) => typeof item === "string")
        ) {
          return "lockedFieldsJson deve ser um JSON array de strings";
        }
      }

      if (fieldKey === "reportingSettingsJson") {
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return "reportingSettingsJson deve ser um objeto JSON";
        }

        const dbRetention = Number(
          (parsed as Record<string, unknown>).databaseRetentionDays,
        );
        const fileRetention = Number(
          (parsed as Record<string, unknown>).fileRetentionDays,
        );

        if (
          Number.isNaN(dbRetention) ||
          Number.isNaN(fileRetention) ||
          dbRetention < 1 ||
          fileRetention < 1
        ) {
          return "Reporting requer databaseRetentionDays e fileRetentionDays >= 1";
        }
      }

      if (fieldKey === "ticketAttachmentSettingsJson") {
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return "ticketAttachmentSettingsJson deve ser um objeto JSON";
        }

        const payload = parsed as Record<string, unknown>;
        const maxFileSizeBytes = Number(payload.maxFileSizeBytes);
        // Campo novo (limite do repositório/aba Anexos). Ausente = payload
        // legado: mantém a retrocompatibilidade e não exige o campo.
        const hasMaxLargeFileSize =
          payload.maxLargeFileSizeBytes !== undefined &&
          payload.maxLargeFileSizeBytes !== null &&
          payload.maxLargeFileSizeBytes !== "";
        const maxLargeFileSizeBytes = Number(payload.maxLargeFileSizeBytes);
        const presignedTtl = Number(payload.presignedUploadUrlTtlMinutes);
        const allowedContentTypes = payload.allowedContentTypes;

        if (
          Number.isNaN(maxFileSizeBytes) ||
          maxFileSizeBytes <= 0 ||
          maxFileSizeBytes > 1024 * 1024 * 1024
        ) {
          return "MaxFileSizeBytes deve ser maior que 0 e menor ou igual a 1GB";
        }

        if (hasMaxLargeFileSize) {
          if (
            Number.isNaN(maxLargeFileSizeBytes) ||
            maxLargeFileSizeBytes <= 0 ||
            maxLargeFileSizeBytes > 10 * 1024 * 1024 * 1024
          ) {
            return "MaxLargeFileSizeBytes deve ser maior que 0 e menor ou igual a 10GB";
          }

          if (maxLargeFileSizeBytes < maxFileSizeBytes) {
            return "MaxLargeFileSizeBytes deve ser maior ou igual a MaxFileSizeBytes";
          }
        }

        if (Number.isNaN(presignedTtl) || presignedTtl < 1 || presignedTtl > 120) {
          return "PresignedUploadUrlTtlMinutes deve estar entre 1 e 120";
        }

        if (
          !Array.isArray(allowedContentTypes) ||
          allowedContentTypes.length === 0 ||
          !allowedContentTypes.every((item) => typeof item === "string")
        ) {
          return "AllowedContentTypes deve ser um array de strings não vazio";
        }
      }

      return true;
    } catch {
      return "JSON inválido";
    }
  }

  if (kind === "policy") {
    if (["0", "1", "2"].includes(trimmed)) {
      return true;
    }

    return "Selecione uma política válida: 0 (Desativado), 1 (Pré-aprovados) ou 2 (Todos)";
  }

  if (kind === "select") {
    // A lista válida é publicada pelo servidor (agentHomeTabOptions) e a
    // validação definitiva é dele; aqui só garantimos que algo foi escolhido.
    if (trimmed.length > 0) {
      return true;
    }

    return fieldKey === "realtimeContractMode"
      ? "Selecione o modo do contrato de realtime"
      : "Selecione uma aba para a página inicial do agent";
  }

  return true;
}

/**
 * Um campo só pode ser desenhado como switch (ligado/desligado) quando o kind é
 * boolean.
 *
 * O grupo "features" MISTURA toggles com blob JSON (SensorsSettingsJson): a
 * página roteava por GROUP em vez de KIND e desenhava o campo JSON como switch.
 * Ao alternar, o PATCH ia com `true` para uma propriedade que a API declara
 * como string — o backend chama JsonElement.GetString() em um valor True e
 * devolve 400 ("The requested operation requires an element of type 'String',
 * but the target element has type 'True'.").
 */
export function isBooleanToggleField(field: EditableField): boolean {
  return field.kind === "boolean";
}

/**
 * Valor enviado no PATCH para um campo do formulário.
 *
 * As propriedades *Json do servidor são string e o backend chama
 * JsonElement.GetString(): um objeto até é aceito (vira GetRawText), mas um
 * booleano derruba a requisição com 400. Serializar no ponto de MONTAGEM do
 * payload garante o tipo que a API espera sem mexer em parseFieldValue — que
 * continua devolvendo o valor já parseado (objeto) para o formulário, conforme
 * os testes de parseFieldValue("json", "").
 *
 * Strings não são re-serializadas: lockedFieldsJson já sai como "[]" de
 * parseFieldValue e re-encodar gravaria a string literal "\"[]\"".
 */
export function toPatchPayloadValue(
  kind: EditableFieldKind,
  value: ConfigurationValue,
): ConfigurationValue {
  if (kind !== "json") {
    return value;
  }

  if (value === null || value === undefined || typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function parseFieldValue(
  kind: EditableFieldKind,
  value: string,
  fieldKey?: string,
): ConfigurationValue {
  const trimmed = value.trim();

  if (kind === "string") {
    if (
      fieldKey === "natsServerHostInternal" ||
      fieldKey === "natsServerHostExternal"
    ) {
      return trimmed;
    }
    return value;
  }

  if (kind === "boolean") {
    return trimmed === "true";
  }

  if (kind === "number") {
    return Number(trimmed);
  }

  if (kind === "json") {
    if (fieldKey === "lockedFieldsJson") {
      return trimmed || "[]";
    }

    const parsed = JSON.parse(trimmed || "{}");

    if (
      fieldKey === AI_INTEGRATION_FIELD_KEY &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      const aiPayload = { ...(parsed as Record<string, unknown>) };
      const apiKeyValue = aiPayload.apiKey ?? aiPayload.ApiKey;

      if (typeof apiKeyValue !== "string" || apiKeyValue.trim().length === 0) {
        delete aiPayload.apiKey;
        delete aiPayload.ApiKey;
      }

      return aiPayload;
    }

    return parsed;
  }

  if (kind === "policy") {
    return Number(trimmed);
  }

  if (kind === "select") {
    // Round-trip simétrico com formatFieldValue: selects com armazenamento
    // NUMÉRICO no backend (RemoteConsentMode/TimeoutAction, serializados como
    // 0/1/2) aceitam o rótulo do select ("Off", "Deny"...) e devolvem o número
    // que a API guarda. agentHomeTab e demais selects ficam como string.
    const numericSelects: Record<string, Record<string, number>> = {
      remoteConsentMode: { Off: 0, NotifyOnly: 1, Prompt: 2 },
      remoteConsentTimeoutAction: { Deny: 0, Approve: 1 },
    };
    const names = fieldKey ? numericSelects[fieldKey] : undefined;
    if (names) {
      // Object.hasOwn evita a prototype chain: "constructor"/"toString" como
      // texto do usuário devolveriam uma FUNÇÃO como valor parseado.
      if (Object.hasOwn(names, trimmed)) {
        return names[trimmed];
      }
      // Já veio numérico (em string): devolve como número quando válido.
      const numeric = Number(trimmed);
      if (Object.values(names).includes(numeric)) {
        return numeric;
      }
    }
    return trimmed;
  }

  return value;
}

export function getEffectiveValue(
  effective: ResolvedConfiguration | undefined,
  fieldKey: string,
): ConfigurationValue | null | undefined {
  if (!effective) {
    return undefined;
  }

  if (fieldKey === "aiIntegrationSettingsJson") {
    return (
      sanitizeAiIntegrationObject(effective.aiIntegration) ??
      effective.aiIntegration
    );
  }

  return effective[fieldKey] as ConfigurationValue | null | undefined;
}

export function resolveClientOrigin(
  local: ClientConfiguration | undefined,
  fieldKey: string,
): ConfigurationOrigin {
  const value = local?.[fieldKey] as ConfigurationValue | null | undefined;
  return value === null || value === undefined ? "Server" : "Client";
}

export function resolveSiteOrigin(
  siteLocal: SiteConfiguration | ResolvedConfiguration | undefined,
  clientLocal: ClientConfiguration | undefined,
  fieldKey: string,
): ConfigurationOrigin {
  const siteValue = siteLocal?.[fieldKey] as
    | ConfigurationValue
    | null
    | undefined;
  if (siteValue !== null && siteValue !== undefined) {
    return "Site";
  }

  const clientValue = clientLocal?.[fieldKey] as
    | ConfigurationValue
    | null
    | undefined;
  if (clientValue !== null && clientValue !== undefined) {
    return "Client";
  }

  return "Server";
}

/**
 * Interpreta um valor de flag de configuração como booleano.
 * Valores do formulário são strings (buildServerDraft -> Record<string,string>),
 * então apenas boolean true e a string exata "true" significam ligado.
 */
export function isConfigFlagOn(
  value: ConfigurationValue | string | number | boolean | null | undefined,
): boolean {
  return value === true || value === "true";
}

/**
 * Default de um campo quando o servidor ainda não devolveu valor.
 *
 * Para "select" o default é a PRIMEIRA opção declarada pelo próprio campo, não
 * uma constante global: com a constante antiga ("status", default de
 * agentHomeTab) qualquer outro select — como realtimeContractMode — nascia com
 * um valor inválido e o PATCH era recusado. Sem options declaradas, cai no
 * default histórico de agentHomeTab para não mudar o comportamento existente.
 */
export function fieldDefault(
  kind: EditableFieldKind,
  field?: Pick<EditableField, "key" | "options" | "defaultValue">,
): string {
  // Default declarado pelo próprio campo vence: é o que espelha o appsettings.
  if (field?.defaultValue) return field.defaultValue;
  if (kind === "boolean") return "false";
  if (kind === "number") return "0";
  if (kind === "json") return "{}";
  // PreApproved: espelha o default de ServerConfiguration.AppStorePolicy no backend.
  if (kind === "policy") return "1";
  if (kind === "select") {
    const firstOption = field?.options?.[0]?.value;
    if (firstOption) return firstOption;
    // status: espelha o default de ServerConfiguration.AgentHomeTab no backend.
    return "status";
  }
  return "";
}

export function buildServerDraft(
  source: ServerConfiguration | undefined,
  fields: EditableField[],
): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of fields) {
    const raw = formatFieldValue(
      source?.[field.key] as ConfigurationValue | undefined,
      field.key,
    );
    draft[field.key] = raw !== "" ? raw : fieldDefault(field.kind, field);
  }
  return draft;
}

export function buildInheritedState(
  source: Record<string, ConfigurationValue | null | undefined> | undefined,
  fields: EditableField[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const field of fields) {
    const value = source?.[field.key];
    result[field.key] = value === null || value === undefined;
  }
  return result;
}

export type LockScope = "server" | "client" | "site";

export function getFieldMetadata(
  metadataFields: Record<string, ConfigurationFieldMetadata> | undefined,
  fieldKey: string,
): ConfigurationFieldMetadata | undefined {
  return (
    metadataFields?.[fieldKey] ??
    metadataFields?.[toCanonicalConfigurationFieldName(fieldKey)]
  );
}

export function canEditFieldAtScope(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: LockScope,
): boolean {
  if (!fieldMeta) {
    return true;
  }

  if (scope === "server") {
    return true;
  }

  if (scope === "client") {
    return fieldMeta.canEditAtClient !== false;
  }

  return fieldMeta.canEditAtSite !== false;
}

export function getLockOwnerForScope(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: LockScope,
): string | null {
  if (!fieldMeta) {
    return null;
  }

  if (scope === "client") {
    return fieldMeta.lockOwnerForClient ?? null;
  }

  if (scope === "site") {
    return fieldMeta.lockOwnerForSite ?? null;
  }

  return null;
}

export function isInheritedBySourceType(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: Exclude<LockScope, "server">,
): boolean {
  const sourceType = fieldMeta?.sourceType;

  if (sourceType === undefined || sourceType === null) {
    return true;
  }

  if (scope === "client") {
    return sourceType !== 3;
  }

  return sourceType !== 4;
}

function toCanonicalConfigurationFieldName(value: string): string {
  if (!value) {
    return value;
  }

  if (
    value === "aiIntegrationSettingsJson" ||
    value === "AiIntegrationSettingsJson"
  ) {
    return "AIIntegrationSettingsJson";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
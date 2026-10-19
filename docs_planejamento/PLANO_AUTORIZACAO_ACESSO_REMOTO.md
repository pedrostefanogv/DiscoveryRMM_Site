# Autorização de acesso remoto — console

## UX
- Ao iniciar a aba Tela, se a resposta tiver `consentRequired=true` e
  `consentStatus=pending`, o console **não** busca credenciais.
- Overlay `RemoteConsentNotice` (orientado ao SOLICITANTE): "Aguardando o
  usuário remoto autorizar o acesso", quem solicitou, a **ação padrão da
  política** no timeout (acesso PERMITIDO ou NEGADO) e um **contador visual**
  (anel que drena até o deadline) — sem número de segundos na tela. Cancelar
  envia stop da sessão.
- Campos usados no overlay: `consentOperator` e `consentTimeoutAction`
  (retornados pelo start; em reconexão, deadline/política vêm do endpoint de
  status).
- Polling de `GET /remote-sessions/{agentId}/{sessionId}/consent` a cada 1s.
- `granted` → credenciais NATS + viewer; `denied/timeout` → erro claro e retry.
- Terminal/arquivos/processos/proxy seguem sem prompt/banner.

## Configuração
- Campos `remoteConsent*` nas páginas Server/Client/Site (grupo `policy`).
- Página `/settings/remote-consent`: overrides por usuário/grupo e preview da
  política efetiva (origem por campo).

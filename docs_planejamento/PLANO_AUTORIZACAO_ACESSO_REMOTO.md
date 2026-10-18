# Autorização de acesso remoto — console

## UX
- Ao iniciar a aba Tela, se a resposta tiver `consentRequired=true` e
  `consentStatus=pending`, o console **não** busca credenciais.
- Overlay `RemoteConsentNotice`: mensagem + contagem + cancelar.
- Polling de `GET /remote-sessions/{agentId}/{sessionId}/consent` a cada 1s.
- `granted` → credenciais NATS + viewer; `denied/timeout` → erro claro e retry.
- Terminal/arquivos/processos/proxy seguem sem prompt/banner.

## Configuração
- Campos `remoteConsent*` nas páginas Server/Client/Site (grupo `policy`).
- Página `/settings/remote-consent`: overrides por usuário/grupo e preview da
  política efetiva (origem por campo).

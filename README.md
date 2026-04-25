# Discovery RMM Web Console

[![Default Branch](https://img.shields.io/badge/default%20branch-release-16a34a?style=for-the-badge&logo=git)](https://github.com/pedrostefanogv/DiscoveryRMM_Site/tree/release)
[![Frontend Repository](https://img.shields.io/badge/frontend-DiscoveryRMM__Site-0f172a?style=for-the-badge&logo=react&logoColor=white)](https://github.com/pedrostefanogv/DiscoveryRMM_Site)
[![Backend Repository](https://img.shields.io/badge/backend-DiscoveryRMM__API-2563eb?style=for-the-badge&logo=github)](https://github.com/pedrostefanogv/DiscoveryRMM_API)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 7](https://img.shields.io/badge/Vite-7-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![TanStack Query 5](https://img.shields.io/badge/TanStack%20Query-5-ff4154?style=for-the-badge&logo=reactquery&logoColor=white)](https://tanstack.com/query/latest)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS-4-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

Frontend web do ecossistema Discovery RMM. Este repositório concentra a interface operacional e administrativa usada para monitoramento, automação, inventário, tickets, deploy, relatórios, configurações e identidade.

O backend e os contratos de API associados ficam no repositório do servidor:

- API/Server: [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API)

## Visão Geral

O projeto foi estruturado como uma aplicação SPA em React com carregamento lazy das rotas, autenticação protegida, atualização em tempo real e módulos de operação separados por domínio. A aplicação atende fluxos de uso administrativos e técnicos, incluindo:

- Dashboard operacional com indicadores e status em tempo real.
- Gestão de clientes, sites e agentes.
- Sessões de depuração remota e operações relacionadas a agentes.
- Tickets, alertas, SLA, campos customizados e views salvas.
- Automação, tarefas, auditoria e operações.
- Inventário de software, catálogo/store e ações relacionadas.
- Tokens de deploy, knowledge base e relatórios.
- Configurações de servidor, cliente, site, IAM, branding e workflows.
- Autenticação com MFA, WebAuthn/FIDO2 e controle por permissões.

## Stack Técnica

- React 19 para a interface.
- TypeScript 6 para tipagem e segurança de contrato.
- Vite 7 para desenvolvimento e build.
- TanStack Query 5 para fetching, cache e invalidação.
- React Router 7 para composição de rotas.
- React Hook Form + Zod para formulários e validação.
- Tailwind CSS 4, Lucide React e Recharts para UI e visualização.
- SignalR e NATS para recursos de realtime.

## Integração Com o Servidor

Este frontend não é um produto isolado. Para executar o sistema completo, o servidor/API precisa estar disponível e compatível com os endpoints consumidos pela camada em [src/api](src/api).

Referência principal:

- Repositório do servidor: [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API)

Variáveis de ambiente previstas no frontend:

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL base da API HTTP usada pelo frontend. |
| `VITE_REALTIME_PROVIDER` | Define o modo de realtime: `signalr`, `nats` ou `both`. |
| `VITE_NATS_URL` | Endpoint de NATS/WebSocket usado pelo browser quando habilitado. |
| `VITE_NATS_ENABLED` | Liga ou desliga o suporte a NATS no browser. |
| `VITE_AGENT_OFFLINE_FALLBACK_MS` | Janela de fallback para considerar agentes offline. |

Use o arquivo [.env.example](.env.example) como base para configuração local.

## Execução Local

### Pré-requisitos

- Node.js atual com suporte ao ecossistema Vite moderno.
- npm.
- DiscoveryRMM_API em execução e acessível pela URL configurada.

### Passos

1. Instale as dependências:

```bash
npm install
```

2. Crie seu arquivo de ambiente a partir do exemplo e ajuste as URLs locais.

3. Inicie o modo de desenvolvimento:

```bash
npm run dev
```

4. Para checagem de tipos:

```bash
npm run typecheck
```

5. Para gerar build:

```bash
npm run build
```

## Estrutura Funcional

- `src/api`: camada de acesso a endpoints e tipos compartilhados.
- `src/auth`: contexto de autenticação, guards, JWT, MFA e WebAuthn.
- `src/components`: componentes reutilizáveis e layout.
- `src/hooks`: hooks por domínio de negócio.
- `src/pages`: telas e módulos operacionais.
- `src/services`: serviços auxiliares.
- `src/utils`: helpers, normalizações e utilitários de configuração.
- `scripts`: rotinas de build e verificação.

## Estratégia de Branches

O repositório foi organizado com o seguinte modelo principal:

- `release`: branch padrão e principal para entregas estáveis.
- `LTS`: trilha de manutenção estável de longo prazo.
- `beta`: trilha intermediária para validação antes de promover para release.
- `dev`: branch de desenvolvimento com commits diretos permitidos.

Política planejada de colaboração:

- `release`, `beta` e `LTS`: mudanças via Pull Request.
- `dev`: branch aberta para evolução contínua e integração.
- Features, hotfixes e branches temporárias devem derivar de `dev` antes da promoção para trilhas estáveis.

## Observações de Publicação

- O histórico público deste repositório foi reinicializado para publicação segura.
- O arquivo de exemplo de ambiente foi saneado para evitar exposição de endpoints internos.
- Configurações sensíveis reais devem permanecer fora do Git e fora de arquivos versionados.

## Project Data (EN-US)

| Field | Value |
| --- | --- |
| Project name | Discovery RMM Web Console |
| Repository role | Frontend/admin console |
| Backend/API repository | [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API) |
| Default branch | `release` |
| Main branches | `release`, `LTS`, `beta`, `dev` |
| Branching flow | Feature and hotfix branches should start from `dev` and be promoted by merge |
| Frontend stack | React 19, TypeScript 6, Vite 7 |
| Data layer | TanStack Query 5 |
| Forms and validation | React Hook Form, Zod |
| Realtime transport | SignalR and NATS |
| Key domains | Agents, clients/sites, tickets/SLA, automation, software, reports, IAM/settings |
| Authentication features | Session auth, MFA, WebAuthn/FIDO2 |

### EN-US Summary

This repository contains the web frontend for Discovery RMM. It provides the operational and administrative console used to manage agents, customers, sites, ticketing flows, automation, software inventory, reports, deployment tokens, configuration surfaces, and identity/authorization workflows.

The server-side implementation lives in the companion repository [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API). This frontend expects a compatible API/backend environment and should be considered part of the same platform rather than a standalone product.
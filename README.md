# Discovery RMM Web Console

[![Default Branch](https://img.shields.io/badge/default%20branch-release-16a34a?style=for-the-badge&logo=git)](https://github.com/pedrostefanogv/DiscoveryRMM_Site/tree/release)
[![Frontend Repository](https://img.shields.io/badge/frontend-DiscoveryRMM__Site-0f172a?style=for-the-badge&logo=react&logoColor=white)](https://github.com/pedrostefanogv/DiscoveryRMM_Site)
[![Backend Repository](https://img.shields.io/badge/backend-DiscoveryRMM__API-2563eb?style=for-the-badge&logo=github)](https://github.com/pedrostefanogv/DiscoveryRMM_API)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 7](https://img.shields.io/badge/Vite-7-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![TanStack Query 5](https://img.shields.io/badge/TanStack%20Query-5-ff4154?style=for-the-badge&logo=reactquery&logoColor=white)](https://tanstack.com/query/latest)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS-4-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

PT-BR: Frontend web do ecossistema Discovery RMM. Este repositório concentra a interface operacional e administrativa usada para monitoramento, automação, inventário, tickets, deploy, relatórios, configurações e identidade.

EN-US: Web frontend for the Discovery RMM ecosystem. This repository contains the operational and administrative console used for monitoring, automation, inventory, ticketing, deployment, reporting, configuration, and identity workflows.

PT-BR: O backend e os contratos de API associados ficam no repositório do servidor.

EN-US: The backend and the related API contracts live in the server repository.

- API/Server: [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API)

## Aviso / Notice

PT-BR: Este projeto foi desenvolvido com apoio de vibecoding e uso de IA como assistente de programação em partes do processo, incluindo exploração de alternativas, aceleração de implementação, revisão de documentação e suporte operacional. Isso não elimina revisão humana, validação técnica e decisões de engenharia.

EN-US: This project was developed with vibecoding practices and AI-assisted programming support in parts of the workflow, including exploring alternatives, accelerating implementation, reviewing documentation, and operational support. This does not replace human review, technical validation, or engineering decision-making.

## Visao Geral / Overview

PT-BR: O projeto foi estruturado como uma aplicacao SPA em React com carregamento lazy das rotas, autenticacao protegida, atualizacao em tempo real e modulos de operacao separados por dominio. A aplicacao atende fluxos administrativos e tecnicos, incluindo:

EN-US: The project is structured as a React SPA with lazy-loaded routes, protected authentication, realtime updates, and domain-oriented operational modules. The application serves both administrative and technical workflows, including:

- PT-BR: Dashboard operacional com indicadores e status em tempo real.
- EN-US: Operational dashboard with live indicators and status.
- PT-BR: Gestao de clientes, sites e agentes.
- EN-US: Client, site, and agent management.
- PT-BR: Sessoes de depuracao remota e operacoes relacionadas a agentes.
- EN-US: Remote debugging sessions and agent-related operations.
- PT-BR: Tickets, alertas, SLA, campos customizados e views salvas.
- EN-US: Tickets, alerts, SLA, custom fields, and saved views.
- PT-BR: Automacao, tarefas, auditoria e operacoes.
- EN-US: Automation, tasks, audit, and operational flows.
- PT-BR: Inventario de software, catalogo/store e acoes relacionadas.
- EN-US: Software inventory, catalog/store, and related actions.
- PT-BR: Tokens de deploy, knowledge base e relatorios.
- EN-US: Deployment tokens, knowledge base, and reports.
- PT-BR: Configuracoes de servidor, cliente, site, IAM, branding e workflows.
- EN-US: Server, client, site, IAM, branding, and workflow configuration.
- PT-BR: Autenticacao com MFA, WebAuthn/FIDO2 e controle por permissoes.
- EN-US: Authentication with MFA, WebAuthn/FIDO2, and permission-based access control.

## Stack Tecnica / Technical Stack

- PT-BR: React 19 para a interface.
- EN-US: React 19 for the user interface.
- PT-BR: TypeScript 6 para tipagem e seguranca de contrato.
- EN-US: TypeScript 6 for typing and contract safety.
- PT-BR: Vite 7 para desenvolvimento e build.
- EN-US: Vite 7 for development and builds.
- PT-BR: TanStack Query 5 para fetching, cache e invalidacao.
- EN-US: TanStack Query 5 for fetching, caching, and invalidation.
- PT-BR: React Router 7 para composicao de rotas.
- EN-US: React Router 7 for route composition.
- PT-BR: React Hook Form + Zod para formularios e validacao.
- EN-US: React Hook Form + Zod for forms and validation.
- PT-BR: Tailwind CSS 4, Lucide React e Recharts para UI e visualizacao.
- EN-US: Tailwind CSS 4, Lucide React, and Recharts for UI and visualization.
- PT-BR: NATS para recursos de realtime.
- EN-US: NATS for realtime capabilities.

## Integracao Com o Servidor / Server Integration

PT-BR: Este frontend nao e um produto isolado. Para executar o sistema completo, o servidor/API precisa estar disponivel e compativel com os endpoints consumidos pela camada em [src/api](src/api).

EN-US: This frontend is not a standalone product. To run the full system, the server/API must be available and compatible with the endpoints consumed by the layer in [src/api](src/api).

PT-BR: Referencia principal.

EN-US: Main reference.

- Repositorio do servidor / Server repository: [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API)

PT-BR: Variaveis de ambiente previstas no frontend.

EN-US: Expected frontend environment variables.

| Variavel / Variable | PT-BR | EN-US |
| --- | --- | --- |
| `VITE_API_URL` | URL base da API HTTP usada pelo frontend. | Base URL of the HTTP API used by the frontend. |
| `VITE_NATS_URL` | Endpoint de NATS/WebSocket usado pelo browser quando habilitado. | NATS/WebSocket endpoint used by the browser when enabled. |
| `VITE_NATS_ENABLED` | Liga ou desliga o suporte a NATS no browser. | Enables or disables NATS support in the browser. |
| `VITE_NATS_NOTIFICATIONS_SUBJECT_TEMPLATE` | Template opcional de subject NATS para notificacoes em tempo real (`{userId}` e `{topic}`). | Optional NATS subject template for realtime notifications (`{userId}` and `{topic}`). |
| `VITE_AGENT_OFFLINE_FALLBACK_MS` | Janela de fallback para considerar agentes offline. | Fallback window used to consider agents offline. |

PT-BR: Use o arquivo [.env.example](.env.example) como base para configuracao local.

EN-US: Use [.env.example](.env.example) as the baseline for local configuration.

## Execucao Local / Local Setup

### Pre-requisitos / Prerequisites

- PT-BR: Node.js atual com suporte ao ecossistema Vite moderno.
- EN-US: A current Node.js version with support for the modern Vite ecosystem.
- PT-BR: npm.
- EN-US: npm.
- PT-BR: DiscoveryRMM_API em execucao e acessivel pela URL configurada.
- EN-US: DiscoveryRMM_API running and reachable through the configured URL.

### Passos / Steps

1. PT-BR: Instale as dependencias.
	EN-US: Install the dependencies.

```bash
npm install
```

2. PT-BR: Crie seu arquivo de ambiente a partir do exemplo e ajuste as URLs locais.
	EN-US: Create your environment file from the example and adjust local URLs.

3. PT-BR: Inicie o modo de desenvolvimento.
	EN-US: Start development mode.

```bash
npm run dev
```

4. PT-BR: Para checagem de tipos.
	EN-US: For type checking.

```bash
npm run typecheck
```

5. PT-BR: Para gerar build.
	EN-US: To generate a production build.

```bash
npm run build
```

## Estrutura Funcional / Functional Structure

- `src/api`: PT-BR: camada de acesso a endpoints e tipos compartilhados. EN-US: endpoint access layer and shared types.
- `src/auth`: PT-BR: contexto de autenticacao, guards, JWT, MFA e WebAuthn. EN-US: authentication context, guards, JWT, MFA, and WebAuthn.
- `src/components`: PT-BR: componentes reutilizaveis e layout. EN-US: reusable components and layout.
- `src/hooks`: PT-BR: hooks por dominio de negocio. EN-US: business-domain hooks.
- `src/pages`: PT-BR: telas e modulos operacionais. EN-US: screens and operational modules.
- `src/services`: PT-BR: servicos auxiliares. EN-US: supporting services.
- `src/utils`: PT-BR: helpers, normalizacoes e utilitarios de configuracao. EN-US: helpers, normalizations, and configuration utilities.
- `scripts`: PT-BR: rotinas de build e verificacao. EN-US: build and verification routines.

## Estrategia de Branches / Branch Strategy

PT-BR: O repositorio foi organizado com o seguinte modelo principal.

EN-US: The repository is organized around the following primary model.

- `release`: PT-BR: branch padrao e principal para entregas estaveis. EN-US: default and primary branch for stable deliveries.
- `LTS`: PT-BR: trilha de manutencao estavel de longo prazo. EN-US: long-term stable maintenance track.
- `beta`: PT-BR: trilha intermediaria para validacao antes de promover para release. EN-US: intermediate validation track before promoting to release.
- `dev`: PT-BR: branch de desenvolvimento com commits diretos permitidos. EN-US: development branch where direct commits are allowed.

PT-BR: Politica planejada de colaboracao.

EN-US: Planned collaboration policy.

- `release`, `beta` e `LTS`: PT-BR: mudancas via Pull Request. EN-US: changes through Pull Requests.
- `dev`: PT-BR: branch aberta para evolucao continua e integracao. EN-US: open branch for continuous evolution and integration.
- Features, hotfixes e branches temporarias: PT-BR: devem derivar de `dev` antes da promocao para trilhas estaveis. EN-US: must derive from `dev` before promotion into stable tracks.

## Observacoes de Publicacao / Publication Notes

- PT-BR: O historico publico deste repositorio foi reinicializado para publicacao segura.
- EN-US: The public history of this repository was reset for a safe publication.
- PT-BR: O arquivo de exemplo de ambiente foi saneado para evitar exposicao de endpoints internos.
- EN-US: The example environment file was sanitized to avoid exposing internal endpoints.
- PT-BR: Configuracoes sensiveis reais devem permanecer fora do Git e fora de arquivos versionados.
- EN-US: Real sensitive configuration must remain outside Git and outside versioned files.

## Dados do Projeto / Project Data

| Campo / Field | PT-BR | EN-US |
| --- | --- | --- |
| Nome do projeto / Project name | Discovery RMM Web Console | Discovery RMM Web Console |
| Papel do repositorio / Repository role | Frontend e console administrativo | Frontend and admin console |
| Repositorio da API / Backend/API repository | [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API) | [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API) |
| Branch padrao / Default branch | `release` | `release` |
| Branches principais / Main branches | `release`, `LTS`, `beta`, `dev` | `release`, `LTS`, `beta`, `dev` |
| Fluxo de branching / Branching flow | Features e hotfixes devem iniciar em `dev` e ser promovidos por merge | Feature and hotfix branches should start from `dev` and be promoted by merge |
| Stack de frontend / Frontend stack | React 19, TypeScript 6, Vite 7 | React 19, TypeScript 6, Vite 7 |
| Camada de dados / Data layer | TanStack Query 5 | TanStack Query 5 |
| Formularios e validacao / Forms and validation | React Hook Form, Zod | React Hook Form, Zod |
| Transporte realtime / Realtime transport | NATS | NATS |
| Dominios principais / Key domains | Agentes, clientes/sites, tickets/SLA, automacao, software, relatorios, IAM/configuracoes | Agents, clients/sites, tickets/SLA, automation, software, reports, IAM/settings |
| Recursos de autenticacao / Authentication features | Autenticacao de sessao, MFA, WebAuthn/FIDO2 | Session authentication, MFA, WebAuthn/FIDO2 |

## Resumo Final / Final Summary

PT-BR: Este repositorio contem o frontend web do Discovery RMM. Ele oferece o console operacional e administrativo usado para gerenciar agentes, clientes, sites, fluxos de tickets, automacao, inventario de software, relatorios, tokens de deploy, superficies de configuracao e fluxos de identidade/autorizacao.

EN-US: This repository contains the Discovery RMM web frontend. It provides the operational and administrative console used to manage agents, customers, sites, ticketing flows, automation, software inventory, reports, deployment tokens, configuration surfaces, and identity/authorization workflows.

PT-BR: A implementacao do lado do servidor fica no repositorio complementar [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API). Este frontend depende de um ambiente compativel de API/backend e deve ser entendido como parte da mesma plataforma, nao como um produto isolado.

EN-US: The server-side implementation lives in the companion repository [pedrostefanogv/DiscoveryRMM_API](https://github.com/pedrostefanogv/DiscoveryRMM_API). This frontend depends on a compatible API/backend environment and should be treated as part of the same platform rather than a standalone product.

## Licenca / License

PT-BR: O codigo autoral deste repositorio esta licenciado sob MIT. Dependencias de terceiros continuam sob suas respectivas licencas e devem ser observadas separadamente.

EN-US: The original code in this repository is licensed under MIT. Third-party dependencies remain under their own respective licenses and should be reviewed separately.

- [LICENSE](LICENSE)
import type { ReactNode } from 'react';
import { Icon, type MaterialSymbolName } from '@/components/ui';
import type { PowerActionKind, PowerActionRequest } from '@/api';

/**
 * Descrição declarativa de um verbo do comando genérico de energia
 * (`POST /agents/{id}/power`).
 *
 * É a FONTE ÚNICA do submenu "Energia": os três pontos de UI (lista de agentes,
 * menu de contexto compartilhado por Site/Client e menu "Ações" do detalhe)
 * iteram esta lista. Adicionar um verbo AQUI já o expõe em todos eles — desde
 * que o agent Windows e a API o implementem (ver `PowerActionVerbs` no
 * PowerAndUpdatePayloadValidator e `handleDirectPowerAction` no agent).
 */
export interface PowerActionVerb {
  /** Verbo enviado no campo `action` do payload. */
  kind: PowerActionKind;
  /** Rótulo do item de menu. */
  label: string;
  /** Glifo Material Symbols usado no item e no diálogo. */
  icon: MaterialSymbolName;
  /** Observação curta (tooltip) do item. */
  hint?: string;
  /** Traço separador antes do item (isola dos reiniciar/desligar básicos). */
  separatorBefore?: boolean;
  /** Item em vermelho (ação destrutiva). */
  danger?: boolean;
  /** Título do diálogo de confirmação. */
  confirmTitle: string;
  /** Rótulo do botão de confirmação. */
  confirmLabel: string;
  /** Corpo do diálogo de confirmação; recebe o nome de exibição do agente. */
  confirmMessage: (agentName: ReactNode) => ReactNode;
  /** Payload enviado à API. */
  request: PowerActionRequest;
  /** Mensagem de erro quando o despacho do comando falha. */
  errorMessage: string;
}

/**
 * Verbos de energia expostos no submenu. A ordem é a de exibição.
 *
 * `delaySeconds: 0` em todos: são comandos diretos do operador e o fluxo de
 * cada verbo é decidido pelo agent (sem o contador/adiamento do PSADT dos
 * restart/shutdown legados). `notifyUser: false` pelo mesmo motivo.
 */
export const POWER_ACTION_VERBS: PowerActionVerb[] = [
  {
    kind: 'restart-firmware',
    label: 'Reiniciar na BIOS/UEFI',
    icon: 'memory',
    separatorBefore: true,
    hint: 'reinicia direto no setup do firmware — somente UEFI; pode pedir a chave do BitLocker',
    confirmTitle: 'Reiniciar na BIOS/UEFI',
    confirmLabel: 'Reiniciar no firmware',
    confirmMessage: (agentName) => (
      <>
        O computador <span className="font-semibold">{agentName}</span> vai{' '}
        <span className="font-semibold">reiniciar imediatamente e entrar no setup do firmware (BIOS/UEFI)</span>.
        {' '}Se a máquina estiver em BIOS legado (Legacy/CSM), o agente recusa e o motivo aparece no histórico do comando.
        {' '}Aplicativos abertos serão fechados à força — <span className="font-semibold">salve o trabalho antes</span>.
        {' '}Alterações de firmware/boot podem exigir a <span className="font-semibold">chave de recuperação do BitLocker</span> no próximo boot.
      </>
    ),
    request: { action: 'restart-firmware', delaySeconds: 0, force: true, notifyUser: false, message: '' },
    errorMessage: 'Falha ao enviar o comando de reinício no firmware.',
  },
  {
    kind: 'restart-advanced',
    label: 'Reiniciar nas Opções Avançadas',
    icon: 'build',
    hint: 'reinicia no menu de Opções Avançadas de inicialização (WinRE) — modo de segurança e reparo; funciona também em BIOS legado',
    confirmTitle: 'Reiniciar nas Opções Avançadas',
    confirmLabel: 'Entrar nas Opções Avançadas',
    confirmMessage: (agentName) => (
      <>
        O computador <span className="font-semibold">{agentName}</span> vai{' '}
        <span className="font-semibold">reiniciar e entrar nas Opções Avançadas de inicialização</span>{' '}
        (menu do Windows Recovery Environment) — é por onde se chega ao modo de segurança e às
        ferramentas de reparo. O reinício é imediato e aplicativos abertos serão fechados à força:{' '}
        <span className="font-semibold">salve o trabalho antes</span>. Diferente do reinício no
        firmware, este modo <span className="font-semibold">também funciona em BIOS legado (Legacy/CSM)</span>.
      </>
    ),
    request: { action: 'restart-advanced', delaySeconds: 0, force: true, notifyUser: false, message: '' },
    errorMessage: 'Falha ao enviar o comando de reinício nas Opções Avançadas.',
  },
  {
    kind: 'lock',
    label: 'Bloquear sessão',
    icon: 'lock',
    separatorBefore: true,
    hint: 'bloqueia a sessão do usuário — reversível e sem perda de trabalho',
    confirmTitle: 'Bloquear sessão',
    confirmLabel: 'Bloquear agora',
    confirmMessage: (agentName) => (
      <>
        A sessão do usuário em <span className="font-semibold">{agentName}</span> será{' '}
        <span className="font-semibold">bloqueada imediatamente</span>. O bloqueio é reversível — o
        usuário volta digitando a senha — e <span className="font-semibold">nada é perdido</span>.
        Se não houver sessão interativa ativa, o agente devolve uma falha informativa no histórico.
      </>
    ),
    request: { action: 'lock', delaySeconds: 0, force: false, notifyUser: false, message: '' },
    errorMessage: 'Falha ao enviar o comando de bloqueio de sessão.',
  },
];

/** Ícone de um verbo com o tamanho padrão dos itens de menu. */
export function powerVerbIcon(verb: PowerActionVerb, className = 'h-4 w-4'): ReactNode {
  return <Icon name={verb.icon} className={className} />;
}

/** Busca um verbo pelo `kind`. Lança se o verbo não existir (erro de programação). */
export function getPowerActionVerb(kind: PowerActionKind): PowerActionVerb {
  const verb = POWER_ACTION_VERBS.find((candidate) => candidate.kind === kind);
  if (!verb) throw new Error(`verbo de energia desconhecido: ${kind}`);
  return verb;
}


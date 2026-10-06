import {
  buildViewerRemoteControlEnvelope,
  type RemoteSessionControlEnvelope,
} from '@/api/remoteSessionControl';

/**
 * Bloqueio da entrada (teclado/mouse) da MÁQUINA REMOTA — "KVM input lock".
 *
 * O operador trava a entrada do usuário local enquanto trabalha; o agent aplica
 * o bloqueio e mantém o OPERADOR controlando (SendInput continua passando). O
 * agent é a fonte de verdade do estado e o publica em inputLockChanged; o
 * viewer consulta (query) ao conectar e reflete o que o agent responder.
 *
 * FAIL-SAFE: o estado NUNCA é assumido localmente — se o agent liberar sozinho
 * (lease expirado, sessão encerrada, falha ao bloquear), o viewer volta para
 * "destravado" ao receber o próximo inputLockChanged.
 */

/** Lease do bloqueio renovado pelos pings da liveness (agent renova a cada frame). */
export const INPUT_LOCK_LEASE_SECONDS = 60;

export interface InputLockChangedState {
  locked: boolean;
  method: string;
  reason: string;
  leaseRemainingSeconds: number;
}

/** Envelope do comando de travar/destravar. */
export function buildInputLockCommand(
  sessionId: string,
  sequence: number,
  locked: boolean,
  leaseSeconds: number = INPUT_LOCK_LEASE_SECONDS,
): RemoteSessionControlEnvelope {
  return buildViewerRemoteControlEnvelope('inputLock', sessionId, sequence, {
    locked,
    leaseSeconds,
  });
}

/** Envelope da consulta de estado (enviado ao conectar/reconectar). */
export function buildInputLockQuery(
  sessionId: string,
  sequence: number,
): RemoteSessionControlEnvelope {
  return buildViewerRemoteControlEnvelope('inputLock', sessionId, sequence, {
    query: true,
  });
}

/** Extrai o estado de um envelope inputLockChanged (null para outros tipos). */
export function parseInputLockChanged(
  envelope: RemoteSessionControlEnvelope | null,
): InputLockChangedState | null {
  if (!envelope || envelope.type !== 'inputLockChanged') return null;
  const payload = envelope.payload ?? {};
  const lease =
    typeof payload.leaseRemainingSeconds === 'number'
      ? payload.leaseRemainingSeconds
      : 0;
  return {
    locked: payload.locked === true,
    method: typeof payload.method === 'string' ? payload.method : '',
    reason: typeof payload.reason === 'string' ? payload.reason : '',
    leaseRemainingSeconds: lease > 0 ? lease : 0,
  };
}

/**
 * Texto de aviso para liberações/falhas que o operador PRECISA saber.
 * Retorna null quando não há nada relevante (ex.: travado com sucesso).
 */
export function describeInputLockEvent(state: InputLockChangedState): string | null {
  if (state.locked) return null;
  if (state.reason.startsWith('block_failed')) {
    return `Não foi possível bloquear a entrada: ${state.reason.replace('block_failed: ', '')}`;
  }
  if (state.reason === 'lease_expired') {
    return 'A entrada da máquina remota foi liberada automaticamente (o viewer parou de responder).';
  }
  if (state.reason === 'max_duration') {
    return 'A entrada da máquina remota foi liberada ao atingir o tempo máximo de bloqueio.';
  }
  return null;
}

/** Rótulo do botão do cadeado. */
export function inputLockButtonLabel(state: InputLockChangedState | null): string {
  return state?.locked ? '🔒 Entrada bloqueada' : '🔓 Bloquear entrada';
}

/** Tooltip do botão do cadeado. */
export function inputLockButtonTitle(state: InputLockChangedState | null): string {
  if (state?.locked) {
    const lease =
      state.leaseRemainingSeconds > 0
        ? ` Renova a cada ping; libera sozinho em ~${state.leaseRemainingSeconds}s sem o viewer.`
        : '';
    return `Teclado e mouse da máquina remota bloqueados para o usuário local.${lease} Clique para destravar.`;
  }
  return 'Bloquear teclado e mouse da MÁQUINA REMOTA (o usuário local não poderá interferir; você continua controlando).';
}

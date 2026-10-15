import { describe, expect, it } from 'vitest';
import { AppApprovalActionType, AppInstallationType } from '@/api/types';
import {
  actionBadge,
  buildStorePath,
  formatBytes,
  formatEta,
  installationTypeFromStoreSearch,
  installationTypeSlug,
  slugifyPackageId,
  STORE_PATH,
  STORE_TYPE_QUERY_PARAM,
} from './softwareStoreUtils';

/**
 * formatEta alimenta a estimativa de tempo restante do envio no card do
 * instalador — onde o upload pode levar minutos. Um valor errado (ou "NaN min")
 * passa a ser visto pelo operador a cada envio.
 */
describe('formatEta', () => {
  it('mostra segundos abaixo de um minuto (nunca 0 s)', () => {
    expect(formatEta(45)).toBe('45 s');
    expect(formatEta(0.4)).toBe('1 s');
    // 59,6 s não pode virar "60 s" (pareceria um minuto com rótulo de segundos).
    expect(formatEta(59.6)).toBe('59 s');
  });

  it('não arredonda minutos para 60 min', () => {
    expect(formatEta(3599)).toBe('59 min');
  });

  it('mostra minutos entre 1 e 59', () => {
    expect(formatEta(60)).toBe('1 min');
    expect(formatEta(600)).toBe('10 min');
    expect(formatEta(3540)).toBe('59 min');
  });

  it('mostra horas e minutos acima de uma hora', () => {
    expect(formatEta(3600)).toBe('1 h');
    expect(formatEta(3900)).toBe('1 h 5 min');
    expect(formatEta(23 * 3600)).toBe('23 h');
  });

  it('mostra dias em links muito lentos (nunca "50 h")', () => {
    expect(formatEta(24 * 3600)).toBe('1 dia');
    expect(formatEta(48 * 3600)).toBe('2 dias');
  });

  it('devolve null quando não há estimativa confiável', () => {
    expect(formatEta(undefined)).toBeNull();
    expect(formatEta(null)).toBeNull();
    expect(formatEta(0)).toBeNull();
    expect(formatEta(-10)).toBeNull();
    expect(formatEta(Number.NaN)).toBeNull();
    expect(formatEta(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formata bytes legíveis e vazio para valores inválidos', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('slugifyPackageId', () => {
  it('remove acentos e espaços', () => {
    expect(slugifyPackageId('Sistema de Gestão XPTO')).toBe('sistema-de-gestao-xpto');
  });
});

describe('actionBadge', () => {
  it('não rotula ação desconhecida como Negado', () => {
    expect(actionBadge(AppApprovalActionType.Allow)).toBe('Permitido');
    expect(actionBadge(AppApprovalActionType.Deny)).toBe('Negado');
    expect(actionBadge(null)).toBe('—');
  });
});

/**
 * O tipo do catálogo vive na URL da loja. Sem round-trip correto, salvar um
 * pacote custom devolvia o operador para a listagem Winget.
 */
describe('navegação da loja por tipo', () => {
  it('gera a rota da loja já no tipo informado', () => {
    expect(buildStorePath(AppInstallationType.Custom)).toBe(`${STORE_PATH}?${STORE_TYPE_QUERY_PARAM}=custom`);
    expect(buildStorePath(AppInstallationType.Chocolatey)).toBe(`${STORE_PATH}?${STORE_TYPE_QUERY_PARAM}=chocolatey`);
    // Winget é o padrão implícito: rota limpa, sem query.
    expect(buildStorePath(AppInstallationType.Winget)).toBe(STORE_PATH);
    expect(buildStorePath()).toBe(STORE_PATH);
  });

  it('lê o tipo do round-trip da URL', () => {
    for (const type of [
      AppInstallationType.Chocolatey,
      AppInstallationType.Custom,
    ]) {
      const search = buildStorePath(type).split('?')[1];
      expect(installationTypeFromStoreSearch(search)).toBe(type);
      expect(installationTypeFromStoreSearch(new URLSearchParams(search))).toBe(type);
    }
    // Winget não vai na URL — o round-trip é a rota limpa.
    expect(installationTypeFromStoreSearch(buildStorePath(AppInstallationType.Winget).split('?')[1] ?? '')).toBe(AppInstallationType.Winget);
  });

  it('cai no padrão Winget quando o param está ausente ou inválido', () => {
    expect(installationTypeFromStoreSearch('')).toBe(AppInstallationType.Winget);
    expect(installationTypeFromStoreSearch('?outro=1')).toBe(AppInstallationType.Winget);
    expect(installationTypeFromStoreSearch('?tipo=desconhecido')).toBe(AppInstallationType.Winget);
    expect(installationTypeFromStoreSearch('tipo')).toBe(AppInstallationType.Winget);
  });

  it('usa slugs estáveis e minúsculos', () => {
    expect(installationTypeSlug(AppInstallationType.Winget)).toBe('winget');
    expect(installationTypeSlug(AppInstallationType.Chocolatey)).toBe('chocolatey');
    expect(installationTypeSlug(AppInstallationType.Custom)).toBe('custom');
  });
});

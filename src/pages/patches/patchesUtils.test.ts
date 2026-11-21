import { describe, expect, it } from 'vitest';
import {
  approvalColor,
  approvalLabel,
  buildUpdateInfoLinks,
  extractPrimaryKb,
  formatKbList,
  parseRebootReasons,
  rebootReasonLabel,
  severityColor,
  statusColor,
  statusLabel,
  updateSourceLabel,
  updateTypeLabel,
} from './patchesUtils';

describe('patchesUtils', () => {
  it('mapeia severidade para cor', () => {
    expect(severityColor('Critical')).toBe('danger');
    expect(severityColor('Important')).toBe('warning');
    expect(severityColor('Moderate')).toBe('primary');
    expect(severityColor(null)).toBe('slate');
  });

  it('mapeia aprovação para rótulo/cor', () => {
    expect(approvalLabel('Approved')).toBe('Aprovada');
    expect(approvalLabel('Denied')).toBe('Recusada');
    expect(approvalLabel('AutoApproved')).toBe('Auto-aprovada');
    expect(approvalLabel('Unknown')).toContain('Aguardando');
    expect(approvalColor('Denied')).toBe('danger');
    expect(approvalColor('Approved')).toBe('success');
  });

  it('mapeia status para rótulo/cor', () => {
    expect(statusLabel('Installed')).toBe('Instalada');
    expect(statusColor('Failed')).toBe('danger');
    expect(statusColor('Installing')).toBe('warning');
  });

  it('interpreta motivos de reinício', () => {
    expect(parseRebootReasons('["windows_update","cbs"]')).toEqual(['windows_update', 'cbs']);
    expect(parseRebootReasons('lixo')).toEqual([]);
    expect(parseRebootReasons(null)).toEqual([]);
    expect(rebootReasonLabel('file_rename')).toContain('Arquivos');
  });

  it('formata lista de KBs', () => {
    expect(formatKbList(['KB5034441', 'KB5034100'])).toBe('KB5034441, KB5034100');
    expect(formatKbList([])).toContain('—');
  });

  it('extrai KB principal e monta links seguros de suporte/catálogo', () => {
    expect(extractPrimaryKb([], 'kb:KB5034441', null)).toBe('KB5034441');
    expect(extractPrimaryKb([], 'guid:123:1', '2026-11 .NET Preview (KB5137003)')).toBe('KB5137003');

    const withUnsafeUrl = buildUpdateInfoLinks({
      supportUrl: 'javascript:alert(1)',
      kbIds: ['KB5034441'],
    });
    expect(withUnsafeUrl.some((l) => l.url.startsWith('javascript:'))).toBe(false);
    expect(withUnsafeUrl.some((l) => l.url === 'https://support.microsoft.com/help/5034441')).toBe(true);
    expect(withUnsafeUrl.some((l) => l.url.includes('catalog.update.microsoft.com/Search.aspx?q=KB5034441'))).toBe(true);

    expect(updateSourceLabel('waas')).toContain('WaaS');
    expect(updateTypeLabel('feature')).toContain('Recursos');
  });
});

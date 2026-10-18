import { describe, expect, it } from 'vitest';
import {
  approvalColor,
  approvalLabel,
  formatKbList,
  parseRebootReasons,
  rebootReasonLabel,
  severityColor,
  statusColor,
  statusLabel,
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
});

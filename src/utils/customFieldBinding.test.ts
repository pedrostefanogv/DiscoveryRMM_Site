import { describe, expect, it } from 'vitest';
import { CustomFieldScopeType } from '@/api/custom-fields';
import { describeCustomFieldBinding } from './customFieldBinding';

describe('describeCustomFieldBinding', () => {
  it('mostra o nome do departamento vinculado', () => {
    expect(
      describeCustomFieldBinding({
        scopeType: CustomFieldScopeType.Department,
        departmentId: 'dep-1',
        departmentName: 'TI',
      }),
    ).toEqual({ label: 'Departamento: TI', isSpecific: true });
  });

  it('ignora nome em branco e cai para o id', () => {
    expect(
      describeCustomFieldBinding({
        scopeType: CustomFieldScopeType.Department,
        departmentId: 'dep-1',
        departmentName: '   ',
      }),
    ).toEqual({ label: 'Departamento vinculado (nome indisponível)', isSpecific: true });
  });

  it('trata departamento sem vínculo como todos os departamentos', () => {
    expect(
      describeCustomFieldBinding({
        scopeType: CustomFieldScopeType.Department,
        departmentId: null,
        departmentName: null,
      }),
    ).toEqual({ label: 'Todos os departamentos', isSpecific: false });
  });

  it.each([
    [CustomFieldScopeType.Client, 'Todos os clientes'],
    [CustomFieldScopeType.Site, 'Todos os sites'],
    [CustomFieldScopeType.Agent, 'Todos os agentes'],
    [CustomFieldScopeType.Server, 'Todos os servidores'],
    [CustomFieldScopeType.Ticket, 'Todos os chamados'],
  ])('escopo %s sem vínculo específico vira %s', (scopeType, label) => {
    expect(
      describeCustomFieldBinding({
        scopeType,
        departmentId: null,
        departmentName: null,
      }),
    ).toEqual({ label, isSpecific: false });
  });
});

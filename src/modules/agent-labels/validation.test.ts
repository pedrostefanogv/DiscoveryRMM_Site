import { describe, expect, it } from 'vitest';

import {
  AgentLabelApplyMode,
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLabelMatch,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
  type AgentLabelRuleExpressionNodeDto,
} from './types';
import { validateExpression, validateRulePayload } from './validation';

/**
 * Paridade front/back da validacao de expressao.
 *
 * O backend propaga `insideDiskGroup` atraves de grupos aninhados; o front fixava
 * `false` ao descer em Group, rejeitando na UI regras que o motor executa.
 */
describe('validateExpression', () => {
  it('aceita campo de disco em grupo aninhado dentro de DiskGroup', () => {
    const expression: AgentLabelRuleExpressionNodeDto = {
      nodeType: AgentLabelNodeType.DiskGroup,
      logicalOperator: AgentLabelLogicalOperator.Or,
      children: [
        {
          nodeType: AgentLabelNodeType.Group,
          logicalOperator: AgentLabelLogicalOperator.And,
          children: [
            {
              nodeType: AgentLabelNodeType.Condition,
              field: AgentLabelField.DiskFreeSpacePercent,
              operator: AgentLabelComparisonOperator.LessThan,
              value: '20',
            },
          ],
        },
      ],
    };

    expect(validateExpression(expression)).toEqual([]);
  });

  it('rejeita campo de disco fora de um DiskGroup', () => {
    const expression: AgentLabelRuleExpressionNodeDto = {
      nodeType: AgentLabelNodeType.Group,
      logicalOperator: AgentLabelLogicalOperator.And,
      children: [
        {
          nodeType: AgentLabelNodeType.Condition,
          field: AgentLabelField.DiskFreeSpacePercent,
          operator: AgentLabelComparisonOperator.LessThan,
          value: '20',
        },
      ],
    };

    const errors = validateExpression(expression);
    expect(errors.some(error => error.includes('DiskGroup'))).toBe(true);
  });

  it('rejeita grupo sem filhos (modo Manual usa grupo vazio de proposito no backend)', () => {
    const expression: AgentLabelRuleExpressionNodeDto = {
      nodeType: AgentLabelNodeType.Group,
      logicalOperator: AgentLabelLogicalOperator.And,
      children: [],
    };

    const errors = validateExpression(expression);
    expect(errors.some(error => error.includes('at least one child'))).toBe(true);
  });
});

/** Modo Remover: paridade com LabelRuleValidation.ValidateLabelTarget do backend. */
describe('validateRulePayload — modo Remover', () => {
  const expression: AgentLabelRuleExpressionNodeDto = {
    nodeType: AgentLabelNodeType.Group,
    logicalOperator: AgentLabelLogicalOperator.And,
    children: [
      {
        nodeType: AgentLabelNodeType.Condition,
        field: AgentLabelField.Hostname,
        operator: AgentLabelComparisonOperator.Contains,
        value: 'SRV',
      },
    ],
  };

  const base = { name: 'Regra', expression };

  it('rejeita tipo de alvo fora do modo Remover', () => {
    const errors = validateRulePayload({
      ...base,
      label: 'L',
      applyMode: AgentLabelApplyMode.ApplyOnly,
      labelMatch: AgentLabelLabelMatch.Prefix,
    });

    expect(errors.some(error => error.includes('Remover labels manuais'))).toBe(true);
  });

  it('rejeita prefixo curto no modo Remover', () => {
    const errors = validateRulePayload({
      ...base,
      label: 'T',
      applyMode: AgentLabelApplyMode.Remove,
      labelMatch: AgentLabelLabelMatch.Prefix,
    });

    expect(errors.some(error => error.includes('2 caracteres'))).toBe(true);
  });

  it('rejeita regex inválida no modo Remover', () => {
    const errors = validateRulePayload({
      ...base,
      label: '(',
      applyMode: AgentLabelApplyMode.Remove,
      labelMatch: AgentLabelLabelMatch.Regex,
    });

    expect(errors.some(error => error.includes('Regex inválida'))).toBe(true);
  });

  it('bloqueia alvo que atinge label protegida', () => {
    const errors = validateRulePayload({
      ...base,
      label: 'PROD',
      applyMode: AgentLabelApplyMode.Remove,
      labelMatch: AgentLabelLabelMatch.Exact,
      protectedLabels: ['PROD'],
    });

    expect(errors.some(error => error.includes('protegida'))).toBe(true);
  });

  it('bloqueia conflito direto com regra aditiva', () => {
    const errors = validateRulePayload({
      ...base,
      label: 'PROD',
      applyMode: AgentLabelApplyMode.Remove,
      labelMatch: AgentLabelLabelMatch.Exact,
      additiveLabels: ['PROD'],
    });

    expect(errors.some(error => error.includes('também é produzida'))).toBe(true);
  });

  it('aceita prefixo válido com protected/conflito respeitados', () => {
    const errors = validateRulePayload({
      ...base,
      label: 'TEMP-',
      applyMode: AgentLabelApplyMode.Remove,
      labelMatch: AgentLabelLabelMatch.Prefix,
      protectedLabels: ['PROD'],
      additiveLabels: ['PROD'],
    });

    expect(errors).toEqual([]);
  });
});

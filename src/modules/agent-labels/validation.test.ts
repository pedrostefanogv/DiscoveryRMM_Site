import { describe, expect, it } from 'vitest';

import {
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
  type AgentLabelRuleExpressionNodeDto,
} from './types';
import { validateExpression } from './validation';

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

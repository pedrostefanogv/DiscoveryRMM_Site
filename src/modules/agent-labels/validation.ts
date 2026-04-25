import {
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
  AgentLabelRuleExpressionNodeDto,
  AgentStatus,
  isCustomFieldAgentLabelField,
} from "./types";
import { CustomFieldDataType, CustomFieldScopeType } from "@/api/custom-fields";

export const AgentLabelExpressionLimits = {
  maxDepth: 8,
  maxNodes: 128,
  maxChildrenPerGroup: 20,
  maxValueLength: 512,
  maxRegexLength: 256,
} as const;

const textFields = new Set<AgentLabelField>([
  AgentLabelField.Hostname,
  AgentLabelField.DisplayName,
  AgentLabelField.IpAddress,
  AgentLabelField.OperatingSystem,
  AgentLabelField.OsVersion,
  AgentLabelField.SoftwareName,
  AgentLabelField.SoftwarePublisher,
  AgentLabelField.SoftwareVersion,
  AgentLabelField.Processor,
]);

const numericFields = new Set<AgentLabelField>([
  AgentLabelField.SoftwareCount,
  AgentLabelField.TotalMemoryBytes,
  AgentLabelField.TotalDisksCount,
]);

const textOperators = new Set<AgentLabelComparisonOperator>([
  AgentLabelComparisonOperator.Contains,
  AgentLabelComparisonOperator.NotContains,
  AgentLabelComparisonOperator.StartsWith,
  AgentLabelComparisonOperator.EndsWith,
  AgentLabelComparisonOperator.Equals,
  AgentLabelComparisonOperator.NotEquals,
  AgentLabelComparisonOperator.Regex,
]);

const numericOperators = new Set<AgentLabelComparisonOperator>([
  AgentLabelComparisonOperator.Equals,
  AgentLabelComparisonOperator.NotEquals,
  AgentLabelComparisonOperator.GreaterThan,
  AgentLabelComparisonOperator.GreaterThanOrEqual,
  AgentLabelComparisonOperator.LessThan,
  AgentLabelComparisonOperator.LessThanOrEqual,
]);

const statusOperators = new Set<AgentLabelComparisonOperator>([
  AgentLabelComparisonOperator.Equals,
  AgentLabelComparisonOperator.NotEquals,
]);

const booleanOperators = new Set<AgentLabelComparisonOperator>([
  AgentLabelComparisonOperator.Equals,
  AgentLabelComparisonOperator.NotEquals,
]);

export function getCustomFieldScopeTypeForRuleField(
  field: AgentLabelField,
): CustomFieldScopeType | null {
  switch (field) {
    case AgentLabelField.AgentCustomField:
      return CustomFieldScopeType.Agent;
    case AgentLabelField.ClientCustomField:
      return CustomFieldScopeType.Client;
    case AgentLabelField.SiteCustomField:
      return CustomFieldScopeType.Site;
    default:
      return null;
  }
}

export function getAllowedOperatorsForField(
  field: AgentLabelField,
  customFieldDataType?: CustomFieldDataType | null,
): AgentLabelComparisonOperator[] {
  if (isCustomFieldAgentLabelField(field)) {
    switch (customFieldDataType) {
      case CustomFieldDataType.Integer:
      case CustomFieldDataType.Decimal:
      case CustomFieldDataType.Date:
      case CustomFieldDataType.DateTime:
        return Array.from(numericOperators);
      case CustomFieldDataType.Boolean:
        return Array.from(booleanOperators);
      case CustomFieldDataType.Text:
      case CustomFieldDataType.Dropdown:
      case CustomFieldDataType.ListBox:
      default:
        return Array.from(textOperators);
    }
  }

  if (numericFields.has(field)) {
    return Array.from(numericOperators);
  }

  if (field === AgentLabelField.Status) {
    return Array.from(statusOperators);
  }

  return Array.from(textOperators);
}

export function validateRulePayload(input: {
  name: string;
  label: string;
  expression: AgentLabelRuleExpressionNodeDto;
  customFieldDataTypes?: Record<string, CustomFieldDataType | undefined>;
}): string[] {
  const errors: string[] = [];

  if (!input.name || !input.name.trim()) {
    errors.push("Name is required.");
  } else if (input.name.length > 200) {
    errors.push("Name exceeds maximum length of 200.");
  }

  if (!input.label || !input.label.trim()) {
    errors.push("Label is required.");
  } else if (input.label.length > 120) {
    errors.push("Label exceeds maximum length of 120.");
  }

  errors.push(...validateExpression(input.expression, input.customFieldDataTypes));
  return errors;
}

export function validateExpression(
  expression: AgentLabelRuleExpressionNodeDto,
  customFieldDataTypes?: Record<string, CustomFieldDataType | undefined>,
): string[] {
  const errors: string[] = [];
  let nodeCount = 0;

  function walk(
    node: AgentLabelRuleExpressionNodeDto,
    depth: number,
    path: string,
  ) {
    nodeCount++;

    if (depth > AgentLabelExpressionLimits.maxDepth) {
      errors.push(
        `${path}: expression depth exceeds maximum of ${AgentLabelExpressionLimits.maxDepth}.`,
      );
    }

    if (nodeCount > AgentLabelExpressionLimits.maxNodes) {
      errors.push(
        `expression node count exceeds maximum of ${AgentLabelExpressionLimits.maxNodes}.`,
      );
    }

    if (node.nodeType === AgentLabelNodeType.Group) {
      if (node.logicalOperator == null) {
        errors.push(`${path}: group node requires LogicalOperator.`);
      } else if (
        node.logicalOperator !== AgentLabelLogicalOperator.And &&
        node.logicalOperator !== AgentLabelLogicalOperator.Or
      ) {
        errors.push(`${path}: invalid LogicalOperator.`);
      }

      if (
        node.field != null ||
        node.operator != null ||
        node.value != null ||
        node.customFieldDefinitionId != null
      ) {
        errors.push(`${path}: group node cannot define Field/Operator/Value.`);
      }

      const children = node.children ?? [];
      if (children.length === 0) {
        errors.push(`${path}: group node must have at least one child.`);
      }
      if (children.length > AgentLabelExpressionLimits.maxChildrenPerGroup) {
        errors.push(
          `${path}: group node exceeds maximum of ${AgentLabelExpressionLimits.maxChildrenPerGroup} children.`,
        );
      }

      children.forEach((child, i) =>
        walk(child, depth + 1, `${path}.children[${i}]`),
      );
      return;
    }

    if (node.nodeType !== AgentLabelNodeType.Condition) {
      errors.push(`${path}: invalid NodeType.`);
      return;
    }

    const children = node.children ?? [];
    if (children.length > 0) {
      errors.push(`${path}: condition node cannot contain children.`);
    }

    if (node.logicalOperator != null) {
      errors.push(`${path}: condition node cannot define LogicalOperator.`);
    }

    if (node.field == null) {
      errors.push(`${path}: condition node requires Field.`);
    }
    if (node.operator == null) {
      errors.push(`${path}: condition node requires Operator.`);
    }
    if (node.value == null) {
      errors.push(`${path}: condition node requires Value.`);
    }

    if (node.field == null || node.operator == null || node.value == null) {
      return;
    }

    if (isCustomFieldAgentLabelField(node.field) && !node.customFieldDefinitionId) {
      errors.push(`${path}: custom field condition requires CustomFieldDefinitionId.`);
      return;
    }

    validateCondition(
      node.field,
      node.operator,
      node.value,
      errors,
      path,
      node.customFieldDefinitionId
        ? customFieldDataTypes?.[node.customFieldDefinitionId]
        : undefined,
    );
  }

  walk(expression, 1, "root");
  return errors;
}

function validateCondition(
  field: AgentLabelField,
  operator: AgentLabelComparisonOperator,
  value: string,
  errors: string[],
  path: string,
  customFieldDataType?: CustomFieldDataType,
) {
  if (value.length > AgentLabelExpressionLimits.maxValueLength) {
    errors.push(
      `${path}: value exceeds maximum length of ${AgentLabelExpressionLimits.maxValueLength}.`,
    );
  }

  if (isCustomFieldAgentLabelField(field)) {
    const allowedOperators = getAllowedOperatorsForField(field, customFieldDataType);
    if (!allowedOperators.includes(operator)) {
      errors.push(`${path}: operator '${operator}' is not allowed for this custom field.`);
      return;
    }

    switch (customFieldDataType) {
      case CustomFieldDataType.Integer:
      case CustomFieldDataType.Decimal:
        if (Number.isNaN(Number(value))) {
          errors.push(`${path}: value '${value}' is not a valid number.`);
        }
        return;
      case CustomFieldDataType.Boolean:
        if (!["true", "false", "1", "0"].includes(value.trim().toLowerCase())) {
          errors.push(`${path}: value '${value}' is not a valid boolean.`);
        }
        return;
      case CustomFieldDataType.Date:
      case CustomFieldDataType.DateTime:
        if (Number.isNaN(new Date(value).getTime())) {
          errors.push(`${path}: value '${value}' is not a valid date.`);
        }
        return;
      default:
        if (operator === AgentLabelComparisonOperator.Regex) {
          if (value.length > AgentLabelExpressionLimits.maxRegexLength) {
            errors.push(
              `${path}: regex pattern exceeds maximum length of ${AgentLabelExpressionLimits.maxRegexLength}.`,
            );
          }

          try {
            new RegExp(value);
          } catch {
            errors.push(`${path}: invalid regex pattern.`);
          }
        }
        return;
    }
  }

  if (field === AgentLabelField.Status) {
    if (!statusOperators.has(operator)) {
      errors.push(
        `${path}: operator '${operator}' is not allowed for field '${field}'.`,
      );
    }

    if (!Object.values(AgentStatus).includes(value as AgentStatus)) {
      errors.push(`${path}: value '${value}' is not a valid AgentStatus.`);
    }
    return;
  }

  if (textFields.has(field)) {
    if (!textOperators.has(operator)) {
      errors.push(
        `${path}: operator '${operator}' is not allowed for text field '${field}'.`,
      );
    }

    if (operator === AgentLabelComparisonOperator.Regex) {
      if (value.length > AgentLabelExpressionLimits.maxRegexLength) {
        errors.push(
          `${path}: regex pattern exceeds maximum length of ${AgentLabelExpressionLimits.maxRegexLength}.`,
        );
      }

      try {
        new RegExp(value);
      } catch {
        errors.push(`${path}: invalid regex pattern.`);
      }
    }
    return;
  }

  if (numericFields.has(field)) {
    if (!numericOperators.has(operator)) {
      errors.push(
        `${path}: operator '${operator}' is not allowed for numeric field '${field}'.`,
      );
    }

    if (Number.isNaN(Number(value))) {
      errors.push(`${path}: value '${value}' is not a valid number.`);
    }
    return;
  }

  errors.push(`${path}: unsupported field '${field}'.`);
}

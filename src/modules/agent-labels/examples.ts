import {
  AgentLabelApplyMode,
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
} from "./types";
import { validateRulePayload } from "./validation";
import { agentLabelsApi } from "./api";

export async function createDevRule() {
  const payload = {
    name: "Windows + VS",
    label: "DEV",
    description: "Aplica a label DEV para agentes Windows com Visual Studio.",
    applyMode: AgentLabelApplyMode.ApplyAndRemove,
    expression: {
      nodeType: AgentLabelNodeType.Group,
      logicalOperator: AgentLabelLogicalOperator.And,
      children: [
        {
          nodeType: AgentLabelNodeType.Condition,
          field: AgentLabelField.OperatingSystem,
          operator: AgentLabelComparisonOperator.Contains,
          value: "Windows",
        },
        {
          nodeType: AgentLabelNodeType.Condition,
          field: AgentLabelField.SoftwareName,
          operator: AgentLabelComparisonOperator.Contains,
          value: "Visual Studio",
        },
      ],
    },
  };

  const errors = validateRulePayload(payload);
  if (errors.length) {
    console.error("Erros de validação:", errors);
    return;
  }

  const dryRun = await agentLabelsApi.dryRun({
    agentId: "be70b5e2-d503-4ea0-9ca8-b8f8f1f87b4e",
    label: payload.label,
    applyMode: payload.applyMode,
    expression: payload.expression,
  });

  console.log("Dry-run:", dryRun);

  const created = await agentLabelsApi.createRule(payload);
  console.log("Regra criada:", created);
}

export async function createDiskRule() {
  const payload = {
    name: "C: SSD com menos de 20% livre",
    label: "DISCO_CRITICO",
    description: "Agentes com disco C: SSD com menos de 20% de espaço livre.",
    applyMode: AgentLabelApplyMode.ApplyOnly,
    expression: {
      nodeType: AgentLabelNodeType.Group,
      logicalOperator: AgentLabelLogicalOperator.And,
      children: [
        {
          nodeType: AgentLabelNodeType.DiskGroup,
          logicalOperator: AgentLabelLogicalOperator.Or,
          children: [
            {
              nodeType: AgentLabelNodeType.Condition,
              field: AgentLabelField.DiskDriveLetter,
              operator: AgentLabelComparisonOperator.Equals,
              value: "C:",
            },
            {
              nodeType: AgentLabelNodeType.Condition,
              field: AgentLabelField.DiskMediaType,
              operator: AgentLabelComparisonOperator.Equals,
              value: "SSD",
            },
            {
              nodeType: AgentLabelNodeType.Condition,
              field: AgentLabelField.DiskFreeSpacePercent,
              operator: AgentLabelComparisonOperator.LessThan,
              value: "20",
            },
          ],
        },
        {
          nodeType: AgentLabelNodeType.Condition,
          field: AgentLabelField.Status,
          operator: AgentLabelComparisonOperator.Equals,
          value: "Online",
        },
      ],
    },
  };

  const errors = validateRulePayload(payload);
  if (errors.length) {
    console.error("Erros de validação:", errors);
    return;
  }

  const created = await agentLabelsApi.createRule(payload);
  console.log("Regra de disco criada:", created);
}

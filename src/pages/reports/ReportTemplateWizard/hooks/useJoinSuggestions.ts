import { useMemo } from "react";
import type { SelectedDataset } from "./useWizardState";
import type { DatasetCatalogItem } from "@/api/types";

export interface JoinSuggestion {
  sourceKey: string;
  targetKey: string;
  sourceDatasetName: string;
  targetDatasetName: string;
  commonKeys: string[];
  preferredKey: string;
  isDirectMatch: boolean;
}

function getDatasetKey(item: DatasetCatalogItem): string {
  return item.key ?? item.type ?? "";
}

const JOIN_KEYS: Record<string, string[]> = {
  softwareInventory: ["agentId", "clientId", "siteId", "softwareName"],
  agentHardware: ["agentId", "clientId", "siteId"],
  agentLabels: ["agentId", "clientId", "siteId", "labelName"],
  automaticLabelRules: ["labelName", "ruleId"],
  logs: ["agentId", "clientId", "siteId"],
  tickets: ["agentId", "clientId", "siteId"],
  configurationAudit: ["agentId", "clientId", "siteId"],
  automationExecutions: ["agentId"],
  agentInventoryComposite: ["agentId", "clientId", "siteId"],
};

export function useJoinSuggestions(
  selectedDatasets: SelectedDataset[],
  availableDatasets: DatasetCatalogItem[],
): { suggestions: JoinSuggestion[]; warnings: string[] } {
  return useMemo(() => {
    if (selectedDatasets.length === 0) return { suggestions: [], warnings: [] };

    const suggestions: JoinSuggestion[] = [];
    const warnings: string[] = [];
    const selectedKeys = new Set(
      selectedDatasets.map((ds) => getDatasetKey(ds.catalogItem)),
    );

    // Validate: all non-primary datasets must have a join defined
    for (const ds of selectedDatasets) {
      if (ds.isPrimary) continue;
      if (!ds.joinSourceKey || !ds.joinToAlias) {
        warnings.push(
          `"${ds.catalogItem.name ?? getDatasetKey(ds.catalogItem)}" não tem join configurado. Configure a chave de ligação.`,
        );
      } else {
        // Validate the join key exists in both datasets
        const dsKey = getDatasetKey(ds.catalogItem);
        const dsKeys = JOIN_KEYS[dsKey] ?? [];
        if (!dsKeys.includes(ds.joinSourceKey)) {
          warnings.push(
            `"${ds.joinSourceKey}" não é uma chave válida para "${ds.catalogItem.name ?? dsKey}". Chaves disponíveis: ${dsKeys.join(", ")}`,
          );
        }
        const targetDs = selectedDatasets.find((d) => d.alias === ds.joinToAlias);
        if (targetDs) {
          const targetKey = getDatasetKey(targetDs.catalogItem);
          const targetKeys = JOIN_KEYS[targetKey] ?? [];
          if (!targetKeys.includes(ds.joinTargetKey ?? ds.joinSourceKey)) {
            warnings.push(
              `"${ds.joinTargetKey ?? ds.joinSourceKey}" não é uma chave válida para "${targetDs.catalogItem.name ?? targetKey}". Chaves disponíveis: ${targetKeys.join(", ")}`,
            );
          }
        }
      }
    }

    for (const ds of selectedDatasets) {
      const dsKey = getDatasetKey(ds.catalogItem);
      const dsKeys = JOIN_KEYS[dsKey] ?? [];

      for (const available of availableDatasets) {
        const avKey = getDatasetKey(available);
        if (selectedKeys.has(avKey)) continue;

        const avKeys = JOIN_KEYS[avKey] ?? [];
        const common = dsKeys.filter((k) => avKeys.includes(k));

        if (common.length > 0) {
          const preferredKey = common.includes("agentId")
            ? "agentId"
            : common.includes("clientId")
              ? "clientId"
              : common.includes("siteId")
                ? "siteId"
                : common[0];

          suggestions.push({
            sourceKey: dsKey,
            targetKey: avKey,
            sourceDatasetName: ds.catalogItem.name ?? dsKey,
            targetDatasetName: available.name ?? avKey,
            commonKeys: common,
            preferredKey,
            isDirectMatch: common.length >= 3,
          });
        }
      }
    }

    // Check for datasets that cannot be joined with anything (dead ends)
    for (const ds of selectedDatasets) {
      if (ds.isPrimary) continue;
      const dsKey = getDatasetKey(ds.catalogItem);
      const dsKeys = JOIN_KEYS[dsKey] ?? [];
      const canJoin = selectedDatasets.some((other) => {
        if (other.alias === ds.alias) return false;
        const otherKey = getDatasetKey(other.catalogItem);
        const otherKeys = JOIN_KEYS[otherKey] ?? [];
        return dsKeys.some((k) => otherKeys.includes(k));
      });
      if (!canJoin) {
        warnings.push(
          `"${ds.catalogItem.name ?? dsKey}" não compartilha chaves com nenhum outro dataset selecionado. Remova ou escolha outro dataset.`,
        );
      }
    }

    return {
      suggestions: suggestions
        .filter(
          (s, i, arr) =>
            arr.findIndex(
              (x) => x.sourceKey === s.sourceKey && x.targetKey === s.targetKey,
            ) === i,
        )
        .sort((a, b) => b.commonKeys.length - a.commonKeys.length),
      warnings,
    };
  }, [selectedDatasets, availableDatasets]);
}

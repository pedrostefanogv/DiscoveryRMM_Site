import { useMemo } from "react";
import type { SelectedDataset } from "./useWizardState";
import type { DatasetCatalogItem } from "@/api/types";
import {
  findCommonJoinKeys,
  getDatasetKey,
  getJoinKeys,
  getJoinFieldOptions,
  pickPreferredJoinKey,
  stripAlias,
} from "./joinKeys";

export interface JoinSuggestion {
  sourceKey: string;
  targetKey: string;
  sourceDatasetName: string;
  targetDatasetName: string;
  commonKeys: string[];
  preferredKey: string;
  isDirectMatch: boolean;
}

export interface JoinIssue {
  /** Alias da fonte com problema (permite ancorar o aviso na UI). */
  alias: string;
  message: string;
}

function datasetLabel(item: DatasetCatalogItem): string {
  return item.name ?? (getDatasetKey(item) || "dataset");
}

/**
 * Valida a cadeia de joins e propoe combinacoes.
 *
 * Tudo e derivado do catalogo (joinCapabilities + fieldMetadata[].isJoinKey).
 * Nao existe mais matriz estatica de chaves: era ela que omitia 7 datasets e
 * fazia "Sensores (estado e metricas)" parecer incompativel com "Hardware".
 */
export function useJoinSuggestions(
  selectedDatasets: SelectedDataset[],
  availableDatasets: DatasetCatalogItem[],
): { suggestions: JoinSuggestion[]; warnings: string[]; issues: JoinIssue[] } {
  return useMemo(() => {
    if (selectedDatasets.length === 0) {
      return { suggestions: [], warnings: [], issues: [] };
    }

    const suggestions: JoinSuggestion[] = [];
    const issues: JoinIssue[] = [];
    const selectedKeys = new Set(
      selectedDatasets.map((ds) => getDatasetKey(ds.catalogItem)),
    );

    // ── Validacao das fontes nao-principais ──────────────
    for (const [index, ds] of selectedDatasets.entries()) {
      if (index === 0) continue;

      const label = datasetLabel(ds.catalogItem);

      if (!ds.joinToAlias) {
        issues.push({
          alias: ds.alias,
          message: `"${label}" não tem join configurado. Escolha a chave de ligação.`,
        });
        continue;
      }

      const targetDs = selectedDatasets.find((d) => d.alias === ds.joinToAlias);
      if (!targetDs) {
        issues.push({
          alias: ds.alias,
          message: `"${label}" aponta para a fonte "${ds.joinToAlias}", que não está mais selecionada. Escolha outra fonte.`,
        });
        continue;
      }

      // O backend exige que joinToAlias aponte para uma fonte ANTERIOR na
      // cadeia. Permitir uma fonte posterior geraria 400 no create/update.
      const targetIndex = selectedDatasets.findIndex(
        (candidate) => candidate.alias === ds.joinToAlias,
      );
      if (targetIndex >= index) {
        issues.push({
          alias: ds.alias,
          message: `"${label}" não pode se ligar a "${ds.joinToAlias}", que vem depois dela na ordem. Escolha uma fonte anterior.`,
        });
        continue;
      }

      const sourceKey = stripAlias(ds.joinSourceKey);
      const targetKey = stripAlias(ds.joinTargetKey) || sourceKey;

      if (!sourceKey || !targetKey) {
        issues.push({
          alias: ds.alias,
          message: `"${label}" não tem a chave de ligação definida. Escolha as chaves de origem e destino.`,
        });
        continue;
      }

      const sourceKeys = getJoinKeys(ds.catalogItem);
      const targetKeys = getJoinKeys(targetDs.catalogItem);

      if (!sourceKeys.includes(sourceKey)) {
        issues.push({
          alias: ds.alias,
          message: `"${sourceKey}" não é uma chave válida para "${label}". Chaves disponíveis: ${sourceKeys.join(", ") || "nenhuma"}`,
        });
      }
      if (!targetKeys.includes(targetKey)) {
        issues.push({
          alias: ds.alias,
          message: `"${targetKey}" não é uma chave válida para "${datasetLabel(targetDs.catalogItem)}". Chaves disponíveis: ${targetKeys.join(", ") || "nenhuma"}`,
        });
      }
    }

    // ── Sugestoes de combinacao ──────────────────────────
    for (const ds of selectedDatasets) {
      for (const available of availableDatasets) {
        const avKey = getDatasetKey(available);
        if (selectedKeys.has(avKey)) continue;

        const common = findCommonJoinKeys(ds.catalogItem, available);
        if (common.length === 0) continue;

        const preferredKey = pickPreferredJoinKey(common) ?? common[0];
        suggestions.push({
          sourceKey: ds.alias,
          targetKey: avKey,
          sourceDatasetName: datasetLabel(ds.catalogItem),
          targetDatasetName: datasetLabel(available),
          commonKeys: common,
          preferredKey,
          isDirectMatch: common.length >= 3,
        });
      }
    }

    // ── Fontes isoladas (sem chave comum com nenhuma outra) ──
    for (const [index, ds] of selectedDatasets.entries()) {
      if (index === 0) continue;
      const canJoin = selectedDatasets.some((other) => {
        if (other.alias === ds.alias) return false;
        return findCommonJoinKeys(ds.catalogItem, other.catalogItem).length > 0;
      });
      if (!canJoin) {
        issues.push({
          alias: ds.alias,
          message: `"${datasetLabel(ds.catalogItem)}" não compartilha chaves com nenhum outro dataset selecionado.`,
        });
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
      warnings: issues.map((issue) => issue.message),
      issues,
    };
  }, [selectedDatasets, availableDatasets]);
}

/** Opcoes de chave por dataset para os seletores do wizard. */
export function getJoinKeyOptions(item: DatasetCatalogItem | undefined | null) {
  return getJoinFieldOptions(item);
}

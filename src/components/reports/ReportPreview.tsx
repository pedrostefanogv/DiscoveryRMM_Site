import { useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Button, Card, DataTable, Loading } from "@/components/ui";
import type { Column } from "@/components/ui";
import { previewReportData } from "@/api/reports";
import { ReportDatasetType } from "@/api/types";
import toast from "react-hot-toast";

interface ReportPreviewProps {
  datasetType: ReportDatasetType;
  filters?: string;
  selectedFields?: string[];
}

export function ReportPreview({
  datasetType,
  filters,
  selectedFields,
}: ReportPreviewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const loadPreview = async () => {
    setIsLoading(true);
    try {
      const data = await previewReportData(
        datasetType,
        filters,
        10,
        selectedFields,
      );
      setPreviewData(data);
      setIsOpen(true);
    } catch (error) {
      toast.error("Erro ao carregar prévia dos dados");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen && !previewData) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={loadPreview}
        disabled={isLoading}
      >
        <Eye className="h-4 w-4" />
        {isLoading ? "Carregando..." : "Visualizar Prévia"}
      </Button>
    );
  }

  if (!previewData) return null;

  // Generate columns from first row or selected fields
  const allFields =
    previewData.length > 0 ? Object.keys(previewData[0]) : selectedFields || [];
  const displayFields = selectedFields?.length
    ? allFields.filter((f) => selectedFields.includes(f))
    : allFields;

  const columns: Column<any>[] = displayFields.map((field) => ({
    key: field,
    header: field,
    render: (row) => {
      const value = row[field];
      if (value === null || value === undefined) return "\u2014";
      if (typeof value === "boolean") return value ? "Sim" : "Não";
      if (field.toLowerCase().includes("date") || field.toLowerCase().includes("at")) {
        try {
          return new Date(value).toLocaleString("pt-BR");
        } catch {
          return String(value);
        }
      }
      if (typeof value === "number" && field.toLowerCase().includes("bytes")) {
        return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
      }
      return String(value);
    },
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Prévia dos Dados (10 registros)
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={loadPreview}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <Card padding={false} className="max-h-96 overflow-auto">
          <DataTable
            columns={columns}
            data={previewData}
            keyExtractor={(row: any) => String(previewData.indexOf(row))}
          />
        </Card>
      )}

      <p className="text-xs text-muted">
        Esta e uma previa real gerada pela API com os filtros atuais.
      </p>
    </div>
  );
}

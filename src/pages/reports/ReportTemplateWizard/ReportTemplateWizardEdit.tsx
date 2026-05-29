import { useParams, Navigate } from "react-router-dom";
import { Loading } from "@/components/ui";
import { useReportTemplate } from "@/hooks/useReportTemplates";
import { ReportTemplateWizard } from "@/pages/reports/ReportTemplateWizard";
import type { WizardState } from "@/pages/reports/ReportTemplateWizard/hooks/useWizardState";

/** Wrapper that loads an existing template and passes it to the wizard for editing */
export function ReportTemplateWizardEdit() {
  const { id } = useParams<{ id: string }>();
  const { data: template, isLoading, isError } = useReportTemplate(id ?? "");

  if (isLoading) return <Loading />;
  if (isError || !template) return <Navigate to="/reports/templates" replace />;

  // Parse layout JSON into wizard initial state
  let layout: Record<string, unknown> = {};
  try {
    layout = JSON.parse(template.layoutJson ?? "{}");
  } catch { /* use empty */ }

  const initial: Partial<WizardState> = {
    name: template.name,
    description: template.description ?? "",
    defaultFormat: (typeof template.defaultFormat === "string"
      ? template.defaultFormat.toLowerCase()
      : "xlsx") as WizardState["defaultFormat"],
    createdBy: template.createdBy ?? "",
    // Layout fields
    orientation: (layout.orientation as "portrait" | "landscape") ?? "landscape",
    groupBy: (layout.groupBy as string) ?? "",
    groupTitleTemplate: (layout.groupTitleTemplate as string) ?? "",
    hideGroupColumn: Boolean(layout.hideGroupColumn),
    // Note: full dataset/column parsing requires loading datasets catalog
    // For edit, the old form remains available at /reports/templates/list
  };

  return <ReportTemplateWizard initialTemplate={initial} />;
}

export default ReportTemplateWizardEdit;

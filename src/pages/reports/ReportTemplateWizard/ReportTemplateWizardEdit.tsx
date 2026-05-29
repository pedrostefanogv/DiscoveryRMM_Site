import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { Loading } from "@/components/ui";
import { useReportTemplate } from "@/hooks/useReportTemplates";
import type { ReportLayoutDefinition } from "@/api/types";
import { ReportTemplateWizard } from "@/pages/reports/ReportTemplateWizard";
import type { WizardState } from "@/pages/reports/ReportTemplateWizard/hooks/useWizardState";

/** Wrapper that loads an existing template and passes it to the wizard for editing */
export function ReportTemplateWizardEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get("clientId");
  const clientId =
    clientIdParam && clientIdParam !== "undefined" && clientIdParam !== "null"
      ? clientIdParam
      : undefined;
  const { data: template, isLoading, isError } = useReportTemplate(id ?? "", clientId);

  if (isLoading) return <Loading />;
  if (isError || !template) return <Navigate to="/reports/templates" replace />;

  // Parse layout JSON into wizard initial state
  let layout: Partial<ReportLayoutDefinition> = {};
  try {
    layout = JSON.parse(template.layoutJson ?? "{}") as Partial<ReportLayoutDefinition>;
  } catch { /* use empty */ }

  const layoutStyle = layout.style ?? {};
  const layoutWatermark = layout.watermark;
  const watermarkOpacityPercent = layoutWatermark?.imageOpacity !== undefined && layoutWatermark?.imageOpacity !== null
    ? String(Math.round(layoutWatermark.imageOpacity * 100))
    : "8";

  const initial: Partial<WizardState> = {
    name: template.name,
    subtitle: layout.subtitle ?? "",
    description: template.description ?? "",
    defaultFormat: (typeof template.defaultFormat === "string"
      ? template.defaultFormat.toLowerCase()
      : "xlsx") as WizardState["defaultFormat"],
    createdBy: template.createdBy ?? "",
    logoUrl: layout.logoUrl ?? layoutStyle.logoUrl ?? "",
    watermarkEnabled: Boolean(layoutWatermark?.useLogo),
    watermarkFit: layoutWatermark?.imageFit === "cover" ? "cover" : "contain",
    watermarkOpacityPercent,
    style: {
      primaryColor: layoutStyle.primaryColor ?? "#16324F",
      secondaryColor: layoutStyle.secondaryColor ?? "#EEF4F7",
      accentColor: layoutStyle.accentColor ?? "#3A7D44",
      headerBackgroundColor: layoutStyle.headerBackgroundColor ?? "#16324F",
      headerTextColor: layoutStyle.headerTextColor ?? "#FFFFFF",
      alternateRowColor: layoutStyle.alternateRowColor ?? "#EEF4F7",
      borderColor: layoutStyle.borderColor ?? "#D7E0E8",
      fontFamily: layoutStyle.fontFamily ?? "Segoe UI, sans-serif",
      logoUrl: layoutStyle.logoUrl ?? layout.logoUrl,
      logoMaxHeightPx: layoutStyle.logoMaxHeightPx,
      showRowStripes: layoutStyle.showRowStripes ?? true,
    },
    // Layout fields
    orientation: layout.orientation === "portrait" ? "portrait" : "landscape",
    groupBy: layout.groupBy ?? "",
    groupTitleTemplate: layout.groupTitleTemplate ?? "",
    hideGroupColumn: Boolean(layout.hideGroupColumn),
    // Note: full dataset/column parsing requires loading datasets catalog
    // For edit in the legacy flow, use /reports/templates/:id/edit
  };

  return <ReportTemplateWizard initialTemplate={initial} />;
}

export default ReportTemplateWizardEdit;

import { useMemo } from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { Loading } from "@/components/ui";
import { useReportTemplate } from "@/hooks/useReportTemplates";
import { ReportFormat, type ReportLayoutDefinition } from "@/api/types";
import { ReportTemplateWizard } from "@/pages/reports/ReportTemplateWizard";
import type { WizardState } from "@/pages/reports/ReportTemplateWizard/hooks/useWizardState";

function normalizeDefaultFormat(format: unknown): WizardState["defaultFormat"] {
  if (format === ReportFormat.Csv || format === 2) return "csv";
  if (format === ReportFormat.Markdown || format === 3) return "markdown";
  if (typeof format === "string") {
    const lower = format.toLowerCase();
    if (lower === "csv" || lower === "markdown" || lower === "xlsx") return lower;
  }
  return "xlsx";
}

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

  const layout = useMemo<Partial<ReportLayoutDefinition>>(() => {
    if (!template?.layoutJson) return {};
    try {
      return JSON.parse(template.layoutJson) as Partial<ReportLayoutDefinition>;
    } catch {
      return {};
    }
  }, [template?.layoutJson]);

  const initial = useMemo<Partial<WizardState> | undefined>(() => {
    if (!template) return undefined;
    const layoutStyle = layout.style ?? {};
    const layoutWatermark = layout.watermark;
    const watermarkLogoUrl = layoutWatermark?.logoUrl ?? layoutWatermark?.imageUrl ?? "";
    const watermarkOpacityPercent =
      layoutWatermark?.imageOpacity !== undefined && layoutWatermark?.imageOpacity !== null
        ? String(Math.round(layoutWatermark.imageOpacity * 100))
        : "8";

    return {
      name: template.name,
      subtitle: layout.subtitle ?? "",
      description: template.description ?? "",
      defaultFormat: normalizeDefaultFormat(template.defaultFormat),
      createdBy: template.createdBy ?? "",
      logoUrl: layout.logoUrl ?? layoutStyle.logoUrl ?? "",
      watermarkEnabled: Boolean(layoutWatermark?.useLogo || watermarkLogoUrl),
      watermarkLogoUrl,
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
      orientation: layout.orientation === "portrait" ? "portrait" : "landscape",
      groupTitleTemplate: layout.groupTitleTemplate ?? "",
      hideGroupColumn: Boolean(layout.hideGroupColumn),
    };
  }, [template, layout]);

  if (isLoading) return <Loading />;
  if (isError || !template || !initial) return <Navigate to="/reports/templates" replace />;

  return (
    <ReportTemplateWizard
      initialTemplate={initial}
      templateId={id}
      initialLayout={layout}
      initialDatasetType={template.datasetType}
    />
  );
}

export default ReportTemplateWizardEdit;

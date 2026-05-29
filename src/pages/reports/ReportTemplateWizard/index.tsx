import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loading } from "@/components/ui";
import { useReportDatasets } from "@/hooks/useReportDatasets";
import { useCreateReportTemplate } from "@/hooks/useReportTemplates";
import { useWizardState, WizardState } from "./hooks/useWizardState";
import { StepDataSources } from "./StepDataSources";
import { StepLayout } from "./StepLayout";
import { StepMetadata } from "./StepMetadata";
import { buildRunReportPath, resolveBuiltInTemplateId } from "../builtInTemplates";

interface Props {
  initialTemplate?: Partial<WizardState>;
}

export function ReportTemplateWizard({ initialTemplate }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const [step, setStep] = useState(0);
  const { data: datasets = [], isLoading } = useReportDatasets();
  const createMutation = useCreateReportTemplate();
  const legacyBuiltInTemplateId = resolveBuiltInTemplateId(searchParams.get("template"));

  const wizard = useWizardState(initialTemplate);

  useEffect(() => {
    if (!legacyBuiltInTemplateId) return;
    navigate(buildRunReportPath(legacyBuiltInTemplateId, clientId), { replace: true });
  }, [legacyBuiltInTemplateId, clientId, navigate]);

  const handleCreate = useCallback(async () => {
    const request = wizard.buildRequest();
    try {
      const result = await createMutation.mutateAsync(request as any);
      navigate(`/reports/templates/${result.id}/edit`);
    } catch {
      // Error handled by mutation
    }
  }, [wizard, createMutation, navigate]);

  if (isLoading || legacyBuiltInTemplateId) return <Loading />;

  const steps = [
    { title: "Fontes de Dados", subtitle: "Escolha os datasets e combine-os" },
    { title: "Organização", subtitle: "Defina colunas, agrupamentos e seções" },
    { title: "Metadados", subtitle: "Nome, formato e aparência" },
  ];

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                i === step
                  ? "bg-primary text-white"
                  : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-white/5 text-slate-400"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  i === step
                    ? "bg-white/20 text-white"
                    : i < step
                      ? "bg-primary text-white"
                      : "bg-white/10 text-slate-500"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <div className="text-left">
                <div>{s.title}</div>
                <div className="text-[10px] opacity-70">{s.subtitle}</div>
              </div>
            </button>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-8 ${i < step ? "bg-primary" : "bg-white/10"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="surface-card glass-card rounded-2xl border border-white/10 bg-surface/90 p-4 sm:p-6">
        {step === 0 && (
          <StepDataSources
            wizard={wizard}
            datasets={datasets}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepLayout
            wizard={wizard}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepMetadata
            wizard={wizard}
            onBack={() => setStep(1)}
            onCreate={handleCreate}
            isCreating={createMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

export default ReportTemplateWizard;

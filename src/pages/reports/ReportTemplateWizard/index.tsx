import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loading, ErrorDisplay, EmptyState } from "@/components/ui";
import { useReportDatasets } from "@/hooks/useReportDatasets";
import { useCreateReportTemplate, useUpdateReportTemplate } from "@/hooks/useReportTemplates";
import {
  useWizardState,
  WizardState,
  type HydratableLayout,
} from "./hooks/useWizardState";
import { StepDataSources } from "./StepDataSources";
import { StepLayout } from "./StepLayout";
import { StepMetadata } from "./StepMetadata";
import {
  extractValidationErrors,
  type TemplateValidationError,
} from "./validationErrors";
import { buildRunReportPath, resolveBuiltInTemplateId } from "../builtInTemplates";

interface Props {
  initialTemplate?: Partial<WizardState>;
  /** Quando presente, o wizard atualiza o template existente em vez de criar um novo. */
  templateId?: string;
  /**
   * Layout salvo do template em edicao. A reidratacao das fontes depende do
   * catalogo, que so chega depois, entao ela roda em um efeito abaixo.
   */
  initialLayout?: HydratableLayout | null;
}

export function ReportTemplateWizard({
  initialTemplate,
  templateId,
  initialLayout,
}: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get("clientId");
  const clientId =
    clientIdParam && clientIdParam !== "undefined" && clientIdParam !== "null"
      ? clientIdParam
      : undefined;
  const [step, setStep] = useState(0);
  // Erros de validacao devolvidos pelo backend (400 em layoutJson). Ficam em
  // estado para serem exibidos no passo de metadados sem perder o que o
  // usuario ja preencheu.
  const [submitErrors, setSubmitErrors] = useState<TemplateValidationError[]>([]);
  const {
    data: datasets = [],
    isLoading,
    isError,
    refetch,
  } = useReportDatasets();
  const createMutation = useCreateReportTemplate();
  const updateMutation = useUpdateReportTemplate();
  const legacyBuiltInTemplateId = resolveBuiltInTemplateId(searchParams.get("template"));

  const wizard = useWizardState(initialTemplate);

  useEffect(() => {
    if (!legacyBuiltInTemplateId) return;
    navigate(buildRunReportPath(legacyBuiltInTemplateId, clientId), { replace: true });
  }, [legacyBuiltInTemplateId, clientId, navigate]);

  // Reidrata fontes/colunas/agrupamento do template salvo. Depende do catalogo
  // (datasetType -> catalogItem), que chega de forma assincrona: por isso o
  // gatilho e "datasets.length", nao apenas a montagem do componente.
  //
  // Roda UMA vez por carregamento: o catalogo pode ser refetchado, e reidratar
  // de novo descartaria as edicoes que o usuario ja fez na tela.
  const { hydrateFromLayout } = wizard;
  const hydratedLayoutRef = useRef<HydratableLayout | null>(null);
  useEffect(() => {
    if (!initialLayout || datasets.length === 0) return;
    if (hydratedLayoutRef.current === initialLayout) return;
    hydratedLayoutRef.current = initialLayout;
    hydrateFromLayout(initialLayout, datasets);
  }, [initialLayout, datasets, hydrateFromLayout]);

  const handleCreate = useCallback(async () => {
    const request = wizard.buildRequest();
    // Limpa erros anteriores: sem isso uma tentativa antiga continuaria na tela
    // mesmo depois de o usuario corrigir o problema.
    setSubmitErrors([]);

    try {
      // Edicao: atualiza o template existente. Novo: mantem o create.
      if (templateId) {
        await updateMutation.mutateAsync({ id: templateId, data: request as any });
        const params = new URLSearchParams();
        if (clientId) params.set("clientId", clientId);
        const query = params.toString();
        navigate(`/reports/templates${query ? `?${query}` : ""}`);
        return;
      }

      const result = await createMutation.mutateAsync(request as any);
      const basePath = `/reports/templates/${result.id}/edit/wizard`;
      if (clientId) {
        const params = new URLSearchParams();
        params.set("clientId", clientId);
        navigate(`${basePath}?${params.toString()}`);
      } else {
        navigate(basePath);
      }
    } catch (error) {
      // O backend valida o layout no create/update e devolve 400 com
      // "errors": [{ code, message, field }]. Antes este catch engolia a
      // excecao e o usuario clicava em "Criar" sem ver nada acontecer.
      const errors = extractValidationErrors(error);
      setSubmitErrors(
        errors.length > 0
          ? errors
          : [
              {
                message:
                  "Não foi possível salvar o template. Tente novamente em instantes.",
              },
            ],
      );
      // Mantem o usuario na tela, com o estado do wizard intacto: nao navega
      // e nao reseta nenhum passo.
    }
  }, [wizard, createMutation, updateMutation, templateId, navigate, clientId]);

  if (isLoading || legacyBuiltInTemplateId) return <Loading />;

  if (isError) {
    return (
      <div className="surface-card glass-card rounded-2xl border border-border bg-surface/90 p-6">
        <ErrorDisplay
          message="Não foi possível carregar os datasets disponíveis. Verifique se o serviço de relatórios está ativo e tente novamente."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="surface-card glass-card rounded-2xl border border-border bg-surface/90 p-6">
        <EmptyState
          title="Nenhum dataset disponível"
          description="O catálogo de datasets está vazio. Entre em contato com o administrador."
        />
      </div>
    );
  }

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
                    : "bg-surface-light text-muted"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  i === step
                    ? "bg-white/20 text-white"
                    : i < step
                      ? "bg-primary text-white"
                      : "bg-surface-hover text-muted"
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
                className={`h-px w-8 ${i < step ? "bg-primary" : "bg-surface-hover"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="surface-card glass-card rounded-2xl border border-border bg-surface/90 p-4 sm:p-6">
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
            isCreating={createMutation.isPending || updateMutation.isPending}
            submitErrors={submitErrors}
            isEditing={Boolean(templateId)}
          />
        )}
      </div>
    </div>
  );
}

export default ReportTemplateWizard;

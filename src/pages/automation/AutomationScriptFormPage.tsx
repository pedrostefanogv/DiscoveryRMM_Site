import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Input,
  Loading,
  PageHeader,
  Select,
  TextArea,
} from '@/components/ui';
import {
  AutomationScriptType,
  type AutomationScriptDetail,
  type CreateAutomationScriptRequest,
  type UpdateAutomationScriptRequest,
} from '@/api';
import { CustomFieldsUsedByPanel } from '@/components/custom-fields/CustomFieldsUsedByPanel';
import { useClients } from '@/hooks/useClients';
import {
  useAutomationScript,
  useCreateAutomationScript,
  useUpdateAutomationScript,
} from '@/hooks/useAutomation';
import { buildCorrelationId } from './automationTasksUtils';
import { ScriptContentEditor } from './ScriptContentEditor';
import { languageForScriptType } from './scriptLanguages';
import { validateJsonField, validateScriptSyntax } from './scriptValidation';

export const scriptTypeOptions = [
  { value: String(AutomationScriptType.PowerShell), label: 'PowerShell' },
  { value: String(AutomationScriptType.Shell), label: 'Shell' },
  { value: String(AutomationScriptType.Python), label: 'Python' },
  { value: String(AutomationScriptType.Batch), label: 'Batch' },
  { value: String(AutomationScriptType.Custom), label: 'Custom' },
];

type ScriptFormState = {
  clientId: string;
  name: string;
  summary: string;
  scriptType: string;
  version: string;
  executionFrequency: string;
  triggerModesCsv: string;
  content: string;
  parametersSchemaJson: string;
  metadataJson: string;
  isActive: boolean;
};

const emptyForm: ScriptFormState = {
  clientId: '',
  name: '',
  summary: '',
  scriptType: String(AutomationScriptType.PowerShell),
  version: '1.0.0',
  executionFrequency: 'manual',
  triggerModesCsv: 'manual',
  content: '',
  parametersSchemaJson: '',
  metadataJson: '',
  isActive: true,
};

function formFromDetail(detail: AutomationScriptDetail): ScriptFormState {
  return {
    clientId: detail.clientId ?? '',
    name: detail.name,
    summary: detail.summary,
    scriptType: String(detail.scriptType),
    version: detail.version,
    executionFrequency: detail.executionFrequency,
    triggerModesCsv: detail.triggerModes.join(', '),
    content: detail.content,
    parametersSchemaJson: detail.parametersSchemaJson ?? '',
    metadataJson: detail.metadataJson ?? '',
    isActive: detail.isActive,
  };
}

/**
 * Página dedicada de criação/edição de script de automação.
 *
 * Antes era um modal: com o editor de conteúdo + os JSONs opcionais o formulário
 * estourava a viewport e o botão salvar ficava fora de alcance. Aqui a própria
 * página rola no <main> do layout, a barra de ações fica fixa no rodapé e o
 * formulário tem URL própria (deep link e refresh preservam o contexto).
 */
export default function AutomationScriptFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const detail = useAutomationScript(id ?? '');
  const backToList = () => navigate('/automation/scripts');

  if (isEdit && detail.isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Editar script"
          description="Não foi possível carregar o script."
          onBack={backToList}
        />
        <ErrorDisplay onRetry={() => detail.refetch()} />
      </div>
    );
  }

  if (isEdit && (detail.isLoading || !detail.data)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Editar script" onBack={backToList} />
        <Loading message="Carregando script..." />
      </div>
    );
  }

  return (
    <ScriptForm
      key={id ?? 'new'}
      editId={id ?? null}
      initial={isEdit && detail.data ? formFromDetail(detail.data) : emptyForm}
    />
  );
}

function ScriptForm({ editId, initial }: { editId: string | null; initial: ScriptFormState }) {
  const navigate = useNavigate();
  const clients = useClients();
  const create = useCreateAutomationScript();
  const update = useUpdateAutomationScript();
  const isSaving = create.isPending || update.isPending;
  const [form, setForm] = useState<ScriptFormState>(initial);

  // Snapshot do que está persistido: base do aviso de alterações não salvas.
  const savedSnapshotRef = useRef(JSON.stringify(initial));
  const isDirty = JSON.stringify(form) !== savedSnapshotRef.current;
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const backToList = () => navigate('/automation/scripts');
  // Após salvar, substitui a entrada do formulário no histórico para que o
  // "voltar" do navegador não reabra o formulário com estado antigo.
  const backToSavedList = () => navigate('/automation/scripts', { replace: true });

  const set = <K extends keyof ScriptFormState>(key: K, value: ScriptFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const clientOptions = [
    { value: '', label: 'Global (todos os clientes)' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];

  const handleSubmit = () => {
    const name = form.name.trim();
    const summary = form.summary.trim();
    const content = form.content.trim();
    const triggerModes = Array.from(
      new Set(
        form.triggerModesCsv
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

    if (!name) return toast.error('Nome obrigatorio');
    if (name.length > 200) return toast.error('Nome deve ter no máximo 200 caracteres');
    if (!summary) return toast.error('Resumo obrigatorio');
    if (summary.length > 2000) return toast.error('Resumo deve ter no máximo 2000 caracteres');
    if (!content) return toast.error('Conteudo obrigatorio');
    if (content.length > 200000) return toast.error('Conteudo acima do limite');
    if (!triggerModes.length) return toast.error('Informe ao menos um trigger mode');

    // Validacao de sintaxe do conteudo conforme o tipo selecionado.
    const language = languageForScriptType(form.scriptType);
    const syntaxErrors = validateScriptSyntax(form.content, language).filter(
      (issue) => issue.severity === 'error',
    );
    if (syntaxErrors.length) {
      return toast.error(
        `Corrija ${syntaxErrors.length} erro(s) de sintaxe (linha ${syntaxErrors[0].line}): ${syntaxErrors[0].message}`,
      );
    }

    // JSONs opcionais tambem precisam estar bem formados.
    const jsonIssue =
      validateJsonField('ParametersSchemaJson', form.parametersSchemaJson) ??
      validateJsonField('MetadataJson', form.metadataJson);
    if (jsonIssue) return toast.error(jsonIssue.message);

    const basePayload: CreateAutomationScriptRequest = {
      clientId: form.clientId || null,
      name,
      summary,
      scriptType: Number(form.scriptType) as AutomationScriptType,
      version: form.version.trim() || '1.0.0',
      executionFrequency: form.executionFrequency.trim() || 'manual',
      triggerModes,
      content,
      parametersSchemaJson: form.parametersSchemaJson.trim() || null,
      metadataJson: form.metadataJson.trim() || null,
      isActive: form.isActive,
    };

    // Marca o snapshot como persistido ANTES de navegar: senão o aviso de
    // alterações não salvas bloquearia a própria navegação pós-save.
    const savedSnapshot = JSON.stringify(form);
    const onSuccess = (message: string) => {
      savedSnapshotRef.current = savedSnapshot;
      dirtyRef.current = false;
      toast.success(message);
      backToSavedList();
    };
    const onError = () => toast.error(editId ? 'Falha ao atualizar script' : 'Falha ao criar script');

    if (editId) {
      const payload: UpdateAutomationScriptRequest = { ...basePayload, content };
      update.mutate(
        {
          id: editId,
          data: payload,
          correlationId: buildCorrelationId('script-update'),
        },
        { onSuccess: () => onSuccess('Script atualizado'), onError },
      );
      return;
    }

    create.mutate(
      {
        data: basePayload,
        correlationId: buildCorrelationId('script-create'),
      },
      { onSuccess: () => onSuccess('Script criado'), onError },
    );
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <PageHeader
        title={editId ? 'Editar script' : 'Novo script'}
        description="Catálogo de scripts reutilizáveis. Escolha o escopo, o tipo e o conteúdo; os JSONs opcionais descrevem o contrato do script com o agente."
        onBack={backToList}
      />

      <Card>
        <CardHeader
          title="Identificação"
          subtitle="Como o script aparece no catálogo e em qual escopo ele pode ser usado."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="Cliente"
            options={clientOptions}
            value={form.clientId}
            onChange={(event) => set('clientId', event.target.value)}
            hint="Global = disponível para todos os clientes."
          />
          <Select
            label="Status"
            options={[
              { value: 'true', label: 'Ativo' },
              { value: 'false', label: 'Inativo' },
            ]}
            value={String(form.isActive)}
            onChange={(event) => set('isActive', event.target.value === 'true')}
            hint="Inativo sai do policy-sync: o agente para de recebê-lo (as tarefas que o referenciam não são apagadas)."
          />
          <Input
            label="Nome *"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            hint="Até 200 caracteres."
          />
          <Input
            label="Versão"
            value={form.version}
            onChange={(event) => set('version', event.target.value)}
            hint="Rótulo de versão exibido no catálogo e no payload (ex.: 1.0.0)."
          />
          <div className="md:col-span-2">
            <TextArea
              label="Resumo *"
              rows={2}
              value={form.summary}
              onChange={(event) => set('summary', event.target.value)}
              hint="Obrigatório (até 2000 caracteres). É o texto que o operador lê ao escolher o script na tarefa."
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Execução declarada"
          subtitle="Metadados de catálogo: descrevem o script e viajam no payload de consumo/auditoria. Quem agenda de fato é a tarefa de automação."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="ScriptType"
            options={scriptTypeOptions}
            value={form.scriptType}
            onChange={(event) => set('scriptType', event.target.value)}
            hint="Define a linguagem executada pelo agente e o editor (realce, indentação e modelo)."
          />
          <Input
            label="ExecutionFrequency"
            value={form.executionFrequency}
            onChange={(event) => set('executionFrequency', event.target.value)}
            hint="Rótulo de frequência esperada (ex.: manual, diária, semanal). Informativo: não cria agendamento — o cron/recorrência vem do gatilho da tarefa."
          />
          <Input
            label="TriggerModes (csv)"
            value={form.triggerModesCsv}
            onChange={(event) => set('triggerModesCsv', event.target.value)}
            hint="Lista de rótulos separados por vírgula (ex.: manual, agent-checkin, user-login). Declarativo: ajuda a filtrar/entender o catálogo; o disparo real está nos gatilhos da tarefa."
          />
          <div className="rounded-lg border border-border bg-surface-light p-3 text-xs text-muted md:col-span-2">
            <p className="font-medium text-foreground">Onde o disparo real é configurado</p>
            <p className="mt-1">
              Em <strong>Tarefas de automação</strong>: TriggerImmediate, TriggerRecurring (ScheduleCron),
              TriggerOnUserLogin e TriggerOnAgentCheckIn. O script é apenas o conteúdo executado —
              ExecutionFrequency e TriggerModes aqui servem para documentar e organizar o catálogo.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Conteúdo"
          subtitle="O que o agente executa. A apresentação acompanha o ScriptType selecionado."
        />
        <ScriptContentEditor
          label="Conteudo do script *"
          scriptType={form.scriptType}
          value={form.content}
          onChange={(content) => set('content', content)}
          hint="Sintaxe validada antes de salvar; erros de sintaxe bloqueiam o envio."
        />
      </Card>

      <Card>
        <CardHeader
          title="Contrato com o agente (opcional)"
          subtitle="Estes dois JSONs são gravados no script e entregues ao agente no policy-sync e no payload de consumo. Preencha só quando houver necessidade."
        />
        <div className="space-y-3">
          <TextArea
            label="ParametersSchemaJson"
            className="font-mono"
            rows={6}
            value={form.parametersSchemaJson}
            onChange={(event) => set('parametersSchemaJson', event.target.value)}
            hint="JSON Schema dos parâmetros aceitos pelo script (nome, tipo, default, enum, required). Útil quando o mesmo script é reutilizado com valores diferentes, quando você documenta/valida o que a tarefa deve enviar em CommandPayload, e quando o script é exposto como ferramenta para IA/automação externa. Deixe vazio quando o script não recebe parâmetros."
          />
          <TextArea
            label="MetadataJson"
            className="font-mono"
            rows={6}
            value={form.metadataJson}
            onChange={(event) => set('metadataJson', event.target.value)}
            hint="JSON livre entregue ao agente junto do conteúdo. Chaves conhecidas são interpretadas: o bloco psadtWelcome/welcome (allowDefer, deferTimes, deferDeadline, forceCountdownSeconds, closeProcesses...) sobrescreve as opções do prompt PSADT. Também é o lugar de anotações (autor, origem, tags, changelog)."
          />
        </div>
      </Card>

      {editId ? (
        <Card>
          <CardHeader
            title="Integrações"
            subtitle="Vínculos já existentes deste script com o restante da plataforma."
          />
          <CustomFieldsUsedByPanel scriptId={editId} />
          <p className="text-xs text-muted">
            Os campos customizados vinculados aparecem acima quando você tem permissão de configuração.
          </p>
        </Card>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 -mb-8 flex justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="ghost" onClick={backToList}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSaving}>
          <Save className="h-4 w-4" /> {editId ? 'Salvar' : 'Criar'}
        </Button>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Descartar alterações?"
        message="Há alterações não salvas neste script. Se sair agora, elas serão perdidas."
        confirmLabel="Descartar e sair"
        cancelLabel="Continuar editando"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </form>
  );
}

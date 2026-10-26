import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Icon,
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
import { ScriptContentEditor } from '@/components/script/ScriptContentEditor';
import { languageForScriptType } from '@/components/script/scriptLanguages';
import { validateScriptSyntax } from '@/components/script/scriptValidation';

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
  content: string;
  isActive: boolean;
};

const emptyForm: ScriptFormState = {
  clientId: '',
  name: '',
  summary: '',
  scriptType: String(AutomationScriptType.PowerShell),
  version: '1.0.0',
  content: '',
  isActive: true,
};

/**
 * Normaliza o ScriptType para o valor usado pelo <Select> ("0".."4").
 *
 * A API serializa enums como NOME ("PowerShell") por causa do
 * JsonStringEnumConverter, enquanto as opções do select são numéricas. Sem esta
 * normalização o payload saía com `Number("PowerShell")` = NaN, o JSON virava
 * `"scriptType": null` e o PUT respondia 400.
 */
const SCRIPT_TYPE_OPTION_VALUES = scriptTypeOptions.map((option) => option.value);

function scriptTypeOptionValue(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (SCRIPT_TYPE_OPTION_VALUES.includes(text)) return text;

  const numeric = Number(text);
  if (!Number.isNaN(numeric) && SCRIPT_TYPE_OPTION_VALUES.includes(String(numeric))) {
    return String(numeric);
  }

  const named = Object.entries(AutomationScriptType).find(
    ([name]) => name.toLowerCase() === text.toLowerCase(),
  );
  if (named && SCRIPT_TYPE_OPTION_VALUES.includes(String(named[1]))) return String(named[1]);

  // Valor desconhecido (enum novo no backend): preserva como Custom em vez de
  // trocar o tipo silenciosamente para PowerShell no próximo save.
  return String(AutomationScriptType.Custom);
}

function formFromDetail(detail: AutomationScriptDetail): ScriptFormState {
  return {
    clientId: detail.clientId ?? '',
    name: detail.name,
    summary: detail.summary,
    scriptType: scriptTypeOptionValue(detail.scriptType),
    version: detail.version,
    content: detail.content,
    isActive: detail.isActive,
  };
}

/**
 * Página dedicada de criação/edição de script de automação.
 *
 * Antes era um modal: com o editor de conteúdo o formulário estourava a viewport
 * e o botão salvar ficava fora de alcance. Aqui a própria página rola no <main>
 * do layout, a barra de ações fica fixa no rodapé e o formulário tem URL própria
 * (deep link e refresh preservam o contexto).
 *
 * O script é só escopo + tipo + conteúdo: os metadados declarativos
 * (ExecutionFrequency/TriggerModes) e os JSONs de contrato (ParametersSchemaJson/
 * MetadataJson) foram removidos do produto — agendamento e comportamento vêm da
 * tarefa de automação (gatilhos e CommandPayload).
 */
export default function AutomationScriptFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  // Em edição sempre revalida na montagem: montar o form a partir do cache e
  // salvar por cima descartaria uma alteração feita por outro usuário.
  const detail = useAutomationScript(id ?? '', { refetchOnMount: 'always' });
  const mountedAtRef = useRef(Date.now());
  const backToList = () => navigate('/automation/scripts');
  // Refetches posteriores (foco/reconexão) não bloqueiam o form para não
  // descartar o que está sendo digitado.
  const awaitingFreshDetail =
    isEdit && detail.isFetching && detail.dataUpdatedAt < mountedAtRef.current;

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

  if (isEdit && (detail.isLoading || awaitingFreshDetail || !detail.data)) {
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

    if (!name) return toast.error('Nome obrigatorio');
    if (name.length > 200) return toast.error('Nome deve ter no máximo 200 caracteres');
    if (!summary) return toast.error('Resumo obrigatorio');
    if (summary.length > 2000) return toast.error('Resumo deve ter no máximo 2000 caracteres');
    if (!content) return toast.error('Conteudo obrigatorio');
    if (content.length > 200000) return toast.error('Conteudo acima do limite');

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

    const payload: CreateAutomationScriptRequest = {
      clientId: form.clientId || null,
      name,
      summary,
      scriptType: Number(scriptTypeOptionValue(form.scriptType)) as AutomationScriptType,
      version: form.version.trim() || '1.0.0',
      content,
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
      const updatePayload: UpdateAutomationScriptRequest = payload;
      update.mutate(
        {
          id: editId,
          data: updatePayload,
          correlationId: buildCorrelationId('script-update'),
        },
        { onSuccess: () => onSuccess('Script atualizado'), onError },
      );
      return;
    }

    create.mutate(
      {
        data: payload,
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
        description="Escolha o escopo, o tipo e o conteúdo. Quem agenda e parametriza a execução é a tarefa de automação."
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
            disabled={Boolean(editId)}
            onChange={(event) => set('clientId', event.target.value)}
            hint={
              editId
                ? 'O escopo não muda em um script existente (a API ignora ClientId no update): crie um novo script para outro cliente.'
                : 'Global = disponível para todos os clientes.'
            }
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
            hint="Rótulo de versão exibido no catálogo (ex.: 1.0.0)."
          />
          <Select
            label="ScriptType"
            options={scriptTypeOptions}
            value={form.scriptType}
            onChange={(event) => set('scriptType', event.target.value)}
            hint="Define a linguagem executada pelo agente e o editor (realce, indentação e modelo)."
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
          <Icon name="save" className="h-4 w-4" /> {editId ? 'Salvar' : 'Criar'}
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

import {
  CustomFieldRuntimeAccessMode,
  CustomFieldScopeType,
  getCustomFieldRuntimeAccessModeLabel,
} from '@/api';
import { Button, Select } from '@/components/ui';

/** Linha da tabela de vínculos (tarefa OU script) enquanto está sendo editada. */
export interface AccessBindingDraft {
  taskId: string;
  scriptId: string;
  canRead: boolean;
  canWrite: boolean;
}

/** Estado das capacidades no formulário de definição. */
export interface CustomFieldCapabilitiesValue {
  allowRuntimeRead: boolean;
  allowAgentWrite: boolean;
  runtimeAccessMode: CustomFieldRuntimeAccessMode;
  allowWebRead: boolean;
  allowWebEdit: boolean;
  isPinned: boolean;
  accessBindings: AccessBindingDraft[];
}

export const defaultCapabilitiesValue: CustomFieldCapabilitiesValue = {
  allowRuntimeRead: false,
  allowAgentWrite: false,
  runtimeAccessMode: CustomFieldRuntimeAccessMode.Disabled,
  allowWebRead: true,
  allowWebEdit: true,
  isPinned: false,
  accessBindings: [],
};

/** Opção combinada de tarefa/script: value = "task:<id>" | "script:<id>". */
export interface AutomationBindingOption {
  value: string;
  label: string;
}

interface Props {
  value: CustomFieldCapabilitiesValue;
  onChange: (patch: Partial<CustomFieldCapabilitiesValue>) => void;
  scopeType: CustomFieldScopeType;
  bindingOptions: AutomationBindingOption[];
}

function bindingOptionValue(binding: AccessBindingDraft): string {
  if (binding.taskId) return `task:${binding.taskId}`;
  if (binding.scriptId) return `script:${binding.scriptId}`;
  return '';
}

/**
 * Bloco "Quem pode acessar este campo": capacidades do agente remoto (scripts)
 * e do portal (suporte), escopo de execução, destaque no card e a tabela de
 * vínculos usada no modo restrito.
 */
export function CustomFieldCapabilitiesEditor({ value, onChange, scopeType, bindingOptions }: Props) {
  const isAgentScope = scopeType === CustomFieldScopeType.Agent;
  const runtimeDisabled = value.runtimeAccessMode === CustomFieldRuntimeAccessMode.Disabled;
  const restricted = value.runtimeAccessMode === CustomFieldRuntimeAccessMode.RestrictedTaskScript;
  const activeBindings = value.accessBindings.filter(binding => binding.taskId || binding.scriptId);
  const missingBindings = restricted && activeBindings.length === 0;

  function patchBinding(index: number, patch: Partial<AccessBindingDraft>) {
    onChange({
      accessBindings: value.accessBindings.map((binding, current) =>
        current === index ? { ...binding, ...patch } : binding,
      ),
    });
  }

  function updateBindingTarget(index: number, optionValue: string) {
    const separator = optionValue.indexOf(':');
    const kind = separator > 0 ? optionValue.slice(0, separator) : '';
    const id = separator > 0 ? optionValue.slice(separator + 1) : '';
    patchBinding(index, {
      taskId: kind === 'task' ? id : '',
      scriptId: kind === 'script' ? id : '',
    });
  }

  function toggleAgentRead(checked: boolean) {
    onChange({
      allowRuntimeRead: checked,
      // Sem um modo de execução ativo a capacidade não teria efeito.
      runtimeAccessMode: checked && runtimeDisabled ? CustomFieldRuntimeAccessMode.Public : value.runtimeAccessMode,
    });
  }

  function toggleAgentWrite(checked: boolean) {
    onChange({
      allowAgentWrite: checked,
      runtimeAccessMode: checked && runtimeDisabled ? CustomFieldRuntimeAccessMode.Public : value.runtimeAccessMode,
    });
  }

  function toggleWebRead(checked: boolean) {
    onChange({
      allowWebRead: checked,
      // Não existe "editar sem ver": desligar a leitura desliga a edição.
      allowWebEdit: checked ? value.allowWebEdit : false,
    });
  }

  function toggleWebEdit(checked: boolean) {
    onChange({
      allowWebEdit: checked,
      allowWebRead: checked ? true : value.allowWebRead,
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-light p-4">
      <h3 className="text-sm font-medium text-foreground">Quem pode acessar este campo</h3>
      <p className="mt-1 text-xs text-muted">
        Defina o que o agente remoto (scripts e tarefas) e o portal (suporte) podem fazer com este campo.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Agente remoto</legend>
          <label className="mt-1 flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={value.allowRuntimeRead}
              onChange={event => toggleAgentRead(event.target.checked)}
            />
            <span>
              Pode <strong>ler</strong> nos scripts
              <span className="block text-xs text-muted">
                O valor entra na variável MDZ_CUSTOM_FIELDS do script/tarefa.
              </span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={value.allowAgentWrite}
              disabled={!isAgentScope}
              onChange={event => toggleAgentWrite(event.target.checked)}
            />
            <span className={isAgentScope ? '' : 'opacity-60'}>
              Pode <strong>gravar/atualizar</strong>
              <span className="block text-xs text-muted">
                {isAgentScope
                  ? 'O script pode coletar o valor (MDZ_COLLECT) e gravar no cadastro do agente.'
                  : 'Disponível apenas para campos com escopo Agente.'}
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Portal (suporte)</legend>
          <label className="mt-1 flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={value.allowWebRead}
              onChange={event => toggleWebRead(event.target.checked)}
            />
            <span>
              Pode <strong>ver</strong> no detalhe
              <span className="block text-xs text-muted">
                O campo aparece no card de campos customizados (agente/cliente/site).
              </span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={value.allowWebEdit}
              onChange={event => toggleWebEdit(event.target.checked)}
            />
            <span>
              Pode <strong>editar</strong>
              <span className="block text-xs text-muted">
                Exige também a permissão de edição da entidade (agente/cliente/site).
              </span>
            </span>
          </label>
        </fieldset>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Select
          label="Escopo de execução no agente"
          value={String(value.runtimeAccessMode)}
          options={Object.values(CustomFieldRuntimeAccessMode)
            .filter((mode): mode is CustomFieldRuntimeAccessMode => typeof mode === 'number')
            .map(mode => ({ value: String(mode), label: getCustomFieldRuntimeAccessModeLabel(mode) }))}
          hint="Público libera para qualquer execução; restrito exige vínculo abaixo."
          onChange={event =>
            onChange({ runtimeAccessMode: Number(event.target.value) as CustomFieldRuntimeAccessMode })
          }
        />
        <label className="mt-6 flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border"
            checked={value.isPinned}
            onChange={event => onChange({ isPinned: event.target.checked })}
          />
          <span>
            Destacar no card do detalhe
            <span className="block text-xs text-muted">O campo aparece antes dos demais.</span>
          </span>
        </label>
      </div>

      {restricted && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
              Vínculos de tarefas e scripts
            </h4>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                onChange({
                  accessBindings: [
                    ...value.accessBindings,
                    { taskId: '', scriptId: '', canRead: true, canWrite: false },
                  ],
                })
              }
            >
              Adicionar vínculo
            </Button>
          </div>

          {value.accessBindings.length === 0 ? (
            <p className="mt-2 text-xs text-warning">
              O modo restrito exige ao menos um vínculo — adicione uma tarefa ou script.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {value.accessBindings.map((binding, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-border p-2 lg:grid-cols-[1fr_auto_auto_auto]">
                  <Select
                    label="Tarefa ou script"
                    value={bindingOptionValue(binding)}
                    options={[{ value: '', label: 'Selecione...' }, ...bindingOptions]}
                    onChange={event => updateBindingTarget(index, event.target.value)}
                  />
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={binding.canRead}
                      onChange={event => patchBinding(index, { canRead: event.target.checked })}
                    />
                    Ler
                  </label>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={binding.canWrite}
                      onChange={event => patchBinding(index, { canWrite: event.target.checked })}
                    />
                    Gravar
                  </label>
                  <div className="flex items-end pb-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          accessBindings: value.accessBindings.filter((_, current) => current !== index),
                        })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {missingBindings && value.accessBindings.length > 0 && (
            <p className="mt-2 text-xs text-warning">
              Preencha a tarefa/script de cada vínculo (linhas sem alvo são descartadas).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

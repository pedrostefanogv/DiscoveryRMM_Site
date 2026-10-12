import {
  getCustomFieldRuntimeAccessModeLabel,
  getCustomFieldScopeLabel,
} from '@/api';
import { Badge } from '@/components/ui';
import { useCustomFieldsBoundToExecution } from '@/hooks';

interface Props {
  taskId?: string;
  scriptId?: string;
}

/**
 * Visão reversa: quais campos customizados esta tarefa/script pode ler ou
 * gravar. Silencioso quando não há vínculo ou quando o usuário não tem
 * permissão de configuração (o pedido falha e o painel simplesmente não aparece).
 */
export function CustomFieldsUsedByPanel({ taskId, scriptId }: Props) {
  const query = useCustomFieldsBoundToExecution({ taskId, scriptId });
  const fields = query.data ?? [];

  if (!taskId && !scriptId) return null;
  if (query.isError || fields.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-light p-3">
      <h3 className="text-sm font-medium text-foreground">
        {taskId ? 'Campos customizados desta tarefa' : 'Campos customizados deste script'}
      </h3>
      <p className="mt-1 text-xs text-muted">
        Campos vinculados a esta execução e o que ela pode fazer com cada um.
      </p>

      <ul className="mt-2 space-y-2">
        {fields.map(field => {
          const binding = field.accessBindings.find(item =>
            taskId ? item.taskId === taskId : item.scriptId === scriptId,
          );

          return (
            <li key={field.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{field.label}</span>
              <span className="font-mono text-[11px] text-muted">{field.name}</span>
              <Badge color="slate">{getCustomFieldScopeLabel(field.scopeType)}</Badge>
              {binding?.canRead ? <Badge color="accent">Pode ler</Badge> : null}
              {binding?.canWrite ? <Badge color="accent">Pode gravar</Badge> : null}
              <span className="text-xs text-muted">
                {getCustomFieldRuntimeAccessModeLabel(field.runtimeAccessMode)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded border border-border p-2 text-[11px] text-muted">
        <p className="font-medium text-foreground">Como usar no script</p>
        <p className="mt-1">
          Leitura: <span className="font-mono">$env:MDZ_CUSTOM_FIELDS</span> traz um JSON com chave → valor
          (campos secretos nunca são enviados ao agente).
        </p>
        <p>
          Gravação: imprima no stdout uma linha{' '}
          <span className="font-mono">{'MDZ_COLLECT: {"name":"chave","value":"..."}'}</span>.
        </p>
      </div>
    </div>
  );
}

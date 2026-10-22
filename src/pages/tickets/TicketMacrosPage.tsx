import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, Modal, Select, TextArea } from '@/components/ui';
import {
  useTicketMacros, useCreateTicketMacro, useUpdateTicketMacro, useDeleteTicketMacro,
} from '@/hooks/useSupportProductivity';
import { useAutomationScripts } from '@/hooks/useAutomation';
import type { TicketMacroDto, TicketMacroRunbookStep, UpsertTicketMacroRequest } from '@/api';
import toast from 'react-hot-toast';

const EMPTY: UpsertTicketMacroRequest = { clientId: null, departmentId: null, name: '', description: null, content: '', isActive: true, runbookSteps: null };

/**
 * Editor SIMPLES de passos de runbook: adicionar, remover e reordenar passos;
 * cada passo aponta para um script de automação (api/automation), com args e
 * label de evidência opcionais.
 */
function RunbookStepsEditor({ steps, onChange }: { steps: TicketMacroRunbookStep[]; onChange: (steps: TicketMacroRunbookStep[]) => void }) {
  const scripts = useAutomationScripts({ activeOnly: true, limit: 200 });
  const scriptOptions = [
    { value: '', label: 'Selecione um script...' },
    ...((scripts.data as { items?: { id: string; name: string }[] } | undefined)?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const addStep = () => {
    onChange([...steps, { order: steps.length + 1, automationScriptId: '', argsJson: null, evidenceLabel: null }]);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const update = (index: number, patch: Partial<TicketMacroRunbookStep>) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="runbook-steps-editor">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Passos do runbook</span>
        <Button size="sm" variant="secondary" onClick={addStep} type="button">
          <Plus className="h-4 w-4" /> Passo
        </Button>
      </div>
      {steps.length === 0 && (
        <p className="text-xs text-muted">Sem passos — macro de resposta simples.</p>
      )}
      {steps.map((step, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted">#{index + 1}</span>
          <Select
            aria-label={`Script do passo ${index + 1}`}
            fullWidth={false}
            className="min-w-[220px] flex-1"
            value={step.automationScriptId}
            onChange={(e) => update(index, { automationScriptId: e.target.value })}
            options={scriptOptions}
          />
          <Input
            aria-label={`Argumentos do passo ${index + 1} (JSON)`}
            className="w-40"
            placeholder="args JSON"
            value={step.argsJson ?? ''}
            onChange={(e) => update(index, { argsJson: e.target.value || null })}
          />
          <Input
            aria-label={`Evidência do passo ${index + 1}`}
            className="w-40"
            placeholder="evidência"
            value={step.evidenceLabel ?? ''}
            onChange={(e) => update(index, { evidenceLabel: e.target.value || null })}
          />
          <button type="button" aria-label="Mover passo para cima" className="p-1 text-muted hover:text-foreground disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)}>
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Mover passo para baixo" className="p-1 text-muted hover:text-foreground disabled:opacity-30" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Remover passo" className="p-1 text-muted hover:text-danger" onClick={() => onChange(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {scripts.isError && <p className="text-xs text-danger">Erro ao carregar scripts de automação.</p>}
    </div>
  );
}

export default function TicketMacrosPage() {
  const macros = useTicketMacros({ includeGlobal: true });
  const create = useCreateTicketMacro();
  const update = useUpdateTicketMacro();
  const remove = useDeleteTicketMacro();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertTicketMacroRequest>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<TicketMacroDto | null>(null);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (m: TicketMacroDto) => {
    setEditId(m.id);
    setForm({ clientId: m.clientId, departmentId: m.departmentId, name: m.name, description: m.description, content: m.content, isActive: m.isActive, runbookSteps: m.runbookSteps ?? null });
    setOpen(true);
  };

  const submit = () => {
    if (form.name.trim().length < 2 || form.content.trim().length < 2) {
      toast.error('Informe nome e conteúdo da macro.');
      return;
    }
    const opts = { onSuccess: () => { toast.success(editId ? 'Macro atualizada' : 'Macro criada'); setOpen(false); }, onError: () => toast.error('Erro ao salvar macro') };
    if (editId) update.mutate({ id: editId, data: form }, opts);
    else create.mutate(form, opts);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Macros de resposta</h1>
          <p className="text-sm text-muted">Respostas rápidas reutilizáveis em comentários. Variáveis: {'{cliente}'}, {'{ticket_id}'}, {'{tecnico}'}.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Nova macro</Button>
      </div>

      <Card>
        <CardHeader title="Macros" subtitle={`${macros.data?.length ?? 0} macro(s)`} />
        {macros.isLoading && <Loading />}
        {macros.isError && <ErrorDisplay onRetry={() => macros.refetch()} />}
        <div className="divide-y divide-black/10 dark:divide-white/5">
          {(macros.data ?? []).map((m) => (
            <div key={m.id} className="flex items-start gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                <Zap className="h-4 w-4 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{m.name}</p>
                <p className="line-clamp-2 text-xs text-muted">{m.content}</p>
              </div>
              <div className="flex items-center gap-2">
                {!m.isActive && <Badge color="warning">Inativa</Badge>}
                <button onClick={() => openEdit(m)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(m)} aria-label="Excluir" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {(macros.data?.length ?? 0) === 0 && !macros.isLoading && (
            <p className="py-6 text-center text-sm text-muted">Nenhuma macro cadastrada.</p>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar macro' : 'Nova macro'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} />
          <TextArea label="Conteúdo *" placeholder="Texto da resposta. Use {cliente}, {ticket_id}, {tecnico}." value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded bg-surface-light border-border" />
            Ativa
          </label>
          <RunbookStepsEditor
            steps={form.runbookSteps ?? []}
            onChange={(steps) => setForm((f) => ({ ...f, runbookSteps: steps.length > 0 ? steps : null }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} loading={create.isPending || update.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir macro"
        message={`Excluir a macro "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Macro excluída'); setDeleteTarget(null); },
            onError: () => toast.error('Erro ao excluir macro'),
          });
        }}
      />
    </div>
  );
}

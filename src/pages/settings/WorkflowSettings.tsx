import { useState } from 'react';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { useWorkflowStates, useWorkflowTransitions, useCreateWorkflowState, useDeleteWorkflowState, useCreateWorkflowTransition, useDeleteWorkflowTransition } from '@/hooks/useWorkflow';
import { Card, CardHeader, Badge, Button, Modal, Input, Loading, ErrorDisplay } from '@/components/ui';
import toast from 'react-hot-toast';

export default function WorkflowSettings() {
  const states = useWorkflowStates();
  const transitions = useWorkflowTransitions();
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [transModalOpen, setTransModalOpen] = useState(false);

  if (states.isLoading) return <Loading />;
  if (states.isError) return <ErrorDisplay onRetry={() => states.refetch()} />;

  const stateMap = new Map((states.data ?? []).map(s => [s.id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow</h1>
        <p className="text-sm text-muted">Gerencie estados e transições de chamados</p>
      </div>

      {/* States */}
      <Card>
        <CardHeader
          title="Estados"
          subtitle={`${states.data?.length ?? 0} estados`}
          action={
            <Button size="sm" onClick={() => setStateModalOpen(true)}>
              <Plus className="h-4 w-4" /> Novo Estado
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(states.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map(s => (
            <StateCard key={s.id} state={s} />
          ))}
        </div>
      </Card>

      {/* Transitions */}
      <Card>
        <CardHeader
          title="Transições"
          subtitle={`${transitions.data?.length ?? 0} transições`}
          action={
            <Button size="sm" onClick={() => setTransModalOpen(true)}>
              <Plus className="h-4 w-4" /> Nova Transição
            </Button>
          }
        />
        <div className="space-y-2">
          {(transitions.data ?? []).map(t => {
            const from = stateMap.get(t.fromStateId);
            const to = stateMap.get(t.toStateId);
            return (
              <TransitionRow key={t.id} id={t.id} name={t.name} fromName={from?.name ?? '?'} fromColor={from?.color ?? null} toName={to?.name ?? '?'} toColor={to?.color ?? null} />
            );
          })}
          {(transitions.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted">Nenhuma transição</p>
          )}
        </div>
      </Card>

      <CreateStateModal open={stateModalOpen} onClose={() => setStateModalOpen(false)} />
      <CreateTransitionModal open={transModalOpen} onClose={() => setTransModalOpen(false)} states={states.data ?? []} />
    </div>
  );
}

function StateCard({ state }: { state: { id: string; name: string; color: string | null; isInitial: boolean; isFinal: boolean; sortOrder: number } }) {
  const deleteState = useDeleteWorkflowState();

  const handleDelete = () => {
    if (!confirm(`Excluir estado "${state.name}"?`)) return;
    deleteState.mutate(state.id, {
      onSuccess: () => toast.success('Estado excluído'),
      onError: () => toast.error('Erro'),
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-light p-3">
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="6" fill={state.color ?? '#64748b'} />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{state.name}</p>
        <div className="flex gap-1 mt-1">
          {state.isInitial && <Badge color="accent">Inicial</Badge>}
          {state.isFinal && <Badge color="success">Final</Badge>}
          <Badge color="slate">Ordem: {state.sortOrder}</Badge>
        </div>
      </div>
      <button onClick={handleDelete} aria-label="Excluir estado" className="p-1 text-muted hover:text-danger transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function TransitionRow({ id, name, fromName, fromColor, toName, toColor }: { id: string; name: string; fromName: string; fromColor: string | null; toName: string; toColor: string | null }) {
  const deleteTrans = useDeleteWorkflowTransition();

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-light px-4 py-2">
      <span className="flex items-center gap-1.5 text-sm text-foreground">
        <svg className="h-2 w-2" viewBox="0 0 8 8" aria-hidden="true">
          <circle cx="4" cy="4" r="4" fill={fromColor ?? '#64748b'} />
        </svg>
        {fromName}
      </span>
      <ArrowRight className="h-4 w-4 text-muted" />
      <span className="flex items-center gap-1.5 text-sm text-foreground">
        <svg className="h-2 w-2" viewBox="0 0 8 8" aria-hidden="true">
          <circle cx="4" cy="4" r="4" fill={toColor ?? '#64748b'} />
        </svg>
        {toName}
      </span>
      <span className="ml-auto text-xs text-muted">{name}</span>
      <button
        onClick={() => deleteTrans.mutate(id, { onSuccess: () => toast.success('Transição excluída'), onError: () => toast.error('Erro') })}
        aria-label="Excluir transição"
        className="p-1 text-muted hover:text-danger transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CreateStateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateWorkflowState();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isInitial, setIsInitial] = useState(false);
  const [isFinal, setIsFinal] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const handleSubmit = () => {
    if (!name.trim()) return;
    create.mutate(
      { clientId: null, name, color, isInitial, isFinal, sortOrder },
      {
        onSuccess: () => { toast.success('Estado criado'); onClose(); setName(''); },
        onError: () => toast.error('Erro'),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Estado">
      <div className="space-y-4">
        <Input label="Nome" value={name} onChange={e => setName(e.target.value)} />
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-muted-foreground">Cor</label>
            <input type="color" aria-label="Cor do estado" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-14 rounded border border-border bg-transparent cursor-pointer" />
          </div>
          <Input label="Ordem" type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isInitial} onChange={e => setIsInitial(e.target.checked)} className="rounded bg-surface-light border-border" />
            Estado Inicial
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} className="rounded bg-surface-light border-border" />
            Estado Final
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateTransitionModal({ open, onClose, states }: { open: boolean; onClose: () => void; states: { id: string; name: string }[] }) {
  const create = useCreateWorkflowTransition();
  const [name, setName] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  const stateOptions = [
    { value: '', label: 'Selecione...' },
    ...states.map(s => ({ value: s.id, label: s.name })),
  ];

  const handleSubmit = () => {
    if (!name.trim() || !fromId || !toId) return;
    create.mutate(
      { clientId: null, fromStateId: fromId, toStateId: toId, name },
      {
        onSuccess: () => { toast.success('Transição criada'); onClose(); setName(''); },
        onError: () => toast.error('Erro'),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Nova Transição">
      <div className="space-y-4">
        <Input label="Nome" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="transition-from" className="block text-sm font-medium text-muted-foreground">De</label>
            <select id="transition-from" value={fromId} onChange={e => setFromId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none">
              {stateOptions.map(o => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="transition-to" className="block text-sm font-medium text-muted-foreground">Para</label>
            <select id="transition-to" value={toId} onChange={e => setToId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none">
              {stateOptions.map(o => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

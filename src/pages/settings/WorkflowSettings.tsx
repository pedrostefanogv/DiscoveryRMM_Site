import { useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2, ArrowRight, Pencil, Info, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWorkflowStates, useWorkflowTransitions, useCreateWorkflowState, useUpdateWorkflowState, useDeleteWorkflowState, useCreateWorkflowTransition, useDeleteWorkflowTransition } from '@/hooks/useWorkflow';
import { useClients } from '@/hooks/useClients';
import { useTicketKpi } from '@/hooks/useTicketKpi';
import { Card, CardHeader, Badge, Button, Modal, Input, Select, Loading, ErrorDisplay } from '@/components/ui';
import { TicketStateBadge, stateColorVars } from '@/components/tickets/TicketStateBadge';
import type { WorkflowState } from '@/api';
import { buildStateTicketCounts, buildWorkflowReorder, sortStatesByOrder } from './workflowUtils';
import toast from 'react-hot-toast';

export default function WorkflowSettings() {
  const [clientId, setClientId] = useState('');
  const clientsQuery = useClients();
  const selectedClientId = clientId || undefined;

  const states = useWorkflowStates(selectedClientId);
  const transitions = useWorkflowTransitions(selectedClientId);
  const updateState = useUpdateWorkflowState();
  // KPI traz a contagem por estado (byState) já respeitando a ACL de chamados.
  const kpiQuery = useTicketKpi(selectedClientId ? { clientId: selectedClientId } : {});

  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [transModalOpen, setTransModalOpen] = useState(false);
  const [editingState, setEditingState] = useState<WorkflowState | null>(null);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const orderedStates = useMemo(() => sortStatesByOrder(states.data ?? []), [states.data]);
  const stateMap = useMemo(() => new Map(orderedStates.map(s => [s.id, s])), [orderedStates]);
  const stateCounts = useMemo(() => buildStateTicketCounts(kpiQuery.data?.byState), [kpiQuery.data]);

  const clientOptions = [
    { value: '', label: 'Estados globais (todos os clientes)' },
    ...(clientsQuery.data ?? []).map(client => ({ value: client.id, label: client.name })),
  ];

  const handleClientChange = (value: string) => {
    setClientId(value);
    setEditingState(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id)) return;

    const changes = buildWorkflowReorder(states.data ?? [], String(active.id), String(over.id));
    if (changes.length === 0) return;

    setReordering(true);
    try {
      for (const change of changes) {
        const current = (states.data ?? []).find(s => s.id === change.id);
        if (!current) continue;
        await updateState.mutateAsync({
          id: current.id,
          data: {
            name: current.name,
            color: current.color,
            isInitial: current.isInitial,
            isFinal: current.isFinal,
            sortOrder: change.sortOrder,
            pausesSla: current.pausesSla,
          },
        });
      }
      toast.success('Ordem dos estados atualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reordenar os estados');
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow</h1>
        <p className="text-sm text-muted">Gerencie estados e transições de chamados</p>
      </div>

      <div className="max-w-md">
        <Select
          label="Cliente"
          options={clientOptions}
          value={clientId}
          onChange={e => handleClientChange(e.target.value)}
          hint="Estados globais valem para todos os clientes. Estados de cliente só aparecem nos chamados daquele cliente."
        />
      </div>

      {states.isLoading ? (
        <Loading />
      ) : states.isError ? (
        <ErrorDisplay onRetry={() => states.refetch()} />
      ) : (
        <>
          <Card>
            <CardHeader
              title="Estados"
              subtitle={`${orderedStates.length} estados — arraste pelo ícone para reordenar`}
              action={
                <Button size="sm" onClick={() => setStateModalOpen(true)} disabled={reordering}>
                  <Plus className="h-4 w-4" /> Novo Estado
                </Button>
              }
            />
            {orderedStates.length === 0 ? (
              <p className="text-sm text-muted">Nenhum estado cadastrado.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedStates.map(s => s.id)} strategy={rectSortingStrategy}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {orderedStates.map(s => (
                      <StateCard
                        key={s.id}
                        state={s}
                        ticketCount={stateCounts.get(s.id) ?? 0}
                        showCount={kpiQuery.isSuccess}
                        reorderDisabled={reordering}
                        onEdit={() => setEditingState(s)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </Card>

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
        </>
      )}

      <CreateStateModal
        open={stateModalOpen}
        clientId={selectedClientId ?? null}
        onClose={() => setStateModalOpen(false)}
      />
      <CreateTransitionModal
        open={transModalOpen}
        clientId={selectedClientId ?? null}
        onClose={() => setTransModalOpen(false)}
        states={orderedStates}
      />
      {editingState && (
        <EditStateModal state={editingState} onClose={() => setEditingState(null)} />
      )}
    </div>
  );
}

/**
 * Ajuda de campo: ícone + texto sempre visível explicando como o campo funciona.
 * Centralizado aqui para que os três modais (novo estado, editar estado e nova
 * transição) usem exatamente o mesmo padrão de ajuda.
 */
function FieldHint({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`flex items-start gap-1 text-xs leading-relaxed text-muted ${className}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

/** Campo rotulado com a ajuda abaixo, no mesmo padrão do `Input` da UI. */
function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-muted-foreground">{label}</label>
      {children}
      <FieldHint text={hint} />
    </div>
  );
}

/** Checkbox rotulado com a ajuda abaixo (o label precisa vir depois do input). */
function CheckboxField({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="rounded bg-surface-light border-border"
        />
        <label htmlFor={id} className="text-sm font-medium text-muted-foreground">{label}</label>
      </div>
      <FieldHint text={hint} className="pl-6" />
    </div>
  );
}

const STATE_HELP = {
  name: 'Como o estado aparece no chamado e nas listas. Use nomes curtos e distintos.',
  color: 'Cor do selo do estado na lista e no detalhe do chamado.',
  order: 'Posição na lista e nos seletores de mudança de estado (menor primeiro). Também dá para arrastar os cartões.',
  initial: 'Estado em que um novo chamado nasce (ex.: "Aberto"). Marque apenas um estado como inicial.',
  final: 'Encerra o chamado (ex.: "Resolvido" ou "Fechado"): grava a data de fechamento e para o SLA.',
  pausesSla: 'Enquanto o chamado estiver neste estado, o prazo de SLA não conta (ex.: "Aguardando cliente"). Cada passagem pelo estado soma o tempo pausado ao prazo.',
  client: 'Estado global vale para todos os clientes; estado de cliente vale só para os chamados dele.',
} as const;

const TRANSITION_HELP = {
  name: 'Rótulo da transição, exibido como opção no seletor de mudança de estado do chamado (ex.: "Aguardar cliente").',
  from: 'Estado de origem: onde o chamado precisa estar para que esta transição apareça como opção.',
  to: 'Estado de destino: para onde o chamado vai ao usar esta transição.',
} as const;

function StateCard({ state, ticketCount, showCount, reorderDisabled, onEdit }: {
  state: WorkflowState;
  ticketCount: number;
  showCount: boolean;
  reorderDisabled: boolean;
  onEdit: () => void;
}) {
  const deleteState = useDeleteWorkflowState();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: state.id,
    disabled: reorderDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const handleDelete = () => {
    if (!confirm(`Excluir estado "${state.name}"?`)) return;
    deleteState.mutate(state.id, {
      onSuccess: () => toast.success('Estado excluído'),
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : 'Erro ao excluir o estado'),
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-light p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar estado"
        title="Arraste para reordenar"
        className="cursor-grab self-stretch px-0.5 text-muted transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        {/* Prévia exatamente como o estado aparece na lista de chamados. */}
        <TicketStateBadge name={state.name} color={state.color} />
        <div className="flex flex-wrap gap-1 mt-1">
          {state.isInitial && <Badge color="accent">Inicial</Badge>}
          {state.isFinal && <Badge color="success">Final</Badge>}
          {state.pausesSla && <Badge color="warning">SLA ignorado</Badge>}
          <Badge color="slate">{state.clientId ? 'Cliente' : 'Global'}</Badge>
          <Badge color="slate">Ordem: {state.sortOrder}</Badge>
          {showCount && (
            <Badge color="slate">
              {ticketCount} {ticketCount === 1 ? 'chamado' : 'chamados'}
            </Badge>
          )}
        </div>
      </div>
      <button onClick={onEdit} aria-label="Editar estado" title="Editar estado" className="p-1 text-muted hover:text-foreground transition-colors">
        <Pencil className="h-4 w-4" />
      </button>
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
        <span className="state-dot h-2 w-2 shrink-0 rounded-full" style={stateColorVars(fromColor)} aria-hidden="true" />
        {fromName}
      </span>
      <ArrowRight className="h-4 w-4 text-muted" />
      <span className="flex items-center gap-1.5 text-sm text-foreground">
        <span className="state-dot h-2 w-2 shrink-0 rounded-full" style={stateColorVars(toColor)} aria-hidden="true" />
        {toName}
      </span>
      <span className="ml-auto text-xs text-muted">{name}</span>
      <button
        onClick={() => deleteTrans.mutate(id, {
          onSuccess: () => toast.success('Transição excluída'),
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : 'Erro ao excluir a transição'),
        })}
        aria-label="Excluir transição"
        className="p-1 text-muted hover:text-danger transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CreateStateModal({ open, clientId, onClose }: { open: boolean; clientId: string | null; onClose: () => void }) {
  const create = useCreateWorkflowState();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isInitial, setIsInitial] = useState(false);
  const [isFinal, setIsFinal] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [pausesSla, setPausesSla] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Informe um nome para o estado.');
      return;
    }
    create.mutate(
      { clientId, name: name.trim(), color, isInitial, isFinal, sortOrder, pausesSla },
      {
        onSuccess: () => { toast.success('Estado criado'); onClose(); setName(''); },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao criar o estado'),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Estado" maxWidth="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Estados são as etapas do chamado. Cada chamado fica em um estado por vez e as
          transições definem os caminhos possíveis entre eles.
        </p>
        <FieldHint text={clientId ? 'O estado será criado para o cliente selecionado.' : STATE_HELP.client} />
        <Field label="Nome" htmlFor="create-state-name" hint={STATE_HELP.name}>
          <Input id="create-state-name" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cor" htmlFor="create-state-color" hint={STATE_HELP.color}>
            <input id="create-state-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-surface-light p-1" />
          </Field>
          <Field label="Ordem" htmlFor="create-state-order" hint={STATE_HELP.order}>
            <Input id="create-state-order" type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
          </Field>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-3">
          <CheckboxField id="create-state-initial" label="Estado Inicial" hint={STATE_HELP.initial} checked={isInitial} onChange={setIsInitial} />
          <CheckboxField id="create-state-final" label="Estado Final" hint={STATE_HELP.final} checked={isFinal} onChange={setIsFinal} />
          <CheckboxField id="create-state-pauses-sla" label="Desconsiderar SLA neste estado" hint={STATE_HELP.pausesSla} checked={pausesSla} onChange={setPausesSla} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditStateModal({ state, onClose }: { state: WorkflowState; onClose: () => void }) {
  const update = useUpdateWorkflowState();
  const [name, setName] = useState(state.name);
  const [color, setColor] = useState(state.color ?? '#6366f1');
  const [isInitial, setIsInitial] = useState(state.isInitial);
  const [isFinal, setIsFinal] = useState(state.isFinal);
  const [sortOrder, setSortOrder] = useState(state.sortOrder);
  const [pausesSla, setPausesSla] = useState(state.pausesSla ?? false);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Informe um nome para o estado.');
      return;
    }
    update.mutate(
      { id: state.id, data: { name: name.trim(), color, isInitial, isFinal, sortOrder, pausesSla } },
      {
        onSuccess: () => { toast.success('Estado atualizado'); onClose(); },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao atualizar o estado'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Editar Estado" maxWidth="max-w-xl">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          As alterações valem para os próximos movimentos do workflow; chamados que já estão
          neste estado só sentem a pausa de SLA ao entrar nele novamente.
        </p>
        <Field label="Nome" htmlFor="edit-state-name" hint={STATE_HELP.name}>
          <Input id="edit-state-name" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cor" htmlFor="edit-state-color" hint={STATE_HELP.color}>
            <input id="edit-state-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-surface-light p-1" />
          </Field>
          <Field label="Ordem" htmlFor="edit-state-order" hint={STATE_HELP.order}>
            <Input id="edit-state-order" type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
          </Field>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-3">
          <CheckboxField id="edit-state-initial" label="Estado Inicial" hint={STATE_HELP.initial} checked={isInitial} onChange={setIsInitial} />
          <CheckboxField id="edit-state-final" label="Estado Final" hint={STATE_HELP.final} checked={isFinal} onChange={setIsFinal} />
          <CheckboxField id="edit-state-pauses-sla" label="Desconsiderar SLA neste estado" hint={STATE_HELP.pausesSla} checked={pausesSla} onChange={setPausesSla} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={update.isPending}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateTransitionModal({ open, clientId, onClose, states }: { open: boolean; clientId: string | null; onClose: () => void; states: { id: string; name: string }[] }) {
  const create = useCreateWorkflowTransition();
  const [name, setName] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const stateOptions = [
    { value: '', label: 'Selecione...' },
    ...states.map(s => ({ value: s.id, label: s.name })),
  ];

  const handleSubmit = () => {
    // Validação visível: antes o modal voltava em silêncio quando faltava o
    // nome ou a origem/destino, e o usuário entendia como "não aceita criar".
    if (!name.trim()) {
      setValidationError('Informe um nome para a transição (ex.: "Close").');
      return;
    }
    if (!fromId || !toId) {
      setValidationError('Selecione o estado de origem (De) e o de destino (Para).');
      return;
    }
    if (fromId === toId) {
      setValidationError('A origem e o destino devem ser estados diferentes.');
      return;
    }
    setValidationError(null);
    create.mutate(
      { clientId, fromStateId: fromId, toStateId: toId, name: name.trim() },
      {
        onSuccess: () => {
          toast.success('Transição criada');
          onClose();
          setName('');
          setFromId('');
          setToId('');
          setValidationError(null);
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao criar a transição'),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Nova Transição">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Transições liberam a passagem de um estado para outro no chamado. O caminho de ida
          e o de volta são transições separadas — cadastre as duas se quiser ambos os sentidos.
        </p>
        <FieldHint text={clientId ? 'A transição será criada para o cliente selecionado.' : STATE_HELP.client} />
        <Field label="Nome" htmlFor="transition-name" hint={TRANSITION_HELP.name}>
          <Input id="transition-name" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="De" htmlFor="transition-from" hint={TRANSITION_HELP.from}>
            <select id="transition-from" value={fromId} onChange={e => setFromId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none">
              {stateOptions.map(o => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
            </select>
          </Field>
          <Field label="Para" htmlFor="transition-to" hint={TRANSITION_HELP.to}>
            <select id="transition-to" value={toId} onChange={e => setToId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none">
              {stateOptions.map(o => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
            </select>
          </Field>
        </div>
        {validationError && (
          <p role="alert" className="text-xs text-danger">{validationError}</p>
        )}
        <p className="text-xs text-muted">
          Chamados também podem ir direto para um estado <strong>inicial</strong> ou{' '}
          <strong>final</strong> sem transição cadastrada. Use transições para os caminhos intermediários.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

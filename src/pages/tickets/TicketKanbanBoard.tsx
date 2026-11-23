import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Badge, Icon } from '@/components/ui';
import { TicketStateBadge } from '@/components/tickets/TicketStateBadge';
import { getTicketPriorityMeta } from '@/utils/labels';
import { formatDate } from '@/utils/format';
import type { Ticket, WorkflowState } from '@/api';

interface TicketKanbanBoardProps {
  tickets: Ticket[];
  states: WorkflowState[];
  clientNames: Map<string, string>;
  userNames: Map<string, string>;
  onOpenTicket: (ticketId: string) => void;
  onMoveState: (ticket: Ticket, targetStateId: string) => Promise<void>;
}

function KanbanColumn({
  state,
  tickets,
  clientNames,
  userNames,
  onOpenTicket,
}: {
  state: WorkflowState;
  tickets: Ticket[];
  clientNames: Map<string, string>;
  userNames: Map<string, string>;
  onOpenTicket: (ticketId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-border bg-surface-light/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <TicketStateBadge name={state.name} color={state.color} />
        <Badge color="slate">{tickets.length}</Badge>
      </div>
      <div className="flex max-h-[68vh] flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        {tickets.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Arraste um chamado para cá</p>
        ) : (
          tickets.map((ticket) => (
            <KanbanCard
              key={ticket.id}
              ticket={ticket}
              clientName={clientNames.get(ticket.clientId) ?? '-'}
              assigneeName={ticket.assignedToUserId ? userNames.get(ticket.assignedToUserId) : undefined}
              onOpen={() => onOpenTicket(ticket.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  ticket,
  clientName,
  assigneeName,
  onOpen,
  isOverlay = false,
}: {
  ticket: Ticket;
  clientName: string;
  assigneeName?: string;
  onOpen?: () => void;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: isOverlay,
  });
  const priority = getTicketPriorityMeta(ticket.priority);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      onClick={() => {
        if (!isDragging) onOpen?.();
      }}
      className={`cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition hover:border-primary/50 active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      } ${isOverlay ? 'ring-2 ring-primary shadow-lg' : ''}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">#{ticket.id.slice(0, 8)}</span>
        <div className="flex items-center gap-1">
          {ticket.slaBreached && !ticket.closedAt && (
            <Badge color="danger">SLA</Badge>
          )}
          {ticket.onHold && !ticket.closedAt && (
            <Badge color="accent">Pausado</Badge>
          )}
          <Badge color={priority.color}>{priority.label}</Badge>
        </div>
      </div>
      <p className="line-clamp-2 text-sm font-medium text-foreground">{ticket.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">{clientName}</span>
        <span className="shrink-0">{formatDate(ticket.updatedAt || ticket.createdAt)}</span>
      </div>
      {assigneeName && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon name="person" className="h-3 w-3 shrink-0" />
          <span className="truncate">{assigneeName}</span>
        </div>
      )}
    </div>
  );
}

export function TicketKanbanBoard({
  tickets,
  states,
  clientNames,
  userNames,
  onOpenTicket,
  onMoveState,
}: TicketKanbanBoardProps) {
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const orderedStates = useMemo(
    () => [...states].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [states],
  );

  const ticketsByState = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const s of orderedStates) map.set(s.id, []);
    for (const t of tickets) {
      const bucket = t.workflowStateId ? map.get(t.workflowStateId) : undefined;
      if (bucket) bucket.push(t);
    }
    return map;
  }, [orderedStates, tickets]);

  const handleDragStart = (event: DragStartEvent) => {
    const found = tickets.find((t) => t.id === event.active.id) ?? null;
    setActiveTicket(found);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;
    const ticket = tickets.find((t) => t.id === active.id);
    const targetStateId = String(over.id);
    if (!ticket || ticket.workflowStateId === targetStateId) return;
    void onMoveState(ticket, targetStateId);
  };

  if (orderedStates.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Nenhum estado de workflow configurado.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {orderedStates.map((state) => (
          <KanbanColumn
            key={state.id}
            state={state}
            tickets={ticketsByState.get(state.id) ?? []}
            clientNames={clientNames}
            userNames={userNames}
            onOpenTicket={onOpenTicket}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? (
          <KanbanCard
            ticket={activeTicket}
            clientName={clientNames.get(activeTicket.clientId) ?? '-'}
            assigneeName={
              activeTicket.assignedToUserId ? userNames.get(activeTicket.assignedToUserId) : undefined
            }
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

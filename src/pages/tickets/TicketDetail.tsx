import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Lock, Unlock } from 'lucide-react';
import { useTicket, useTicketComments, useAddComment, useUpdateTicketWorkflow } from '@/hooks/useTickets';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, TextArea, Select } from '@/components/ui';
import toast from 'react-hot-toast';

const priorityLabels: Record<number, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  0: { label: 'Baixa', color: 'slate' },
  1: { label: 'Média', color: 'success' },
  2: { label: 'Alta', color: 'warning' },
  3: { label: 'Crítica', color: 'danger' },
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ticket = useTicket(id!);
  const comments = useTicketComments(id!);
  const states = useWorkflowStates();

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) return <ErrorDisplay onRetry={() => ticket.refetch()} />;

  const t = ticket.data;
  const p = priorityLabels[t.priority] ?? { label: '?', color: 'slate' as const };
  const currentState = states.data?.find(s => s.id === t.workflowStateId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/tickets')} aria-label="Voltar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{t.title}</h1>
          <p className="text-sm text-slate-400">
            Criado em {new Date(t.createdAt).toLocaleDateString('pt-BR')} •
            {t.assignedTo ? ` Responsável: ${t.assignedTo}` : ' Sem responsável'}
          </p>
        </div>
        <Badge color={p.color}>{p.label}</Badge>
        {currentState && (
          <Badge color="accent">
            <span className="flex items-center gap-1.5">
              {currentState.color && (
                <svg className="h-2 w-2" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill={currentState.color} />
                </svg>
              )}
              {currentState.name}
            </span>
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Description + Comments */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Descrição" />
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{t.description}</p>
          </Card>

          <Card>
            <CardHeader title="Comentários" subtitle={`${comments.data?.length ?? 0} comentários`} />
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(comments.data ?? []).map(c => (
                <div key={c.id} className={`rounded-lg px-4 py-3 ${c.isInternal ? 'bg-warning/10 border border-warning/20' : 'bg-white/5'}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{c.author}</span>
                    <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
                    {c.isInternal && (
                      <Badge color="warning"><Lock className="mr-1 h-3 w-3" />Interno</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
            <CommentForm ticketId={id!} />
          </Card>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Detalhes" />
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-400">Categoria</dt><dd className="text-white">{t.category ?? '—'}</dd></div>
              <div><dt className="text-slate-400">Prioridade</dt><dd><Badge color={p.color}>{p.label}</Badge></dd></div>
              <div><dt className="text-slate-400">Responsável</dt><dd className="text-white">{t.assignedTo ?? '—'}</dd></div>
              <div><dt className="text-slate-400">Atualizado</dt><dd className="text-white">{new Date(t.updatedAt).toLocaleString('pt-BR')}</dd></div>
            </dl>
          </Card>

          <WorkflowPanel ticketId={id!} currentStateId={t.workflowStateId} />
        </div>
      </div>
    </div>
  );
}

function CommentForm({ ticketId }: { ticketId: string }) {
  const addComment = useAddComment();
  const [content, setContent] = useState('');
  const [author] = useState('Admin');
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = () => {
    if (!content.trim()) return;
    addComment.mutate(
      { id: ticketId, data: { author, content, isInternal } },
      {
        onSuccess: () => { setContent(''); toast.success('Comentário adicionado'); },
        onError: () => toast.error('Erro'),
      },
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
      <TextArea placeholder="Escreva um comentário..." value={content} onChange={e => setContent(e.target.value)} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded bg-white/5 border-white/10" />
          {isInternal ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          Nota interna
        </label>
        <Button size="sm" onClick={handleSubmit} loading={addComment.isPending}>
          <Send className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </div>
  );
}

function WorkflowPanel({ ticketId, currentStateId }: { ticketId: string; currentStateId: string | null }) {
  const states = useWorkflowStates();
  const updateWf = useUpdateTicketWorkflow();
  const [selected, setSelected] = useState(currentStateId ?? '');

  const stateOptions = [
    { value: '', label: 'Selecione...' },
    ...(states.data ?? []).map(s => ({ value: s.id, label: s.name })),
  ];

  const handleChange = () => {
    if (!selected || selected === currentStateId) return;
    updateWf.mutate(
      { id: ticketId, data: { workflowStateId: selected } },
      {
        onSuccess: () => toast.success('Estado atualizado'),
        onError: () => toast.error('Erro ao atualizar estado'),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Alterar Estado" />
      <div className="space-y-3">
        <Select options={stateOptions} value={selected} onChange={e => setSelected(e.target.value)} />
        <Button size="sm" className="w-full" onClick={handleChange} loading={updateWf.isPending} disabled={!selected || selected === currentStateId}>
          Atualizar Estado
        </Button>
      </div>
    </Card>
  );
}

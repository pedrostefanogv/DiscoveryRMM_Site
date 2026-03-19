import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Lock, Unlock, Clock, Activity, ChevronDown, BookOpen, Paperclip, Upload, File, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  useTicket,
  useTicketComments,
  useAddComment,
  useUpdateTicketWorkflow,
  useUpdateTicket,
  useTicketTimeline,
  useSlaDetails,
  useTicketAttachments,
  usePrepareTicketUpload,
  useCompleteTicketUpload,
} from '@/hooks/useTickets';
import { useTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useSiteTicketAttachmentSettings, useClientTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, TextArea, Select, Input } from '@/components/ui';
import type { TicketPriority, UpdateTicketRequest } from '@/api';
import toast from 'react-hot-toast';

const PRIORITY_META: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  Low:      { label: 'Baixa',    color: 'slate'   },
  Medium:   { label: 'Média',    color: 'success' },
  High:     { label: 'Alta',     color: 'warning' },
  Critical: { label: 'Crítica',  color: 'danger'  },
};

const ACTIVITY_LABELS: Record<string, string> = {
  Created:           'Criado',
  StateChanged:      'Estado alterado',
  Assigned:          'Atribuído',
  Commented:         'Comentado',
  SlaWarning:        'Aviso SLA',
  SlaBreached:       'SLA violado',
  Escalated:         'Escalado',
  Reopened:          'Reaberto',
  DepartmentChanged: 'Depto. alterado',
  PriorityChanged:   'Prioridade alterada',
  DescriptionUpdated:'Descrição atualizada',
  CategoryChanged:   'Categoria alterada',
};

type Tab = 'comments' | 'timeline' | 'attachments';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ticket   = useTicket(id!);
  const comments = useTicketComments(id!);
  const states   = useWorkflowStates();
  const [tab, setTab] = useState<Tab>('comments');
  const [editing, setEditing] = useState(false);

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) return <ErrorDisplay onRetry={() => ticket.refetch()} />;

  const t = ticket.data;
  const p = PRIORITY_META[t.priority] ?? { label: t.priority, color: 'slate' as const };
  const currentState = states.data?.find(s => s.id === t.workflowStateId);
  const knowledgeQuery = new URLSearchParams();
  if (t.clientId) knowledgeQuery.set('clientId', t.clientId);
  if (t.siteId) knowledgeQuery.set('siteId', t.siteId);
  const knowledgeUrl = `/knowledge${knowledgeQuery.toString() ? `?${knowledgeQuery.toString()}` : ''}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/tickets')}
          aria-label="Voltar"
          className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{t.title}</h1>
          <p className="text-sm text-slate-400">
            Criado em {new Date(t.createdAt).toLocaleDateString('pt-BR')}
            {t.closedAt && ` • Encerrado em ${new Date(t.closedAt).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <Button size="sm" variant="ghost" onClick={() => setEditing(e => !e)}>
            {editing ? 'Cancelar edição' : 'Editar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(knowledgeUrl)}>
            <BookOpen className="h-4 w-4" /> Conhecimento
          </Button>
        </div>
      </div>

      {editing && <EditTicketForm ticket={t} onDone={() => setEditing(false)} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <Card>
            <CardHeader title="Descrição" />
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{t.description}</p>
          </Card>

          {/* Tabs: Comments / Timeline */}
          <Card padding={false}>
            <div className="flex border-b border-white/5">
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'comments' ? 'border-b-2 border-primary text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setTab('comments')}
              >
                Comentários ({comments.data?.length ?? 0})
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'timeline' ? 'border-b-2 border-primary text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setTab('timeline')}
              >
                <Activity className="inline h-4 w-4 mr-1" />
                Timeline
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'attachments' ? 'border-b-2 border-primary text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setTab('attachments')}
              >
                <Paperclip className="inline h-4 w-4 mr-1" />
                Anexos
              </button>
            </div>
            <div className="p-4">
              {tab === 'comments' ? (
                <CommentsPanel ticketId={id!} />
              ) : tab === 'timeline' ? (
                <TimelinePanel ticketId={id!} />
              ) : (
                <AttachmentsPanel ticketId={id!} siteId={t.siteId} clientId={t.clientId} />
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SlaPanel ticketId={id!} />

          <Card>
            <CardHeader title="Detalhes" />
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-400">Categoria</dt><dd className="text-white">{t.category ?? '—'}</dd></div>
              <div><dt className="text-slate-400">Prioridade</dt><dd><Badge color={p.color}>{p.label}</Badge></dd></div>
              <div><dt className="text-slate-400">Responsável</dt><dd className="text-white">{t.assignedToUserId ?? '—'}</dd></div>
              <div><dt className="text-slate-400">Atualizado</dt><dd className="text-white">{new Date(t.updatedAt).toLocaleString('pt-BR')}</dd></div>
              {t.closedAt && <div><dt className="text-slate-400">Encerrado em</dt><dd className="text-white">{new Date(t.closedAt).toLocaleString('pt-BR')}</dd></div>}
            </dl>
          </Card>

          <WorkflowPanel ticketId={id!} currentStateId={t.workflowStateId} />
        </div>
      </div>
    </div>
  );
}

function SlaProgressBar({ pct, barColor }: { pct: number; barColor: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rounded = Math.round(pct);
    if (trackRef.current) trackRef.current.setAttribute('aria-valuenow', String(rounded));
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
  }, [pct]);

  return (
    <div
      ref={trackRef}
      className="h-2 w-full rounded-full bg-white/10"
      role="progressbar"
      aria-label={`SLA: ${Math.round(pct)}% utilizado`}
    >
      <div ref={fillRef} className={`h-2 rounded-full transition-all ${barColor}`} />
    </div>
  );
}

function SlaPanel({ ticketId }: { ticketId: string }) {
  const sla = useSlaDetails(ticketId);

  if (sla.isLoading) return (
    <Card><div className="flex items-center gap-2 text-slate-400"><Clock className="h-4 w-4 animate-pulse" /><span className="text-sm">Carregando SLA...</span></div></Card>
  );
  if (sla.isError || !sla.data) return null;

  const d = sla.data;
  const pct = Math.min(d.percentUsed ?? 0, 100);
  const barColor = d.breached ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-success';

  return (
    <Card>
      <CardHeader title="SLA" subtitle={d.status} />
      <div className="space-y-3">
        {d.slaExpiresAt && (
          <div className="text-xs text-slate-400">
            Expira em {new Date(d.slaExpiresAt).toLocaleString('pt-BR')}
          </div>
        )}
        {d.percentUsed != null && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{pct.toFixed(0)}% utilizado</span>
              {d.hoursRemaining != null && (
                <span>{d.hoursRemaining.toFixed(1)}h restantes</span>
              )}
            </div>
            <SlaProgressBar pct={pct} barColor={barColor} />
          </div>
        )}
        {d.breached && <Badge color="danger">SLA violado</Badge>}
        {d.warningLevel && !d.breached && (
          <Badge color="warning"><Clock className="mr-1 h-3 w-3" />Atenção: {d.warningLevel}</Badge>
        )}
      </div>
    </Card>
  );
}

function CommentsPanel({ ticketId }: { ticketId: string }) {
  const comments = useTicketComments(ticketId);
  return (
    <>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {(comments.data ?? []).map(c => (
          <div key={c.id} className={`rounded-lg px-4 py-3 ${c.isInternal ? 'bg-warning/10 border border-warning/20' : 'bg-white/5'}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-medium text-white">{c.author}</span>
              <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
              {c.isInternal && <Badge color="warning"><Lock className="mr-1 h-3 w-3" />Interno</Badge>}
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
        {(comments.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500 py-4 text-center">Sem comentários ainda</p>
        )}
      </div>
      <CommentForm ticketId={ticketId} />
    </>
  );
}

function TimelinePanel({ ticketId }: { ticketId: string }) {
  const timeline = useTicketTimeline(ticketId);

  if (timeline.isLoading) return <Loading />;
  if (timeline.isError) return <p className="text-sm text-danger">Erro ao carregar timeline</p>;

  const entries = timeline.data ?? [];

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">Nenhum evento registrado</p>
      ) : (
        entries.map(e => (
          <div key={e.id} className="flex gap-3">
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Activity className="h-3 w-3 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">
                  {ACTIVITY_LABELS[e.activityType] ?? e.activityType}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(e.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{e.description}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CommentForm({ ticketId }: { ticketId: string }) {
  const addComment = useAddComment();
  const [content, setContent] = useState('');
  const [author] = useState('Admin');
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = () => {
    if (!content.trim() || content.trim().length < 3) return;
    addComment.mutate(
      { id: ticketId, data: { author, content, isInternal } },
      {
        onSuccess: () => { setContent(''); toast.success('Comentário adicionado'); },
        onError:   () => toast.error('Erro'),
      },
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
      <TextArea placeholder="Escreva um comentário... (mín. 3 chars)" value={content} onChange={e => setContent(e.target.value)} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded bg-white/5 border-white/10" />
          {isInternal ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          Nota interna
        </label>
        <Button size="sm" onClick={handleSubmit} loading={addComment.isPending} disabled={content.trim().length < 3}>
          <Send className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </div>
  );
}

function WorkflowPanel({ ticketId, currentStateId }: { ticketId: string; currentStateId: string | null }) {
  const states    = useWorkflowStates();
  const updateWf  = useUpdateTicketWorkflow();
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
        onError:   () => toast.error('Transição inválida ou erro ao atualizar'),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Alterar Estado" />
      <div className="space-y-3">
        <Select options={stateOptions} value={selected} onChange={e => setSelected(e.target.value)} />
        <Button
          size="sm"
          className="w-full"
          onClick={handleChange}
          loading={updateWf.isPending}
          disabled={!selected || selected === currentStateId}
        >
          <ChevronDown className="h-4 w-4" /> Atualizar Estado
        </Button>
      </div>
    </Card>
  );
}

function EditTicketForm({ ticket, onDone }: { ticket: { id: string; title: string; description: string; priority: TicketPriority; category: string | null; assignedToUserId: string | null }; onDone: () => void }) {
  const update = useUpdateTicket();
  const [form, setForm] = useState<UpdateTicketRequest>({
    title:           ticket.title,
    description:     ticket.description,
    priority:        ticket.priority,
    category:        ticket.category,
    assignedToUserId: ticket.assignedToUserId,
  });

  const set = <K extends keyof UpdateTicketRequest>(k: K, v: UpdateTicketRequest[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const valid = form.title.trim().length >= 3 && form.description.trim().length >= 3;

  const handleSubmit = () => {
    if (!valid) return;
    update.mutate(
      { id: ticket.id, data: form },
      {
        onSuccess: () => { toast.success('Chamado atualizado'); onDone(); },
        onError:   () => toast.error('Erro ao atualizar'),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Editar Chamado" />
      <div className="space-y-4">
        <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Descrição *</label>
          <textarea
            aria-label="Descrição do chamado"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={4}
            placeholder="Descreva o chamado..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Prioridade"
            options={[
              { value: 'Low',      label: 'Baixa'   },
              { value: 'Medium',   label: 'Média'   },
              { value: 'High',     label: 'Alta'    },
              { value: 'Critical', label: 'Crítica' },
            ]}
            value={form.priority}
            onChange={e => set('priority', e.target.value as TicketPriority)}
          />
          <Input label="Categoria" value={form.category ?? ''} onChange={e => set('category', e.target.value || null)} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={update.isPending} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Card>
  );
}

// ── Attachments Panel ────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'done' | 'error';

interface FileEntry {
  file: File;
  status: UploadStatus;
  error?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function AttachmentsPanel({ 
  ticketId, 
  siteId, 
  clientId,
}: { 
  ticketId: string
  siteId: string | null
  clientId: string | null
}) {
  // Prioridade de herança: Site > Client > Server
  const siteSettings = useSiteTicketAttachmentSettings(siteId);
  const clientSettings = useClientTicketAttachmentSettings(!siteId ? clientId : null);
  const serverSettings = useTicketAttachmentSettings();

  // Determina qual config usar baseado na hierarquia
  const settings = (() => {
    if (siteId && siteSettings.data) return { data: siteSettings.data, isLoading: false };
    if (clientId && clientSettings.data) return { data: clientSettings.data, isLoading: false };
    return serverSettings;
  })();
  
  const attachments = useTicketAttachments(ticketId);
  const prepare = usePrepareTicketUpload();
  const complete = useCompleteTicketUpload();
  const [queue, setQueue] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = settings.data;
  const isEnabled = cfg?.enabled !== false;

  const accept = cfg?.allowedContentTypes?.join(',') ?? 'image/jpeg,image/png,image/webp,application/pdf';
  const maxBytes = cfg?.maxFileSizeBytes ?? 10485760;

  const handleFiles = (files: FileList | null) => {
    if (!files || !isEnabled) return;
    const entries: FileEntry[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxBytes) {
        entries.push({ file, status: 'error', error: `Arquivo excede o limite de ${formatBytes(maxBytes)}` });
        continue;
      }
      if (cfg?.allowedContentTypes && !cfg.allowedContentTypes.includes(file.type)) {
        entries.push({ file, status: 'error', error: `Tipo não permitido: ${file.type}` });
        continue;
      }
      entries.push({ file, status: 'idle' });
    }
    setQueue((q) => [...q, ...entries]);
  };

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setQueue((q) => q.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const uploadAll = async () => {
    if (uploading) return;
    const idleIndexes = queue.map((_e, i) => i).filter((i) => queue[i].status === 'idle');
    if (idleIndexes.length === 0) return;
    setUploading(true);

    for (const idx of idleIndexes) {
      const entry = queue[idx];
      updateEntry(idx, { status: 'preparing', error: undefined });

      let prepareRes: { attachmentId: string; objectKey: string; uploadUrl: string; httpMethod: string; expiresAtUtc: string };
      try {
        prepareRes = await prepare.mutateAsync({
          ticketId,
          data: {
            fileName: entry.file.name,
            contentType: entry.file.type,
            sizeBytes: entry.file.size,
          },
        });
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro ao preparar upload' });
        continue;
      }

      updateEntry(idx, { status: 'uploading' });
      try {
        const res = await fetch(prepareRes.uploadUrl, {
          method: prepareRes.httpMethod,
          headers: { 'Content-Type': entry.file.type },
          body: entry.file,
        });
        if (!res.ok) throw new Error(`Upload falhou: ${res.status} ${res.statusText}`);
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro no upload' });
        continue;
      }

      updateEntry(idx, { status: 'confirming' });
      try {
        await complete.mutateAsync({
          ticketId,
          data: {
            attachmentId: prepareRes.attachmentId,
            objectKey: prepareRes.objectKey,
            fileName: entry.file.name,
            contentType: entry.file.type,
            sizeBytes: entry.file.size,
            uploadedBy: 'Admin',
          },
        });
        updateEntry(idx, { status: 'done' });
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro ao confirmar upload' });
      }
    }

    setUploading(false);
  };

  const STATUS_ICON: Record<UploadStatus, React.ReactNode> = {
    idle: <Upload className="h-4 w-4 text-slate-400" />,
    preparing: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    uploading: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    confirming: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    done: <CheckCircle className="h-4 w-4 text-success" />,
    error: <XCircle className="h-4 w-4 text-danger" />,
  };

  const STATUS_LABEL: Record<UploadStatus, string> = {
    idle: 'Aguardando',
    preparing: 'Preparando…',
    uploading: 'Enviando…',
    confirming: 'Confirmando…',
    done: 'Concluído',
    error: 'Erro',
  };

  return (
    <div className="space-y-4">
      {!isEnabled && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          Upload de anexos está desabilitado nas configurações do servidor.
        </div>
      )}

      {isEnabled && (
        <>
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/10 py-8 text-center transition-colors hover:border-white/20 cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Paperclip className="h-6 w-6 text-slate-500" />
            <p className="text-sm text-slate-400">
              Arraste arquivos aqui ou{' '}
              <span className="text-primary underline">clique para selecionar</span>
            </p>
            <p className="text-xs text-slate-500">
              Máx. {formatBytes(maxBytes)} · {accept}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={accept}
            aria-label="Selecionar arquivos para anexar"
            title="Selecionar arquivos para anexar"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {queue.length > 0 && (
            <div className="space-y-2">
              {queue.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                  <File className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{entry.file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(entry.file.size)}</p>
                    {entry.error && <p className="text-xs text-danger">{entry.error}</p>}
                  </div>
                  <span className={`text-xs ${entry.status === 'error' ? 'text-danger' : entry.status === 'done' ? 'text-success' : 'text-slate-400'}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                  {STATUS_ICON[entry.status]}
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setQueue([])}>Limpar</Button>
                <Button
                  size="sm"
                  onClick={uploadAll}
                  loading={uploading}
                  disabled={!queue.some((e) => e.status === 'idle')}
                >
                  <Upload className="h-4 w-4" /> Enviar todos
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Existing attachments list */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Arquivos anexados</p>
        {attachments.isLoading && <Loading />}
        {(attachments.data ?? []).length === 0 && !attachments.isLoading && (
          <p className="py-4 text-center text-sm text-slate-500">Nenhum anexo ainda.</p>
        )}
        {(attachments.data ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
            <File className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{a.fileName}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(a.sizeBytes)} · {a.contentType} · {new Date(a.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
            <Badge color="slate">{a.uploadedBy}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

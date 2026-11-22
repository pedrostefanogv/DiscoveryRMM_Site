import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from "react-router-dom";

import {
  useWorkflowProfiles,
  useCreateWorkflowProfile,
  useUpdateWorkflowProfile,
  useDeleteWorkflowProfile,
} from '@/hooks/useWorkflowProfiles';
import { useDepartments } from '@/hooks/useDepartments';
import { useSlaCalendars } from '@/hooks/useSlaCalendars';
import { useClients } from '@/hooks/useClients';
import {  Icon, Card, CardHeader, Button, Modal, Input, Select, Badge, Loading, ErrorDisplay, PageHeader, ConfirmDialog } from '@/components/ui';
import type { Department, WorkflowProfile, CreateWorkflowProfileRequest, UpdateWorkflowProfileRequest, TicketPriority } from '@/api';
import { getTicketPriorityMeta } from '@/utils/labels';
import toast from 'react-hot-toast';

const PRIORITY_OPTIONS = [
  { value: '',         label: 'Nenhuma' },
  { value: 'Low',      label: 'Baixa' },
  { value: 'Medium',   label: 'Média' },
  { value: 'High',     label: 'Alta' },
  { value: 'Critical', label: 'Crítica' },
];

export default function WorkflowProfileSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clientId, setClientId] = useState(() => searchParams.get('client') ?? '');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkflowProfile | null>(null);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (clientId) next.set('client', clientId);
        else next.delete('client');
        return next.toString() === prev.toString() ? prev : next;
      },
      { replace: true },
    );
  }, [clientId, setSearchParams]);

  const profiles = useWorkflowProfiles({ clientId: clientId || undefined, includeGlobal: true });
  const clients  = useClients();
  const depts    = useDepartments({ includeGlobal: true, activeOnly: true, allClients: true });

  const deptMap = useMemo(
    () => new Map((depts.data ?? []).map(d => [d.id, d])),
    [depts.data],
  );
  const clientMap = useMemo(
    () => new Map((clients.data ?? []).map(c => [c.id, c])),
    [clients.data],
  );

  // Calendários de SLA disponíveis para vincular ao perfil. Sem vínculo o SLA
  // corre 24x7; com vínculo conta apenas em horas úteis.
  const calendars = useSlaCalendars();
  const calendarMap = useMemo(
    () => new Map((calendars.data ?? []).map(c => [c.id, c])),
    [calendars.data],
  );

  // Um perfil só pode usar calendário global ou do próprio cliente (a mesma
  // regra é validada no backend).
  const calendarOptionsFor = (profileClientId: string | null) => [
    { value: '', label: '24x7 (sem calendário)' },
    ...(calendars.data ?? [])
      .filter(c => !c.clientId || c.clientId === profileClientId)
      .map(c => ({
        value: c.id,
        label: `${c.name} · ${c.clientId ? (clientMap.get(c.clientId)?.name ?? 'cliente') : 'global'}${c.isDefault ? ' · padrão' : ''}`,
      })),
  ];

  // Calendário padrão global, usado para pré-selecionar ao criar um perfil.
  const defaultGlobalCalendarId =
    (calendars.data ?? []).find(c => c.isDefault && !c.clientId)?.id ?? null;

  const clientOpts = [
    { value: '', label: 'Todos' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  const filteredProfiles = useMemo(() => {
    const items = profiles.data ?? [];
    const term = deferredSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return items;

    return items.filter((p) => {
      const deptName = deptMap.get(p.departmentId)?.name ?? '';
      const clientName = p.clientId ? (clientMap.get(p.clientId)?.name ?? '') : 'global';
      const calendarName = p.slaCalendarId ? (calendarMap.get(p.slaCalendarId)?.name ?? '') : '24x7';
      return [p.name, p.description ?? '', deptName, clientName, calendarName]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(term);
    });
  }, [profiles.data, deferredSearch, deptMap, clientMap, calendarMap]);

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader title="Perfis de Workflow" description="Configure SLA e prioridade padrão por departamento"   breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      />
      )}

      <Card>
        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <Select label="Filtrar por cliente" options={clientOpts} value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <div className="md:col-span-5">
            <div className="relative">
              <Input
                label="Buscar perfil"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nome, departamento, cliente ou calendário"
                className="pr-8"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca de perfis"
                  className="absolute right-2.5 bottom-2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 md:col-span-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void profiles.refetch();
                void calendars.refetch();
                void depts.refetch();
              }}
              disabled={profiles.isFetching || calendars.isFetching}
            >
              <Icon name="refresh" className={`h-4 w-4 ${profiles.isFetching || calendars.isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Icon name="add" className="h-4 w-4" /> Novo Perfil
            </Button>
          </div>
        </div>
      </Card>

      <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">Entendendo o SLA</p>
        <p className="mt-1 text-muted">
          O SLA define o prazo para atendimento de um chamado. Esse prazo pode ser calculado de duas formas:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted list-disc pl-4">
          <li>
            <strong className="text-muted-foreground">Em horas úteis:</strong> se o perfil estiver vinculado a um calendário de SLA (cadastrado em <Link to="/tickets/sla" className="font-medium text-primary hover:underline">SLA e Calendários</Link>), o prazo conta apenas em dias úteis, dentro do horário comercial, desconsiderando feriados. Por exemplo, um SLA de 8 horas pode levar mais de um dia para vencer se o horário comercial for das 8h às 18h.
          </li>
          <li>
            <strong className="text-muted-foreground">24 horas por dia, 7 dias por semana:</strong> se o perfil não estiver vinculado a um calendário, o prazo corre ininterruptamente — finais de semana e madrugadas contam normalmente.
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          Se um chamado for criado em um departamento sem perfil de workflow, nenhum SLA será calculado.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Perfis"
          subtitle={
            searchTerm.trim()
              ? `${filteredProfiles.length} de ${profiles.data?.length ?? 0} perfis`
              : `${profiles.data?.length ?? 0} perfis`
          }
        />
        {profiles.isLoading ? (
          <Loading />
        ) : profiles.isError ? (
          <ErrorDisplay onRetry={() => void profiles.refetch()} />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/5">
            {filteredProfiles.map(p => (
              <ProfileRow
                key={p.id}
                profile={p}
                deptName={deptMap.get(p.departmentId)?.name ?? '\u2014'}
                clientName={p.clientId ? (clientMap.get(p.clientId)?.name ?? '\u2014') : null}
                calendarName={p.slaCalendarId ? (calendarMap.get(p.slaCalendarId)?.name ?? 'calendário removido') : null}
                onEdit={() => setEditTarget(p)}
              />
            ))}
            {filteredProfiles.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">Nenhum perfil encontrado</p>
            )}
          </div>
        )}
      </Card>

      <CreateProfileModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        depts={depts.data ?? []}
        clients={clients.data ?? []}
        defaultClientId={clientId || null}
        calendarOptionsFor={calendarOptionsFor}
        defaultCalendarId={defaultGlobalCalendarId}
      />
      {editTarget && (
        <EditProfileModal
          profile={editTarget}
          onClose={() => setEditTarget(null)}
          depts={depts.data ?? []}
          deptMap={deptMap}
          calendarOptionsFor={calendarOptionsFor}
        />
      )}
    </div>
  );
}

function ProfileRow({ profile, deptName, clientName, calendarName, onEdit }: { profile: WorkflowProfile; deptName: string; clientName: string | null; calendarName: string | null; onEdit: () => void }) {
  const del = useDeleteWorkflowProfile();
  const priorityMeta = profile.defaultPriority ? getTicketPriorityMeta(profile.defaultPriority) : null;

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const handleConfirmDelete = () => {
    del.mutate(profile.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        toast.success('Perfil excluído');
      },
      onError:   () => toast.error('Erro ao excluir'),
    });
  };

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
        <Icon name="schedule" className="h-4 w-4 text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{profile.name}</p>
        <p className="text-xs text-muted">
          {deptName} • SLA: {profile.slaHours}h
          {profile.slaWarningPercent ? ` • Aviso em ${profile.slaWarningPercent}%` : ''}
        </p>
        <p className="text-xs text-muted">
          {calendarName ? `Calendário: ${calendarName}` : 'Sem calendário (SLA 24x7)'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        {priorityMeta && <Badge color={priorityMeta.color}>Prioridade: {priorityMeta.label}</Badge>}
        {clientName ? <Badge color="accent">{clientName}</Badge> : <Badge color="slate">Global</Badge>}
        {!profile.isActive && <Badge color="warning">Inativo</Badge>}
        <button type="button" onClick={onEdit} aria-label="Editar perfil" className="p-1 text-muted hover:text-foreground transition-colors">
          <Icon name="edit" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setConfirmDeleteOpen(true)} aria-label="Excluir perfil" className="p-1 text-muted hover:text-danger transition-colors">
          <Icon name="delete" className="h-4 w-4" />
        </button>
        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Excluir perfil"
          message={`Excluir perfil "${profile.name}"?`}
          confirmLabel="Excluir"
          tone="danger"
          isLoading={del.isPending}
          onConfirm={handleConfirmDelete}
          onClose={() => { if (!del.isPending) setConfirmDeleteOpen(false); }}
        />
      </div>
    </div>
  );
}

function CreateProfileModal({
  open, onClose, depts, clients, defaultClientId, calendarOptionsFor, defaultCalendarId,
}: {
  open: boolean;
  onClose: () => void;
  depts: Department[];
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  calendarOptionsFor: (clientId: string | null) => { value: string; label: string }[];
  defaultCalendarId: string | null;
}) {
  const create = useCreateWorkflowProfile();
  const [form, setForm] = useState<Omit<CreateWorkflowProfileRequest, 'slaHours'>>({
    clientId: defaultClientId,
    departmentId: '',
    name: '',
    description: null,
    slaCalendarId: defaultCalendarId ?? null,
    slaWarningPercent: null,
    defaultPriority: null,
  });
  const [slaHoursInput, setSlaHoursInput] = useState('24');
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setForm({
        clientId: defaultClientId,
        departmentId: '',
        name: '',
        description: null,
        slaCalendarId: defaultCalendarId ?? null,
        slaWarningPercent: null,
        defaultPriority: null,
      });
      setSlaHoursInput('24');
    }
    prevOpenRef.current = open;
  }, [open, defaultClientId, defaultCalendarId]);

  const clientOpts = [
    { value: '', label: 'Global (sem cliente)' },
    ...(clients.map(c => ({ value: c.id, label: c.name }))),
  ];
  const scopedDepts = useMemo(
    () => depts.filter(d => !d.clientId || d.clientId === form.clientId),
    [depts, form.clientId],
  );
  const deptOpts = [
    { value: '', label: 'Selecione...' },
    ...(scopedDepts.map(d => ({ value: d.id, label: d.name }))),
  ];

  const calendarOpts = calendarOptionsFor(form.clientId);
  const parsedSlaHours = Number(slaHoursInput);
  const valid =
    form.name.trim().length >= 2 &&
    !!form.departmentId &&
    slaHoursInput.trim() !== '' &&
    Number.isFinite(parsedSlaHours) &&
    parsedSlaHours >= 1;

  const handleClientChange = (nextClientId: string | null) => {
    const nextCalendarOpts = calendarOptionsFor(nextClientId);
    setForm(f => {
      const deptStillValid = depts.some(
        d => d.id === f.departmentId && (!d.clientId || d.clientId === nextClientId),
      );
      const calendarStillValid =
        !f.slaCalendarId || nextCalendarOpts.some(o => o.value === f.slaCalendarId);
      return {
        ...f,
        clientId: nextClientId,
        departmentId: deptStillValid ? f.departmentId : '',
        slaCalendarId: calendarStillValid ? f.slaCalendarId : (defaultCalendarId ?? null),
      };
    });
  };

  const handleSubmit = () => {
    if (!valid) return;
    create.mutate({ ...form, name: form.name.trim(), slaHours: parsedSlaHours }, {
      onSuccess: () => {
        toast.success('Perfil criado');
        onClose();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar perfil'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Perfil de Workflow">
      <div className="space-y-4">
        <Select label="Cliente" options={clientOpts} value={form.clientId ?? ''} onChange={e => handleClientChange(e.target.value || null)} />
        <Select label="Departamento *" options={deptOpts} value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mín. 2 caracteres" />
        <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SLA (horas) *" type="number" min="1" value={slaHoursInput} onChange={e => setSlaHoursInput(e.target.value)} />
          <Select
            label="Prioridade padrão"
            options={PRIORITY_OPTIONS}
            value={form.defaultPriority ?? ''}
            onChange={e => setForm(f => ({ ...f, defaultPriority: (e.target.value as TicketPriority) || null }))}
          />
        </div>
        <Input
          label="Aviso de SLA (%)"
          type="number"
          min="1"
          max="100"
          value={form.slaWarningPercent ?? ''}
          onChange={e => setForm(f => ({ ...f, slaWarningPercent: e.target.value === '' ? null : Math.min(100, Math.max(1, Number(e.target.value))) }))}
          placeholder="Padrão: 80"
        />
        <Select
          label="Calendário de SLA"
          options={calendarOpts}
          value={form.slaCalendarId ?? ''}
          onChange={e => setForm(f => ({ ...f, slaCalendarId: e.target.value || null }))}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!valid}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProfileModal({ profile, onClose, depts, deptMap, calendarOptionsFor }: { profile: WorkflowProfile; onClose: () => void; depts: Department[]; deptMap: Map<string, Department>; calendarOptionsFor: (clientId: string | null) => { value: string; label: string }[] }) {
  const update = useUpdateWorkflowProfile();
  const [form, setForm] = useState<Omit<UpdateWorkflowProfileRequest, 'slaHours'>>({
    name:            profile.name,
    description:     profile.description,
    departmentId:    profile.departmentId,
    slaCalendarId:   profile.slaCalendarId ?? null,
    slaWarningPercent: profile.slaWarningPercent ?? null,
    defaultPriority: profile.defaultPriority,
    isActive:        profile.isActive,
  });
  const [slaHoursInput, setSlaHoursInput] = useState(String(profile.slaHours));

  const scopedDepts = depts.filter(d => !d.clientId || d.clientId === profile.clientId);
  const deptOpts = scopedDepts.some(d => d.id === profile.departmentId)
    ? scopedDepts.map(d => ({ value: d.id, label: d.name }))
    : [
        { value: profile.departmentId, label: deptMap.get(profile.departmentId)?.name ?? profile.departmentId },
        ...scopedDepts.map(d => ({ value: d.id, label: d.name })),
      ];
  const calendarOpts = calendarOptionsFor(profile.clientId);
  const parsedSlaHours = Number(slaHoursInput);
  const valid =
    form.name.trim().length >= 2 &&
    !!form.departmentId &&
    slaHoursInput.trim() !== '' &&
    Number.isFinite(parsedSlaHours) &&
    parsedSlaHours >= 1;

  const handleSubmit = () => {
    if (!valid) return;
    update.mutate({ id: profile.id, data: { ...form, name: form.name.trim(), slaHours: parsedSlaHours, clearSlaCalendar: !form.slaCalendarId } }, {
      onSuccess: () => { toast.success('Perfil atualizado'); onClose(); },
      onError:   (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar perfil'),
    });
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar: ${profile.name}`}>
      <div className="space-y-4">
        <Select label="Departamento *" options={deptOpts} value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SLA (horas) *" type="number" min="1" value={slaHoursInput} onChange={e => setSlaHoursInput(e.target.value)} />
          <Select
            label="Prioridade padrão"
            options={PRIORITY_OPTIONS}
            value={form.defaultPriority ?? ''}
            onChange={e => setForm(f => ({ ...f, defaultPriority: (e.target.value as TicketPriority) || null }))}
          />
        </div>
        <Input
          label="Aviso de SLA (%)"
          type="number"
          min="1"
          max="100"
          value={form.slaWarningPercent ?? ''}
          onChange={e => setForm(f => ({ ...f, slaWarningPercent: e.target.value === '' ? null : Math.min(100, Math.max(1, Number(e.target.value))) }))}
          placeholder="Padrão: 80"
        />
        <Select
          label="Calendário de SLA"
          options={calendarOpts}
          value={form.slaCalendarId ?? ''}
          onChange={e => setForm(f => ({ ...f, slaCalendarId: e.target.value || null }))}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded bg-surface-light border-border" />
          Ativo
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={update.isPending} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

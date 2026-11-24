import { formatDateTime } from '@/utils/format';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Select,
  PageHeader,
  ConfirmDialog,
} from '@/components/ui';
import { reportSchedulesApi } from '@/api';
import { useReportTemplates } from '@/hooks';
import type { ReportSchedule, CreateReportScheduleRequest, UpdateReportScheduleRequest } from '@/api';

const FREQUENCY_LABELS: Record<number, string> = {
  0: 'Diário',
  1: 'Semanal',
  2: 'Mensal',
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type FormState = {
  name: string;
  templateId: string;
  frequency: number;
  dayOfWeek: number;
  dayOfMonth: number;
  hourUtc: number;
  minuteUtc: number;
  format: number;
  recipients: string;
  isActive: boolean;
};

const FORMAT_LABELS: Record<number, string> = {
  0: 'Excel (XLSX)',
  2: 'CSV',
  3: 'Markdown',
};

const DEFAULT_FORM: FormState = {
  name: '',
  templateId: '',
  frequency: 0,
  dayOfWeek: 1,
  dayOfMonth: 1,
  hourUtc: 8,
  minuteUtc: 0,
  format: 3,
  recipients: '',
  isActive: true,
};

function utcToLocalHourMinute(hourUtc: number, minuteUtc: number): { hour: number; minute: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minuteUtc));
  return { hour: d.getHours(), minute: d.getMinutes() };
}

function localToUtcHourMinute(hourLocal: number, minuteLocal: number): { hourUtc: number; minuteUtc: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hourLocal, minuteLocal);
  return { hourUtc: d.getUTCHours(), minuteUtc: d.getUTCMinutes() };
}

export default function ReportSchedulesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedTemplateId = searchParams.get('templateId') || '';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(Boolean(preselectedTemplateId));
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    templateId: preselectedTemplateId,
  }));

  const templatesQuery = useReportTemplates({ isActive: true });
  const templateOptions = useMemo(
    () => [
      { value: '', label: 'Selecione um template...' },
      ...(templatesQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ],
    [templatesQuery.data],
  );
  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templatesQuery.data ?? []) map.set(t.id, t.name);
    return map;
  }, [templatesQuery.data]);

  useEffect(() => {
    if (preselectedTemplateId && !editingId) {
      setShowCreate(true);
      setForm((prev) => ({ ...prev, templateId: preselectedTemplateId }));
    }
  }, [preselectedTemplateId, editingId]);

  const { data: schedules = [], isLoading, error, refetch } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: () => reportSchedulesApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportSchedulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast.success('Agendamento excluído');
    },
    onError: () => toast.error('Erro ao excluir'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CreateReportScheduleRequest | UpdateReportScheduleRequest) =>
      editingId
        ? reportSchedulesApi.update(editingId, data as UpdateReportScheduleRequest)
        : reportSchedulesApi.create(data as CreateReportScheduleRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast.success(editingId ? 'Agendamento atualizado' : 'Agendamento criado');
      resetForm();
    },
    onError: () => toast.error('Erro ao salvar'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      reportSchedulesApi.update(id, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast.success(vars.isActive ? 'Agendamento ativado' : 'Agendamento pausado');
    },
    onError: () => toast.error('Erro ao alterar status do agendamento'),
  });

  const resetForm = () => {
    setEditingId(null);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
  };

  const handleSave = () => {
    if (!form.templateId.trim()) {
      toast.error('Selecione um template de relatório');
      return;
    }
    const payload: CreateReportScheduleRequest = {
      name: form.name,
      templateId: form.templateId,
      frequency: form.frequency,
      hourUtc: form.hourUtc,
      minuteUtc: form.minuteUtc,
      format: Number(form.format),
      dayOfWeek: form.frequency === 1 ? form.dayOfWeek : undefined,
      dayOfMonth: form.frequency === 2 ? form.dayOfMonth : undefined,
      recipients: form.recipients ? form.recipients.split(',').map((s) => s.trim()) : undefined,
      isActive: form.isActive,
    };
    saveMutation.mutate(payload);
  };

  const formatSchedule = (schedule: ReportSchedule) => {
    const local = utcToLocalHourMinute(schedule.hourUtc, schedule.minuteUtc);
    const hour = String(local.hour).padStart(2, '0');
    const min = String(local.minute).padStart(2, '0');
    let desc = `${FREQUENCY_LABELS[schedule.frequency] ?? '?'} às ${hour}:${min}`;
    if (schedule.frequency === 1 && schedule.dayOfWeek != null) {
      desc += ` (${WEEKDAYS[schedule.dayOfWeek] ?? '?'})`;
    } else if (schedule.frequency === 2 && schedule.dayOfMonth != null) {
      desc += ` (dia ${schedule.dayOfMonth})`;
    }
    return desc;
  };

  if (isLoading) return <Loading message="Carregando agendamentos..." />;
  if (error) return <ErrorDisplay message={error.message} onRetry={() => refetch()} />;

  const localTime = utcToLocalHourMinute(form.hourUtc, form.minuteUtc);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agendamentos de Relatórios"
        description="Configure a geração automática de relatórios em intervalos programados"
      >
        <Button onClick={() => setShowCreate(true)} disabled={showCreate || !!editingId}>
          <Icon name="add" className="w-4 h-4 mr-2" />
          Novo Agendamento
        </Button>
      </PageHeader>

      {(showCreate || editingId) && (
        <Card>
          <CardHeader title={editingId ? 'Editar Agendamento' : 'Novo Agendamento'} />
          <div className="p-4 space-y-4">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do agendamento"
            />
            <Select
              label="Template de Relatório"
              value={form.templateId}
              onChange={(e) => {
                const nextId = e.target.value;
                const matched = (templatesQuery.data ?? []).find((t) => t.id === nextId);
                setForm({
                  ...form,
                  templateId: nextId,
                  name: form.name || matched?.name || '',
                });
              }}
              options={templateOptions}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Frequência"
                value={String(form.frequency)}
                onChange={(e) =>
                  setForm({ ...form, frequency: Number(e.target.value) })
                }
                options={[
                  { value: '0', label: 'Diário' },
                  { value: '1', label: 'Semanal' },
                  { value: '2', label: 'Mensal' },
                ]}
              />
              <Select
                label="Formato"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: Number(e.target.value) })}
                options={[
                  { value: '3', label: 'Markdown' },
                  { value: '0', label: 'Excel (XLSX)' },
                  { value: '2', label: 'CSV' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hora (Local)"
                type="number"
                min={0}
                max={23}
                value={String(localTime.hour)}
                onChange={(e) => {
                  const { hourUtc, minuteUtc } = localToUtcHourMinute(Number(e.target.value), localTime.minute);
                  setForm({ ...form, hourUtc, minuteUtc });
                }}
                hint={`Equivalente em UTC: ${String(form.hourUtc).padStart(2, '0')}:${String(form.minuteUtc).padStart(2, '0')} UTC`}
              />
              <Input
                label="Minuto (Local)"
                type="number"
                min={0}
                max={59}
                value={String(localTime.minute)}
                onChange={(e) => {
                  const { hourUtc, minuteUtc } = localToUtcHourMinute(localTime.hour, Number(e.target.value));
                  setForm({ ...form, hourUtc, minuteUtc });
                }}
              />
            </div>
            {form.frequency === 1 && (
              <Select
                label="Dia da Semana"
                value={String(form.dayOfWeek)}
                onChange={(e) =>
                  setForm({ ...form, dayOfWeek: Number(e.target.value) })
                }
                options={[
                  { value: '0', label: 'Domingo' },
                  { value: '1', label: 'Segunda-feira' },
                  { value: '2', label: 'Terça-feira' },
                  { value: '3', label: 'Quarta-feira' },
                  { value: '4', label: 'Quinta-feira' },
                  { value: '5', label: 'Sexta-feira' },
                  { value: '6', label: 'Sábado' },
                ]}
              />
            )}
            {form.frequency === 2 && (
              <Input
                label="Dia do Mês"
                type="number"
                min={1}
                max={31}
                value={String(form.dayOfMonth)}
                onChange={(e) =>
                  setForm({ ...form, dayOfMonth: Number(e.target.value) })
                }
              />
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-border bg-surface-light"
              />
              Agendamento ativo
            </label>
            <div className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
              Os relatórios agendados ficam disponíveis no <strong>Histórico de Execuções</strong> e geram notificação no console quando concluídos.
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {schedules.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            <Icon name="event" className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum agendamento configurado</p>
            <p className="text-sm">Crie agendamentos para gerar relatórios automaticamente</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{schedule.name}</h3>
                      <Badge color={schedule.isActive ? 'success' : 'slate'}>
                        {schedule.isActive ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Template: {templateNameById.get(schedule.templateId) ?? schedule.templateId}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Icon name="schedule" className="w-3.5 h-3.5" />
                        {formatSchedule(schedule)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="description" className="w-3.5 h-3.5" />
                        {FORMAT_LABELS[Number(schedule.format)] ?? String(schedule.format)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {schedule.nextRunAt && (
                        <span>Próxima execução: {formatDateTime(schedule.nextRunAt)}</span>
                      )}
                      {schedule.lastRunAt && (
                        <span>Última execução: {formatDateTime(schedule.lastRunAt)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={schedule.isActive ? `Pausar agendamento ${schedule.name}` : `Ativar agendamento ${schedule.name}`}
                      title={schedule.isActive ? 'Pausar' : 'Ativar'}
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => toggleActiveMutation.mutate({ id: schedule.id, isActive: !schedule.isActive })}
                    >
                      <Icon name={schedule.isActive ? 'cancel' : 'play_arrow'} className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar agendamento ${schedule.name}`}
                      onClick={() => {
                        setForm({
                          name: schedule.name,
                          templateId: schedule.templateId,
                          frequency: schedule.frequency,
                          dayOfWeek: schedule.dayOfWeek ?? 1,
                          dayOfMonth: schedule.dayOfMonth ?? 1,
                          hourUtc: schedule.hourUtc,
                          minuteUtc: schedule.minuteUtc,
                          format: Number(schedule.format),
                          recipients: schedule.recipients?.join(', ') ?? '',
                          isActive: schedule.isActive,
                        });
                        setEditingId(schedule.id);
                        setShowCreate(false);
                      }}
                      title="Editar"
                    >
                      <Icon name="edit" className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Excluir agendamento ${schedule.name}`}
                      onClick={() => setDeleteTargetId(schedule.id)}
                      title="Excluir"
                    >
                      <Icon name="delete" className="w-4 h-4 text-danger" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Excluir agendamento"
        message="Excluir este agendamento?"
        confirmLabel="Excluir"
        tone="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteMutation.mutate(deleteTargetId, {
            onSuccess: () => setDeleteTargetId(null),
          });
        }}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarClock, Plus, Pencil, Trash2, Clock, FileText } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Select,
} from '@/components/ui';
import { reportSchedulesApi } from '@/api';
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
  format: string;
  recipients: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  name: '',
  templateId: '',
  frequency: 0,
  dayOfWeek: 1,
  dayOfMonth: 1,
  hourUtc: 8,
  minuteUtc: 0,
  format: 'Pdf',
  recipients: '',
  isActive: true,
};

export default function ReportSchedulesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const { data: schedules = [], isLoading, error } = useQuery({
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

  const resetForm = () => {
    setEditingId(null);
    setShowCreate(false);
    setForm(DEFAULT_FORM);
  };

  const handleSave = () => {
    const payload: CreateReportScheduleRequest = {
      name: form.name,
      templateId: form.templateId,
      frequency: form.frequency,
      hourUtc: form.hourUtc,
      minuteUtc: form.minuteUtc,
      format: form.format as 'Pdf' | 'Xlsx' | 'Csv',
      dayOfWeek: form.frequency === 1 ? form.dayOfWeek : undefined,
      dayOfMonth: form.frequency === 2 ? form.dayOfMonth : undefined,
      recipients: form.recipients ? form.recipients.split(',').map((s) => s.trim()) : undefined,
      isActive: form.isActive,
    };
    saveMutation.mutate(payload);
  };

  const formatSchedule = (schedule: ReportSchedule) => {
    const hour = String(schedule.hourUtc).padStart(2, '0');
    const min = String(schedule.minuteUtc).padStart(2, '0');
    let desc = `${FREQUENCY_LABELS[schedule.frequency] ?? '?'} às ${hour}:${min} UTC`;
    if (schedule.frequency === 1 && schedule.dayOfWeek != null) {
      desc += ` (${WEEKDAYS[schedule.dayOfWeek] ?? '?'})`;
    } else if (schedule.frequency === 2 && schedule.dayOfMonth != null) {
      desc += ` (dia ${schedule.dayOfMonth})`;
    }
    return desc;
  };

  if (isLoading) return <Loading message="Carregando agendamentos..." />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agendamentos de Relatórios</h1>
          <p className="text-muted-foreground mt-1">
            Configure a geração automática de relatórios em intervalos programados
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={showCreate || !!editingId}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

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
            <Input
              label="ID do Template"
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              placeholder="GUID do template de relatório"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Frequência"
                value={String(form.frequency)}
                onChange={(e) =>
                  setForm({ ...form, frequency: Number(e.target.value) })
                }
              >
                <option value="0">Diário</option>
                <option value="1">Semanal</option>
                <option value="2">Mensal</option>
              </Select>
              <Select
                label="Formato"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
              >
                <option value="Pdf">PDF</option>
                <option value="Xlsx">Excel (XLSX)</option>
                <option value="Csv">CSV</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hora (UTC)"
                type="number"
                min={0}
                max={23}
                value={String(form.hourUtc)}
                onChange={(e) =>
                  setForm({ ...form, hourUtc: Number(e.target.value) })
                }
              />
              <Input
                label="Minuto (UTC)"
                type="number"
                min={0}
                max={59}
                value={String(form.minuteUtc)}
                onChange={(e) =>
                  setForm({ ...form, minuteUtc: Number(e.target.value) })
                }
              />
            </div>
            {form.frequency === 1 && (
              <Select
                label="Dia da Semana"
                value={String(form.dayOfWeek)}
                onChange={(e) =>
                  setForm({ ...form, dayOfWeek: Number(e.target.value) })
                }
              >
                <option value="0">Domingo</option>
                <option value="1">Segunda-feira</option>
                <option value="2">Terça-feira</option>
                <option value="3">Quarta-feira</option>
                <option value="4">Quinta-feira</option>
                <option value="5">Sexta-feira</option>
                <option value="6">Sábado</option>
              </Select>
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
            <Input
              label="Destinatários (emails separados por vírgula)"
              value={form.recipients}
              onChange={(e) => setForm({ ...form, recipients: e.target.value })}
              placeholder="email1@exemplo.com, email2@exemplo.com"
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {schedules.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            <CalendarClock className="w-12 h-12 mx-auto mb-4 opacity-50" />
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
                      <Badge variant={schedule.isActive ? 'success' : 'secondary'}>
                        {schedule.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatSchedule(schedule)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {schedule.format}
                      </span>
                    </div>
                    {schedule.lastRunAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Última execução: {new Date(schedule.lastRunAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setForm({
                          name: schedule.name,
                          templateId: schedule.templateId,
                          frequency: schedule.frequency,
                          dayOfWeek: schedule.dayOfWeek ?? 1,
                          dayOfMonth: schedule.dayOfMonth ?? 1,
                          hourUtc: schedule.hourUtc,
                          minuteUtc: schedule.minuteUtc,
                          format: String(schedule.format),
                          recipients: schedule.recipients?.join(', ') ?? '',
                          isActive: schedule.isActive,
                        });
                        setEditingId(schedule.id);
                        setShowCreate(false);
                      }}
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Excluir este agendamento?'))
                          deleteMutation.mutate(schedule.id);
                      }}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

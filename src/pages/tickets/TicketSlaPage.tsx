import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Clock3,
  ExternalLink,
  Pencil,
  Plus,
  TimerReset,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import type {
  Client,
  Department,
  SlaCalendarDetail,
  SlaCalendarHoliday,
  TicketEscalationRule,
  UserDto,
  WorkflowProfile,
} from "@/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Select,
} from "@/components/ui";
import {
  useAddSlaCalendarHoliday,
  useClients,
  useCreateEscalationRule,
  useCreateSlaCalendar,
  useDeleteEscalationRule,
  useDeleteSlaCalendar,
  useDeleteSlaCalendarHoliday,
  useDepartments,
  useEscalationRules,
  useEscalationRulesByWorkflowProfile,
  useIamUsers,
  useSlaCalendar,
  useSlaCalendars,
  useUpdateEscalationRule,
  useUpdateSlaCalendar,
  useWorkflowProfiles,
} from "@/hooks";

const WORKDAY_OPTIONS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC (UTC±0)" },
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/New_York", label: "Nova York (GMT-5/-4)" },
  { value: "America/Chicago", label: "Chicago (GMT-6/-5)" },
  { value: "America/Denver", label: "Denver (GMT-7/-6)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (GMT-3)" },
  { value: "America/Mexico_City", label: "Cidade do México (GMT-6)" },
  { value: "America/Bogota", label: "Bogotá (GMT-5)" },
  { value: "America/Santiago", label: "Santiago (GMT-4/-3)" },
  { value: "America/Caracas", label: "Caracas (GMT-4)" },
  { value: "America/Lima", label: "Lima (GMT-5)" },
  { value: "Europe/London", label: "Londres (GMT+0/+1)" },
  { value: "Europe/Lisbon", label: "Lisboa (GMT+0/+1)" },
  { value: "Europe/Madrid", label: "Madrid (GMT+1/+2)" },
  { value: "Europe/Berlin", label: "Berlim (GMT+1/+2)" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)" },
  { value: "Europe/Rome", label: "Roma (GMT+1/+2)" },
  { value: "Asia/Tokyo", label: "Tóquio (GMT+9)" },
  { value: "Asia/Shanghai", label: "China (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapura (GMT+8)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Seoul", label: "Seul (GMT+9)" },
  { value: "Asia/Kolkata", label: "Índia (GMT+5:30)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
  { value: "Pacific/Auckland", label: "Auckland (GMT+12/+13)" },
  { value: "Africa/Cairo", label: "Cairo (GMT+2)" },
  { value: "Africa/Johannesburg", label: "África do Sul (GMT+2)" },
];

const HOLIDAY_TYPE_OPTIONS = [
   { value: "0", label: "Fixo (data específica, não recorre)" },
  { value: "1", label: "Anual (recorre todo ano - ex: Natal)" },
  { value: "2", label: "Relativo (calculo por regra - ex: 3ª seg de jan)" },
];

const RELATIVE_METHOD_OPTIONS = [
  { value: "0", label: "Enesima ocorrencia de dia da semana" },
  { value: "1", label: "Enesimo dia util do mes" },
];

const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Marco" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terca-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sabado" },
];

const OCCURRENCE_OPTIONS = [
  { value: "1", label: "1ª" },
  { value: "2", label: "2ª" },
  { value: "3", label: "3ª" },
  { value: "4", label: "4ª" },
  { value: "5", label: "Ultima" },
];

type CalendarFormState = {
  name: string;
  clientId: string;
  timezone: string;
  workDayStartHour: string;
  workDayEndHour: string;
  workDays: number[];
};

type EscalationFormState = {
  workflowProfileId: string;
  name: string;
  triggerAtSlaPercent: string;
  triggerAtHoursBefore: string;
  reassignToUserId: string;
  reassignToDepartmentId: string;
  bumpPriority: boolean;
  notifyAssignee: boolean;
  isActive: boolean;
};

const DEFAULT_CALENDAR_FORM: CalendarFormState = {
  name: "",
  clientId: "",
  timezone: "UTC",
  workDayStartHour: "8",
  workDayEndHour: "18",
  workDays: [1, 2, 3, 4, 5],
};

const DEFAULT_RULE_FORM: EscalationFormState = {
  workflowProfileId: "",
  name: "",
  triggerAtSlaPercent: "80",
  triggerAtHoursBefore: "0",
  reassignToUserId: "",
  reassignToDepartmentId: "",
  bumpPriority: false,
  notifyAssignee: true,
  isActive: true,
};

function parseWorkDaysJson(raw: string | null | undefined) {
  if (!raw) return [1, 2, 3, 4, 5];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [1, 2, 3, 4, 5];

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
      .sort((left, right) => left - right);
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function buildWorkDaysJson(workDays: number[]) {
  return JSON.stringify([...new Set(workDays)].sort((left, right) => left - right));
}

function formatWorkDays(raw: string) {
  const workDays = parseWorkDaysJson(raw);
  return WORKDAY_OPTIONS.filter((option) => workDays.includes(option.value))
    .map((option) => option.label)
    .join(", ");
}

function formatHoursBefore(hours: number) {
  if (hours <= 0) return "Sem gatilho por antecedencia";
  if (hours === 1) return "1h antes do vencimento";
  return `${hours}h antes do vencimento`;
}

function toggleWorkDay(workDays: number[], day: number) {
  return workDays.includes(day)
    ? workDays.filter((value) => value !== day)
    : [...workDays, day].sort((left, right) => left - right);
}

function toCalendarFormState(calendar: SlaCalendarDetail): CalendarFormState {
  return {
    name: calendar.name,
    clientId: calendar.clientId ?? "",
    timezone: calendar.timezone,
    workDayStartHour: String(calendar.workDayStartHour),
    workDayEndHour: String(calendar.workDayEndHour),
    workDays: parseWorkDaysJson(calendar.workDaysJson),
  };
}

function toRuleFormState(rule: TicketEscalationRule): EscalationFormState {
  return {
    workflowProfileId: rule.workflowProfileId,
    name: rule.name,
    triggerAtSlaPercent: String(rule.triggerAtSlaPercent),
    triggerAtHoursBefore: String(rule.triggerAtHoursBefore),
    reassignToUserId: rule.reassignToUserId ?? "",
    reassignToDepartmentId: rule.reassignToDepartmentId ?? "",
    bumpPriority: rule.bumpPriority,
    notifyAssignee: rule.notifyAssignee,
    isActive: rule.isActive,
  };
}

function getWorkflowProfileLabel(
  profile: WorkflowProfile,
  departmentsById: Map<string, Department>,
  clientsById: Map<string, Client>,
) {
  const department = departmentsById.get(profile.departmentId);
  const client = profile.clientId ? clientsById.get(profile.clientId) : null;
  const suffix = [department?.name, client?.name].filter(Boolean).join(" • ");
  return suffix ? `${profile.name} • ${suffix}` : profile.name;
}

export default function TicketSlaPage() {
  const navigate = useNavigate();
  const clientsQuery = useClients();
  const departmentsQuery = useDepartments({ includeGlobal: true });
  const usersQuery = useIamUsers();
  const workflowProfilesQuery = useWorkflowProfiles({ includeGlobal: true });

  const [selectedClientId, setSelectedClientId] = useState("");
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [calendarForm, setCalendarForm] =
    useState<CalendarFormState>(DEFAULT_CALENDAR_FORM);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState("1"); // default: Yearly
  const [holidayRelativeMonth, setHolidayRelativeMonth] = useState("1");
  const [holidayRelativeDayOfWeek, setHolidayRelativeDayOfWeek] = useState("1");
  const [holidayRelativeOccurrence, setHolidayRelativeOccurrence] = useState("1");
  const [holidayRelativeMethod, setHolidayRelativeMethod] = useState("0"); // DayOfWeekOccurrence

  const [selectedWorkflowProfileId, setSelectedWorkflowProfileId] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<EscalationFormState>(DEFAULT_RULE_FORM);

  const calendarsQuery = useSlaCalendars(selectedClientId || undefined);
  const calendarDetailQuery = useSlaCalendar(editingCalendarId);
  const activeRulesQuery = useEscalationRules(!selectedWorkflowProfileId);
  const profileRulesQuery = useEscalationRulesByWorkflowProfile(
    selectedWorkflowProfileId,
    !!selectedWorkflowProfileId,
  );

  const createCalendar = useCreateSlaCalendar();
  const updateCalendar = useUpdateSlaCalendar();
  const deleteCalendar = useDeleteSlaCalendar();
  const addHoliday = useAddSlaCalendarHoliday();
  const deleteHoliday = useDeleteSlaCalendarHoliday();

  const createRule = useCreateEscalationRule();
  const updateRule = useUpdateEscalationRule();
  const deleteRule = useDeleteEscalationRule();

  const clients: Client[] = clientsQuery.data ?? [];
  const departments: Department[] = departmentsQuery.data ?? [];
  const users: UserDto[] = usersQuery.data ?? [];
  const workflowProfiles: WorkflowProfile[] = workflowProfilesQuery.data ?? [];
  const calendars = calendarsQuery.data ?? [];
  const rules: TicketEscalationRule[] = (
    selectedWorkflowProfileId ? profileRulesQuery.data : activeRulesQuery.data
  ) ?? [];

  const clientsById = useMemo(
    () => new Map<string, Client>(clients.map((client) => [client.id, client])),
    [clients],
  );
  const departmentsById = useMemo(
    () => new Map<string, Department>(departments.map((item) => [item.id, item])),
    [departments],
  );
  const usersById = useMemo(
    () => new Map<string, UserDto>(users.map((user) => [user.id, user])),
    [users],
  );
  const workflowProfilesById = useMemo(
    () =>
      new Map<string, WorkflowProfile>(
        workflowProfiles.map((profile) => [profile.id, profile]),
      ),
    [workflowProfiles],
  );

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Global / todos os clientes" },
      ...clients.map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients],
  );

  const workflowProfileOptions = useMemo(
    () => [
      { value: "", label: "Selecione um workflow profile" },
      ...workflowProfiles.map((profile) => ({
        value: profile.id,
        label: getWorkflowProfileLabel(profile, departmentsById, clientsById),
      })),
    ],
    [clientsById, departmentsById, workflowProfiles],
  );

  const workflowProfileFilterOptions = useMemo(
    () => [
      { value: "", label: "Ativas de todos os perfis" },
      ...workflowProfiles.map((profile) => ({
        value: profile.id,
        label: getWorkflowProfileLabel(profile, departmentsById, clientsById),
      })),
    ],
    [clientsById, departmentsById, workflowProfiles],
  );

  const userOptions = useMemo(
    () => [
      { value: "", label: "Não reatribuir usuário" },
      ...users.map((user) => ({
        value: user.id,
        label: user.fullName || user.login || user.email,
      })),
    ],
    [users],
  );

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "Não reatribuir departamento" },
      ...departments.map((department) => ({
        value: department.id,
        label: department.name,
      })),
    ],
    [departments],
  );

  const sortedCalendars = useMemo(
    () => [...calendars].sort((left, right) => left.name.localeCompare(right.name)),
    [calendars],
  );

  const sortedRules = useMemo(
    () =>
      [...rules].sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      }),
    [rules],
  );

  const totalHolidays = sortedCalendars.reduce(
    (sum, calendar) => sum + calendar.holidayCount,
    0,
  );

  useEffect(() => {
    if (!editingCalendarId) {
      setCalendarForm({
        ...DEFAULT_CALENDAR_FORM,
        clientId: selectedClientId,
      });
      return;
    }

    if (calendarDetailQuery.data) {
      setCalendarForm(toCalendarFormState(calendarDetailQuery.data));
    }
  }, [calendarDetailQuery.data, editingCalendarId, selectedClientId]);

  const loading =
    (clientsQuery.isLoading && clients.length === 0) ||
    (departmentsQuery.isLoading && departments.length === 0) ||
    (usersQuery.isLoading && users.length === 0) ||
    (workflowProfilesQuery.isLoading && workflowProfiles.length === 0) ||
    (calendarsQuery.isLoading && calendars.length === 0) ||
    (!selectedWorkflowProfileId && activeRulesQuery.isLoading && rules.length === 0) ||
    (!!selectedWorkflowProfileId && profileRulesQuery.isLoading && rules.length === 0);

  const hasError =
    clientsQuery.isError ||
    departmentsQuery.isError ||
    usersQuery.isError ||
    workflowProfilesQuery.isError ||
    calendarsQuery.isError ||
    activeRulesQuery.isError ||
    profileRulesQuery.isError;

  if (loading) {
    return <Loading />;
  }

  if (hasError) {
    return (
      <ErrorDisplay
        onRetry={() => {
          void clientsQuery.refetch();
          void departmentsQuery.refetch();
          void usersQuery.refetch();
          void workflowProfilesQuery.refetch();
          void calendarsQuery.refetch();
          void activeRulesQuery.refetch();
          void profileRulesQuery.refetch();
        }}
      />
    );
  }

  async function handleSaveCalendar() {
    const startHour = Number(calendarForm.workDayStartHour);
    const endHour = Number(calendarForm.workDayEndHour);

    if (!calendarForm.name.trim()) {
      toast.error("Informe o nome do calendario.");
      return;
    }

    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      toast.error("Horário inicial inválido.");
      return;
    }

    if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
      toast.error("Horário final inválido.");
      return;
    }

    if (endHour <= startHour) {
      toast.error("Horário final deve ser maior que o inicial.");
      return;
    }

    if (calendarForm.workDays.length === 0) {
      toast.error("Selecione ao menos um dia util.");
      return;
    }

    try {
      if (editingCalendarId) {
        await updateCalendar.mutateAsync({
          id: editingCalendarId,
          data: {
            name: calendarForm.name.trim(),
            timezone: calendarForm.timezone.trim() || "UTC",
            workDayStartHour: startHour,
            workDayEndHour: endHour,
            workDaysJson: buildWorkDaysJson(calendarForm.workDays),
          },
        });
        toast.success("Calendario atualizado com sucesso.");
      } else {
        const created = await createCalendar.mutateAsync({
          name: calendarForm.name.trim(),
          clientId: calendarForm.clientId || null,
          timezone: calendarForm.timezone.trim() || "UTC",
          workDayStartHour: startHour,
          workDayEndHour: endHour,
          workDaysJson: buildWorkDaysJson(calendarForm.workDays),
        });
        setEditingCalendarId(created.id);
        toast.success("Calendário criado com sucesso.");
       }
     } catch (error) {
       toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível salvar o calendário.",
      );
    }
  }

  async function handleDeleteCalendar(id: string, name: string) {
    if (!window.confirm(`Excluir o calendário \"${name}\"?`)) {
      return;
    }

    try {
      await deleteCalendar.mutateAsync(id);
      if (editingCalendarId === id) {
        setEditingCalendarId(null);
      }
      toast.success("Calendario removido com sucesso.");
    } catch (error) {
      toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível excluir o calendário.",
      );
    }
  }

  async function handleAddHoliday() {
    if (!editingCalendarId) {
      toast.error("Salve o calendário antes de adicionar feriados.");
      return;
    }

    if (!holidayName.trim()) {
      toast.error("Informe o nome do feriado.");
      return;
    }

    const typeNum = Number(holidayType);

    // Validacao especifica por tipo
    if (typeNum === 0 || typeNum === 1) {
      // Fixed ou Yearly: precisa de data
      if (!holidayDate) {
        toast.error("Informe a data do feriado.");
        return;
      }
    }

    if (typeNum === 2) {
      // Relative: precisa de mes
      if (!holidayRelativeMonth) {
        toast.error("Informe o mes para o feriado relativo.");
        return;
      }
    }

    try {
      const payload: Record<string, unknown> = {
        name: holidayName.trim(),
        date: holidayDate ? `${holidayDate}T00:00:00` : "2000-01-01T00:00:00",
        holidayType: typeNum,
      };

      if (typeNum === 2) {
        payload.relativeMonth = Number(holidayRelativeMonth);
        payload.relativeMethod = Number(holidayRelativeMethod);
        if (holidayRelativeMethod === "0") {
          payload.relativeDayOfWeek = Number(holidayRelativeDayOfWeek);
          payload.relativeOccurrence = Number(holidayRelativeOccurrence);
        } else {
          payload.relativeDayOfWeek = null;
          payload.relativeOccurrence = Number(holidayRelativeOccurrence);
        }
      }

      await addHoliday.mutateAsync({
        id: editingCalendarId,
        data: payload as never,
      });
      resetHolidayForm();
      toast.success("Feriado adicionado com sucesso.");
     } catch (error) {
       toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível adicionar o feriado.",
      );
    }
  }

  function resetHolidayForm() {
    setHolidayDate("");
    setHolidayName("");
    setHolidayType("1");
    setHolidayRelativeMonth("1");
    setHolidayRelativeDayOfWeek("1");
    setHolidayRelativeOccurrence("1");
    setHolidayRelativeMethod("0");
  }

  function getHolidayTypeLabel(holiday: SlaCalendarHoliday): string {
    const t = holiday.holidayType;
    if (t === 2) {
      const month = MONTH_OPTIONS.find(m => m.value === String(holiday.relativeMonth))?.label ?? "";
      if (holiday.relativeMethod === 1) {
        const occ = OCCURRENCE_OPTIONS.find(o => o.value === String(holiday.relativeOccurrence))?.label ?? "";
        return `${occ} dia util de ${month}`;
      }
      const dow = DAY_OF_WEEK_OPTIONS.find(d => d.value === String(holiday.relativeDayOfWeek))?.label ?? "";
      const occ = OCCURRENCE_OPTIONS.find(o => o.value === String(holiday.relativeOccurrence))?.label ?? "";
      return `${occ} ${dow} de ${month}`;
    }
    if (t === 1) return "Anual";
    return "Fixo";
  }

  async function handleDeleteHoliday(holidayId: string, name: string) {
    if (!editingCalendarId) return;
    if (!window.confirm(`Remover o feriado \"${name}\"?`)) {
      return;
    }

    try {
      await deleteHoliday.mutateAsync({ id: editingCalendarId, holidayId });
      toast.success("Feriado removido com sucesso.");
     } catch (error) {
       toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível remover o feriado.",
      );
    }
  }

  function resetRuleForm(nextWorkflowProfileId = selectedWorkflowProfileId) {
    setEditingRuleId(null);
    setRuleForm({
      ...DEFAULT_RULE_FORM,
      workflowProfileId: nextWorkflowProfileId,
    });
  }

  async function handleSaveRule() {
    if (!ruleForm.workflowProfileId) {
      toast.error("Selecione um workflow profile.");
      return;
    }

    if (!ruleForm.name.trim()) {
      toast.error("Informe o nome da regra.");
      return;
    }

    const triggerAtSlaPercent = Number(ruleForm.triggerAtSlaPercent || "0");
    const triggerAtHoursBefore = Number(ruleForm.triggerAtHoursBefore || "0");

    if (!Number.isFinite(triggerAtSlaPercent) || triggerAtSlaPercent < 0) {
      toast.error("Percentual de disparo inválido.");
      return;
    }

    if (!Number.isFinite(triggerAtHoursBefore) || triggerAtHoursBefore < 0) {
      toast.error("Horas antes do vencimento invalidas.");
      return;
    }

    try {
      if (editingRuleId) {
        await updateRule.mutateAsync({
          id: editingRuleId,
          data: {
            name: ruleForm.name.trim(),
            triggerAtSlaPercent,
            triggerAtHoursBefore,
            reassignToUserId: ruleForm.reassignToUserId || null,
            reassignToDepartmentId: ruleForm.reassignToDepartmentId || null,
            bumpPriority: ruleForm.bumpPriority,
            notifyAssignee: ruleForm.notifyAssignee,
            isActive: ruleForm.isActive,
          },
        });
        toast.success("Regra de escalonamento atualizada.");
      } else {
        await createRule.mutateAsync({
          workflowProfileId: ruleForm.workflowProfileId,
          name: ruleForm.name.trim(),
          triggerAtSlaPercent,
          triggerAtHoursBefore,
          reassignToUserId: ruleForm.reassignToUserId || null,
          reassignToDepartmentId: ruleForm.reassignToDepartmentId || null,
          bumpPriority: ruleForm.bumpPriority,
          notifyAssignee: ruleForm.notifyAssignee,
        });
        toast.success("Regra de escalonamento criada.")
       }

       setSelectedWorkflowProfileId(ruleForm.workflowProfileId);
       resetRuleForm(ruleForm.workflowProfileId);
     } catch (error) {
       toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível salvar a regra.",
      );
    }
  }

  async function handleDeleteRule(id: string, name: string) {
    if (!window.confirm(`Excluir a regra \"${name}\"?`)) {
      return;
    }

    try {
      await deleteRule.mutateAsync(id);
      if (editingRuleId === id) {
        resetRuleForm();
      }
      toast.success("Regra removida com sucesso.");
     } catch (error) {
       toast.error(
         error instanceof Error
           ? error.message
           : "Não foi possível remover a regra.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SLA, calendarios e escalonamento</h1>
          <p className="text-sm text-slate-400">
            Gerencie horas uteis, feriados e regras que escalam tickets com base no consumo de SLA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color="primary">Calendarios uteis</Badge>
          <Badge color="warning">Escalonamento automático</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Calendarios</p>
            <p className="text-2xl font-semibold text-white">{sortedCalendars.length}</p>
          </div>
        </Card>
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Feriados mapeados</p>
            <p className="text-2xl font-semibold text-white">{totalHolidays}</p>
          </div>
        </Card>
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Regras visiveis</p>
            <p className="text-2xl font-semibold text-white">{sortedRules.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Calendarios de SLA"
              subtitle="Cada calendario define dias uteis, faixa horaria e feriados usados no calculo de vencimento."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingCalendarId(null);
                    setCalendarForm({
                      ...DEFAULT_CALENDAR_FORM,
                      clientId: selectedClientId,
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Novo calendario
                </Button>
              }
            />

            <div className="mb-4 grid gap-4 md:grid-cols-2">
              <Select
                label="Filtrar por client"
                options={clientOptions}
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
              />
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <p className="font-medium text-white">Quando usar</p>
                <p className="mt-1 text-slate-400">
                  Use um calendario global como padrao e crie calendarios por client quando houver horario comercial ou feriados proprios.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {sortedCalendars.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum calendario encontrado para o filtro atual.</p>
              )}

              {sortedCalendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className={`rounded-xl border px-4 py-3 ${
                    editingCalendarId === calendar.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{calendar.name}</p>
                        <Badge color={calendar.clientId ? "accent" : "primary"}>
                          {calendar.clientId
                            ? clientsById.get(calendar.clientId)?.name ?? "Client vinculado"
                            : "Global"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span>Timezone: {calendar.timezone}</span>
                        <span>
                          Jornada: {calendar.workDayStartHour}:00 - {calendar.workDayEndHour}:00
                        </span>
                        <span>Dias: {formatWorkDays(calendar.workDaysJson)}</span>
                        <span>Feriados: {calendar.holidayCount}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingCalendarId(calendar.id)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDeleteCalendar(calendar.id, calendar.name)}
                        loading={deleteCalendar.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={editingCalendarId ? "Editar calendario" : "Novo calendario"}
              subtitle="Defina fuso, dias uteis e a jornada base usada no calculo do SLA."
            />

            {editingCalendarId && calendarDetailQuery.isLoading ? (
              <Loading />
            ) : editingCalendarId && calendarDetailQuery.isError ? (
              <ErrorDisplay onRetry={() => calendarDetailQuery.refetch()} />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Nome"
                    value={calendarForm.name}
                    onChange={(event) =>
                      setCalendarForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Horario comercial Brasil"
                  />
                  <Select
                    label="Client"
                    options={clientOptions}
                    value={calendarForm.clientId}
                    disabled={!!editingCalendarId}
                    onChange={(event) =>
                      setCalendarForm((current) => ({
                        ...current,
                        clientId: event.target.value,
                      }))
                    }
                  />
                  <Select
                    label="Timezone"
                    options={TIMEZONE_OPTIONS}
                    value={TIMEZONE_OPTIONS.some(opt => opt.value === calendarForm.timezone) ? calendarForm.timezone : "UTC"}
                    onChange={(event) =>
                      setCalendarForm((current) => ({
                        ...current,
                        timezone: event.target.value,
                      }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Inicio"
                      type="number"
                      min="0"
                      max="23"
                      value={calendarForm.workDayStartHour}
                      onChange={(event) =>
                        setCalendarForm((current) => ({
                          ...current,
                          workDayStartHour: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Fim"
                      type="number"
                      min="1"
                      max="24"
                      value={calendarForm.workDayEndHour}
                      onChange={(event) =>
                        setCalendarForm((current) => ({
                          ...current,
                          workDayEndHour: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-slate-300">Dias uteis</p>
                  <div className="flex flex-wrap gap-2">
                    {WORKDAY_OPTIONS.map((option) => {
                      const checked = calendarForm.workDays.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                            checked
                              ? "border-primary/40 bg-primary/10 text-white"
                              : "border-white/10 bg-white/5 text-slate-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={checked}
                            onChange={() =>
                              setCalendarForm((current) => ({
                                ...current,
                                workDays: toggleWorkDay(current.workDays, option.value),
                              }))
                            }
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {editingCalendarId && (
                  <p className="mt-3 text-xs text-slate-500">
                    O client do calendário não pode ser alterado pelo endpoint atual. Para mudar o escopo, crie um novo calendário.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={() => void handleSaveCalendar()}
                    loading={createCalendar.isPending || updateCalendar.isPending}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {editingCalendarId ? "Salvar calendario" : "Criar calendario"}
                  </Button>
                  {editingCalendarId && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingCalendarId(null);
                        setCalendarForm({
                          ...DEFAULT_CALENDAR_FORM,
                          clientId: selectedClientId,
                        });
                      }}
                    >
                      Cancelar edicao
                    </Button>
                  )}
                </div>

                {editingCalendarId && calendarDetailQuery.data && (
                  <div className="mt-6 border-t border-white/5 pt-6">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      <h3 className="text-sm font-semibold text-white">Feriados do calendario</h3>
                    </div>

                    <div className="mt-4 space-y-4">
                      {/* Tipo do feriado */}
                      <Select
                        label="Tipo do feriado"
                        options={HOLIDAY_TYPE_OPTIONS}
                        value={holidayType}
                        onChange={(event) => setHolidayType(event.target.value)}
                      />

                      {/* Campos para Fixed / Yearly */}
                      {(holidayType === "0" || holidayType === "1") && (
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                          <Input
                            label="Nome do feriado"
                            value={holidayName}
                            onChange={(event) => setHolidayName(event.target.value)}
                            placeholder="Natal"
                          />
                          <Input
                            label={holidayType === "1" ? "Dia/Mes (ignora ano)" : "Data"}
                            type="date"
                            value={holidayDate}
                            onChange={(event) => setHolidayDate(event.target.value)}
                          />
                        </div>
                      )}

                      {/* Campos para Relative */}
                      {holidayType === "2" && (
                        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                            Configuracao de feriado relativo
                          </p>
                          <Input
                            label="Nome do feriado"
                            value={holidayName}
                            onChange={(event) => setHolidayName(event.target.value)}
                            placeholder="Corpus Christi"
                          />
                          <Select
                            label="Metodo de calculo"
                            options={RELATIVE_METHOD_OPTIONS}
                            value={holidayRelativeMethod}
                            onChange={(event) => setHolidayRelativeMethod(event.target.value)}
                          />
                          <Select
                            label="Mes"
                            options={MONTH_OPTIONS}
                            value={holidayRelativeMonth}
                            onChange={(event) => setHolidayRelativeMonth(event.target.value)}
                          />
                          {holidayRelativeMethod === "0" && (
                            <Select
                              label="Dia da semana"
                              options={DAY_OF_WEEK_OPTIONS}
                              value={holidayRelativeDayOfWeek}
                              onChange={(event) => setHolidayRelativeDayOfWeek(event.target.value)}
                            />
                          )}
                          <Select
                            label={holidayRelativeMethod === "1" ? "Ocorrencia (dia util)" : "Ocorrencia"}
                            options={OCCURRENCE_OPTIONS}
                            value={holidayRelativeOccurrence}
                            onChange={(event) => setHolidayRelativeOccurrence(event.target.value)}
                          />
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button
                          onClick={() => void handleAddHoliday()}
                          loading={addHoliday.isPending}
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar feriado
                        </Button>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      {calendarDetailQuery.data.holidays.length === 0 && (
                        <p className="text-sm text-slate-500">Nenhum feriado cadastrado.</p>
                      )}

                      {[...calendarDetailQuery.data.holidays]
                        .sort(
                          (left, right) =>
                            new Date(left.date).getTime() - new Date(right.date).getTime(),
                        )
                        .map((holiday) => (
                          <div
                            key={holiday.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-white">{holiday.name}</p>
                              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400">
                                {holiday.holidayType === 2 ? (
                                  <span className="text-accent">Relativo: {getHolidayTypeLabel(holiday)}</span>
                                ) : holiday.holidayType === 1 ? (
                                  <span className="text-primary">Anual: {new Date(holiday.date).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</span>
                                ) : (
                                  <span>{new Date(holiday.date).toLocaleDateString("pt-BR")}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void handleDeleteHoliday(holiday.id, holiday.name)}
                              loading={deleteHoliday.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Regras de escalonamento"
               subtitle="Dispare reatribuição, notificação e aumento de prioridade conforme o SLA se aproxima do limite."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/settings/workflow-profiles")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Gerenciar perfis
                  </Button>
                  <Button variant="secondary" onClick={() => resetRuleForm()}>
                    <Plus className="h-4 w-4" />
                    Nova regra
                  </Button>
                </div>
              }
            />

            <Select
              label="Filtrar por workflow profile"
              options={workflowProfileFilterOptions}
              value={selectedWorkflowProfileId}
              onChange={(event) => {
                setSelectedWorkflowProfileId(event.target.value);
                resetRuleForm(event.target.value);
              }}
            />

            {workflowProfiles.length === 0 && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-slate-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-warning">Nenhum workflow profile cadastrado</p>
                  <p className="mt-1 text-slate-400">
                    Regras de escalonamento exigem um workflow profile existente. Clique em <strong>"Gerenciar perfis"</strong> acima ou acesse <strong>Suporte &rarr; Workflow Profiles</strong> para criar um perfil com SLA configurado.
                  </p>
                </div>
              </div>
            )}
            {!selectedWorkflowProfileId && workflowProfiles.length > 0 && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  Sem filtro, o backend retorna apenas regras ativas. Para editar regras inativas, selecione o workflow profile correspondente.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {sortedRules.length === 0 && (
                <p className="text-sm text-slate-500">Nenhuma regra encontrada para o filtro atual.</p>
              )}

              {sortedRules.map((rule) => {
                const workflowProfile = workflowProfilesById.get(rule.workflowProfileId);
                const user = rule.reassignToUserId
                  ? usersById.get(rule.reassignToUserId)
                  : null;
                const department = rule.reassignToDepartmentId
                  ? departmentsById.get(rule.reassignToDepartmentId)
                  : null;

                return (
                  <div key={rule.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">{rule.name}</p>
                          <Badge color={rule.isActive ? "success" : "slate"}>
                            {rule.isActive ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {workflowProfile
                            ? getWorkflowProfileLabel(
                                workflowProfile,
                                departmentsById,
                                clientsById,
                              )
                            : rule.workflowProfileId}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedWorkflowProfileId(rule.workflowProfileId);
                          setEditingRuleId(rule.id);
                          setRuleForm(toRuleFormState(rule));
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {rule.triggerAtSlaPercent > 0 && (
                        <Badge color="warning">Disparo em {rule.triggerAtSlaPercent}%</Badge>
                      )}
                      {rule.triggerAtHoursBefore > 0 && (
                        <Badge color="accent">{formatHoursBefore(rule.triggerAtHoursBefore)}</Badge>
                      )}
                      {rule.bumpPriority && <Badge color="danger">Aumenta prioridade</Badge>}
                      {rule.notifyAssignee && <Badge color="primary">Notifica responsável</Badge>}
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      <p>
                         Usuário destino: {user ? user.fullName || user.login || user.email : "Sem reatribuição"}
                       </p>
                       <p>
                         Departamento destino: {department?.name ?? "Sem reatribuição"}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDeleteRule(rule.id, rule.name)}
                        loading={deleteRule.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={editingRuleId ? "Editar regra" : "Nova regra"}
              subtitle="As regras sao vinculadas a um workflow profile existente."
            />

            {workflowProfiles.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-warning">Workflow profiles necessarios</p>
                  <p className="mt-1 text-slate-400">
                    Regras de escalonamento sao vinculadas a um <strong>workflow profile</strong>. Nenhum perfil foi encontrado no sistema.
                  </p>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate("/settings/workflow-profiles")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ir para Workflow Profiles
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4">
                  <Select
                    label="Workflow profile"
                    options={workflowProfileOptions}
                    value={ruleForm.workflowProfileId}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        workflowProfileId: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Nome da regra"
                    value={ruleForm.name}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Escalar proximo do vencimento"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Trigger em % SLA"
                      type="number"
                      min="0"
                      max="100"
                      value={ruleForm.triggerAtSlaPercent}
                      onChange={(event) =>
                        setRuleForm((current) => ({
                          ...current,
                          triggerAtSlaPercent: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Horas antes do vencimento"
                      type="number"
                      min="0"
                      value={ruleForm.triggerAtHoursBefore}
                      onChange={(event) =>
                        setRuleForm((current) => ({
                          ...current,
                          triggerAtHoursBefore: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <Select
                    label="Reatribuir para usuario"
                    options={userOptions}
                    value={ruleForm.reassignToUserId}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        reassignToUserId: event.target.value,
                      }))
                    }
                  />
                  <Select
                    label="Reatribuir para departamento"
                    options={departmentOptions}
                    value={ruleForm.reassignToDepartmentId}
                    onChange={(event) =>
                      setRuleForm((current) => ({
                        ...current,
                        reassignToDepartmentId: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={ruleForm.bumpPriority}
                      onChange={(event) =>
                        setRuleForm((current) => ({
                          ...current,
                          bumpPriority: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    <span>Aumentar prioridade do ticket quando a regra disparar</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={ruleForm.notifyAssignee}
                      onChange={(event) =>
                        setRuleForm((current) => ({
                          ...current,
                          notifyAssignee: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    <span>Notificar o responsavel atual quando a regra disparar</span>
                  </label>
                  {editingRuleId && (
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={ruleForm.isActive}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            isActive: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                      <span>Regra ativa</span>
                    </label>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={() => void handleSaveRule()}
                    loading={createRule.isPending || updateRule.isPending}
                  >
                    <BellRing className="h-4 w-4" />
                    {editingRuleId ? "Salvar regra" : "Criar regra"}
                  </Button>
                  {(editingRuleId || ruleForm.workflowProfileId) && (
                    <Button variant="ghost" onClick={() => resetRuleForm()}>
                      <TimerReset className="h-4 w-4" />
                      Limpar formulario
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Ajuda rapida" subtitle="Entenda o fluxo completo de SLA e escalonamento." />
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-white">1. Calendário de SLA</p>
                   <p className="mt-1 text-slate-400">
                     Define o fuso horário, dias úteis, horário comercial e feriados. Use um calendário global como padrão e específicos por cliente quando necessário.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                    <p className="font-medium text-white">2. Workflow Profile</p>
                   <p className="mt-1 text-slate-400">
                     Perfil vinculado a um departamento que define o SLA em horas, prioridade padrão e o calendário usado. Crie em <strong>Suporte &rarr; Workflow Profiles</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-white">3. Regra de Escalonamento</p>
                  <p className="mt-1 text-slate-400">
                    Dispara automaticamente quando o SLA atingir um percentual ou estiver próximo do vencimento. Pode reatribuir, notificar ou aumentar a prioridade do ticket.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <p>
                   A listagem global de regras retorna apenas regras ativas. Para editar regras inativas, filtre pelo workflow profile específico.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
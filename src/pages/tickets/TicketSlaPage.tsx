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
  Modal,
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
  { value: "2", label: "Relativo (cálculo por regra - ex: 3ª seg de jan)" },
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
  if (hours <= 0) return "Sem gatilho por antecedência";
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
  const [holidayCalendarId, setHolidayCalendarId] = useState<string | null>(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [calendarSearchTerm, setCalendarSearchTerm] = useState("");
  const [ruleSearchTerm, setRuleSearchTerm] = useState("");
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
  const calendarDetailQuery = useSlaCalendar(
    editingCalendarId,
    isCalendarModalOpen && !!editingCalendarId,
  );
  const holidayDetailQuery = useSlaCalendar(
    holidayCalendarId,
    isHolidayModalOpen && !!holidayCalendarId,
  );
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

  const filteredCalendars = useMemo(() => {
    const term = calendarSearchTerm.trim().toLocaleLowerCase("pt-BR");
    if (!term) return sortedCalendars;

    return sortedCalendars.filter((calendar) => {
      const clientName = calendar.clientId
        ? clientsById.get(calendar.clientId)?.name ?? ""
        : "global";

      return [
        calendar.name,
        calendar.timezone,
        clientName,
        formatWorkDays(calendar.workDaysJson),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [calendarSearchTerm, clientsById, sortedCalendars]);

  const filteredRules = useMemo(() => {
    const term = ruleSearchTerm.trim().toLocaleLowerCase("pt-BR");
    if (!term) return sortedRules;

    return sortedRules.filter((rule) => {
      const workflowProfile = workflowProfilesById.get(rule.workflowProfileId);
      const workflowLabel = workflowProfile
        ? getWorkflowProfileLabel(workflowProfile, departmentsById, clientsById)
        : rule.workflowProfileId;

      return [rule.name, workflowLabel]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [
    clientsById,
    departmentsById,
    ruleSearchTerm,
    sortedRules,
    workflowProfilesById,
  ]);

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

  function openCreateCalendarModal() {
    setEditingCalendarId(null);
    setCalendarForm({
      ...DEFAULT_CALENDAR_FORM,
      clientId: selectedClientId,
    });
    setIsCalendarModalOpen(true);
  }

  function openEditCalendarModal(calendarId: string) {
    setEditingCalendarId(calendarId);
    setIsCalendarModalOpen(true);
  }

  function closeCalendarModal() {
    setIsCalendarModalOpen(false);
    setEditingCalendarId(null);
    setCalendarForm({
      ...DEFAULT_CALENDAR_FORM,
      clientId: selectedClientId,
    });
  }

  function openHolidayModal(calendarId: string) {
    setHolidayCalendarId(calendarId);
    resetHolidayForm();
    setIsHolidayModalOpen(true);
  }

  function closeHolidayModal() {
    setIsHolidayModalOpen(false);
    setHolidayCalendarId(null);
    resetHolidayForm();
  }

  function openCreateRuleModal() {
    resetRuleForm();
    setIsRuleModalOpen(true);
  }

  function closeRuleModal() {
    setIsRuleModalOpen(false);
    resetRuleForm();
  }

  async function handleSaveCalendar() {
    const startHour = Number(calendarForm.workDayStartHour);
    const endHour = Number(calendarForm.workDayEndHour);

    if (!calendarForm.name.trim()) {
      toast.error("Informe o nome do calendário.");
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
        toast.success("Calendário atualizado com sucesso.");
      } else {
        await createCalendar.mutateAsync({
          name: calendarForm.name.trim(),
          clientId: calendarForm.clientId || null,
          timezone: calendarForm.timezone.trim() || "UTC",
          workDayStartHour: startHour,
          workDayEndHour: endHour,
          workDaysJson: buildWorkDaysJson(calendarForm.workDays),
        });
        toast.success("Calendário criado com sucesso.");
      }

      closeCalendarModal();
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
        closeCalendarModal();
      }
      if (holidayCalendarId === id) {
        closeHolidayModal();
      }
      toast.success("Calendário removido com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o calendário.",
      );
    }
  }

  async function handleAddHoliday() {
    if (!holidayCalendarId) {
      toast.error("Selecione um calendário para gerenciar os feriados.");
      return;
    }

    if (!holidayName.trim()) {
      toast.error("Informe o nome do feriado.");
      return;
    }

    const typeNum = Number(holidayType);

    // Validação específica por tipo
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
        id: holidayCalendarId,
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
    if (!holidayCalendarId) return;
    if (!window.confirm(`Remover o feriado \"${name}\"?`)) {
      return;
    }

    try {
      await deleteHoliday.mutateAsync({ id: holidayCalendarId, holidayId });
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
        toast.success("Regra de escalonamento criada.");
      }

      setSelectedWorkflowProfileId(ruleForm.workflowProfileId);
      setIsRuleModalOpen(false);
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
        setIsRuleModalOpen(false);
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

  const holidayCalendarSummary = holidayCalendarId
    ? sortedCalendars.find((item) => item.id === holidayCalendarId) ?? null
    : null;
  const holidayCalendarDetail = holidayDetailQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SLA, calendários e escalonamento</h1>
          <p className="text-sm text-slate-400">
            Visualize rapidamente calendários e regras, e abra os detalhes somente quando precisar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setIsHelpModalOpen(true)}>
            <Clock3 className="h-4 w-4" />
            Guia rápido
          </Button>
          <Badge color="primary">Calendários úteis</Badge>
          <Badge color="warning">Escalonamento automático</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Calendários</p>
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
            <p className="text-xs uppercase tracking-wide text-slate-500">Regras visíveis</p>
            <p className="text-2xl font-semibold text-white">{sortedRules.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Calendários de SLA"
            subtitle="Liste e filtre calendários. Edição detalhada e feriados ficam em modal."
            action={
              <Button variant="secondary" onClick={openCreateCalendarModal}>
                <Plus className="h-4 w-4" />
                Novo calendário
              </Button>
            }
          />

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Select
              label="Filtrar por cliente"
              options={clientOptions}
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
            />
            <Input
              label="Buscar calendário"
              value={calendarSearchTerm}
              onChange={(event) => setCalendarSearchTerm(event.target.value)}
              placeholder="Nome, timezone ou cliente"
            />
          </div>

          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <p className="font-medium text-white">Uso recomendado</p>
            <p className="mt-1 text-slate-400">
              Mantenha um calendário global e crie exceções por cliente apenas quando houver jornada ou feriados diferentes.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Mostrando {filteredCalendars.length} de {sortedCalendars.length} calendários.
            </p>

            {sortedCalendars.length === 0 && (
              <p className="text-sm text-slate-500">Nenhum calendário encontrado para o filtro atual.</p>
            )}

            {sortedCalendars.length > 0 && filteredCalendars.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
                <p>Nenhum calendário encontrado para a busca atual.</p>
                <div className="mt-2">
                  <Button size="sm" variant="ghost" onClick={() => setCalendarSearchTerm("")}>
                    Limpar busca
                  </Button>
                </div>
              </div>
            )}

            {filteredCalendars.map((calendar) => (
              <div
                key={calendar.id}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">{calendar.name}</p>
                      <Badge color={calendar.clientId ? "accent" : "primary"}>
                        {calendar.clientId
                          ? clientsById.get(calendar.clientId)?.name ?? "Cliente vinculado"
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
                      onClick={() => openEditCalendarModal(calendar.id)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openHolidayModal(calendar.id)}
                    >
                      <CalendarDays className="h-4 w-4" />
                      Feriados
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Regras de escalonamento"
            subtitle="Liste regras e abra o formulário apenas quando for criar ou editar."
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate("/settings/workflow-profiles")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Gerenciar perfis
                </Button>
                <Button variant="secondary" onClick={openCreateRuleModal}>
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

          <div className="mt-4">
            <Input
              label="Buscar regra"
              value={ruleSearchTerm}
              onChange={(event) => setRuleSearchTerm(event.target.value)}
              placeholder="Nome da regra ou workflow profile"
            />
          </div>

          {workflowProfiles.length === 0 && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-slate-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-warning">Nenhum workflow profile cadastrado</p>
                <p className="mt-1 text-slate-400">
                  Regras de escalonamento exigem um workflow profile existente. Clique em
                  Gerenciar perfis para criar um perfil com SLA configurado.
                </p>
              </div>
            </div>
          )}
          {!selectedWorkflowProfileId && workflowProfiles.length > 0 && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>
                Sem filtro, o backend retorna apenas regras ativas. Para editar regras inativas,
                selecione o workflow profile correspondente.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-500">
              Mostrando {filteredRules.length} de {sortedRules.length} regras.
            </p>

            {sortedRules.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma regra encontrada para o filtro atual.</p>
            )}

            {sortedRules.length > 0 && filteredRules.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
                <p>Nenhuma regra encontrada para a busca atual.</p>
                <div className="mt-2">
                  <Button size="sm" variant="ghost" onClick={() => setRuleSearchTerm("")}>
                    Limpar busca
                  </Button>
                </div>
              </div>
            )}

            {filteredRules.map((rule) => {
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedWorkflowProfileId(rule.workflowProfileId);
                          setEditingRuleId(rule.id);
                          setRuleForm(toRuleFormState(rule));
                          setIsRuleModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    </div>
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
                    <p>Departamento destino: {department?.name ?? "Sem reatribuição"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Modal
        open={isCalendarModalOpen}
        onClose={closeCalendarModal}
        title={editingCalendarId ? "Editar calendário" : "Novo calendário"}
        maxWidth="max-w-3xl"
      >
        {editingCalendarId && calendarDetailQuery.isLoading ? (
          <Loading />
        ) : editingCalendarId && calendarDetailQuery.isError ? (
          <ErrorDisplay onRetry={() => calendarDetailQuery.refetch()} />
        ) : (
          <div className="space-y-6">
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
                placeholder="Horário comercial Brasil"
              />
              <Select
                label="Cliente"
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
                value={
                  TIMEZONE_OPTIONS.some((option) => option.value === calendarForm.timezone)
                    ? calendarForm.timezone
                    : "UTC"
                }
                onChange={(event) =>
                  setCalendarForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Início"
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

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">Dias úteis</p>
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
              <p className="text-xs text-slate-500">
                O cliente do calendário não pode ser alterado pelo endpoint atual. Para mudar o
                escopo, crie um novo calendário.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void handleSaveCalendar()}
                loading={createCalendar.isPending || updateCalendar.isPending}
              >
                <CalendarDays className="h-4 w-4" />
                {editingCalendarId ? "Salvar calendário" : "Criar calendário"}
              </Button>
              {editingCalendarId && (
                <Button
                  variant="secondary"
                  onClick={() => openHolidayModal(editingCalendarId)}
                >
                  <CalendarDays className="h-4 w-4" />
                  Gerenciar feriados
                </Button>
              )}
              {editingCalendarId && (
                <Button
                  variant="danger"
                  onClick={() =>
                    void handleDeleteCalendar(
                      editingCalendarId,
                      calendarForm.name.trim() || "calendário sem nome",
                    )
                  }
                  loading={deleteCalendar.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir calendário
                </Button>
              )}
              <Button variant="ghost" onClick={closeCalendarModal}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={isHolidayModalOpen}
        onClose={closeHolidayModal}
        title={
          holidayCalendarSummary
            ? `Feriados - ${holidayCalendarSummary.name}`
            : "Gerenciar feriados"
        }
        maxWidth="max-w-3xl"
      >
        {holidayCalendarId && holidayDetailQuery.isLoading ? (
          <Loading />
        ) : holidayCalendarId && holidayDetailQuery.isError ? (
          <ErrorDisplay onRetry={() => holidayDetailQuery.refetch()} />
        ) : !holidayCalendarId || !holidayCalendarDetail ? (
          <p className="text-sm text-slate-400">Selecione um calendário para gerenciar os feriados.</p>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">
              Adicione e revise feriados sem poluir a tela principal de configuração.
            </p>

            <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <Select
                label="Tipo do feriado"
                options={HOLIDAY_TYPE_OPTIONS}
                value={holidayType}
                onChange={(event) => setHolidayType(event.target.value)}
              />

              {(holidayType === "0" || holidayType === "1") && (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    label="Nome do feriado"
                    value={holidayName}
                    onChange={(event) => setHolidayName(event.target.value)}
                    placeholder="Natal"
                  />
                  <Input
                    label={holidayType === "1" ? "Dia/Mês (ignora ano)" : "Data"}
                    type="date"
                    value={holidayDate}
                    onChange={(event) => setHolidayDate(event.target.value)}
                  />
                </div>
              )}

              {holidayType === "2" && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/30 p-4">
                  <Input
                    label="Nome do feriado"
                    value={holidayName}
                    onChange={(event) => setHolidayName(event.target.value)}
                    placeholder="Corpus Christi"
                  />
                  <Select
                    label="Método de cálculo"
                    options={RELATIVE_METHOD_OPTIONS}
                    value={holidayRelativeMethod}
                    onChange={(event) => setHolidayRelativeMethod(event.target.value)}
                  />
                  <Select
                    label="Mês"
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
                    label={
                      holidayRelativeMethod === "1"
                        ? "Ocorrência (dia útil)"
                        : "Ocorrência"
                    }
                    options={OCCURRENCE_OPTIONS}
                    value={holidayRelativeOccurrence}
                    onChange={(event) => setHolidayRelativeOccurrence(event.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => void handleAddHoliday()} loading={addHoliday.isPending}>
                  <Plus className="h-4 w-4" />
                  Adicionar feriado
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {holidayCalendarDetail.holidays.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum feriado cadastrado.</p>
              )}

              {[...holidayCalendarDetail.holidays]
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
                          <span className="text-primary">
                            Anual:{" "}
                            {new Date(holiday.date).toLocaleDateString("pt-BR", {
                              day: "numeric",
                              month: "long",
                            })}
                          </span>
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
      </Modal>

      <Modal
        open={isRuleModalOpen}
        onClose={closeRuleModal}
        title={editingRuleId ? "Editar regra de escalonamento" : "Nova regra de escalonamento"}
        maxWidth="max-w-2xl"
      >
        {workflowProfiles.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-warning">Workflow profiles necessários</p>
              <p className="mt-1 text-slate-400">
                Regras de escalonamento são vinculadas a um workflow profile. Nenhum perfil foi
                encontrado no sistema.
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
          <div className="space-y-6">
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
                placeholder="Escalar próximo do vencimento"
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
                label="Reatribuir para usuário"
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

            <div className="space-y-3">
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
                <span>Notificar o responsável atual quando a regra disparar</span>
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

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void handleSaveRule()}
                loading={createRule.isPending || updateRule.isPending}
              >
                <BellRing className="h-4 w-4" />
                {editingRuleId ? "Salvar regra" : "Criar regra"}
              </Button>
              {editingRuleId && (
                <Button
                  variant="danger"
                  onClick={() =>
                    void handleDeleteRule(
                      editingRuleId,
                      ruleForm.name.trim() || "regra sem nome",
                    )
                  }
                  loading={deleteRule.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir regra
                </Button>
              )}
              {(editingRuleId || ruleForm.workflowProfileId) && (
                <Button variant="ghost" onClick={() => resetRuleForm()}>
                  <TimerReset className="h-4 w-4" />
                  Limpar formulário
                </Button>
              )}
              <Button variant="ghost" onClick={closeRuleModal}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="Guia rápido de SLA"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-white">1. Calendário de SLA</p>
              <p className="mt-1 text-slate-400">
                Define fuso horário, dias úteis, horário comercial e feriados. Use calendário
                global como padrão e específicos por cliente quando necessário.
              </p>
              <p className="mt-1 text-slate-500">
                Com calendário, o SLA conta apenas em horário comercial. Sem calendário, o SLA
                corre 24x7.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-white">2. Workflow Profile</p>
              <p className="mt-1 text-slate-400">
                Perfil de workflow define SLA em horas, prioridade padrão e calendário usado.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-white">3. Regra de escalonamento</p>
              <p className="mt-1 text-slate-400">
                Dispara ao atingir percentual do SLA ou proximidade do vencimento, podendo
                reatribuir, notificar e aumentar prioridade.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-xs text-slate-400">
            Dica: sem filtro de workflow profile, o backend retorna apenas regras ativas.
          </div>
        </div>
      </Modal>
    </div>
  );
}
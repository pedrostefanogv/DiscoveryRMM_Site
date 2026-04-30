import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportSchedulesApi } from "@/api";
import type {
  ReportSchedule,
  CreateReportScheduleRequest,
  UpdateReportScheduleRequest,
} from "@/api";

export function useReportSchedules() {
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery({
    queryKey: ["report-schedules"],
    queryFn: () => reportSchedulesApi.list(),
  });

  const getSchedule = (id: string) =>
    useQuery({
      queryKey: ["report-schedules", id],
      queryFn: () => reportSchedulesApi.get(id),
      enabled: !!id,
    });

  const createSchedule = useMutation({
    mutationFn: (data: CreateReportScheduleRequest) =>
      reportSchedulesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });

  const updateSchedule = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateReportScheduleRequest;
    }) => reportSchedulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => reportSchedulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });

  return {
    schedules: schedulesQuery.data ?? [],
    isLoading: schedulesQuery.isLoading,
    error: schedulesQuery.error,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
}

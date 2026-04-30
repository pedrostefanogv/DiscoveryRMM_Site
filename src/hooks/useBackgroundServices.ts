import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backgroundServicesApi, jobsApi } from "@/api";

const KEYS = {
  all: ["background-services"] as const,
  list: () => [...KEYS.all, "list"] as const,
  detail: (name: string) => [...KEYS.all, "detail", name] as const,
};

export function useBackgroundServices() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => backgroundServicesApi.list(),
  });
}

export function useBackgroundService(name: string) {
  return useQuery({
    queryKey: KEYS.detail(name),
    queryFn: () => backgroundServicesApi.get(name),
    enabled: !!name,
  });
}

export function useTriggerJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobGroup,
      jobName,
    }: {
      jobGroup: string;
      jobName: string;
    }) => jobsApi.trigger(jobGroup, jobName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function usePauseJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobGroup,
      jobName,
    }: {
      jobGroup: string;
      jobName: string;
    }) => jobsApi.pause(jobGroup, jobName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useResumeJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobGroup,
      jobName,
    }: {
      jobGroup: string;
      jobName: string;
    }) => jobsApi.resume(jobGroup, jobName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

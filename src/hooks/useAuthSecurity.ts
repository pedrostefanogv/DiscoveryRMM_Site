import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type MfaKey, type RenameMfaKeyRequest } from "@/api";

const AUTH_SECURITY_KEYS = {
  all: ["auth-security"] as const,
  mfaKeys: ["auth-security", "mfa-keys"] as const,
};

export function useMfaKeys(enabled = true) {
  return useQuery({
    queryKey: AUTH_SECURITY_KEYS.mfaKeys,
    queryFn: () => authApi.listMfaKeys(),
    enabled,
  });
}

export function useRenameMfaKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      keyId,
      data,
    }: {
      keyId: string;
      data: RenameMfaKeyRequest;
    }) => authApi.renameMfaKey(keyId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AUTH_SECURITY_KEYS.mfaKeys }),
  });
}

export function useDeleteMfaKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => authApi.deleteMfaKey(keyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: AUTH_SECURITY_KEYS.mfaKeys }),
  });
}

export function useInvalidateMfaKeys() {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({
      queryKey: AUTH_SECURITY_KEYS.mfaKeys,
    });
  };
}

export type { MfaKey };

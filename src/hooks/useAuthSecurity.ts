import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authApi,
  type CursorPageDto,
  type MfaKey,
  type RenameMfaKeyRequest,
} from "@/api";

const AUTH_SECURITY_KEYS = {
  all: ["auth-security"] as const,
  mfaKeys: ["auth-security", "mfa-keys"] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useMfaKeys(enabled = true) {
  return useQuery({
    queryKey: AUTH_SECURITY_KEYS.mfaKeys,
    queryFn: () => authApi.listMfaKeys(),
    enabled,
    select: (data) => normalizeArray(data as CursorPageDto<MfaKey> | MfaKey[]),
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

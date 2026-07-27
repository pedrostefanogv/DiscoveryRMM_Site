import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  iamApi,
  type AddGroupMemberRequest,
  type AddRolePermissionRequest,
  type AssignGroupRoleRequest,
  type ChangeMyPasswordRequest,
  type ChangePasswordRequest,
  type CreateRoleRequest,
  type CreateUserGroupRequest,
  type CreateUserRequest,
  type CreateUserWithGroupsRequest,
  type CursorPageDto,
  type UpdateMyProfileRequest,
  type UpdateRoleRequest,
  type UpdateUserGroupRequest,
  type UpdateUserRequest,
  type UserDto,
} from "@/api";

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as CursorPageDto<T>).items)
  ) {
    return (data as CursorPageDto<T>).items;
  }
  return [];
}

const IAM_KEYS = {
  users: ["iam", "users"] as const,
  groups: ["iam", "groups"] as const,
  roles: ["iam", "roles"] as const,
  permissionsCatalog: ["iam", "permissions", "catalog"] as const,
  myProfile: ["iam", "me", "profile"] as const,
  mySecurity: ["iam", "me", "security"] as const,
  userMfaKeys: (userId: string) =>
    ["iam", "users", userId, "mfa", "keys"] as const,
  groupMembers: (groupId: string) =>
    ["iam", "groups", groupId, "members"] as const,
  groupRoles: (groupId: string) => ["iam", "groups", groupId, "roles"] as const,
  rolePermissions: (roleId: string) =>
    ["iam", "roles", roleId, "permissions"] as const,
    [
      "iam",
      "diagnostics",
      "health",
      siteId,
      agentId ?? "none",
    ] as const,
    "iam",
    "group-policy",
    "reconcile",
  ] as const,
};

export function useIamUsers() {
  return useQuery({
    queryKey: IAM_KEYS.users,
    queryFn: () => iamApi.listUsers(),
    select: (data) =>
      normalizeArray(data as CursorPageDto<UserDto> | UserDto[]),
  });
}

export function useCreateIamUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserRequest) => iamApi.createUser(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users }),
  });
}

export function useCreateIamUserWithGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserWithGroupsRequest) =>
      iamApi.createUserWithGroups(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users });
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groups });
    },
  });
}

export function useUpdateIamUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserRequest }) =>
      iamApi.updateUser(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users }),
  });
}

export function useDeleteIamUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.deleteUser(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users }),
  });
}

export function useMyProfile() {
  return useQuery({
    queryKey: IAM_KEYS.myProfile,
    queryFn: () => iamApi.getMyProfile(),
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMyProfileRequest) =>
      iamApi.updateMyProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.myProfile });
    },
  });
}

export function useMySecurity() {
  return useQuery({
    queryKey: IAM_KEYS.mySecurity,
    queryFn: () => iamApi.getMySecurity(),
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (payload: ChangeMyPasswordRequest) =>
      iamApi.changeMyPassword(payload),
  });
}

export function useChangeIamUserPassword() {
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: ChangePasswordRequest;
    }) => iamApi.changePassword(id, payload),
  });
}

export function useIamUserMfaKeys(userId: string | null) {
  return useQuery({
    queryKey: userId
      ? IAM_KEYS.userMfaKeys(userId)
      : ["iam", "users", "mfa", "keys", "disabled"],
    queryFn: () => iamApi.listUserMfaKeys(userId as string),
    enabled: !!userId,
  });
}

export function useRevokeIamUserMfaAll(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => iamApi.revokeUserMfa(userId as string),
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.userMfaKeys(userId) });
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users });
    },
  });
}

export function useRevokeIamUserMfaKey(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      iamApi.revokeUserMfaKey(userId as string, keyId),
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.userMfaKeys(userId) });
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users });
    },
  });
}

export function useForceIamUserPasswordReset(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => iamApi.forceUserPasswordReset(userId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.users });
    },
  });
}

export function useIamGroups() {
  return useQuery({
    queryKey: IAM_KEYS.groups,
    queryFn: () => iamApi.listGroups(),
  });
}

export function useCreateIamGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserGroupRequest) =>
      iamApi.createGroup(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groups }),
  });
}

export function useUpdateIamGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateUserGroupRequest;
    }) => iamApi.updateGroup(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groups }),
  });
}

export function useDeleteIamGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.deleteGroup(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groups }),
  });
}

export function useIamGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: groupId
      ? IAM_KEYS.groupMembers(groupId)
      : ["iam", "groups", "members", "disabled"],
    queryFn: () => iamApi.listGroupMembers(groupId as string),
    enabled: !!groupId,
  });
}

export function useAddIamGroupMember(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddGroupMemberRequest) =>
      iamApi.addGroupMember(groupId as string, payload),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.groupMembers(groupId),
      });
    },
  });
}

export function useRemoveIamGroupMember(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      iamApi.removeGroupMember(groupId as string, userId),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.groupMembers(groupId),
      });
    },
  });
}

export function useIamGroupRoles(groupId: string | null) {
  return useQuery({
    queryKey: groupId
      ? IAM_KEYS.groupRoles(groupId)
      : ["iam", "groups", "roles", "disabled"],
    queryFn: () => iamApi.listGroupRoles(groupId as string),
    enabled: !!groupId,
  });
}

export function useAssignIamGroupRole(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignGroupRoleRequest) =>
      iamApi.assignGroupRole(groupId as string, payload),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groupRoles(groupId) });
    },
  });
}

export function useRemoveIamGroupRole(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      iamApi.removeGroupRole(groupId as string, assignmentId),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.groupRoles(groupId) });
    },
  });
}

export function useIamRoles() {
  return useQuery({
    queryKey: IAM_KEYS.roles,
    queryFn: () => iamApi.listRoles(),
  });
}

export function useCreateIamRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoleRequest) => iamApi.createRole(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.roles }),
  });
}

export function useUpdateIamRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRoleRequest }) =>
      iamApi.updateRole(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.roles }),
  });
}

export function useDeleteIamRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.deleteRole(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.roles }),
  });
}

export function useIamPermissionsCatalog() {
  return useQuery({
    queryKey: IAM_KEYS.permissionsCatalog,
    queryFn: () => iamApi.listPermissionsCatalog(),
  });
}

export function useIamRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: roleId
      ? IAM_KEYS.rolePermissions(roleId)
      : ["iam", "roles", "permissions", "disabled"],
    queryFn: () => iamApi.listRolePermissions(roleId as string),
    enabled: !!roleId,
  });
}

export function useAddIamRolePermission(roleId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddRolePermissionRequest) =>
      iamApi.addRolePermission(roleId as string, payload),
    onSuccess: () => {
      if (!roleId) return;
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.rolePermissions(roleId),
      });
    },
  });
}

export function useRemoveIamRolePermission(roleId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionId: string) =>
      iamApi.removeRolePermission(roleId as string, permissionId),
    onSuccess: () => {
      if (!roleId) return;
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.rolePermissions(roleId),
      });
    },
  });
}

  return useMutation({
  });
}

  return useMutation({
    mutationFn: (
  });
}

  siteId: string | null,
  agentId?: string | null,
) {
  return useQuery({
    queryKey: siteId
    queryFn: () =>
    enabled: !!siteId,
  });
}

  return useMutation({
  });
}

  return useMutation({
    mutationFn: (
  });
}

  return useQuery({
    queryKey: siteId
    enabled: !!siteId,
  });
}

  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: (_, variables) => {
      if (variables.siteId) {
        queryClient.invalidateQueries({
        });
      }
      queryClient.invalidateQueries({
      });
    },
  });
}

  return useQuery({
  });
}

  return useQuery({
  });
}

  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: () => {
    },
  });
}

  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
    onSuccess: () => {
    },
  });
}

  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
      });
    },
  });
}

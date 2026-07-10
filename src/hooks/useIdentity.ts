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
  type MeshCentralBackfillRequest,
  type MeshGroupPolicyReconcileRequest,
  type UpdateMyProfileRequest,
  type UpdateRoleRequest,
  type UpdateUserGroupRequest,
  type UpdateUserRequest,
  type UserDto,
  type CreateMeshCentralRightsProfileRequest,
  type MeshCentralNodeLinksBackfillRequest,
  type UpdateMeshCentralRightsProfileRequest,
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
  meshBackfill: ["iam", "mesh", "backfill"] as const,
  meshDiagnosticsHealth: (siteId: string, agentId?: string | null) =>
    [
      "iam",
      "mesh",
      "diagnostics",
      "health",
      siteId,
      agentId ?? "none",
    ] as const,
  meshNodeLinksBackfill: ["iam", "mesh", "node-links", "backfill"] as const,
  meshGroupPolicyStatus: (siteId: string) =>
    ["iam", "mesh", "group-policy", "status", siteId] as const,
  meshGroupPolicyReconcile: [
    "iam",
    "mesh",
    "group-policy",
    "reconcile",
  ] as const,
  meshRightsProfiles: ["iam", "mesh", "rights-profiles"] as const,
  meshRightsProfileUsage: ["iam", "mesh", "rights-profiles", "usage"] as const,
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

export function useRunMeshCentralBackfill() {
  return useMutation({
    mutationFn: (payload: MeshCentralBackfillRequest) =>
      iamApi.runMeshCentralBackfill(payload),
  });
}

export function useRunMeshCentralBackfillDryRun() {
  return useMutation({
    mutationFn: (
      payload: Omit<MeshCentralBackfillRequest, "applyChanges"> = {},
    ) => iamApi.runMeshCentralBackfillDryRun(payload),
  });
}

export function useMeshCentralDiagnosticsHealth(
  siteId: string | null,
  agentId?: string | null,
) {
  return useQuery({
    queryKey: siteId
      ? IAM_KEYS.meshDiagnosticsHealth(siteId, agentId)
      : ["iam", "mesh", "diagnostics", "health", "disabled"],
    queryFn: () =>
      iamApi.getMeshCentralDiagnosticsHealth(siteId as string, agentId),
    enabled: !!siteId,
  });
}

export function useRunMeshCentralNodeLinksBackfill() {
  return useMutation({
    mutationFn: (payload: MeshCentralNodeLinksBackfillRequest) =>
      iamApi.runMeshCentralNodeLinksBackfill(payload),
  });
}

export function useRunMeshCentralNodeLinksBackfillDryRun() {
  return useMutation({
    mutationFn: (
      payload: Omit<MeshCentralNodeLinksBackfillRequest, "applyChanges"> = {},
    ) => iamApi.runMeshCentralNodeLinksBackfillDryRun(payload),
  });
}

export function useMeshGroupPolicyStatus(siteId: string | null) {
  return useQuery({
    queryKey: siteId
      ? IAM_KEYS.meshGroupPolicyStatus(siteId)
      : ["iam", "mesh", "group-policy", "status", "disabled"],
    queryFn: () => iamApi.getMeshGroupPolicyStatus(siteId as string),
    enabled: !!siteId,
  });
}

export function useMeshGroupPolicyReconcile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MeshGroupPolicyReconcileRequest) =>
      iamApi.reconcileMeshGroupPolicy(payload),
    onSuccess: (_, variables) => {
      if (variables.siteId) {
        queryClient.invalidateQueries({
          queryKey: IAM_KEYS.meshGroupPolicyStatus(variables.siteId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.meshGroupPolicyReconcile,
      });
    },
  });
}

export function useMeshRightsProfiles() {
  return useQuery({
    queryKey: IAM_KEYS.meshRightsProfiles,
    queryFn: () => iamApi.listRightsProfiles(),
  });
}

export function useMeshRightsProfileUsage() {
  return useQuery({
    queryKey: IAM_KEYS.meshRightsProfileUsage,
    queryFn: () => iamApi.getRightsProfileUsage(),
  });
}

export function useCreateMeshRightsProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMeshCentralRightsProfileRequest) =>
      iamApi.createRightsProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.meshRightsProfiles });
    },
  });
}

export function useUpdateMeshRightsProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateMeshCentralRightsProfileRequest;
    }) => iamApi.updateRightsProfile(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.meshRightsProfiles });
    },
  });
}

export function useDeleteMeshRightsProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => iamApi.deleteRightsProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: IAM_KEYS.meshRightsProfiles });
      queryClient.invalidateQueries({
        queryKey: IAM_KEYS.meshRightsProfileUsage,
      });
    },
  });
}

import { api } from "./client";
import type { MfaRequirement } from "./types";

export type ScopeLevel = "Global" | "Client" | "Site";

export interface UserDto {
  id: string;
  login: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mfaRequired: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserRequest {
  login: string;
  email: string;
  fullName: string;
  password: string;
  mfaRequired: boolean;
}

export interface MeshCentralSyncSummary {
  synced: boolean;
  meshUsername: string;
  siteBindingsApplied: number;
  error: string | null;
}

export interface CreateUserResponse {
  id: string;
  meshCentralSync: MeshCentralSyncSummary;
}

export interface CreateUserWithGroupsRequest {
  user: CreateUserRequest;
  groupIds: string[];
}

export interface CreateUserWithGroupsResponse extends CreateUserResponse {
  groupsAssigned: number;
}

export interface UpdateUserRequest {
  login: string;
  email: string;
  fullName: string;
  mfaRequired: boolean;
  isActive: boolean;
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

export type UserMfaKeyType = "Fido2" | "Totp";

export interface UserMfaKeyDto {
  id: string;
  name: string;
  keyType: UserMfaKeyType;
  createdAt: string;
  lastUsedAt: string | null;
  isActive?: boolean;
}

export interface MyProfileDto {
  login: string;
  email: string;
  fullName: string;
}

export interface UpdateMyProfileRequest {
  email: string;
  fullName: string;
}

export interface MySecurityKeyDto {
  id?: string;
  name: string;
  keyType: 0 | 1;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MySecurityDto {
  mfaRequired: boolean;
  mfaConfigured: boolean;
  roleMfaRequirement: MfaRequirement;
  keys: MySecurityKeyDto[];
}

export interface ChangeMyPasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

export interface UserGroupDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserGroupRequest {
  name: string;
  description?: string | null;
}

export interface UpdateUserGroupRequest {
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface GroupMemberDto {
  assignmentId: string;
  userId: string;
  login?: string;
  email?: string;
  fullName?: string;
  isActive?: boolean;
  addedAt?: string;
}

export interface AddGroupMemberRequest {
  userId: string;
}

export interface GroupRoleAssignmentDto {
  assignmentId: string;
  roleId: string;
  roleName?: string;
  scopeLevel: ScopeLevel;
  scopeId: string | null;
  scopeName?: string | null;
  assignedAt?: string;
}

export interface AssignGroupRoleRequest {
  roleId: string;
  scopeLevel: ScopeLevel;
  scopeId: string | null;
}

export interface MeshCentralBackfillRequest {
  applyChanges: boolean;
  clientId?: string | null;
  siteId?: string | null;
}

export interface MeshCentralBackfillItem {
  userId: string;
  login: string;
  meshUsername: string;
  applied: boolean;
  success: boolean;
  siteBindingsApplied: number;
  rightsUpdatesApplied: number;
  deviceBindingsApplied: number;
  deviceBindingsRevoked: number;
  deviceBindingsRevocationCandidates: number;
  error: string | null;
}

export interface MeshCentralBackfillReport {
  applyChanges: boolean;
  startedAtUtc: string;
  finishedAtUtc: string;
  totalUsers: number;
  syncedUsers: number;
  failedUsers: number;
  items: MeshCentralBackfillItem[];
}

export interface MeshGroupPolicyStatusDto {
  siteId: string;
  desiredProfile?: string | null;
  appliedProfile?: string | null;
  hasDrift: boolean;
  driftReasons?: string[];
  meshId?: string | null;
  groupName?: string | null;
  appliedAtUtc?: string | null;
  [key: string]: unknown;
}

export interface MeshGroupPolicyReconcileRequest {
  applyChanges: boolean;
  clientId?: string | null;
  siteId?: string | null;
}

export interface MeshGroupPolicyReconcileItem {
  siteId?: string | null;
  siteName?: string | null;
  meshId?: string | null;
  meshIdBefore?: string | null;
  meshIdAfter?: string | null;
  groupName?: string | null;
  desiredProfile?: string | null;
  appliedProfile?: string | null;
  appliedProfileBefore?: string | null;
  appliedProfileAfter?: string | null;
  hasDrift?: boolean;
  applied?: boolean;
  success?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export interface MeshGroupPolicyReconcileReport {
  applyChanges: boolean;
  startedAtUtc?: string;
  finishedAtUtc?: string;
  totalSites?: number;
  reconciledSites?: number;
  failedSites?: number;
  items?: MeshGroupPolicyReconcileItem[];
  [key: string]: unknown;
}

export interface MeshCentralRightsProfileDto {
  id: string;
  name: string;
  description: string | null;
  rightsMask: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMeshCentralRightsProfileRequest {
  name: string;
  rightsMask: number;
  description?: string | null;
}

export interface UpdateMeshCentralRightsProfileRequest {
  name?: string;
  rightsMask?: number;
  description?: string | null;
}

export interface MeshCentralRightsProfileUsageDto {
  profileName: string;
  rolesCount: number;
  roles: Array<{ id: string; name: string }>;
}

export interface MeshCentralDiagnosticsHealthDto {
  controlSocketConnected: boolean;
  publicBaseUrl?: string | null;
  administrativeBaseUrl?: string | null;
  technicalUsername?: string | null;
  meshCount?: number;
  userCount?: number;
}

export interface MeshCentralDiagnosticsSiteDto {
  clientId: string;
  siteId: string;
  clientName?: string | null;
  siteName?: string | null;
  supportEnabled?: boolean;
  desiredProfile?: string | null;
  appliedProfile?: string | null;
  meshId?: string | null;
  groupName?: string | null;
  appliedAtUtc?: string | null;
  hasDrift?: boolean;
  driftReasons?: string[];
}

export interface MeshCentralDiagnosticsAgentDto {
  id: string;
  siteId: string;
  hostname?: string | null;
  meshCentralNodeId?: string | null;
}

export interface MeshCentralDiagnosticsResponse {
  health: MeshCentralDiagnosticsHealthDto;
  site?: MeshCentralDiagnosticsSiteDto | null;
  agent?: MeshCentralDiagnosticsAgentDto | null;
}

export interface MeshCentralNodeLinksBackfillRequest {
  applyChanges: boolean;
  clientId?: string | null;
  siteId?: string | null;
}

export interface MeshCentralNodeLinksBackfillItem {
  agentId: string;
  siteId: string;
  hostname: string;
  displayName?: string | null;
  currentNodeId?: string | null;
  suggestedNodeId?: string | null;
  status:
    | "verified"
    | "suggested"
    | "linked"
    | "unmatched"
    | "ambiguous"
    | "missing-mesh"
    | "error"
    | string;
  applied: boolean;
  candidateNodeIds?: string[];
  error?: string | null;
}

export interface MeshCentralNodeLinksBackfillReport {
  applyChanges: boolean;
  startedAtUtc: string;
  finishedAtUtc: string;
  totalAgents: number;
  updatedAgents: number;
  verifiedAgents: number;
  missingAgents: number;
  ambiguousAgents: number;
  items: MeshCentralNodeLinksBackfillItem[];
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  mfaRequirement: MfaRequirement;
  meshRightsMask?: number | null;
  meshRightsProfile?: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string | null;
  mfaRequirement: MfaRequirement;
  meshRightsMask?: number | null;
  meshRightsProfile?: string | null;
}

export interface UpdateRoleRequest {
  name: string;
  description?: string | null;
  mfaRequirement: MfaRequirement;
  meshRightsMask?: number | null;
  meshRightsProfile?: string | null;
  isActive: boolean;
}

export interface PermissionDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  resourceType?: string;
  actionType?: string;
}

export interface AddRolePermissionRequest {
  permissionId: string;
}

const USERS = "/api/users";
const GROUPS = "/api/user-groups";
const ROLES = "/api/roles";

export const iamApi = {
  listUsers: () => api.get<UserDto[]>(USERS),

  getUser: (id: string) => api.get<UserDto>(`${USERS}/${id}`),

  createUser: (payload: CreateUserRequest) =>
    api.post<CreateUserResponse>(USERS, payload),

  createUserWithGroups: async (
    payload: CreateUserWithGroupsRequest,
  ): Promise<CreateUserWithGroupsResponse> => {
    const created = await api.post<CreateUserResponse>(USERS, payload.user);

    let groupsAssigned = 0;
    for (const groupId of payload.groupIds) {
      const normalizedGroupId = groupId.trim();
      if (!normalizedGroupId) continue;
      await api.post<void>(`${GROUPS}/${normalizedGroupId}/members`, {
        userId: created.id,
      });
      groupsAssigned += 1;
    }

    return {
      ...created,
      groupsAssigned,
    };
  },

  updateUser: (id: string, payload: UpdateUserRequest) =>
    api.put<UserDto>(`${USERS}/${id}`, payload),

  changePassword: (id: string, payload: ChangePasswordRequest) =>
    api.post<void>(`${USERS}/${id}/change-password`, payload),

  listUserMfaKeys: (id: string) =>
    api.get<UserMfaKeyDto[]>(`${USERS}/${id}/mfa/keys`),

  revokeUserMfa: (id: string) => api.del<void>(`${USERS}/${id}/mfa`),

  revokeUserMfaKey: (id: string, keyId: string) =>
    api.del<void>(`${USERS}/${id}/mfa/keys/${keyId}`),

  forceUserPasswordReset: (id: string) =>
    api.post<void>(`${USERS}/${id}/force-password-reset`),

  deleteUser: (id: string) => api.del<void>(`${USERS}/${id}`),

  getMyProfile: () => api.get<MyProfileDto>(`${USERS}/me`),

  updateMyProfile: (payload: UpdateMyProfileRequest) =>
    api.put<MyProfileDto>(`${USERS}/me`, payload),

  getMySecurity: () => api.get<MySecurityDto>(`${USERS}/me/security`),

  changeMyPassword: (payload: ChangeMyPasswordRequest) =>
    api.post<void>(`${USERS}/me/change-password`, payload),

  listGroups: () => api.get<UserGroupDto[]>(GROUPS),

  getGroup: (id: string) => api.get<UserGroupDto>(`${GROUPS}/${id}`),

  createGroup: (payload: CreateUserGroupRequest) =>
    api.post<UserGroupDto>(GROUPS, payload),

  updateGroup: (id: string, payload: UpdateUserGroupRequest) =>
    api.put<UserGroupDto>(`${GROUPS}/${id}`, payload),

  deleteGroup: (id: string) => api.del<void>(`${GROUPS}/${id}`),

  listGroupMembers: (groupId: string) =>
    api.get<GroupMemberDto[]>(`${GROUPS}/${groupId}/members`),

  addGroupMember: (groupId: string, payload: AddGroupMemberRequest) =>
    api.post<GroupMemberDto>(`${GROUPS}/${groupId}/members`, payload),

  removeGroupMember: (groupId: string, userId: string) =>
    api.del<void>(`${GROUPS}/${groupId}/members/${userId}`),

  listGroupRoles: (groupId: string) =>
    api.get<GroupRoleAssignmentDto[]>(`${GROUPS}/${groupId}/roles`),

  assignGroupRole: (groupId: string, payload: AssignGroupRoleRequest) =>
    api.post<GroupRoleAssignmentDto>(`${GROUPS}/${groupId}/roles`, payload),

  removeGroupRole: (groupId: string, assignmentId: string) =>
    api.del<void>(`${GROUPS}/${groupId}/roles/${assignmentId}`),

  listRoles: () => api.get<RoleDto[]>(ROLES),

  getRole: (id: string) => api.get<RoleDto>(`${ROLES}/${id}`),

  createRole: (payload: CreateRoleRequest) => api.post<RoleDto>(ROLES, payload),

  updateRole: (id: string, payload: UpdateRoleRequest) =>
    api.put<RoleDto>(`${ROLES}/${id}`, payload),

  deleteRole: (id: string) => api.del<void>(`${ROLES}/${id}`),

  listRolePermissions: (roleId: string) =>
    api.get<PermissionDto[]>(`${ROLES}/${roleId}/permissions`),

  listPermissionsCatalog: () =>
    api.get<PermissionDto[]>(`${ROLES}/permissions`),

  addRolePermission: (roleId: string, payload: AddRolePermissionRequest) =>
    api.post<PermissionDto>(`${ROLES}/${roleId}/permissions`, payload),

  removeRolePermission: (roleId: string, permissionId: string) =>
    api.del<void>(`${ROLES}/${roleId}/permissions/${permissionId}`),

  runMeshCentralBackfill: (payload: MeshCentralBackfillRequest) =>
    api.post<MeshCentralBackfillReport>(
      "/api/meshcentral/identity-sync/backfill",
      payload,
    ),

  runMeshCentralBackfillDryRun: (
    payload: Omit<MeshCentralBackfillRequest, "applyChanges"> = {},
  ) =>
    api.post<MeshCentralBackfillReport>(
      "/api/meshcentral/identity-sync/backfill",
      {
        applyChanges: false,
        ...payload,
      },
    ),

  getMeshCentralDiagnosticsHealth: (siteId: string, agentId?: string | null) =>
    api.get<MeshCentralDiagnosticsResponse>(
      "/api/meshcentral/diagnostics/health",
      {
        siteId,
        ...(agentId ? { agentId } : {}),
      },
    ),

  runMeshCentralNodeLinksBackfill: (
    payload: MeshCentralNodeLinksBackfillRequest,
  ) =>
    api.post<MeshCentralNodeLinksBackfillReport>(
      "/api/meshcentral/node-links/backfill",
      payload,
    ),

  runMeshCentralNodeLinksBackfillDryRun: (
    payload: Omit<MeshCentralNodeLinksBackfillRequest, "applyChanges"> = {},
  ) =>
    api.post<MeshCentralNodeLinksBackfillReport>(
      "/api/meshcentral/node-links/backfill",
      {
        applyChanges: false,
        ...payload,
      },
    ),

  getMeshGroupPolicyStatus: (siteId: string) =>
    api.get<MeshGroupPolicyStatusDto>(
      `/api/meshcentral/group-policy/sites/${siteId}/status`,
    ),

  reconcileMeshGroupPolicy: (payload: MeshGroupPolicyReconcileRequest) =>
    api.post<MeshGroupPolicyReconcileReport>(
      "/api/meshcentral/group-policy/reconcile",
      payload,
    ),

  listRightsProfiles: () =>
    api.get<MeshCentralRightsProfileDto[]>("/api/meshcentral/rights-profiles"),

  createRightsProfile: (payload: CreateMeshCentralRightsProfileRequest) =>
    api.post<MeshCentralRightsProfileDto>(
      "/api/meshcentral/rights-profiles",
      payload,
    ),

  updateRightsProfile: (
    id: string,
    payload: UpdateMeshCentralRightsProfileRequest,
  ) =>
    api.put<MeshCentralRightsProfileDto>(
      `/api/meshcentral/rights-profiles/${id}`,
      payload,
    ),

  deleteRightsProfile: (id: string) =>
    api.del<void>(`/api/meshcentral/rights-profiles/${id}`),

  getRightsProfileUsage: () =>
    api.get<MeshCentralRightsProfileUsageDto[]>(
      "/api/meshcentral/rights-profiles/usage",
    ),
};

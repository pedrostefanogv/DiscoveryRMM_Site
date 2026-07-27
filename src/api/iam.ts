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

export interface CreateUserResponse {
  id: string;
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

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  mfaRequirement: MfaRequirement;
  isSystem: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string | null;
  mfaRequirement: MfaRequirement;
}

export interface UpdateRoleRequest {
  name: string;
  description?: string | null;
  mfaRequirement: MfaRequirement;
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

const USERS = "/api/v1/users";
const GROUPS = "/api/v1/user-groups";
const ROLES = "/api/v1/roles";

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
};

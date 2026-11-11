import {
  api,
  apiFetchResponse,
  ApiError,
  parseErrorMessage,
} from "./client";
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
  /**
   * Grupo inicial do usuário. A API cria usuário + senha + vínculo numa única
   * transação. É obrigatório para administradores com escopo limitado: sem grupo a
   * conta não pertence a nenhum escopo e não pode ser administrada por ninguém.
   */
  groupId?: string;
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
  /**
   * Vínculos de grupo que falharam depois de o usuário já ter sido criado. A operação é
   * parcialmente bem-sucedida: antes o erro subia como falha total e a UI dizia que nada
   * havia sido criado.
   */
  groupsFailed: Array<{ groupId: string; message: string }>;
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

/**
 * Corpo dos endpoints em lote de permissões da role.
 *
 * É MERGE, não replace: somente as permissões listadas aqui são concedidas ou
 * revogadas. As demais permissões da role permanecem intactas — por isso a UI
 * pode mandar o lote sem precisar reenviar o estado atual da role.
 */
export interface BulkRolePermissionsRequest {
  permissionIds: string[];
}

export interface BulkAssignRolePermissionsResponse {
  /** Quantas permissões foram efetivamente concedidas nesta chamada. */
  added: number;
  /** Quantas já estavam concedidas (idempotência, não é erro). */
  skipped: number;
}

export interface BulkRemoveRolePermissionsResponse {
  /** Quantas permissões foram efetivamente revogadas nesta chamada. */
  removed: number;
  /** Quantas não estavam vinculadas (idempotência, não é erro). */
  skipped: number;
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
    // O PRIMEIRO grupo vai na própria criação (createUser.groupId): a API cria
    // usuário + senha + vínculo inicial numa transação única.
    //
    // Antes o usuário era criado aqui e os vínculos vinham depois, um a um — o que
    // produzia contas "criadas com acesso" que na verdade não tinham acesso quando
    // o vínculo falhava (a UI mostrava groupsFailed e o operador não reconciliável).
    // Pior: para um administrador ESCOPADO a um cliente, a API passou a exigir o
    // grupo inicial (sem grupo a conta não pertence a escopo algum e fica
    // inadministrável), então o vínculo precisa ser atômico.
    const normalizedGroupIds = (payload.groupIds ?? [])
      .map((groupId) => groupId.trim())
      .filter(Boolean);

    const [initialGroupId, ...additionalGroupIds] = normalizedGroupIds;

    const created = await api.post<CreateUserResponse>(USERS, {
      ...payload.user,
      ...(initialGroupId ? { groupId: initialGroupId } : {}),
    });

    let groupsAssigned = initialGroupId ? 1 : 0;
    const groupsFailed: Array<{ groupId: string; message: string }> = [];

    for (const groupId of additionalGroupIds) {
      try {
        await api.post<void>(`${GROUPS}/${groupId}/members`, {
          userId: created.id,
        });
        groupsAssigned += 1;
      } catch (error) {
        groupsFailed.push({
          groupId,
          message:
            error instanceof Error && error.message
              ? error.message
              : "Falha ao vincular o usuário ao grupo.",
        });
      }
    }

    return {
      ...created,
      groupsAssigned,
      groupsFailed,
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

  /** Libera os bloqueios da conta (lockout de senha e de MFA). */
  unlockUser: (id: string) => api.post<void>(`${USERS}/${id}/unlock`),

  deleteUser: (id: string) => api.del<void>(`${USERS}/${id}`),

  getMyProfile: () => api.get<MyProfileDto>(`${USERS}/me`),

  updateMyProfile: (payload: UpdateMyProfileRequest) =>
    api.put<MyProfileDto>(`${USERS}/me`, payload),

  /**
   * Contrato de GET /users/me/security.
   *
   * Normaliza a resposta: o endpoint já devolveu um usuário sem a propriedade `keys`
   * e a ProfilePage quebrava com "cannot read length of undefined". Com o fallback,
   * uma resposta parcial nunca propaga `undefined` para a UI.
   */
  getMySecurity: async (): Promise<MySecurityDto> => {
    // `?? {}`: uma resposta 204/undefined não pode virar TypeError no acesso às propriedades.
    const data = (await api.get<Partial<MySecurityDto>>(`${USERS}/me/security`)) ?? {};

    return {
      mfaRequired: data.mfaRequired ?? false,
      mfaConfigured: data.mfaConfigured ?? false,
      roleMfaRequirement: (data.roleMfaRequirement ?? "None") as MfaRequirement,
      keys: Array.isArray(data.keys) ? data.keys : [],
    };
  },

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

  /** Concede VÁRIAS permissões numa única requisição (merge, não replace). */
  bulkAddRolePermissions: (
    roleId: string,
    payload: BulkRolePermissionsRequest,
  ) =>
    api.post<BulkAssignRolePermissionsResponse>(
      `${ROLES}/${roleId}/permissions/batch`,
      payload,
    ),

  /**
   * Revoga VÁRIAS permissões numa única requisição (merge, não replace).
   *
   * DELETE **com corpo JSON**. O helper `api.del` do client aceita apenas `init`
   * (não recebe body — veja src/api/client.ts) e o client.ts é arquivo de outro
   * dono, então o corpo vai por `apiFetchResponse`, que é a primitiva pública do
   * próprio client: mesma URL base normalizada, mesma injeção de Authorization e
   * mesmo retry de 401, com o parser de erro reaproveitado aqui.
   */
  bulkRemoveRolePermissions: async (
    roleId: string,
    payload: BulkRolePermissionsRequest,
  ): Promise<BulkRemoveRolePermissionsResponse> => {
    const response = await apiFetchResponse(
      `${ROLES}/${roleId}/permissions/batch`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      // Mesmo parser do client (lê o corpo uma única vez) para a UI exibir a
      // mensagem real da ApiError — ex.: a validação de role de sistema.
      throw new ApiError(response.status, await parseErrorMessage(response));
    }

    if (response.status === 204) {
      return { removed: 0, skipped: 0 };
    }

    return (await response.json()) as BulkRemoveRolePermissionsResponse;
  },
};

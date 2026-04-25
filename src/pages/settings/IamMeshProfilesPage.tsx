import { useMemo, useState } from "react";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  type Column,
} from "@/components/ui";
import {
  type MeshCentralRightsProfileDto,
  type CreateMeshCentralRightsProfileRequest,
  type UpdateMeshCentralRightsProfileRequest,
} from "@/api";
import {
  useCreateMeshRightsProfile,
  useDeleteMeshRightsProfile,
  useMeshRightsProfileUsage,
  useMeshRightsProfiles,
  useUpdateMeshRightsProfile,
} from "@/hooks";
import { ApiError } from "@/api";
import { useAuthorization } from "@/auth/authorization";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const MESH_RIGHT_BITS: Array<{ bit: number; label: string }> = [
  { bit: 1, label: "Edit Group" },
  { bit: 2, label: "Manage Users" },
  { bit: 4, label: "Manage Devices" },
  { bit: 8, label: "Remote Control" },
  { bit: 16, label: "Agent Console" },
  { bit: 32, label: "Server Files" },
  { bit: 64, label: "Wake Device" },
  { bit: 128, label: "Notes" },
  { bit: 256, label: "View-only Desktop" },
  { bit: 512, label: "No Terminal" },
  { bit: 1024, label: "No Files" },
  { bit: 2048, label: "No Intel AMT" },
  { bit: 4096, label: "Limited Desktop Input" },
  { bit: 8192, label: "Limited Events" },
  { bit: 16384, label: "Chat/Notify" },
  { bit: 32768, label: "Uninstall Agent" },
  { bit: 65536, label: "No Remote Desktop" },
  { bit: 131072, label: "Remote Commands" },
  { bit: 262144, label: "Reset/Power Off" },
];

function parseMaskInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function bitsFromRights(rights: number): number[] {
  if (!Number.isInteger(rights) || rights < 0) return [];
  return MESH_RIGHT_BITS.filter(({ bit }) => (rights & bit) === bit).map(({ bit }) => bit);
}

function sumRights(bits: number[]): number {
  return bits.reduce((acc, bit) => acc | bit, 0);
}

function describeMask(mask: number): string {
  if (mask === -1) return "Full (-1)";
  if (mask === 0) return "Nenhum (0)";
  const active = MESH_RIGHT_BITS.filter(({ bit }) => (mask & bit) === bit).map(({ label }) => label);
  if (active.length === 0) return String(mask);
  if (active.length <= 3) return active.join(", ");
  return `${active.slice(0, 3).join(", ")} +${active.length - 3}`;
}

export default function IamMeshProfilesPage() {
  const profilesQuery = useMeshRightsProfiles();
  const usageQuery = useMeshRightsProfileUsage();

  const createProfile = useCreateMeshRightsProfile();
  const updateProfile = useUpdateMeshRightsProfile();
  const deleteProfile = useDeleteMeshRightsProfile();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MeshCentralRightsProfileDto | null>(null);

  const { hasAnyPermission } = useAuthorization();
  const canWrite = hasAnyPermission(["Users.Edit", "identity.*", "admin.*"]);
  const canDelete = hasAnyPermission(["Users.Edit", "identity.*", "admin.*"]);

  const usageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of usageQuery.data ?? []) {
      map.set(entry.profileName, entry.rolesCount);
    }
    return map;
  }, [usageQuery.data]);

  const columns = useMemo<Column<MeshCentralRightsProfileDto>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        render: (item) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-white">{item.name}</p>
              {item.isSystem && <Badge color="warning">Sistema</Badge>}
            </div>
            {item.description && (
              <p className="text-xs text-slate-400">{item.description}</p>
            )}
          </div>
        ),
      },
      {
        key: "rightsMask",
        header: "Máscara de direitos",
        render: (item) => (
          <div className="space-y-1">
            <p className="text-sm text-white font-mono">{item.rightsMask}</p>
            <p className="text-xs text-slate-400">{describeMask(item.rightsMask)}</p>
          </div>
        ),
      },
      {
        key: "usage",
        header: "Uso em roles",
        render: (item) => {
          const count = usageMap.get(item.name) ?? 0;
          return (
            <Badge color={count > 0 ? "accent" : "slate"}>{count} role(s)</Badge>
          );
        },
      },
      {
        key: "actions",
        header: "Ações",
        className: "w-[160px]",
        render: (item) => {
          const usageCount = usageMap.get(item.name) ?? 0;
          const canRemove = canDelete && !item.isSystem && usageCount === 0;
          return (
            <div className="flex justify-end gap-2">
              {canWrite && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTarget(item);
                  }}
                >
                  Editar
                </Button>
              )}
              {canDelete && !item.isSystem && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canRemove}
                  title={
                    usageCount > 0
                      ? `Usado por ${usageCount} role(s). Remova o vínculo antes de excluir.`
                      : undefined
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(item);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [canDelete, canWrite, usageMap],
  );

  const handleDelete = async (profile: MeshCentralRightsProfileDto) => {
    const confirmed = window.confirm(
      `Excluir perfil "${profile.name}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    try {
      await deleteProfile.mutateAsync(profile.id);
      toast.success("Perfil removido com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o perfil."));
    }
  };

  if (profilesQuery.isLoading) {
    return <Loading message="Carregando perfis Mesh..." />;
  }

  if (profilesQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar perfis Mesh."
        onRetry={() => void profilesQuery.refetch()}
      />
    );
  }

  const profiles = profilesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Perfis MeshCentral</h1>
        <p className="text-sm text-slate-400">
          Gerencie os perfis de direitos MeshCentral disponíveis para atribuição em roles.
          Perfis de sistema (viewer, operator, admin) não podem ser excluídos.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Perfis"
          subtitle={`${profiles.length} registro(s)`}
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Novo perfil
              </Button>
            ) : undefined
          }
        />

        <DataTable
          columns={columns}
          data={profiles}
          keyExtractor={(item) => item.id}
          emptyMessage="Nenhum perfil encontrado."
        />
      </Card>

      <CreateProfileModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        loading={createProfile.isPending}
        onSubmit={async (payload) => {
          await createProfile.mutateAsync(payload);
        }}
      />

      {editTarget && (
        <EditProfileModal
          profile={editTarget}
          onClose={() => setEditTarget(null)}
          loading={updateProfile.isPending}
          onSubmit={async (payload) => {
            await updateProfile.mutateAsync({ id: editTarget.id, payload });
          }}
        />
      )}
    </div>
  );
}

function MaskEditor({
  maskInput,
  selectedBits,
  onMaskInputChange,
  onToggleBit,
  onToggleFull,
  disabled,
}: {
  maskInput: string;
  selectedBits: number[];
  onMaskInputChange: (value: string) => void;
  onToggleBit: (bit: number, checked: boolean) => void;
  onToggleFull: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const fullSelected = maskInput.trim() === "-1";

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <Input
        label="RightsMask (número)"
        value={maskInput}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value.trim();
          if (!/^[-]?\d*$/.test(next)) return;
          onMaskInputChange(next === "" || next === "-" ? "0" : next);
        }}
      />

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={fullSelected}
          disabled={disabled}
          onChange={(e) => onToggleFull(e.target.checked)}
          className="rounded border-white/20 bg-white/5"
        />
        Full (-1): todos os direitos
      </label>

      {!fullSelected && (
        <div className="grid grid-cols-2 gap-1">
          {MESH_RIGHT_BITS.map(({ bit, label }) => (
            <label key={bit} className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selectedBits.includes(bit)}
                disabled={disabled}
                onChange={(e) => onToggleBit(bit, e.target.checked)}
                className="rounded border-white/20 bg-white/5"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateProfileModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMeshCentralRightsProfileRequest) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maskInput, setMaskInput] = useState("0");
  const [maskBits, setMaskBits] = useState<number[]>([]);

  const parsedMask = parseMaskInput(maskInput);
  const valid = name.trim().length >= 1 && parsedMask !== null;

  const reset = () => {
    setName("");
    setDescription("");
    setMaskInput("0");
    setMaskBits([]);
  };

  const submit = async () => {
    if (!valid || parsedMask === null) return;
    try {
      await onSubmit({
        name: name.trim(),
        rightsMask: parsedMask,
        description: description.trim() || null,
      });
      toast.success("Perfil criado com sucesso.");
      reset();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível criar o perfil."));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo perfil Mesh">
      <div className="space-y-4">
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex.: operator-restrito"
        />
        <p className="text-xs text-slate-500">
          O nome será normalizado para minúsculas e não pode ser duplicado.
        </p>
        <Input
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <MaskEditor
          maskInput={maskInput}
          selectedBits={maskBits}
          onMaskInputChange={(next) => {
            setMaskInput(next);
            const parsed = parseMaskInput(next);
            if (parsed === null || parsed < 0) {
              setMaskBits([]);
              return;
            }
            setMaskBits(bitsFromRights(parsed));
          }}
          onToggleBit={(bit, checked) => {
            const next = checked
              ? Array.from(new Set([...maskBits, bit]))
              : maskBits.filter((b) => b !== bit);
            setMaskBits(next);
            setMaskInput(String(sumRights(next)));
          }}
          onToggleFull={(checked) => {
            if (checked) {
              setMaskInput("-1");
              setMaskBits([]);
              return;
            }
            setMaskInput("0");
            setMaskBits([]);
          }}
        />

        {parsedMask === null && (
          <p className="text-xs text-warning">Use um inteiro válido (ex.: 61176 ou -1).</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>
            <ShieldCheck className="h-4 w-4" /> Criar perfil
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProfileModal({
  profile,
  onClose,
  onSubmit,
  loading,
}: {
  profile: MeshCentralRightsProfileDto;
  onClose: () => void;
  onSubmit: (payload: UpdateMeshCentralRightsProfileRequest) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [maskInput, setMaskInput] = useState(String(profile.rightsMask));
  const [maskBits, setMaskBits] = useState(bitsFromRights(profile.rightsMask));

  const parsedMask = parseMaskInput(maskInput);
  const valid = name.trim().length >= 1 && parsedMask !== null;
  const isSystem = profile.isSystem;

  const submit = async () => {
    if (!valid || parsedMask === null) return;
    try {
      await onSubmit({
        name: name.trim(),
        rightsMask: parsedMask,
        description: description.trim() || null,
      });
      toast.success("Perfil atualizado com sucesso.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar o perfil."));
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar perfil: ${profile.name}`}>
      <div className="space-y-4">
        {isSystem && (
          <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
            Perfis de sistema podem ter descrição e máscara editadas, mas não podem ser excluídos.
          </div>
        )}

        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSystem}
        />
        <Input
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <MaskEditor
          maskInput={maskInput}
          selectedBits={maskBits}
          onMaskInputChange={(next) => {
            setMaskInput(next);
            const parsed = parseMaskInput(next);
            if (parsed === null || parsed < 0) {
              setMaskBits([]);
              return;
            }
            setMaskBits(bitsFromRights(parsed));
          }}
          onToggleBit={(bit, checked) => {
            const next = checked
              ? Array.from(new Set([...maskBits, bit]))
              : maskBits.filter((b) => b !== bit);
            setMaskBits(next);
            setMaskInput(String(sumRights(next)));
          }}
          onToggleFull={(checked) => {
            if (checked) {
              setMaskInput("-1");
              setMaskBits([]);
              return;
            }
            setMaskInput("0");
            setMaskBits([]);
          }}
        />

        {parsedMask === null && (
          <p className="text-xs text-warning">Use um inteiro válido (ex.: 61176 ou -1).</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

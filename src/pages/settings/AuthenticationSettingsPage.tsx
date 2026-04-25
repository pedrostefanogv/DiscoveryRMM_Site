import { useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  Fingerprint,
  KeyRound,
  Pencil,
  ShieldCheck,
  ShieldPlus,
  Trash2,
} from "lucide-react";
import { ApiError, authApi, type MfaKey } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  ensureWebAuthnSupport,
  parseRegistrationOptions,
  serializeRegistrationCredential,
} from "@/auth/webauthn";
import {
  useDeleteMfaKey,
  useInvalidateMfaKeys,
  useMfaKeys,
  useNowTick,
  useRenameMfaKey,
} from "@/hooks";
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

const renameSchema = z.object({
  keyName: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(80, "Use no maximo 80 caracteres."),
});

type RenameFormValues = z.infer<typeof renameSchema>;

function formatDate(value: string | null) {
  if (!value) {
    return "Nunca utilizada";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function getKeyTypeLabel(keyType: MfaKey["keyType"]) {
  return keyType === 0 ? "FIDO2" : "TOTP";
}

function getKeyTypeColor(keyType: MfaKey["keyType"]) {
  return keyType === 0 ? "accent" : "warning";
}

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function AuthenticationSettingsPage() {
  const { session } = useAuth();
  const now = useNowTick(1_000);
  const keysQuery = useMfaKeys();
  const renameMutation = useRenameMfaKey();
  const deleteMutation = useDeleteMfaKey();
  const invalidateMfaKeys = useInvalidateMfaKeys();
  const [registering, setRegistering] = useState(false);
  const [editTarget, setEditTarget] = useState<MfaKey | null>(null);

  const columns = useMemo<Column<MfaKey>[]>(
    () => [
      {
        key: "name",
        header: "Chave",
        render: (item) => (
          <div className="space-y-1">
            <p className="font-medium text-white">{item.name}</p>
            <div className="flex items-center gap-2">
              <Badge color={getKeyTypeColor(item.keyType)}>
                {getKeyTypeLabel(item.keyType)}
              </Badge>
              {item.isActive ? (
                <Badge color="success">Ativa</Badge>
              ) : (
                <Badge color="warning">Inativa</Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "createdAt",
        header: "Criada em",
        render: (item) => formatDate(item.createdAt),
      },
      {
        key: "lastUsedAt",
        header: "Ultimo uso",
        render: (item) => formatDate(item.lastUsedAt),
      },
      {
        key: "actions",
        header: "Acoes",
        className: "w-[160px]",
        render: (item) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setEditTarget(item);
              }}
            >
              <Pencil className="h-4 w-4" /> Renomear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                void handleDelete(item);
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" /> Remover
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation.isPending],
  );

  const handleRegister = async () => {
    if (!session.accessToken) {
      toast.error("Sessao autenticada ausente. Faca login novamente.");
      return;
    }

    const keyName = window.prompt("Nome da nova chave FIDO2", "Notebook Pedro");
    if (keyName === null) {
      return;
    }

    const trimmedName = keyName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      toast.error("Informe um nome entre 2 e 80 caracteres.");
      return;
    }

    setRegistering(true);

    try {
      ensureWebAuthnSupport();
      const begin = await authApi.beginRegistrationFido2(session.accessToken);
      const credential = await navigator.credentials.create({
        publicKey: parseRegistrationOptions(begin.options),
      });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador nao retornou uma credencial valida.");
      }

      const result = await authApi.completeRegistrationFido2(
        session.accessToken,
        {
          keyName: trimmedName,
          attestationResponseJson: JSON.stringify(
            serializeRegistrationCredential(credential),
          ),
        },
      );

      await invalidateMfaKeys();
      toast.success(result.message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel registrar a chave de seguranca.";
      toast.error(message);
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (item: MfaKey) => {
    const confirmed = window.confirm(
      `Remover a chave \"${item.name}\"? Esta acao nao pode ser desfeita.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(item.id);
      toast.success("Chave removida com sucesso.");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel remover a chave de seguranca.";
      toast.error(message);
    }
  };

  if (keysQuery.isLoading) {
    return <Loading message="Carregando configuracoes de autenticacao..." />;
  }

  if (keysQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar suas chaves de autenticacao."
        onRetry={() => void keysQuery.refetch()}
      />
    );
  }

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((item) => item.isActive).length;
  const expiresInText =
    session.expiresAt && session.stage === "authenticated"
      ? formatCountdown(session.expiresAt - now)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Autenticacao</h1>
        <p className="text-sm text-slate-400">
          Gerencie suas chaves MFA e acompanhe o estado da sessao atual.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-3 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Sessao</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {session.stage === "authenticated"
                  ? "Autenticada"
                  : "Sem sessao valida"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {expiresInText
                  ? `Expira em ${expiresInText}`
                  : "Sem expiracao local registrada"}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-accent/15 p-3 text-accent">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Chaves cadastradas</p>
              <p className="mt-1 text-lg font-semibold text-white">{keys.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {activeKeys} ativa(s) vinculada(s) a este usuario
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-success/15 p-3 text-success">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Metodo principal</p>
              <p className="mt-1 text-lg font-semibold text-white">FIDO2 / WebAuthn</p>
              <p className="mt-1 text-xs text-slate-500">
                TOTP segue reservado para futuro no backend atual
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Chaves MFA"
          subtitle="Cadastre novas passkeys ou organize as chaves ativas do seu usuario."
          action={
            <Button size="sm" onClick={() => void handleRegister()} loading={registering}>
              <ShieldPlus className="h-4 w-4" /> Registrar nova chave
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={keys}
          keyExtractor={(item) => item.id}
          emptyMessage="Nenhuma chave MFA cadastrada. Registre a primeira para proteger o acesso."
        />
      </Card>

      <Card>
        <CardHeader
          title="Regras atuais"
          subtitle="Comportamentos importantes expostos pelo backend para o fluxo de autenticacao."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            O backend impede remover a ultima chave ativa do usuario. A mensagem retornada pela API e exibida como fonte de verdade.
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Registros novos usam WebAuthn com navigator.credentials.create e sao gravados com o nome amigavel informado na UI.
          </div>
        </div>
      </Card>

      <RenameMfaKeyModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        renameMutation={renameMutation}
      />
    </div>
  );
}

function RenameMfaKeyModal({
  target,
  onClose,
  renameMutation,
}: {
  target: MfaKey | null;
  onClose: () => void;
  renameMutation: ReturnType<typeof useRenameMfaKey>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RenameFormValues>({
    resolver: zodResolver(renameSchema),
    values: {
      keyName: target?.name ?? "",
    },
  });

  const handleClose = () => {
    reset({ keyName: target?.name ?? "" });
    onClose();
  };

  const onSubmit = async (values: RenameFormValues) => {
    if (!target) {
      return;
    }

    try {
      await renameMutation.mutateAsync({
        keyId: target.id,
        data: { keyName: values.keyName.trim() },
      });
      toast.success("Chave renomeada com sucesso.");
      handleClose();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel renomear a chave de seguranca.";
      toast.error(message);
    }
  };

  return (
    <Modal open={!!target} onClose={handleClose} title="Renomear chave MFA">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Nome da chave"
          placeholder="Ex: iPhone Passkey"
          error={errors.keyName?.message}
          {...register("keyName")}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={renameMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
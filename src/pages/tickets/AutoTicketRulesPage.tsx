import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap, Plus, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Input,
  Loading,
  TextArea,
  Select,
} from '@/components/ui';
import { AlertTriangle } from 'lucide-react';
import { autoTicketRulesApi } from '@/api';
import { TICKET_PRIORITY_META } from '@/utils/labels';
import type { TicketPriority } from '@/api';

interface AutoTicketRule {
  id: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  clientId: string | null;
  siteId: string | null;
  monitoringEventCode: string;
  autoCreateTicket: boolean;
  ticketTitleTemplate: string;
  ticketPriority: string;
  ticketDepartmentId: string | null;
  ticketWorkflowProfileId: string | null;
  ticketAssignedToUserId: string | null;
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AutoTicketRulesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutoTicketRule | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    monitoringEventCode: '',
    autoCreateTicket: true,
    ticketTitleTemplate: '',
    ticketPriority: 'Medium',
    ticketDepartmentId: '',
    ticketWorkflowProfileId: '',
    ticketAssignedToUserId: '',
  });

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['auto-ticket-rules'],
    queryFn: () => autoTicketRulesApi.list() as Promise<AutoTicketRule[]>,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => autoTicketRulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-ticket-rules'] });
      toast.success('Regra excluída');
    },
    onError: () => toast.error('Erro ao excluir regra'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      enable ? autoTicketRulesApi.enable(id) : autoTicketRulesApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-ticket-rules'] });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) =>
      editingId
        ? autoTicketRulesApi.update(editingId, data)
        : autoTicketRulesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-ticket-rules'] });
      toast.success(editingId ? 'Regra atualizada' : 'Regra criada');
      resetForm();
    },
    onError: () => toast.error('Erro ao salvar regra'),
  });

  const resetForm = () => {
    setEditingId(null);
    setShowCreate(false);
    setForm({
      name: '',
      description: '',
      monitoringEventCode: '',
      autoCreateTicket: true,
      ticketTitleTemplate: '',
      ticketPriority: 'Medium',
      ticketDepartmentId: '',
      ticketWorkflowProfileId: '',
      ticketAssignedToUserId: '',
    });
  };

  if (isLoading) return <Loading message="Carregando regras..." />;
  if (error) return <ErrorDisplay message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Regras de Criação Automática de Tickets</h1>
          <p className="text-muted-foreground mt-1">
            Configure regras para criar tickets automaticamente a partir de eventos de monitoramento
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={showCreate || !!editingId}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="font-medium text-warning">Recurso em elaboração</p>
          <p className="mt-1 text-muted-foreground">
            A configuração de escopo (cliente/site/departamento/perfil), simulação (dry-run) e
            estatísticas ainda serão implementadas. Por enquanto, crie/edite regras e use os botões
            de ativar/desativar normalmente.
          </p>
        </div>
      </div>

      {(showCreate || editingId) && (
        <Card>
          <CardHeader title={editingId ? 'Editar Regra' : 'Nova Regra'} />
          <div className="p-4 space-y-4">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome da regra"
            />
            <TextArea
              label="Descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição opcional"
            />
            <Input
              label="Código do Evento"
              value={form.monitoringEventCode}
              onChange={(e) => setForm({ ...form, monitoringEventCode: e.target.value })}
              placeholder="Ex: disk_space_low"
            />
            <Input
              label="Template do Título"
              value={form.ticketTitleTemplate}
              onChange={(e) => setForm({ ...form, ticketTitleTemplate: e.target.value })}
              placeholder="Ex: Alerta: {alertCode} em {agentHostname}"
            />
            <Select
              label="Prioridade"
              value={form.ticketPriority}
              onChange={(e) => setForm({ ...form, ticketPriority: e.target.value })}
              options={(['Low', 'Medium', 'High', 'Critical'] as TicketPriority[]).map((priority) => ({
                value: priority,
                label: TICKET_PRIORITY_META[priority].label,
              }))}
            />
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {rules.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma regra configurada</p>
            <p className="text-sm">Crie regras para automatizar a criação de tickets</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{rule.name}</h3>
                      <Badge color={rule.isEnabled ? 'success' : 'slate'}>
                        {rule.isEnabled ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span>Evento: <code>{rule.monitoringEventCode || '-'}</code></span>
                      {rule.matchCount > 0 && (
                        <span>Matches: {rule.matchCount}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: rule.id, enable: !rule.isEnabled })}
                      title={rule.isEnabled ? 'Desativar' : 'Ativar'}
                    >
                      {rule.isEnabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm({
                          name: rule.name,
                          description: rule.description || '',
                          monitoringEventCode: rule.monitoringEventCode || '',
                          autoCreateTicket: rule.autoCreateTicket,
                          ticketTitleTemplate: rule.ticketTitleTemplate || '',
                          ticketPriority: rule.ticketPriority || 'Medium',
                          ticketDepartmentId: rule.ticketDepartmentId || '',
                          ticketWorkflowProfileId: rule.ticketWorkflowProfileId || '',
                          ticketAssignedToUserId: rule.ticketAssignedToUserId || '',
                        });
                        setEditingId(rule.id);
                        setShowCreate(false);
                      }}
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(rule)}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir regra"
        message={
          <>
            Tem certeza que deseja excluir a regra{' '}
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => toast.success('Regra excluída.'),
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a regra.'),
            onSettled: () => setDeleteTarget(null),
          });
        }}
        onClose={() => setDeleteTarget(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

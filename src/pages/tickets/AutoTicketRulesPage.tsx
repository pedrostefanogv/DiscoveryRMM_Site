import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap, Plus, Pencil, Trash2, Play, Power, PowerOff, BarChart3 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  TextArea,
  Select,
} from '@/components/ui';
import { autoTicketRulesApi } from '@/api';

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
  if (error) return <ErrorDisplay error={error} />;

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
            >
              <option value="Low">Baixa</option>
              <option value="Medium">Média</option>
              <option value="High">Alta</option>
              <option value="Critical">Crítica</option>
            </Select>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
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
                      <Badge variant={rule.isEnabled ? 'success' : 'secondary'}>
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
                      size="icon"
                      onClick={() => toggleMutation.mutate({ id: rule.id, enable: !rule.isEnabled })}
                      title={rule.isEnabled ? 'Desativar' : 'Ativar'}
                    >
                      {rule.isEnabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
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
                      size="icon"
                      onClick={() => {
                        if (confirm('Excluir esta regra?')) deleteMutation.mutate(rule.id);
                      }}
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
    </div>
  );
}

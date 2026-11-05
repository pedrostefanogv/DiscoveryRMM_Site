import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { Badge, Button, Card, CardHeader, Icon, Input, Loading, Select } from '@/components/ui';

import { autoTicketRulesApi, clientsApi, sitesApi } from '@/api';

/**
 * Editor da POLÍTICA de auto-ticket, com herança Server -> Client -> Site.
 *
 * Este é o componente que responde "onde eu ligo isto para um cliente/site?".
 * Ele mostra três coisas que a configuração anterior (global-only) não permitia:
 *
 *  1. O valor EFETIVO após a herança.
 *  2. DE ONDE cada campo veio (Server / Client / Site / Locked) — a proveniência.
 *  3. Um kill switch por nível, que desliga só aquele escopo sem afetar irmãos.
 *
 * A tela edita UM nível por vez. Ao salvar, envia apenas os campos preenchidos,
 * de modo que o blob daquele nível guarde exatamente o que ele sobrescreve — o
 * resto continua herdando.
 */

const MODES = [
  { value: 'Off', label: 'Off — desligado' },
  { value: 'Shadow', label: 'Shadow — observa, não abre' },
  { value: 'Canary', label: 'Canary — só o escopo do canário' },
  { value: 'Active', label: 'Active — ativo' },
];

const AI_MODES = [
  { value: 'Off', label: 'Off — IA desligada' },
  { value: 'Suggest', label: 'Suggest — sugere, humano decide' },
  { value: 'AutoApply', label: 'AutoApply — aplica se confiável' },
];

const IMPACTS = ['Low', 'Medium', 'High', 'Critical'];

interface Props {
  /** Nível sendo editado. */
  level: 'Server' | 'Client' | 'Site';
  clientId?: string;
  siteId?: string;
}

export function AutoTicketPolicyEditor({ level, clientId, siteId }: Props) {
  const queryClient = useQueryClient();

  // Campos editáveis deste nível. Vazio = herda do superior.
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [neverKeys, setNeverKeys] = useState('');
  const [allowedKeys, setAllowedKeys] = useState('');

  const policyQueryKey = ['auto-ticket-policy', level, clientId ?? '', siteId ?? ''];

  const { data: policy, isLoading } = useQuery({
    queryKey: policyQueryKey,
    queryFn: () => autoTicketRulesApi.getPolicy(clientId, siteId),
  });

  // Hidrata o formulário com o que ESTE nível sobrescreve (own), não com o efetivo.
  useEffect(() => {
    if (!policy) return;
    const own = (policy.own ?? {}) as Record<string, unknown>;
    setForm(own);
    setNeverKeys(((own.neverTicketSensorKeys as string[]) ?? []).join(', '));
    setAllowedKeys(((own.allowedSensorKeys as string[]) ?? []).join(', '));
  }, [policy]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ...form };

      // Campos vazios são REMOVIDOS do blob para voltar a herdar.
      Object.keys(payload).forEach((key) => {
        const value = payload[key];
        if (value === '' || value === undefined || value === null) delete payload[key];
      });

      const parseKeys = (raw: string) =>
        raw
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);

      const never = parseKeys(neverKeys);
      const allowed = parseKeys(allowedKeys);
      if (never.length) payload.neverTicketSensorKeys = never;
      if (allowed.length) payload.allowedSensorKeys = allowed;

      if (level === 'Server') return autoTicketRulesApi.saveServerPolicy(payload);
      if (level === 'Client' && clientId)
        return autoTicketRulesApi.saveClientPolicy(clientId, payload);
      return autoTicketRulesApi.saveSitePolicy(siteId!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-ticket-policy'] });
      toast.success('Política salva');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar política'),
  });

  const effective = policy?.effective;
  const provenance = policy?.provenance ?? {};

  const levelLabel = useMemo(() => {
    if (level === 'Server') return 'Global (servidor)';
    if (level === 'Client') return 'Cliente';
    return 'Site';
  }, [level]);

  if (isLoading) return <Loading message="Carregando política..." />;

  return (
    <div className="space-y-4">
      {/* Estado efetivo + de onde veio. É o que torna o override auditável. */}
      <Card>
        <CardHeader title={`Política efetiva — ${levelLabel}`} />
        <div className="p-4 space-y-3">
          {effective ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge color={effective.enabled ? 'success' : 'slate'}>
                  {effective.enabled ? 'Habilitado' : 'Desabilitado'}
                </Badge>
                <Badge color="slate">{effective.mode}</Badge>
                {effective.disabledByLevel && (
                  <span className="text-sm text-warning">
                    Desligado no nível: <strong>{effective.disabledByLevel}</strong>
                  </span>
                )}
              </div>

              {!effective.enabled && (
                <p className="text-sm text-muted-foreground">
                  Nenhum chamado automático é criado neste escopo. O motivo é registrado em cada
                  avaliação, citando o nível que desligou.
                </p>
              )}

              <ProvenanceTable
                provenance={provenance}
                rows={[
                  ['enabled', 'Habilitado', String(effective.enabled)],
                  ['mode', 'Modo', effective.mode],
                  ['minConsecutiveFailures', 'Falhas mínimas', String(effective.minConsecutiveFailures)],
                  ['minDurationSeconds', 'Duração mínima (s)', String(effective.minDurationSeconds)],
                  ['suppressWhenHostNotReachable', 'Suprime se host inacessível', String(effective.suppressWhenHostNotReachable)],
                  ['dedupWindowMinutes', 'Janela de dedup (min)', String(effective.dedupWindowMinutes)],
                  ['dedupWindowMaxHours', 'Teto da janela (h)', String(effective.dedupWindowMaxHours)],
                  ['maxCreatedTicketsPerHourPerAlertCode', 'Teto por hora', String(effective.maxCreatedTicketsPerHourPerAlertCode)],
                  ['incrementOccurrenceCounter', 'Conta ocorrências', String(effective.incrementOccurrenceCounter)],
                  ['aiMode', 'IA', effective.aiMode],
                  ['aiAllowEquipmentContext', 'IA pode receber contexto do ativo', String(effective.aiAllowEquipmentContext)],
                ]}
              />

              {effective.neverTicketSensorKeys.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Sensores que <strong>nunca</strong> abrem chamado:{' '}
                  <code>{effective.neverTicketSensorKeys.join(', ')}</code>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sem política resolvida.</p>
          )}
        </div>
      </Card>

      {/* Edição do nível selecionado. Campos vazios voltam a herdar. */}
      <Card>
        <CardHeader title={`Sobrescrever no nível: ${levelLabel}`} />
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Deixe um campo vazio para <strong>herdar</strong> do nível superior. Preencher
            sobrescreve apenas neste nível.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Habilitado"
              value={form.enabled === undefined ? '' : String(form.enabled)}
              onChange={(e) =>
                setForm({ ...form, enabled: e.target.value === '' ? undefined : e.target.value === 'true' })
              }
              options={[
                { value: '', label: '(herdar)' },
                { value: 'true', label: 'Sim — avaliar e criar' },
                { value: 'false', label: 'Não — desligar neste escopo' },
              ]}
            />
            <Select
              label="Modo"
              value={(form.mode as string) ?? ''}
              onChange={(e) => setForm({ ...form, mode: e.target.value || undefined })}
              options={[{ value: '', label: '(herdar)' }, ...MODES]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Falhas consecutivas mínimas"
              type="number"
              value={form.minConsecutiveFailures === undefined ? '' : String(form.minConsecutiveFailures)}
              onChange={(e) =>
                setForm({
                  ...form,
                  minConsecutiveFailures: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="(herdar)"
            />
            <Input
              label="Duração mínima em falha (segundos)"
              type="number"
              value={form.minDurationSeconds === undefined ? '' : String(form.minDurationSeconds)}
              onChange={(e) =>
                setForm({
                  ...form,
                  minDurationSeconds: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="(herdar)"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Janela de deduplicação (minutos)"
              type="number"
              value={form.dedupWindowMinutes === undefined ? '' : String(form.dedupWindowMinutes)}
              onChange={(e) =>
                setForm({
                  ...form,
                  dedupWindowMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="(herdar)"
            />
            <Input
              label="Teto de chamados por hora (por alerta)"
              type="number"
              value={
                form.maxCreatedTicketsPerHourPerAlertCode === undefined
                  ? ''
                  : String(form.maxCreatedTicketsPerHourPerAlertCode)
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  maxCreatedTicketsPerHourPerAlertCode:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="(herdar) · 0 = sem limite"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Sensores SEMPRE permitidos (separados por vírgula)"
              value={allowedKeys}
              onChange={(e) => setAllowedKeys(e.target.value)}
              placeholder="disk_space, service · vazio = todos"
            />
            <Input
              label="Sensores que NUNCA abrem (vence a lista acima)"
              value={neverKeys}
              onChange={(e) => setNeverKeys(e.target.value)}
              placeholder="cpu, memory, dns_latency"
            />
          </div>

          {/* IA: o envio de contexto do equipamento é plugável por nível. */}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="IA"
              value={(form.aiMode as string) ?? ''}
              onChange={(e) => setForm({ ...form, aiMode: e.target.value || undefined })}
              options={[{ value: '', label: '(herdar)' }, ...AI_MODES]}
            />
            <Select
              label="IA pode receber contexto do equipamento"
              value={form.aiAllowEquipmentContext === undefined ? '' : String(form.aiAllowEquipmentContext)}
              onChange={(e) =>
                setForm({
                  ...form,
                  aiAllowEquipmentContext:
                    e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              options={[
                { value: '', label: '(herdar)' },
                { value: 'true', label: 'Sim — envia SO, sensor, métricas' },
                { value: 'false', label: 'Não — só o evento, sem o ativo' },
              ]}
            />
          </div>

          <Select
            label="Impacto mínimo para escalar"
            value={(form.minImpactToEscalate as string) ?? ''}
            onChange={(e) => setForm({ ...form, minImpactToEscalate: e.target.value || undefined })}
            options={[{ value: '', label: '(herdar)' }, ...IMPACTS.map((i) => ({ value: i, label: i }))]}
          />

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar política deste nível'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setForm({});
                setNeverKeys('');
                setAllowedKeys('');
              }}
            >
              Limpar (voltar a herdar tudo)
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Mostra o valor efetivo e o nível que o decidiu. Sem isto, um override
 * distante vira um mistério ("por que este site não abre?").
 */
function ProvenanceTable({
  provenance,
  rows,
}: {
  provenance: Record<string, string>;
  rows: [string, string, string][];
}) {
  // Cores VÁLIDAS do Badge: primary | success | warning | danger | slate | accent.
  // O tipo é declarado explicitamente (em vez de um cast) para o compilador
  // acusar se alguém usar uma cor inexistente — antes isto estava como 'info',
  // que não existe, escondido atrás de um "as never".
  type BadgeColor = 'primary' | 'success' | 'warning' | 'danger' | 'slate' | 'accent';

  const levelColor = (source: string): BadgeColor => {
    if (source === 'Server') return 'slate';
    if (source === 'Client') return 'primary';
    if (source === 'Site') return 'warning';
    if (source === 'Locked') return 'danger';
    return 'slate';
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Campo</th>
            <th className="px-3 py-2 text-left font-medium">Valor efetivo</th>
            <th className="px-3 py-2 text-left font-medium">Veio de</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label, value]) => {
            const source = provenance[key] ?? 'Default';
            return (
              <tr key={key} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{label}</td>
                <td className="px-3 py-2 font-mono text-xs">{value}</td>
                <td className="px-3 py-2">
                  <Badge color={levelColor(source)}>{source}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Seletor de escopo: escolhe o cliente (e opcionalmente o site) e renderiza o
 * editor para aquele nível. É a peça que faltava para "ligar por cliente/site".
 */
export function AutoTicketScopeSelector() {
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'auto-ticket-policy'],
    queryFn: () => clientsApi.list(),
  });

  const { data: sites = [] } = useQuery({
    queryKey: ['sites', 'auto-ticket-policy', clientId],
    queryFn: () => sitesApi.list(clientId),
    enabled: !!clientId,
  });

  const level: 'Server' | 'Client' | 'Site' = siteId
    ? 'Site'
    : clientId
      ? 'Client'
      : 'Server';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Escopo" />
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            A política é herdada: <strong>Global → Cliente → Site</strong>. Deixe ambos vazios para
            editar o global.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Cliente"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setSiteId('');
              }}
              options={[
                { value: '', label: '(global — sem cliente)' },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              label="Site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              options={[
                { value: '', label: '(todo o cliente)' },
                ...sites.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
        </div>
      </Card>

      <AutoTicketPolicyEditor
        level={level}
        clientId={clientId || undefined}
        siteId={siteId || undefined}
      />

      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div>
          <p className="font-medium">Como desligar um escopo</p>
          <p className="mt-1 text-muted-foreground">
            Selecione o cliente (ou site) e marque <strong>Habilitado = Não</strong>. Isso desliga
            apenas aquele escopo; os clientes irmãos continuam funcionando normalmente. O motivo
            fica registrado em cada avaliação, citando o nível que desligou.
          </p>
        </div>
      </div>
    </div>
  );
}

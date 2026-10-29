import { formatDate } from '@/utils/format';
import { Link } from "react-router-dom";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Loading,
  PageHeader,
} from '@/components/ui';
import { agentUpdatesApi } from '@/api';

interface Release {
  id: string;
  version: string;
  channel: string;
  releaseNotes: string | null;
  isPromoted: boolean;
  artifactCount: number;
  publishedAt: string | null;
  createdAt: string;
}

interface RolloutStats {
  totalAgents: number;
  updatedAgents: number;
  pendingAgents: number;
  failedAgents: number;
  currentVersion: string | null;
  latestVersion: string | null;
}

export default function AgentUpdatesPage() {
  const [syncLoading, setSyncLoading] = useState(false);

  const { data: releases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['agent-updates-releases'],
    queryFn: () => agentUpdatesApi.listReleases() as Promise<Release[]>,
  });

  const { data: rollout } = useQuery({
    queryKey: ['agent-updates-rollout'],
    queryFn: () => agentUpdatesApi.getRolloutDashboard() as Promise<RolloutStats>,
  });

  const handleSyncRepository = async () => {
    setSyncLoading(true);
    try {
      await agentUpdatesApi.syncRepository();
      toast.success('Repositório sincronizado');
      refetch();
    } catch {
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncAndBuild = async () => {
    setSyncLoading(true);
    try {
      await agentUpdatesApi.syncAndBuild();
      toast.success('Sincronização e build iniciados');
      refetch();
    } catch {
      toast.error('Erro ao sincronizar e buildar');
    } finally {
      setSyncLoading(false);
    }
  };

  if (isLoading) return <Loading message="Carregando releases..." />;
  if (error) return <ErrorDisplay message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atualizações de Agentes"
        description="Gerencie releases e acompanhe o rollout de atualizações dos agentes"
        breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      >
        <Button variant="secondary" onClick={handleSyncRepository} disabled={syncLoading}>
          <Icon name="refresh" className={`w-4 h-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
          Sincronizar
        </Button>
        <Button onClick={handleSyncAndBuild} disabled={syncLoading}>
          <Icon name="rocket_launch" className="w-4 h-4 mr-2" />
          Sync + Build
        </Button>
      </PageHeader>

      {rollout && (
        <Card>
          <CardHeader title="Dashboard de Rollout" />
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{rollout.totalAgents}</div>
              <div className="text-sm text-muted-foreground">Total Agentes</div>
            </div>
            <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-center">
              <div className="text-2xl font-bold text-success">{rollout.updatedAgents}</div>
              <div className="text-sm text-muted-foreground">Atualizados</div>
            </div>
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-center">
              <div className="text-2xl font-bold text-warning">{rollout.pendingAgents}</div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
            </div>
            <div className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-center">
              <div className="text-2xl font-bold text-danger">{rollout.failedAgents}</div>
              <div className="text-sm text-muted-foreground">Falhas</div>
            </div>
          </div>
          {rollout.currentVersion && (
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              Versão atual mais comum: <Badge color="slate">{rollout.currentVersion}</Badge>
              {rollout.latestVersion && rollout.latestVersion !== rollout.currentVersion && (
                <> | Última: <Badge color="success">{rollout.latestVersion}</Badge></>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Releases" />
        {releases.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Icon name="inventory_2" className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma release disponível</p>
            <p className="text-sm">Sincronize o repositório para obter releases</p>
          </div>
        ) : (
          <div className="divide-y">
            {releases.map((release) => (
              <div key={release.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{release.version}</span>
                    <Badge color={release.isPromoted ? 'success' : 'slate'}>
                      {release.isPromoted ? 'Promovida' : release.channel || 'Dev'}
                    </Badge>
                  </div>
                  {release.releaseNotes && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {release.releaseNotes}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {release.artifactCount} artefato(s) •{' '}
                    {release.publishedAt
                      ? formatDate(release.publishedAt)
                      : formatDate(release.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!release.isPromoted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await agentUpdatesApi.promoteRelease(release.id);
                          toast.success('Release promovida');
                          refetch();
                        } catch {
                          toast.error('Erro ao promover');
                        }
                      }}
                    >
                      <Icon name="rocket_launch" className="w-4 h-4 mr-1" />
                      Promover
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

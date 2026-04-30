import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Package, Upload, RefreshCw, Rocket, Play, Download, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Select,
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
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atualizações de Agentes</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie releases e acompanhe o rollout de atualizações dos agentes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncRepository} disabled={syncLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
          <Button onClick={handleSyncAndBuild} disabled={syncLoading}>
            <Rocket className="w-4 h-4 mr-2" />
            Sync + Build
          </Button>
        </div>
      </div>

      {rollout && (
        <Card>
          <CardHeader title="Dashboard de Rollout" />
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{rollout.totalAgents}</div>
              <div className="text-sm text-muted-foreground">Total Agentes</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{rollout.updatedAgents}</div>
              <div className="text-sm text-green-600">Atualizados</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-700">{rollout.pendingAgents}</div>
              <div className="text-sm text-yellow-600">Pendentes</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-700">{rollout.failedAgents}</div>
              <div className="text-sm text-red-600">Falhas</div>
            </div>
          </div>
          {rollout.currentVersion && (
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              Versão atual mais comum: <Badge variant="outline">{rollout.currentVersion}</Badge>
              {rollout.latestVersion && rollout.latestVersion !== rollout.currentVersion && (
                <> | Última: <Badge variant="success">{rollout.latestVersion}</Badge></>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Releases" />
        {releases.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
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
                    <Badge variant={release.isPromoted ? 'success' : 'secondary'}>
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
                      ? new Date(release.publishedAt).toLocaleDateString('pt-BR')
                      : new Date(release.createdAt).toLocaleDateString('pt-BR')}
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
                      <Rocket className="w-4 h-4 mr-1" />
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

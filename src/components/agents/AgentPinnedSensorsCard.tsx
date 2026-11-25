import { Badge, Button, Card, CardHeader, Icon } from "@/components/ui";
import type { SensorItem } from "@/api";
import SensorSparkline from "./SensorSparkline";
import SensorStatusBadge from "./SensorStatusBadge";
import {
  formatSensorChannelValue,
  isSensorMuted,
  sensorSparklineValues,
} from "./sensorUtils";

interface AgentPinnedSensorsCardProps {
  items: SensorItem[];
  onViewAll: () => void;
}

/**
 * Resumo dos sensores fixados (`isPinned`) na aba "Visão Geral" do agente.
 * Quando nenhum sensor está fixado, não renderiza nada para manter o layout limpo.
 */
export function AgentPinnedSensorsCard({
  items,
  onViewAll,
}: AgentPinnedSensorsCardProps) {
  const pinned = items.filter((item) => item.isPinned);
  if (pinned.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Sensores fixados"
        subtitle={`${pinned.length} sensor(es) em destaque`}
        action={
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            Ver todos
            <Icon name="arrow_forward" className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pinned.map((sensor) => {
          const channel = sensor.channels.find((c) => c.key === sensor.primaryChannel);
          const unit = channel?.unit ?? sensor.thresholdUnit;
          const value = formatSensorChannelValue(
            sensor.primaryChannel ?? channel?.key,
            sensor.primaryValue,
            unit,
          );
          const sparkline = sensorSparklineValues(sensor);
          const muted = isSensorMuted(sensor.mutedUntil);

          return (
            <div
              key={`${sensor.sensorId}:${sensor.targetKey}`}
              className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-surface-light px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={sensor.name}>
                    {sensor.name}
                  </p>
                  {sensor.target ? (
                    <p className="truncate text-[11px] text-muted" title={sensor.target}>
                      {sensor.target}
                    </p>
                  ) : null}
                </div>
                <SensorStatusBadge status={sensor.status} isStale={sensor.isStale} dotOnly />
              </div>

              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold tabular-nums text-foreground">
                    {value}
                  </p>
                  {muted ? (
                    <Badge color="slate" className="mt-1">
                      Silenciado
                    </Badge>
                  ) : null}
                </div>
                <SensorSparkline
                  values={sparkline}
                  status={sensor.status}
                  isStale={sensor.isStale}
                  width={68}
                  height={20}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppApprovalScopeType } from "@/api/types";
import type { SensorItem } from "@/api";
import { AgentPinnedSensorsCard } from "./AgentPinnedSensorsCard";

function makeSensor(over: Partial<SensorItem> = {}): SensorItem {
  return {
    sensorId: "s1",
    key: "disco-c",
    name: "Disco C:",
    description: null,
    sensorType: "DiskSpace",
    target: "C:",
    targetKey: "C:",
    scopeType: AppApprovalScopeType.Agent,
    isInherited: false,
    sourceScope: null,
    warningThreshold: 15,
    criticalThreshold: 10,
    thresholdUnit: "Percent",
    comparison: "LowerIsWorse",
    channels: [
      { key: "free_percent", label: "Livre", unit: "Percent", display: "chart", isPrimary: true },
    ],
    currentChannels: { free_percent: 45 },
    primaryChannel: "free_percent",
    primaryValue: 45,
    sparkline: { free_percent: [50, 48, 45] },
    status: "Passing",
    severity: null,
    message: null,
    isStale: false,
    exitCode: null,
    durationMs: 10,
    outputExcerpt: null,
    consecutiveFailures: 0,
    totalRuns: 5,
    totalFailures: 0,
    lastRunAt: "2026-11-25T12:00:00Z",
    lastStatusChangedAt: null,
    lastAlertedAt: null,
    intervalSeconds: 300,
    timeoutSeconds: 10,
    failsBeforeAlert: 2,
    autoTicketPolicy: "OnEscalation",
    autoTicketMinDurationSeconds: 0,
    autoTicketImpact: "Medium",
    minSeverityToAlert: "Warning",
    scriptId: null,
    scriptName: null,
    chartJson: null,
    optionsJson: null,
    displayOrder: 0,
    isPinned: false,
    ...over,
  };
}

afterEach(() => cleanup());

describe("AgentPinnedSensorsCard", () => {
  it("não renderiza nada quando nenhum sensor está fixado", () => {
    const { container } = render(
      <AgentPinnedSensorsCard items={[makeSensor({ isPinned: false })]} onViewAll={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("exibe apenas os sensores fixados e aciona Ver todos", () => {
    const onViewAll = vi.fn();
    render(
      <AgentPinnedSensorsCard
        items={[
          makeSensor({ sensorId: "s1", name: "Disco C:", isPinned: true, primaryValue: 45 }),
          makeSensor({ sensorId: "s2", name: "CPU", isPinned: false, primaryValue: 12 }),
        ]}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.getByText("Sensores fixados")).toBeTruthy();
    expect(screen.getByText("Disco C:")).toBeTruthy();
    expect(screen.getByText("45%")).toBeTruthy();
    expect(screen.queryByText("CPU")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Ver todos/ }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});

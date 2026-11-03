import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import SensorStatusBadge from "./SensorStatusBadge";

function renderBadge(props: Partial<ComponentProps<typeof SensorStatusBadge>> = {}) {
  return render(<SensorStatusBadge status="Passing" {...props} />);
}

afterEach(() => cleanup());

describe("SensorStatusBadge", () => {
  it("traduz Passing para OK com ponto verde", () => {
    const { container } = renderBadge({ status: "Passing" });

    expect(screen.getByText("OK")).toBeTruthy();
    expect(container.querySelector(".bg-success")).toBeTruthy();
  });

  it("traduz Warning para Atenção com ponto amarelo", () => {
    const { container } = renderBadge({ status: "Warning" });

    expect(screen.getByText("Atenção")).toBeTruthy();
    expect(container.querySelector(".bg-warning")).toBeTruthy();
  });

  it("traduz Failing para Crítico com ponto vermelho", () => {
    const { container } = renderBadge({ status: "Failing" });

    expect(screen.getByText("Crítico")).toBeTruthy();
    expect(container.querySelector(".bg-danger")).toBeTruthy();
  });

  it("traduz Unknown para Sem dados e Pending para Aguardando", () => {
    renderBadge({ status: "Unknown" });
    expect(screen.getByText("Sem dados")).toBeTruthy();
    cleanup();

    renderBadge({ status: "Pending" });
    expect(screen.getByText("Aguardando")).toBeTruthy();
  });

  it("mostra Sem dados recentes quando a coleta está atrasada", () => {
    renderBadge({ status: "Passing", isStale: true });

    expect(screen.getByText("Sem dados recentes")).toBeTruthy();
    expect(screen.queryByText("OK")).toBeNull();
  });

  it("não esconde um Crítico que parou de coletar", () => {
    renderBadge({ status: "Failing", isStale: true });

    expect(screen.getByText("Crítico")).toBeTruthy();
  });

  it("dotOnly mostra só o ponto, com o rótulo acessível", () => {
    renderBadge({ status: "Failing", dotOnly: true });

    expect(screen.queryByText("Crítico")).toBeNull();
    expect(screen.getByLabelText("Estado: Crítico")).toBeTruthy();
  });
});

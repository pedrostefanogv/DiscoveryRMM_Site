import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SensorSparkline from "./SensorSparkline";

afterEach(() => cleanup());

describe("SensorSparkline", () => {
  it("não renderiza nada com menos de 2 pontos", () => {
    const empty = render(<SensorSparkline values={[]} />);
    expect(empty.container.firstChild).toBeNull();
    cleanup();

    const single = render(<SensorSparkline values={[42]} />);
    expect(single.container.firstChild).toBeNull();
  });

  it("ignora amostras não numéricas e cai no null quando sobra só uma", () => {
    const { container } = render(<SensorSparkline values={[1, Number.NaN]} />);

    expect(container.firstChild).toBeNull();
  });

  it("desenha a polyline com uma coordenada por amostra", () => {
    const { container } = render(
      <SensorSparkline values={[10, 20, 15, 30]} width={60} height={20} title="Tendência" />,
    );
    const polyline = container.querySelector("polyline");

    expect(polyline).toBeTruthy();
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(4);
  });

  it("colore o traço pelo status do sensor", () => {
    const { container } = render(<SensorSparkline values={[1, 2]} status="Failing" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-danger");
    cleanup();

    const passing = render(<SensorSparkline values={[1, 2]} status="Passing" />);
    expect(passing.container.querySelector("svg")?.getAttribute("class")).toContain("text-success");
  });

  it("usa cor neutra quando a coleta está atrasada", () => {
    const { container } = render(<SensorSparkline values={[1, 2]} status="Failing" isStale />);

    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-muted");
  });

  it("série constante (todos os valores iguais) não quebra o cálculo", () => {
    const { container } = render(<SensorSparkline values={[5, 5, 5]} />);

    expect(container.querySelector("polyline")?.getAttribute("points")).toBeTruthy();
  });
});

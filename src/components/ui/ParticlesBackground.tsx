import { useMemo } from "react";
import Particles, { ParticlesProvider, useParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useTheme, type ThemeMode } from "@/theme/ThemeContext";

/**
 * Ajustes do efeito de partículas por tema.
 *
 * No tema escuro o branco em opacidade baixa já aparece porque o contraste
 * contra o fundo quase preto é alto. Sobre o fundo claro esses mesmos valores
 * praticamente desapareciam (linhas com ~5% de alfa efetivo). Por isso o tema
 * claro usa um tom slate/indigo escuro com opacidades e espessura maiores,
 * preservando o mesmo desenho de "constelação" nos dois temas.
 */
const particlesByMode: Record<
  ThemeMode,
  {
    particleColor: string;
    particleOpacity: number;
    particleSize: { min: number; max: number };
    linkColor: string;
    linkOpacity: number;
    linkWidth: number;
  }
> = {
  dark: {
    particleColor: "#ffffff",
    particleOpacity: 0.35,
    particleSize: { min: 0.8, max: 3 },
    linkColor: "#ffffff",
    linkOpacity: 0.22,
    linkWidth: 0.7,
  },
  light: {
    particleColor: "#1e293b",
    particleOpacity: 0.5,
    particleSize: { min: 1, max: 3.2 },
    linkColor: "#334155",
    linkOpacity: 0.4,
    linkWidth: 0.9,
  },
};

function ParticlesAnimation() {
  const { mode } = useTheme();

  const options: ISourceOptions = useMemo(() => {
    const theme = particlesByMode[mode] ?? particlesByMode.dark;

    return {
      particles: {
        number: { value: 100, density: { enable: true } },
        color: { value: theme.particleColor },
        shape: { type: "circle" },
        opacity: { value: theme.particleOpacity, animation: { enable: false } },
        size: { value: theme.particleSize, animation: { enable: false } },
        links: {
          enable: true,
          distance: 130,
          color: theme.linkColor,
          opacity: theme.linkOpacity,
          width: theme.linkWidth,
        },
        move: {
          enable: true,
          speed: 0.5,
          direction: "none",
          random: false,
          straight: false,
          outModes: { default: "out" },
          attract: { enable: false },
        },
      },
      interactivity: {
        detectsOn: "canvas",
        events: {
          onHover: { enable: false },
          onClick: { enable: true, mode: "push" },
          resize: { enable: true },
        },
        modes: { push: { quantity: 4 } },
      },
      detectRetina: true,
    };
  }, [mode]);

  const { loaded } = useParticlesProvider();

  if (!loaded) return null;

  return (
    <Particles
      id="auth-particles"
      className="absolute inset-0"
      options={options}
    />
  );
}

export function ParticlesBackground() {
  return (
    <ParticlesProvider init={async (engine) => {
      await loadSlim(engine);
    }}>
      <ParticlesAnimation />
    </ParticlesProvider>
  );
}

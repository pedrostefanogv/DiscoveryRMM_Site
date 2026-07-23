import { useMemo } from "react";
import Particles, { ParticlesProvider, useParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useTheme } from "@/theme/ThemeContext";

function ParticlesAnimation() {
  const { mode } = useTheme();

  // Cor dinâmica dos particles conforme o tema
  const particleColor = mode === 'dark' ? '#ffffff' : '#334155';
  const linkColor = mode === 'dark' ? '#ffffff' : '#64748b';

  const options: ISourceOptions = useMemo(() => ({
    particles: {
      number: { value: 100, density: { enable: true } },
      color: { value: particleColor },
      shape: { type: "circle" },
      opacity: { value: 0.35, animation: { enable: false } },
      size: { value: { min: 0.8, max: 3 }, animation: { enable: false } },
      links: {
        enable: true,
        distance: 130,
        color: linkColor,
        opacity: mode === 'dark' ? 0.22 : 0.15,
        width: 0.7,
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
  }), [particleColor, linkColor, mode]);

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

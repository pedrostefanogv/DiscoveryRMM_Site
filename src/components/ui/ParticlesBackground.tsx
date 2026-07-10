import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useTheme } from "@/theme/ThemeContext";

export function ParticlesBackground() {
  const [ready, setReady] = useState(false);
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

  useEffect(() => {
    let cancelled = false;

    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <Particles
      id="auth-particles"
      className="absolute inset-0"
      options={options}
    />
  );
}

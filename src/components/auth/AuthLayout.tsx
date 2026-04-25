import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTheme } from "@/theme/ThemeContext";

export function AuthLayout() {
  const { branding } = useTheme();

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.18),transparent_36%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Autenticação centralizada do Discovery
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              {branding.appName}
            </h1>
            <p className="max-w-lg text-base leading-7 text-slate-300 lg:text-lg">
              Sessão segura com primeiro acesso guiado e verificação em duas etapas quando necessário.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Login com senha e verificação adicional quando necessário
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Primeiro acesso orientado para atualização de dados
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Verificação em duas etapas para proteger sua conta
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              Sessão mantida com continuidade e segurança
            </div>
          </div>
        </div>

        <div className="w-full max-w-lg">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
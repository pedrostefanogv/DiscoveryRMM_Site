import React from "react";
import { useTheme } from "@/theme/ThemeContext";
import { Icon } from "@/components/ui/Icon";

interface PublicPortalLayoutProps {
  brandName?: string | null;
  logoUrl?: string | null;
  subtitle?: string;
  children: React.ReactNode;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export function PublicPortalLayout({ brandName, logoUrl, subtitle, children }: PublicPortalLayoutProps) {
  const { mode, toggleMode } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName || "Logo"} className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Icon name="folder" size={20} />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-base truncate">{brandName || "Discovery RMM"}</div>
              {subtitle && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</div>}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={mode === "dark" ? "Modo claro" : "Modo escuro"}
            aria-label="Alternar tema"
          >
            <Icon name={mode === "dark" ? "light_mode" : "dark_mode"} size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        Portal seguro de transferência de arquivos • {brandName || "Discovery RMM"}
      </footer>
    </div>
  );
}

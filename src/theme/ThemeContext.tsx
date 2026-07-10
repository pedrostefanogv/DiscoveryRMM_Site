import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';

export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  headerColor: string;
}

export type ThemeMode = 'light' | 'dark';

const defaultBranding: BrandingConfig = {
  appName: 'Discovery RMM',
  logoUrl: null,
  primaryColor: '#6366f1',
  accentColor: '#06b6d4',
  sidebarColor: '#0f172a',
  headerColor: '#1e293b',
};

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
  branding: BrandingConfig;
  updateBranding: (patch: Partial<BrandingConfig>) => void;
  resetBranding: () => void;
}

const BRANDING_STORAGE_KEY = 'discovery-rmm-branding';
const THEME_MODE_STORAGE_KEY = 'discovery-rmm-theme-mode';

function loadBranding(): BrandingConfig {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (raw) return { ...defaultBranding, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultBranding;
}

function saveBranding(b: BrandingConfig) {
  localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(b));
}

function applyCSSVars(b: BrandingConfig, mode: ThemeMode) {
  const root = document.documentElement;
  root.style.setProperty('--color-accent', b.accentColor);

  // Em light mode, usa azul profissional em vez do indigo/roxo do branding.
  // Em dark mode, mantém a cor de branding original.
  if (mode === 'dark') {
    root.style.setProperty('--color-primary', b.primaryColor);
    root.style.setProperty('--color-sidebar', b.sidebarColor);
    root.style.setProperty('--color-header', b.headerColor);
  } else {
    root.style.setProperty('--color-primary', '#3b82f6');
    root.style.removeProperty('--color-sidebar');
    root.style.removeProperty('--color-header');
  }
}

function loadThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }

  // Fallback: respeita preferência do sistema
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'dark'; // default: dark (comportamento original)
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(loadBranding);
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode);

  // Aplica branding
  useEffect(() => {
    saveBranding(branding);
    applyCSSVars(branding, mode);
    document.title = branding.appName;
  }, [branding, mode]);

  // Aplica modo claro/escuro
  useEffect(() => {
    applyThemeMode(mode);
    applyCSSVars(branding, mode);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  }, [mode, branding]);

  // Escuta mudanças de prefers-color-scheme (se o usuário não escolheu manualmente)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Só muda automaticamente se não houver preferência explícita salva
      const hasStoredPreference = localStorage.getItem(THEME_MODE_STORAGE_KEY);
      if (!hasStoredPreference) {
        setModeState(e.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
  }, []);

  const updateBranding = useCallback((patch: Partial<BrandingConfig>) => {
    setBranding(prev => ({ ...prev, ...patch }));
  }, []);

  const resetBranding = useCallback(() => setBranding(defaultBranding), []);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, setMode, branding, updateBranding, resetBranding }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

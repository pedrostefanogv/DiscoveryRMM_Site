import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { darken } from './color';

export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  headerColor: string;
}

export type ThemeMode = 'light' | 'dark';

// Paleta alinhada ao ícone do produto: base indigo + destaque magenta/pink.
const defaultBranding: BrandingConfig = {
  appName: 'Discovery RMM',
  logoUrl: null,
  primaryColor: '#6366f1', // indigo-500
  accentColor: '#ec4899',  // pink-500
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
export const THEME_MODE_STORAGE_KEY = 'discovery-rmm-theme-mode';

function loadBranding(): BrandingConfig {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (raw) return { ...defaultBranding, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultBranding;
}

function saveBranding(b: BrandingConfig) {
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(b));
  } catch { /* ignore */ }
}

function applyCSSVars(b: BrandingConfig, mode: ThemeMode) {
  const root = document.documentElement;

  // A cor de branding é a referência. No tema claro aplicamos uma variação mais
  // escura (contraste sobre fundos claros); no escuro usamos a cor como escolhida.
  root.style.setProperty(
    '--color-primary',
    mode === 'dark' ? b.primaryColor : darken(b.primaryColor, 0.18),
  );
  root.style.setProperty(
    '--color-accent',
    mode === 'dark' ? b.accentColor : darken(b.accentColor, 0.18),
  );

  if (mode === 'dark') {
    root.style.setProperty('--color-sidebar', b.sidebarColor);
    root.style.setProperty('--color-header', b.headerColor);
  } else {
    root.style.removeProperty('--color-sidebar');
    root.style.removeProperty('--color-header');
  }
}

function readStoredThemeMode(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return null;
}

function saveThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

function loadThemeMode(): ThemeMode {
  const stored = readStoredThemeMode();
  if (stored) return stored;

  // Fallback: respeita preferência do sistema (alinhado ao script inline de index.html)
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { /* ignore */ }
  }

  return 'dark'; // default: dark quando matchMedia indisponível
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
    document.title = branding.appName;
  }, [branding]);

  // Aplica modo claro/escuro e variáveis CSS de branding
  useEffect(() => {
    applyThemeMode(mode);
    applyCSSVars(branding, mode);
  }, [mode, branding]);

  // Escuta mudanças de prefers-color-scheme (se o usuário não escolheu manualmente)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const handleChange = (e: MediaQueryListEvent) => {
      // Só muda automaticamente se não houver preferência explícita válida salva
      if (!readStoredThemeMode()) {
        setModeState(e.matches ? 'dark' : 'light');
      }
    };
    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handleChange);
        }
      };
    } else if (mql && typeof mql.addListener === 'function') {
      mql.addListener(handleChange);
      return () => {
        if (typeof mql.removeListener === 'function') {
          mql.removeListener(handleChange);
        }
      };
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveThemeMode(next);
      return next;
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    saveThemeMode(newMode);
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

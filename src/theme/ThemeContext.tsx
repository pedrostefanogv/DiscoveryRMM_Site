import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string;
  headerColor: string;
}

const defaultBranding: BrandingConfig = {
  appName: 'Meduza RMM',
  logoUrl: null,
  primaryColor: '#6366f1',
  accentColor: '#06b6d4',
  sidebarColor: '#0f172a',
  headerColor: '#1e293b',
};

interface ThemeContextValue {
  branding: BrandingConfig;
  updateBranding: (patch: Partial<BrandingConfig>) => void;
  resetBranding: () => void;
}

const STORAGE_KEY = 'meduza-branding';

function loadBranding(): BrandingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultBranding, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultBranding;
}

function saveBranding(b: BrandingConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

function applyCSSVars(b: BrandingConfig) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', b.primaryColor);
  root.style.setProperty('--color-accent', b.accentColor);
  root.style.setProperty('--color-sidebar', b.sidebarColor);
  root.style.setProperty('--color-header', b.headerColor);
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(loadBranding);

  useEffect(() => {
    saveBranding(branding);
    applyCSSVars(branding);
  }, [branding]);

  const updateBranding = (patch: Partial<BrandingConfig>) =>
    setBranding(prev => ({ ...prev, ...patch }));

  const resetBranding = () => setBranding(defaultBranding);

  return (
    <ThemeContext.Provider value={{ branding, updateBranding, resetBranding }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

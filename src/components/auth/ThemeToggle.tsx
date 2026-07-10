import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Botão toggle para alternar entre tema claro e escuro.
 * Persiste a escolha via ThemeContext (localStorage + classe .dark no <html>).
 */
export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-light text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      aria-label={mode === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={mode === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

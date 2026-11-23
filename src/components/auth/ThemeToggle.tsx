
import { useTheme } from '@/theme/ThemeContext';
import { Icon } from "@/components/ui";

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
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface-light text-muted-foreground transition-colors hover:bg-surface-hover sm:h-9 sm:w-9 hover:text-foreground"
      aria-label={mode === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={mode === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {mode === 'dark' ? <Icon name="light_mode" className="h-4 w-4" /> : <Icon name="dark_mode" className="h-4 w-4" />}
    </button>
  );
}

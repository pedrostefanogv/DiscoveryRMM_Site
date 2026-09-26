import { useEffect, useState } from 'react';

/**
 * Valor "atrasado": só muda depois que o usuário para de digitar por
 * `delayMs`. Evita disparar uma busca a cada caractere.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

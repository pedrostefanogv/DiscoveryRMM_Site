import { useEffect, useState } from 'react';

/**
 * Observa uma media query CSS e devolve se ela casa AGORA (com reavaliação em
 * resize/rotação de tela).
 *
 * Existe porque o app resolve a maioria dos layouts responsivos só com classes
 * do Tailwind (`sm:`, `lg:`), o que é o caminho preferido. Este hook é para o
 * caso em que a ÁRVORE precisa mudar (não só o estilo): renderizar uma tabela no
 * desktop e uma lista de cartões no mobile, em vez de montar as duas e esconder
 * uma — o que duplicaria linhas, ids e listeners.
 *
 * SSR/primeiro render: sem `matchMedia` devolve `defaultValue`.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return defaultValue;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Revalida ao montar/trocar a query: o estado inicial pode ter sido
    // calculado antes de a viewport atual valer (ou com o defaultValue).
    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Breakpoint `sm` do Tailwind (640px) visto de baixo. */
export const BELOW_SM_QUERY = '(max-width: 639px)';

/** True em telas menores que `sm` — onde tabelas largas viram listas de cartões. */
export function useIsBelowSm(): boolean {
  return useMediaQuery(BELOW_SM_QUERY, false);
}

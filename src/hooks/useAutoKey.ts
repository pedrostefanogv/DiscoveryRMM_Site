import { useCallback, useRef } from 'react';
import { slugifyFieldKey } from '@/utils/fieldKey';

/**
 * Comportamento padronizado "Título → Chave" das telas de criação de campos
 * personalizados, modelos de campos e templates de chamado.
 *
 * - Enquanto a Chave não for editada à mão, ela é derivada do Título a cada
 *   digitação (slug [a-z0-9_]).
 * - Em registros já criados (`hasStoredKey`) a Chave é preservada: relatórios,
 *   automações e valores gravados referenciam esse identificador.
 */
export function useAutoKey(hasStoredKey: boolean) {
  const touchedRef = useRef(hasStoredKey);

  /** Chave a usar quando o Título muda: mantém a atual se já foi tocada. */
  const keyForTitle = useCallback(
    (title: string, currentKey: string) =>
      touchedRef.current ? currentKey : slugifyFieldKey(title),
    [],
  );

  /** Marca que a Chave passou a ser manual (para de seguir o Título). */
  const markTouched = useCallback(() => {
    touchedRef.current = true;
  }, []);

  /** Força o estado "tocado" (usado quando a tela alterna criar/editar). */
  const setTouched = useCallback((value: boolean) => {
    touchedRef.current = value;
  }, []);

  return { keyForTitle, markTouched, setTouched };
}

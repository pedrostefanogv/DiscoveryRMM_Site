/**
 * Chave padronizada de campos personalizados e modelos de campos: identificador
 * legível ([a-z0-9_]) derivado do Título. É o mesmo formato e as mesmas regras
 * da chave de template de chamado (TicketTemplateKey na API), centralizando o
 * comportamento "digite o Título → a Chave se preenche sozinha" em todo o
 * produto.
 */
export const FIELD_KEY_MIN = 2;
export const FIELD_KEY_MAX = 80;

// O lookahead exige ao menos um caractere alfanumérico: chaves como "--",
// "__" ou "_-" não identificam nada e são recusadas.
const KEY_PATTERN = /^(?=.*[a-z0-9])[a-z0-9_]{2,80}$/;
// Campos de departamento aceitam hífen na API (compatibilidade com campos já
// cadastrados); a geração automática continua usando apenas "_".
const KEY_PATTERN_WITH_HYPHEN = /^(?=.*[a-z0-9])[a-z0-9_-]{2,80}$/;

/** Gera a chave a partir de um texto humano (ex.: "Tipo de Solicitação" -> tipo_de_solicitacao). */
export function slugifyFieldKey(value: string): string {
  const slug = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.length <= FIELD_KEY_MAX ? slug : slug.slice(0, FIELD_KEY_MAX).replace(/_+$/g, '');
}

export function isValidFieldKey(
  value: string | null | undefined,
  options: { allowHyphen?: boolean } = {},
): boolean {
  const pattern = options.allowHyphen ? KEY_PATTERN_WITH_HYPHEN : KEY_PATTERN;
  return pattern.test((value ?? '').trim());
}

/** Mensagem padrão quando a chave não passa nas regras (null = ok). */
export function fieldKeyError(
  value: string | null | undefined,
  options: { allowHyphen?: boolean } = {},
): string | null {
  const key = (value ?? '').trim();
  if (!key) return 'Informe a chave.';
  if (key.length < FIELD_KEY_MIN) return `A chave deve ter ao menos ${FIELD_KEY_MIN} caracteres.`;
  if (!/[a-z0-9]/.test(key)) return 'A chave deve conter ao menos uma letra ou número.';
  if (!isValidFieldKey(key, options)) {
    return options.allowHyphen
      ? 'Use apenas letras minúsculas, números, _ e - (ex.: tipo_solicitacao).'
      : 'Use apenas letras minúsculas, números e _ (ex.: tipo_solicitacao).';
  }
  return null;
}

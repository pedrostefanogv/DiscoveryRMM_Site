/**
 * Chave padronizada do template de chamado: identificador legível ([a-z0-9_]),
 * único dentro do escopo (cliente + departamento). Mesmas regras validadas na
 * API (TicketTemplateKey) — o Título é o nome exibido ao usuário.
 */
export const TEMPLATE_KEY_MIN = 2;
export const TEMPLATE_KEY_MAX = 80;

const KEY_PATTERN = /^[a-z0-9_]{2,80}$/;

/** Gera a chave a partir de um texto humano (ex.: "Criação de Login" -> criacao_de_login). */
export function slugifyTemplateKey(value: string): string {
  const slug = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.length <= TEMPLATE_KEY_MAX ? slug : slug.slice(0, TEMPLATE_KEY_MAX).replace(/_+$/g, '');
}

export function isValidTemplateKey(value: string | null | undefined): boolean {
  return KEY_PATTERN.test((value ?? '').trim());
}

/** Mensagem padrão quando a chave não passa nas regras (null = ok). */
export function templateKeyError(value: string | null | undefined): string | null {
  const key = (value ?? '').trim();
  if (!key) return 'Informe a chave do template.';
  if (key.length < TEMPLATE_KEY_MIN) return `A chave deve ter ao menos ${TEMPLATE_KEY_MIN} caracteres.`;
  if (!isValidTemplateKey(key)) {
    return 'Use apenas letras minúsculas, números e _ (ex.: criacao_de_login).';
  }
  return null;
}

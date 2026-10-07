import { FIELD_KEY_MAX, FIELD_KEY_MIN, isValidFieldKey, slugifyFieldKey } from './fieldKey';

/**
 * Chave padronizada do template de chamado: identificador legível ([a-z0-9_]),
 * único dentro do escopo (cliente + departamento). Mesmas regras validadas na
 * API (TicketTemplateKey) — o Título é o nome exibido ao usuário.
 *
 * A implementação vive em `fieldKey.ts` para que campos personalizados e
 * modelos de campos compartilhem exatamente o mesmo comportamento.
 */
export const TEMPLATE_KEY_MIN = FIELD_KEY_MIN;
export const TEMPLATE_KEY_MAX = FIELD_KEY_MAX;

/** Gera a chave a partir de um texto humano (ex.: "Criação de Login" -> criacao_de_login). */
export function slugifyTemplateKey(value: string): string {
  return slugifyFieldKey(value);
}

export function isValidTemplateKey(value: string | null | undefined): boolean {
  return isValidFieldKey(value);
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

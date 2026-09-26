import { fieldMaskPlaceholder } from '@/utils/fieldMask';

/**
 * Traduz as regras técnicas de um campo (regex/máscara) para uma orientação
 * humana. O usuário final nunca deve ver a regex crua na ficha.
 */
export interface FieldFormatSource {
  inputMask?: string | null;
  validationRegex?: string | null;
  /** Texto de ajuda escrito por quem cadastrou a pergunta/campo. */
  helpText?: string | null;
  description?: string | null;
}

/** Exemplo amigável derivado de padrões conhecidos de validação. */
const KNOWN_FORMAT_EXAMPLES: { test: RegExp; example: string }[] = [
  { test: /@/, example: 'nome@empresa.com' },
  { test: /\[A-Za-z0-9\]\{12\}|\\d\{14\}/, example: 'XX.XXX.XXX/XXXX-00' },
  { test: /\\d\{11\}/, example: '000.000.000-00' },
  { test: /\\d\{8\}|\\d\{5\}-\?\\d\{3\}/, example: '00000-000' },
  { test: /\(\?\\d\{2\}|\\d\{4,5\}/, example: '(00) 00000-0000' },
  { test: /https\?:/, example: 'https://exemplo.com' },
  { test: /\\d\{4\}.*\\d\{2\}|\\d{1,2}\/\\d{1,2}/, example: 'dd/mm/aaaa' },
];

function exampleFromRegex(regex: string | null | undefined): string | null {
  if (!regex) return null;
  for (const candidate of KNOWN_FORMAT_EXAMPLES) {
    if (candidate.test.test(regex)) return candidate.example;
  }
  return null;
}

/**
 * Linha de orientação do campo: texto de ajuda + exemplo (máscara ou regex
 * conhecida). Sem regex crua; quando não há nada útil, devolve undefined.
 */
export function describeFieldFormat(source: FieldFormatSource): string | undefined {
  const help = (source.helpText ?? source.description ?? '').trim();
  const maskExample = fieldMaskPlaceholder(source.inputMask);
  const regexExample = maskExample ? null : exampleFromRegex(source.validationRegex);

  const parts: string[] = [];
  if (help) parts.push(help);
  if (maskExample) parts.push(`ex.: ${maskExample}`);
  else if (regexExample) parts.push(`ex.: ${regexExample}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Mensagem de erro com orientação. Ex.: "E-mail: informe um valor como
 * nome@empresa.com." — mantém a mensagem genérica quando não há exemplo.
 */
export function describeFieldFormatError(label: string, source: FieldFormatSource): string {
  const maskExample = fieldMaskPlaceholder(source.inputMask);
  const example = maskExample || exampleFromRegex(source.validationRegex);
  if (example) return `${label}: informe um valor como ${example}.`;
  return `${label} não corresponde ao formato exigido.`;
}
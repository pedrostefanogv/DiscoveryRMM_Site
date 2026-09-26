import { CustomFieldDataType } from '@/api/custom-fields';

/**
 * Tipos cujo controle de entrada aplica máscara (ver `TicketSchemaFieldInput`).
 * Booleano, data/hora e seleções usam controles nativos e ignoram a máscara.
 * Fonte única para o formulário de cadastro e para o render do campo.
 */
export const MASK_SUPPORTED_DATA_TYPES: readonly CustomFieldDataType[] = [
  CustomFieldDataType.Text,
  CustomFieldDataType.Integer,
  CustomFieldDataType.Decimal,
];

export function supportsInputMask(dataType: CustomFieldDataType): boolean {
  return MASK_SUPPORTED_DATA_TYPES.includes(dataType);
}

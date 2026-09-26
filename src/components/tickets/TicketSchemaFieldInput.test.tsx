import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomFieldDataType, type TicketSchemaField } from '@/api';
import { TicketSchemaFieldInput } from './TicketSchemaFieldInput';

const field = (over: Partial<TicketSchemaField> = {}): TicketSchemaField => ({
  definitionId: 'email',
  name: 'email',
  label: 'E-mail',
  description: 'Endereço de e-mail.',
  dataType: CustomFieldDataType.Text,
  isRequired: true,
  isInternal: false,
  isActive: true,
  options: [],
  validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  inputMask: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  currentValueJson: null,
  ...over,
});

describe('TicketSchemaFieldInput', () => {
  afterEach(() => cleanup());

  it('mostra orientação amigável em vez da regex crua', () => {
    const { container } = render(
      <TicketSchemaFieldInput field={field()} value="" onChange={() => {}} />,
    );

    const hint = container.querySelector('p');
    expect(hint?.textContent).toBe('Endereço de e-mail. · ex.: nome@empresa.com');
    expect(container.textContent).not.toContain('^');
  });

  it('destaca o campo inválido com a mensagem recebida', () => {
    render(
      <TicketSchemaFieldInput
        field={field()}
        id="field-question-email"
        value="invalido"
        error="E-mail: informe um valor como nome@empresa.com."
        onChange={() => {}}
      />,
    );

    const input = screen.getByLabelText('E-mail *');
    expect(input.getAttribute('id')).toBe('field-question-email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('E-mail: informe um valor como nome@empresa.com.')).toBeTruthy();
    // O erro substitui o hint neutro.
    expect(screen.queryByText('Endereço de e-mail. · ex.: nome@empresa.com')).toBeNull();
  });

  it('sem máscara numérica usa input number; com máscara formata o valor', () => {
    const { container, unmount } = render(
      <TicketSchemaFieldInput
        field={field({ definitionId: 'valor', label: 'Valor', dataType: CustomFieldDataType.Decimal, validationRegex: null, isRequired: false, inputMask: 'R$ 9.999.999,99' })}
        value="1234.56"
        onChange={() => {}}
      />,
    );
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('R$ 1.234,56');
    unmount();

    const { container: plain } = render(
      <TicketSchemaFieldInput
        field={field({ definitionId: 'qtd', label: 'Qtd', dataType: CustomFieldDataType.Integer, validationRegex: null, isRequired: false })}
        value="10"
        onChange={() => {}}
      />,
    );
    expect((plain.querySelector('input') as HTMLInputElement).type).toBe('number');
  });

  it('múltipla escolha vira checkboxes das opções cadastradas', () => {
    // Componente controlado: o harness mantém o estado como o formulário real.
    function Harness() {
      const [value, setValue] = useState('ERP');
      return (
        <TicketSchemaFieldInput
          field={field({ definitionId: 'sistemas', label: 'Sistemas', dataType: CustomFieldDataType.ListBox, validationRegex: null, options: ['ERP', 'CRM'] })}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    const erp = screen.getByRole('checkbox', { name: 'ERP' }) as HTMLInputElement;
    const crm = screen.getByRole('checkbox', { name: 'CRM' }) as HTMLInputElement;
    expect(erp.checked).toBe(true);
    expect(crm.checked).toBe(false);

    fireEvent.click(crm);
    expect((screen.getByRole('checkbox', { name: 'ERP' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'CRM' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'ERP' }));
    expect((screen.getByRole('checkbox', { name: 'ERP' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: 'CRM' }) as HTMLInputElement).checked).toBe(true);
  });

  it('múltipla escolha preserva valor legado fora das opções', () => {
    render(
      <TicketSchemaFieldInput
        field={field({ definitionId: 'sistemas', label: 'Sistemas', dataType: CustomFieldDataType.ListBox, validationRegex: null, options: ['ERP'] })}
        value="Antigo"
        onChange={() => {}}
      />,
    );

    expect((screen.getByRole('checkbox', { name: /Antigo/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('(valor atual)')).toBeTruthy();
  });

  it('múltipla escolha destaca o grupo quando há erro', () => {
    render(
      <TicketSchemaFieldInput
        field={field({ definitionId: 'sistemas', label: 'Sistemas', dataType: CustomFieldDataType.ListBox, validationRegex: null, options: ['ERP'] })}
        id="field-question-sistemas"
        value=""
        error="Sistemas: selecione ao menos uma opção."
        onChange={() => {}}
      />,
    );

    const group = screen.getByRole('group', { name: 'Sistemas *' });
    expect(group.getAttribute('id')).toBe('field-question-sistemas');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Sistemas: selecione ao menos uma opção.')).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { AutomationScriptType } from '@/api';
import { ScriptContentEditor } from './ScriptContentEditor';
import { SCRIPT_LANGUAGES } from './scriptLanguages';

type EditorProps = ComponentProps<typeof ScriptContentEditor>;

function setup(overrides: Partial<EditorProps> = {}) {
  const onChange = vi.fn();
  const view = render(
    <ScriptContentEditor
      value=""
      onChange={onChange}
      scriptType={AutomationScriptType.PowerShell}
      {...overrides}
    />,
  );
  return { onChange, view };
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Conteudo do script') as HTMLTextAreaElement;
}

describe('ScriptContentEditor', () => {
  it('apresenta a linguagem e o arquivo conforme o tipo selecionado', () => {
    setup();
    expect(screen.getByText('PowerShell')).toBeTruthy();
    expect(screen.getByText('script.ps1')).toBeTruthy();
    expect(textarea().getAttribute('placeholder')).toContain('Write-Output');
  });

  it('troca a apresentação quando o tipo muda', () => {
    const { view } = setup();
    view.rerender(
      <ScriptContentEditor value="" onChange={vi.fn()} scriptType={AutomationScriptType.Python} />,
    );
    expect(screen.getByText('Python')).toBeTruthy();
    expect(screen.getByText('script.py')).toBeTruthy();
    expect(screen.queryByText('script.ps1')).toBeNull();
  });

  it('usa o placeholder do Batch', () => {
    setup({ scriptType: AutomationScriptType.Batch });
    expect(textarea().getAttribute('placeholder')).toBe('@echo off');
  });

  it('Tab insere 2 espaços no Shell', () => {
    const { onChange } = setup({ scriptType: AutomationScriptType.Shell });
    fireEvent.keyDown(textarea(), { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('  ');
  });

  it('Tab insere 4 espaços no PowerShell', () => {
    const { onChange } = setup({ scriptType: AutomationScriptType.PowerShell });
    fireEvent.keyDown(textarea(), { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('    ');
  });
});

describe('ScriptContentEditor - atalhos de edição', () => {
  it('Shift+Tab remove a indentação da linha', () => {
    const value = '    Write-Output 1';
    const { onChange } = setup({ value });
    textarea().setSelectionRange(value.length, value.length);
    fireEvent.keyDown(textarea(), { key: 'Tab', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith('Write-Output 1');
  });

  it('Enter mantém a indentação e abre bloco novo', () => {
    const value = 'if ($true) {';
    const { onChange } = setup({ value });
    textarea().setSelectionRange(value.length, value.length);
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('if ($true) {\n    ');
  });
});

describe('ScriptContentEditor - formatar', () => {
  it('normaliza fim de linha, espaços e linhas em branco', () => {
    const value = 'a  \r\n\r\n\r\nb   \r\n';
    const { onChange } = setup({ value, scriptType: AutomationScriptType.Shell });
    fireEvent.click(screen.getByRole('button', { name: 'Formatar' }));
    expect(onChange).toHaveBeenCalledWith('a\n\nb\n');
  });

  it('reindenta blocos no PowerShell', () => {
    const value = ['function Test {', 'Write-Output "a"', '}'].join('\n');
    const { onChange } = setup({ value });
    fireEvent.click(screen.getByRole('button', { name: 'Formatar' }));
    expect(onChange).toHaveBeenCalledWith(['function Test {', '    Write-Output "a"', '}', ''].join('\n'));
  });

  it('preserva indentação quando há string multilinha', () => {
    const value = 'texto = """\n   linha\n"""';
    const { onChange } = setup({ value, scriptType: AutomationScriptType.Python });
    fireEvent.click(screen.getByRole('button', { name: 'Formatar' }));
    expect(onChange).toHaveBeenCalledWith('texto = """\n   linha\n"""\n');
  });
});

describe('ScriptContentEditor - modelo inicial', () => {
  it('habilita com o editor vazio e insere o modelo do tipo', () => {
    const { onChange } = setup({ value: '' });
    const button = screen.getByRole('button', { name: 'Inserir modelo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(SCRIPT_LANGUAGES.powershell.template);
  });

  it('fica desabilitado quando já há conteúdo', () => {
    setup({ value: 'Write-Output 1' });
    const button = screen.getByRole('button', { name: 'Inserir modelo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe('ScriptContentEditor - modo consulta', () => {
  it('bloqueia edição e esconde as ações de escrita', () => {
    setup({ value: 'Write-Output 1', readOnly: true });
    expect(textarea().readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Formatar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inserir modelo' })).toBeNull();
    expect(screen.getByText('Somente leitura')).toBeTruthy();
  });

  it('continua exibindo a linguagem e as métricas do script', () => {
    setup({ value: 'Write-Output 1', readOnly: true });
    expect(screen.getByText('PowerShell')).toBeTruthy();
    expect(screen.getByText('Sintaxe OK')).toBeTruthy();
  });
});

describe('ScriptContentEditor - validação de sintaxe', () => {
  it('mostra Sintaxe OK para um script consistente', () => {
    setup({ value: 'Write-Output \"ola\"' });
    expect(screen.getByText('Sintaxe OK')).toBeTruthy();
  });

  it('mostra Sem conteúdo quando está vazio', () => {
    setup({ value: '' });
    expect(screen.getByText('Sem conteúdo')).toBeTruthy();
  });

  it('lista os erros com a linha quando a sintaxe está quebrada', () => {
    setup({ value: 'function Test {' });
    expect(screen.getByText('1 erro(s)')).toBeTruthy();
    expect(screen.getByText(/aberto e não fechado/)).toBeTruthy();
  });
});

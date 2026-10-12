import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldRuntimeAccessMode, CustomFieldScopeType } from '@/api';
import {
  CustomFieldCapabilitiesEditor,
  defaultCapabilitiesValue,
} from './CustomFieldCapabilitiesEditor';

function setup(overrides: Partial<typeof defaultCapabilitiesValue> = {}, scopeType = CustomFieldScopeType.Agent) {
  const onChange = vi.fn();
  const value = { ...defaultCapabilitiesValue, ...overrides };
  render(
    <CustomFieldCapabilitiesEditor
      value={value}
      onChange={onChange}
      scopeType={scopeType}
      bindingOptions={[{ value: 'task:t1', label: 'Tarefa: Coletar AnyDesk' }, { value: 'script:s1', label: 'Script: Inventário' }]}
    />,
  );
  return { onChange, value };
}

describe('CustomFieldCapabilitiesEditor', () => {
  it('mostra as quatro capacidades (agente lê/grava e portal vê/edita)', () => {
    setup();
    expect(screen.getByLabelText(/Pode ler/)).toBeTruthy();
    expect(screen.getByLabelText(/Pode gravar/)).toBeTruthy();
    expect(screen.getByLabelText(/Pode ver/)).toBeTruthy();
    expect(screen.getByLabelText(/Pode editar/)).toBeTruthy();
  });

  it('desligar "pode ver" no portal desliga a edição junto (não existe editar sem ver)', () => {
    const { onChange } = setup({ allowWebRead: true, allowWebEdit: true });
    fireEvent.click(screen.getByLabelText(/Pode ver/));
    expect(onChange).toHaveBeenCalledWith({ allowWebRead: false, allowWebEdit: false });
  });

  it('ligar "pode editar" força a leitura no portal', () => {
    const { onChange } = setup({ allowWebRead: false, allowWebEdit: false });
    fireEvent.click(screen.getByLabelText(/Pode editar/));
    expect(onChange).toHaveBeenCalledWith({ allowWebEdit: true, allowWebRead: true });
  });

  it('ligar "pode ler" com acesso desabilitado ativa o modo Público', () => {
    const { onChange } = setup({ runtimeAccessMode: CustomFieldRuntimeAccessMode.Disabled });
    fireEvent.click(screen.getByLabelText(/Pode ler/));
    expect(onChange).toHaveBeenCalledWith({
      allowRuntimeRead: true,
      runtimeAccessMode: CustomFieldRuntimeAccessMode.Public,
    });
  });

  it('modo restrito sem vínculo avisa e "Adicionar vínculo" cria a linha', () => {
    const { onChange } = setup({ runtimeAccessMode: CustomFieldRuntimeAccessMode.RestrictedTaskScript });
    expect(screen.getByText(/exige ao menos um vínculo/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar vínculo' }));
    expect(onChange).toHaveBeenCalledWith({
      accessBindings: [{ taskId: '', scriptId: '', canRead: true, canWrite: false }],
    });
  });

  it('gravação pelo agente fica indisponível fora do escopo Agente', () => {
    setup({}, CustomFieldScopeType.Client);
    expect((screen.getByLabelText(/Pode gravar/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Disponível apenas para campos com escopo Agente/)).toBeTruthy();
  });
});

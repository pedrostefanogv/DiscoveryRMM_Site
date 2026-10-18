import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão da herança de departamento no console:
 * - select "Herdar de" lista apenas departamentos GLOBAIS (+ "Nenhum");
 * - desfazer a herança envia null EXPLÍCITO no PUT (ausente ≠ null);
 * - selo de origem por campo/equipe conforme GET /departments/{id}/effective;
 * - erro de validação (422) do backend aparece no formulário;
 * - filtro de escopo da listagem bate com o rótulo.
 */
const mocks = vi.hoisted(() => ({
  effective: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    api: { ...actual.api, get: mocks.apiGet },
  };
});

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    departmentsApi: { ...actual.departmentsApi, effective: mocks.effective },
  };
});

import {
  ApiError,
  buildDepartmentUpdatePayload,
  buildInheritanceOptions,
  normalizeDepartmentEffective,
  parseDepartmentValidationErrors,
} from '@/api';
import type { Department } from '@/api';
import {
  buildDepartmentForm,
  DepartmentInheritanceAlerts,
  InheritedOriginBadge,
  isAssignmentStrategyInherited,
  isInheritedMember,
  TriageInheritableField,
} from './DepartmentDetailPage';
import { Select } from '@/components/ui';
import {
  ALL_DEPARTMENTS_SCOPE,
  DEPARTMENT_LIST_PARAMS,
  GLOBAL_DEPARTMENTS_SCOPE,
  buildDepartmentScopeOptions,
  filterDepartmentsByScope,
} from './DepartmentSettings';
import { useDepartmentEffective } from '@/hooks/useDepartments';

function department(overrides: Partial<Department> = {}): Department {
  return {
    id: 'd1',
    clientId: null,
    name: 'Departamento',
    description: null,
    inheritFromGlobalId: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.effective.mockReset();
  mocks.apiGet.mockReset();
});

afterEach(() => cleanup());

describe('select "Herdar de"', () => {
  const globals = [
    department({ id: 'g1', name: 'Suporte Global', clientId: null }),
    department({ id: 'g2', name: 'NOC', clientId: null }),
    department({ id: 'c1', name: 'Cliente X', clientId: 'client-1' }),
  ];

  it('lista apenas departamentos globais, com "Nenhum" para desfazer', () => {
    const options = buildInheritanceOptions(globals, 'd2');

    expect(options[0]).toEqual({ value: '', label: 'Nenhum (sem herança)' });
    expect(options.map((option) => option.value)).toEqual(['', 'g2', 'g1']);

    const byId = new Map(globals.map((item) => [item.id, item]));
    for (const option of options) {
      if (!option.value) continue;
      expect(byId.get(option.value)?.clientId ?? null).toBeNull();
    }
  });

  it('não oferece o próprio departamento (auto-herança)', () => {
    const options = buildInheritanceOptions(globals, 'g1');
    expect(options.some((option) => option.value === 'g1')).toBe(false);
  });

  it('não permite escolher global inativo: opção desabilitada e marcada', () => {
    const withInactive = [
      department({ id: 'g1', name: 'Suporte Global', clientId: null }),
      department({ id: 'g2', name: 'NOC', clientId: null }),
      department({ id: 'g0', name: 'Antigo', clientId: null, isActive: false }),
      department({ id: 'c1', name: 'Cliente X', clientId: 'client-1' }),
    ];

    const options = buildInheritanceOptions(withInactive, 'd2');
    const inactive = options.find((option) => option.value === 'g0');

    // Continua visível (para o valor já salvo não "sumir" da tela), porém
    // marcado e desabilitado: o usuário nunca consegue escolher um inativo.
    expect(inactive).toBeDefined();
    expect(inactive?.disabled).toBe(true);
    expect(inactive?.label).toBe('Antigo (inativo)');
    expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual([
      '',
      'g2',
      'g1',
    ]);

    // E o <select> renderiza a opção realmente desabilitada.
    render(
      <Select label="Herdar de" options={options} value="" onChange={() => {}} />,
    );
    const rendered = screen.getByRole('option', { name: 'Antigo (inativo)' }) as HTMLOptionElement;
    expect(rendered.disabled).toBe(true);
    cleanup();
  });

  it('mostra "herdado de <global>" só quando a origem é herdada', () => {
    render(<InheritedOriginBadge origin="inherited-global" inheritedFrom="Suporte Global" />);
    expect(screen.getByText('herdado de Suporte Global')).toBeTruthy();
    cleanup();

    render(<InheritedOriginBadge origin="own" />);
    expect(screen.getByText('definido aqui')).toBeTruthy();
    cleanup();

    const { container } = render(<InheritedOriginBadge origin={undefined} />);
    expect(container.textContent).toBe('');
  });
});

describe('campo de triagem herdado', () => {
  const def = {
    key: 'aiAssignmentMode' as const,
    label: 'Como aplicar a decisão',
    kind: 'select' as const,
    // Enums da API são numéricos: o select devolve "1", o payload precisa de 1.
    valueType: 'number' as const,
    options: [
      { value: '0', label: 'Sugerir' },
      { value: '1', label: 'Atribuir automaticamente' },
    ],
    defaultValue: '0',
    group: 'triage' as const,
  };

  it('mostra o selo, exibe o valor efetivo e bloqueia o controle', () => {
    render(
      <TriageInheritableField
        def={def}
        ownValue={null}
        effectiveValue={1}
        origin="inherited-global"
        inheritedFrom="Suporte Global"
        canInherit
        onChange={() => {}}
        onInherit={() => {}}
      />,
    );

    expect(screen.getByText('herdado de Suporte Global')).toBeTruthy();

    const control = screen.getByLabelText('Como aplicar a decisão') as HTMLSelectElement;
    expect(control.disabled).toBe(true);
    expect(control.value).toBe('1');

    const toggle = screen.getByLabelText('Herdar') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('desmarcar "Herdar" sobrescreve com o valor efetivo', () => {
    const onChange = vi.fn();
    render(
      <TriageInheritableField
        def={def}
        ownValue={null}
        effectiveValue={1}
        origin="inherited-global"
        inheritedFrom="Suporte Global"
        canInherit
        onChange={onChange}
        onInherit={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Herdar'));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('origem "default" mostra o valor efetivo, não o padrão de fábrica', () => {
    // Sem override e sem pai utilizável a origem é "default": o valor efetivo é
    // o do próprio departamento. Antes a tela mostrava o padrão (1200).
    render(
      <TriageInheritableField
        def={{
          key: 'aiAssignmentMaxOutputTokens',
          label: 'Teto de tokens da triagem',
          kind: 'number',
          min: 200,
          max: 32768,
          defaultValue: '1200',
          group: 'triage',
        }}
        ownValue={null}
        effectiveValue={3000}
        origin="default"
        canInherit={false}
        onChange={() => {}}
        onInherit={() => {}}
      />,
    );

    const control = screen.getByLabelText('Teto de tokens da triagem') as HTMLInputElement;
    expect(control.value).toBe('3000');
    expect(control.disabled).toBe(false);
  });

  it('marcar "Herdar" volta a herdar (override = null)', () => {
    const onInherit = vi.fn();
    render(
      <TriageInheritableField
        def={def}
        ownValue={1}
        origin="own"
        inheritedFrom="Suporte Global"
        canInherit
        onChange={() => {}}
        onInherit={onInherit}
      />,
    );

    fireEvent.click(screen.getByLabelText('Herdar'));

    expect(onInherit).toHaveBeenCalledTimes(1);
  });
});

describe('desfazer herança no update', () => {
  it('envia inheritFromGlobalId null explícito (não remove a propriedade)', () => {
    const form = buildDepartmentForm(
      department({ inheritFromGlobalId: 'g1', assignmentStrategy: 3 }),
      null,
    );

    const payload = buildDepartmentUpdatePayload({ ...form, inheritFromGlobalId: null });
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

    expect('inheritFromGlobalId' in payload).toBe(true);
    expect(payload.inheritFromGlobalId).toBeNull();
    expect(json.inheritFromGlobalId).toBeNull();
  });

  it('campos de override herdados viram null (voltar a herdar) e ficam no payload', () => {
    const effective = normalizeDepartmentEffective({
      origins: { aiAssignmentMode: 'inherited-global', aiSkillMinEvidence: 'default' },
      config: { aiAssignmentMode: 1 },
    });
    expect(effective).not.toBeNull();

    const form = buildDepartmentForm(
      department({
        clientId: 'client-1',
        inheritFromGlobalId: 'g1',
        aiAssignmentMode: 1,
        aiSkillMinEvidence: 3,
      }),
      effective,
    );

    // Herdado vira null no formulário (null = herdar); "default" NÃO é herança,
    // é o valor-base do próprio departamento e permanece.
    expect(form.aiAssignmentMode).toBeNull();
    expect(form.aiSkillMinEvidence).toBe(3);

    const payload = buildDepartmentUpdatePayload(form) as unknown as Record<string, unknown>;
    expect('aiAssignmentModeOverride' in payload).toBe(true);
    expect(payload.aiAssignmentModeOverride).toBeNull();
    expect(payload.aiSkillMinEvidenceOverride).toBe(3);
    // Herdado não envia o base (fixaria o valor e anularia a herança).
    expect('aiAssignmentMode' in payload).toBe(false);
  });

  it('origem "default" mantém o valor-base do departamento (não vira null)', () => {
    // "default" = nem herdado nem sobrescrito: é o valor-base do próprio
    // departamento. Tratá-lo como null exibia o padrão de fábrica.
    const effective = normalizeDepartmentEffective({
      origins: { aiAssignmentMaxOutputTokens: 'default' },
      config: { aiAssignmentMaxOutputTokens: 3000 },
    });

    const form = buildDepartmentForm(
      department({ clientId: 'client-1', aiAssignmentMaxOutputTokens: 3000 }),
      effective,
    );

    expect(form.aiAssignmentMaxOutputTokens).toBe(3000);

    const payload = buildDepartmentUpdatePayload(form) as unknown as Record<string, unknown>;
    expect(payload.aiAssignmentMaxOutputTokensOverride).toBe(3000);
    // Retrocompatibilidade: o backend antigo só conhece o campo base, então o
    // valor próprio continua sendo enviado junto do override.
    expect(payload.aiAssignmentMaxOutputTokens).toBe(3000);
  });

  it('sem o endpoint efetivo mantém os valores próprios do departamento', () => {
    const form = buildDepartmentForm(
      department({ clientId: 'client-1', aiAssignmentMode: 2, aiSkillMinEvidence: 9 }),
      null,
    );

    expect(form.aiAssignmentMode).toBe(2);
    expect(form.aiSkillMinEvidence).toBe(9);
    expect(form.aiWeightMax).toBe(0.5);
  });});

describe('estratégia de auto-atribuição herdada (B3)', () => {
  it('herdada vira assignmentStrategyOverride null e NÃO envia o valor base', () => {
    const effective = normalizeDepartmentEffective({
      // O backend passou a herdar assignmentStrategy; a origem vem no /effective
      // (com ou sem o sufixo Override).
      origins: { assignmentStrategy: 'inherited-global' },
      config: { assignmentStrategy: 3 },
    });

    const form = buildDepartmentForm(
      department({
        clientId: 'client-1',
        inheritFromGlobalId: 'g1',
        assignmentStrategy: 0,
      }),
      effective,
    );

    // null = herdar: a tela mostra o valor efetivo e não fixa um valor próprio.
    expect(form.assignmentStrategy).toBeNull();

    const payload = buildDepartmentUpdatePayload(form) as unknown as Record<string, unknown>;
    expect(payload.assignmentStrategyOverride).toBeNull();
    expect('assignmentStrategy' in payload).toBe(false);

    const json = JSON.stringify(payload);
    expect(json).toContain('"assignmentStrategyOverride":null');
    expect(json).not.toContain('"assignmentStrategy":');
  });

  it('estratégia própria continua enviando o valor base (compatibilidade)', () => {
    const form = buildDepartmentForm(
      department({ clientId: 'client-1', assignmentStrategy: 2 }),
      null,
    );

    expect(form.assignmentStrategy).toBe(2);

    const payload = buildDepartmentUpdatePayload(form) as unknown as Record<string, unknown>;
    // Valor base preservado (backend antigo) + override aditivo (backend novo).
    expect(payload.assignmentStrategy).toBe(2);
    expect(payload.assignmentStrategyOverride).toBe(2);
  });

  it('aceita a origem exposta com o sufixo Override no /effective', () => {
    const effective = normalizeDepartmentEffective({
      origins: { assignmentStrategyOverride: 'inherited-global' },
      config: { assignmentStrategy: 1 },
    });

    const inherited = department({
      clientId: 'client-1',
      inheritFromGlobalId: 'g1',
      assignmentStrategy: 3,
    });

    expect(isAssignmentStrategyInherited(inherited, effective)).toBe(true);
    expect(buildDepartmentForm(inherited, effective).assignmentStrategy).toBeNull();
  });

  it('sem /effective (404) usa assignmentStrategyOverride null do departamento', () => {
    const inherited = department({
      clientId: 'client-1',
      inheritFromGlobalId: 'g1',
      assignmentStrategy: 0,
      assignmentStrategyOverride: null,
    });

    expect(isAssignmentStrategyInherited(inherited, null)).toBe(true);
    expect(buildDepartmentForm(inherited, null).assignmentStrategy).toBeNull();

    // Backend antigo (campo ausente) mantém o comportamento anterior: valor próprio.
    const legacy = department({ clientId: 'client-1', assignmentStrategy: 3 });
    expect(isAssignmentStrategyInherited(legacy, null)).toBe(false);
    expect(buildDepartmentForm(legacy, null).assignmentStrategy).toBe(3);
  });
});

describe('erro de validação (422)', () => {
  it('renderiza a mensagem do backend no formulário', () => {
    const parsed = parseDepartmentValidationErrors(
      new ApiError(422, 'Não é possível herdar de si mesmo.'),
    );

    expect(parsed.status).toBe(422);
    render(<DepartmentInheritanceAlerts messages={parsed.messages} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Não é possível herdar de si mesmo.');
  });

  it('quebra múltiplos erros de campo em linhas', () => {
    const parsed = parseDepartmentValidationErrors(
      new ApiError(422, 'InheritFromGlobalId: ciclo detectado; InheritFromGlobalId: pai inativo'),
    );

    expect(parsed.messages).toHaveLength(2);
  });

  it('não renderiza nada sem avisos', () => {
    const { container } = render(<DepartmentInheritanceAlerts messages={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('config efetiva', () => {
  it('normaliza origem, equipe e avisos', () => {
    const view = normalizeDepartmentEffective({
      departmentId: 'd2',
      inheritFromGlobalId: 'g1',
      inheritFromGlobalName: 'Suporte Global',
      config: { aiAssignmentModeOverride: 1 },
      origins: { aiAssignmentModeOverride: 'inherited-global', assignmentStrategy: 'own' },
      team: [
        { userId: 'u1', userName: 'Ana', inherited: true, sourceDepartmentName: 'Suporte Global' },
        { userId: 'u2', userName: 'Bia', inherited: false },
      ],
      warnings: ['Departamento pai inativo.'],
    });

    expect(view?.parentName).toBe('Suporte Global');
    expect(view?.origins.aiAssignmentModeOverride).toBe('inherited-global');
    expect(view?.origins.assignmentStrategy).toBe('own');
    expect(view?.team.map((member) => member.userId)).toEqual(['u1', 'u2']);
    expect(isInheritedMember(view?.team[0])).toBe(true);
    expect(isInheritedMember(view?.team[1])).toBe(false);
    expect(view?.warnings).toEqual(['Departamento pai inativo.']);
  });

  it('aceita aliases e enum numérico sem quebrar', () => {
    const view = normalizeDepartmentEffective({
      config: {},
      fieldOrigins: { aiAssignmentModeOverride: 2, aiWeightMin: 'inherited' },
      members: [{ id: 'u1', isInherited: true }],
    } as unknown as Parameters<typeof normalizeDepartmentEffective>[0]);

    expect(view?.origins.aiAssignmentModeOverride).toBe('inherited-global');
    expect(view?.origins.aiWeightMin).toBe('inherited-global');
    expect(view?.team[0].userId).toBe('u1');
    expect(view?.team[0].inherited).toBe(true);
  });

  it('devolve null quando não há payload (404)', () => {
    expect(normalizeDepartmentEffective(null)).toBeNull();
    expect(normalizeDepartmentEffective(undefined)).toBeNull();
  });
});

describe('filtro de escopo da listagem', () => {
  const list = [
    department({ id: 'g1', name: 'Global 1', clientId: null }),
    department({ id: 'd1', name: 'Cliente A', clientId: 'a' }),
    department({ id: 'd2', name: 'Cliente B', clientId: 'b' }),
  ];

  it('rótulo do filtro descreve o que a lista devolve', () => {
    const options = buildDepartmentScopeOptions([{ id: 'a', name: 'Cliente A' }]);

    expect(options[0]).toEqual({
      value: ALL_DEPARTMENTS_SCOPE,
      label: 'Todos os departamentos (globais + clientes)',
    });
    expect(options.some((option) => option.value === GLOBAL_DEPARTMENTS_SCOPE)).toBe(true);
    expect(options.some((option) => option.value === 'a')).toBe(true);
  });

  it('a listagem pede allClients para o filtro "todos" funcionar', async () => {
    // Sem clientId a API devolve apenas os globais; o filtro por cliente ficaria
    // vazio. DEPARTMENT_LIST_PARAMS pede todos os escopos (D11).
    expect(DEPARTMENT_LIST_PARAMS.allClients).toBe(true);

    const { departmentsApi } = await import('@/api');
    mocks.apiGet.mockResolvedValueOnce([]);

    await departmentsApi.list(DEPARTMENT_LIST_PARAMS);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/v1/departments', DEPARTMENT_LIST_PARAMS);
  });

  it('escopo vazio mostra globais + clientes; "somente globais" mostra só globais', () => {
    expect(filterDepartmentsByScope(list, ALL_DEPARTMENTS_SCOPE).map((item) => item.id)).toEqual([
      'g1',
      'd1',
      'd2',
    ]);
    expect(
      filterDepartmentsByScope(list, GLOBAL_DEPARTMENTS_SCOPE).map((item) => item.id),
    ).toEqual(['g1']);
    expect(filterDepartmentsByScope(list, 'a').map((item) => item.id)).toEqual(['d1']);
  });
});

describe('GET /departments/global e /effective', () => {
  it('cai para a listagem filtrando globais quando /global responde 404', async () => {
    const { departmentsApi } = await import('@/api');

    mocks.apiGet
      .mockRejectedValueOnce(new ApiError(404, 'Recurso não encontrado'))
      .mockResolvedValueOnce([
        department({ id: 'g1', clientId: null }),
        department({ id: 'c1', clientId: 'client-1' }),
      ]);

    const globals = await departmentsApi.listGlobal();

    expect(globals.map((item) => item.id)).toEqual(['g1']);
    expect(mocks.apiGet).toHaveBeenLastCalledWith('/api/v1/departments', {
      includeGlobal: true,
    });
  });

  it('useDepartmentEffective trata 404 como endpoint ausente (sem erro na tela)', async () => {
    mocks.effective.mockRejectedValue(new ApiError(404, 'Recurso não encontrado'));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDepartmentEffective('d1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});

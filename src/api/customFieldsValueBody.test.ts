import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { putMock, getMock } = vi.hoisted(() => ({
  putMock: vi.fn(async (..._args: unknown[]) => ({ definitionId: 'd1', entityId: 'e1', scopeType: 3, valueJson: '"x"' })),
  getMock: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}));

vi.mock('./client', () => ({
  api: {
    get: getMock,
    post: vi.fn(),
    put: putMock,
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { CustomFieldScopeType, customFieldsApi } from './custom-fields';

describe('customFieldsApi — corpo do PUT de valor por escopo', () => {
  beforeEach(() => putMock.mockClear());
  afterEach(() => vi.clearAllMocks());

  it('escopo Agente envia valueJson (o endpoint não aceita "value")', async () => {
    await customFieldsApi.upsertScopedValue('d1', {
      scopeType: CustomFieldScopeType.Agent,
      entityId: 'a1',
      value: '123 456 789',
    });

    const [path, body] = putMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/Agents/a1/custom-fields/d1');
    expect(body).toEqual({ valueJson: JSON.stringify('123 456 789') });
  });

  it('escopo Cliente continua enviando "value"', async () => {
    await customFieldsApi.upsertScopedValue('d1', {
      scopeType: CustomFieldScopeType.Client,
      entityId: 'c1',
      value: 'abc',
    });

    const [, body] = putMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body).toEqual({ value: 'abc' });
  });

  it('schema de entidade usa a rota certa por escopo', async () => {
    getMock.mockClear();

    await customFieldsApi.getEntitySchema(CustomFieldScopeType.Client, { entityId: 'c1' });
    await customFieldsApi.getEntitySchema(CustomFieldScopeType.Site, { entityId: 's1', clientId: 'c1' });
    await customFieldsApi.getEntitySchema(CustomFieldScopeType.Agent, { entityId: 'a1' });

    const paths = getMock.mock.calls.map(call => call[0]);
    expect(paths).toEqual([
      '/api/v1/Clients/c1/custom-fields/schema',
      '/api/v1/clients/c1/Sites/s1/custom-fields/schema',
      '/api/v1/Agents/a1/custom-fields/schema',
    ]);
  });

  it('escopo Servidor (endpoint genérico) envia valueJson com escopo e entityId', async () => {
    await customFieldsApi.upsertValue('d1', {
      scopeType: CustomFieldScopeType.Server,
      value: 10,
    });

    const [path, body] = putMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/custom-fields/values/d1');
    expect(body).toEqual({ scopeType: CustomFieldScopeType.Server, entityId: null, valueJson: '10' });
  });
});

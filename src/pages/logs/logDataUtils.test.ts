import { describe, expect, it } from 'vitest';
import { readDataField } from './logDataUtils';

describe('readDataField', () => {
  it('lê chaves camelCase', () => {
    expect(readDataField({ statusCode: 200 }, 'statusCode')).toBe(200);
  });

  it('lê chaves PascalCase (formato gravado pelo backend)', () => {
    const data = { Path: '/api/v1/x', StatusCode: 400, TraceId: 'abc', QueryString: '' };
    expect(readDataField(data, 'statusCode')).toBe(400);
    expect(readDataField(data, 'traceId')).toBe('abc');
    expect(readDataField(data, 'path')).toBe('/api/v1/x');
    expect(readDataField(data, 'queryString')).toBe('');
  });

  it('devolve undefined quando ausente ou nulo', () => {
    expect(readDataField(null, 'traceId')).toBeUndefined();
    expect(readDataField({}, 'traceId')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { CreateTicketRequest } from '@/api';
import { buildCreateTicketPayload } from './ticketCreatePayload';

const form: CreateTicketRequest = {
  clientId: 'c1',
  siteId: null,
  agentId: null,
  departmentId: 'd1',
  workflowProfileId: null,
  title: 'Criação de login',
  description: 'Abrir acesso',
  priority: 'Medium',
  category: 'Acessos',
  assignedToUserId: null,
};

describe('buildCreateTicketPayload', () => {
  it('envia templateId quando um template foi escolhido (vínculo e snapshot)', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: 't1',
      customFieldValues: {},
      templateAnswers: { email: 'ana@empresa.com' },
    });

    // Regressão: sem templateId o backend recusava as respostas do questionário.
    expect(payload.templateId).toBe('t1');
    expect(payload.templateAnswers).toEqual({ email: 'ana@empresa.com' });
  });

  it('templateId nulo quando não há template e nenhuma resposta é enviada', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: null,
      customFieldValues: {},
      templateAnswers: { email: 'nao-deveria-ir' },
    });

    expect(payload.templateId).toBeNull();
    expect(payload.templateAnswers).toBeUndefined();
  });

  it('omite mapas vazios e preserva os campos do formulário', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: null,
      customFieldValues: {},
      templateAnswers: {},
    });

    expect(payload).toMatchObject({ clientId: 'c1', departmentId: 'd1', title: 'Criação de login' });
    expect(payload.customFieldValues).toBeUndefined();
    expect('templateId' in payload).toBe(true);
  });

  it('com template, envia null nos campos vazios para não reaplicar o default', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: 't1',
      departmentFieldIds: ['a1', 'a2'],
      customFieldValues: { a1: 'preenchido' },
      templateAnswers: {},
    });

    // a2 foi limpo pelo usuário: null impede o servidor de reaplicar o default.
    expect(payload.customFieldValues).toEqual({ a1: 'preenchido', a2: null });
  });

  it('sem template, campos vazios não entram no payload', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: null,
      departmentFieldIds: ['a1', 'a2'],
      customFieldValues: {},
      templateAnswers: {},
    });

    expect(payload.customFieldValues).toBeUndefined();
  });

  it('inclui customFieldValues quando há valores', () => {
    const payload = buildCreateTicketPayload({
      form,
      templateId: 't1',
      customFieldValues: { 'a1': 'valor' },
      templateAnswers: {},
    });

    expect(payload.customFieldValues).toEqual({ a1: 'valor' });
    expect(payload.templateAnswers).toBeUndefined();
  });
});

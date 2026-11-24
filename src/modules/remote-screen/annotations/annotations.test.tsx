import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AnnotationToolbar from './AnnotationToolbar';
import {
  ANNOTATION_LASER_TTL_MS,
  ANNOTATION_MAX_POINTS,
  buildAddAnnotationCommand,
  buildClearAnnotationsCommand,
  buildUndoAnnotationCommand,
  DEFAULT_ANNOTATION_SETTINGS,
  normalizePoint,
  simplifyFreehandPoints,
} from './types';

describe('annotations helpers', () => {
  it('normaliza e faz clamp das coordenadas para [0, 1]', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(normalizePoint(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizePoint(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePoint(500, 300, rect)).toEqual({ x: 1, y: 1 });
  });

  it('simplifica pontos freehand e respeita o limite máximo', () => {
    const dense = Array.from({ length: 500 }, (_, i) => ({
      x: i / 500,
      y: 0.5 + 0.1 * Math.sin(i / 20),
    }));
    const simplified = simplifyFreehandPoints(dense, 0.004, ANNOTATION_MAX_POINTS);
    expect(simplified.length).toBeLessThanOrEqual(ANNOTATION_MAX_POINTS);
    expect(simplified[0].x).toBe(0);
    expect(simplified[simplified.length - 1]).toEqual({
      x: dense[dense.length - 1].x,
      y: dense[dense.length - 1].y,
    });
  });

  it('constrói comandos add, undo e clear corretamente', () => {
    const addRect = buildAddAnnotationCommand(
      { ...DEFAULT_ANNOTATION_SETTINGS, tool: 'rect', ttlMs: 8000 },
      [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.8, y: 0.9 },
      ],
      'id-1',
    );
    expect(addRect).toEqual({
      op: 'add',
      id: 'id-1',
      tool: 'rect',
      color: '#FF3B30',
      width: 5,
      ttlMs: 8000,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.9 },
      ],
    });

    const addLaser = buildAddAnnotationCommand(
      { ...DEFAULT_ANNOTATION_SETTINGS, tool: 'laser', ttlMs: 0 },
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      'id-2',
    );
    expect(addLaser.ttlMs).toBe(ANNOTATION_LASER_TTL_MS);

    expect(buildUndoAnnotationCommand('id-1')).toEqual({ op: 'undo', id: 'id-1' });
    expect(buildUndoAnnotationCommand()).toEqual({ op: 'undo' });
    expect(buildClearAnnotationsCommand()).toEqual({ op: 'clear' });
  });
});

describe('AnnotationToolbar', () => {
  it('permite trocar ferramenta, cor, duração e acionar undo/clear/exit', () => {
    const onChange = vi.fn();
    const onUndo = vi.fn();
    const onClear = vi.fn();
    const onExit = vi.fn();

    render(
      <AnnotationToolbar
        settings={DEFAULT_ANNOTATION_SETTINGS}
        onChange={onChange}
        onUndo={onUndo}
        onClear={onClear}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByTitle('Retângulo'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      tool: 'rect',
    });

    fireEvent.click(screen.getByLabelText('Cor Azul'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      color: '#0A84FF',
    });

    fireEvent.click(screen.getByText('Fixo'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      ttlMs: 0,
    });

    fireEvent.click(screen.getByText('↶ Desfazer'));
    expect(onUndo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Limpar'));
    expect(onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Controlar'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

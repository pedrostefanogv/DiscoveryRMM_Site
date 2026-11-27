import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AnnotationCanvas from './AnnotationCanvas';
import AnnotationToolbar from './AnnotationToolbar';
import {
  ANNOTATION_LASER_TTL_MS,
  ANNOTATION_MAX_POINTS,
  buildAddAnnotationCommand,
  buildClearAnnotationsCommand,
  buildUndoAnnotationCommand,
  constrainShapePoint,
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

  it('constrainShapePoint força quadrado, círculo e ângulos de 45° quando Shift está pressionado', () => {
    const start = { x: 0.2, y: 0.2 };
    const current = { x: 0.5, y: 0.3 };

    expect(constrainShapePoint('rect', start, current, 1, false)).toEqual(current);

    const sq = constrainShapePoint('rect', start, current, 2, true);
    // dxVis = 0.3 * 2 = 0.6, dyVis = 0.1 -> side = 0.6 -> x = 0.2 + 0.6/2 = 0.5, y = 0.2 + 0.6 = 0.8
    expect(sq.x).toBeCloseTo(0.5, 5);
    expect(sq.y).toBeCloseTo(0.8, 5);

    const circ = constrainShapePoint('ellipse', start, { x: 0.4, y: 0.5 }, 1, true);
    expect(circ.x).toBeCloseTo(0.5, 5);
    expect(circ.y).toBeCloseTo(0.5, 5);

    const arrow = constrainShapePoint('arrow', start, { x: 0.5, y: 0.22 }, 1, true);
    expect(arrow.y).toBeCloseTo(0.2, 5);
    expect(arrow.x).toBeGreaterThan(0.49);
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

    fireEvent.click(screen.getByTitle('Retângulo (3)'));
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

    fireEvent.click(screen.getByText('Desfazer'));
    expect(onUndo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Limpar'));
    expect(onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Controlar'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('exibe controles contextuais de zoom e tamanho no modo lupa e oculta cores/TTL', () => {
    const onChange = vi.fn();
    render(
      <AnnotationToolbar
        settings={{ ...DEFAULT_ANNOTATION_SETTINGS, tool: 'magnifier' }}
        onChange={onChange}
        onUndo={vi.fn()}
        onClear={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Cor Azul')).toBeNull();
    expect(screen.queryByLabelText('Duração da anotação')).toBeNull();

    fireEvent.click(screen.getByText('3×'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      tool: 'magnifier',
      magnifierZoom: 3,
    });

    fireEvent.click(screen.getByLabelText('Lupa Grande'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      tool: 'magnifier',
      magnifierSize: 280,
    });
  });

  it('desabilita o botão Desfazer quando canUndo é false', () => {
    const onUndo = vi.fn();
    render(
      <AnnotationToolbar
        settings={DEFAULT_ANNOTATION_SETTINGS}
        onChange={vi.fn()}
        onUndo={onUndo}
        onClear={vi.fn()}
        onExit={vi.fn()}
        canUndo={false}
      />,
    );

    const undoBtn = screen.getByTitle('Desfazer última anotação (Ctrl+Z)') as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    fireEvent.click(undoBtn);
    expect(onUndo).not.toHaveBeenCalled();
  });
});

describe('AnnotationCanvas', () => {
  it('responde aos atalhos numéricos, Ctrl+Z, Esc e scroll da lupa', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const onExit = vi.fn();
    const onChangeSettings = vi.fn();

    const { rerender } = render(
      <AnnotationCanvas
        active
        settings={DEFAULT_ANNOTATION_SETTINGS}
        onCommit={onCommit}
        onUndo={onUndo}
        onExit={onExit}
        onChangeSettings={onChangeSettings}
      />,
    );

    fireEvent.keyDown(window, { key: '6' });
    expect(onChangeSettings).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      tool: 'magnifier',
    });

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);

    rerender(
      <AnnotationCanvas
        active
        settings={{ ...DEFAULT_ANNOTATION_SETTINGS, tool: 'magnifier', magnifierZoom: 2 }}
        onCommit={onCommit}
        onUndo={onUndo}
        onExit={onExit}
        onChangeSettings={onChangeSettings}
      />,
    );

    const canvas = screen.getByTestId('annotation-canvas');
    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(onChangeSettings).toHaveBeenCalledWith({
      ...DEFAULT_ANNOTATION_SETTINGS,
      tool: 'magnifier',
      magnifierZoom: 2.5,
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

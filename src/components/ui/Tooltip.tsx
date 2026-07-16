import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  variant?: 'default' | 'hover-card';
}

const TOOLTIP_GAP_PX = 8;

function computeTooltipStyle(
  rect: DOMRect,
  position: 'top' | 'bottom' | 'left' | 'right',
): React.CSSProperties {
  const style: React.CSSProperties = { position: 'fixed' };
  const gap = TOOLTIP_GAP_PX;

  switch (position) {
    case 'bottom':
      style.top = `${rect.bottom + gap}px`;
      style.left = `${rect.left + rect.width / 2}px`;
      style.transform = 'translateX(-50%)';
      break;
    case 'top':
      style.top = `${rect.top - gap}px`;
      style.left = `${rect.left + rect.width / 2}px`;
      style.transform = 'translate(-50%, -100%)';
      break;
    case 'left':
      style.top = `${rect.top + rect.height / 2}px`;
      style.left = `${rect.left - gap}px`;
      style.transform = 'translate(-100%, -50%)';
      break;
    case 'right':
      style.top = `${rect.top + rect.height / 2}px`;
      style.left = `${rect.right + gap}px`;
      style.transform = 'translateY(-50%)';
      break;
  }

  return style;
}

export function Tooltip({ children, content, position = 'top', delay = 300, className = 'inline-flex', variant = 'default' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setTooltipStyle(computeTooltipStyle(rect, position));
  }, [position]);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  useEffect(() => {
    if (visible) {
      updatePosition();
    }
  }, [visible, updatePosition]);

  const contentClassName =
    variant === 'hover-card'
      ? 'w-[min(460px,calc(100vw-2rem))] whitespace-normal rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground shadow-2xl backdrop-blur-sm'
      : 'max-w-xs whitespace-normal rounded-lg border border-border bg-surface-light px-3 py-1.5 text-xs text-justify text-muted-foreground shadow-xl backdrop-blur-sm sm:max-w-[40rem]';

  return (
    <>
      <div
        ref={triggerRef}
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {visible &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none z-50"
            style={tooltipStyle}
          >
            <div className={contentClassName}>
              {content}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  variant?: 'default' | 'hover-card';
}

export function Tooltip({ children, content, position = 'top', delay = 300, className = 'inline-flex', variant = 'default' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-surface border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-surface border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-surface border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-surface border-y-transparent border-l-transparent border-4',
  };

  const contentClassName =
    variant === 'hover-card'
      ? 'w-[min(460px,calc(100vw-2rem))] whitespace-normal rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground shadow-2xl backdrop-blur-sm'
      : 'max-w-xs whitespace-normal rounded-lg border border-border bg-surface-light px-3 py-1.5 text-xs text-justify text-muted-foreground shadow-xl backdrop-blur-sm sm:max-w-[40rem]';

  return (
    <div className={`relative ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute z-50 ${positionClasses[position]}`}
        >
          <div className={contentClassName}>
            {content}
          </div>
          {variant === 'default' && <div className={`absolute ${arrowClasses[position]}`} />}
        </div>
      )}
    </div>
  );
}

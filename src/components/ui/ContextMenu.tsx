import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  hint?: string;
  children?: ContextMenuItem[]; // submenu
}

interface ContextMenuProps {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    const handleBlur = () => onClose();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onClose]);

  // Calcula posição evitando overflow na viewport.
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, window.innerHeight - rect.height - 8);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [position]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[220px] rounded-lg border border-border bg-surface py-1.5 shadow-2xl"
      style={{ left: position.x, top: position.y }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        item.children ? (
          <SubmenuItem key={item.key} item={item} onClose={onClose} />
        ) : (
          <ContextMenuItemView key={item.key} item={item} onClose={onClose} />
        ),
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

function ContextMenuItemView({
  item,
  onClose,
}: {
  item: ContextMenuItem;
  onClose: () => void;
}) {
  const disabled = item.disabled;
  return (
    <div className={item.separatorBefore ? "mt-1.5 border-t border-border pt-1.5" : undefined}>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          item.onClick?.();
          onClose();
        }}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          item.danger
            ? "text-red-500 hover:bg-red-500/10"
            : "text-foreground hover:bg-surface-hover"
        }`}
      >
        {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
        <span className="flex-1 truncate">{item.label}</span>
        {item.hint ? <span className="text-xs text-muted">{item.hint}</span> : null}
      </button>
    </div>
  );
}

function SubmenuItem({
  item,
  onClose,
}: {
  item: ContextMenuItem;
  onClose: () => void;
}) {
  return (
    <div className="group relative">
      <div
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
          item.danger ? "text-red-500" : "text-foreground"
        }`}
      >
        {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight className="h-4 w-4 text-muted" />
      </div>
      <div
        className="invisible absolute left-full top-0 z-[210] min-w-[200px] rounded-lg border border-border bg-surface py-1.5 shadow-2xl opacity-0 transition-opacity group-hover:visible group-hover:opacity-100"
        role="menu"
        onContextMenu={(event) => event.preventDefault()}
      >
        {item.children?.map((child) => (
          <ContextMenuItemView key={child.key} item={child} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}
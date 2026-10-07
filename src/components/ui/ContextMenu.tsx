import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/** Distância mínima entre qualquer menu/submenu e a borda da viewport. */
const VIEWPORT_MARGIN = 8;

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

  // Calcula posição evitando overflow na viewport (antes da pintura, sem "pulo").
  const place = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.x, window.innerWidth - rect.width - VIEWPORT_MARGIN),
    );
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.y, window.innerHeight - rect.height - VIEWPORT_MARGIN),
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [position]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[200] max-h-[calc(100vh-1rem)] min-w-[220px] overflow-y-auto rounded-lg border border-border bg-surface py-1.5 shadow-2xl"
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
            ? "text-danger hover:bg-danger/10"
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
  const groupRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Posiciona o submenu no viewport: abre para a esquerda quando não cabe à
  // direita e sobe quando passaria da base da tela.
  useLayoutEffect(() => {
    if (!open) return;
    const submenu = submenuRef.current;
    const trigger = groupRef.current;
    if (!submenu || !trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();

    let left = triggerRect.right;
    if (left + submenuRect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = triggerRect.left - submenuRect.width;
    }
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - submenuRect.width - VIEWPORT_MARGIN),
    );
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(triggerRect.top, window.innerHeight - submenuRect.height - VIEWPORT_MARGIN),
    );

    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
  }, [open]);

  return (
    <div
      ref={groupRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
          item.danger ? "text-danger" : "text-foreground"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        // Abrir por foco/click (não alternar): o foco do mousedown dispara
        // primeiro, então um toggle fecharia o submenu no mesmo clique.
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight className="h-4 w-4 text-muted" />
      </button>
      <div
        ref={submenuRef}
        role="menu"
        className={`fixed z-[210] max-h-[calc(100vh-1rem)] min-w-[200px] overflow-y-auto rounded-lg border border-border bg-surface py-1.5 shadow-2xl transition-opacity ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
        style={{ left: 0, top: 0 }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {item.children?.map((child) => (
          <ContextMenuItemView key={child.key} item={child} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

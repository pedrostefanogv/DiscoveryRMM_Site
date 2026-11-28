import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthorization } from '@/auth/authorization';
import {
  SIDEBAR_GROUPS,
  filterSidebarGroups,
  filterSidebarGroupsByQuery,
  isRouteActive,
  resolveActiveAccordionSection,
  type SidebarAccordionSection,
} from './sidebarConfig';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isDesktop: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function submenuGridClass(isOpen: boolean): string {
  return [
    'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none',
  ].join(' ');
}

function chevronAnimationClass(isOpen: boolean): string {
  return `h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`;
}

export function Sidebar({
  collapsed,
  onToggle,
  isDesktop,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { branding } = useTheme();
  const { hasAnyPermission } = useAuthorization();
  const location = useLocation();
  const navigate = useNavigate();

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  // No desktop recolhido, expandir temporariamente ao passar o mouse ou focar via teclado
  const effectiveCollapsed = collapsed && ((!hovered && !focused) || !isDesktop);

  const visibleGroups = useMemo(
    () => filterSidebarGroups(SIDEBAR_GROUPS, hasAnyPermission),
    [hasAnyPermission],
  );

  const hasQuery = filterQuery.trim().length > 0;

  const displayedGroups = useMemo(
    () => (hasQuery ? filterSidebarGroupsByQuery(visibleGroups, filterQuery) : visibleGroups),
    [visibleGroups, filterQuery, hasQuery],
  );

  const activeSection = useMemo(
    () => resolveActiveAccordionSection(location.pathname, visibleGroups),
    [location.pathname, visibleGroups],
  );

  const [openSection, setOpenSection] = useState<SidebarAccordionSection | null>(
    () => activeSection,
  );

  useEffect(() => {
    if (activeSection) {
      setOpenSection(activeSection);
    }
  }, [activeSection]);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
    }
  };

  const handleFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && filterQuery) {
      event.preventDefault();
      event.stopPropagation();
      setFilterQuery('');
    }
  };

  const expandedWidthClass = effectiveCollapsed ? 'lg:w-16' : 'lg:w-60';
  const mobileVisibleClass = mobileOpen ? 'translate-x-0' : '-translate-x-full';
  const isMobileDrawerOpen = !isDesktop && mobileOpen;

  return (
    <aside
      id="main-sidebar"
      role={isMobileDrawerOpen ? 'dialog' : undefined}
      aria-modal={isMobileDrawerOpen ? true : undefined}
      aria-label={isMobileDrawerOpen ? 'Menu lateral' : undefined}
      aria-hidden={!isDesktop && !mobileOpen}
      inert={!isDesktop && !mobileOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={`sidebar-transition fixed left-0 top-0 z-30 flex h-dvh w-60 flex-col border-r border-border bg-sidebar/95 shadow-2xl backdrop-blur-xl ${
        isDesktop ? `translate-x-0 ${expandedWidthClass}` : mobileVisibleClass
      }`}
    >
      {/* Logo + botão fechar no mobile */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3.5">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 text-foreground transition-opacity hover:opacity-90"
        >
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.appName} className="h-8 w-8 shrink-0 rounded" />
          ) : (
            <img src="/icon.ico" alt={branding.appName} className="h-8 w-8 shrink-0 rounded" />
          )}
          <span className={effectiveCollapsed ? 'sr-only' : 'truncate text-lg font-bold text-foreground'}>
            {branding.appName}
          </span>
        </Link>

        {!isDesktop && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fechar menu lateral"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-light hover:text-foreground"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filtro rápido do menu */}
      {!effectiveCollapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            />
            <input
              ref={filterInputRef}
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={handleFilterKeyDown}
              placeholder="Filtrar menu..."
              aria-label="Filtrar menu"
              className="w-full rounded-lg border border-border bg-input py-1.5 pl-8 pr-7 text-xs text-foreground placeholder-muted outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => {
                  setFilterQuery('');
                  filterInputRef.current?.focus();
                }}
                aria-label="Limpar filtro do menu"
                className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Links de navegação */}
      <nav aria-label="Menu principal" className="mt-1 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2 pb-3">
        {displayedGroups.length === 0 && hasQuery ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted">Nenhum item encontrado</p>
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Limpar filtro
            </button>
          </div>
        ) : (
          displayedGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {!effectiveCollapsed ? (
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                  {group.label}
                </p>
              ) : (
                groupIndex > 0 && (
                  <div className="mx-2 my-2 border-t border-border/60" role="separator" />
                )
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  if (item.kind === 'link') {
                    const active = isRouteActive(location.pathname, item);
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.to}
                          title={effectiveCollapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-primary/12 font-semibold text-primary'
                              : 'font-medium text-muted hover:bg-surface-light hover:text-foreground'
                          }`}
                        >
                          <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                          <span className={effectiveCollapsed ? 'sr-only' : 'truncate'}>
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  }

                  const sectionActive =
                    activeSection === item.id ||
                    item.children.some((child) => isRouteActive(location.pathname, child));
                  const isOpen = hasQuery || openSection === item.id;
                  const submenuId = `sidebar-submenu-${item.id}`;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={effectiveCollapsed ? item.label : undefined}
                        aria-expanded={isOpen}
                        aria-controls={submenuId}
                        onClick={() => {
                          if (effectiveCollapsed) {
                            const firstTarget = item.children[0]?.to;
                            if (firstTarget) navigate(firstTarget);
                            return;
                          }
                          setOpenSection((prev) => (prev === item.id ? null : item.id));
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          sectionActive
                            ? 'bg-primary/12 font-semibold text-primary'
                            : 'font-medium text-muted hover:bg-surface-light hover:text-foreground'
                        }`}
                      >
                        <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                        <span className={effectiveCollapsed ? 'sr-only' : 'truncate'}>
                          {item.label}
                        </span>
                        {!effectiveCollapsed && (
                          <span className="ml-auto">
                            <Icon name="expand_more" className={chevronAnimationClass(isOpen)} />
                          </span>
                        )}
                      </button>

                      {!effectiveCollapsed && (
                        <div
                          id={submenuId}
                          className={submenuGridClass(isOpen)}
                          aria-hidden={!isOpen}
                          inert={!isOpen}
                        >
                          <div className="overflow-hidden">
                            <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-border pl-3 pb-1">
                              {item.children.map((child) => {
                                const childActive = isRouteActive(location.pathname, child);
                                return (
                                  <li key={child.to}>
                                    <Link
                                      to={child.to}
                                      aria-current={childActive ? 'page' : undefined}
                                      className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                                        childActive
                                          ? 'bg-primary/12 font-semibold text-primary'
                                          : 'text-muted hover:bg-surface-light hover:text-foreground'
                                      }`}
                                    >
                                      {child.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="hidden shrink-0 border-t border-border lg:block">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-11 w-full items-center justify-center gap-2 text-xs font-medium text-muted transition-colors hover:bg-surface-light hover:text-foreground"
          aria-label={effectiveCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        >
          {effectiveCollapsed ? (
            <Icon name="chevron_right" className="h-4 w-4" />
          ) : (
            <Icon name="chevron_left" className="h-4 w-4" />
          )}
          {!effectiveCollapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}

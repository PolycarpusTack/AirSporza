import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Types ---

export interface ActionItem {
  type: 'action';
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface SubmenuItem {
  type: 'submenu';
  label: string;
  icon?: React.ReactNode;
  children: MenuItem[];
}

export interface SeparatorItem {
  type: 'separator';
}

export type MenuItem = ActionItem | SubmenuItem | SeparatorItem;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// --- Constants ---

const EDGE_MARGIN = 8;

// --- Submenu component ---

function Submenu({ item, onClose }: { item: SubmenuItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    let left = rect.right;
    let top = rect.top;

    // Reposition if near right edge
    if (left + 180 > window.innerWidth - EDGE_MARGIN) {
      left = rect.left - 180;
    }
    // Reposition if near bottom edge
    if (top + 200 > window.innerHeight - EDGE_MARGIN) {
      top = Math.max(EDGE_MARGIN, window.innerHeight - 200 - EDGE_MARGIN);
    }

    setPos({ left, top });
  }, []);

  return (
    <div ref={parentRef} className="relative">
      <div className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors cursor-default">
        <span className="flex items-center gap-2">
          {item.icon && <span className="w-4 h-4 text-text-3 flex-shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </span>
        <span className="text-text-3 ml-3">&rsaquo;</span>
      </div>
      {pos && (
        <div
          ref={ref}
          className="fixed bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] animate-fade-in z-50"
          style={{ left: pos.left, top: pos.top }}
        >
          <MenuItems items={item.children} onClose={onClose} />
        </div>
      )}
    </div>
  );
}

// --- Menu items renderer ---

function MenuItems({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [hoveredSubmenu, setHoveredSubmenu] = useState<number | null>(null);

  return (
    <>
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="border-t border-border my-1" />;
        }

        if (item.type === 'submenu') {
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredSubmenu(i)}
              onMouseLeave={() => setHoveredSubmenu(null)}
            >
              {hoveredSubmenu === i ? (
                <Submenu item={item} onClose={onClose} />
              ) : (
                <div className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors cursor-default">
                  <span className="flex items-center gap-2">
                    {item.icon && <span className="w-4 h-4 text-text-3 flex-shrink-0">{item.icon}</span>}
                    <span>{item.label}</span>
                  </span>
                  <span className="text-text-3 ml-3">&rsaquo;</span>
                </div>
              )}
            </div>
          );
        }

        // Action item
        const actionItem = item;
        return (
          <button
            key={i}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface-2 transition-colors ${
              actionItem.danger ? 'text-danger' : ''
            } ${actionItem.disabled ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={() => {
              actionItem.onClick();
              onClose();
            }}
            disabled={actionItem.disabled}
          >
            {actionItem.icon && <span className="w-4 h-4 text-text-3 flex-shrink-0">{actionItem.icon}</span>}
            <span>{actionItem.label}</span>
          </button>
        );
      })}
    </>
  );
}

// --- Main ContextMenu component ---

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Reposition on mount if near viewport edges
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > window.innerWidth - EDGE_MARGIN) {
      adjustedX = window.innerWidth - rect.width - EDGE_MARGIN;
    }
    if (adjustedX < EDGE_MARGIN) {
      adjustedX = EDGE_MARGIN;
    }
    if (y + rect.height > window.innerHeight - EDGE_MARGIN) {
      adjustedY = window.innerHeight - rect.height - EDGE_MARGIN;
    }
    if (adjustedY < EDGE_MARGIN) {
      adjustedY = EDGE_MARGIN;
    }

    if (adjustedX !== x || adjustedY !== y) {
      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  // Dismiss on click-outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  // Dismiss on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Dismiss on scroll (capture phase)
  const handleScroll = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true); // capture phase

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleClickOutside, handleKeyDown, handleScroll]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] animate-fade-in z-50"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}

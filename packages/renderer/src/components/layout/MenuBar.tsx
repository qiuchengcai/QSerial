/**
 * 菜单栏组件 — Windows 标准菜单 (Mnemonic 下划线 + Alt 键导航)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

export interface MenuItem {
  label?: string;        // 含 & 符号标记 mnemonic，如 "新建本地终端(&L)"；separator 时可选
  shortcut?: string;     // 快捷键提示，如 "Ctrl+N"
  enabled?: boolean;     // 默认 true
  separator?: boolean;   // 是否为分隔线
  action?: () => void;   // 点击回调
  children?: MenuItem[]; // 子菜单
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuDef[];
}

function parseLabel(raw: string): { before: string; mnemonic: string; after: string; mnemonicLower: string } {
  const idx = raw.indexOf('&');
  if (idx === -1) return { before: raw, mnemonic: '', after: '', mnemonicLower: '' };
  const before = raw.slice(0, idx);
  const mnemonic = raw.charAt(idx + 1) || '';
  const after = raw.slice(idx + 2);
  return { before, mnemonic, after, mnemonicLower: mnemonic.toLowerCase() };
}

export const MenuBar: React.FC<MenuBarProps> = ({ menus }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [subOpenIndex, setSubOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
        setSubOpenIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Alt+letter keyboard activation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      for (let i = 0; i < menus.length; i++) {
        const { mnemonicLower } = parseLabel(menus[i].label);
        if (mnemonicLower === key) {
          e.preventDefault();
          setOpenIndex((prev) => (prev === i ? null : i));
          setSubOpenIndex(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menus]);

  // Keyboard navigation within open menu
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent, _menuIndex: number, items: MenuItem[], subOpenIdx: number | null) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const enabled = items.filter((it) => !it.separator && it.enabled !== false);
          if (enabled.length === 0) return;
          const currentIdx = subOpenIdx ?? -1;
          const nextIdx = currentIdx + 1;
          setSubOpenIndex(nextIdx < enabled.length ? nextIdx : 0);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const enabled = items.filter((it) => !it.separator && it.enabled !== false);
          if (enabled.length === 0) return;
          const currentIdx = subOpenIdx ?? 0;
          const prevIdx = currentIdx - 1;
          setSubOpenIndex(prevIdx >= 0 ? prevIdx : enabled.length - 1);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (subOpenIdx !== null) {
            const enabled = items.filter((it) => !it.separator && it.enabled !== false);
            const item = enabled[subOpenIdx];
            if (item?.action) item.action();
            setOpenIndex(null);
            setSubOpenIndex(null);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          setOpenIndex(null);
          setSubOpenIndex(null);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setOpenIndex((prev) => (prev === null ? 0 : (prev! + 1) % menus.length));
          setSubOpenIndex(null);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setOpenIndex((prev) => (prev === null ? menus.length - 1 : prev! === 0 ? menus.length - 1 : prev! - 1));
          setSubOpenIndex(null);
          break;
      }
    },
    [menus.length],
  );

  return (
    <div
      ref={barRef}
      className="flex items-center h-[var(--menubar-height)] bg-surface border-b border-border flex-shrink-0 select-none app-no-drag"
      onMouseLeave={() => {
        hoveringRef.current = false;
        setTimeout(() => {
          if (!hoveringRef.current) {
            setOpenIndex(null);
            setSubOpenIndex(null);
          }
        }, 150);
      }}
      onMouseEnter={() => {
        hoveringRef.current = true;
      }}
    >
      {menus.map((menu, menuIdx) => {
        const { before, mnemonic, after } = parseLabel(menu.label);
        const isOpen = openIndex === menuIdx;

        return (
          <div key={menuIdx} className="relative">
            <button
              className={`h-full px-3 text-xs flex items-center gap-0 transition-colors ${
                isOpen ? 'bg-primary/20 text-text' : 'text-text-secondary hover:bg-hover hover:text-text'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (isOpen) {
                  setOpenIndex(null);
                  setSubOpenIndex(null);
                } else {
                  setOpenIndex(menuIdx);
                  setSubOpenIndex(null);
                }
              }}
              onMouseEnter={() => {
                if (openIndex !== null) {
                  setOpenIndex(menuIdx);
                  setSubOpenIndex(null);
                }
              }}
            >
              {before}
              {mnemonic && <span className="underline">{mnemonic}</span>}
              {after}
            </button>

            {isOpen && (
              <div
                className="absolute top-full left-0 mt-0.5 bg-surface border border-border rounded-md shadow-lg py-1 min-w-[220px] z-50 animate-fadeIn"
                onKeyDown={(e) => handleMenuKeyDown(e, menuIdx, menu.items, subOpenIndex)}
              >
                {menu.items.map((item, itemIdx) => {
                  if (item.separator) {
                    return <div key={`sep-${itemIdx}`} className="my-1 border-t border-border" />;
                  }

                  const itemLabel = parseLabel(item.label || '');
                  const enabledItems = menu.items.filter((it) => !it.separator && it.enabled !== false);
                  const enabledIdx = enabledItems.indexOf(item);
                  const isHighlighted = subOpenIndex === enabledIdx;

                  return (
                    <button
                      key={itemIdx}
                      disabled={item.enabled === false}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                        isHighlighted ? 'bg-primary text-white' : 'hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                      onClick={() => {
                        if (item.action) {
                          item.action();
                          setOpenIndex(null);
                          setSubOpenIndex(null);
                        }
                      }}
                      onMouseEnter={() => {
                        if (item.enabled !== false) {
                          setSubOpenIndex(enabledIdx);
                        }
                      }}
                    >
                      <span>
                        {itemLabel.before}
                        {itemLabel.mnemonic && <span className="underline">{itemLabel.mnemonic}</span>}
                        {itemLabel.after}
                      </span>
                      {item.shortcut && (
                        <span className={`ml-6 text-[10px] opacity-60 ${isHighlighted ? 'text-white/70' : ''}`}>
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

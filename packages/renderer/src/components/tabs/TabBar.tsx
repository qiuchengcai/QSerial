/**
 * Tab 栏组件
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { ContextMenu } from '../common/ContextMenu';

interface ContextMenuState {
  x: number;
  y: number;
  tabId: string;
  tabName: string;
}

export const TabBar: React.FC = () => {
  const terminalState = useTerminalStore();
  const tabs = terminalState?.tabs || [];
  const activeTabId = terminalState?.activeTabId;
  const setActiveTab = terminalState?.setActiveTab;
  const closeTab = terminalState?.closeTab;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // 鼠标滚轮水平滚动
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      container.scrollLeft += e.deltaY * 2;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, tabId: string, tabName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabId,
      tabName,
    });
  };

  const handleCloseTab = (tabId: string) => {
    closeTab(tabId);
  };

  const handleCloseOtherTabs = (tabId: string) => {
    tabs.forEach((tab) => {
      if (tab.id !== tabId) {
        closeTab(tab.id);
      }
    });
  };

  const handleCloseTabsToRight = (tabId: string) => {
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    // 从右向左关闭，避免索引问题
    for (let i = tabs.length - 1; i > tabIndex; i--) {
      closeTab(tabs[i].id);
    }
  };

  const handleCloseTabsToLeft = (tabId: string) => {
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    // 从右向左关闭，避免索引问题
    for (let i = tabIndex - 1; i >= 0; i--) {
      closeTab(tabs[i].id);
    }
  };

  const handleCloseAllTabs = () => {
    // 从右向左关闭，避免索引问题
    for (let i = tabs.length - 1; i >= 0; i--) {
      closeTab(tabs[i].id);
    }
  };

  const getContextMenuItems = () => {
    if (!contextMenu) return [];

    const tabIndex = tabs.findIndex((t) => t.id === contextMenu.tabId);
    const hasTabsToRight = tabIndex < tabs.length - 1;
    const hasTabsToLeft = tabIndex > 0;
    const hasOtherTabs = tabs.length > 1;

    return [
      {
        label: '关闭',
        onClick: () => handleCloseTab(contextMenu.tabId),
      },
      {
        label: '关闭其他标签页',
        onClick: () => handleCloseOtherTabs(contextMenu.tabId),
        disabled: !hasOtherTabs,
      },
      {
        label: '关闭左侧标签页',
        onClick: () => handleCloseTabsToLeft(contextMenu.tabId),
        disabled: !hasTabsToLeft,
      },
      {
        label: '关闭右侧标签页',
        onClick: () => handleCloseTabsToRight(contextMenu.tabId),
        disabled: !hasTabsToRight,
      },
      {
        label: '关闭所有标签页',
        onClick: handleCloseAllTabs,
        divider: true,
      },
    ];
  };

  return (
    <>
      <div className="h-[var(--tab-height)] bg-surface flex items-center border-b border-border flex-shrink-0">
        {/* Tabs */}
        <div
          ref={tabsContainerRef}
          className="flex-1 flex items-center overflow-x-auto overflow-y-hidden scrollbar-hide"
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`
                flex-shrink-0 flex items-center gap-2 px-4 h-full cursor-pointer border-r border-border
                ${tab.id === activeTabId ? 'bg-primary/20 border-b-2 border-b-primary' : 'hover:bg-hover'}
              `}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id, tab.name)}
            >
              <span className="text-sm truncate max-w-[120px]">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-active"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

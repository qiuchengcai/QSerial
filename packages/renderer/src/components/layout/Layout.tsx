/**
 * 布局组件
 */

import React from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';

export const Layout: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* 标题栏 */}
      <TitleBar />

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 终端区域 */}
        <MainContent />
      </div>
    </div>
  );
};

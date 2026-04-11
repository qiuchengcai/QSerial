/**
 * 设置对话框组件
 */

import React, { useState } from 'react';
import { useThemeStore } from '@/stores/theme';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentTheme, themes, setTheme } = useThemeStore();
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('JetBrains Mono, Consolas, monospace');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [cursorBlink, setCursorBlink] = useState(true);
  const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>('bar');

  if (!isOpen) return null;

  const handleSave = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium">设置</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover"
          >
            ×
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-6">
          {/* 外观设置 */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-text-secondary">外观</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-text-secondary mb-2">主题</label>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setTheme(theme.id)}
                      className={`p-3 rounded border text-left transition-colors ${
                        currentTheme.id === theme.id
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border hover:border-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-4 h-4 rounded-full border border-border"
                          style={{ backgroundColor: theme.xterm.background }}
                        />
                        <span className="text-sm font-medium">{theme.name}</span>
                      </div>
                      <div className="flex gap-1">
                        {['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((color) => (
                          <div
                            key={color}
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: theme.xterm[color as keyof typeof theme.xterm] as string }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 终端设置 */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-text-secondary">终端</h3>
            <div className="space-y-3">
              {/* 字体大小 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  字体大小: {fontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* 字体 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">字体</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
                >
                  <option value="JetBrains Mono, Consolas, monospace">JetBrains Mono</option>
                  <option value="Consolas, monospace">Consolas</option>
                  <option value="Monaco, monospace">Monaco</option>
                  <option value="Source Code Pro, monospace">Source Code Pro</option>
                  <option value="Fira Code, monospace">Fira Code</option>
                </select>
              </div>

              {/* 行高 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  行高: {lineHeight}
                </label>
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.1"
                  value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* 光标样式 */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">光标样式</label>
                <select
                  value={cursorStyle}
                  onChange={(e) => setCursorStyle(e.target.value as typeof cursorStyle)}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
                >
                  <option value="block">方块</option>
                  <option value="underline">下划线</option>
                  <option value="bar">竖线</option>
                </select>
              </div>

              {/* 光标闪烁 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cursorBlink}
                  onChange={(e) => setCursorBlink(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">光标闪烁</span>
              </label>
            </div>
          </div>

          {/* 关于 */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-text-secondary">关于</h3>
            <div className="text-sm text-text-secondary space-y-1">
              <div>QSerial v0.1.0</div>
              <div>跨平台串口终端工具</div>
              <div className="pt-2">
                <a
                  href="#"
                  className="text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('检查更新功能开发中...');
                  }}
                >
                  检查更新
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded hover:bg-hover"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

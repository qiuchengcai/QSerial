/**
 * 命令生成结果卡片：hex / ASCII 双模式、解释、发送 / 复制 / 保存模板。
 */

import React, { useState } from 'react';
import type { CommandResult } from '@qserial/shared';

export const CommandCard: React.FC<{
  result: CommandResult;
  onSend: (command: string) => void;
}> = ({ result, onSend }) => {
  const [mode, setMode] = useState<'hex' | 'ascii'>(result.hex ? 'hex' : 'ascii');
  const [saved, setSaved] = useState(false);
  const command = mode === 'hex' ? result.hex : result.ascii;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      /* ignore */
    }
  };

  const saveTemplate = async () => {
    const name = prompt('模板名称');
    if (!name || !command) return;
    try {
      await window.qserial.plugin.invoke('qserial-plugin-assistant', 'templates.save', { name, command });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 overflow-hidden text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-accent/20">
        <span className="text-[10px] text-accent font-medium">生成的命令</span>
        <div className="flex gap-1">
          {result.hex && (
            <button
              onClick={() => setMode('hex')}
              className={`px-1.5 py-0.5 text-[10px] rounded ${mode === 'hex' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-hover'}`}
            >
              HEX
            </button>
          )}
          {result.ascii && (
            <button
              onClick={() => setMode('ascii')}
              className={`px-1.5 py-0.5 text-[10px] rounded ${mode === 'ascii' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-hover'}`}
            >
              ASCII
            </button>
          )}
        </div>
      </div>

      <pre className="px-2.5 py-2 text-[11px] font-mono whitespace-pre-wrap bg-background/50">
        {command || '（无）'}
      </pre>

      {result.explanation && (
        <div className="px-2.5 pb-2 text-[11px] text-text-secondary whitespace-pre-wrap">
          {result.explanation}
        </div>
      )}

      <div className="px-2.5 py-1.5 border-t border-accent/20 flex items-center gap-2">
        <button
          onClick={() => onSend(command)}
          disabled={!command}
          className="px-2 py-1 text-[11px] rounded bg-accent text-white hover:brightness-110 disabled:opacity-40"
        >
          发送到串口
        </button>
        <button onClick={copy} disabled={!command} className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover disabled:opacity-40">
          复制
        </button>
        <button onClick={saveTemplate} disabled={!command} className="px-2 py-1 text-[11px] rounded border border-border hover:bg-hover disabled:opacity-40">
          {saved ? '已保存' : '保存为模板'}
        </button>
      </div>
    </div>
  );
};

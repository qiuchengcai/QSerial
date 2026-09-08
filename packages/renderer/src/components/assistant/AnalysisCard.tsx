/**
 * 结构化日志分析结果卡片。
 */

import React, { useState } from 'react';
import type { LogAnalysisResult } from '@qserial/shared';

const SEVERITY_COLOR: Record<string, string> = {
  high: 'text-error border-error/40 bg-error/10',
  medium: 'text-warning border-warning/40 bg-warning/10',
  low: 'text-text-secondary border-border/60 bg-background/40',
};

export const AnalysisCard: React.FC<{
  result: LogAnalysisResult;
  rawLog?: string;
  onReanalyze?: () => void;
}> = ({ result, rawLog, onReanalyze }) => {
  const [showLog, setShowLog] = useState(false);
  const [saved, setSaved] = useState(false);

  const copyResult = async () => {
    const text = JSON.stringify(result, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const saveToKnowledge = async () => {
    try {
      const content = [
        `# 日志分析记录`,
        '',
        `## 协议`,
        `- 协议：${result.protocol}`,
        `- 置信度：${Math.round(result.confidence * 100)}%`,
        '',
        '## 关键信息',
        ...result.keyFields.map((f) => `- ${f.label}：${f.value}`),
        '',
        '## 异常',
        ...result.anomalies.map((a) => `- [${a.severity}] ${a.type}：${a.description}`),
        '',
        '## 建议',
        ...result.suggestions.map((s) => `- ${s}`),
        '',
        '## 原始日志',
        '```',
        rawLog || '',
        '```',
      ].join('\n');
      await window.qserial.plugin.invoke('qserial-plugin-assistant', 'docs.create', {
        moduleId: 'builtin-serial-troubleshooting',
        title: `分析笔记 ${new Date().toLocaleString()}`,
        content,
        type: 'md',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs">
      {/* 协议识别 */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background/40">
        <div className="flex-1">
          <div className="text-[10px] text-text-tertiary mb-0.5">协议识别</div>
          <div className="font-medium">
            {result.protocol}
            <span className="ml-2 text-[10px] text-text-secondary">
              置信度 {Math.round(result.confidence * 100)}%
            </span>
          </div>
        </div>
        <div className="w-24 h-1.5 rounded bg-border overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${result.confidence * 100}%` }} />
        </div>
      </div>

      {/* 关键信息 */}
      {result.keyFields.length > 0 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[10px] text-text-tertiary mb-1">关键信息</div>
          <div className="grid grid-cols-2 gap-1.5">
            {result.keyFields.map((f, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-text-secondary flex-shrink-0">{f.label}</span>
                <span className="font-mono truncate">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 异常检测 */}
      {result.anomalies.length > 0 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[10px] text-text-tertiary mb-1">异常检测</div>
          <div className="space-y-1">
            {result.anomalies.map((a, i) => (
              <div key={i} className={`px-2 py-1 rounded border ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.medium}`}>
                <span className="font-medium">{a.type}</span>
                <span className="ml-1.5">{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 排查建议 */}
      {result.suggestions.length > 0 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[10px] text-text-tertiary mb-1">排查建议</div>
          <ol className="list-decimal list-inside space-y-0.5">
            {result.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {/* 原始日志 */}
      {rawLog && (
        <div className="border-b border-border">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full px-3 py-1.5 text-left text-[10px] text-text-secondary hover:bg-hover"
          >
            {showLog ? '收起' : '展开'}原始日志
          </button>
          {showLog && (
            <pre className="px-3 pb-2 text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-text-secondary">
              {rawLog}
            </pre>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="px-3 py-2 flex items-center gap-2">
        <button onClick={copyResult} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-hover">
          复制解析结果
        </button>
        {onReanalyze && (
          <button onClick={onReanalyze} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-hover">
            重新分析
          </button>
        )}
        <button onClick={saveToKnowledge} className="px-2 py-1 text-[10px] rounded border border-border hover:bg-hover">
          {saved ? '已保存' : '保存到知识库'}
        </button>
      </div>
    </div>
  );
};

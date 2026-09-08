/**
 * 轻量 Markdown 渲染（标题 / 列表 / 代码块 / 表格 / 引用 / 行内样式）。
 * 基于 shared 的 parseMarkdown / parseInline；代码块带语言标识与复制按钮。
 */

import React, { useMemo, useState } from 'react';
import { parseMarkdown, parseInline } from '@qserial/shared';
import type { MarkdownBlock, InlineSegment } from '@qserial/shared';

function Inline({ text }: { text: string }) {
  const segs = parseInline(text);
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'bold') return <strong key={i}>{seg.content}</strong>;
        if (seg.type === 'italic') return <em key={i}>{seg.content}</em>;
        if (seg.type === 'code')
          return (
            <code key={i} className="px-1 py-0.5 rounded bg-background/60 font-mono text-[0.95em]">
              {seg.content}
            </code>
          );
        return <span key={i}>{seg.content}</span>;
      })}
    </>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="rounded-md border border-border overflow-hidden my-1">
      <div className="flex items-center justify-between px-2 py-1 bg-background/60 border-b border-border">
        <span className="text-[10px] font-mono text-text-tertiary">{language || 'text'}</span>
        <button onClick={copy} className="text-[10px] text-text-secondary hover:text-text">
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="p-2 text-[11px] font-mono overflow-x-auto bg-background/40 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-1">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} className="border border-border px-2 py-1 text-left font-medium bg-background/50">
                <Inline text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className="border border-border px-2 py-1">
                  <Inline text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block: MarkdownBlock, i: number): React.ReactNode {
  switch (block.type) {
    case 'heading':
      return (
        <div
          key={i}
          className={`font-semibold ${block.level <= 2 ? 'text-sm' : 'text-xs'} mt-2 mb-1`}
        >
          <Inline text={block.text} />
        </div>
      );
    case 'paragraph':
      return (
        <p key={i} className="text-xs leading-relaxed my-1">
          <Inline text={block.text} />
        </p>
      );
    case 'code':
      return <CodeBlock key={i} language={block.language} code={block.code} />;
    case 'list':
      return block.ordered ? (
        <ol key={i} className="list-decimal list-inside space-y-0.5 my-1 text-xs">
          {block.items.map((it, j) => (
            <li key={j}>
              <Inline text={it} />
            </li>
          ))}
        </ol>
      ) : (
        <ul key={i} className="list-disc list-inside space-y-0.5 my-1 text-xs">
          {block.items.map((it, j) => (
            <li key={j}>
              <Inline text={it} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <TableBlock key={i} header={block.header} rows={block.rows} />;
    case 'quote':
      return (
        <blockquote key={i} className="border-l-2 border-border pl-2 my-1 text-xs text-text-secondary">
          <Inline text={block.text} />
        </blockquote>
      );
    default:
      return null;
  }
}

export const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="markdown">{blocks.map((b, i) => renderBlock(b, i))}</div>;
};

// 供内部复用（避免未使用告警）
export type { MarkdownBlock, InlineSegment };

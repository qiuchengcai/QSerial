/**
 * 日志分析结构化 + 命令生成 + 快捷指令（纯函数）。
 * 通过 prompt 引导 LLM 输出 JSON，前端用 parseXxx 解析；失败时降级纯文本。
 */

import type {
  AnalysisField,
  AnalysisAnomaly,
  LogAnalysisResult,
  CommandResult,
  QuickPrompt,
} from '../types/assistant.js';

/** 日志分析系统提示（要求输出 JSON）。 */
export const ANALYSIS_SYSTEM_PROMPT =
  '你是串口协议分析专家。分析用户提供的串口日志，仅输出一个 JSON 对象（不要输出其它文字），格式：\n' +
  '{"protocol":"协议类型（Modbus RTU / AT / 未知等）","confidence":0到1的数字,"keyFields":[{"label":"字段名","value":"值"}],"anomalies":[{"type":"类型","description":"描述","severity":"high|medium|low"}],"suggestions":["建议1","建议2"]}';

/** 组装日志分析 prompt（含当前串口参数上下文）。 */
export function buildLogAnalysisPrompt(
  text: string,
  deviceContext?: Record<string, unknown>
): { system: string; user: string } {
  const ctxText = deviceContext
    ? Object.entries(deviceContext)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
  const user = [
    ctxText ? `【当前串口参数】\n${ctxText}` : '',
    '【日志内容】',
    '```',
    String(text).slice(0, 8000),
    '```',
    '请分析协议类型、关键字段、异常，并检查参数匹配度（如波特率是否可能不匹配）。',
  ]
    .filter(Boolean)
    .join('\n');
  return { system: ANALYSIS_SYSTEM_PROMPT, user };
}

/** 从文本中提取首个 JSON 对象并解析；无法解析返回 null。 */
export function extractJson(text: string): unknown {
  if (!text) return null;
  // 1. 直接解析
  try {
    return JSON.parse(text.trim());
  } catch {
    /* continue */
  }
  // 2. 提取 ```json ... ``` 围栏
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  // 3. 提取首个平衡的 {...}
  const start = text.indexOf('{');
  if (start >= 0) {
    const end = text.lastIndexOf('}');
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 解析结构化日志分析结果；非法结构返回 null（调用方降级纯文本）。 */
export function parseAnalysisResult(text: string): LogAnalysisResult | null {
  const json = extractJson(text);
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;

  const fieldsRaw = Array.isArray(o.keyFields) ? o.keyFields : [];
  const keyFields: AnalysisField[] = fieldsRaw
    .map((f) => {
      const x = f as Record<string, unknown>;
      return { label: asString(x?.label), value: asString(x?.value) };
    })
    .filter((f) => f.label || f.value);

  const anomaliesRaw = Array.isArray(o.anomalies) ? o.anomalies : [];
  const anomalies: AnalysisAnomaly[] = anomaliesRaw
    .map((a) => {
      const x = a as Record<string, unknown>;
      const severity: AnalysisAnomaly['severity'] =
        x?.severity === 'high' || x?.severity === 'medium' || x?.severity === 'low'
          ? (x.severity as AnalysisAnomaly['severity'])
          : 'medium';
      return { type: asString(x?.type), description: asString(x?.description), severity };
    })
    .filter((a) => a.description || a.type);

  const suggestionsRaw = Array.isArray(o.suggestions) ? o.suggestions : [];
  const suggestions = suggestionsRaw.map(asString).filter(Boolean);

  if (!o.protocol && keyFields.length === 0 && anomalies.length === 0) return null;

  const confidence = typeof o.confidence === 'number' ? o.confidence : 0;
  return {
    protocol: asString(o.protocol) || '未知',
    confidence: Math.max(0, Math.min(1, confidence)),
    keyFields,
    anomalies,
    suggestions,
  };
}

/** 命令生成系统提示（要求输出 JSON）。 */
export const COMMAND_SYSTEM_PROMPT =
  '你是嵌入式串口命令专家。根据自然语言需求生成可发送的命令，仅输出一个 JSON 对象：\n' +
  '{"hex":"十六进制字节（空格分隔，无则空串）","ascii":"ASCII 命令（无则空串）","explanation":"逐字节/指令含义说明"}';

/** 组装命令生成 prompt。 */
export function buildCommandPrompt(
  description: string,
  deviceContext?: Record<string, unknown>
): { system: string; user: string } {
  const ctxText = deviceContext
    ? Object.entries(deviceContext)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
  return {
    system: COMMAND_SYSTEM_PROMPT,
    user: [ctxText ? `【当前设备】\n${ctxText}` : '', `【需求】${description}`].filter(Boolean).join('\n'),
  };
}

/** 解析命令生成结果；非法返回 null。 */
export function parseCommandResult(text: string): CommandResult | null {
  const json = extractJson(text);
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const hex = asString(o.hex);
  const ascii = asString(o.ascii);
  const explanation = asString(o.explanation);
  if (!hex && !ascii) return null;
  return { hex, ascii, explanation };
}

/** 默认快捷指令（6 个）。 */
export const DEFAULT_QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'analysis-log', label: '分析这段日志', prompt: '请分析这段串口日志，识别协议类型、关键字段和可能的异常：', category: 'analysis' },
  { id: 'troubleshoot-garbled', label: '排查串口乱码', prompt: '串口通信出现乱码，可能的原因和排查步骤是什么？', category: 'analysis' },
  { id: 'troubleshoot-noresponse', label: '排查无响应', prompt: '串口发送命令后设备无响应，如何排查？', category: 'analysis' },
  { id: 'query-crc', label: 'CRC 怎么算', prompt: 'Modbus RTU 的 CRC16 校验如何计算？', category: 'query' },
  { id: 'gen-modbus', label: '生成 Modbus 命令', prompt: '帮我生成一条 Modbus RTU 命令，用于：', category: 'generate' },
  { id: 'gen-at', label: '生成 AT 指令', prompt: '帮我生成一组 AT 指令，用于：', category: 'generate' },
];

/**
 * Prompt 组装（纯函数）：将检索到的知识块、历史对话、当前设备上下文组装为 LLM 输入。
 */

export interface PromptChunkContext {
  moduleName: string;
  documentTitle: string;
  heading: string;
  snippet: string;
}

export interface PromptHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** 当前设备上下文（串口参数等，可空）。 */
export interface PromptDeviceContext {
  type?: string;
  name?: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  [key: string]: unknown;
}

export interface BuildPromptOptions {
  query: string;
  chunks: PromptChunkContext[];
  history?: PromptHistoryTurn[];
  context?: PromptDeviceContext;
}

export interface PromptResult {
  system: string;
  user: string;
}

export const ASSISTANT_SYSTEM_PROMPT =
  '你是 QSerial 的智能助手，精通串口调试、嵌入式开发与常见通信协议（Modbus、AT 指令等）。' +
  '请优先依据提供的【参考资料】回答；若资料不足以回答，请如实说明并给出排查建议。' +
  '回答使用简洁、分点式的技术语言，必要时给出可复制的命令或配置片段。' +
  '引用资料时用上角标 [n]（n 为参考资料编号）标注，不要单独输出【引用来源】列表。';

/** 将历史最近 N 轮格式化为对话文本。 */
export function formatHistory(history: PromptHistoryTurn[], maxTurns = 4): string {
  const recent = history.slice(-maxTurns * 2);
  if (recent.length === 0) return '';
  return recent.map((t) => `${t.role === 'user' ? '用户' : '助手'}：${t.content}`).join('\n');
}

/** 组装 system + user 两段式 prompt。 */
export function buildPrompt(options: BuildPromptOptions): PromptResult {
  const chunksText =
    options.chunks.length === 0
      ? '（无参考资料）'
      : options.chunks
          .map((c, i) => {
            const loc = [c.moduleName, c.documentTitle, c.heading].filter(Boolean).join(' / ');
            return `[${i + 1}] ${loc}\n${c.snippet}`;
          })
          .join('\n\n');

  const contextText = options.context ? describeDeviceContext(options.context) : '';

  const parts: string[] = [];
  if (contextText) parts.push(`【当前设备】\n${contextText}`);
  parts.push(`【参考资料】\n${chunksText}`);

  const historyText = formatHistory(options.history || []);
  if (historyText) parts.push(`【对话历史】\n${historyText}`);

  parts.push(`【问题】\n${options.query}`);

  return {
    system: ASSISTANT_SYSTEM_PROMPT,
    user: parts.join('\n\n'),
  };
}

/** 将设备上下文格式化为人类可读文本（无上下文返回空串）。 */
export function describeDeviceContext(context?: PromptDeviceContext): string {
  if (!context) return '';
  const parts: string[] = [];
  if (context.type) parts.push(`连接类型：${context.type}`);
  if (context.name) parts.push(`名称：${context.name}`);
  if (typeof context.baudRate === 'number') parts.push(`波特率：${context.baudRate}`);
  if (typeof context.dataBits === 'number') parts.push(`数据位：${context.dataBits}`);
  if (typeof context.stopBits === 'number') parts.push(`停止位：${context.stopBits}`);
  if (context.parity) parts.push(`校验位：${context.parity}`);
  return parts.join('\n');
}

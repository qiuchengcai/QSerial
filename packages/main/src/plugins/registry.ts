/**
 * 插件贡献注册表
 * 插件通过宿主 API（host-api.ts）注册的能力统一存放于此，
 * 供 MCP manager、设备识别、渲染进程 UI 等消费方按需读取。
 *
 * 每个条目都记录来源 pluginId，便于插件停用（deactivate）时精确回收，
 * 单个插件卸载/停用不影响其他插件贡献。
 */

/**
 * 设备识别规则（指纹）。结构与 conn.analyze.probe 使用的匹配规则一致。
 */
export interface DeviceProfile {
  name: string;
  patterns: string[];
  baud_hint?: number;
}

/**
 * 插件注册的 MCP 工具定义。name/description/inputSchema 与内置 MCP_TOOLS 同构。
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type PluginToolHandler = (args: Record<string, unknown>) => Promise<string> | string;

export interface PluginMcpTool {
  definition: McpToolDefinition;
  handler: PluginToolHandler;
}

/**
 * 插件注入的快捷按钮（结构镜像渲染进程 QuickButton，宽松字段）。
 */
export interface QuickButtonContribution {
  id: string;
  name: string;
  command: string;
  commands?: string[];
  delay?: number;
  noNewline?: boolean;
  description?: string;
  color?: string;
  textColor?: string;
}

/**
 * 插件注入的 UI 入口。
 */
export interface UiContribution {
  id: string;
  label: string;
  kind: 'sidebar' | 'setting' | 'contextMenu';
}

/**
 * 终端输出过滤器：接收原始输出字符串，返回处理后字符串。
 */
export interface OutputFilter {
  id: string;
  filter: (text: string) => string;
}

/**
 * 插件注册的 IPC 方法处理器。渲染进程经 `plugin:invoke` 调用，主进程按 pluginId+method 路由。
 */
export type PluginIpcHandler = (args: unknown) => unknown | Promise<unknown>;

/** 插件推送给渲染进程的事件负载。 */
export interface PluginIpcEvent {
  pluginId: string;
  event: string;
  payload: unknown;
}

// ==================== 注册表状态 ====================

const deviceProfiles = new Map<string, DeviceProfile[]>();
const mcpTools = new Map<string, PluginMcpTool>();
const quickButtons = new Map<string, QuickButtonContribution[]>();
const outputFilters = new Map<string, OutputFilter[]>();
const terminalCommands = new Map<string, Map<string, (args: unknown[]) => void | Promise<void>>>();
const uiEntries = new Map<string, UiContribution[]>();
const ipcHandlers = new Map<string, Map<string, PluginIpcHandler>>();
let ipcEventSink: ((event: PluginIpcEvent) => void) | null = null;

// ==================== 设备识别 ====================

export function addDeviceProfiles(pluginId: string, profiles: DeviceProfile[]): void {
  const list = deviceProfiles.get(pluginId) || [];
  for (const p of profiles) {
    if (p && typeof p.name === 'string' && Array.isArray(p.patterns)) {
      list.push({ name: p.name, patterns: p.patterns, baud_hint: p.baud_hint });
    }
  }
  deviceProfiles.set(pluginId, list);
}

export function removeDeviceProfiles(pluginId: string): void {
  deviceProfiles.delete(pluginId);
}

export function getDeviceProfiles(): DeviceProfile[] {
  const result: DeviceProfile[] = [];
  for (const list of deviceProfiles.values()) result.push(...list);
  return result;
}

// ==================== MCP 工具 ====================

export function addMcpTool(
  pluginId: string,
  definition: McpToolDefinition,
  handler: PluginToolHandler
): void {
  mcpTools.set(definition.name, { definition, handler });
  // 记录来源以便精确回收（同名覆盖，保持简单）
  mcpToolOwners.set(definition.name, pluginId);
}

const mcpToolOwners = new Map<string, string>();

export function removeMcpTools(pluginId: string): void {
  for (const [name, owner] of mcpToolOwners) {
    if (owner === pluginId) {
      mcpTools.delete(name);
      mcpToolOwners.delete(name);
    }
  }
}

export function getMcpToolDefinitions(): McpToolDefinition[] {
  return Array.from(mcpTools.values()).map((t) => t.definition);
}

export function getMcpToolHandler(name: string): PluginToolHandler | undefined {
  return mcpTools.get(name)?.handler;
}

// ==================== 快捷按钮 ====================

export function addQuickButtons(pluginId: string, buttons: QuickButtonContribution[]): void {
  quickButtons.set(
    pluginId,
    buttons.filter((b) => b && typeof b.name === 'string')
  );
}

export function removeQuickButtons(pluginId: string): void {
  quickButtons.delete(pluginId);
}

export function getQuickButtons(): QuickButtonContribution[] {
  const result: QuickButtonContribution[] = [];
  for (const list of quickButtons.values()) result.push(...list);
  return result;
}

// ==================== 终端输出过滤器 ====================

export function addOutputFilter(pluginId: string, filter: OutputFilter): void {
  const list = outputFilters.get(pluginId) || [];
  list.push(filter);
  outputFilters.set(pluginId, list);
}

export function removeOutputFilters(pluginId: string): void {
  outputFilters.delete(pluginId);
}

export function getOutputFilters(): OutputFilter[] {
  const result: OutputFilter[] = [];
  for (const list of outputFilters.values()) result.push(...list);
  return result;
}

// ==================== 终端命令 ====================

export function addTerminalCommand(
  pluginId: string,
  name: string,
  handler: (args: unknown[]) => void | Promise<void>
): void {
  let commands = terminalCommands.get(pluginId);
  if (!commands) {
    commands = new Map();
    terminalCommands.set(pluginId, commands);
  }
  commands.set(name, handler);
}

export function removeTerminalCommands(pluginId: string): void {
  terminalCommands.delete(pluginId);
}

// ==================== UI 入口 ====================

export function addUiEntries(pluginId: string, entries: UiContribution[]): void {
  uiEntries.set(
    pluginId,
    entries.filter((e) => e && typeof e.label === 'string')
  );
}

export function removeUiEntries(pluginId: string): void {
  uiEntries.delete(pluginId);
}

export function getUiEntries(): UiContribution[] {
  const result: UiContribution[] = [];
  for (const list of uiEntries.values()) result.push(...list);
  return result;
}

// ==================== 插件 IPC 桥 ====================

/** 注册插件 IPC 方法处理器。 */
export function registerIpcHandler(pluginId: string, method: string, handler: PluginIpcHandler): void {
  let methods = ipcHandlers.get(pluginId);
  if (!methods) {
    methods = new Map();
    ipcHandlers.set(pluginId, methods);
  }
  methods.set(method, handler);
}

/** 按 pluginId + method 查找处理器。 */
export function getIpcHandler(pluginId: string, method: string): PluginIpcHandler | undefined {
  return ipcHandlers.get(pluginId)?.get(method);
}

export function removeIpcHandlers(pluginId: string): void {
  ipcHandlers.delete(pluginId);
}

/** 设置事件下沉函数（由 main/index.ts 注入，将事件推送到渲染进程）。 */
export function setIpcEventSink(sink: (event: PluginIpcEvent) => void): void {
  ipcEventSink = sink;
}

/** 插件调用：将事件推送到渲染进程（无下沉函数时静默丢弃）。 */
export function emitPluginEvent(event: PluginIpcEvent): void {
  if (ipcEventSink) ipcEventSink(event);
}

/** 停用插件时回收其全部贡献 */
export function removeAllContributions(pluginId: string): void {
  removeDeviceProfiles(pluginId);
  removeMcpTools(pluginId);
  removeQuickButtons(pluginId);
  removeOutputFilters(pluginId);
  removeTerminalCommands(pluginId);
  removeUiEntries(pluginId);
  removeIpcHandlers(pluginId);
}

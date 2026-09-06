/**
 * 插件系统共享类型定义
 * 跨进程（主进程 / 渲染进程）可序列化的类型。
 * 宿主 API 的运行时类型（含函数签名）定义在 packages/main/src/plugins/types.ts。
 */

/**
 * 插件权限声明。插件清单 `permissions` 数组中声明的能力，
 * 在运行时通过宿主 API 裁剪；未声明的能力调用会抛出 PluginPermissionError。
 */
export type PluginPermission =
  | 'connection:read'
  | 'connection:write'
  | 'terminal:write'
  | 'mcp:register'
  | 'config'
  | 'device:register'
  | 'ui'
  | 'log';

/**
 * 插件清单（对应插件目录下的 package.json / plugin.json）。
 */
export interface PluginManifest {
  /** 唯一标识，缺失时回退到 name */
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** 入口文件（相对插件目录），导出 activate/deactivate。缺失时为纯声明式插件 */
  main?: string;
  /** 权限声明 */
  permissions: PluginPermission[];
  /** 是否为内置插件（随应用分发，默认启用） */
  builtin?: boolean;
  /** 配置项声明（可选）。由宿主统一渲染表单，插件仅声明 schema。 */
  configSchema?: PluginConfigSchema;
}

/**
 * 插件配置字段类型。
 */
export type PluginConfigFieldType = 'string' | 'number' | 'boolean' | 'select' | 'textarea';

/**
 * 插件配置字段声明。
 */
export interface PluginConfigField {
  key: string;
  label: string;
  type: PluginConfigFieldType;
  default?: string | number | boolean;
  description?: string;
  required?: boolean;
  /** select 类型的选项 */
  options?: Array<{ value: string; label: string }>;
  /** number 类型的取值范围（可选） */
  min?: number;
  max?: number;
}

/**
 * 插件配置 Schema（字段列表）。
 */
export interface PluginConfigSchema {
  fields: PluginConfigField[];
}

/**
 * 插件运行时状态。
 * `installing` / `uninstalling` / `updating` 为安装/卸载/重载过程中的瞬时状态，
 * 最终会落回 `active` / `disabled` / `error`。
 */
export type PluginStatus =
  | 'active'
  | 'inactive'
  | 'error'
  | 'disabled'
  | 'installing'
  | 'uninstalling'
  | 'updating';

/**
 * 渲染进程可见的插件信息（可序列化，不含函数）。
 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  permissions: PluginPermission[];
  enabled: boolean;
  status: PluginStatus;
  error?: string;
  builtin: boolean;
  hasMain: boolean;
  /** 配置项声明（供渲染进程渲染配置表单） */
  configSchema?: PluginConfigSchema;
}

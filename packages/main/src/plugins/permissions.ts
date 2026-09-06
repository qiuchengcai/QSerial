/**
 * 插件权限系统
 * 基于插件清单 permissions 声明进行能力裁剪。
 * 未声明的能力在运行时调用会抛出 PluginPermissionError。
 */

import type { PluginPermission } from '@qserial/shared';

/**
 * 权限拒绝错误。插件调用未声明能力时抛出。
 */
export class PluginPermissionError extends Error {
  public readonly permission: string;

  constructor(permission: PluginPermission) {
    super(
      `Plugin permission "${permission}" is not granted. ` +
        `Declare it in the plugin manifest "permissions" array.`
    );
    this.name = 'PluginPermissionError';
    this.permission = permission;
  }
}

/** 判断插件是否声明了指定权限 */
export function hasPermission(
  permissions: PluginPermission[],
  permission: PluginPermission
): boolean {
  return (permissions || []).includes(permission);
}

/** 断言权限，未声明则抛出 PluginPermissionError */
export function assertPermission(
  permissions: PluginPermission[],
  permission: PluginPermission
): void {
  if (!hasPermission(permissions, permission)) {
    throw new PluginPermissionError(permission);
  }
}

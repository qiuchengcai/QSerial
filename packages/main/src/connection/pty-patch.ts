/**
 * Patch node-pty 的 loadNativeModule 使其使用绝对路径 require
 *
 * 根因：asar 虚拟文件系统中，require() 的路径解析对 .node 文件可能失败，
 * 因为 .node 文件需要 process.dlopen() 加载真实的文件系统路径。
 * 使用绝对路径 require 可以确保直接加载 app.asar.unpacked 中的真实文件。
 */
import { createRequire } from 'module';
import * as path from 'path';

let patched = false;

export function ensurePtyPatch(): void {
  if (patched) return;
  patched = true;

  try {
    // 使用 createRequire 在当前模块作用域创建 require 函数
    const req = createRequire(import.meta.url);

    // 解析 node-pty 的 utils 模块路径
    const utilsPath = req.resolve('node-pty/lib/utils.js');
    const utilsDir = path.dirname(utilsPath);
    const nodePtyDir = path.resolve(utilsDir, '..');

    console.log('[pty-patch] node-pty root:', nodePtyDir);

    // 导入 utils 模块并 patch loadNativeModule
    const utils = req('node-pty/lib/utils.js') as {
      loadNativeModule: (name: string) => { dir: string; module: unknown };
      assign: (target: Record<string, unknown>, ...sources: Record<string, unknown>[]) => Record<string, unknown>;
    };

    const originalLoad = utils.loadNativeModule;

    utils.loadNativeModule = function (name: string) {
      const dirs = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];
      const errors: string[] = [];

      for (const d of dirs) {
        const absDir = path.resolve(nodePtyDir, d);
        const absPath = path.join(absDir, name + '.node');
        try {
          const mod = req(absPath);
          console.log(`[pty-patch] ✓ Loaded ${name}.node from ${absPath}`);
          return { dir: absDir, module: mod };
        } catch (e) {
          errors.push(`${absPath}: ${(e as Error).message}`);
        }
      }

      // Fallback: 尝试原始方法
      try {
        return originalLoad.call(utils, name);
      } catch {
        // ignore
      }

      throw new Error(
        `[pty-patch] Failed to load ${name}.node:\n  ${errors.join('\n  ')}`
      );
    };

    console.log('[pty-patch] Patch installed successfully');
  } catch (e) {
    console.error('[pty-patch] Failed to patch:', e);
  }
}

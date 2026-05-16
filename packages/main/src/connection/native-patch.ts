/**
 * 通用的 process.dlopen 补丁，解决 Windows 网络驱动器加载 .node 文件的限制
 *
 * node-pty / serialport / ssh2 的原生 .node 文件在 asar 中或 asarUnpack 后
 * 仍位于网络驱动器（SMB Z:）上，Windows 安全策略阻止从远程路径 dlopen。
 *
 * 此补丁拦截 process.dlopen，当加载失败时自动将 .node 及其依赖 DLL/subdir
 * 复制到本地临时目录后重试。
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';

let patched = false;
let tempDir = '';

function getTempDir(): string {
  if (!tempDir) {
    tempDir = path.join(app.getPath('temp'), 'qserial-native');
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function copyNativeModule(srcFile: string): string {
  const baseName = path.basename(srcFile);
  const dest = path.join(getTempDir(), baseName);

  const srcStat = fs.statSync(srcFile);
  const destStat = fs.statSync(dest, { throwIfNoEntry: false });
  if (!destStat || srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size) {
    fs.copyFileSync(srcFile, dest);
  }

  // 复制同目录下所有非 .node 文件（DLL/exe 等依赖），确保 Windows DLL 搜索路径能解析
  const srcDir = path.dirname(srcFile);
  try {
    for (const item of fs.readdirSync(srcDir)) {
      const srcItem = path.join(srcDir, item);
      let stat;
      try {
        stat = fs.statSync(srcItem);
      } catch { continue; }

      if (stat.isFile()) {
        if (item.endsWith('.node') || item.endsWith('.pdb')) continue;
        const destItem = path.join(getTempDir(), item);
        const ds = fs.statSync(destItem, { throwIfNoEntry: false });
        if (!ds || stat.mtimeMs > ds.mtimeMs || stat.size !== ds.size) {
          fs.copyFileSync(srcItem, destItem);
        }
      } else if (stat.isDirectory()) {
        const destItem = path.join(getTempDir(), item);
        if (!fs.existsSync(destItem)) {
          fs.cpSync(srcItem, destItem, { recursive: true });
        }
      }
    }
  } catch { /* 非关键，跳过 */ }

  return dest;
}

function isFromAppBundle(p: string): boolean {
  // 检查路径是否在 app.asar / app.asar.unpacked / resourcesPath 下
  try {
    const appPath = app.getAppPath();
    const rp = process.resourcesPath || '';
    return p.startsWith(appPath) || (rp !== '' && p.startsWith(rp));
  } catch {
    return false;
  }
}

export function ensureNativePatch(): void {
  if (patched) return;
  patched = true;

  const originalDlopen = process.dlopen;

  if (typeof originalDlopen !== 'function') {
    console.error('[native-patch] process.dlopen not available, skipping');
    return;
  }

  process.dlopen = function (
    module: object,
    filename: string,
    flags?: number,
  ) {
    try {
      return originalDlopen.call(this, module, filename, flags);
    } catch (err) {
      if (isFromAppBundle(filename)) {
        try {
          const tempFile = copyNativeModule(filename);
          console.log(
            '[native-patch] Reloaded from temp:',
            path.basename(filename),
            '→',
            tempFile,
          );
          return originalDlopen.call(this, module, tempFile, flags);
        } catch (e2) {
          console.error('[native-patch] Temp retry also failed:', (e2 as Error).message);
          throw err;
        }
      }
      throw err;
    }
  };

  console.log('[native-patch] process.dlopen patch installed');
}

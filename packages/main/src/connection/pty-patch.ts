/**
 * Patch node-pty 的 loadNativeModule 以正确处理 asar 打包和网络驱动器场景
 *
 * 两个问题：
 * 1. asar 中 require() 解析路径指向 app.asar 而非 app.asar.unpacked，
 *    .node 文件在 asar 中只是 stub，无法 dlopen
 * 2. 从网络驱动器（SMB 共享）加载 DLL 被 Windows 安全策略阻止 (Access is denied)
 *
 * 解决：将 .node 文件及其依赖 DLL 复制到本地临时目录后从那里加载。
 */
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

let patched = false;
let tempDir = '';

function getTempDir(): string {
  if (!tempDir) {
    tempDir = path.join(app.getPath('temp'), 'qserial-pty');
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function isAsarPath(p: string): boolean {
  return p.includes('app.asar') && !p.includes('app.asar.unpacked');
}

function asarToUnpacked(p: string): string {
  return p.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1');
}

function copyToTemp(src: string, destName: string): string {
  const dest = path.join(getTempDir(), destName);
  // Only copy if source is newer or destination doesn't exist
  try {
    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest, { throwIfNoEntry: false });
    if (!destStat || srcStat.mtimeMs > destStat.mtimeMs || srcStat.size !== destStat.size) {
      fs.copyFileSync(src, dest);
      console.log(`[pty-patch] Copied ${path.basename(src)} to temp`);
    }
  } catch {
    fs.copyFileSync(src, dest);
    console.log(`[pty-patch] Copied ${path.basename(src)} to temp`);
  }
  return dest;
}

function copyDirToTemp(srcDir: string, destName: string): string {
  const dest = path.join(getTempDir(), destName);
  if (!fs.existsSync(dest)) {
    fs.cpSync(srcDir, dest, { recursive: true });
  }
  return dest;
}

export function ensurePtyPatch(): void {
  if (patched) return;
  patched = true;

  try {
    const req = createRequire(import.meta.url);

    // 获取 node-pty 的实际文件系统路径（可能需要 asar → unpacked 转换）
    let utilsPath = req.resolve('node-pty/lib/utils.js');
    // 确保使用真实文件系统路径
    utilsPath = asarToUnpacked(utilsPath);

    const utilsDir = path.dirname(utilsPath);
    const nodePtyDir = path.resolve(utilsDir, '..');

    console.log('[pty-patch] node-pty root:', nodePtyDir);
    console.log('[pty-patch] Temp dir:', getTempDir());

    // Patch loadNativeModule
    const utils = req('node-pty/lib/utils.js') as {
      loadNativeModule: (name: string) => { dir: string; module: unknown };
      assign: (target: Record<string, unknown>, ...sources: Record<string, unknown>[]) => Record<string, unknown>;
    };

    utils.loadNativeModule = function (name: string) {
      const dirs = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];
      const errors: string[] = [];

      for (const d of dirs) {
        const absDir = path.resolve(nodePtyDir, d);
        const absPath = path.join(absDir, name + '.node');

        try {
          // 尝试直接加载
          return { dir: absDir, module: req(absPath) };
        } catch (e1) {
          // 如果失败，尝试从 unpacked 路径加载（处理 asar 重定向）
          const unpackedPath = asarToUnpacked(absPath);
          if (unpackedPath !== absPath) {
            try {
              const mod = req(unpackedPath);
              console.log(`[pty-patch] ✓ Loaded ${name}.node from unpacked: ${unpackedPath}`);
              return { dir: path.dirname(unpackedPath), module: mod };
            } catch (e2) {
              errors.push(`${unpackedPath}: ${(e2 as Error).message}`);
            }
          }
          errors.push(`${absPath}: ${(e1 as Error).message}`);
        }
      }

      // 所有直接路径都失败，尝试复制到本地临时目录后加载（解决网络驱动器限制）
      for (const d of dirs) {
        const absDir = path.resolve(nodePtyDir, d);
        let checkPath = absDir;
        if (isAsarPath(absDir)) {
          checkPath = asarToUnpacked(absDir);
        }

        const srcFile = path.join(checkPath, name + '.node');
        if (fs.existsSync(srcFile)) {
          try {
            const tempFile = copyToTemp(srcFile, name + '.node');

            // 也复制同目录下可能需要的 DLL
            try {
              const srcDir = path.dirname(checkPath);
              const items = fs.readdirSync(srcDir);
              for (const item of items) {
                if (item.endsWith('.dll') || item.endsWith('.exe')) {
                  const srcItem = path.join(srcDir, item);
                  copyToTemp(srcItem, item);
                }
              }
              // 复制 conpty/ 子目录（包含 conpty.dll）
              const conptySubDir = path.join(srcDir, 'conpty');
              if (fs.existsSync(conptySubDir)) {
                copyDirToTemp(conptySubDir, 'conpty');
              }
            } catch {
              // DLL 复制失败不影响主流程
            }

            const mod = req(tempFile);
            console.log(`[pty-patch] ✓ Loaded ${name}.node from temp: ${tempFile}`);
            return { dir: path.dirname(tempFile), module: mod };
          } catch (e) {
            errors.push(`temp(${srcFile}): ${(e as Error).message}`);
          }
        }
      }

      throw new Error(
        `[pty-patch] Failed to load ${name}.node:\n  ${errors.join('\n  ')}`
      );
    };

    console.log('[pty-patch] Patch installed');
  } catch (e) {
    console.error('[pty-patch] Failed to patch:', e);
  }
}

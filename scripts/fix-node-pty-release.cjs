/**
 * 修复 node-pty 在 Windows release 版本中的原生模块加载问题
 *
 * node-pty 的 loadNativeModule 优先检查 build/Release/ 目录。
 * 在 Linux 上构建 Windows 版本时，build/Release/ 只有 Linux 的 pty.node，
 * 没有 Windows 的 conpty.node。prebuilds/ 目录有 Windows 预编译版本，
 * 但通过 asar 虚拟文件系统的 require() 加载 .node 文件可能失败。
 *
 * 此脚本将 Windows 预编译文件复制到 build/Release/，确保首路径加载成功。
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.resolve(__dirname, '..', 'release', 'win-unpacked');
if (!fs.existsSync(releaseDir)) {
  console.log('[fix-node-pty] release/win-unpacked not found, skipping');
  process.exit(0);
}

// asarUnpack 目录
const unpackedBase = path.join(releaseDir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty');
if (!fs.existsSync(unpackedBase)) {
  console.log('[fix-node-pty] app.asar.unpacked/node_modules/node-pty not found, skipping');
  process.exit(0);
}

const prebuildsWin = path.join(unpackedBase, 'prebuilds', 'win32-x64');
const buildRelease = path.join(unpackedBase, 'build', 'Release');

if (!fs.existsSync(prebuildsWin)) {
  console.log('[fix-node-pty] prebuilds/win32-x64 not found, skipping');
  process.exit(0);
}

if (!fs.existsSync(buildRelease)) {
  fs.mkdirSync(buildRelease, { recursive: true });
}

// 复制 Windows .node 文件到 build/Release/
const files = fs.readdirSync(prebuildsWin).filter(f => f.endsWith('.node'));
for (const file of files) {
  const src = path.join(prebuildsWin, file);
  const dst = path.join(buildRelease, file);
  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log(`[fix-node-pty] Copied ${file} to build/Release/`);
  }
}

// 同时复制 conpty DLL 目录
const conptyDir = path.join(prebuildsWin, 'conpty');
const conptyDest = path.join(buildRelease, 'conpty');
if (fs.existsSync(conptyDir) && !fs.existsSync(conptyDest)) {
  fs.cpSync(conptyDir, conptyDest, { recursive: true });
  console.log('[fix-node-pty] Copied conpty/ directory to build/Release/');
}

console.log('[fix-node-pty] Done');

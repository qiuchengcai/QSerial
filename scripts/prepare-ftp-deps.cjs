/**
 * 准备 ftp-srv 的依赖到 resources/ftp-node-modules 目录
 * electron-builder 使用 asar 打包时，pnpm 的符号链接结构无法正确工作
 * 因此需要将 ftp-srv 及其所有依赖打平安装到独立目录
 * 运行时从 extraResources 路径加载 ftp-srv
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FTP_DIR = path.join(ROOT, 'resources', 'ftp-node-modules');

// 清理旧目录
if (fs.existsSync(FTP_DIR)) {
  fs.rmSync(FTP_DIR, { recursive: true, force: true });
}

fs.mkdirSync(FTP_DIR, { recursive: true });

// 在独立目录中用 npm 初始化并安装 ftp-srv
const pkgJson = {
  name: 'ftp-deps',
  version: '1.0.0',
  private: true,
  dependencies: {
    'ftp-srv': '^4.6.3',
  },
  // Windows 不需要 dtrace-provider，禁用可选依赖
  optionalDependencies: {},
};

fs.writeFileSync(path.join(FTP_DIR, 'package.json'), JSON.stringify(pkgJson, null, 2));

console.log('Installing ftp-srv dependencies (flat)...');
try {
  const output = execSync('npm install --omit=dev --no-package-lock --ignore-scripts --no-audit --no-fund 2>&1', {
    cwd: FTP_DIR,
    encoding: 'utf-8',
  });
  // 过滤 npm warn 信息，只显示关键输出
  const lines = output.split('\n').filter(line => {
    if (line.startsWith('npm warn')) return false;
    return line.trim().length > 0;
  });
  if (lines.length > 0) {
    console.log(lines.join('\n'));
  }
} catch (err) {
  console.error('Failed to install ftp-srv dependencies');
  process.exit(1);
}

// 删除不需要的文件：package.json、package-lock.json、dtrace-provider（Windows 不需要）
fs.unlinkSync(path.join(FTP_DIR, 'package.json'));
const lockFile = path.join(FTP_DIR, 'package-lock.json');
if (fs.existsSync(lockFile)) {
  fs.unlinkSync(lockFile);
}

// 移除 dtrace-provider（Windows 上不需要，可能导致崩溃）
const dtraceDir = path.join(FTP_DIR, 'node_modules', 'dtrace-provider');
if (fs.existsSync(dtraceDir)) {
  fs.rmSync(dtraceDir, { recursive: true, force: true });
  console.log('Removed dtrace-provider (not needed on Windows)');
}

// 移除 .bin 目录（符号链接在 Windows 上无效，运行时不需要）
const binDir = path.join(FTP_DIR, 'node_modules', '.bin');
if (fs.existsSync(binDir)) {
  fs.rmSync(binDir, { recursive: true, force: true });
  console.log('Removed .bin directory (symlinks not needed on Windows)');
}

console.log('ftp-srv dependencies prepared at:', FTP_DIR);

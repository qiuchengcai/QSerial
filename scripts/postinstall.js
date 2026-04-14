import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 安装后构建共享包
console.log('Building shared package after install...');

const build = spawn('pnpm', ['build:shared'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

build.on('close', (code) => {
  if (code !== 0) {
    console.warn('Warning: Failed to build shared package');
  }
});

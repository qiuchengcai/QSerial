import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.argv.includes('--dev');

// 构建共享包
console.log('Building shared package...');
const buildShared = spawn('pnpm', ['build:shared'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

buildShared.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to build shared package');
    process.exit(1);
  }

  // 构建主进程
  console.log('Building main process...');
  const buildMain = spawn('pnpm', ['build:main'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  buildMain.on('close', (code) => {
    if (code !== 0) {
      console.error('Failed to build main process');
      process.exit(1);
    }

    if (isDev) {
      // 开发模式：启动 Vite 和 Electron
      console.log('Starting development servers...');

      // 启动渲染进程开发服务器
      const vite = spawn('pnpm', ['dev:renderer'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true,
      });

      // 等待 Vite 启动后启动 Electron
      setTimeout(() => {
        console.log('Starting Electron...');
        const electron = spawn('electron', ['packages/main/dist/index.js'], {
          cwd: path.join(__dirname, '..'),
          stdio: 'inherit',
          shell: true,
          env: { ...process.env, NODE_ENV: 'development' },
        });

        electron.on('close', () => {
          vite.kill();
          process.exit(0);
        });
      }, 3000);
    } else {
      // 生产模式：构建渲染进程
      console.log('Building renderer...');
      const buildRenderer = spawn('pnpm', ['build:renderer'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true,
      });

      buildRenderer.on('close', (code) => {
        if (code !== 0) {
          console.error('Failed to build renderer');
          process.exit(1);
        }
        console.log('Build complete!');
      });
    }
  });
});

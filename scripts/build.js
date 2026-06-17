import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { request } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.argv.includes('--dev');
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173', 10);

function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = request({ hostname: 'localhost', port, method: 'HEAD', timeout: 500 }, () => {
        req.destroy();
        resolve();
      });
      req.on('error', () => {
        req.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

// 鏋勫缓鍏变韩鍖?
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

  // 鏋勫缓涓昏繘绋?
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
      // 寮€鍙戞ā寮忥細鍚姩 Vite 鍜?Electron
      console.log('Starting development servers...');

      // 鍚姩娓叉煋杩涚▼寮€鍙戞湇鍔″櫒
      const vite = spawn('pnpm', ['dev:renderer'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true,
      });

      // 绛夊緟 Vite 鍚姩鍚庡惎鍔?Electron
      waitForPort(VITE_PORT).then(() => {
        console.log(`Vite ready on port ${VITE_PORT}, starting Electron...`);
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
      }).catch((err) => {
        console.error(err.message);
        vite.kill();
        process.exit(1);
      });
    } else {
      // 鐢熶骇妯″紡锛氭瀯寤烘覆鏌撹繘绋?
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

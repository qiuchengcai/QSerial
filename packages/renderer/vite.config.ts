import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Git Bash 下 __dirname 返回 /mnt/f/... 格式，esbuild.exe (Windows) 无法识别
// 统一转换为 Windows 原生路径 (F:\...)
function toSysPath(p: string): string {
  const m = p.match(/^\/mnt\/([a-z])\//i);
  if (m) return m[1].toUpperCase() + ':\\' + p.slice(7).replace(/\//g, '\\');
  return p;
}

const srcDir = toSysPath(resolve(__dirname, 'src'));

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

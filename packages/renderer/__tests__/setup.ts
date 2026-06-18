/**
 * Renderer 测试 Setup
 * Mock window.qserial (Electron preload bridge) 和浏览器 API
 * 仅在 jsdom 环境下生效
 */
import { vi } from 'vitest';

// Only run in jsdom environment
if (typeof window !== 'undefined') {
  // Simple unsubscribe function
  const noop = function() { /* noop */ };

  // Mock window.qserial
  const mockQserial = {
  connection: {
    create: vi.fn().mockResolvedValue({ id: 'mock-conn-1' }),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue({ state: 'connected' }),
    onData: vi.fn().mockReturnValue(noop),
    onStateChange: vi.fn().mockReturnValue(noop),
    onError: vi.fn().mockReturnValue(noop),
  },
  serial: {
    list: vi.fn().mockResolvedValue([]),
  },
  config: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue({}),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    setTitle: vi.fn(),
  },
  app: {
    version: vi.fn().mockResolvedValue('1.0.0'),
    quit: vi.fn(),
  },
  tftp: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ running: false, port: 69, rootDir: '' }),
    pickDir: vi.fn().mockResolvedValue('/test/tftp'),
    onStatusChange: vi.fn().mockReturnValue(noop),
    onTransfer: vi.fn().mockReturnValue(noop),
  },
  nfs: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ running: false, exportDir: '', allowedClients: '*', options: '' }),
    pickDir: vi.fn().mockResolvedValue('/test/nfs'),
    getMountHint: vi.fn().mockResolvedValue({ localIp: '127.0.0.1', exportDir: '/test', mountCmd: '' }),
    onStatusChange: vi.fn().mockReturnValue(noop),
    onClient: vi.fn().mockReturnValue(noop),
  },
  ftp: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ running: false, port: 2121, rootDir: '', username: 'anonymous', hasPassword: false }),
    pickDir: vi.fn().mockResolvedValue('/test/ftp'),
    getClients: vi.fn().mockResolvedValue([]),
    onStatusChange: vi.fn().mockReturnValue(noop),
    onClient: vi.fn().mockReturnValue(noop),
  },
  log: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    pickFile: vi.fn().mockResolvedValue('/test/log.txt'),
  },
  connectionServer: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({}),
  },
  mcp: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ running: false, port: 9800 }),
    onStatusChange: vi.fn().mockReturnValue(noop),
    onConnectionCreated: vi.fn().mockReturnValue(noop),
    onShareChanged: vi.fn().mockReturnValue(noop),
  },
  dialog: {
    pickDir: vi.fn().mockResolvedValue('/test/dir'),
  },
  getLocalIp: vi.fn().mockResolvedValue('127.0.0.1'),
  readFile: vi.fn().mockResolvedValue('{}'),
  sftp: {
    create: vi.fn().mockResolvedValue({ sftpId: 'mock-sftp-1' }),
    destroy: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    download: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({}),
    readlink: vi.fn().mockResolvedValue(''),
    symlink: vi.fn().mockResolvedValue(undefined),
    pickLocalFile: vi.fn().mockResolvedValue('/test/local.txt'),
    pickLocalDir: vi.fn().mockResolvedValue('/test/local-dir'),
    realpath: vi.fn().mockResolvedValue(''),
    onProgress: vi.fn().mockReturnValue(noop),
  },
};

  // Set up the global mock before any store imports
  Object.defineProperty(window, 'qserial', {
    value: mockQserial,
    writable: true,
    configurable: true,
  });

  // Mock window.matchMedia for Tailwind/dark-mode compatibility
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(function(query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });

  // Mock localStorage
  const localStorageStore: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(function(key: string) { return localStorageStore[key] ?? null; }),
      setItem: vi.fn(function(key: string, value: string) { localStorageStore[key] = value; }),
      removeItem: vi.fn(function(key: string) { delete localStorageStore[key]; }),
      clear: vi.fn(function() { for (const k in localStorageStore) delete localStorageStore[k]; }),
    },
  });
}

// Mock crypto.randomUUID (works in both node and jsdom)
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      },
    },
    writable: true,
    configurable: true,
  });
}

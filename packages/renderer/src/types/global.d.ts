/**
 * 全局类型声明
 */

import type { SerialPortInfo } from '@qserial/shared';

interface QSerialAPI {
  connection: {
    create: (options: unknown) => Promise<{ id: string }>;
    open: (id: string) => Promise<void>;
    close: (id: string) => Promise<void>;
    destroy: (id: string) => Promise<void>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    getState: (id: string) => Promise<{ state: string }>;
    onData: (id: string, callback: (data: string) => void) => () => void;
    onStateChange: (id: string, callback: (state: string) => void) => () => void;
    onError: (id: string, callback: (error: string) => void) => () => void;
  };

  serial: {
    list: () => Promise<SerialPortInfo[]>;
  };

  config: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
  };

  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setTitle: (title: string) => Promise<void>;
  };

  app: {
    version: () => Promise<string>;
    quit: () => Promise<void>;
  };
}

declare global {
  interface Window {
    qserial: QSerialAPI;
  }
}

export {};

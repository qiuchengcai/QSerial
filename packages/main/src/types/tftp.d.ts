/**
 * Type declarations for tftp module
 */

declare module 'tftp' {
  interface TftpServerOptions {
    host?: string;
    port?: number;
    root?: string;
    denyPUT?: boolean;
    denyGET?: boolean;
    blockSize?: number;
    windowSize?: number;
    retries?: number;
    timeout?: number;
  }

  interface TftpStats {
    blockSize: number;
    windowSize: number;
    size: number | null;
    userExtensions: Record<string, unknown>;
    retries: number;
    timeout: number;
    localAddress: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
  }

  interface TftpGetStream extends NodeJS.ReadableStream {
    file: string;
    method: 'GET' | 'PUT';
    stats: TftpStats;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'abort', listener: () => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean }): T;
    abort(error?: string): void;
    close(): void;
  }

  interface TftpPutStream extends NodeJS.WritableStream {
    setSize(size: number): void;
    setUserExtensions(extensions: Record<string, unknown>): void;
    write(chunk: Buffer, callback?: () => void): boolean;
    write(chunk: Buffer, encoding?: BufferEncoding, callback?: () => void): boolean;
    end(callback?: () => void): void;
  }

  interface TftpServer extends NodeJS.EventEmitter {
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'request', listener: (req: TftpGetStream, res: TftpPutStream) => void): this;
    listen(): void;
    close(): void;
  }

  export function createServer(options?: TftpServerOptions, requestListener?: (req: TftpGetStream, res: TftpPutStream) => void): TftpServer;
}

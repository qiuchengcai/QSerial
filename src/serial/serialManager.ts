import { SerialPort } from 'serialport';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { TerminalManager } from '../terminal/terminalManager';
import { Logger } from '../utils/logger';

export interface PortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}

export interface SerialConnection {
    port: SerialPort;
    path: string;
    baudRate: number;
    isOpen: boolean;
}

export class SerialManager {
    private connection: SerialConnection | null = null;
    private terminalManager: TerminalManager;

    constructor(terminalManager: TerminalManager) {
        this.terminalManager = terminalManager;
    }

    private getEncoding(): string {
        return vscode.workspace.getConfiguration('qserial.serial').get('encoding', 'gbk');
    }

    async listPorts(): Promise<PortInfo[]> {
        try {
            const ports = await SerialPort.list();
            return ports.map(p => ({
                path: p.path,
                manufacturer: p.manufacturer,
                serialNumber: p.serialNumber,
                vendorId: p.vendorId,
                productId: p.productId
            }));
        } catch (error) {
            Logger.error('Failed to list ports: ' + error);
            return [];
        }
    }

    async connect(path: string, baudRate: number): Promise<void> {
        if (this.connection?.isOpen) {
            await this.disconnect();
        }

        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('qserial.serial');
            const dataBits = config.get<number>('dataBits', 8) as 5 | 6 | 7 | 8;
            const stopBits = config.get<number>('stopBits', 1) as 1 | 2;
            const parity = config.get<string>('parity', 'none') as 'none' | 'even' | 'odd' | 'mark' | 'space';

            const port = new SerialPort({
                path,
                baudRate,
                dataBits,
                stopBits,
                parity,
                autoOpen: false
            });

            port.open((err) => {
                if (err) {
                    Logger.error('Failed to open port: ' + err.message);
                    reject(err.message);
                    return;
                }

                this.connection = {
                    port,
                    path,
                    baudRate,
                    isOpen: true
                };

                // Create terminal for this connection
                this.terminalManager.createSerialTerminal(path, (data) => {
                    if (this.connection?.isOpen) {
                        const encoding = this.getEncoding();
                        const buffer = encoding === 'hex'
                            ? Buffer.from(data.replace(/\s/g, ''), 'hex')
                            : iconv.encode(data, encoding);
                        this.connection.port.write(buffer);
                    }
                });

                // Handle incoming data
                port.on('data', (data: Buffer) => {
                    this.terminalManager.writeToSerialTerminal(data);
                });

                port.on('error', (err) => {
                    Logger.error('Serial port error: ' + err.message);
                    vscode.window.showErrorMessage(`Serial port error: ${err.message}`);
                });

                port.on('close', () => {
                    Logger.info('Serial port closed');
                    this.connection = null;
                    this.terminalManager.closeSerialTerminal();
                });

                Logger.info(`Connected to ${path} at ${baudRate} baud`);
                
                // 杩炴帴鍚庤嚜鍔ㄥ彂閫佹崲琛岀锛岃Е鍙戣澶囨樉绀烘彁绀虹
                const autoNewline = config.get<boolean>('autoNewline', true);
                if (autoNewline) {
                    setTimeout(() => {
                        if (this.connection?.isOpen) {
                            port.write('\n');
                        }
                    }, 100);
                }
                
                resolve();
            });
        });
    }

    async disconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                resolve();
                return;
            }

            this.connection.port.close((err) => {
                if (err) {
                    reject(err.message);
                    return;
                }
                this.connection = null;
                this.terminalManager.closeSerialTerminal();
                resolve();
            });
        });
    }

    async send(data: string | Buffer): Promise<void> {
        if (!this.connection?.isOpen) {
            throw new Error('Serial port not connected');
        }

        return new Promise((resolve, reject) => {
            this.connection!.port.write(data, (err) => {
                if (err) {
                    reject(err.message);
                } else {
                    resolve();
                }
            });
        });
    }

    isConnected(): boolean {
        return this.connection?.isOpen ?? false;
    }

    getConnectionInfo(): SerialConnection | null {
        return this.connection;
    }
}

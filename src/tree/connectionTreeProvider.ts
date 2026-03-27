import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConnectionItem | undefined | null | void> =
        new vscode.EventEmitter<ConnectionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConnectionItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(
        private serialManager: SerialManager,
        private sshManager: SSHManager
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConnectionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionItem): Promise<ConnectionItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.contextValue === 'serial-section') {
            return this.getSerialItems();
        }

        if (element.contextValue === 'ssh-section') {
            return this.getSSHItems();
        }

        return [];
    }

    private getRootItems(): ConnectionItem[] {
        const items: ConnectionItem[] = [];

        // Serial section
        const serialSection = new ConnectionItem(
            '串口',
            vscode.TreeItemCollapsibleState.Expanded,
            'serial-section'
        );
        serialSection.iconPath = new vscode.ThemeIcon('plug');

        // SSH section
        const sshSection = new ConnectionItem(
            'SSH',
            vscode.TreeItemCollapsibleState.Expanded,
            'ssh-section'
        );
        sshSection.iconPath = new vscode.ThemeIcon('terminal');

        return [serialSection, sshSection];
    }

    private async getSerialItems(): Promise<ConnectionItem[]> {
        const items: ConnectionItem[] = [];

        // Show current connection first
        const serialConn = this.serialManager.getConnectionInfo();
        if (serialConn) {
            const connectedItem = new ConnectionItem(
                '🔌 ' + serialConn.path,
                vscode.TreeItemCollapsibleState.None,
                'serial-connected'
            );
            connectedItem.description = `${serialConn.baudRate} baud`;
            connectedItem.tooltip = '已连接 - 点击断开';
            connectedItem.command = {
                command: 'qserial.serial.disconnect',
                title: '断开连接'
            };
            items.push(connectedItem);
        }

        // Show available ports
        const ports = await this.serialManager.listPorts();
        for (const port of ports) {
            if (serialConn && port.path === serialConn.path) {
                continue;
            }
            const item = new ConnectionItem(
                '📍 ' + port.path,
                vscode.TreeItemCollapsibleState.None,
                'serial-port'
            );
            item.itemData = port;
            item.description = port.manufacturer || '';
            item.tooltip = `${port.path}${port.vendorId ? `\nVID:${port.vendorId} PID:${port.productId || 'N/A'}` : ''}\n\n点击连接`;
            item.command = {
                command: 'qserial.serial.connectPort',
                title: '连接',
                arguments: [port]
            };
            items.push(item);
        }

        // Add connect button
        const connectItem = new ConnectionItem(
            serialConn ? '切换连接...' : '连接串口...',
            vscode.TreeItemCollapsibleState.None,
            'serial-connect'
        );
        connectItem.iconPath = new vscode.ThemeIcon('add');
        connectItem.command = {
            command: 'qserial.serial.connect',
            title: '连接串口'
        };
        items.push(connectItem);

        // Refresh button
        const refreshItem = new ConnectionItem(
            '刷新列表',
            vscode.TreeItemCollapsibleState.None,
            'serial-refresh'
        );
        refreshItem.iconPath = new vscode.ThemeIcon('refresh');
        refreshItem.command = {
            command: 'qserial.serial.refreshPorts',
            title: '刷新'
        };
        items.push(refreshItem);

        return items;
    }

    private getSSHItems(): ConnectionItem[] {
        const items: ConnectionItem[] = [];

        // Show saved hosts
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);
        
        // Get all active connections
        const activeConnections = this.sshManager.getAllConnections();
        const connectedHostIds = new Set(activeConnections.map(c => c.hostId));

        // 检查是否有主机没有 ID，如果有则生成并保存
        const needsUpdate = savedHosts.some((h: any) => !h.id);
        if (needsUpdate) {
            const baseTime = Date.now();
            for (let i = 0; i < savedHosts.length; i++) {
                if (!savedHosts[i].id) {
                    savedHosts[i].id = `ssh-${baseTime}-${i}-${Math.random().toString(36).substring(2, 11)}`;
                }
            }
            config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
        }

        // 检查是否有重复 ID，如果有则重新生成
        const idSet = new Set<string>();
        let hasDuplicates = false;
        for (const host of savedHosts) {
            if (idSet.has(host.id)) {
                host.id = `ssh-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                hasDuplicates = true;
            }
            idSet.add(host.id);
        }
        if (hasDuplicates) {
            config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
        }

        for (const host of savedHosts) {
            const isConnected = host.id && connectedHostIds.has(host.id);
            const contextValue = isConnected ? 'ssh-connected' : 'ssh-host';

            const item = new ConnectionItem(
                (isConnected ? '🔌 ' : '📍 ') + (host.name || host.host),
                vscode.TreeItemCollapsibleState.None,
                contextValue
            );
            item.id = host.id;
            item.itemData = { ...host, id: host.id };
            item.description = `${host.username}@${host.host}:${host.port || 22}`;
            item.tooltip = isConnected ? '已连接 - 点击断开' : `${host.name || host.host}\n${host.username}@${host.host}:${host.port || 22}\n\n点击连接`;
            item.command = {
                command: isConnected ? 'qserial.ssh.disconnect' : 'qserial.ssh.quickConnect',
                title: isConnected ? '断开连接' : '连接',
                arguments: [item]
            };
            items.push(item);
        }

        // Add new connection button
        const newItem = new ConnectionItem(
            '新建连接...',
            vscode.TreeItemCollapsibleState.None,
            'ssh-new'
        );
        newItem.iconPath = new vscode.ThemeIcon('add');
        newItem.command = {
            command: 'qserial.ssh.connect',
            title: '新建连接'
        };
        items.push(newItem);

        return items;
    }
}

class ConnectionItem extends vscode.TreeItem {
    itemData?: any;
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}

import * as vscode from 'vscode';
import { SerialManager } from '../serial/serialManager';
import { SSHManager } from '../ssh/sshManager';
import { ButtonManager, CustomButton, CommandItem } from '../buttons/buttonManager';

// 选项卡类型
export type TabType = 'connections' | 'buttons' | 'settings';

export class UnifiedTreeProvider implements vscode.TreeDataProvider<UnifiedItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<UnifiedItem | undefined | null | void> =
        new vscode.EventEmitter<UnifiedItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<UnifiedItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private currentTab: TabType = 'connections';

    constructor(
        private serialManager: SerialManager,
        private sshManager: SSHManager,
        private buttonManager: ButtonManager
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    switchTab(tab: TabType): void {
        if (this.currentTab !== tab) {
            this.currentTab = tab;
            this.refresh();
        }
    }

    getCurrentTab(): TabType {
        return this.currentTab;
    }

    getTreeItem(element: UnifiedItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: UnifiedItem): Promise<UnifiedItem[]> {
        if (!element) {
            // 根节点：显示选项卡 + 当前选项卡内容
            return this.getRootItems();
        }

        // 处理选项卡内容
        if (element.contextValue === 'tab-connections') {
            return this.getConnectionItems();
        }
        if (element.contextValue === 'tab-buttons') {
            return this.getButtonItems();
        }
        if (element.contextValue === 'tab-settings') {
            return this.getSettingsItems();
        }

        // 处理连接子项
        if (element.contextValue === 'serial-section') {
            return this.getSerialItems();
        }
        if (element.contextValue === 'ssh-section') {
            return this.getSSHItems();
        }

        // 处理设置子项
        if (element.contextValue === 'serial-settings') {
            return this.getSerialSettings();
        }
        if (element.contextValue === 'ssh-settings') {
            return this.getSSHSettings();
        }
        if (element.contextValue === 'log-settings') {
            return this.getLogSettings();
        }
        if (element.contextValue === 'vscode-settings') {
            return this.getVSCodeSettings();
        }

        return [];
    }

    private getRootItems(): UnifiedItem[] {
        // 根据当前选项卡返回内容
        if (this.currentTab === 'connections') {
            return this.getConnectionRootItems();
        } else if (this.currentTab === 'buttons') {
            return this.getButtonRootItems();
        } else {
            return this.getSettingsRootItems();
        }
    }

    // ===== 连接相关 =====
    private getConnectionRootItems(): UnifiedItem[] {
        const items: UnifiedItem[] = [];

        // Serial section
        const serialSection = new UnifiedItem(
            '串口',
            vscode.TreeItemCollapsibleState.Expanded,
            'serial-section'
        );
        serialSection.iconPath = new vscode.ThemeIcon('plug');
        items.push(serialSection);

        // SSH section
        const sshSection = new UnifiedItem(
            'SSH',
            vscode.TreeItemCollapsibleState.Expanded,
            'ssh-section'
        );
        sshSection.iconPath = new vscode.ThemeIcon('terminal');
        items.push(sshSection);

        return items;
    }

    private getConnectionItems(): UnifiedItem[] {
        return this.getConnectionRootItems();
    }

    private async getSerialItems(): Promise<UnifiedItem[]> {
        const items: UnifiedItem[] = [];

        const serialConn = this.serialManager.getConnectionInfo();
        if (serialConn) {
            const connectedItem = new UnifiedItem(
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

        const ports = await this.serialManager.listPorts();
        for (const port of ports) {
            if (serialConn && port.path === serialConn.path) {
                continue;
            }
            const item = new UnifiedItem(
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

        const connectItem = new UnifiedItem(
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

        const refreshItem = new UnifiedItem(
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

    private getSSHItems(): UnifiedItem[] {
        const items: UnifiedItem[] = [];

        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);
        const activeConnections = this.sshManager.getAllConnections();
        const connectedHostIds = new Set(activeConnections.map(c => c.hostId));

        // 检查是否有主机没有 ID
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

        // 检查重复 ID
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

            const item = new UnifiedItem(
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

        const newItem = new UnifiedItem(
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

    // ===== 快捷按钮相关 =====
    private getButtonRootItems(): UnifiedItem[] {
        return this.getButtonItems();
    }

    private getButtonItems(): UnifiedItem[] {
        const buttons = this.buttonManager.getButtons();
        const items: UnifiedItem[] = [];

        for (const button of buttons) {
            const colorIndicator: Record<string, string> = {
                'green': '🟢',
                'yellow': '🟡',
                'red': '🔴',
                'blue': '🔵'
            };
            const indicator = colorIndicator[button.color || ''] || '📍';
            const cmdCount = button.commands?.length || 0;

            const item = new UnifiedItem(
                `${indicator} ${button.label}`,
                vscode.TreeItemCollapsibleState.None,
                'custom-button'
            );
            item.itemData = button;

            const colorMap: Record<string, vscode.ThemeColor | undefined> = {
                'green': new vscode.ThemeColor('charts.green'),
                'yellow': new vscode.ThemeColor('charts.yellow'),
                'red': new vscode.ThemeColor('charts.red'),
                'blue': new vscode.ThemeColor('charts.blue')
            };
            const iconColor = colorMap[button.color || ''];
            item.iconPath = new vscode.ThemeIcon('play', iconColor);

            if (cmdCount === 1) {
                const cmd = button.commands[0].command;
                item.description = cmd.length > 20 ? cmd.substring(0, 20) + '...' : cmd;
            }

            const targetName: Record<string, string> = {
                'serial': '串口',
                'ssh': 'SSH',
                'both': '两者'
            };
            const colorName: Record<string, string> = {
                'green': '绿色',
                'yellow': '黄色',
                'red': '红色',
                'blue': '蓝色'
            };

            let tooltip = `名称: ${button.label}\n目标: ${targetName[button.target] || button.target}\n颜色: ${colorName[button.color || ''] || '默认'}`;
            if (button.commands && button.commands.length > 0) {
                tooltip += `\n命令数: ${button.commands.length}`;
                button.commands.forEach((cmd, idx) => {
                    tooltip += `\n  ${idx + 1}. ${cmd.command}${cmd.delay ? ` (延迟 ${cmd.delay}ms)` : ''}`;
                });
            }
            tooltip += '\n\n点击执行';
            item.tooltip = tooltip;

            item.command = {
                command: 'qserial.buttons.executeButton',
                title: '执行',
                arguments: [button]
            };

            items.push(item);
        }

        const addItem = new UnifiedItem(
            '添加按钮...',
            vscode.TreeItemCollapsibleState.None,
            'add-button'
        );
        addItem.iconPath = new vscode.ThemeIcon('add');
        addItem.command = {
            command: 'qserial.buttons.addButton',
            title: '添加按钮'
        };
        items.push(addItem);

        return items;
    }

    // ===== 设置相关 =====
    private getSettingsRootItems(): UnifiedItem[] {
        const items: UnifiedItem[] = [];

        const serialItem = new UnifiedItem(
            '串口设置',
            vscode.TreeItemCollapsibleState.Expanded,
            'serial-settings',
            null
        );
        serialItem.iconPath = new vscode.ThemeIcon('plug');
        items.push(serialItem);

        const sshItem = new UnifiedItem(
            'SSH 设置',
            vscode.TreeItemCollapsibleState.Expanded,
            'ssh-settings',
            null
        );
        sshItem.iconPath = new vscode.ThemeIcon('terminal');
        items.push(sshItem);

        const logItem = new UnifiedItem(
            '日志设置',
            vscode.TreeItemCollapsibleState.Collapsed,
            'log-settings',
            null
        );
        logItem.iconPath = new vscode.ThemeIcon('file-text');
        items.push(logItem);

        const vscodeItem = new UnifiedItem(
            'VSCode 设置',
            vscode.TreeItemCollapsibleState.Collapsed,
            'vscode-settings',
            null
        );
        vscodeItem.iconPath = new vscode.ThemeIcon('gear');
        items.push(vscodeItem);

        return items;
    }

    private getSettingsItems(): UnifiedItem[] {
        return this.getSettingsRootItems();
    }

    private getSerialSettings(): UnifiedItem[] {
        const config = vscode.workspace.getConfiguration('qserial.serial');
        const items: UnifiedItem[] = [];

        const baudRate = config.get<number>('defaultBaudRate', 115200);
        const baudRateItem = new UnifiedItem(
            '默认波特率',
            vscode.TreeItemCollapsibleState.None,
            'setting-baudrate',
            null
        );
        baudRateItem.description = String(baudRate);
        baudRateItem.iconPath = new vscode.ThemeIcon('dashboard');
        baudRateItem.tooltip = '点击修改默认波特率';
        baudRateItem.command = {
            command: 'qserial.settings.editBaudRate',
            title: '修改波特率'
        };
        items.push(baudRateItem);

        const dataBits = config.get<number>('dataBits', 8);
        const dataBitsItem = new UnifiedItem(
            '数据位',
            vscode.TreeItemCollapsibleState.None,
            'setting-databits',
            null
        );
        dataBitsItem.description = String(dataBits);
        dataBitsItem.iconPath = new vscode.ThemeIcon('symbol-number');
        dataBitsItem.tooltip = '点击修改数据位';
        dataBitsItem.command = {
            command: 'qserial.settings.editDataBits',
            title: '修改数据位'
        };
        items.push(dataBitsItem);

        const stopBits = config.get<number>('stopBits', 1);
        const stopBitsItem = new UnifiedItem(
            '停止位',
            vscode.TreeItemCollapsibleState.None,
            'setting-stopbits',
            null
        );
        stopBitsItem.description = String(stopBits);
        stopBitsItem.iconPath = new vscode.ThemeIcon('debug-stop');
        stopBitsItem.tooltip = '点击修改停止位';
        stopBitsItem.command = {
            command: 'qserial.settings.editStopBits',
            title: '修改停止位'
        };
        items.push(stopBitsItem);

        const parityNames: Record<string, string> = {
            'none': '无校验',
            'even': '偶校验',
            'odd': '奇校验',
            'mark': 'Mark',
            'space': 'Space'
        };
        const parity = config.get<string>('parity', 'none');
        const parityItem = new UnifiedItem(
            '校验位',
            vscode.TreeItemCollapsibleState.None,
            'setting-parity',
            null
        );
        parityItem.description = parityNames[parity] || parity;
        parityItem.iconPath = new vscode.ThemeIcon('check');
        parityItem.tooltip = '点击修改校验位';
        parityItem.command = {
            command: 'qserial.settings.editParity',
            title: '修改校验位'
        };
        items.push(parityItem);

        const autoNewline = config.get<boolean>('autoNewline', true);
        const autoNewlineItem = new UnifiedItem(
            '自动换行',
            vscode.TreeItemCollapsibleState.None,
            'setting-autonewline',
            null
        );
        autoNewlineItem.description = autoNewline ? '开启' : '关闭';
        autoNewlineItem.iconPath = new vscode.ThemeIcon('arrow-down');
        autoNewlineItem.tooltip = '连接后自动发送换行符，触发设备显示登录提示';
        autoNewlineItem.command = {
            command: 'qserial.settings.toggleAutoNewline',
            title: '切换自动换行'
        };
        items.push(autoNewlineItem);

        return items;
    }

    private getSSHSettings(): UnifiedItem[] {
        const items: UnifiedItem[] = [];
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);

        for (const host of savedHosts) {
            const hostName = host.name || host.host;
            const hostItem = new UnifiedItem(
                hostName,
                vscode.TreeItemCollapsibleState.None,
                'ssh-saved-host',
                host
            );
            hostItem.id = `ssh-host-${hostName}`;
            const authLabel = host.authMethod === 'password' ? '🔑' : '🔐';
            hostItem.description = `${authLabel} ${host.username}@${host.host}:${host.port || 22}`;
            hostItem.iconPath = new vscode.ThemeIcon('server');
            const authDesc = host.authMethod === 'password' ? '密码认证' : '密钥认证';
            hostItem.tooltip = `${hostName}\n${host.username}@${host.host}:${host.port || 22}\n认证: ${authDesc}\n\n点击连接，右键编辑或删除`;
            hostItem.command = {
                command: 'qserial.ssh.quickConnect',
                title: '连接',
                arguments: [host]
            };
            items.push(hostItem);
        }

        const addItem = new UnifiedItem(
            '添加 SSH 主机...',
            vscode.TreeItemCollapsibleState.None,
            'ssh-add-host',
            null
        );
        addItem.iconPath = new vscode.ThemeIcon('add');
        addItem.command = {
            command: 'qserial.ssh.addHost',
            title: '添加主机'
        };
        items.push(addItem);

        const clearPasswordsItem = new UnifiedItem(
            '清除保存的密码',
            vscode.TreeItemCollapsibleState.None,
            'ssh-clear-passwords',
            null
        );
        clearPasswordsItem.iconPath = new vscode.ThemeIcon('key');
        clearPasswordsItem.tooltip = '清除所有已保存的 SSH 密码';
        clearPasswordsItem.command = {
            command: 'qserial.ssh.clearPasswords',
            title: '清除密码'
        };
        items.push(clearPasswordsItem);

        return items;
    }

    private getLogSettings(): UnifiedItem[] {
        const items: UnifiedItem[] = [];
        const config = vscode.workspace.getConfiguration('qserial.log');

        const defaultPath = config.get<string>('defaultPath', '');
        const pathItem = new UnifiedItem(
            '日志存储路径',
            vscode.TreeItemCollapsibleState.None,
            'log-path',
            null
        );
        pathItem.description = defaultPath || '默认 (文档/QSerial/logs)';
        pathItem.iconPath = new vscode.ThemeIcon('folder');
        pathItem.tooltip = '点击选择日志文件的存储文件夹';
        pathItem.command = {
            command: 'qserial.log.setLogPath',
            title: '设置日志路径'
        };
        items.push(pathItem);

        const openFolderItem = new UnifiedItem(
            '打开日志文件夹',
            vscode.TreeItemCollapsibleState.None,
            'log-open-folder',
            null
        );
        openFolderItem.iconPath = new vscode.ThemeIcon('folder-opened');
        openFolderItem.tooltip = '在系统文件管理器中打开日志文件夹';
        openFolderItem.command = {
            command: 'qserial.log.openLogFolder',
            title: '打开日志文件夹'
        };
        items.push(openFolderItem);

        return items;
    }

    private getVSCodeSettings(): UnifiedItem[] {
        const items: UnifiedItem[] = [];

        const userSettingsItem = new UnifiedItem(
            '编辑配置文件',
            vscode.TreeItemCollapsibleState.None,
            'open-user-settings-json',
            null
        );
        userSettingsItem.description = 'settings.json';
        userSettingsItem.iconPath = new vscode.ThemeIcon('file-code');
        userSettingsItem.tooltip = '直接编辑用户 settings.json 文件';
        userSettingsItem.command = {
            command: 'workbench.action.openSettingsJson',
            title: '打开用户设置 JSON'
        };
        items.push(userSettingsItem);

        return items;
    }
}

class UnifiedItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public itemData?: any
    ) {
        super(label, collapsibleState);
    }
}

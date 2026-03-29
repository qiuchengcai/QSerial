import * as vscode from 'vscode';

export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingsItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingsItem | undefined | null | void> =
        new vscode.EventEmitter<SettingsItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingsItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SettingsItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingsItem): Thenable<SettingsItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }

        if (element.contextValue === 'serial-settings') {
            return Promise.resolve(this.getSerialSettings());
        }

        if (element.contextValue === 'ssh-settings') {
            return Promise.resolve(this.getSSHSettings());
        }

        if (element.contextValue === 'log-settings') {
            return Promise.resolve(this.getLogSettings());
        }

        if (element.contextValue === 'vscode-settings') {
            return Promise.resolve(this.getVSCodeSettings());
        }

        return Promise.resolve([]);
    }

    private getRootItems(): SettingsItem[] {
        const items: SettingsItem[] = [];

        // 串口设置
        const serialItem = new SettingsItem(
            '串口设置',
            vscode.TreeItemCollapsibleState.Expanded,
            'serial-settings',
            null
        );
        serialItem.iconPath = new vscode.ThemeIcon('plug');
        items.push(serialItem);

        // SSH 设置
        const sshItem = new SettingsItem(
            'SSH 设置',
            vscode.TreeItemCollapsibleState.Expanded,
            'ssh-settings',
            null
        );
        sshItem.iconPath = new vscode.ThemeIcon('terminal');
        items.push(sshItem);

        // 日志设置
        const logItem = new SettingsItem(
            '日志设置',
            vscode.TreeItemCollapsibleState.Collapsed,
            'log-settings',
            null
        );
        logItem.iconPath = new vscode.ThemeIcon('file-text');
        items.push(logItem);

        // VSCode 设置
        const vscodeItem = new SettingsItem(
            'VSCode 设置',
            vscode.TreeItemCollapsibleState.Collapsed,
            'vscode-settings',
            null
        );
        vscodeItem.iconPath = new vscode.ThemeIcon('gear');
        items.push(vscodeItem);

        return items;
    }

    private getSerialSettings(): SettingsItem[] {
        const config = vscode.workspace.getConfiguration('qserial.serial');

        // 波特率
        const baudRate = config.get<number>('defaultBaudRate', 115200);
        const baudRateItem = new SettingsItem(
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

        // 数据位
        const dataBits = config.get<number>('dataBits', 8);
        const dataBitsItem = new SettingsItem(
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

        // 停止位
        const stopBits = config.get<number>('stopBits', 1);
        const stopBitsItem = new SettingsItem(
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

        // 校验位
        const parityNames: Record<string, string> = {
            'none': '无校验',
            'even': '偶校验',
            'odd': '奇校验',
            'mark': 'Mark',
            'space': 'Space'
        };
        const parity = config.get<string>('parity', 'none');
        const parityItem = new SettingsItem(
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

        // 自动换行
        const autoNewline = config.get<boolean>('autoNewline', true);
        const autoNewlineItem = new SettingsItem(
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

        return [baudRateItem, dataBitsItem, stopBitsItem, parityItem, autoNewlineItem];
    }

    private getSSHSettings(): SettingsItem[] {
        const items: SettingsItem[] = [];
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);

        // 已保存的主机
        for (const host of savedHosts) {
            const hostName = host.name || host.host;
            const hostItem = new SettingsItem(
                hostName,
                vscode.TreeItemCollapsibleState.None,
                'ssh-saved-host',
                host
            );
            hostItem.id = `ssh-host-${hostName}`;
            
            // 显示认证方式
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

        // 添加主机
        const addItem = new SettingsItem(
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

        // 清除保存的密码
        const clearPasswordsItem = new SettingsItem(
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

    private getLogSettings(): SettingsItem[] {
        const items: SettingsItem[] = [];
        const config = vscode.workspace.getConfiguration('qserial.log');

        // 日志存储路径
        const defaultPath = config.get<string>('defaultPath', '');
        const pathItem = new SettingsItem(
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

        // 打开日志文件夹
        const openFolderItem = new SettingsItem(
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

        // 时间戳开关
        const enableTimestamp = config.get<boolean>('enableTimestamp', true);
        const timestampItem = new SettingsItem(
            '日志时间戳',
            vscode.TreeItemCollapsibleState.None,
            'log-timestamp',
            null
        );
        timestampItem.description = enableTimestamp ? '开启' : '关闭';
        timestampItem.iconPath = new vscode.ThemeIcon(enableTimestamp ? 'check' : 'close');
        timestampItem.tooltip = '点击切换日志时间戳显示';
        timestampItem.command = {
            command: 'qserial.log.toggleTimestamp',
            title: '切换时间戳'
        };
        items.push(timestampItem);

        return items;
    }

    private getVSCodeSettings(): SettingsItem[] {
        const items: SettingsItem[] = [];

        // 打开用户 settings.json
        const userSettingsItem = new SettingsItem(
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

class SettingsItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly itemData?: any
    ) {
        super(label, collapsibleState);
    }
}

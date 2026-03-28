import * as vscode from 'vscode';
import * as path from 'path';
import { SerialManager } from './serial/serialManager';
import { SSHManager } from './ssh/sshManager';
import { ButtonManager } from './buttons/buttonManager';
import { TerminalManager } from './terminal/terminalManager';
import { UnifiedTreeProvider, TabType } from './tree/unifiedTreeProvider';
import { StatusBarManager } from './statusBar/statusBarManager';
import { Logger } from './utils/logger';
import { StatusListener } from './mcp/statusListener';
import { MCPConnectionManager } from './mcp/mcpConnectionManager';

let serialManager: SerialManager;
let sshManager: SSHManager;
let buttonManager: ButtonManager;
let terminalManager: TerminalManager;
let unifiedTreeProvider: UnifiedTreeProvider;
let statusBarManager: StatusBarManager;
let secrets: vscode.SecretStorage;
let unifiedView: vscode.TreeView<vscode.TreeItem>;
let statusListener: StatusListener;
let mcpConnectionManager: MCPConnectionManager;

export function activate(context: vscode.ExtensionContext) {
    Logger.info('QSerial extension is activating...');

    secrets = context.secrets;

    terminalManager = new TerminalManager();
    
    terminalManager.onSSHTerminalClosed = async (terminalName: string) => {
        Logger.info('SSH terminal closed callback: ' + terminalName);
        
        const match = terminalName.match(/\(([a-z0-9]{6})\)$/);
        if (match) {
            const suffix = match[1];
            const connections = sshManager.getAllConnections();
            const found = connections.find(conn => conn.hostId.endsWith(suffix));
            if (found) {
                await sshManager.disconnect(found.hostId);
            }
        }
        unifiedTreeProvider.refresh();
        statusBarManager.update();
    };
    
    serialManager = new SerialManager(terminalManager);
    sshManager = new SSHManager(terminalManager);
    buttonManager = new ButtonManager(context, serialManager, sshManager);

    unifiedTreeProvider = new UnifiedTreeProvider(serialManager, sshManager, buttonManager);

    statusBarManager = new StatusBarManager(serialManager, sshManager);

    // 初始化 MCP 状态监听器
    statusListener = new StatusListener();
    mcpConnectionManager = new MCPConnectionManager(serialManager, terminalManager, statusBarManager);
    
    // 订阅 MCP 状态变化事件
    statusListener.onStatusChange((event) => {
        if (event.type === 'connected') {
            mcpConnectionManager.handleConnected(event.terminal);
        } else {
            mcpConnectionManager.handleDisconnected(event.terminal);
        }
        unifiedTreeProvider.refresh();
    });

    unifiedView = vscode.window.createTreeView('qserial-main', {
        treeDataProvider: unifiedTreeProvider
    });

    // 设置初始选项卡状态
    vscode.commands.executeCommand('setContext', 'qserial.currentTab', 'connections');

    const commands = [
        vscode.commands.registerCommand('qserial.switchTab', (tab: TabType) => switchTab(tab)),
        vscode.commands.registerCommand('qserial.tab.connections', () => switchTab('connections')),
        vscode.commands.registerCommand('qserial.tab.buttons', () => switchTab('buttons')),
        vscode.commands.registerCommand('qserial.tab.settings', () => switchTab('settings')),
        
        vscode.commands.registerCommand('qserial.serial.connect', () => connectSerial()),
        vscode.commands.registerCommand('qserial.serial.disconnect', () => disconnectSerial()),
        vscode.commands.registerCommand('qserial.serial.refreshPorts', () => refreshSerialPorts()),
        vscode.commands.registerCommand('qserial.serial.connectPort', (port: any) => connectSerialPort(port)),

        vscode.commands.registerCommand('qserial.ssh.connect', () => connectSSH()),
        vscode.commands.registerCommand('qserial.ssh.disconnect', () => disconnectSSH()),
        vscode.commands.registerCommand('qserial.ssh.quickConnect', (host: any) => quickConnectSSH(host)),
        vscode.commands.registerCommand('qserial.ssh.removeHost', (host: any) => removeSSHHost(host)),
        vscode.commands.registerCommand('qserial.ssh.editHost', (host: any) => editSSHHost(host)),
        vscode.commands.registerCommand('qserial.ssh.addHost', () => addSSHHost()),
        vscode.commands.registerCommand('qserial.ssh.clearPasswords', () => clearSSHPPasswords()),

        vscode.commands.registerCommand('qserial.buttons.addButton', () => addCustomButton()),
        vscode.commands.registerCommand('qserial.buttons.removeButton', (node: any) => removeButton(node)),
        vscode.commands.registerCommand('qserial.buttons.editButton', (node: any) => editButton(node)),
        vscode.commands.registerCommand('qserial.buttons.executeButton', (button: any) => executeButton(button)),

        vscode.commands.registerCommand('qserial.settings.editBaudRate', () => editBaudRate()),
        vscode.commands.registerCommand('qserial.settings.editDataBits', () => editDataBits()),
        vscode.commands.registerCommand('qserial.settings.editStopBits', () => editStopBits()),
        vscode.commands.registerCommand('qserial.settings.editParity', () => editParity()),
        vscode.commands.registerCommand('qserial.settings.toggleAutoNewline', () => toggleAutoNewline()),
        vscode.commands.registerCommand('qserial.settings.openSettings', () => openSettings()),

        vscode.commands.registerCommand('qserial.showPanel', () => showPanel()),

        vscode.commands.registerCommand('qserial.buttons.moveUp', (node: any) => moveButtonUp(node)),
        vscode.commands.registerCommand('qserial.buttons.moveDown', (node: any) => moveButtonDown(node)),
        vscode.commands.registerCommand('qserial.buttons.moveToTop', (node: any) => moveToTop(node)),
        vscode.commands.registerCommand('qserial.buttons.moveToBottom', (node: any) => moveToBottom(node)),

        vscode.commands.registerCommand('qserial.log.startSerial', () => startSerialLog()),
        vscode.commands.registerCommand('qserial.log.stopSerial', () => stopSerialLog()),
        vscode.commands.registerCommand('qserial.log.startSSH', (node: any) => startSSHLog(node)),
        vscode.commands.registerCommand('qserial.log.stopSSH', (node: any) => stopSSHLog(node)),
        vscode.commands.registerCommand('qserial.log.openLogFolder', () => openLogFolder()),
        vscode.commands.registerCommand('qserial.log.setLogPath', () => setLogPath()),
        vscode.commands.registerCommand('qserial.log.resetLogPath', () => resetLogPath())
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    context.subscriptions.push(unifiedView);
    context.subscriptions.push(statusBarManager);
    context.subscriptions.push(statusListener);
    context.subscriptions.push(mcpConnectionManager);

    refreshSerialPorts();

    Logger.info('QSerial extension activated successfully!');
}

function switchTab(tab: TabType) {
    unifiedTreeProvider.switchTab(tab);
    vscode.commands.executeCommand('setContext', 'qserial.currentTab', tab);
}

interface EditField {
    key: string;
    label: string;
    type: 'string' | 'number' | 'select';
    options?: { label: string; value: string; description?: string }[];
    validate?: (value: string) => string | null;
    format?: (value: any) => string;
}

async function editObject(
    title: string,
    obj: any,
    fields: EditField[],
    onSave: (obj: any) => Promise<void>
): Promise<void> {
    const workingObj = { ...obj };

    while (true) {
        const items: (vscode.QuickPickItem & { value?: string })[] = [];

        for (const field of fields) {
            const value = workingObj[field.key];
            let displayValue: string;

            if (field.format) {
                displayValue = field.format(value);
            } else if (field.type === 'select' && field.options) {
                const opt = field.options.find(o => o.value === value);
                displayValue = opt ? opt.label : String(value || '');
            } else {
                displayValue = String(value || '');
            }

            items.push({
                label: `${field.label}: ${displayValue}`,
                value: field.key
            });
        }

        items.push(
            { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'separator' },
            { label: '$(check) 保存并退出', value: 'save' },
            { label: '$(close) 取消', value: 'cancel' }
        );

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `编辑 ${title} - 选择要修改的字段`
        });

        if (!selected || selected.value === 'cancel') { return; }
        if (selected.value === 'separator') { continue; }
        if (selected.value === 'save') {
            await onSave(workingObj);
            vscode.window.showInformationMessage(`${title} 已更新`);
            return;
        }

        const field = fields.find(f => f.key === selected.value);
        if (!field) { continue; }

        if (field.type === 'select' && field.options) {
            const optSelected = await vscode.window.showQuickPick(
                field.options.map(o => ({
                    label: o.label,
                    description: o.description,
                    picked: o.value === workingObj[field.key]
                })),
                { placeHolder: `选择 ${field.label}` }
            );
            if (optSelected) {
                const opt = field.options.find(o => o.label === optSelected.label);
                if (opt) { workingObj[field.key] = opt.value; }
            }
        } else {
            const currentValue = workingObj[field.key] ?? '';
            const input = await vscode.window.showInputBox({
                prompt: `输入 ${field.label}`,
                value: String(currentValue),
                validateInput: field.validate
            });
            if (input !== undefined) {
                if (field.type === 'number') {
                    workingObj[field.key] = parseInt(input) || 0;
                } else {
                    workingObj[field.key] = input;
                }
            }
        }
    }
}

async function connectSerial() {
    try {
        const ports = await serialManager.listPorts();
        if (ports.length === 0) {
            vscode.window.showWarningMessage('未发现串口设备');
            return;
        }

        const portItems = ports.map(p => ({
            label: p.path,
            description: p.manufacturer || '',
            detail: p.productId ? `VID:${p.vendorId} PID:${p.productId}` : ''
        }));

        portItems.push({
            label: '$(gear) 自定义波特率连接...',
            description: '指定波特率进行连接',
            detail: ''
        });

        const selected = await vscode.window.showQuickPick(portItems, {
            placeHolder: '选择串口 (使用默认波特率)'
        });

        if (!selected) { return; }

        const config = vscode.workspace.getConfiguration('qserial.serial');
        const defaultBaudRate = config.get<number>('defaultBaudRate', 115200);

        let baudRate: number;

        if (selected.label === '$(gear) 自定义波特率连接...') {
            const portItems2 = ports.map(p => ({
                label: p.path,
                description: p.manufacturer || ''
            }));
            const selected2 = await vscode.window.showQuickPick(portItems2, {
                placeHolder: '选择串口'
            });
            if (!selected2) { return; }

            const inputBaud = await vscode.window.showInputBox({
                prompt: '输入波特率',
                value: defaultBaudRate.toString(),
                validateInput: (value) => {
                    const num = parseInt(value);
                    return isNaN(num) || num <= 0 ? '无效的波特率' : null;
                }
            });
            if (!inputBaud) { return; }
            baudRate = parseInt(inputBaud);
            selected.label = selected2.label;
        } else {
            baudRate = defaultBaudRate;
        }

        await serialManager.connect(selected.label, baudRate);
        unifiedTreeProvider.refresh();
        statusBarManager.update();
        vscode.window.showInformationMessage(`已连接 ${selected.label} @ ${baudRate} baud`);
    } catch (error) {
        vscode.window.showErrorMessage(`连接失败: ${error}`);
    }
}

async function disconnectSerial() {
    try {
        await serialManager.disconnect();
        unifiedTreeProvider.refresh();
        statusBarManager.update();
        vscode.window.showInformationMessage('串口已断开');
    } catch (error) {
        vscode.window.showErrorMessage(`断开失败: ${error}`);
    }
}

async function refreshSerialPorts() {
    try {
        await serialManager.listPorts();
        unifiedTreeProvider.refresh();
    } catch (error) {
        Logger.error('Failed to refresh ports: ' + error);
    }
}

async function connectSerialPort(node: any) {
    try {
        let portInfo = node?.itemData || node;
        if (!portInfo?.path) {
            vscode.window.showErrorMessage('无效的串口信息');
            return;
        }

        const config = vscode.workspace.getConfiguration('qserial.serial');
        const defaultBaudRate = config.get<number>('defaultBaudRate', 115200);

        await serialManager.connect(portInfo.path, defaultBaudRate);
        unifiedTreeProvider.refresh();
        statusBarManager.update();
        vscode.window.showInformationMessage(`已连接 ${portInfo.path} @ ${defaultBaudRate} baud`);
    } catch (error) {
        vscode.window.showErrorMessage(`连接失败: ${error}`);
    }
}

async function connectSSH() {
    try {
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);

        const items: vscode.QuickPickItem[] = [
            { label: '$(plus) 新建连接', description: '创建新的 SSH 连接' }
        ];

        if (savedHosts.length > 0) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            items.push({ label: '已保存的主机', kind: vscode.QuickPickItemKind.Separator });
            savedHosts.forEach(host => {
                items.push({
                    label: host.name || host.host,
                    description: `${host.username}@${host.host}:${host.port || 22}`
                });
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择或创建 SSH 连接'
        });

        if (!selected) { return; }

        if (selected.label === '$(plus) 新建连接') {
            await createNewSSHConnection(savedHosts);
        } else {
            const host = savedHosts.find(h => (h.name || h.host) === selected.label);
            if (host) {
                await quickConnectSSH(host);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`连接失败: ${error}`);
    }
}

async function createNewSSHConnection(savedHosts: any[]) {
    const host = await vscode.window.showInputBox({
        prompt: '输入主机地址',
        placeHolder: '例如: 192.168.1.1 或 example.com'
    });
    if (!host) { return; }

    const portStr = await vscode.window.showInputBox({
        prompt: '输入端口',
        value: '22',
        validateInput: (value) => {
            const num = parseInt(value);
            return isNaN(num) || num <= 0 || num > 65535 ? '无效的端口' : null;
        }
    });
    if (!portStr) { return; }
    const port = parseInt(portStr);

    const username = await vscode.window.showInputBox({
        prompt: '输入用户名'
    });
    if (!username) { return; }

    const password = await vscode.window.showInputBox({
        prompt: '输入密码 (留空使用密钥认证)',
        password: true
    });

    const name = await vscode.window.showInputBox({
        prompt: '为此连接命名',
        value: host,
        placeHolder: '例如: 我的服务器'
    });

    const saveConnection = name ? await vscode.window.showQuickPick(
        ['是', '否'],
        { placeHolder: '保存此连接配置?' }
    ) : '否';

    const connectionConfig = { host, port, username, name: name || host };

    if (saveConnection === '是' && name) {
        savedHosts.push(connectionConfig);
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        await config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
        unifiedTreeProvider.refresh();
    }

    try {
        await sshManager.connect({ ...connectionConfig, password });
        unifiedTreeProvider.refresh();
        statusBarManager.update();
        vscode.window.showInformationMessage(`已连接 ${username}@${host}:${port}`);
    } catch (error) {
        vscode.window.showErrorMessage(`连接失败: ${error}`);
    }
}

async function quickConnectSSH(node: any) {
    try {
        const host = node?.itemData || node;
        if (!host?.host) {
            vscode.window.showErrorMessage('无效的主机信息');
            return;
        }

        if (!host.id) {
            host.id = `ssh-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            const config = vscode.workspace.getConfiguration('qserial.ssh');
            const savedHosts = config.get<any[]>('savedHosts', []);
            const idx = savedHosts.findIndex((h: any) => 
                h.host === host.host && h.username === host.username && !h.id
            );
            if (idx >= 0) {
                savedHosts[idx].id = host.id;
                await config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
            }
        }

        const fs = require('fs');
        let privateKey: Buffer | undefined;
        let passphrase: string | undefined;

        if (host.authMethod === 'key' || host.authMethod === 'default-key' || !host.authMethod) {
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            const defaultKeyPath = path.join(homeDir, '.ssh', 'id_rsa');
            try {
                privateKey = fs.readFileSync(defaultKeyPath);
            } catch (e) {
                const keyNames = ['id_ed25519', 'id_ecdsa', 'id_dsa'];
                for (const keyName of keyNames) {
                    try {
                        privateKey = fs.readFileSync(path.join(homeDir, '.ssh', keyName));
                        break;
                    } catch {}
                }
                if (!privateKey && host.authMethod === 'key') {
                    vscode.window.showErrorMessage(`未找到 SSH 私钥，请检查 ~/.ssh/ 目录`);
                    return;
                }
            }
        }

        if (!privateKey) {
            const hostKey = `ssh-password-${host.name || host.host}`;
            let password = await secrets.get(hostKey);

            if (!password) {
                password = await vscode.window.showInputBox({
                    prompt: `输入 ${host.username}@${host.host} 的密码`,
                    password: true
                });

                if (password === undefined) { return; }

                const savePassword = await vscode.window.showQuickPick(
                    [
                        { label: '保存密码', description: '安全存储此密码', value: 'save' },
                        { label: '不保存', description: '每次连接时输入', value: 'nosave' }
                    ],
                    { placeHolder: '是否保存密码？' }
                );

                if (savePassword?.value === 'save') {
                    await secrets.store(hostKey, password);
                    vscode.window.showInformationMessage('密码已安全保存');
                }
            }

            try {
                await sshManager.connect({ ...host, password, hostId: host.id });
                unifiedTreeProvider.refresh();
                statusBarManager.update();
                vscode.window.showInformationMessage(`已连接 ${host.host}`);
            } catch (error: any) {
                if (error.includes('认证失败') || error.includes('authentication')) {
                    await secrets.delete(hostKey);
                    const retry = await vscode.window.showErrorMessage(
                        'SSH 认证失败，密码可能已更改',
                        '重新输入密码',
                        '取消'
                    );
                    if (retry === '重新输入密码') {
                        await quickConnectSSH(host);
                    }
                } else {
                    throw error;
                }
            }
            return;
        }

        if (!privateKey) {
            vscode.window.showErrorMessage('私钥读取失败');
            return;
        }

        const keyStr = privateKey.toString().trim();
        
        if (keyStr.startsWith('ssh-rsa') || 
            keyStr.startsWith('ssh-ed25519') || 
            keyStr.startsWith('ssh-ecdsa') ||
            keyStr.startsWith('ecdsa-sha2-')) {
            vscode.window.showErrorMessage(
                '这是公钥，不是私钥！\n' +
                '请选择私钥文件（通常没有 .pub 后缀）\n' +
                '常见私钥文件名：id_rsa, id_ed25519, id_ecdsa'
            );
            return;
        }
        
        const isOpenSSH = keyStr.includes('-----BEGIN') && keyStr.includes('PRIVATE KEY');
        if (!isOpenSSH) {
            vscode.window.showErrorMessage(
                '文件格式不正确，不是有效的私钥文件\n' +
                '私钥文件应以 -----BEGIN 开头\n' +
                '当前文件开头: ' + keyStr.substring(0, 50) + '...'
            );
            return;
        }
        if (keyStr.includes('PuTTY')) {
            vscode.window.showErrorMessage(
                '不支持 PuTTY (.ppk) 格式私钥\n请转换为 OpenSSH 格式：\n' +
                'puttygen key.ppk -O private-openssh -o key.pem'
            );
            return;
        }

        const isPemEncrypted = keyStr.includes('ENCRYPTED') || 
                               keyStr.includes('Proc-Type: 4,ENCRYPTED');
        
        const passphraseKey = `ssh-passphrase-${host.name || host.host}`;
        let cachedPassphrase = await secrets.get(passphraseKey);
        
        if (isPemEncrypted && !cachedPassphrase) {
            const inputPass = await vscode.window.showInputBox({
                prompt: `输入私钥密码 (passphrase)`,
                password: true,
                placeHolder: '私钥已加密，必须输入密码'
            });
            if (inputPass === undefined) { return; }
            cachedPassphrase = inputPass;
        }
        
        passphrase = cachedPassphrase || undefined;

        try {
            await sshManager.connect({ ...host, privateKey: privateKey!, passphrase, hostId: host.id });
            unifiedTreeProvider.refresh();
            statusBarManager.update();
            vscode.window.showInformationMessage(`已连接 ${host.host} (密钥认证)`);
        } catch (error: any) {
            const errorMsg = String(error);
            if (errorMsg.includes('passphrase') || 
                errorMsg.includes('decrypt') || 
                errorMsg.includes('authentication') ||
                errorMsg.includes('Authentication failed')) {
                
                const inputPass = await vscode.window.showInputBox({
                    prompt: `私钥密码错误或需要密码，请输入私钥密码 (passphrase)`,
                    password: true,
                    placeHolder: '输入私钥密码，无密码请直接回车'
                });
                if (inputPass === undefined) { return; }
                
                if (inputPass) {
                    const savePass = await vscode.window.showQuickPick(
                        [
                            { label: '保存密码', description: '安全存储此密码', value: 'save' },
                            { label: '不保存', description: '每次连接时输入', value: 'nosave' }
                        ],
                        { placeHolder: '是否保存私钥密码？' }
                    );
                    if (savePass?.value === 'save') {
                        await secrets.store(passphraseKey, inputPass);
                    }
                }
                
                await sshManager.connect({ ...host, privateKey: privateKey!, passphrase: inputPass || undefined, hostId: host.id });
                unifiedTreeProvider.refresh();
                statusBarManager.update();
                vscode.window.showInformationMessage(`已连接 ${host.host} (密钥认证)`);
            } else {
                throw error;
            }
        }
    } catch (error) {
        const errorMsg = String(error);
        if (errorMsg.includes('privateKey') || errorMsg.includes('private key')) {
            vscode.window.showErrorMessage(
                '私钥验证失败\n可能原因：\n' +
                '1. 私钥格式不正确（需要 OpenSSH 格式）\n' +
                '2. 私钥密码 (passphrase) 错误\n' +
                '3. 私钥文件已损坏'
            );
        } else {
            vscode.window.showErrorMessage(`连接失败: ${error}`);
        }
    }
}

async function disconnectSSH(node?: any) {
    try {
        if (!node && unifiedView.selection.length > 0) {
            node = unifiedView.selection[0];
        }
        
        const connections = sshManager.getAllConnections();
        let hostId: string | undefined;
        
        if (node?.id && typeof node.id === 'string') {
            hostId = node.id;
        } else if ((node as any)?.itemData?.id) {
            hostId = (node as any).itemData.id;
        } else if (connections.length === 1) {
            hostId = connections[0].hostId;
        }
        
        if (!hostId) {
            vscode.window.showErrorMessage('无法获取连接ID');
            return;
        }
        
        const conn = sshManager.getConnectionInfo(hostId);
        const terminalName = conn?.terminalName;
        
        await sshManager.disconnect(hostId);
        
        if (terminalName) {
            terminalManager.closeSSHTerminal(terminalName);
        }
        
        unifiedTreeProvider.refresh();
        statusBarManager.update();
        vscode.window.showInformationMessage('SSH 已断开');
    } catch (error) {
        vscode.window.showErrorMessage(`断开失败: ${error}`);
    }
}

async function clearSSHPPasswords() {
    const confirm = await vscode.window.showWarningMessage(
        '确定清除所有保存的 SSH 密码？',
        '确定', '取消'
    );
    if (confirm !== '确定') { return; }

    const config = vscode.workspace.getConfiguration('qserial.ssh');
    const savedHosts = config.get<any[]>('savedHosts', []);
    
    for (const host of savedHosts) {
        const hostKey = `ssh-password-${host.name || host.host}`;
        await secrets.delete(hostKey);
    }

    vscode.window.showInformationMessage('已清除所有保存的密码');
}

async function removeSSHHost(node: any) {
    let host = node?.itemData;
    if (!host && node?.id && typeof node.id === 'string' && node.id.startsWith('ssh-host-')) {
        const hostName = node.id.substring('ssh-host-'.length);
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);
        host = savedHosts.find(h => (h.name || h.host) === hostName);
    }
    if (!host) { host = node; }
    if (!host?.name && !host?.host) {
        vscode.window.showErrorMessage('无法获取主机信息');
        return;
    }

    const displayName = host.name || host.host;
    const confirm = await vscode.window.showWarningMessage(
        `确定删除主机 "${displayName}"?`,
        '确定', '取消'
    );

    if (confirm === '确定') {
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        let savedHosts = config.get<any[]>('savedHosts', []);
        savedHosts = savedHosts.filter(h => (h.name || h.host) !== displayName);
        await config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
        unifiedTreeProvider.refresh();
        vscode.window.showInformationMessage(`已删除 ${displayName}`);
    }
}

async function editSSHHost(node: any) {
    let host = node?.itemData;
    if (!host && node?.id && typeof node.id === 'string' && node.id.startsWith('ssh-host-')) {
        const hostName = node.id.substring('ssh-host-'.length);
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        const savedHosts = config.get<any[]>('savedHosts', []);
        host = savedHosts.find(h => (h.name || h.host) === hostName);
    }
    if (!host) { host = node; }
    if (!host?.name && !host?.host) {
        vscode.window.showErrorMessage('无法获取主机信息');
        return;
    }

    const oldName = host.name || host.host;
    const authOptions = [
        { label: '密钥认证', value: 'key', description: '使用系统 SSH 配置' },
        { label: '密码认证', value: 'password', description: '每次连接时输入密码' }
    ];

    const fields: EditField[] = [
        { key: 'name', label: '名称', type: 'string' },
        { key: 'host', label: '主机', type: 'string' },
        { key: 'port', label: '端口', type: 'number', validate: v => /^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) <= 65535 ? null : '无效端口' },
        { key: 'username', label: '用户', type: 'string' },
        { key: 'authMethod', label: '认证', type: 'select', options: authOptions }
    ];

    await editObject('SSH 主机', host, fields, async (updated) => {
        const config = vscode.workspace.getConfiguration('qserial.ssh');
        let savedHosts = config.get<any[]>('savedHosts', []);
        const index = savedHosts.findIndex(h => (h.name || h.host) === oldName);
        if (index !== -1) {
            savedHosts[index] = { ...savedHosts[index], ...updated };
            await config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
            unifiedTreeProvider.refresh();
        }
    });
}

async function addSSHHost() {
    const name = await vscode.window.showInputBox({
        prompt: '连接名称',
        placeHolder: '例如: 我的服务器'
    });
    if (!name) { return; }

    const host = await vscode.window.showInputBox({
        prompt: '主机地址',
        placeHolder: '例如: 192.168.1.1 或 example.com'
    });
    if (!host) { return; }

    const portStr = await vscode.window.showInputBox({
        prompt: '端口',
        value: '22',
        validateInput: (value) => {
            const num = parseInt(value);
            return isNaN(num) || num <= 0 || num > 65535 ? '无效的端口' : null;
        }
    });
    if (!portStr) { return; }

    const username = await vscode.window.showInputBox({
        prompt: '用户名'
    });
    if (!username) { return; }

    const authMethod = await vscode.window.showQuickPick(
        [
            { label: '密钥认证', description: '使用系统 SSH 配置 (~/.ssh/id_rsa 或 SSH agent)', value: 'key' },
            { label: '密码认证', description: '每次连接时输入密码', value: 'password' }
        ],
        { placeHolder: '选择认证方式' }
    );
    if (!authMethod) { return; }

    const config = vscode.workspace.getConfiguration('qserial.ssh');
    const savedHosts = config.get<any[]>('savedHosts', []);
    
    if (savedHosts.some(h => h.name === name)) {
        const overwrite = await vscode.window.showWarningMessage(
            `名称 "${name}" 已存在，是否覆盖?`,
            '覆盖', '取消'
        );
        if (overwrite !== '覆盖') { return; }
        const index = savedHosts.findIndex(h => h.name === name);
        if (index !== -1) {
            savedHosts.splice(index, 1);
        }
    }

    const hostConfig: any = {
        name,
        host,
        port: parseInt(portStr),
        username,
        authMethod: authMethod.value
    };

    savedHosts.push(hostConfig);

    await config.update('savedHosts', savedHosts, vscode.ConfigurationTarget.Global);
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`SSH 主机 "${name}" 已添加`);
}

async function addCustomButton() {
    const label = await vscode.window.showInputBox({
        prompt: '按钮名称',
        placeHolder: '例如: 重启设备'
    });
    if (!label) { return; }

    const commands: { id: string; command: string; delay: number; description?: string }[] = [];
    
    while (true) {
        const command = await vscode.window.showInputBox({
            prompt: commands.length === 0 ? '发送的命令' : `第 ${commands.length + 1} 条命令 (留空结束)`,
            placeHolder: commands.length === 0 ? '例如: AT+RST 或 ls -la' : '留空结束添加命令'
        });
        
        if (!command) { break; }
        
        const delayStr = await vscode.window.showInputBox({
            prompt: '命令执行后延迟 (毫秒)',
            value: '0',
            placeHolder: '例如: 1000 表示延迟1秒'
        });
        const delay = parseInt(delayStr || '0') || 0;
        
        commands.push({
            id: `cmd-${Date.now()}-${commands.length}`,
            command,
            delay
        });
        
        const addMore = await vscode.window.showQuickPick(
            ['继续添加命令', '完成'],
            { placeHolder: '已添加 ' + commands.length + ' 条命令' }
        );
        if (addMore !== '继续添加命令') { break; }
    }

    if (commands.length === 0) {
        vscode.window.showWarningMessage('未添加任何命令');
        return;
    }

    const targetItems: vscode.QuickPickItem[] = [
        { label: '仅串口', description: 'serial', detail: '只在串口连接时发送' },
        { label: '仅 SSH', description: 'ssh', detail: '只在 SSH 连接时发送' },
        { label: '两者都', description: 'both', detail: '在任意连接时发送' }
    ];

    const targetSelected = await vscode.window.showQuickPick(targetItems, {
        placeHolder: '选择目标连接类型'
    });
    if (!targetSelected) { return; }

    const colorItems: vscode.QuickPickItem[] = [
        { label: '默认', description: '' },
        { label: '绿色', description: 'green' },
        { label: '黄色', description: 'yellow' },
        { label: '红色', description: 'red' },
        { label: '蓝色', description: 'blue' }
    ];

    const colorSelected = await vscode.window.showQuickPick(colorItems, {
        placeHolder: '选择按钮颜色'
    });
    if (!colorSelected) { return; }

    const target = (targetSelected.description || 'both') as 'serial' | 'ssh' | 'both';
    const color = colorSelected.description || undefined;

    buttonManager.addButton({
        id: Date.now().toString(),
        label,
        commands,
        target,
        color
    });

    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`按钮 "${label}" 已添加 (${commands.length} 条命令)`);
}

async function removeButton(node: any) {
    if (!node && unifiedView.selection.length > 0) {
        node = unifiedView.selection[0];
    }

    const button = (node as any)?.itemData || (node as any)?.button;
    if (!button?.id) { return; }

    const confirm = await vscode.window.showWarningMessage(
        `确定删除按钮 "${button.label}"?`,
        '确定', '取消'
    );

    if (confirm === '确定') {
        buttonManager.removeButton(button.id);
        unifiedTreeProvider.refresh();
    }
}

async function editButton(node: any) {
    if (!node && unifiedView.selection.length > 0) {
        node = unifiedView.selection[0];
    }

    const button = (node as any)?.itemData || (node as any)?.button;
    if (!button) { return; }

    while (true) {
        const items: (vscode.QuickPickItem & { value?: string })[] = [
            { label: `名称: ${button.label}`, value: 'label' },
            { label: `目标: ${button.target === 'serial' ? '串口' : button.target === 'ssh' ? 'SSH' : '两者'}`, value: 'target' },
            { label: `颜色: ${button.color || '默认'}`, value: 'color' },
            { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'sep1' },
            { label: `$(list-unordered) 管理命令 (${button.commands?.length || 0} 条)`, value: 'commands' },
            { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'sep2' },
            { label: '$(check) 保存并退出', value: 'save' },
            { label: '$(close) 取消', value: 'cancel' }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '编辑快捷按钮'
        });

        if (!selected || selected.value === 'cancel') { return; }
        if (selected.value === 'sep1' || selected.value === 'sep2') { continue; }
        if (selected.value === 'save') {
            buttonManager.updateButton(button.id, button);
            unifiedTreeProvider.refresh();
            vscode.window.showInformationMessage('按钮已更新');
            return;
        }

        if (selected.value === 'commands') {
            await editButtonCommands(button);
        } else if (selected.value === 'label') {
            const input = await vscode.window.showInputBox({ prompt: '按钮名称', value: button.label });
            if (input) { button.label = input; }
        } else if (selected.value === 'target') {
            const targetOptions = [
                { label: '串口', value: 'serial' },
                { label: 'SSH', value: 'ssh' },
                { label: '两者', value: 'both' }
            ];
            const chosen = await vscode.window.showQuickPick(targetOptions, { placeHolder: '选择目标' });
            if (chosen) { button.target = chosen.value as 'serial' | 'ssh' | 'both'; }
        } else if (selected.value === 'color') {
            const colorOptions = [
                { label: '默认', value: '' },
                { label: '绿色', value: 'green' },
                { label: '黄色', value: 'yellow' },
                { label: '红色', value: 'red' },
                { label: '蓝色', value: 'blue' }
            ];
            const chosen = await vscode.window.showQuickPick(colorOptions, { placeHolder: '选择颜色' });
            if (chosen) { button.color = chosen.value; }
        }
    }
}

async function editButtonCommands(button: any): Promise<void> {
    if (!button.commands) {
        button.commands = [];
    }

    while (true) {
        const items: (vscode.QuickPickItem & { value?: string; cmdIndex?: number })[] = [];

        button.commands.forEach((cmd: any, idx: number) => {
            const preview = cmd.command.length > 30 ? cmd.command.substring(0, 30) + '...' : cmd.command;
            items.push({
                label: `${idx + 1}. ${preview}`,
                description: cmd.delay ? `延迟 ${cmd.delay}ms` : '',
                value: 'edit',
                cmdIndex: idx
            });
        });

        items.push(
            { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'sep' },
            { label: '$(add) 添加新命令', value: 'add' },
            { label: '$(arrow-up) 上移命令', value: 'up' },
            { label: '$(arrow-down) 下移命令', value: 'down' },
            { label: '$(trash) 删除命令', value: 'delete' },
            { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'sep2' },
            { label: '$(check) 完成', value: 'done' }
        );

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `管理命令 - 当前 ${button.commands.length} 条`
        });

        if (!selected || selected.value === 'done') { return; }
        if (selected.value === 'sep' || selected.value === 'sep2') { continue; }

        if (selected.value === 'add') {
            const command = await vscode.window.showInputBox({
                prompt: '输入命令',
                placeHolder: '例如: AT+RST'
            });
            if (command) {
                const delayStr = await vscode.window.showInputBox({
                    prompt: '延迟 (毫秒)',
                    value: '0'
                });
                button.commands.push({
                    id: `cmd-${Date.now()}`,
                    command,
                    delay: parseInt(delayStr || '0') || 0
                });
            }
        } else if (selected.value === 'edit' && selected.cmdIndex !== undefined) {
            const cmd = button.commands[selected.cmdIndex];
            const newCmd = await vscode.window.showInputBox({
                prompt: '编辑命令',
                value: cmd.command
            });
            if (newCmd !== undefined) {
                const newDelay = await vscode.window.showInputBox({
                    prompt: '延迟 (毫秒)',
                    value: String(cmd.delay || 0)
                });
                cmd.command = newCmd;
                cmd.delay = parseInt(newDelay || '0') || 0;
            }
        } else if (selected.value === 'delete') {
            if (button.commands.length === 0) { continue; }
            const idxStr = await vscode.window.showInputBox({
                prompt: '输入要删除的命令编号',
                placeHolder: `1-${button.commands.length}`
            });
            const idx = parseInt(idxStr || '') - 1;
            if (idx >= 0 && idx < button.commands.length) {
                button.commands.splice(idx, 1);
            }
        } else if (selected.value === 'up') {
            if (button.commands.length < 2) { continue; }
            const idxStr = await vscode.window.showInputBox({
                prompt: '输入要上移的命令编号',
                placeHolder: `1-${button.commands.length}`
            });
            const idx = parseInt(idxStr || '') - 1;
            if (idx > 0 && idx < button.commands.length) {
                [button.commands[idx - 1], button.commands[idx]] = [button.commands[idx], button.commands[idx - 1]];
            }
        } else if (selected.value === 'down') {
            if (button.commands.length < 2) { continue; }
            const idxStr = await vscode.window.showInputBox({
                prompt: '输入要下移的命令编号',
                placeHolder: `1-${button.commands.length}`
            });
            const idx = parseInt(idxStr || '') - 1;
            if (idx >= 0 && idx < button.commands.length - 1) {
                [button.commands[idx], button.commands[idx + 1]] = [button.commands[idx + 1], button.commands[idx]];
            }
        }
    }
}

async function executeButton(button: any) {
    if (!button?.commands || button.commands.length === 0) {
        vscode.window.showWarningMessage('按钮没有配置命令');
        return;
    }

    try {
        await buttonManager.executeButton(button);
    } catch (error) {
        vscode.window.showErrorMessage(`执行失败: ${error}`);
    }
}

function getButtonFromNode(node: any): any {
    if (!node && unifiedView.selection.length > 0) {
        node = unifiedView.selection[0];
    }
    return (node as any)?.itemData || (node as any)?.button;
}

async function moveButtonUp(node: any) {
    const button = getButtonFromNode(node);
    if (!button?.id) { return; }
    buttonManager.moveButtonUp(button.id);
    unifiedTreeProvider.refresh();
}

async function moveButtonDown(node: any) {
    const button = getButtonFromNode(node);
    if (!button?.id) { return; }
    buttonManager.moveButtonDown(button.id);
    unifiedTreeProvider.refresh();
}

async function moveToTop(node: any) {
    const button = getButtonFromNode(node);
    if (!button?.id) { return; }
    buttonManager.moveButtonToTop(button.id);
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`按钮 "${button.label}" 已移至顶部`);
}

async function moveToBottom(node: any) {
    const button = getButtonFromNode(node);
    if (!button?.id) { return; }
    buttonManager.moveButtonToBottom(button.id);
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`按钮 "${button.label}" 已移至底部`);
}

async function editBaudRate() {
    const config = vscode.workspace.getConfiguration('qserial.serial');
    const current = config.get<number>('defaultBaudRate', 115200);

    const items: vscode.QuickPickItem[] = [
        { label: '9600', description: '常用波特率' },
        { label: '19200', description: '常用波特率' },
        { label: '38400', description: '常用波特率' },
        { label: '57600', description: '常用波特率' },
        { label: '115200', description: '常用波特率 (默认)' },
        { label: '230400', description: '高速波特率' },
        { label: '460800', description: '高速波特率' },
        { label: '921600', description: '高速波特率' },
        { label: '自定义...', description: '输入自定义值' }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前: ${current} baud`
    });

    if (!selected) { return; }

    let value: number;
    if (selected.label === '自定义...') {
        const input = await vscode.window.showInputBox({
            prompt: '输入波特率',
            value: String(current),
            validateInput: v => /^\d+$/.test(v) && parseInt(v) > 0 ? null : '无效的波特率'
        });
        if (!input) { return; }
        value = parseInt(input);
    } else {
        value = parseInt(selected.label);
    }

    await config.update('defaultBaudRate', value, vscode.ConfigurationTarget.Global);
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`默认波特率已设为 ${value}`);
}

async function editDataBits() {
    const config = vscode.workspace.getConfiguration('qserial.serial');
    const current = config.get<number>('dataBits', 8);

    const items: vscode.QuickPickItem[] = [5, 6, 7, 8].map(v => ({
        label: String(v),
        description: v === current ? '当前' : ''
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前数据位: ${current}`
    });

    if (!selected) { return; }

    await config.update('dataBits', parseInt(selected.label), vscode.ConfigurationTarget.Global);
    unifiedTreeProvider.refresh();
}

async function editStopBits() {
    const config = vscode.workspace.getConfiguration('qserial.serial');
    const current = config.get<number>('stopBits', 1);

    const items: vscode.QuickPickItem[] = [1, 2].map(v => ({
        label: String(v),
        description: v === current ? '当前' : ''
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前停止位: ${current}`
    });

    if (!selected) { return; }

    await config.update('stopBits', parseInt(selected.label), vscode.ConfigurationTarget.Global);
    unifiedTreeProvider.refresh();
}

async function editParity() {
    const config = vscode.workspace.getConfiguration('qserial.serial');
    const current = config.get<string>('parity', 'none');

    const parityNames: Record<string, string> = {
        'none': '无校验',
        'even': '偶校验',
        'odd': '奇校验',
        'mark': 'Mark',
        'space': 'Space'
    };

    const items: vscode.QuickPickItem[] = Object.keys(parityNames).map(k => ({
        label: parityNames[k],
        description: k === current ? '当前' : ''
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前校验: ${parityNames[current]}`
    });

    if (!selected) { return; }

    const parityKey = Object.keys(parityNames).find(k => parityNames[k] === selected.label);
    if (parityKey) {
        await config.update('parity', parityKey, vscode.ConfigurationTarget.Global);
        unifiedTreeProvider.refresh();
    }
}

async function toggleAutoNewline() {
    const config = vscode.workspace.getConfiguration('qserial.serial');
    const current = config.get<boolean>('autoNewline', true);
    await config.update('autoNewline', !current, vscode.ConfigurationTarget.Global);
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`自动换行已${!current ? '开启' : '关闭'}`);
}

function openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'qserial');
}

function showPanel() {
    vscode.commands.executeCommand('workbench.view.extension.qserial-panel');
}

async function startSerialLog() {
    const terminalName = terminalManager.getSerialTerminalName();
    if (!terminalName) {
        vscode.window.showWarningMessage('没有活动的串口连接');
        return;
    }

    if (terminalManager.logger.isLogging(terminalName)) {
        vscode.window.showWarningMessage(`串口 "${terminalName}" 已在记录中`);
        return;
    }

    const config = vscode.workspace.getConfiguration('qserial.log');
    const customPath = config.get<string>('defaultPath', '');

    try {
        const filePath = await terminalManager.logger.startLogging(
            terminalName,
            'serial',
            customPath || undefined
        );
        unifiedTreeProvider.refresh();
        vscode.window.showInformationMessage(`开始记录串口日志: ${filePath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`启动日志记录失败: ${error}`);
    }
}

async function stopSerialLog() {
    const terminalName = terminalManager.getSerialTerminalName();
    if (!terminalName) {
        vscode.window.showWarningMessage('没有活动的串口连接');
        return;
    }

    try {
        await terminalManager.logger.stopLogging(terminalName);
        unifiedTreeProvider.refresh();
        vscode.window.showInformationMessage(`已停止记录串口日志`);
    } catch (error) {
        vscode.window.showErrorMessage(`停止日志记录失败: ${error}`);
    }
}

async function startSSHLog(node?: any) {
    if (!node && unifiedView.selection.length > 0) {
        node = unifiedView.selection[0];
    }

    let terminalName: string | undefined;
    
    if (node?.itemData?.terminalName) {
        terminalName = node.itemData.terminalName;
    } else if (node?.id && typeof node.id === 'string') {
        const conn = sshManager.getConnectionInfo(node.id);
        terminalName = conn?.terminalName;
    }

    if (!terminalName) {
        const connections = sshManager.getAllConnections();
        if (connections.length === 0) {
            vscode.window.showWarningMessage('没有活动的 SSH 连接');
            return;
        }

        const items = connections.map(conn => ({
            label: conn.terminalName || conn.hostId,
            description: conn.host
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要记录的 SSH 终端'
        });

        if (!selected) { return; }
        terminalName = selected.label;
    }

    if (terminalManager.logger.isLogging(`SSH: ${terminalName}`)) {
        vscode.window.showWarningMessage(`SSH 终端 "${terminalName}" 已在记录中`);
        return;
    }

    const config = vscode.workspace.getConfiguration('qserial.log');
    const customPath = config.get<string>('defaultPath', '');

    try {
        const filePath = await terminalManager.logger.startLogging(
            `SSH: ${terminalName}`,
            'ssh',
            customPath || undefined
        );
        unifiedTreeProvider.refresh();
        vscode.window.showInformationMessage(`开始记录 SSH 日志: ${filePath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`启动日志记录失败: ${error}`);
    }
}

async function stopSSHLog(node?: any) {
    if (!node && unifiedView.selection.length > 0) {
        node = unifiedView.selection[0];
    }

    let terminalName: string | undefined;
    
    if (node?.itemData?.terminalName) {
        terminalName = node.itemData.terminalName;
    } else if (node?.id && typeof node.id === 'string') {
        const conn = sshManager.getConnectionInfo(node.id);
        terminalName = conn?.terminalName;
    }

    if (!terminalName) {
        const sessions = terminalManager.logger.getActiveSessions()
            .filter(s => s.terminalType === 'ssh');
        
        if (sessions.length === 0) {
            vscode.window.showWarningMessage('没有正在记录的 SSH 终端');
            return;
        }

        const items = sessions.map(s => ({
            label: s.terminalName,
            description: s.filePath
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要停止记录的 SSH 终端'
        });

        if (!selected) { return; }
        terminalName = selected.label.replace('SSH: ', '');
    }

    try {
        await terminalManager.logger.stopLogging(`SSH: ${terminalName}`);
        unifiedTreeProvider.refresh();
        vscode.window.showInformationMessage(`已停止记录 SSH 日志`);
    } catch (error) {
        vscode.window.showErrorMessage(`停止日志记录失败: ${error}`);
    }
}

async function openLogFolder() {
    const config = vscode.workspace.getConfiguration('qserial.log');
    const customPath = config.get<string>('defaultPath', '');
    const logPath = customPath || terminalManager.logger.getDefaultLogPath();

    try {
        const fs = require('fs');
        if (!fs.existsSync(logPath)) {
            fs.mkdirSync(logPath, { recursive: true });
        }
        
        const uri = vscode.Uri.file(logPath);
        await vscode.env.openExternal(uri);
    } catch (error) {
        vscode.window.showErrorMessage(`无法打开日志文件夹: ${error}`);
    }
}

async function setLogPath() {
    const currentPath = vscode.workspace.getConfiguration('qserial.log').get<string>('defaultPath', '');
    
    const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择日志存储文件夹',
        defaultUri: currentPath ? vscode.Uri.file(currentPath) : undefined,
        title: '选择日志存储路径'
    });

    if (!result || result.length === 0) { return; }

    const selectedPath = result[0].fsPath;
    const config = vscode.workspace.getConfiguration('qserial.log');
    await config.update('defaultPath', selectedPath, vscode.ConfigurationTarget.Global);
    
    unifiedTreeProvider.refresh();
    vscode.window.showInformationMessage(`日志路径已设置为: ${selectedPath}`);
}

async function resetLogPath() {
    const config = vscode.workspace.getConfiguration('qserial.log');
    await config.update('defaultPath', '', vscode.ConfigurationTarget.Global);
    
    const defaultPath = terminalManager.logger.getDefaultLogPath();
    vscode.window.showInformationMessage(`日志路径已恢复为默认: ${defaultPath}`);
    unifiedTreeProvider.refresh();
}

export function deactivate() {
    Logger.info('QSerial extension deactivating...');

    serialManager?.disconnect();
    sshManager?.disconnect();
    terminalManager?.dispose();

    Logger.info('QSerial extension deactivated');
}

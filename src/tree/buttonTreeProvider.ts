import * as vscode from 'vscode';
import { ButtonManager, CustomButton, CommandItem } from '../buttons/buttonManager';

export class ButtonTreeProvider implements vscode.TreeDataProvider<ButtonItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ButtonItem | undefined | null | void> =
        new vscode.EventEmitter<ButtonItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ButtonItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(private buttonManager: ButtonManager) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ButtonItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ButtonItem): Thenable<ButtonItem[]> {
        if (element) {
            // 展开按钮时显示命令列表
            if (element.button && element.button.commands) {
                const items: ButtonItem[] = [];
                element.button.commands.forEach((cmd: CommandItem, idx: number) => {
                    const preview = cmd.command.length > 40 ? cmd.command.substring(0, 40) + '...' : cmd.command;
                    const cmdItem = new ButtonItem(
                        `${idx + 1}. ${preview}`,
                        element.button,
                        vscode.TreeItemCollapsibleState.None
                    );
                    cmdItem.description = cmd.delay ? `延迟 ${cmd.delay}ms` : '';
                    cmdItem.tooltip = `命令: ${cmd.command}\n延迟: ${cmd.delay || 0}ms`;
                    cmdItem.iconPath = new vscode.ThemeIcon('chevron-right');
                    cmdItem.contextValue = 'button-command';
                    items.push(cmdItem);
                });
                return Promise.resolve(items);
            }
            return Promise.resolve([]);
        }

        const buttons = this.buttonManager.getButtons();
        const items: ButtonItem[] = [];

        // Add buttons
        for (const button of buttons) {
            // Set description with color indicator
            const colorIndicator: Record<string, string> = {
                'green': '🟢',
                'yellow': '🟡',
                'red': '🔴',
                'blue': '🔵'
            };
            const indicator = colorIndicator[button.color || ''] || '📍';
            const cmdCount = button.commands?.length || 0;

            const item = new ButtonItem(
                `${indicator} ${button.label}`,
                button,
                vscode.TreeItemCollapsibleState.None
            );

            // Set icon with color
            const colorMap: Record<string, vscode.ThemeColor | undefined> = {
                'green': new vscode.ThemeColor('charts.green'),
                'yellow': new vscode.ThemeColor('charts.yellow'),
                'red': new vscode.ThemeColor('charts.red'),
                'blue': new vscode.ThemeColor('charts.blue')
            };
            const iconColor = colorMap[button.color || ''];
            item.iconPath = new vscode.ThemeIcon('play', iconColor);

            // 显示单条命令预览
            if (cmdCount === 1) {
                const cmd = button.commands[0].command;
                item.description = cmd.length > 20 ? cmd.substring(0, 20) + '...' : cmd;
            }

            // Set tooltip
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

            // Set command to execute on click
            item.command = {
                command: 'qserial.buttons.executeButton',
                title: '执行',
                arguments: [button]
            };

            item.contextValue = 'custom-button';

            items.push(item);
        }

        // Add "Add button" item
        const addItem = new ButtonItem(
            '添加按钮...',
            null,
            vscode.TreeItemCollapsibleState.None
        );
        addItem.iconPath = new vscode.ThemeIcon('add');
        addItem.command = {
            command: 'qserial.buttons.addButton',
            title: '添加按钮'
        };
        items.push(addItem);

        return Promise.resolve(items);
    }
}

class ButtonItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly button: CustomButton | null,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

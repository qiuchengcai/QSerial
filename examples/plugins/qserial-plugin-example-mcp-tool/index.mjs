/**
 * 示例插件：自定义 MCP 工具 + 配置项演示
 *
 * 演示如何通过宿主 API 注册一个新的 MCP 工具（自动纳入现有 tools/list 与
 * Bearer token 鉴权），以及如何声明 configSchema、订阅配置变更（ctx.config.onChange）。
 */

export async function activate(ctx) {
  ctx.mcp.registerTool(
    {
      name: 'conn.analyze.custom',
      description:
        '示例插件工具：列出当前活跃连接数量与名称摘要，演示插件注册自定义 MCP 工具。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async () => {
      const connections = ctx.connection.list();
      const greeting = ctx.config.get('greeting') || 'Hello from plugin';
      return JSON.stringify(
        {
          ok: true,
          tool: 'conn.analyze.custom',
          greeting,
          active_connections: connections.length,
          connections: connections.map((c) => ({
            id: c.id,
            type: c.type,
            name: c.name,
            state: c.state,
          })),
        },
        null,
        2
      );
    }
  );

  // 订阅配置变更：设置页保存配置后，插件侧实时收到通知
  ctx.config.onChange(({ key, value }) => {
    ctx.log.info(`config changed: ${key} = ${JSON.stringify(value)}`);
  });

  ctx.log.info('registered MCP tool conn.analyze.custom');
}

export function deactivate() {
  // 贡献由宿主在停用插件时统一回收
}

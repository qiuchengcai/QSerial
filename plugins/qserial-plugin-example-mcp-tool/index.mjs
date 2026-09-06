/**
 * 示例插件：自定义 MCP 工具
 *
 * 演示如何通过宿主 API 注册一个新的 MCP 工具。该工具会自动纳入现有
 * tools/list 与鉴权体系（Bearer token），调用方必须持有正确 token 才能访问。
 *
 * 第三方开发者参照此结构即可注册任意自定义 MCP 工具。
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
      return JSON.stringify(
        {
          ok: true,
          tool: 'conn.analyze.custom',
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
  ctx.log.info('registered MCP tool conn.analyze.custom');
}

export function deactivate() {
  // 贡献由宿主在停用插件时统一回收
}

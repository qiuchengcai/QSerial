/**
 * 注册助手 MCP 工具（供外部 AI 客户端 / MCP 服务器调用）。
 */

function json(v) {
  return JSON.stringify(v, null, 2);
}

export function registerMcpTools(ctx, service) {
  const tool = (name, description, properties, required, handler) => {
    ctx.mcp.registerTool(
      {
        name,
        description,
        inputSchema: { type: 'object', properties, required },
      },
      async (args) => {
        try {
          const result = await handler(args || {});
          return typeof result === 'string' ? result : json(result);
        } catch (err) {
          return json({ error: err.message || String(err) });
        }
      }
    );
  };

  tool('assistant.search', '在本地知识库中检索相关知识片段', { query: { type: 'string' }, topK: { type: 'number' } }, ['query'], (args) =>
    service.search(args.query, null, args.topK)
  );

  tool('assistant.ask', '基于本地知识库回答串口/嵌入式相关问题（需配置 AI 服务）', { query: { type: 'string' } }, ['query'], (args) =>
    service.chatSync(args.query, [], undefined).then((r) => json(r))
  );

  tool('assistant.analyzeLog', '分析串口日志，识别协议类型与异常', { text: { type: 'string' } }, ['text'], (args) =>
    service.analyzeLogSync(args.text)
  );

  tool('assistant.generateCommand', '根据自然语言需求生成串口/AT 命令（需配置 AI 服务）', { description: { type: 'string' } }, ['description'], (args) =>
    service.generateCommandSync(args.description, undefined)
  );

  tool('knowledge.listModules', '列出知识库模块', {}, [], () => service.store.listModules());
}

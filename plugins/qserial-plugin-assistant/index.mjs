/**
 * QSerial 智能助手插件入口。
 * activate(ctx) 由宿主 PluginManager 调用，deactivate() 在停用/卸载时调用。
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { AssistantService } from './lib/service.mjs';
import { registerMcpTools } from './lib/mcp-tools.mjs';

const PLUGIN_ID = 'qserial-plugin-assistant';

let service = null;

function resolveDataDir() {
  try {
    return path.join(app.getPath('userData'), 'plugins-data', PLUGIN_ID);
  } catch {
    return path.join(process.cwd(), '.qserial-data', PLUGIN_ID);
  }
}

export async function activate(ctx) {
  const pluginDir = path.dirname(fileURLToPath(import.meta.url));
  service = new AssistantService({
    ctx,
    pluginId: PLUGIN_ID,
    pluginDir,
    dataDir: resolveDataDir(),
  });
  await service.init();
  service.registerIpc();
  registerMcpTools(ctx, service);
  ctx.ui.contribute([{ id: `${PLUGIN_ID}.panel`, label: '智能助手', kind: 'sidebar' }]);
  ctx.log.info(`activated, dataDir=${service.dataDir}`);
}

export async function deactivate() {
  if (service) {
    await service.shutdown();
    service = null;
  }
}

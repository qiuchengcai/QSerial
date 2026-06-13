/**
 * 应用级 MCP 工具处理函数 (app.screenshot, app.macro.*)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatOk, formatError } from '../ai-helpers.js';
import { ConnectionFactory } from '../../connection/factory.js';
import type { ToolHandler } from '../types';

const SCREENSHOT_DIR = path.resolve(process.cwd?.() || __dirname, '../../docs');

export const appHandlers: Record<string, ToolHandler> = {
  'app.screenshot': async (args, ctx) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return '错误: 主窗口未就绪';
    }
    try {
      const mode = (args.mode as string) || 'html';

      if (mode === 'html') {
        const compact = args.compact !== false;
        const html = await ctx.mainWindow.webContents.executeJavaScript(`
          (function() {
            var doc = document.documentElement.cloneNode(true);
            var body = doc.querySelector('body');
            if (!body) return '错误: body 不存在';
            body.querySelectorAll('script').forEach(function(s){ s.remove(); });
            ${compact ? `
            doc.querySelectorAll('style[data-vite-dev-id]').forEach(function(s){ s.remove(); });
            body.querySelectorAll('*').forEach(function(el){
              ['data-vite-dev-id','data-vite-hmr'].forEach(function(a){ el.removeAttribute(a); });
              var attrs = el.getAttributeNames().filter(function(a){ return a.startsWith('data-v-'); });
              attrs.forEach(function(a){ el.removeAttribute(a); });
            });
            ` : ''}
            return '<!DOCTYPE html>\\n' + doc.outerHTML;
          })()
        `);
        try {
          fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          const file = path.join(SCREENSHOT_DIR, `window-snapshot-${Date.now()}.html`);
          fs.writeFileSync(file, html, 'utf-8');
        } catch (_) { /* 保存失败不影响返回 */ }
        return html;
      }

      const scale = (args.scale as number) || 0.5;
      const quality = (args.quality as number) || 60;
      const scope = (args.scope as string) || 'body';

      const [rawImage, bodySizeResult] = await Promise.all([
        ctx.mainWindow.webContents.capturePage(),
        scope === 'body'
          ? ctx.mainWindow.webContents.executeJavaScript(`
              (function() {
                var b = document.body;
                if (!b) return null;
                var r = b.getBoundingClientRect();
                return { w: Math.round(r.width * ${scale}), h: Math.round(r.height * ${scale}) };
              })()
            `)
          : Promise.resolve(null),
      ]);

      const size = rawImage.getSize();
      const newW = Math.round(size.width * scale);
      const newH = Math.round(size.height * scale);
      const image = rawImage.resize({ width: newW, height: newH });
      const jpg = image.toJPEG(quality).toString('base64');

      const svgWidth = bodySizeResult?.w ?? newW;
      const svgHeight = bodySizeResult?.h ?? newH;

      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg"',
        ` width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${newW} ${newH}">`,
        `  <image width="${newW}" height="${newH}"`,
        `    href="data:image/jpeg;base64,${jpg}" />`,
        '</svg>',
      ].join('\n');

      const ts = Date.now();
      try {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        const file = path.join(SCREENSHOT_DIR, `screenshot-${ts}.svg`);
        fs.writeFileSync(file, svg, 'utf-8');
      } catch (_) { /* 保存失败不影响返回 */ }
      return svg;
    } catch (err) {
      return `错误: 截图失败 — ${(err as Error).message}`;
    }
  },

  'app.macro.list': async (_args, ctx) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) return formatError('INTERNAL', 'No window');
    try {
      const raw = await ctx.mainWindow.webContents.executeJavaScript(
        "JSON.parse(localStorage.getItem('qserial-terminal-macros') || '{}')?.state?.savedMacros || []"
      );
      const list = (raw || []).map((m: any) => ({ name: m.name, id: m.id, steps: m.steps?.length || 0, created: new Date(m.createdAt).toISOString() }));
      return formatOk({ macros: list, total: list.length });
    } catch (e: any) { return formatError('INTERNAL', e.message); }
  },

  'app.macro.run': async (args, ctx) => {
    const connId = (args.id || args.connectionId) as string | undefined;
    const macroName = args.name as string;
    if (!macroName) return formatError('INVALID_PARAM', 'name is required');
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) return formatError('INTERNAL', 'No window');
    try {
      const raw = await ctx.mainWindow.webContents.executeJavaScript(
        "JSON.parse(localStorage.getItem('qserial-terminal-macros') || '{}')?.state?.savedMacros || []"
      );
      const macro = (raw || []).find((m: any) => m.name === macroName);
      if (!macro) return formatError('NOT_FOUND', 'Macro not found: ' + macroName);
      const conn = connId ? ConnectionFactory.get(connId) : null;
      if (!conn) return formatError('NOT_FOUND', 'Connection not found');
      const results: string[] = [];
      for (const step of macro.steps) {
        if (step.delay > 0) await new Promise(r => setTimeout(r, step.delay));
        await conn.write(step.data);
        results.push(step.data.replace(/\r?\n/g, '\\n'));
      }
      return formatOk({ macro: macroName, steps_executed: results.length, commands: results });
    } catch (e: any) { return formatError('INTERNAL', e.message); }
  },
};

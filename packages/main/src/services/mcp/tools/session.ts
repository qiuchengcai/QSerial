/**
 * 会话管理 MCP 工具处理函数
 */

import { sendMCPNotification } from '../notifications.js';
import type { ToolHandler } from '../types';

export const sessionHandlers: Record<string, ToolHandler> = {
  'session.list': async (_args, ctx) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return '错误: 主窗口未就绪';
    }
    try {
      const sessions = await ctx.mainWindow.webContents.executeJavaScript(
        `(function() {
          try {
            var raw = localStorage.getItem('qserial_saved_sessions');
            if (!raw) return [];
            var data = JSON.parse(raw);
            var sessions = data.state ? data.state.sessions : (data.sessions || []);
            return (sessions || []).map(function(s) {
              var ss = {
                id: s.id, name: s.name, type: s.type,
                serialConfig: s.serialConfig || null,
                telnetConfig: s.telnetConfig || null,
                ptyConfig: s.ptyConfig || null,
                lastUsedAt: s.lastUsedAt
              };
              if (s.sshConfig) {
                ss.sshConfig = { host: s.sshConfig.host, port: s.sshConfig.port, username: s.sshConfig.username };
              } else {
                ss.sshConfig = null;
              }
              return ss;
            });
          } catch(e) { return '解析失败: ' + e.message; }
        })()`
      );
      if (typeof sessions === 'string') return sessions;
      if (!Array.isArray(sessions) || sessions.length === 0) {
        return '(没有已保存的会话)';
      }
      return JSON.stringify(sessions, null, 2);
    } catch (err) {
      return '错误: 读取会话失败 — ' + (err as Error).message;
    }
  },

  'session.save': async (args, ctx) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return '错误: 主窗口未就绪';
    }
    const sessionId = args.sessionId as string | undefined;
    const name = args.name as string;
    const connId = (args.id || args.connectionId) as string | undefined;
    let type = args.type as string | undefined;
    if (connId && !type) {
      const { ConnectionFactory } = await import('../../connection/factory.js');
      const conn = ConnectionFactory.get(connId);
      if (conn) { type = conn.type; }
    }
    if (!name) return '错误: 未提供 name 参数';
    if (!type) return '错误: 未提供 type 参数';
    if (!['serial', 'ssh', 'telnet', 'pty'].includes(type)) {
      return `错误: 不支持的会话类型 "${type}"`;
    }
    try {
      const sessionData = JSON.stringify({
        sessionId: sessionId || null,
        name,
        type,
        serialConfig: args.serialConfig || null,
        sshConfig: args.sshConfig || null,
        telnetConfig: args.telnetConfig || null,
        ptyConfig: args.ptyConfig || null,
      });
      const result = await ctx.mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            var raw = localStorage.getItem('qserial_saved_sessions');
            var data = raw ? JSON.parse(raw) : { state: { sessions: [] } };
            var sessions = data.state ? data.state.sessions : [];
            var input = ${sessionData};
            var now = new Date().toISOString();
            if (input.sessionId) {
              var idx = sessions.findIndex(function(s) { return s.id === input.sessionId; });
              if (idx < 0) return JSON.stringify({ error: '\\u4f1a\\u8bdd\\u4e0d\\u5b58\\u5728: ' + input.sessionId });
              sessions[idx] = {
                ...sessions[idx],
                name: input.name,
                type: input.type,
                serialConfig: input.serialConfig || sessions[idx].serialConfig || undefined,
                sshConfig: input.sshConfig || sessions[idx].sshConfig || undefined,
                telnetConfig: input.telnetConfig || sessions[idx].telnetConfig || undefined,
                ptyConfig: input.ptyConfig || sessions[idx].ptyConfig || undefined,
                lastUsedAt: now,
              };
              var resultId = input.sessionId;
            } else {
              var newSession = {
                id: crypto.randomUUID(),
                name: input.name,
                type: input.type,
                createdAt: now,
                lastUsedAt: now,
                serialConfig: input.serialConfig || undefined,
                sshConfig: input.sshConfig || undefined,
                telnetConfig: input.telnetConfig || undefined,
                ptyConfig: input.ptyConfig || undefined,
              };
              sessions.push(newSession);
              var resultId = newSession.id;
            }
            data.state.sessions = sessions;
            localStorage.setItem('qserial_saved_sessions', JSON.stringify(data));
            return JSON.stringify({ id: resultId });
          } catch(e) { return JSON.stringify({ error: e.message }); }
        })()
      `);
      const parsed = JSON.parse(result);
      if (parsed.error) return '错误: ' + parsed.error;
      sendMCPNotification('session/saved', { id: parsed.id, name });
      return JSON.stringify({ id: parsed.id, message: '会话已保存' }, null, 2);
    } catch (err) {
      return '错误: 保存会话失败 — ' + (err as Error).message;
    }
  },

  'session.delete': async (args, ctx) => {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return '错误: 主窗口未就绪';
    }
    const sessionId = args.sessionId as string;
    if (!sessionId) return '错误: 未提供 sessionId 参数';
    try {
      const escapedId = sessionId.replace(/'/g, "\\'");
      const result = await ctx.mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            var raw = localStorage.getItem('qserial_saved_sessions');
            if (!raw) return JSON.stringify({ error: '\\u6ca1\\u6709\\u5df2\\u4fdd\\u5b58\\u7684\\u4f1a\\u8bdd' });
            var data = JSON.parse(raw);
            var sessions = data.state ? data.state.sessions : [];
            var before = sessions.length;
            sessions = sessions.filter(function(s) { return s.id !== '${escapedId}'; });
            if (sessions.length === before) return JSON.stringify({ error: '\\u4f1a\\u8bdd\\u4e0d\\u5b58\\u5728' });
            data.state.sessions = sessions;
            localStorage.setItem('qserial_saved_sessions', JSON.stringify(data));
            return JSON.stringify({ success: true });
          } catch(e) { return JSON.stringify({ error: e.message }); }
        })()
      `);
      const parsed = JSON.parse(result);
      if (parsed.error) return '错误: ' + parsed.error;
      sendMCPNotification('session/deleted', { id: sessionId });
      return `会话 ${sessionId} 已删除`;
    } catch (err) {
      return '错误: 删除会话失败 — ' + (err as Error).message;
    }
  },
};

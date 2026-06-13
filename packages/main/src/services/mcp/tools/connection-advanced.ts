/**
 * 高级连接 MCP 工具处理函数
 * conn.analyze.*, conn.script.*, conn.share, conn.watch.*, conn.record.*
 */

import * as crypto from 'node:crypto';
import { ConnectionFactory } from '../../connection/factory.js';
import { ConnectionServerConnection } from '../../connection/connectionServer.js';
import { ConnectionState, ConnectionType, IPC_CHANNELS } from '@qserial/shared';
import type { ConnectionServerOptions } from '@qserial/shared';
import { sendMCPNotification } from '../notifications.js';
import { formatOk, formatError, appendHistory, historyLog } from '../ai-helpers.js';
import { requestSampling } from '../sampling.js';
import * as ctx from '../context.js';
import type { ToolHandler } from '../types';

export const connAdvancedHandlers: Record<string, ToolHandler> = {
  'conn.analyze.state': async (args) => {
    const id = ctx.resolveId(args);
    if (!id) return '错误: 未提供连接 id';
    const conn = ConnectionFactory.get(id);
    if (!conn) return `错误: 找不到连接 ${id}`;
    ctx.ensureBuffer(id);
    const totalBytes = ctx.bufferSize(id);
    const output = ctx.peekBuffer(id, 65536).toString('utf-8');
    const state = ctx.analyzeState(output, conn.state);
    return JSON.stringify({ ...state, buffer_bytes: totalBytes, output_tail_bytes: output.length }, null, 2);
  },

  'conn.analyze.probe': async (args) => {
    const probeId = ctx.resolveId(args);
    if (!probeId) return formatError('MISSING_PARAM', 'missing id');
    const probeConn = ConnectionFactory.get(probeId);
    if (!probeConn) return formatError('CONN_NOT_FOUND', 'connection not found');
    if (probeConn.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');

    const knownDevices = [
      { name: 'ESP32/ESP8266', patterns: ['ESP32', 'ESP8266', 'AT version', 'ready'], baud_hint: 115200 },
      { name: 'STM32', patterns: ['STM32', 'STMicroelectronics', 'U-Boot SPL'], baud_hint: 115200 },
      { name: 'Raspberry Pi', patterns: ['Raspberry Pi', 'raspberrypi', 'Debian', 'Raspbian'], baud_hint: 115200 },
      { name: 'NXP i.MX', patterns: ['imx6ull', 'imx6', 'imx8', 'imx', 'NXP', 'Freescale', '100ask'], baud_hint: 115200 },
      { name: 'TI AM335x', patterns: ['AM335', 'BeagleBone', 'beaglebone', 'TI Sitara'], baud_hint: 115200 },
      { name: 'U-Boot', patterns: ['U-Boot', 'Hit any key', 'Loading from', 'Booting'], baud_hint: 115200 },
      { name: 'Buildroot', patterns: ['Buildroot', 'buildroot'], baud_hint: 115200 },
      { name: 'Yocto/Poky', patterns: ['Yocto', 'Poky', 'poky'], baud_hint: 115200 },
      { name: 'OpenWrt', patterns: ['OpenWrt', 'openwrt', 'LuCI', 'Attitude Adjustment', 'Barrier Breaker', 'Chaos Calmer', 'LEDE'], baud_hint: 115200 },
      { name: 'Linux', patterns: ['login:', 'Password:', 'Debian', 'Ubuntu', 'CentOS', 'kernel'], baud_hint: 115200 },
      { name: 'BusyBox', patterns: ['BusyBox', '/ #', '# '], baud_hint: 115200 },
      { name: 'Cisco IOS', patterns: ['Cisco IOS', 'Router>', 'Switch>', 'enable'], baud_hint: 9600 },
      { name: 'Juniper JunOS', patterns: ['JunOS', 'Juniper', 'junos'], baud_hint: 9600 },
      { name: 'MikroTik RouterOS', patterns: ['MikroTik', 'RouterOS', 'mikrotik'], baud_hint: 115200 },
      { name: 'EdgeOS (Ubiquiti)', patterns: ['EdgeOS', 'Ubiquiti', 'EdgeRouter', 'Vyatta'], baud_hint: 115200 },
      { name: 'Arduino', patterns: ['Arduino', 'avrdude'], baud_hint: 9600 },
      { name: 'FreeRTOS', patterns: ['FreeRTOS', 'freertos'], baud_hint: 115200 },
      { name: 'Zephyr', patterns: ['Zephyr', 'zephyr'], baud_hint: 115200 },
      { name: 'NuttX', patterns: ['NuttX', 'nuttx', 'NuttShell'], baud_hint: 115200 },
      { name: 'Android', patterns: ['Android', 'android', 'bootloader', 'fastboot'], baud_hint: 115200 },
      { name: 'BIOS/UEFI', patterns: ['BIOS', 'UEFI', 'American Megatrends', 'AMI', 'Insyde', 'Phoenix'], baud_hint: 115200 },
    ];

    ctx.ensureBuffer(probeId); ctx.clearBuffer(probeId);
    probeConn.write(Buffer.from('AT\n', 'utf-8'));
    appendHistory(probeId, 'send', 'AT\n');
    await ctx.sleep(3000);
    const probeOutput = ctx.consumeBuffer(probeId).toString('utf-8');
    if (probeOutput) appendHistory(probeId, 'recv', probeOutput);
    const matches = knownDevices.filter(d => d.patterns.some(p => probeOutput.includes(p)))
      .map(d => ({ device: d.name, confidence: d.patterns.filter(p => probeOutput.includes(p)).length / d.patterns.length, baud_hint: d.baud_hint }));
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.length > 0 ? formatOk({ best_match: matches[0], all_matches: matches.slice(0, 3) })
      : formatOk({ device: 'unknown', confidence: 0, output_sample: probeOutput.slice(0, 300) });
  },

  'conn.analyze.report': async (args) => {
    const sumId = ctx.resolveId(args);
    if (!sumId) return formatError('MISSING_PARAM', 'missing id');
    const log = historyLog.get(sumId) || [];
    const sendEntries = log.filter(e => e.dir === 'send');
    const recvEntries = log.filter(e => e.dir === 'recv');
    const totalSend = sendEntries.reduce((s, e) => s + e.data.length, 0);
    const totalRecv = recvEntries.reduce((s, e) => s + e.data.length, 0);
    const tFirst = log.length > 0 ? log[0].ts : 0;
    const tLast = log.length > 0 ? log[log.length - 1].ts : 0;
    return formatOk({ connection_id: sumId, duration_ms: tLast - tFirst, total_commands: sendEntries.length, total_bytes_sent: totalSend, total_bytes_received: totalRecv, history_entries: log.length });
  },

  'conn.script.login': async (args) => {
    const id = ctx.resolveId(args);
    const username = args.username as string;
    const password = (args.password as string) || '';
    if (!id) return '错误: 未提供连接 id';
    if (!username) return '错误: 未提供 username 参数';

    const loginPrompt = (args.loginPrompt as string) || 'login[:\\s]|username[:\\s]';
    const passwordPrompt = (args.passwordPrompt as string) || '[Pp]assword[:\\s]';
    const shellPrompt = (args.shellPrompt as string) || '[#$>]\\s';
    const timeout = (args.timeout as number) || 30;
    const debug = args.debug !== false;
    const noPassword = args.no_password === true;
    const conn = ConnectionFactory.get(id);
    if (!conn) return `错误: 找不到连接 ${id}`;
    if (conn.state !== ConnectionState.CONNECTED) {
      return `错误: 连接未就绪（当前状态：${conn.state}）`;
    }
    ctx.ensureBuffer(id);

    const steps: string[] = [];
    const addStep = (s: string) => { if (debug) steps.push(s); };

    addStep(`[1/5] 等待登录提示 (regex: "${loginPrompt}", timeout=${timeout}s)...`);

    const loginResult = await ctx.waitPattern(id, loginPrompt, timeout, true);
    if (!loginResult.matched) {
      try {
        const lctx2 = loginResult.output.slice(-500);
        const lchoice = await requestSampling(
          'Login prompt not matched on device',
          'Device output: ' + lctx2 + ' | Pattern: ' + loginPrompt,
          ['retry', 'send_anyway', 'abort'], 15000
        );
        if (lchoice === 'retry') return formatError('SAMPLING_RETRY', 'AI suggests retry. Output: ' + lctx2);
        if (lchoice === 'abort') return formatError('SAMPLING_ABORT', 'AI aborted login');
      } catch { /* sampling timeout */ }
      if (debug) {
        return [
          ...steps,
          '[失败] 超时未匹配登录提示',
          `当前输出 (500B): ${loginResult.output.slice(-500)}`,
          '提示: 尝试先用 connection_read (consume=false) 查看终端内容，确认提示符格式',
        ].join('\n');
      }
      return `错误: 超时未检测到登录提示 "${loginPrompt}"。当前内容:\n${loginResult.output.slice(-500)}`;
    }
    addStep(`[2/5] 检测到登录提示，发送用户名 "${username}" (输出 ${loginResult.output.length}B)`);

    conn.write(Buffer.from(username + '\n', 'utf-8'));
    await ctx.sleep(300);
    ctx.clearBuffer(id);

    if (noPassword) {
      addStep(`[3/4] 跳过密码（no_password=true），等待 Shell 提示符 (regex: "${shellPrompt}", timeout=${timeout}s)...`);
      const shellResult2 = await ctx.waitPattern(id, shellPrompt, timeout, true);
      const output2 = ctx.consumeBuffer(id).toString('utf-8');
      if (shellResult2.matched) {
        const state2 = ctx.analyzeState(output2, conn.state);
        addStep(`[完成] 登录成功（无密码），Shell 类型: ${state2.shell_type || 'detected'}`);
        return steps.join('\n') + `\n\n登录成功。\n${output2.slice(-300)}`;
      }
      addStep('[完成] 凭据已发送（Shell 提示未检测到，可能已登录）');
      return steps.join('\n') + `\n\n${output2.slice(-500)}`;
    }

    addStep(`[3/5] 等待密码提示或 Shell 提示 (regex: "${passwordPrompt}" / "${shellPrompt}", timeout=${timeout}s)...`);
    const postUserResult = await ctx.waitForAnyPattern(id, [
      { pattern: passwordPrompt, isRegex: true },
      { pattern: shellPrompt, isRegex: true },
    ], timeout);

    if (postUserResult.matched && postUserResult.index === 1) {
      const remaining = ctx.consumeBuffer(id).toString('utf-8');
      const output = postUserResult.output + remaining;
      const state = ctx.analyzeState(output, conn.state);
      addStep('[跳过] 设备直接进入 Shell，未出现密码提示（无密码设备）');
      addStep(`[完成] 登录成功（无密码设备），Shell 类型: ${state.shell_type || 'detected'}`);
      return steps.join('\n') + `\n\n登录成功（检测到无密码设备）。\n${output.slice(-300)}`;
    }

    if (!postUserResult.matched) {
      if (debug) {
        return [
          ...steps,
          '[失败] 超时未匹配密码提示或 Shell 提示',
          '用户名已发送，但未检测到密码提示或 Shell 提示',
          `当前输出 (500B): ${postUserResult.output.slice(-500)}`,
          '提示: 检查用户名是否正确；或使用 no_password=true 跳过密码步骤；或使用 connection_read (consume=false) 查看终端',
        ].join('\n');
      }
      return `错误: 超时未检测到密码提示或 Shell 提示。当前内容:\n${postUserResult.output.slice(-500)}`;
    }

    addStep(`[4/5] 检测到密码提示，发送密码 (输出 ${postUserResult.output.length}B)`);
    conn.write(Buffer.from(password + '\n', 'utf-8'));
    await ctx.sleep(300);

    addStep(`[5/5] 等待 Shell 提示符 (regex: "${shellPrompt}", timeout=${timeout}s)...`);
    const shellResult = await ctx.waitPattern(id, shellPrompt, timeout, true);
    const output = ctx.consumeBuffer(id).toString('utf-8');

    if (shellResult.matched) {
      const state = ctx.analyzeState(output, conn.state);
      addStep(`[完成] 登录成功，Shell 类型: ${state.shell_type || 'detected'}`);
      return steps.join('\n') + `\n\n登录成功。\n${output.slice(-300)}`;
    }

    addStep('[完成] 凭据已发送（Shell 提示未检测到，可能已登录）');
    return steps.join('\n') + `\n\n${output.slice(-500)}`;
  },

  'conn.script.run': async (args) => {
    const rsid = ctx.resolveId(args);
    if (!rsid) return formatError('MISSING_PARAM', 'missing id');
    const steps = args.steps as Array<Record<string, unknown>> | undefined;
    if (!steps || !Array.isArray(steps) || steps.length === 0) return formatError('MISSING_PARAM', 'missing steps');
    const conn2 = ConnectionFactory.get(rsid);
    if (!conn2) return formatError('CONN_NOT_FOUND', 'connection not found');
    if (conn2.state !== ConnectionState.CONNECTED) return formatError('CONN_NOT_CONNECTED', 'not connected');

    const results: Array<Record<string, unknown>> = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const timeout2: number = typeof step.timeout_ms === 'number' ? step.timeout_ms : 5000;
      if (step.delay_ms) await ctx.sleep(step.delay_ms as number);
      ctx.ensureBuffer(rsid); ctx.clearBuffer(rsid);
      const t1 = Date.now();
      const sendStr: string = String(step.send || '');
      const data = sendStr.endsWith('\n') ? sendStr : sendStr + '\n';
      conn2.write(Buffer.from(data, 'utf-8'));
      appendHistory(rsid, 'send', data);
      const pats = [{ pattern: '[#$>]\\s', isRegex: true }];
      await ctx.waitForAnyPattern(rsid, pats, Math.ceil(timeout2 / 1000));
      const output2 = ctx.consumeBuffer(rsid).toString('utf-8');
      if (output2) appendHistory(rsid, 'recv', output2);
      sendMCPNotification('script/step_completed', { connection_id: rsid, step: i, total: steps.length, ok: true });
      const xp: string = (step.expect as string) || '';
      const isOk = !xp || output2.includes(xp);
      if (!isOk && xp) {
        try {
          const schoice = await requestSampling(
            'Script step ' + (i + 1) + ' failed: expected "' + xp + '" not found',
            'Command: ' + String(step.send || '') + ' | Output: ' + output2.slice(0, 400),
            ['retry', 'skip', 'abort'], 15000
          );
          if (schoice === 'retry') { i--; continue; }
          if (schoice === 'abort') return formatError('SCRIPT_ABORTED', 'AI aborted at step ' + (i + 1));
        } catch { /* sampling timeout */ }
        results.push({ step: i, description: (step.description as string) || ('step ' + (i + 1)), ok: false, output: output2.slice(0, 2000), duration_ms: Date.now() - t1, error: 'expect not matched' });
        continue;
      }
      results.push({ step: i, description: (step.description as string) || ('step ' + (i + 1)), ok: true, output: output2.slice(0, 2000), duration_ms: Date.now() - t1 });
    }
    return formatOk({ completed: results.length, total: steps.length, success: true, results });
  },

  'conn.share': async (args, toolCtx) => {
    const action = args.action as string;
    if (!action || !['start', 'stop', 'list'].includes(action)) {
      return '错误: 请提供 action 参数: "start" / "stop" / "list"';
    }

    if (action === 'start') {
      const sourceId = args.connection_id as string;
      const localPort = args.local_port as number;
      if (!sourceId) return '错误: 未提供 connection_id';
      if (!localPort) return '错误: 未提供 local_port';

      const sourceConn = ConnectionFactory.get(sourceId);
      if (!sourceConn) return `错误: 找不到源连接 ${sourceId}`;
      if (sourceConn.state !== ConnectionState.CONNECTED) {
        return `错误: 源连接未就绪（当前状态：${sourceConn.state}）`;
      }

      const serverId = crypto.randomUUID();
      const listenAddress = (args.listen_address as string) || '0.0.0.0';
      const password = (args.password as string) || ctx.mcpAuthPassword || undefined;

      const options: ConnectionServerOptions = {
        id: serverId,
        name: `Share-${sourceId.slice(0, 8)}`,
        type: ConnectionType.CONNECTION_SERVER,
        sourceType: 'existing',
        existingConnectionId: sourceId,
        localPort,
        listenAddress,
        accessPassword: password,
      };

      try {
        const serverConn = await ConnectionFactory.create(options);
        await serverConn.open();
        ctx.sharePool.set(serverId, { sourceId, serverId });
        sendMCPNotification('share/started', { share_id: serverId, source_id: sourceId, local_port: localPort });

        if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
          toolCtx.mainWindow.webContents.send(IPC_CHANNELS.MCP_SHARE_CHANGED, {
            shareId: serverId,
            running: true,
            sourceId,
            localPort,
            listenAddress,
          });
        }

        const status = (serverConn as ConnectionServerConnection).getStatus();
        return JSON.stringify({
          share_id: serverId,
          local_port: status.localPort,
          listen_address: status.listenAddress,
          source_id: sourceId,
          source_type: sourceConn.type,
          source_description: status.sourceDescription || `${sourceConn.type} - ${(sourceConn.options as { name?: string }).name || ''}`,
          client_count: status.clientCount,
          clients: status.clients,
          has_password: !!options.accessPassword,
          telnet_cmd: `telnet ${status.listenAddress} ${status.localPort}`,
        }, null, 2);
      } catch (err) {
        return `错误: 启动共享失败 — ${(err as Error).message}`;
      }
    }

    if (action === 'stop') {
      const shareId = args.share_id as string;
      if (!shareId) return '错误: 未提供 share_id';
      if (!ctx.sharePool.has(shareId)) return `错误: 找不到共享 ${shareId}`;

      try {
        await ConnectionFactory.destroy(shareId);
        ctx.sharePool.delete(shareId);
        ctx.removeBuffer(shareId);
        sendMCPNotification('share/stopped', { share_id: shareId });

        if (toolCtx.mainWindow && !toolCtx.mainWindow.isDestroyed()) {
          toolCtx.mainWindow.webContents.send(IPC_CHANNELS.MCP_SHARE_CHANGED, {
            shareId,
            running: false,
          });
        }

        return `共享 ${shareId} 已停止`;
      } catch (err) {
        return `错误: 停止共享失败 — ${(err as Error).message}`;
      }
    }

    if (action === 'list') {
      const shares: unknown[] = [];
      for (const [id, entry] of ctx.sharePool) {
        const srvConn = ConnectionFactory.get(id);
        if (srvConn && srvConn.type === ConnectionType.CONNECTION_SERVER) {
          const status = (srvConn as ConnectionServerConnection).getStatus();
          shares.push({
            share_id: id,
            source_id: entry.sourceId,
            source_type: srvConn.options.type,
            local_port: status.localPort,
            listen_address: status.listenAddress,
            client_count: status.clientCount,
            clients: status.clients,
            has_password: status.hasPassword,
            running: status.running,
            telnet_cmd: status.running ? `telnet ${status.listenAddress} ${status.localPort}` : null,
          });
        }
      }
      return shares.length > 0 ? JSON.stringify(shares, null, 2) : '(没有活跃的共享)';
    }

    return `错误: 未知 action "${action}"`;
  },

  'conn.watch.start': async (args) => {
    const watchId = ctx.resolveId(args);
    if (!watchId) return formatError('MISSING_PARAM', 'missing id');
    const watchConn = ConnectionFactory.get(watchId);
    if (!watchConn) return formatError('CONN_NOT_FOUND', 'connection not found');
    const rules = (args.rules as any[]) || [];
    if (!Array.isArray(rules) || rules.length === 0) return formatError('MISSING_PARAM', 'missing rules');
    const duration = (args.duration_ms as number) || 60000;
    const wid = 'watch_' + crypto.randomUUID().slice(0, 8);
    const compiled = rules.map((r: any) => ({ pattern: r.pattern as string, isRegex: r.regex !== false, level: (r.level as string) || 'warning' }));
    let stopped = false;
    ctx.watches.set(wid, () => { stopped = true; });
    (async () => {
      const tStart = Date.now();
      while (!stopped) {
        if (duration > 0 && Date.now() - tStart > duration) break;
        await ctx.sleep(2000);
        if (stopped) break;
        try {
          const data = Buffer.concat(ctx.buffers.get(watchId) || []).toString('utf-8');
          for (const r of compiled) {
            if (r.isRegex ? new RegExp(r.pattern, 'i').test(data) : data.includes(r.pattern)) {
              const alertEntry = { ts: Date.now(), pattern: r.pattern, level: r.level, context: data.slice(-200) };
              if (!ctx.watchResults.has(wid)) ctx.watchResults.set(wid, []);
              ctx.watchResults.get(wid)!.push(alertEntry);
              sendMCPNotification('connection/data_alert', { id: watchId, pattern: r.pattern, level: r.level, watch_id: wid, context: alertEntry.context });
            }
          }
        } catch { break; }
      }
      ctx.watches.delete(wid);
      setTimeout(() => ctx.watchResults.delete(wid), 30 * 60 * 1000);
    })().catch(() => {});
    return formatOk({ watch_id: wid, rules_count: compiled.length, duration_ms: duration });
  },

  'conn.watch.stop': async (args) => {
    const wid = args.watch_id as string;
    if (!wid) return formatError('MISSING_PARAM', 'missing watch_id');
    const stopFn = ctx.watches.get(wid);
    if (stopFn) { stopFn(); const wRes = ctx.watchResults.get(wid) || []; return formatOk({ stopped: wid, total_alerts: wRes.length, alerts: wRes }); }
    return formatError('NOT_FOUND', 'watch not found: ' + wid);
  },

  'conn.watch.results': async (args) => {
    const wid2 = args.watch_id as string;
    if (wid2) {
      const results2 = ctx.watchResults.get(wid2);
      if (!results2) return formatError('NOT_FOUND', 'no results');
      return formatOk({ watch_id: wid2, total: results2.length, alerts: results2 });
    }
    const allResults: Record<string, any> = {}; let grandTotal = 0;
    ctx.watchResults.forEach((v, k) => { allResults[k] = { total: v.length, alerts: v.map(a => ({ ts: new Date(a.ts).toISOString(), pattern: a.pattern, level: a.level, context: a.context })) }; grandTotal += v.length; });
    return formatOk({ watches_count: ctx.watchResults.size, total_alerts: grandTotal, watches: allResults });
  },

  'conn.record.start': async (args) => {
    const recId = ctx.resolveId(args);
    if (!recId) return formatError('MISSING_PARAM', 'missing id');
    if (ctx.recordings.has(recId)) return formatError('ALREADY_EXISTS', 'already recording');
    const recConn = ConnectionFactory.get(recId);
    if (!recConn) return formatError('CONN_NOT_FOUND', 'connection not found');
    const frames: Array<{ ts: number; data: string }> = [];
    const t0 = Date.now();
    const unsub = recConn.onData((data: Buffer) => {
      frames.push({ ts: Date.now() - t0, data: data.toString('utf-8') });
    });
    ctx.recordings.set(recId, { id: 'rec_' + crypto.randomUUID().slice(0, 8), connectionId: recId, startedAt: t0, duration_ms: 0, frames, unsub });
    return formatOk({ recording_id: ctx.recordings.get(recId)!.id, connection_id: recId, started: new Date(t0).toISOString() });
  },

  'conn.record.stop': async (args) => {
    const recId2 = ctx.resolveId(args);
    if (!recId2) return formatError('MISSING_PARAM', 'missing id');
    const rec = ctx.recordings.get(recId2);
    if (!rec) return formatError('NOT_FOUND', 'no active recording');
    rec.unsub();
    rec.duration_ms = Date.now() - rec.startedAt;
    ctx.recordings.delete(recId2);
    const totalBytes = rec.frames.reduce((s, f) => s + f.data.length, 0);
    return formatOk({ recording_id: rec.id, connection_id: rec.connectionId, duration_ms: rec.duration_ms, frames_count: rec.frames.length, total_bytes: totalBytes });
  },

  'conn.record.list': async () => {
    const list: Array<Record<string, any>> = [];
    ctx.recordings.forEach((v) => {
      list.push({ recording_id: v.id, connection_id: v.connectionId, started: new Date(v.startedAt).toISOString(), elapsed_ms: Date.now() - v.startedAt, frames_count: v.frames.length });
    });
    return formatOk({ active: list.length, recordings: list });
  },

  'conn.record.replay': async (args) => {
    const replayId = ctx.resolveId(args);
    if (!replayId) return formatError('MISSING_PARAM', 'missing id');
    const speed = (args.speed as number) || 1;
    const rec2 = ctx.recordings.get(replayId);
    if (!rec2) return formatError('NOT_FOUND', 'no active recording');
    const text = rec2.frames.map(f => f.data).join('');
    const compact = text.replace(/\x1b\[\d+;\d+R/g, '').replace(/\x1b\]0;[^\x07]*\x07/g, '');
    return formatOk({ recording_id: rec2.id, frames: rec2.frames.length, duration_ms: Date.now() - rec2.startedAt, speed, output: compact.slice(0, 50000) });
  },
};

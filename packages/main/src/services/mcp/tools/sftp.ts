/**
 * SFTP MCP 工具处理函数
 */

import { formatOk, formatError } from '../ai-helpers.js';
import { createSftp, destroySftp, listDirectory, downloadFile, uploadFile, mkdir as sftpMkdir, rm as sftpRm, stat as sftpStat } from '../../sftp/manager.js';
import type { ToolHandler } from '../types';

export const sftpHandlers: Record<string, ToolHandler> = {
  'sftp.connect': async (args) => {
    const sftpConnId = ((args.id || args.connectionId) as string);
    if (!sftpConnId) return formatError('MISSING_PARAM', 'missing id');
    try {
      const sftpId = await createSftp(sftpConnId);
      return formatOk({ sftp_id: sftpId, connection_id: sftpConnId });
    } catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.disconnect': async (args) => {
    const sftpSid = args.sftp_id as string;
    if (!sftpSid) return formatError('MISSING_PARAM', 'missing sftp_id');
    try { await destroySftp(sftpSid); return formatOk({ disconnected: sftpSid }); }
    catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.list': async (args) => {
    const sftpSid = args.sftp_id as string;
    const dirPath = (args.path as string) || '/';
    if (!sftpSid) return formatError('MISSING_PARAM', 'missing sftp_id');
    try {
      const files = await listDirectory(sftpSid, dirPath);
      return formatOk({ path: dirPath, count: files.length, files });
    } catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.download': async (args) => {
    const sftpSid = args.sftp_id as string;
    const remotePath = args.remote_path as string;
    const localPath = args.local_path as string;
    if (!sftpSid || !remotePath || !localPath) return formatError('MISSING_PARAM', 'missing params');
    try {
      await downloadFile(sftpSid, remotePath, localPath);
      return formatOk({ downloaded: remotePath, to: localPath });
    } catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.upload': async (args) => {
    const sftpSid = args.sftp_id as string;
    const localPath = args.local_path as string;
    const remotePath = args.remote_path as string;
    if (!sftpSid || !localPath || !remotePath) return formatError('MISSING_PARAM', 'missing params');
    try {
      await uploadFile(sftpSid, localPath, remotePath);
      return formatOk({ uploaded: localPath, to: remotePath });
    } catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.mkdir': async (args) => {
    const sftpSid = args.sftp_id as string;
    const dirPath = args.path as string;
    if (!sftpSid || !dirPath) return formatError('MISSING_PARAM', 'missing params');
    try { await sftpMkdir(sftpSid, dirPath); return formatOk({ created: dirPath }); }
    catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.stat': async (args) => {
    const sftpSid = args.sftp_id as string;
    const statPath = args.path as string;
    if (!sftpSid || !statPath) return formatError('MISSING_PARAM', 'missing params');
    try {
      const info = await sftpStat(sftpSid, statPath);
      return formatOk({ path: statPath, stat: info });
    } catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },

  'sftp.rm': async (args) => {
    const sftpSid = args.sftp_id as string;
    const rmPath = args.path as string;
    if (!sftpSid || !rmPath) return formatError('MISSING_PARAM', 'missing params');
    try { await sftpRm(sftpSid, rmPath); return formatOk({ deleted: rmPath }); }
    catch (e: any) { return formatError('SFTP_ERROR', e.message); }
  },
};

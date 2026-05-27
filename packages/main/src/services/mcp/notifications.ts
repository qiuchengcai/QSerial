/**
 * MCP Notifications infrastructure
 * SSE client tracking and notification broadcasting
 */

import * as http from 'node:http';

/** Connected SSE clients */
export const sseClients = new Set<http.ServerResponse>();

/** Pending notifications for poll-based clients */
const pendingNotifications: Array<{ method: string; params: Record<string, unknown> }> = [];

/** Send notification to all SSE clients and queue for pollers */
export function sendMCPNotification(method: string, params: Record<string, unknown>): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  for (const client of sseClients) {
    try { client.write('data: ' + msg + '\n\n'); } catch { sseClients.delete(client); }
  }
  pendingNotifications.push({ method, params });
  if (pendingNotifications.length > 50) pendingNotifications.shift();
}

/** Drain pending notifications for polling clients */
export function drainNotifications(): Array<{ method: string; params: Record<string, unknown> }> {
  return pendingNotifications.splice(0);
}

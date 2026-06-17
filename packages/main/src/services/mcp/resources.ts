/**
 * MCP Resources definitions and read handlers
 */

import { ConnectionFactory } from '../connection/factory.js';
import { SerialConnection } from '../connection/serial.js';

let mainWindow: import('electron').BrowserWindow | null = null;

export function setResourcesWindow(window: import('electron').BrowserWindow | null): void {
  mainWindow = window;
}

export const MCP_RESOURCES = [
  { uri: 'qserial://connections/active', name: 'Active Connections', description: 'Current active connections with status', mimeType: 'application/json' },
  { uri: 'qserial://serial/ports', name: 'Serial Ports', description: 'Available serial ports on this machine', mimeType: 'application/json' },
  { uri: 'qserial://sessions/list', name: 'Saved Sessions', description: 'All saved connection sessions', mimeType: 'application/json' },
  { uri: 'qserial://screenshot/latest', name: 'Latest Screenshot', description: 'Latest terminal window screenshot', mimeType: 'image/svg+xml' },
  { uri: 'qserial://notifications/pending', name: 'Pending Notifications', description: 'Poll pending MCP notifications', mimeType: 'application/json' },
  { uri: 'qserial://connections/{id}', name: 'Connection Detail', description: 'Detailed info for a specific connection', mimeType: 'application/json' },
];

export async function readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text?: string }> } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts = (c: { options?: any }) => c.options || {};

  switch (uri) {
    case 'qserial://connections/active': {
      const all = ConnectionFactory.getAll();
      const list = all.map(c => ({ id: c.id, type: c.type, state: c.state, name: opts(c).name || '' }));
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(list, null, 2) }] };
    }
    case 'qserial://serial/ports': {
      const ports = await SerialConnection.listPorts();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(ports, null, 2) }] };
    }
    case 'qserial://sessions/list': {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { contents: [{ uri, mimeType: 'application/json', text: '[]' }] };
      }
      try {
        const raw: string | null = await mainWindow.webContents.executeJavaScript(
          '(function(){ try { return localStorage.getItem("qserial_saved_sessions"); } catch(e) { return null; } })()'
        );
        return { contents: [{ uri, mimeType: 'application/json', text: raw || '[]' }] };
      } catch {
        return { contents: [{ uri, mimeType: 'application/json', text: '[]' }] };
      }
    }
    case 'qserial://screenshot/latest': {
      return { contents: [{ uri, mimeType: 'text/plain', text: 'Use window_screenshot tool for actual capture.' }] };
    }
    case 'qserial://notifications/pending': {
      const { drainNotifications } = await import('./notifications.js');
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(drainNotifications(), null, 2) }] };
    }
    default: {
      const m = uri.match(/^qserial:\/\/connections\/(.+)$/);
      if (m) {
        const conn = ConnectionFactory.get(m[1]);
        if (!conn) return null;
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({
          id: conn.id, type: conn.type, state: conn.state,
          name: opts(conn).name || '', options: opts(conn),
        }, null, 2) }] };
      }
      return null;
    }
  }
}

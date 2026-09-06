/**
 * 对话历史持久化（本地 JSON，保留最近 N 轮）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_MESSAGES = 100;

export class ConversationStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'conversations');
  }

  _file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  get(id) {
    try {
      const raw = fs.readFileSync(this._file(id), 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save(id, messages) {
    fs.mkdirSync(this.dir, { recursive: true });
    const target = this._file(id);
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(messages, null, 2), 'utf-8');
    fs.renameSync(tmp, target);
  }

  append(id, message) {
    const messages = this.get(id);
    messages.push(message);
    const trimmed = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
    this.save(id, trimmed);
    return trimmed;
  }

  list() {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  clear(id) {
    try {
      fs.rmSync(this._file(id), { force: true });
    } catch {
      /* ignore */
    }
  }
}

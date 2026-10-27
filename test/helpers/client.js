// A scripted WebSocket player for server tests. Records every message it receives so
// tests can inspect exactly what each phone was sent.

import WebSocket from 'ws';

export class TestClient {
  static connect(port, label = '') {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const client = new TestClient(ws, label);
      ws.once('open', () => resolve(client));
      ws.once('error', reject);
    });
  }

  constructor(ws, label) {
    this.ws = ws;
    this.label = label;
    this.messages = [];
    this.cursor = 0; // waitFor only looks at messages after the last one it matched
    this.view = null;
    this.welcome = null;
    this.waiters = new Set();
    this.closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      this.messages.push(msg);
      if (msg.t === 'view') this.view = msg;
      if (msg.t === 'welcome') this.welcome = msg;
      for (const check of this.waiters) check();
    });
  }

  get id() {
    return this.welcome?.playerId;
  }

  send(obj) {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  // Resolves with the next message (after the cursor) matching `match`: a type string
  // or a predicate. Rejects after `timeout` ms.
  waitFor(match, timeout = 2000) {
    const test = typeof match === 'string' ? (m) => m.t === match : match;
    return new Promise((resolve, reject) => {
      const check = () => {
        for (let i = this.cursor; i < this.messages.length; i++) {
          if (test(this.messages[i])) {
            this.cursor = i + 1;
            this.waiters.delete(check);
            clearTimeout(timer);
            resolve(this.messages[i]);
            return;
          }
        }
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        const seen = this.messages.slice(this.cursor).map((m) => m.t + (m.code ? `:${m.code}` : ''));
        reject(new Error(`${this.label}: timed out waiting; unread messages: ${seen.join(', ') || 'none'}`));
      }, timeout);
      this.waiters.add(check);
      check();
    });
  }

  // Ignore everything received so far; later waits only see newer messages.
  skipAll() {
    this.cursor = this.messages.length;
  }

  // Next view satisfying `pred` (default: any).
  waitForView(pred = () => true, timeout) {
    return this.waitFor((m) => m.t === 'view' && pred(m), timeout);
  }

  async expectError(code, timeout) {
    const msg = await this.waitFor('error', timeout);
    if (msg.code !== code) throw new Error(`${this.label}: expected error ${code}, got ${msg.code}`);
    return msg;
  }

  // Resolves true if no message arrives within `ms`.
  async quietFor(ms) {
    const before = this.messages.length;
    await new Promise((r) => setTimeout(r, ms));
    return this.messages.length === before;
  }

  close() {
    this.ws.close();
    return this.closed;
  }
}

// The game socket: connects to the same host that served the page (wss:// on https),
// heartbeats, and reconnects with backoff. Emits 'status' and 'message' events.

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
const BACKOFF_CAP_MS = 10000;
const PING_EVERY_MS = 20000;
const PONG_TIMEOUT_MS = 10000;

export function socketUrl(loc = location) {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}

export class Connection extends EventTarget {
  constructor(url = socketUrl()) {
    super();
    this.url = url;
    this.ws = null;
    this.status = 'connecting'; // 'connecting' | 'open' | 'closed'
    this.attempt = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;

    const wake = () => {
      if (document.visibilityState === 'visible' && this.status !== 'open') this.reconnectNow();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
  }

  connect() {
    clearTimeout(this.retryTimer);
    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      this.startPings();
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === 'pong') clearTimeout(this.pongTimer);
      this.dispatchEvent(new CustomEvent('message', { detail: msg }));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.stopPings();
      this.ws = null;
      this.setStatus('closed');
      this.scheduleRetry();
    };
    ws.onerror = () => {}; // onclose follows
  }

  send(obj) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  reconnectNow() {
    this.attempt = 0;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.close();
    }
    this.connect();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const base = BACKOFF_MS[this.attempt] ?? BACKOFF_CAP_MS;
    const delay = base * (0.75 + Math.random() * 0.5);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  // App-level heartbeat: browsers can't see WebSocket ping frames, so a phone that slept
  // through a dead connection would otherwise sit there believing it is connected.
  startPings() {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (!this.send({ t: 'ping' })) return;
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS);
    }, PING_EVERY_MS);
  }

  stopPings() {
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: status }));
  }
}

// HTTP + WebSocket server: one process serves the client, /healthz and the game socket.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { RoomManager } from './rooms.js';
import { errorMessage } from './room.js';
import { parseMessage, MAX_MESSAGE_BYTES } from './protocol.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 120; // messages per window per socket

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; " +
        "style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.get('/healthz', (req, res) => res.status(200).type('text').send('ok'));
  // no-cache = always revalidate, so a redeploy is picked up on the next load.
  app.use(express.static(PUBLIC_DIR, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  return app;
}

export function createServer({
  port = 0,
  host = '0.0.0.0',
  enableBots = true,
  heartbeatMs = 15_000,
  sweepMs = 60_000,
  roomTtlMs,
  botDelayMs,
  audit,
  rng,
  timeScale,
  log = () => {},
} = {}) {
  const rooms = new RoomManager({ enableBots, ttlMs: roomTtlMs, botDelayMs, audit, rng, timeScale });
  const server = http.createServer(createApp());
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const conn = {
      room: null,
      seatId: null,
      send(obj) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
      },
    };
    let windowStart = Date.now();
    let count = 0;

    ws.on('message', (raw, isBinary) => {
      ws.isAlive = true;
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now;
        count = 0;
      }
      if (++count > RATE_MAX) return conn.send(errorMessage('RATE_LIMITED'));

      const { msg, error } = isBinary ? { error: 'BAD_MESSAGE' } : parseMessage(raw);
      if (error) return conn.send(errorMessage(error));
      try {
        handleMessage(rooms, conn, msg, log);
      } catch (err) {
        // A bug in one room must not take down every other room on the server.
        console.error('Error handling message', msg.t, err);
        conn.send(errorMessage('BAD_MESSAGE', msg.t));
      }
    });

    ws.on('close', () => conn.room?.detach(conn));
    ws.on('error', () => {});
  });

  // Server heartbeat: drop sockets that stop answering pings (phone slept, network gone).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  const sweeper = setInterval(() => rooms.sweep(), sweepMs);
  heartbeat.unref();
  sweeper.unref();

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        rooms,
        server,
        async close(reason = 'serverRestart') {
          clearInterval(heartbeat);
          clearInterval(sweeper);
          rooms.closeAll(reason);
          for (const ws of wss.clients) ws.close(1001, 'server closing');
          await new Promise((done) => wss.close(() => done()));
          const closed = new Promise((done) => server.close(() => done()));
          server.closeAllConnections(); // don't wait for idle keep-alive connections
          await closed;
        },
      });
    });
  });
}

function handleMessage(rooms, conn, msg, log) {
  switch (msg.t) {
    case 'ping':
      return conn.send({ t: 'pong', serverNow: Date.now() });

    case 'hello': {
      if (conn.room) return conn.send(errorMessage('ALREADY_SEATED', msg.t));
      const room = rooms.get(msg.room);
      if (!room) return conn.send(errorMessage('ROOM_NOT_FOUND', msg.t));
      const error = room.reclaim(conn, msg.token);
      if (error) conn.send(errorMessage(error, msg.t));
      return;
    }

    case 'create': {
      if (conn.room) return conn.send(errorMessage('ALREADY_SEATED', msg.t));
      const room = rooms.create();
      room.join(conn, msg.name); // can't fail: empty room, name already validated
      log(`room ${room.code} created`);
      return;
    }

    case 'join': {
      if (conn.room) return conn.send(errorMessage('ALREADY_SEATED', msg.t));
      const room = rooms.get(msg.room);
      if (!room) return conn.send(errorMessage('ROOM_NOT_FOUND', msg.t));
      const error = room.join(conn, msg.name);
      if (error) conn.send(errorMessage(error, msg.t));
      return;
    }

    default:
      if (!conn.room) return conn.send(errorMessage('NOT_SEATED', msg.t));
      conn.room.handle(conn, msg);
  }
}

// Started directly (npm start / npm run dev), not imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const enableBots = process.env.ENABLE_BOTS !== 'false';
  const verbose = process.env.LOG_LEVEL === 'debug';
  const timeScale = Number(process.env.TIME_SCALE) || 1; // debugging only: 0.2 = five times faster
  const running = await createServer({
    port,
    enableBots,
    timeScale,
    log: (line) => verbose && console.log(line),
  });
  console.log(`Cheese Thief listening on http://0.0.0.0:${running.port} (bots ${enableBots ? 'on' : 'off'})`);

  // Render sends SIGTERM on redeploy: tell players their room is gone rather than hanging.
  const shutdown = async () => {
    await running.close('serverRestart');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

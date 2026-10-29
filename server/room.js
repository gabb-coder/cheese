// One game room: seats, seat tokens, sockets, lobby rules, bots, and per-player views.
//
// A "connection" (conn) is the server's wrapper around one WebSocket:
//   { send(obj), room, seatId }
// The room sets conn.room / conn.seatId when the conn takes a seat.
//
// Hidden information: the only game data that leaves this file is
// rules.viewFor(game, seatId), sent to that seat's own connection.

import { randomBytes } from 'node:crypto';
import {
  RULE_OPTIONS, PHASE, createGame, applyIntent, advance, stealDeadline, canEndEarly, viewFor, outcome,
} from '../game/rules.js';
import { cryptoRng } from '../game/rng.js';
import { nameKey, ERROR_TEXT } from './protocol.js';
import { botIntent, BOT_NAMES } from './bots.js';

export const DEFAULT_SETTINGS = Object.freeze({
  hourSec: 15,
  followerChoiceSec: 20,
  discussionSec: 180,
  voteSec: 45,
  narratorOnHost: true,
});

export const LOBBY = 'LOBBY';

// Steps whose length isn't a host setting (seconds).
export const FIXED_SECONDS = Object.freeze({
  [PHASE.ROLE_REVEAL]: 60, // role card and dice cup; ends early once everyone has confirmed
  [PHASE.NIGHT_INTRO]: 8,
  [PHASE.FOLLOWER_CHECK]: 5, // everyone looks: am I the Follower?
  [PHASE.FOLLOWER_MEET]: 10, // the Thief and the Follower see each other, silently
  [PHASE.DAWN]: 6,
});

// PLAN.md §7: if the host is offline this long, another connected player becomes host.
export const HOST_GRACE_SEC = 20;

// PLAN.md D1: the steal is forced this long before the Thief's hour ends (at most 40% of
// the hour), so the others awake still see it happen.
const STEAL_DEADLINE_LEAD_SEC = 5;

// While players have their eyes closed, public changes (someone reconnecting, say) are held
// back until the next phase change. Otherwise a phone waking up for its hour and
// reconnecting would tell everyone who is awake.
const QUIET_PHASES = new Set([
  PHASE.NIGHT_INTRO, PHASE.HOUR, PHASE.FOLLOWER_CHOICE, PHASE.FOLLOWER_CHECK, PHASE.FOLLOWER_MEET,
]);

const GAME_INTENTS = new Set(['revealed', 'steal', 'peek', 'chooseFollower', 'vote']);

export const errorMessage = (code, forType) => ({
  t: 'error',
  code,
  message: ERROR_TEXT[code] ?? ERROR_TEXT.BAD_MESSAGE,
  ...(forType ? { for: forType } : {}),
});

export class Room {
  constructor(code, {
    enableBots = true,
    rng = cryptoRng,
    now = Date.now,
    timers = globalThis,
    botDelayMs = 800,
    onClose = () => {},
    audit = null,
    timeScale = 1, // tests only: shrink every timer
  } = {}) {
    this.code = code;
    this.enableBots = enableBots;
    this.rng = rng;
    this.now = now;
    this.timers = timers;
    this.botDelayMs = botDelayMs;
    this.onClose = onClose;
    this.audit = audit; // tests only: (seatId, message, game) for every message sent to a seat
    this.timeScale = timeScale;

    this.seats = new Map(); // seatId -> seat
    this.tokens = new Map(); // token -> seatId
    this.hostId = null;
    this.game = null;
    this.round = 0; // games started in this room
    this.scores = new Map(); // seatId -> { wins, played }, kept across "play again"
    this.scoredRound = 0;
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastActivity = now();
    this.closed = false;
    this.pendingPublic = false;
    this.botTimer = null;
    this.phaseTimer = null;
    this.stealTimer = null;
    this.endsAt = null;
    this.hostTimer = null;
  }

  get phase() {
    return this.game ? this.game.phase : LOBBY;
  }

  touch() {
    this.lastActivity = this.now();
  }

  // ---------------------------------------------------------------------------
  // Seats

  newSeatId() {
    let id;
    do id = randomBytes(5).toString('hex');
    while (this.seats.has(id));
    return id;
  }

  nameTaken(name) {
    const key = nameKey(name);
    return [...this.seats.values()].some((s) => nameKey(s.name) === key);
  }

  humans() {
    return [...this.seats.values()].filter((s) => !s.isBot);
  }

  // Returns an error code, or null on success.
  join(conn, name) {
    if (this.phase !== LOBBY) return 'GAME_IN_PROGRESS';
    if (this.seats.size >= RULE_OPTIONS.maxPlayers) return 'ROOM_FULL';
    if (this.nameTaken(name)) return 'NAME_TAKEN';

    const seat = {
      id: this.newSeatId(),
      name,
      token: randomBytes(16).toString('base64url'),
      isBot: false,
      conn: null,
      joinedAt: this.now(),
    };
    this.seats.set(seat.id, seat);
    this.tokens.set(seat.token, seat.id);
    if (!this.hostId) this.hostId = seat.id;
    this.touch();
    this.attach(seat, conn);
    return null;
  }

  // A returning player (refresh, dropped connection, phone slept) takes their seat back.
  reclaim(conn, token) {
    const seat = this.seats.get(this.tokens.get(token));
    if (!seat) return 'SEAT_NOT_FOUND';
    this.touch();
    this.attach(seat, conn);
    return null;
  }

  attach(seat, conn) {
    if (seat.conn && seat.conn !== conn) {
      const old = seat.conn;
      old.room = null;
      old.seatId = null;
      old.send(errorMessage('REPLACED'));
    }
    seat.conn = conn;
    conn.room = this;
    conn.seatId = seat.id;
    if (seat.id === this.hostId) this.cancelHostHandover();
    conn.send({ t: 'welcome', room: this.code, playerId: seat.id, token: seat.token });
    this.sendView(seat.id);
    this.publicChange(seat.id);
  }

  // The socket closed. The seat stays so the player can come back with their token.
  detach(conn) {
    const seat = this.seats.get(conn.seatId);
    conn.room = null;
    conn.seatId = null;
    if (!seat || seat.conn !== conn) return;
    seat.conn = null;
    if (seat.id === this.hostId) this.scheduleHostHandover();
    this.publicChange();
  }

  removeSeat(seatId) {
    const seat = this.seats.get(seatId);
    if (!seat) return;
    this.seats.delete(seatId);
    this.scores.delete(seatId);
    if (seat.token) this.tokens.delete(seat.token);
    if (seat.conn) {
      seat.conn.room = null;
      seat.conn.seatId = null;
      seat.conn = null;
    }
    if (this.humans().length === 0) {
      this.close('empty');
      return;
    }
    if (this.hostId === seatId) this.migrateHost();
  }

  // Host goes to the longest-seated human, preferring one who is connected.
  // With `connectedOnly`, nothing changes unless someone connected can take over.
  migrateHost({ connectedOnly = false } = {}) {
    const candidates = this.humans()
      .filter((s) => s.id !== this.hostId || !connectedOnly)
      .filter((s) => s.conn || !connectedOnly)
      .sort((a, b) => (b.conn ? 1 : 0) - (a.conn ? 1 : 0) || a.joinedAt - b.joinedAt);
    if (candidates.length) this.hostId = candidates[0].id;
    else if (!connectedOnly) this.hostId = null;
  }

  // The host's phone dropped: give them a grace period to come back, then hand over.
  scheduleHostHandover() {
    if (this.hostTimer || this.closed) return;
    this.hostTimer = this.timers.setTimeout(() => {
      this.hostTimer = null;
      if (this.seats.get(this.hostId)?.conn) return;
      const before = this.hostId;
      this.migrateHost({ connectedOnly: true });
      if (this.hostId !== before) this.publicChange();
      else this.scheduleHostHandover(); // nobody connected yet: check again later
    }, HOST_GRACE_SEC * 1000 * this.timeScale);
  }

  cancelHostHandover() {
    if (this.hostTimer) this.timers.clearTimeout(this.hostTimer);
    this.hostTimer = null;
  }

  addBot() {
    const taken = new Set([...this.seats.values()].map((s) => nameKey(s.name)));
    const name = BOT_NAMES.find((n) => !taken.has(nameKey(n))) ?? `Bot ${this.seats.size + 1}`;
    const seat = { id: this.newSeatId(), name, token: null, isBot: true, conn: null, joinedAt: this.now() };
    this.seats.set(seat.id, seat);
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    if (this.botTimer) this.timers.clearTimeout(this.botTimer);
    this.clearClock();
    this.cancelHostHandover();
    for (const seat of this.seats.values()) {
      if (!seat.conn) continue;
      const conn = seat.conn;
      seat.conn = null;
      conn.room = null;
      conn.seatId = null;
      conn.send({ t: 'roomClosed', reason });
    }
    this.onClose(this);
  }

  // ---------------------------------------------------------------------------
  // Intents from a seated connection

  handle(conn, msg) {
    const seat = this.seats.get(conn.seatId);
    if (!seat) return conn.send(errorMessage('NOT_SEATED', msg.t));
    this.touch();
    const error = this.dispatch(seat, msg);
    if (error) conn.send(errorMessage(error, msg.t));
  }

  dispatch(seat, msg) {
    if (GAME_INTENTS.has(msg.t)) return this.gameIntent(seat.id, msg);

    const isHost = seat.id === this.hostId;
    const inLobby = this.phase === LOBBY;
    switch (msg.t) {
      case 'leave':
        if (inLobby) {
          const conn = seat.conn;
          this.removeSeat(seat.id);
          if (!this.closed) this.broadcastViews();
          conn?.send({ t: 'left' });
        } else {
          // Mid-game the seat must stay in the game; the player just goes away.
          // A host who leaves on purpose hands over straight away.
          const conn = seat.conn;
          if (conn) this.detach(conn);
          if (isHost) {
            this.cancelHostHandover();
            const before = this.hostId;
            this.migrateHost({ connectedOnly: true });
            if (this.hostId !== before) this.publicChange();
            else this.scheduleHostHandover();
          }
          conn?.send({ t: 'left' });
        }
        return null;

      case 'look':
        // Cosmetic and public, and only in the lobby, so it can't hint at anything in a game.
        if (!inLobby) return 'WRONG_PHASE';
        seat.look = { fur: msg.fur, hat: msg.hat };
        this.broadcastViews();
        return null;

      case 'settings':
        if (!isHost) return 'NOT_HOST';
        if (!inLobby) return 'WRONG_PHASE';
        Object.assign(this.settings, msg.settings);
        this.broadcastViews();
        return null;

      case 'kick': {
        if (!isHost) return 'NOT_HOST';
        if (!inLobby) return 'WRONG_PHASE';
        const target = this.seats.get(msg.playerId);
        if (!target || target.id === seat.id) return 'BAD_TARGET';
        const conn = target.conn;
        this.removeSeat(target.id);
        conn?.send(errorMessage('KICKED'));
        this.broadcastViews();
        return null;
      }

      case 'addBot':
        if (!this.enableBots) return 'BOTS_DISABLED';
        if (!isHost) return 'NOT_HOST';
        if (!inLobby) return 'WRONG_PHASE';
        if (this.seats.size >= RULE_OPTIONS.maxPlayers) return 'ROOM_FULL';
        this.addBot();
        this.broadcastViews();
        return null;

      case 'removeBot': {
        if (!isHost) return 'NOT_HOST';
        if (!inLobby) return 'WRONG_PHASE';
        const target = this.seats.get(msg.playerId);
        if (!target?.isBot) return 'BAD_TARGET';
        this.removeSeat(target.id);
        this.broadcastViews();
        return null;
      }

      case 'start':
        if (!isHost) return 'NOT_HOST';
        if (!inLobby) return 'WRONG_PHASE';
        if (this.seats.size < RULE_OPTIONS.minPlayers) return 'NOT_ENOUGH_PLAYERS';
        this.game = createGame([...this.seats.keys()], this.rng);
        this.round += 1;
        this.startClock();
        this.broadcastViews();
        return null;

      case 'endDiscussion':
        if (!isHost) return 'NOT_HOST';
        if (this.phase !== PHASE.DISCUSSION) return 'WRONG_PHASE';
        this.nextPhase();
        return null;

      case 'playAgain':
        // Same room, same seats (bots included), new deal on the next start.
        if (!isHost) return 'NOT_HOST';
        if (this.phase !== PHASE.RESULTS) return 'WRONG_PHASE';
        this.clearClock();
        if (this.botTimer) this.timers.clearTimeout(this.botTimer);
        this.botTimer = null;
        this.game = null;
        this.endsAt = null;
        this.broadcastViews();
        return null;

      default:
        return 'WRONG_PHASE';
    }
  }

  gameIntent(seatId, intent) {
    if (!this.game) return 'WRONG_PHASE';
    const res = applyIntent(this.game, seatId, intent);
    if (res.error) return res.error;
    this.game = res.game;
    if (canEndEarly(this.game)) this.nextPhase();
    else this.broadcastViews(res.notify);
    return null;
  }

  // ---------------------------------------------------------------------------
  // The game clock. Every step runs for a fixed time whatever anyone does (PLAN.md D3);
  // only role reveal and the vote end early, when everyone is done.

  phaseMs(game) {
    const seconds = {
      ...FIXED_SECONDS,
      [PHASE.HOUR]: this.settings.hourSec,
      [PHASE.FOLLOWER_CHOICE]: this.settings.followerChoiceSec,
      [PHASE.DISCUSSION]: this.settings.discussionSec,
      [PHASE.VOTE]: this.settings.voteSec,
    }[game.phase];
    return seconds === undefined ? null : seconds * 1000 * this.timeScale;
  }

  startClock() {
    this.clearClock();
    const ms = this.phaseMs(this.game);
    this.endsAt = ms === null ? null : this.now() + ms;
    if (ms === null) return;
    this.phaseTimer = this.timers.setTimeout(() => this.nextPhase(), ms);

    if (this.game.phase === PHASE.HOUR) {
      // Scheduled every hour, not just the Thief's, so the server behaves the same either way.
      const lead = Math.min(STEAL_DEADLINE_LEAD_SEC * 1000 * this.timeScale, ms * 0.4);
      this.stealTimer = this.timers.setTimeout(() => {
        this.stealTimer = null;
        const res = stealDeadline(this.game);
        this.game = res.game;
        this.broadcastViews(res.notify);
      }, ms - lead);
    }
  }

  clearClock() {
    if (this.phaseTimer) this.timers.clearTimeout(this.phaseTimer);
    if (this.stealTimer) this.timers.clearTimeout(this.stealTimer);
    this.phaseTimer = null;
    this.stealTimer = null;
  }

  nextPhase() {
    if (!this.game || this.closed) return;
    const res = advance(this.game, this.rng);
    if (res.error) return;
    this.game = res.game;
    if (this.game.phase === PHASE.RESULTS) this.recordScores();
    this.startClock();
    this.broadcastViews();
  }

  // The scoreboard: once per game, everyone who played gets a game, the winners a win.
  recordScores() {
    if (this.scoredRound === this.round) return;
    this.scoredRound = this.round;
    const { winners } = outcome(this.game);
    for (const id of this.game.playerIds) {
      if (!this.seats.has(id)) continue;
      const score = this.scores.get(id) ?? { wins: 0, played: 0 };
      score.played += 1;
      if (winners.includes(id)) score.wins += 1;
      this.scores.set(id, score);
    }
  }

  publicScores() {
    return Object.fromEntries([...this.scores].filter(([id]) => this.seats.has(id)).map(([id, s]) => [id, { ...s }]));
  }

  // ---------------------------------------------------------------------------
  // Views

  publicPlayers() {
    return [...this.seats.values()]
      .map((s) => ({
        id: s.id,
        name: s.name,
        connected: s.isBot || Boolean(s.conn),
        isBot: s.isBot,
        isHost: s.id === this.hostId,
        ...(s.look ? { look: { ...s.look } } : {}),
      }))
      .sort((a, b) => Number(a.isBot) - Number(b.isBot) ||
        nameKey(a.name).localeCompare(nameKey(b.name)) || (a.id < b.id ? -1 : 1));
  }

  // The complete message for one seat. Game data comes only from rules.viewFor.
  viewMessage(seatId) {
    const base = {
      t: 'view',
      serverNow: this.now(),
      room: {
        code: this.code,
        hostId: this.hostId,
        settings: { ...this.settings },
        botsEnabled: this.enableBots,
        round: this.round,
        scores: this.publicScores(), // only changes when a game ends, so it gives nothing away
      },
      players: this.publicPlayers(),
    };
    if (!this.game) return { ...base, phase: { name: LOBBY }, me: { id: seatId } };
    const view = { ...base, ...viewFor(this.game, seatId) };
    if (this.endsAt !== null) view.phase = { ...view.phase, endsAt: this.endsAt };
    return view;
  }

  sendView(seatId) {
    const seat = this.seats.get(seatId);
    if (!seat?.conn) return;
    const msg = this.viewMessage(seatId);
    this.audit?.(seatId, msg, this.game); // game states are immutable, so this is a snapshot
    seat.conn.send(msg);
  }

  broadcastViews(ids = [...this.seats.keys()]) {
    if (ids.length === this.seats.size) this.pendingPublic = false;
    for (const id of ids) this.sendView(id);
    if (ids.some((id) => this.seats.get(id)?.isBot)) this.scheduleBots();
  }

  // Something everyone can see changed (connected flags, host). `except` already has it.
  publicChange(except) {
    if (QUIET_PHASES.has(this.phase)) {
      this.pendingPublic = true;
      return;
    }
    this.broadcastViews([...this.seats.keys()].filter((id) => id !== except));
  }

  // Bots act a moment after their view changes, through the same rules as people.
  scheduleBots() {
    if (this.botTimer || !this.game || this.closed) return;
    this.botTimer = this.timers.setTimeout(() => {
      this.botTimer = null;
      if (!this.game || this.closed) return;
      for (const seat of this.seats.values()) {
        if (!seat.isBot) continue;
        const intent = botIntent(this.viewMessage(seat.id), this.rng);
        if (intent) this.gameIntent(seat.id, intent);
      }
    }, this.botDelayMs);
  }
}

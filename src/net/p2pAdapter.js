import * as PeerJS from 'peerjs';
import { RaceSimulation } from '../shared/kartPhysics.js';
import { RACE_CONFIG, TRACKS } from '../shared/constants.js';

const ResolvedPeer = PeerJS.Peer || PeerJS.default?.Peer || PeerJS.default;

export const ROOM_PEER_PREFIX = 'pk3d-room-v3-';
export const PUBLIC_PEER_PREFIX = 'pk3d-pub-v3-';
export const PUBLIC_SLOT_CODES = ['PUBA', 'PUBB', 'PUBC'];
export const PUBLIC_LOBBY_WAIT_MS = 10_000;

// Unambiguous 4-letter uppercase alphabet (no I or O), matching server/index.js
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export function generateP2PRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function roomCodeToPeerId(roomCode) {
  const clean = String(roomCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const pubIdx = PUBLIC_SLOT_CODES.indexOf(clean);
  if (pubIdx !== -1) {
    return `${PUBLIC_PEER_PREFIX}${pubIdx + 1}`;
  }
  return `${ROOM_PEER_PREFIX}${clean}`;
}

/**
 * Host-Authoritative WebRTC P2P Room Server running directly in the Host player's browser.
 * Ticks RaceSimulation at 60Hz (via rAF `step(dt)` when visible + fallback 50ms `setInterval`
 * when backgrounded so friends never freeze) and broadcasts 20Hz snapshots to Guest peers.
 */
export class P2PRoomHost {
  constructor({
    roomCode,
    peerId,
    playerName = 'Pilote',
    racerId = 'red',
    trackId = 'coco',
    isPublic = false,
    botCount,
    PeerClass = ResolvedPeer,
    onState = null,
    onEvent = null,
    onError = null,
  } = {}) {
    this.roomCode = String(roomCode || generateP2PRoomCode()).toUpperCase();
    this.peerId = peerId || roomCodeToPeerId(this.roomCode);
    this.playerName = playerName;
    this.racerId = racerId;
    this.trackId = trackId || 'coco';
    this.isPublic = Boolean(isPublic);
    this.initialBotCount = botCount;

    this.PeerClass = PeerClass;
    this.onState = onState;
    this.onEvent = onEvent;
    this.onError = onError;

    this.localId = 'p_host';
    this.peer = null;
    this.sim = null;
    /** @type {Map<string, any>} guestId -> DataConnection */
    this.guests = new Map();
    this._guestSeq = 1;

    this.autoStartAtMs = null;
    this._lastHostEventId = 0;
    this._lastBroadcastEventId = 0;
    this._broadcastAccum = 0;
    this._lastStepWallMs = 0;
    this._bgInterval = null;
    this._destroyed = false;
  }

  open() {
    if (!this.PeerClass) {
      return Promise.reject(new Error('PeerJS non disponible dans cet environnement.'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let peer;
      try {
        peer = new this.PeerClass(this.peerId, {
          config: { iceServers: DEFAULT_ICE_SERVERS },
        });
      } catch (err) {
        reject(err);
        return;
      }

      this.peer = peer;

      const openTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.destroy();
          reject(new Error('Délai de création du salon P2P dépassé.'));
        }
      }, 8000);

      peer.on('open', () => {
        if (settled || this._destroyed) return;
        settled = true;
        clearTimeout(openTimeout);

        this._initSimulation();
        peer.on('connection', (conn) => this._handleIncomingConnection(conn));

        this._lastStepWallMs = Date.now();
        this._bgInterval = setInterval(() => this._onBackgroundTick(), 50);
        this._bgInterval.unref?.();

        resolve({
          roomCode: this.roomCode,
          peerId: this.peerId,
          playerId: this.localId,
          isPublic: this.isPublic,
        });
      });

      peer.on('error', (err) => {
        clearTimeout(openTimeout);
        if (!settled) {
          settled = true;
          const wrapped = new Error(err?.message || 'Erreur PeerJS.');
          wrapped.type = err?.type || 'peer-error';
          this.destroy();
          reject(wrapped);
          return;
        }
        // Ignore non-fatal transient signaling errors once room is running
        if (err?.type === 'network' || err?.type === 'disconnected') {
          try {
            peer.reconnect?.();
          } catch {
            // Ignore reconnect failure
          }
        }
      });
    });
  }

  _initSimulation() {
    this.sim = new RaceSimulation({
      mode: 'online',
      roomCode: this.roomCode,
      trackId: this.trackId,
      isPublic: this.isPublic,
    });
    this.sim.botCount = this.isPublic
      ? 5
      : typeof this.initialBotCount === 'number'
        ? this.initialBotCount
        : 4;

    this.sim.addPlayer({
      id: this.localId,
      name: this.playerName,
      racerId: this.racerId,
    });

    if (this.isPublic) {
      this.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.sim.players.size));
      this.autoStartAtMs = Date.now() + PUBLIC_LOBBY_WAIT_MS;
      this.sim.publicCountdown = Math.ceil(PUBLIC_LOBBY_WAIT_MS / 1000);
    } else if (typeof this.initialBotCount === 'number') {
      this.sim.setBotCount(this.initialBotCount);
    }

    this._lastHostEventId = this.sim.getLatestEventId();
    this._lastBroadcastEventId = this.sim.getLatestEventId();
  }

  getHostInitialState() {
    if (!this.sim) return null;
    const st = this.sim.getState({
      localId: this.localId,
      sinceEventId: 0,
    });
    st.paused = false;
    this._lastHostEventId = this.sim.getLatestEventId();
    return st;
  }

  _sendToConn(conn, payload) {
    if (!conn || !conn.open) return;
    try {
      conn.send(payload);
    } catch {
      // Ignore closed data channel errors
    }
  }

  broadcastToGuests() {
    if (!this.sim || this._destroyed) return;
    const baseState = this.sim.getState({
      localId: null,
      sinceEventId: this._lastBroadcastEventId,
    });
    this._lastBroadcastEventId = this.sim.getLatestEventId();

    for (const [guestId, conn] of this.guests.entries()) {
      if (!conn || !conn.open) continue;
      this._sendToConn(conn, {
        type: 'state',
        state: {
          ...baseState,
          localId: guestId,
        },
      });
    }
  }

  _emitHostStateAndBroadcast() {
    if (!this.sim || this._destroyed) return null;
    const hostState = this.sim.getState({
      localId: this.localId,
      sinceEventId: this._lastHostEventId,
    });
    hostState.paused = false;
    this._lastHostEventId = this.sim.getLatestEventId();

    this.onState?.(hostState);
    for (const ev of hostState.events) {
      this.onEvent?.(ev);
    }
    this.broadcastToGuests();
    return hostState;
  }

  _handleIncomingConnection(conn) {
    if (this._destroyed || !this.sim) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
      return;
    }

    const guestId = `p_guest_${this._guestSeq++}`;
    let joined = false;

    const cleanupGuest = () => {
      if (!joined) return;
      joined = false;
      this.guests.delete(guestId);
      if (this.sim && !this._destroyed) {
        this.sim.removePlayer(guestId);
        if (this.isPublic && this.sim.phase === 'lobby') {
          this.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.sim.players.size));
        }
        this._emitHostStateAndBroadcast();
      }
    };

    conn.on('data', (raw) => {
      if (this._destroyed || !this.sim) return;
      let msg = raw;
      if (typeof raw === 'string') {
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!msg || typeof msg.type !== 'string') return;
      const reqId = msg.reqId ?? null;

      if (msg.type === 'join_room' || msg.type === 'join_public') {
        if (this.sim.phase !== 'lobby') {
          this._sendToConn(conn, {
            type: 'error',
            code: 'RACE_IN_PROGRESS',
            message: 'Une course est déjà en cours dans ce salon.',
            reqId,
          });
          return;
        }
        if (this.sim.players.size >= RACE_CONFIG.MAX_PLAYERS) {
          this._sendToConn(conn, {
            type: 'error',
            code: 'ROOM_FULL',
            message: 'Ce salon est complet (6 joueurs maximum).',
            reqId,
          });
          return;
        }

        try {
          this.sim.addPlayer({
            id: guestId,
            name: msg.playerName || msg.name || 'Pilote',
            racerId: msg.racerId || 'aqua',
          });
        } catch (err) {
          this._sendToConn(conn, {
            type: 'error',
            code: 'ROOM_FULL',
            message: err?.message || 'Salon complet.',
            reqId,
          });
          return;
        }

        if (this.isPublic) {
          this.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.sim.players.size));
        }

        joined = true;
        this.guests.set(guestId, conn);

        if (this.isPublic && this.sim.players.size >= RACE_CONFIG.MAX_PLAYERS) {
          this.autoStartAtMs = null;
          this.sim.publicCountdown = null;
          this.sim.startCountdown();
        }

        const joinState = this.sim.getState({
          localId: guestId,
          sinceEventId: this._lastBroadcastEventId,
        });

        this._sendToConn(conn, {
          type: 'room_joined',
          roomCode: this.roomCode,
          isPublic: this.isPublic,
          playerId: guestId,
          hostId: this.sim.hostId,
          reqId,
          state: joinState,
        });

        this._emitHostStateAndBroadcast();
        return;
      }

      if (!joined) return;

      if (msg.type === 'leave') {
        cleanupGuest();
        try {
          conn.close();
        } catch {
          // Ignore
        }
        return;
      }

      if (msg.type === 'input') {
        const inputPayload = msg.input && typeof msg.input === 'object' ? msg.input : msg;
        this.sim.setPlayerInput(guestId, inputPayload);
        return;
      }

      if (msg.type === 'emote') {
        if (this.sim.triggerEmote(guestId, msg.emoteId || msg.id || 'fire')) {
          this._emitHostStateAndBroadcast();
        }
        return;
      }

      if (msg.type === 'respawn') {
        if (this.sim.respawnKart(guestId)) {
          this._emitHostStateAndBroadcast();
        }
        return;
      }

      if (msg.type === 'rematch') {
        if (this.sim.phase === 'finished') {
          this._triggerRematch(msg.trackId);
        }
        return;
      }

      if (msg.type === 'select_track' || msg.type === 'set_track') {
        if (!this.isPublic && this.sim.hostId !== guestId) {
          this._sendToConn(conn, {
            type: 'error',
            message: "Seul l'hôte peut changer de circuit.",
            reqId,
          });
          return;
        }
        if (this.sim.phase === 'lobby') {
          this.sim.setTrack(msg.trackId || msg.track || 'coco');
          this._emitHostStateAndBroadcast();
        }
        return;
      }

      if (msg.type === 'set_bots') {
        if (this.sim.hostId !== guestId) {
          this._sendToConn(conn, {
            type: 'error',
            message: "Seul l'hôte peut régler le nombre de bots.",
            reqId,
          });
          return;
        }
        if (this.sim.phase === 'lobby') {
          const desired = msg.botCount ?? msg.bots ?? msg.count ?? 0;
          this.sim.setBotCount(desired);
          this._emitHostStateAndBroadcast();
        }
        return;
      }

      if (msg.type === 'start_race') {
        if (this.sim.hostId !== guestId) {
          this._sendToConn(conn, {
            type: 'error',
            message: "Seul l'hôte peut lancer la course.",
            reqId,
          });
          return;
        }
        this.startRace();
        return;
      }
    });

    conn.on('close', cleanupGuest);
    conn.on('error', cleanupGuest);
  }

  _checkPublicAutoStart() {
    if (!this.sim || !this.isPublic || this.sim.phase !== 'lobby' || this.autoStartAtMs === null) {
      return false;
    }
    const now = Date.now();
    if (now >= this.autoStartAtMs) {
      this.autoStartAtMs = null;
      this.sim.publicCountdown = null;
      this.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.sim.players.size));
      this.sim.startCountdown();
      this._emitHostStateAndBroadcast();
      return true;
    }
    const remSec = Math.max(0, Math.ceil((this.autoStartAtMs - now) / 1000));
    if (remSec !== this.sim.publicCountdown) {
      this.sim.publicCountdown = remSec;
      this._emitHostStateAndBroadcast();
      return true;
    }
    return false;
  }

  _onBackgroundTick() {
    if (this._destroyed || !this.sim) return;

    this._checkPublicAutoStart();

    const now = Date.now();
    const elapsedMs = now - this._lastStepWallMs;
    // Only take over stepping when foreground requestAnimationFrame is throttled/paused (> 42ms)
    if (elapsedMs < 42) return;

    this._lastStepWallMs = now;
    const totalDt = Math.min(0.1, elapsedMs / 1000);

    if (this.sim.phase === 'countdown' || this.sim.phase === 'racing') {
      let rem = totalDt;
      while (rem > 0.0005) {
        const sub = Math.min(1 / 60, rem);
        this.sim.step(sub);
        rem -= sub;
        if (this.sim.phase !== 'countdown' && this.sim.phase !== 'racing') break;
      }
      this._emitHostStateAndBroadcast();
    } else if (this.sim.karts.some((k) => Boolean(k.emote))) {
      this.sim.step(Math.min(0.05, totalDt));
      if (!this.sim.karts.some((k) => Boolean(k.emote))) {
        this._emitHostStateAndBroadcast();
      }
    }
  }

  step(rawDt) {
    if (this._destroyed || !this.sim) return null;
    const dt = Math.min(Math.max(Number(rawDt) || 1 / 60, 0.001), 0.05);
    this._lastStepWallMs = Date.now();

    this._checkPublicAutoStart();

    if (this.sim.phase === 'countdown' || this.sim.phase === 'racing') {
      const prevPhase = this.sim.phase;
      this.sim.step(dt);
      const phaseChanged = this.sim.phase !== prevPhase;

      const hostState = this.sim.getState({
        localId: this.localId,
        sinceEventId: this._lastHostEventId,
      });
      hostState.paused = false;
      this._lastHostEventId = this.sim.getLatestEventId();

      this.onState?.(hostState);
      for (const ev of hostState.events) {
        this.onEvent?.(ev);
      }

      this._broadcastAccum += dt;
      if (this._broadcastAccum >= 0.05 || phaseChanged) {
        this._broadcastAccum = 0;
        this.broadcastToGuests();
      }
      return hostState;
    }

    // Lobby / Finished: keep emote bubbles ticking cleanly
    if (this.sim.karts.some((k) => Boolean(k.emote))) {
      this.sim.step(dt);
      this._broadcastAccum += dt;
      const emoteCleared = !this.sim.karts.some((k) => Boolean(k.emote));
      if (emoteCleared || this._broadcastAccum >= 0.05) {
        this._broadcastAccum = 0;
        return this._emitHostStateAndBroadcast();
      }
    }

    const idleState = this.sim.getState({
      localId: this.localId,
      sinceEventId: this._lastHostEventId,
    });
    idleState.paused = false;
    this._lastHostEventId = this.sim.getLatestEventId();
    for (const ev of idleState.events) {
      this.onEvent?.(ev);
    }
    this.onState?.(idleState);
    return idleState;
  }

  setBotCount(botCount) {
    if (!this.sim || this.sim.phase !== 'lobby') return;
    this.sim.setBotCount(botCount);
    this._emitHostStateAndBroadcast();
  }

  selectTrack(trackId) {
    if (!this.sim || this.sim.phase !== 'lobby') return;
    this.sim.setTrack(trackId);
    this._emitHostStateAndBroadcast();
  }

  startRace() {
    if (!this.sim) return;
    if (this.sim.phase === 'lobby' || this.sim.phase === 'finished') {
      this.autoStartAtMs = null;
      this.sim.publicCountdown = null;
      this.sim.startCountdown();
      this._broadcastAccum = 0;
      this._emitHostStateAndBroadcast();
    }
  }

  _triggerRematch(trackId = null) {
    if (!this.sim || this.sim.phase !== 'finished') return;
    if (trackId) {
      this.sim.setTrack(trackId);
    } else if (this.isPublic) {
      const idx = TRACKS.findIndex((t) => t.id === this.sim.trackId);
      const nextTrack = TRACKS[(idx + 1) % TRACKS.length];
      this.sim.setTrack(nextTrack.id);
    }
    if (this.isPublic) {
      this.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.sim.players.size));
    }
    this.autoStartAtMs = null;
    this.sim.publicCountdown = null;
    this.sim.startCountdown();
    this._broadcastAccum = 0;
    this._emitHostStateAndBroadcast();
  }

  requestRematch(opts = {}) {
    this._triggerRematch(opts?.trackId || null);
  }

  requestRespawn() {
    if (!this.sim) return;
    if (this.sim.respawnKart(this.localId)) {
      this._emitHostStateAndBroadcast();
    }
  }

  sendEmote(emoteId) {
    if (!this.sim) return;
    if (this.sim.triggerEmote(this.localId, emoteId)) {
      this._emitHostStateAndBroadcast();
    }
  }

  sendInput(input) {
    if (!this.sim) return;
    this.sim.setPlayerInput(this.localId, input);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._bgInterval) {
      clearInterval(this._bgInterval);
      this._bgInterval = null;
    }

    for (const [, conn] of this.guests.entries()) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
    }
    this.guests.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
  }
}

/**
 * Ephemeral WebRTC P2P Guest connecting to a P2PRoomHost's deterministic Peer ID.
 */
export class P2PRoomGuest {
  constructor({
    peerId,
    roomCode,
    PeerClass = ResolvedPeer,
    onMessage = null,
    onDisconnect = null,
  } = {}) {
    this.peerId = peerId || roomCodeToPeerId(roomCode);
    this.roomCode = String(roomCode || '').toUpperCase();
    this.PeerClass = PeerClass;
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;

    this.peer = null;
    this.conn = null;
    this._destroyed = false;
  }

  connectAndJoin({
    joinType = 'join_room',
    playerName = 'Pilote',
    racerId = 'red',
    trackId = 'coco',
  } = {}) {
    if (!this.PeerClass) {
      return Promise.reject(new Error('PeerJS non disponible dans cet environnement.'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let peer;
      try {
        peer = new this.PeerClass({
          config: { iceServers: DEFAULT_ICE_SERVERS },
        });
      } catch (err) {
        reject(err);
        return;
      }

      this.peer = peer;

      const joinTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          const err = new Error(`Salon "${this.roomCode}" injoignable ou introuvable.`);
          err.code = 'TIMEOUT';
          this.destroy();
          reject(err);
        }
      }, 8000);

      const failJoin = (message, code = 'JOIN_FAILED') => {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimeout);
        const err = new Error(message);
        err.code = code;
        this.destroy();
        reject(err);
      };

      peer.on('open', () => {
        if (settled || this._destroyed) return;
        let conn;
        try {
          conn = peer.connect(this.peerId, {
            reliable: true,
            serialization: 'json',
          });
        } catch {
          failJoin('Impossible d’établir la connexion P2P.', 'CONNECT_ERROR');
          return;
        }

        this.conn = conn;

        conn.on('open', () => {
          if (settled || this._destroyed) return;
          this.send({
            type: joinType,
            roomCode: this.roomCode,
            playerName,
            racerId,
            trackId,
            reqId: 'p2p_join_1',
          });
        });

        conn.on('data', (raw) => {
          if (this._destroyed) return;
          let msg = raw;
          if (typeof raw === 'string') {
            try {
              msg = JSON.parse(raw);
            } catch {
              return;
            }
          }
          if (!msg || typeof msg.type !== 'string') return;

          if (!settled) {
            if (msg.type === 'room_joined') {
              settled = true;
              clearTimeout(joinTimeout);
              resolve(msg);
              return;
            }
            if (msg.type === 'error') {
              failJoin(msg.message || 'Impossible de rejoindre ce salon.', msg.code || 'ROOM_ERROR');
              return;
            }
          }

          this.onMessage?.(msg);
        });

        conn.on('close', () => {
          if (!settled) {
            failJoin('Connexion fermée par l’hôte.', 'CLOSED');
            return;
          }
          if (!this._destroyed) {
            this._destroyed = true;
            this.onDisconnect?.();
          }
        });

        conn.on('error', () => {
          if (!settled) {
            failJoin('Erreur sur le canal de données P2P.', 'CONN_ERROR');
          }
        });
      });

      peer.on('error', (err) => {
        if (!settled) {
          if (err?.type === 'peer-unavailable') {
            failJoin(`Salon "${this.roomCode}" introuvable.`, 'PEER_UNAVAILABLE');
          } else {
            failJoin(err?.message || 'Serveur de signalisation P2P injoignable.', err?.type || 'PEER_ERROR');
          }
        }
      });
    });
  }

  send(payload) {
    if (this._destroyed || !this.conn || !this.conn.open) return;
    try {
      this.conn.send(payload);
    } catch {
      // Ignore closed channel errors
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this.conn) {
      if (this.conn.open) {
        try {
          this.conn.send({ type: 'leave' });
        } catch {
          // Ignore
        }
      }
      try {
        this.conn.close();
      } catch {
        // Ignore
      }
      this.conn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
  }
}

/**
 * Create a new private P2P host room, retrying automatically if a random 4-letter code collides.
 */
export async function createPrivateP2PHost({
  playerName = 'Pilote',
  racerId = 'red',
  trackId = 'coco',
  PeerClass = ResolvedPeer,
  onState = null,
  onEvent = null,
  onError = null,
} = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const roomCode = generateP2PRoomCode();
    const host = new P2PRoomHost({
      roomCode,
      peerId: roomCodeToPeerId(roomCode),
      playerName,
      racerId,
      trackId,
      isPublic: false,
      PeerClass,
      onState,
      onEvent,
      onError,
    });
    try {
      await host.open();
      return { host, roomCode };
    } catch (err) {
      lastErr = err;
      host.destroy();
      if (err?.type !== 'unavailable-id') {
        throw err;
      }
    }
  }
  throw lastErr || new Error('Impossible de réserver un code salon P2P.');
}

/**
 * Deterministic P2P Public Matchmaking across slots pk3d-pub-v3-1..3:
 * 1. Try claiming slot `i` as a `isPublic: true` Host.
 * 2. If `unavailable-id` (slot already has a live Host!), immediately connect as a Guest!
 * 3. If that room is already racing or full, advance to slot `i + 1` (up to 3, with overflow host fallback).
 */
export async function joinPublicP2PMatch({
  playerName = 'Pilote',
  racerId = 'red',
  trackId = 'coco',
  PeerClass = ResolvedPeer,
  onHostState = null,
  onHostEvent = null,
  onHostError = null,
  onGuestMessage = null,
  onGuestDisconnect = null,
} = {}) {
  for (let slot = 1; slot <= PUBLIC_SLOT_CODES.length; slot++) {
    const slotCode = PUBLIC_SLOT_CODES[slot - 1];
    const peerId = `${PUBLIC_PEER_PREFIX}${slot}`;

    // Step A: Attempt to claim this public lobby slot as Host
    const candidateHost = new P2PRoomHost({
      roomCode: slotCode,
      peerId,
      playerName,
      racerId,
      trackId,
      isPublic: true,
      PeerClass,
      onState: onHostState,
      onEvent: onHostEvent,
      onError: onHostError,
    });

    try {
      await candidateHost.open();
      return {
        role: 'host',
        host: candidateHost,
        roomCode: slotCode,
      };
    } catch (hostErr) {
      candidateHost.destroy();
      if (hostErr?.type !== 'unavailable-id') {
        throw hostErr;
      }
    }

    // Step B: Slot is held by an active Public Host -> connect as Guest!
    const candidateGuest = new P2PRoomGuest({
      peerId,
      roomCode: slotCode,
      PeerClass,
      onMessage: onGuestMessage,
      onDisconnect: onGuestDisconnect,
    });

    try {
      const joinedMsg = await candidateGuest.connectAndJoin({
        joinType: 'join_public',
        playerName,
        racerId,
        trackId,
      });
      return {
        role: 'guest',
        guest: candidateGuest,
        joinedMsg,
        roomCode: joinedMsg.roomCode || slotCode,
      };
    } catch (guestErr) {
      candidateGuest.destroy();
      // If that public slot is racing, full, or just closed, try the next slot!
      if (
        guestErr?.code === 'RACE_IN_PROGRESS' ||
        guestErr?.code === 'ROOM_FULL' ||
        guestErr?.code === 'PEER_UNAVAILABLE' ||
        guestErr?.code === 'CLOSED'
      ) {
        continue;
      }
      throw guestErr;
    }
  }

  // Overflow fallback if all 3 deterministic public lobbies are simultaneously full/mid-race
  const overflowCode = generateP2PRoomCode();
  const overflowHost = new P2PRoomHost({
    roomCode: overflowCode,
    peerId: roomCodeToPeerId(overflowCode),
    playerName,
    racerId,
    trackId,
    isPublic: true,
    PeerClass,
    onState: onHostState,
    onEvent: onHostEvent,
    onError: onHostError,
  });
  await overflowHost.open();
  return {
    role: 'host',
    host: overflowHost,
    roomCode: overflowCode,
  };
}

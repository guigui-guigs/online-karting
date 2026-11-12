import { RaceSimulation } from '../shared/kartPhysics.js';
import { projectOnTrack, isArenaTrack, ARENA_DATA, isPointInShortcut } from '../shared/trackData.js';
import {
  P2PRoomGuest,
  createPrivateP2PHost,
  joinPublicP2PMatch,
  roomCodeToPeerId,
} from './p2pAdapter.js';

function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function cloneState(s) {
  if (!s) return null;
  return {
    ...s,
    karts: Array.isArray(s.karts)
      ? s.karts.map((k) => ({
          ...k,
          emote: k.emote ? { ...k.emote } : null,
          stats: k.stats ? { ...k.stats } : { hitsDealt: 0, timesHit: 0, driftsBoosted: 0, stunts: 0, coinsCollected: 0 },
        }))
      : [],
    projectiles: Array.isArray(s.projectiles) ? s.projectiles.map((p) => ({ ...p })) : [],
    explosions: Array.isArray(s.explosions) ? s.explosions.map((e) => ({ ...e })) : [],
    activeItemBoxes: Array.isArray(s.activeItemBoxes) ? [...s.activeItemBoxes] : [],
    activeCoins: Array.isArray(s.activeCoins) ? [...s.activeCoins] : [],
    events: Array.isArray(s.events) ? s.events.map((e) => ({ ...e })) : [],
  };
}

function isLocalDevHost() {
  if (typeof window === 'undefined' || !window.location) return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.startsWith('192.168.') || h.startsWith('10.');
}

export class GameClient {
  constructor({ onState, onEvent, onError, transport = 'auto', PeerClass } = {}) {
    this.onState = typeof onState === 'function' ? onState : null;
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.onError = typeof onError === 'function' ? onError : null;

    this._transportPref = transport; // 'auto' | 'ws' | 'p2p'
    this._PeerClass = PeerClass;
    this._wsUnavailable = false;

    this.mode = null; // 'solo' | 'online' | null
    this._onlineTransport = null; // 'ws' | 'p2p-host' | 'p2p-guest' | null
    this.soloSim = null;
    this._soloChampionId = null;
    this._paused = false;
    this.localId = null;
    this.roomCode = null;

    this.ws = null;
    this._p2pHost = null;
    this._p2pGuest = null;
    this._closingIntentionally = false;
    this._reqSeq = 1;
    this._pendingReqs = new Map();

    this.state = null;
    this._targetState = null;
    this._targetReceivedAt = 0;
    this._lastSeenEventId = 0;
    this._pendingEvents = [];
    this._interpKartMap = new Map();
    this._interpProjMap = new Map();

    this._latestInput = {
      steer: 0,
      drift: false,
      brake: false,
      accel: true,
      useItem: false,
      itemAim: 0,
      holdShield: false,
    };
    this._lastSentInput = {
      steer: 0,
      drift: false,
      brake: false,
      accel: true,
      holdShield: false,
    };
    this._lastInputSentAt = 0;
  }

  getState() {
    return this.state;
  }

  setPaused(paused) {
    if (this.mode !== 'solo') {
      this._paused = false;
      return false;
    }
    this._paused = Boolean(paused);
    if (this.state) {
      this.state.paused = this._paused;
      this.onState?.(this.state);
    }
    return this._paused;
  }

  isPaused() {
    return Boolean(this.mode === 'solo' && this._paused);
  }

  startSolo({
    playerName = 'Pilote',
    racerId = 'red',
    kartId = 'classic',
    boostColorId = 'flame',
    botCount = 5,
    trackId = 'coco',
    gameFormat = 'race',
    cc = '100cc',
    mirror = false,
  } = {}) {
    this._teardownOnline(false);

    this.mode = 'solo';
    this._onlineTransport = null;
    this._paused = false;
    this.localId = 'local_player';
    this.roomCode = 'SOLO';
    this._lastSeenEventId = 0;
    this._pendingEvents = [];

    this.soloSim = new RaceSimulation({
      mode: 'solo',
      roomCode: 'SOLO',
      trackId,
      isPublic: false,
      gameFormat,
      cc,
      mirror,
    });
    if (this._soloChampionId) {
      this.soloSim.championId = this._soloChampionId;
    }
    this.soloSim.addPlayer({
      id: this.localId,
      name: playerName,
      racerId,
      kartId,
      boostColorId,
    });
    this.soloSim.setBotCount(botCount);
    this.soloSim.startCountdown();

    this.state = this.soloSim.getState({
      localId: this.localId,
      sinceEventId: 0,
    });
    this.state.paused = false;
    this._lastSeenEventId = this.soloSim.getLatestEventId();

    for (const ev of this.state.events) {
      this.onEvent?.(ev);
    }
    this.onState?.(this.state);
    return this.state;
  }

  async _shouldUseWebSocket() {
    if (this._transportPref === 'p2p') return false;
    if (this._transportPref === 'ws') {
      await this._ensureWsConnected(7000);
      return true;
    }
    if (typeof WebSocket === 'undefined' || typeof window === 'undefined') {
      return false;
    }
    const explicitWsUrl =
      typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL;
    if (!isLocalDevHost() && !explicitWsUrl) {
      this._wsUnavailable = true;
      return false;
    }
    if (this._wsUnavailable && !isLocalDevHost()) {
      return false;
    }

    try {
      await this._ensureWsConnected(850);
      return true;
    } catch {
      if (!isLocalDevHost()) {
        this._wsUnavailable = true;
      }
      return false;
    }
  }

  async createRoom({
    playerName = 'Pilote',
    racerId = 'red',
    kartId = 'classic',
    boostColorId = 'flame',
    trackId = 'coco',
    gameFormat = 'race',
    cc = '100cc',
    mirror = false,
  } = {}) {
    this._cleanupSolo();
    this._paused = false;

    const useWs = await this._shouldUseWebSocket();
    if (useWs) {
      this._onlineTransport = 'ws';
      const res = await this._sendWsRequest({
        type: 'create_room',
        playerName,
        racerId,
        kartId,
        boostColorId,
        trackId,
        gameFormat,
        cc,
        mirror,
      });
      return { roomCode: res.roomCode, isPublic: false };
    }

    // Serverless WebRTC P2P Host-Authoritative mode (Vercel / static CDN)
    this._teardownOnline(false);
    const { host, roomCode } = await createPrivateP2PHost({
      playerName,
      racerId,
      kartId,
      boostColorId,
      trackId,
      gameFormat,
      cc,
      mirror,
      PeerClass: this._PeerClass,
      onState: (st) => {
        this.state = st;
        this.onState?.(st);
      },
      onEvent: (ev) => {
        this.onEvent?.(ev);
      },
      onError: (err) => {
        this.onError?.(err);
      },
    });

    this.mode = 'online';
    this._onlineTransport = 'p2p-host';
    this._p2pHost = host;
    this.roomCode = roomCode;
    this.localId = host.localId;
    this._lastSeenEventId = 0;
    this._pendingEvents = [];

    this.state = host.getHostInitialState();
    this.onState?.(this.state);
    return { roomCode, isPublic: false };
  }

  async joinRoom({ roomCode, playerName = 'Pilote', racerId = 'red', kartId = 'classic', boostColorId = 'flame' } = {}) {
    const cleanCode = String(roomCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (cleanCode.length !== 4) {
      throw new Error('Entre un code de salon valide à 4 lettres.');
    }

    this._cleanupSolo();
    this._paused = false;

    const useWs = await this._shouldUseWebSocket();
    if (useWs) {
      this._onlineTransport = 'ws';
      const res = await this._sendWsRequest({
        type: 'join_room',
        roomCode: cleanCode,
        playerName,
        racerId,
        kartId,
        boostColorId,
      });
      return { roomCode: res.roomCode, isPublic: Boolean(res.isPublic) };
    }

    // Serverless WebRTC P2P Guest mode
    this._teardownOnline(false);
    const guest = new P2PRoomGuest({
      peerId: roomCodeToPeerId(cleanCode),
      roomCode: cleanCode,
      PeerClass: this._PeerClass,
      onMessage: (msg) => this._handleServerMessage(msg),
      onDisconnect: () => {
        if (this.mode === 'online' && this._onlineTransport === 'p2p-guest' && !this._closingIntentionally) {
          this._p2pGuest = null;
          this.onError?.('Connexion P2P avec l’hôte interrompue.');
        }
      },
    });

    const joinedMsg = await guest.connectAndJoin({
      joinType: 'join_room',
      playerName,
      racerId,
      kartId,
      boostColorId,
    });

    this.mode = 'online';
    this._onlineTransport = 'p2p-guest';
    this._p2pGuest = guest;
    this.roomCode = joinedMsg.roomCode || cleanCode;
    this.localId = joinedMsg.playerId;
    this._lastSeenEventId = 0;
    this._pendingEvents = [];

    if (joinedMsg.state) {
      this._ingestServerState(joinedMsg.state, true);
    }

    return {
      roomCode: this.roomCode,
      isPublic: Boolean(joinedMsg.isPublic),
    };
  }

  async joinPublicMatch({
    playerName = 'Pilote',
    racerId = 'red',
    kartId = 'classic',
    boostColorId = 'flame',
    trackId = 'coco',
    gameFormat = 'race',
    cc = '100cc',
    mirror = false,
  } = {}) {
    this._cleanupSolo();
    this._paused = false;

    const useWs = await this._shouldUseWebSocket();
    if (useWs) {
      this._onlineTransport = 'ws';
      const res = await this._sendWsRequest({
        type: 'join_public',
        playerName,
        racerId,
        kartId,
        boostColorId,
        trackId,
        gameFormat,
        cc,
        mirror,
      });
      return { roomCode: res.roomCode, isPublic: true };
    }

    // Serverless WebRTC P2P Public Matchmaking (slots pk3d-pub-v3-1..3)
    this._teardownOnline(false);
    const match = await joinPublicP2PMatch({
      playerName,
      racerId,
      kartId,
      boostColorId,
      trackId,
      gameFormat,
      cc,
      mirror,
      PeerClass: this._PeerClass,
      onHostState: (st) => {
        this.state = st;
        this.onState?.(st);
      },
      onHostEvent: (ev) => {
        this.onEvent?.(ev);
      },
      onHostError: (err) => {
        this.onError?.(err);
      },
      onGuestMessage: (msg) => this._handleServerMessage(msg),
      onGuestDisconnect: () => {
        if (this.mode === 'online' && this._onlineTransport === 'p2p-guest' && !this._closingIntentionally) {
          this._p2pGuest = null;
          this.onError?.('Connexion P2P au salon public perdue.');
        }
      },
    });

    this.mode = 'online';
    this.roomCode = match.roomCode;
    this._lastSeenEventId = 0;
    this._pendingEvents = [];

    if (match.role === 'host') {
      this._onlineTransport = 'p2p-host';
      this._p2pHost = match.host;
      this.localId = match.host.localId;
      this.state = match.host.getHostInitialState();
      this.onState?.(this.state);
    } else {
      this._onlineTransport = 'p2p-guest';
      this._p2pGuest = match.guest;
      this.localId = match.joinedMsg.playerId;
      if (match.joinedMsg.state) {
        this._ingestServerState(match.joinedMsg.state, true);
      }
    }

    return { roomCode: this.roomCode, isPublic: true };
  }

  selectTrack(trackId) {
    if (!trackId) return;
    if (this.mode === 'solo' && this.soloSim) {
      this.soloSim.setTrack(trackId);
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = this._paused;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.selectTrack(trackId);
      } else {
        this._sendOnlineMessage({ type: 'select_track', trackId });
      }
    }
  }

  setTrack(trackId) {
    this.selectTrack(trackId);
  }

  setRoomOptions(opts = {}) {
    if (this.mode === 'solo' && this.soloSim) {
      this.soloSim.setRoomOptions(opts);
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = this._paused;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.setRoomOptions(opts);
      } else {
        this._sendOnlineMessage({ type: 'set_room_options', ...opts });
      }
    }
  }

  updateLoadout(opts = {}) {
    if (this.mode === 'solo' && this.soloSim && this.localId) {
      this.soloSim.updatePlayerLoadout(this.localId, opts);
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = this._paused;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.updateLoadout(opts);
      } else {
        this._sendOnlineMessage({ type: 'update_loadout', ...opts });
      }
    }
  }

  requestRespawn() {
    if (this.mode === 'solo' && this.soloSim && this.localId) {
      const ok = this.soloSim.respawnKart(this.localId);
      if (ok) {
        this.state = this.soloSim.getState({
          localId: this.localId,
          sinceEventId: this._lastSeenEventId,
        });
        this.state.paused = this._paused;
        this._lastSeenEventId = this.soloSim.getLatestEventId();
        for (const ev of this.state.events) {
          this.onEvent?.(ev);
        }
        this.onState?.(this.state);
      }
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.requestRespawn();
      } else {
        this._sendOnlineMessage({ type: 'respawn' });
      }
    }
  }

  respawn() {
    this.requestRespawn();
  }

  sendEmote(emoteId) {
    if (!emoteId) return;
    if (this.mode === 'solo' && this.soloSim && this.localId) {
      const ok = this.soloSim.triggerEmote(this.localId, emoteId);
      if (ok) {
        this.state = this.soloSim.getState({
          localId: this.localId,
          sinceEventId: this._lastSeenEventId,
        });
        this.state.paused = this._paused;
        this._lastSeenEventId = this.soloSim.getLatestEventId();
        for (const ev of this.state.events) {
          this.onEvent?.(ev);
        }
        this.onState?.(this.state);
      }
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.sendEmote(emoteId);
      } else {
        this._sendOnlineMessage({ type: 'emote', emoteId });
      }
    }
  }

  setBotCount(botCount) {
    if (this.mode === 'solo' && this.soloSim) {
      this.soloSim.setBotCount(botCount);
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = this._paused;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.setBotCount(Number(botCount) || 0);
      } else {
        this._sendOnlineMessage({ type: 'set_bots', botCount: Number(botCount) || 0 });
      }
    }
  }

  startRace() {
    this._paused = false;
    if (this.mode === 'solo' && this.soloSim) {
      this.soloSim.startCountdown();
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = false;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      for (const ev of this.state.events) {
        this.onEvent?.(ev);
      }
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.startRace();
      } else {
        this._sendOnlineMessage({ type: 'start_race' });
      }
    }
  }

  requestRematch(opts = {}) {
    this._paused = false;
    if (this.mode === 'solo' && this.soloSim) {
      if (opts && opts.trackId) {
        this.soloSim.setTrack(opts.trackId);
      }
      this.soloSim.startCountdown();
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = false;
      this._lastSeenEventId = this.soloSim.getLatestEventId();
      for (const ev of this.state.events) {
        this.onEvent?.(ev);
      }
      this.onState?.(this.state);
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.requestRematch(opts);
      } else {
        const payload = { type: 'rematch' };
        if (opts && opts.trackId) payload.trackId = opts.trackId;
        this._sendOnlineMessage(payload);
      }
    }
  }

  leave() {
    if (this.mode === 'online' && this._onlineTransport === 'ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendOnlineMessage({ type: 'leave' });
    }
    this._cleanupSolo();
    this._teardownOnline(false);
    this._paused = false;
    this.mode = null;
    this._onlineTransport = null;
    this.localId = null;
    this.roomCode = null;
    this.state = null;
    this._targetState = null;
    this._pendingEvents = [];
  }

  sendInput({
    steer = 0,
    drift = false,
    brake = false,
    accel = true,
    useItem = false,
    itemAim = 0,
    holdShield = false,
  } = {}) {
    const cleanSteer = clamp(Number(steer) || 0, -1, 1);
    const cleanDrift = Boolean(drift);
    const cleanBrake = Boolean(brake);
    const cleanAccel = accel !== false;
    const cleanUseItem = Boolean(useItem);
    const cleanItemAim = clamp(Math.round(Number(itemAim) || 0), -1, 1);
    const cleanHoldShield = Boolean(holdShield);

    this._latestInput.steer = cleanSteer;
    this._latestInput.drift = cleanDrift;
    this._latestInput.brake = cleanBrake;
    this._latestInput.accel = cleanAccel;
    this._latestInput.holdShield = cleanHoldShield;
    if (cleanUseItem) {
      this._latestInput.useItem = true;
      this._latestInput.itemAim = cleanItemAim;
    } else if (!this._latestInput.useItem) {
      this._latestInput.itemAim = cleanItemAim;
    }

    if (this.mode === 'solo' && this.soloSim && this.localId) {
      if (this._paused) return;
      this.soloSim.setPlayerInput(this.localId, {
        steer: cleanSteer,
        drift: cleanDrift,
        brake: cleanBrake,
        accel: cleanAccel,
        useItem: cleanUseItem,
        itemAim: cleanItemAim,
        holdShield: cleanHoldShield,
      });
      this._latestInput.useItem = false;
      this._latestInput.itemAim = 0;
      return;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        this._p2pHost.sendInput({
          steer: cleanSteer,
          drift: cleanDrift,
          brake: cleanBrake,
          accel: cleanAccel,
          useItem: cleanUseItem,
          itemAim: cleanItemAim,
          holdShield: cleanHoldShield,
        });
        this._latestInput.useItem = false;
        this._latestInput.itemAim = 0;
        return;
      }

      if (this._isRemoteChannelOpen()) {
        const now = performance.now();
        const buttonChanged =
          cleanDrift !== this._lastSentInput.drift ||
          cleanBrake !== this._lastSentInput.brake ||
          cleanAccel !== this._lastSentInput.accel ||
          cleanHoldShield !== this._lastSentInput.holdShield ||
          this._latestInput.useItem;
        const steerChangedEnough = Math.abs(cleanSteer - this._lastSentInput.steer) > 0.025;
        const intervalElapsed = now - this._lastInputSentAt >= 33;

        if (buttonChanged || (intervalElapsed && (steerChangedEnough || now - this._lastInputSentAt >= 100))) {
          this._sendOnlineMessage({
            type: 'input',
            steer: this._latestInput.steer,
            drift: this._latestInput.drift,
            brake: this._latestInput.brake,
            accel: this._latestInput.accel,
            useItem: this._latestInput.useItem,
            itemAim: this._latestInput.itemAim,
            holdShield: this._latestInput.holdShield,
          });
          this._lastSentInput.steer = this._latestInput.steer;
          this._lastSentInput.drift = this._latestInput.drift;
          this._lastSentInput.brake = this._latestInput.brake;
          this._lastSentInput.accel = this._latestInput.accel;
          this._lastSentInput.holdShield = this._latestInput.holdShield;
          this._latestInput.useItem = false;
          this._latestInput.itemAim = 0;
          this._lastInputSentAt = now;
        }
      }
    }
  }

  step(rawDt) {
    const dt = Math.min(Math.max(Number(rawDt) || 1 / 60, 0.001), 0.05);

    if (this.mode === 'solo' && this.soloSim) {
      if (this._paused) {
        return this.state;
      }

      this.soloSim.step(dt);
      if (this.soloSim.championId) {
        this._soloChampionId = this.soloSim.championId;
      }
      this.state = this.soloSim.getState({
        localId: this.localId,
        sinceEventId: this._lastSeenEventId,
      });
      this.state.paused = false;
      this._lastSeenEventId = this.soloSim.getLatestEventId();

      for (const ev of this.state.events) {
        this.onEvent?.(ev);
      }
      this.onState?.(this.state);
      return this.state;
    }

    if (this.mode === 'online') {
      if (this._onlineTransport === 'p2p-host' && this._p2pHost) {
        const hostState = this._p2pHost.step(dt);
        if (hostState) {
          this.state = hostState;
        }
        return this.state;
      }

      if (this.state) {
        this._interpolateOnlineState(dt);

        const frameEvents =
          this._pendingEvents.length > 0
            ? this._pendingEvents.splice(0, this._pendingEvents.length)
            : [];
        this.state.events = frameEvents;

        for (const ev of frameEvents) {
          this.onEvent?.(ev);
        }
        this.onState?.(this.state);
        return this.state;
      }
    }

    return null;
  }

  _interpolateOnlineState(dt) {
    const target = this._targetState;
    if (!target) return;

    const localId = this.localId || target.localId;

    this.state.mode = target.mode;
    this.state.roomCode = target.roomCode;
    this.state.isPublic = target.isPublic;
    this.state.publicCountdown = target.publicCountdown;
    this.state.trackId = target.trackId;
    this.state.gameFormat = target.gameFormat;
    this.state.cc = target.cc;
    this.state.mirror = target.mirror;
    this.state.knockoutTimer = target.knockoutTimer;
    this.state.aliveCount = target.aliveCount;
    this.state.battleTimeRemaining = target.battleTimeRemaining;
    this.state.championId = target.championId;
    this.state.hostId = target.hostId;
    this.state.localId = localId;
    this.state.phase = target.phase;
    this.state.countdown = target.countdown;
    this.state.countdownRemaining = target.countdownRemaining;
    this.state.activeItemBoxes = [...target.activeItemBoxes];
    this.state.activeCoins = Array.isArray(target.activeCoins) ? [...target.activeCoins] : [];
    this.state.paused = false;

    if (target.phase === 'racing') {
      const ageMs = Math.min(80, Math.max(0, performance.now() - this._targetReceivedAt));
      this.state.raceTimeMs = Math.round(target.raceTimeMs + ageMs);
    } else {
      this.state.raceTimeMs = target.raceTimeMs;
    }

    const ageSec =
      target.phase === 'racing'
        ? Math.min(0.065, Math.max(0, (performance.now() - this._targetReceivedAt) / 1000))
        : 0;
    const remoteBlend = 1 - Math.exp(-16 * dt);
    const localPosBlend = 1 - Math.exp(-11 * dt);
    const localYawBlend = 1 - Math.exp(-9 * dt);

    const prevKartsById = this._interpKartMap;
    prevKartsById.clear();
    if (Array.isArray(this.state.karts)) {
      for (let i = 0; i < this.state.karts.length; i++) {
        const k = this.state.karts[i];
        if (k && k.id != null) prevKartsById.set(k.id, k);
      }
    }

    const targetKarts = target.karts || [];
    if (!Array.isArray(this.state.karts)) {
      this.state.karts = [];
    }
    this.state.karts.length = targetKarts.length;

    for (let i = 0; i < targetKarts.length; i++) {
      const tk = targetKarts[i];
      const ck = prevKartsById.get(tk.id);
      if (!ck || target.phase === 'lobby') {
        const nextK = ck || {};
        Object.assign(nextK, tk);
        nextK.emote = tk.emote ? Object.assign(nextK.emote || {}, tk.emote) : null;
        nextK.stats = tk.stats
          ? Object.assign(nextK.stats || {}, tk.stats)
          : { hitsDealt: 0, timesHit: 0, driftsBoosted: 0, stunts: 0 };
        this.state.karts[i] = nextK;
        continue;
      }

      let curX = ck.x;
      let curY = ck.y;
      let curZ = ck.z;
      let curYaw = ck.yaw;
      let curSteer = ck.steer;

      const isLocalPredictable =
        tk.id === localId &&
        target.phase === 'racing' &&
        !tk.finished &&
        tk.spinoutTimer <= 0 &&
        tk.fallTimer <= 0;

      const predX = tk.fallTimer > 0 ? tk.x : tk.x + Math.sin(tk.yaw) * tk.speed * ageSec;
      const predZ = tk.fallTimer > 0 ? tk.z : tk.z + Math.cos(tk.yaw) * tk.speed * ageSec;

      if (isLocalPredictable) {
        const inSteer = this._latestInput.steer;
        const inDrift = this._latestInput.drift;
        curSteer += (inSteer - curSteer) * Math.min(1, dt * 18);

        if (tk.airborne) {
          curYaw = wrapAngle(curYaw - curSteer * 1.15 * dt);
        } else if (tk.drifting || (inDrift && ck.speed > 18 && Math.abs(inSteer) > 0.16)) {
          const dDir = tk.driftDir || (inSteer >= 0 ? 1 : -1);
          const intoTurn = inSteer * dDir;
          const driftTurnRate = dDir * (1.12 + 0.88 * intoTurn);
          curYaw = wrapAngle(curYaw - driftTurnRate * dt);
        } else {
          const speedNorm = clamp(Math.abs(ck.speed) / 14, 0.25, 1.0);
          const revSign = ck.speed < -0.5 ? -1 : 1;
          curYaw = wrapAngle(curYaw - curSteer * 2.15 * speedNorm * revSign * dt);
        }

        curX += Math.sin(curYaw) * ck.speed * dt;
        curZ += Math.cos(curYaw) * ck.speed * dt;

        const errSq = (predX - curX) * (predX - curX) + (predZ - curZ) * (predZ - curZ);
        if (errSq > 14 * 14) {
          curX = tk.x;
          curY = tk.y;
          curZ = tk.z;
          curYaw = tk.yaw;
        } else {
          curX += (predX - curX) * localPosBlend;
          curY += (tk.y - curY) * localPosBlend;
          curZ += (predZ - curZ) * localPosBlend;
          curYaw = wrapAngle(curYaw + wrapAngle(tk.yaw - curYaw) * localYawBlend);
        }

        // Prevent client prediction from visually poking outside physical track guardrails or arena rim
        if (isArenaTrack(target.trackId)) {
          const wallR = ARENA_DATA.radius - 1.3;
          const r = Math.hypot(curX, curZ);
          if (r > wallR) {
            curX = (curX / r) * wallR;
            curZ = (curZ / r) * wallR;
          }
        } else {
          const visProj = projectOnTrack(curX, curZ, target.trackId || 'coco');
          const visWall = (visProj.sample.roadHalfWidth || 7.5) - 0.25;
          if (
            visProj.sample.hasGuardrail !== false &&
            Math.abs(visProj.lateralOffset) > visWall &&
            !isPointInShortcut(visProj.t, visProj.lateralOffset, target.trackId || 'coco')
          ) {
            const sign = visProj.lateralOffset >= 0 ? 1 : -1;
            curX = visProj.sample.x + visProj.sample.nx * sign * visWall;
            curZ = visProj.sample.z + visProj.sample.nz * sign * visWall;
          }
        }
      } else {
        if (target.phase === 'racing' && tk.fallTimer <= 0) {
          curX += Math.sin(curYaw) * ck.speed * dt;
          curZ += Math.cos(curYaw) * ck.speed * dt;
        }

        const errSq = (predX - curX) * (predX - curX) + (predZ - curZ) * (predZ - curZ);
        if (errSq > 14 * 14) {
          curX = tk.x;
          curY = tk.y;
          curZ = tk.z;
          curYaw = tk.yaw;
        } else {
          curX += (predX - curX) * remoteBlend;
          curY += (tk.y - curY) * remoteBlend;
          curZ += (predZ - curZ) * remoteBlend;
          curYaw = wrapAngle(curYaw + wrapAngle(tk.yaw - curYaw) * remoteBlend);
        }
        curSteer += (tk.steer - curSteer) * remoteBlend;
      }

      const curHop = ck.hopOffset + (tk.hopOffset - ck.hopOffset) * Math.min(1, dt * 22);
      const curStunt = tk.stuntTimer > 0 ? Math.max(0, tk.stuntTimer - ageSec) : 0;

      const shieldItem =
        tk.id === localId &&
        this._latestInput.holdShield &&
        tk.itemRouletteTimer <= 0 &&
        (tk.item === 'banana' || tk.item === 'green_shell' || tk.item === 'red_shell')
          ? tk.item
          : tk.shieldItem;

      const prevEmote = ck.emote;
      const prevStats = ck.stats;
      Object.assign(ck, tk);
      ck.x = curX;
      ck.y = curY;
      ck.z = curZ;
      ck.yaw = curYaw;
      ck.steer = curSteer;
      ck.hopOffset = curHop;
      ck.stuntTimer = curStunt;
      ck.shieldItem = shieldItem;
      ck.emote = tk.emote ? Object.assign(prevEmote || {}, tk.emote) : null;
      ck.stats = tk.stats
        ? Object.assign(prevStats || {}, tk.stats)
        : { hitsDealt: 0, timesHit: 0, driftsBoosted: 0, stunts: 0 };
      this.state.karts[i] = ck;
    }

    const prevProjById = this._interpProjMap;
    prevProjById.clear();
    if (Array.isArray(this.state.projectiles)) {
      for (let i = 0; i < this.state.projectiles.length; i++) {
        const p = this.state.projectiles[i];
        if (p && p.id != null) prevProjById.set(p.id, p);
      }
    }

    const targetProjs = target.projectiles || [];
    if (!Array.isArray(this.state.projectiles)) {
      this.state.projectiles = [];
    }
    this.state.projectiles.length = targetProjs.length;

    for (let i = 0; i < targetProjs.length; i++) {
      const tp = targetProjs[i];
      const cp = prevProjById.get(tp.id);
      if (!cp || tp.type === 'banana') {
        this.state.projectiles[i] = Object.assign(cp || {}, tp);
        continue;
      }
      const shellSpeed =
        tp.type === 'blue_shell' ? 76 : tp.type === 'green_shell' ? 68 : 64;
      const curX = cp.x + Math.sin(cp.yaw) * shellSpeed * dt;
      const curZ = cp.z + Math.cos(cp.yaw) * shellSpeed * dt;
      const predX = tp.x + Math.sin(tp.yaw) * shellSpeed * ageSec;
      const predZ = tp.z + Math.cos(tp.yaw) * shellSpeed * ageSec;
      const errSq = (predX - curX) * (predX - curX) + (predZ - curZ) * (predZ - curZ);

      Object.assign(cp, tp);
      if (errSq <= 16 * 16) {
        cp.x = curX + (predX - curX) * remoteBlend;
        cp.y = cp.y + (tp.y - cp.y) * remoteBlend;
        cp.z = curZ + (predZ - curZ) * remoteBlend;
        cp.yaw = wrapAngle(cp.yaw + wrapAngle(tp.yaw - cp.yaw) * remoteBlend);
      }
      this.state.projectiles[i] = cp;
    }

    const targetExps = target.explosions || [];
    if (!Array.isArray(this.state.explosions)) {
      this.state.explosions = [];
    }
    let expWriteIdx = 0;
    for (let i = 0; i < targetExps.length; i++) {
      const te = targetExps[i];
      const nextTimer = Math.max(0, te.timer - ageSec);
      if (nextTimer <= 0) continue;
      const slot = this.state.explosions[expWriteIdx] || {};
      Object.assign(slot, te);
      slot.timer = nextTimer;
      this.state.explosions[expWriteIdx++] = slot;
    }
    this.state.explosions.length = expWriteIdx;
  }

  _cleanupSolo() {
    if (this.soloSim && this.soloSim.championId) {
      this._soloChampionId = this.soloSim.championId;
    }
    this.soloSim = null;
  }

  _teardownOnline(emitDisconnectError = false) {
    this._closingIntentionally = !emitDisconnectError;

    for (const [, pending] of this._pendingReqs) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connexion fermée.'));
    }
    this._pendingReqs.clear();

    if (this._p2pHost) {
      this._p2pHost.destroy();
      this._p2pHost = null;
    }

    if (this._p2pGuest) {
      this._p2pGuest.destroy();
      this._p2pGuest = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this._onlineTransport = null;
  }

  _isRemoteChannelOpen() {
    if (this._onlineTransport === 'ws') {
      return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    }
    if (this._onlineTransport === 'p2p-guest') {
      return Boolean(this._p2pGuest && this._p2pGuest.conn && this._p2pGuest.conn.open);
    }
    return false;
  }

  _sendOnlineMessage(payload) {
    if (this._onlineTransport === 'ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return;
    }
    if (this._onlineTransport === 'p2p-guest' && this._p2pGuest) {
      this._p2pGuest.send(payload);
    }
  }

  _getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  _ensureWsConnected(timeoutMs = 7000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    this._teardownOnline(false);

    return new Promise((resolve, reject) => {
      let settled = false;
      const url = this._getWsUrl();
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        reject(new Error('Impossible d’ouvrir la connexion WebSocket.'));
        return;
      }

      this.ws = ws;
      this._closingIntentionally = false;

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this._teardownOnline(false);
          reject(new Error('Délai de connexion au serveur dépassé.'));
        }
      }, timeoutMs);

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimeout);
        resolve(ws);
      });

      ws.addEventListener('message', (event) => {
        this._handleServerMessage(event.data);
      });

      ws.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimeout);
          this._teardownOnline(false);
          reject(new Error('Serveur multijoueur injoignable.'));
        }
      });

      ws.addEventListener('close', () => {
        clearTimeout(connectTimeout);
        if (!settled) {
          settled = true;
          this.ws = null;
          reject(new Error('Connexion au serveur interrompue.'));
          return;
        }
        const wasOnlineSession =
          this.mode === 'online' && this._onlineTransport === 'ws' && !this._closingIntentionally;
        this.ws = null;
        if (wasOnlineSession) {
          this.onError?.('Connexion au salon perdue.');
        }
      });
    });
  }

  _sendWsRequest(payload) {
    const reqId = `req_${this._reqSeq++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingReqs.delete(reqId);
        reject(new Error('Le serveur ne répond pas.'));
      }, 7000);

      this._pendingReqs.set(reqId, { resolve, reject, timer });
      this._sendOnlineMessage({ ...payload, reqId });
    });
  }

  _handleServerMessage(rawData) {
    let msg = rawData;
    if (typeof rawData === 'string') {
      try {
        msg = JSON.parse(rawData);
      } catch {
        return;
      }
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'error') {
      if (msg.reqId && this._pendingReqs.has(msg.reqId)) {
        const pending = this._pendingReqs.get(msg.reqId);
        this._pendingReqs.delete(msg.reqId);
        clearTimeout(pending.timer);
        pending.reject(new Error(msg.message || 'Erreur du salon.'));
      } else {
        this.onError?.(msg.message || 'Erreur du salon.');
      }
      return;
    }

    if (msg.type === 'room_joined') {
      this.mode = 'online';
      this._paused = false;
      this.roomCode = msg.roomCode;
      this.localId = msg.playerId;
      this._lastSeenEventId = 0;
      this._pendingEvents = [];

      if (msg.state) {
        this._ingestServerState(msg.state, true);
      }

      if (msg.reqId && this._pendingReqs.has(msg.reqId)) {
        const pending = this._pendingReqs.get(msg.reqId);
        this._pendingReqs.delete(msg.reqId);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      }
      return;
    }

    if (msg.type === 'state' && msg.state) {
      this._ingestServerState(msg.state, false);
    }
  }

  _ingestServerState(incoming, forceSnap = false) {
    if (incoming.localId) {
      this.localId = incoming.localId;
    }

    if (Array.isArray(incoming.events)) {
      for (const ev of incoming.events) {
        if (typeof ev.id === 'number') {
          if (ev.id <= this._lastSeenEventId) continue;
          this._lastSeenEventId = ev.id;
        }
        this._pendingEvents.push(ev);
      }
    }

    const prevPhase = this.state?.phase ?? null;
    const prevTrack = this.state?.trackId ?? null;
    this._targetState = incoming;
    this._targetReceivedAt = performance.now();

    if (
      forceSnap ||
      !this.state ||
      prevPhase !== incoming.phase ||
      prevTrack !== incoming.trackId ||
      incoming.phase === 'lobby' ||
      incoming.phase === 'finished'
    ) {
      const snappedEvents =
        this._pendingEvents.length > 0
          ? this._pendingEvents.splice(0, this._pendingEvents.length)
          : [];
      this.state = cloneState(incoming);
      this.state.localId = this.localId;
      this.state.paused = false;
      this.state.events = snappedEvents;

      for (const ev of snappedEvents) {
        this.onEvent?.(ev);
      }
      this.onState?.(this.state);
    }
  }
}

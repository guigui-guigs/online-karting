import { RACERS, ITEMS, TRACKS, EMOTES, RACE_CONFIG } from './constants.js';
import {
  getTrackSample,
  projectOnTrack,
  getTrackMeta,
} from './trackData.js';

const BOT_NAMES = [
  'Coco Flash',
  'Capitaine Kiwi',
  'Princesse Mango',
  'Turbo Tiki',
  'Lagoon Léo',
  'Pixel Papaye',
];

const SHIELDABLE_ITEMS = new Set([
  ITEMS.BANANA,
  ITEMS.GREEN_SHELL,
  ITEMS.RED_SHELL,
]);

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function wrap01(t) {
  const r = t % 1;
  return r < 0 ? r + 1 : r;
}

function normalizeTrackId(trackId) {
  return TRACKS.some((t) => t.id === trackId) ? trackId : 'coco';
}

export class RaceSimulation {
  constructor({ mode = 'solo', roomCode = 'SOLO', trackId = 'coco', isPublic = false } = {}) {
    this.mode = mode;
    this.roomCode = roomCode;
    this.isPublic = Boolean(isPublic);
    this.publicCountdown = null;
    this.trackId = normalizeTrackId(trackId);
    this.championId = null;

    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'countdown' | 'racing' | 'finished'
    this.countdown = 0;
    this._countdownTimer = 0;
    this._lastCountdownInt = 0;
    this.raceTimeMs = 0;
    this._postFinishTimer = null;

    this.players = new Map(); // id -> { id, name, racerId, input }
    this.botCount = 5;

    const meta = getTrackMeta(this.trackId);
    this.karts = [];
    this.projectiles = [];
    this.explosions = [];
    this._boxRespawnTimers = new Float32Array(meta.itemBoxSpots.length);
    this._lightningCooldown = 6.0;
    this._nextProjectileId = 1;
    this._nextExplosionId = 1;
    this._nextEventId = 1;
    this._finishedCount = 0;

    this._eventHistory = [];
    this._stepEvents = [];
  }

  _emitEvent(ev) {
    const full = {
      id: this._nextEventId++,
      timeMs: Math.round(this.raceTimeMs),
      ...ev,
    };
    this._stepEvents.push(full);
    this._eventHistory.push(full);
    if (this._eventHistory.length > 96) {
      this._eventHistory.splice(0, this._eventHistory.length - 96);
    }
    return full;
  }

  setTrack(trackId) {
    const valid = normalizeTrackId(trackId);
    if (this.trackId === valid && this._boxRespawnTimers.length === getTrackMeta(valid).itemBoxSpots.length) {
      return;
    }
    this.trackId = valid;
    const meta = getTrackMeta(this.trackId);
    this._boxRespawnTimers = new Float32Array(meta.itemBoxSpots.length);
    if (this.phase === 'lobby') {
      this._rebuildGridKarts();
    }
  }

  addPlayer({ id, name, racerId }) {
    if (this.players.size >= RACE_CONFIG.MAX_PLAYERS && !this.players.has(id)) {
      throw new Error('Ce salon est complet (6 joueurs maximum).');
    }
    const cleanName = String(name || 'Pilote').trim().slice(0, 16) || 'Pilote';
    const validRacer = RACERS.some((r) => r.id === racerId) ? racerId : RACERS[0].id;

    this.players.set(id, {
      id,
      name: cleanName,
      racerId: validRacer,
      input: {
        steer: 0,
        drift: false,
        brake: false,
        accel: true,
        useItem: false,
        itemAim: 0,
        holdShield: false,
      },
    });

    if (!this.hostId || !this.players.has(this.hostId)) {
      this.hostId = id;
    }

    const maxBots = Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.players.size);
    if (this.botCount > maxBots) {
      this.botCount = maxBots;
    }

    if (this.phase === 'lobby') {
      this._rebuildGridKarts();
    }
  }

  removePlayer(id) {
    const existed = this.players.delete(id);
    if (!existed) return;

    if (this.hostId === id) {
      const firstRemaining = this.players.keys().next();
      this.hostId = firstRemaining.done ? null : firstRemaining.value;
    }

    if (this.championId === id) {
      this.championId = null;
    }

    if (this.phase === 'lobby') {
      this._rebuildGridKarts();
    } else {
      const kart = this.karts.find((k) => k.id === id);
      if (kart) {
        kart.isBot = true;
        kart.shieldItem = null;
        kart._ai = this._createBotPersonality(this.karts.indexOf(kart));
      }
    }
  }

  setBotCount(count) {
    const maxBots = Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.players.size);
    const minBots = this.players.size <= 1 ? 1 : 0;
    this.botCount = clamp(Math.round(Number(count) || 0), Math.min(minBots, maxBots), maxBots);
    if (this.phase === 'lobby') {
      this._rebuildGridKarts();
    }
  }

  setPlayerInput(id, input = {}) {
    const p = this.players.get(id);
    if (!p) return;
    p.input.steer = clamp(Number(input.steer) || 0, -1, 1);
    p.input.drift = Boolean(input.drift);
    p.input.brake = Boolean(input.brake);
    p.input.accel = input.accel !== false;
    p.input.holdShield = Boolean(input.holdShield);

    const aim = clamp(Math.round(Number(input.itemAim) || 0), -1, 1);
    if (input.useItem) {
      p.input.useItem = true;
      p.input.itemAim = aim;
    } else if (!p.input.useItem) {
      p.input.itemAim = aim;
    }
  }

  respawnKart(kartId) {
    if (this.phase !== 'racing') return false;
    const kart = this.karts.find((k) => k.id === kartId);
    if (!kart || kart.finished || kart.fallTimer > 0) return false;
    if (kart._respawnCooldown > 0) return false;

    const proj = projectOnTrack(kart.x, kart.z, this.trackId);
    kart.x = proj.sample.x;
    kart.y = proj.sample.y;
    kart.z = proj.sample.z;
    kart.yaw = proj.sample.yaw;
    kart.speed = 16;
    kart.steer = 0;
    kart.drifting = false;
    kart.driftDir = 0;
    kart.driftCharge = 0;
    kart._driftTime = 0;
    kart._driftArmedTimer = 0;
    kart.airborne = false;
    kart._airOffset = 0;
    kart._vy = 0;
    kart.hopOffset = 0;
    kart._hopVel = 0;
    kart._lateralSlide = 0;
    kart.spinoutTimer = 0;
    kart.invulnTimer = Math.max(kart.invulnTimer, 1.3);
    kart.wrongWay = false;
    kart._wrongWayTimer = 0;
    kart.drafting = false;
    kart._draftTimer = 0;
    kart._respawnCooldown = 1.2;

    this._emitEvent({
      type: 'respawn',
      kartId: kart.id,
      playerId: kart.id,
    });
    return true;
  }

  triggerEmote(kartId, emoteId) {
    const kart = this.karts.find((k) => k.id === kartId);
    if (!kart) return false;
    if (kart._emoteCooldown > 0) return false;

    const found = EMOTES.find((e) => e.id === emoteId) || EMOTES[0];
    kart.emote = {
      id: found.id,
      icon: found.icon,
      timer: 2.2,
    };
    kart._emoteCooldown = 1.2;
    this._emitEvent({
      type: 'emote',
      kartId: kart.id,
      playerId: kart.id,
      emoteId: found.id,
      icon: found.icon,
    });
    return true;
  }

  startCountdown() {
    const maxBots = Math.max(0, RACE_CONFIG.MAX_PLAYERS - this.players.size);
    if (this.botCount > maxBots) {
      this.botCount = maxBots;
    }
    const meta = getTrackMeta(this.trackId);
    this._boxRespawnTimers = new Float32Array(meta.itemBoxSpots.length);
    this._rebuildGridKarts();
    this.projectiles = [];
    this.explosions = [];
    this.raceTimeMs = 0;
    this._finishedCount = 0;
    this._postFinishTimer = null;
    this._lightningCooldown = 7.0;
    this.publicCountdown = null;

    this.phase = 'countdown';
    this._countdownTimer = 3.0;
    this.countdown = 3;
    this._lastCountdownInt = 3;
    this._stepEvents = [];
    this._emitEvent({ type: 'countdown', count: 3 });
  }

  resetToLobby() {
    const meta = getTrackMeta(this.trackId);
    this.phase = 'lobby';
    this.countdown = 0;
    this._countdownTimer = 0;
    this.raceTimeMs = 0;
    this._postFinishTimer = null;
    this.projectiles = [];
    this.explosions = [];
    this._boxRespawnTimers = new Float32Array(meta.itemBoxSpots.length);
    this._rebuildGridKarts();
  }

  _createBotPersonality(slotIndex) {
    const lanes = [-2.5, 2.3, -1.0, 1.3, -2.9, 2.7];
    const rocketTriggerAt = slotIndex % 2 === 0 ? 1.65 + (slotIndex % 3) * 0.14 : -1;
    return {
      preferredLane: lanes[slotIndex % lanes.length],
      laneTimer: 1.5 + (slotIndex % 4) * 0.7,
      baseSkill: 0.96 + (slotIndex % 5) * 0.016,
      itemHoldTimer: 0,
      rocketTriggerAt,
      airTime: 0,
    };
  }

  _rebuildGridKarts() {
    const entries = [];
    const usedRacerIds = new Set();

    for (const p of this.players.values()) {
      entries.push({
        id: p.id,
        name: p.name,
        racerId: p.racerId,
        isBot: false,
      });
      usedRacerIds.add(p.racerId);
      p.input.useItem = false;
      p.input.itemAim = 0;
      p.input.holdShield = false;
    }

    const availableRacers = RACERS.filter((r) => !usedRacerIds.has(r.id));
    for (let i = 0; i < this.botCount && entries.length < RACE_CONFIG.MAX_PLAYERS; i++) {
      const racer = availableRacers[i] || RACERS[(entries.length + i) % RACERS.length];
      entries.push({
        id: `bot_${i + 1}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        racerId: racer.id,
        isBot: true,
      });
    }

    const meta = getTrackMeta(this.trackId);

    this.karts = entries.map((entry, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const distBehindStart = 7.5 + row * 5.2;
      const spawnT = wrap01(1 - distBehindStart / meta.length);
      const lateral = col === 0 ? -2.4 : 2.4;
      const sample = getTrackSample(spawnT, this.trackId);

      const x = sample.x + sample.nx * lateral;
      const z = sample.z + sample.nz * lateral;
      const unwrappedStart = spawnT - 1;

      return {
        id: entry.id,
        name: entry.name,
        racerId: entry.racerId,
        isBot: entry.isBot,
        x,
        y: sample.y,
        z,
        yaw: sample.yaw,
        speed: 0,
        steer: 0,
        drifting: false,
        driftDir: 0,
        driftCharge: 0,
        rocketCharge: 0,
        boostTimer: 0,
        starTimer: 0,
        spinoutTimer: 0,
        invulnTimer: 0,
        shrinkTimer: 0,
        stuntTimer: 0,
        fallTimer: 0,
        airborne: false,
        hopOffset: 0,
        wrongWay: false,
        drafting: false,
        shieldItem: null,
        item: ITEMS.NONE,
        itemRouletteTimer: 0,
        incomingThreat: null,
        hasCrown: Boolean(this.championId && entry.id === this.championId),
        emote: null,
        stats: {
          hitsDealt: 0,
          timesHit: 0,
          driftsBoosted: 0,
          stunts: 0,
        },
        lap: 1,
        progress: unwrappedStart,
        rank: idx + 1,
        finished: false,
        finishTimeMs: null,

        // Internal physics state
        _prevT: spawnT,
        _unwrappedT: unwrappedStart,
        _highestLapAnnounced: 1,
        _finishOrder: 0,
        _driftTime: 0,
        _driftArmedTimer: 0,
        _driftBtnWasDown: false,
        _lastDriftPressAge: 99,
        _hopVel: 0,
        _airOffset: 0,
        _vy: 0,
        _trickDone: false,
        _landingBoostPending: false,
        _fallDrop: 0,
        _fallRespawned: false,
        _fallSafeT: spawnT,
        _wrongWayTimer: 0,
        _draftTimer: 0,
        _respawnCooldown: 0,
        _rocketHoldStartTimer: null,
        _overheated: false,
        _emoteCooldown: 0,
        _lateralSlide: 0,
        _padCooldowns: new Float32Array(meta.boostPadSpots.length),
        _rampCooldowns: new Float32Array(meta.rampSpots.length),
        _ai: entry.isBot ? this._createBotPersonality(idx) : null,
      };
    });
  }

  _tickEmotes(dt) {
    for (const kart of this.karts) {
      if (kart._emoteCooldown > 0) {
        kart._emoteCooldown = Math.max(0, kart._emoteCooldown - dt);
      }
      if (kart.emote) {
        kart.emote.timer -= dt;
        if (kart.emote.timer <= 0) {
          kart.emote = null;
        }
      }
    }
  }

  step(rawDt) {
    const dt = clamp(Number(rawDt) || 1 / 60, 0.001, 0.05);
    this._stepEvents = [];

    this._tickEmotes(dt);

    if (this.phase === 'lobby' || this.phase === 'finished') {
      return this._stepEvents;
    }

    if (this.phase === 'countdown') {
      this._stepCountdown(dt);
      return this._stepEvents;
    }

    // === phase === 'racing' ===
    this.raceTimeMs += dt * 1000;
    if (this._lightningCooldown > 0) {
      this._lightningCooldown = Math.max(0, this._lightningCooldown - dt);
    }

    for (let i = 0; i < this._boxRespawnTimers.length; i++) {
      if (this._boxRespawnTimers[i] > 0) {
        this._boxRespawnTimers[i] = Math.max(0, this._boxRespawnTimers[i] - dt);
      }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].timer -= dt;
      if (this.explosions[i].timer <= 0) {
        this.explosions.splice(i, 1);
      }
    }

    let bestHumanProg = -Infinity;
    let worstHumanProg = Infinity;
    let activeHumans = 0;
    for (const k of this.karts) {
      if (!k.isBot) {
        activeHumans++;
        if (k.progress > bestHumanProg) bestHumanProg = k.progress;
        if (k.progress < worstHumanProg) worstHumanProg = k.progress;
      }
    }

    for (const kart of this.karts) {
      const input = kart.finished
        ? this._computeAutopilotInput(kart, dt, true)
        : kart.isBot
          ? this._computeBotInput(kart, dt)
          : this._consumeHumanInput(kart.id);

      this._stepKartPhysics(kart, input, dt, activeHumans, bestHumanProg, worstHumanProg);
    }

    this._resolveKartCollisions();
    this._updateKartTrackProgress(dt);
    this._stepProjectiles(dt);
    this._updateRanks();
    this._updateIncomingThreats();
    this._checkRaceEnd(dt);

    return this._stepEvents;
  }

  _stepCountdown(dt) {
    this._countdownTimer -= dt;

    for (const kart of this.karts) {
      let holdingDrift = false;
      let targetSteer = 0;

      if (kart.isBot) {
        if (kart._ai && kart._ai.rocketTriggerAt > 0 && this._countdownTimer <= kart._ai.rocketTriggerAt) {
          holdingDrift = true;
        }
      } else {
        const p = this.players.get(kart.id);
        if (p) {
          holdingDrift = Boolean(p.input.drift);
          targetSteer = p.input.steer;
        }
      }

      kart.steer += (targetSteer - kart.steer) * Math.min(1, dt * 14);

      if (kart._overheated) {
        kart.rocketCharge = -1;
      } else if (holdingDrift) {
        if (kart._rocketHoldStartTimer === null) {
          kart._rocketHoldStartTimer = this._countdownTimer + dt;
        }
        if (kart._rocketHoldStartTimer > 2.6 && this._countdownTimer < 1.85) {
          kart._overheated = true;
          kart.rocketCharge = -1;
        } else {
          kart.rocketCharge = clamp(kart.rocketCharge + dt * 0.85, 0, 1);
        }
      } else {
        kart._rocketHoldStartTimer = null;
        kart.rocketCharge = Math.max(0, kart.rocketCharge - dt * 1.6);
      }
    }

    if (this._countdownTimer <= 0) {
      this._countdownTimer = 0;
      this.countdown = 0;
      this.phase = 'racing';
      this._emitEvent({ type: 'go' });

      for (const kart of this.karts) {
        const p = !kart.isBot ? this.players.get(kart.id) : null;
        const stillHolding = kart.isBot
          ? Boolean(kart._ai && kart._ai.rocketTriggerAt > 0)
          : Boolean(p && p.input.drift);

        if (kart._overheated) {
          kart.spinoutTimer = 0.6;
          kart.invulnTimer = 0.9;
          kart.speed = 6;
          this._emitEvent({
            type: 'rocket_fail',
            kartId: kart.id,
            playerId: kart.id,
          });
        } else if (
          stillHolding &&
          kart._rocketHoldStartTimer !== null &&
          kart._rocketHoldStartTimer <= 2.15 &&
          kart._rocketHoldStartTimer > 0.35
        ) {
          kart.boostTimer = Math.max(kart.boostTimer, 1.4);
          kart.speed = RACE_CONFIG.BOOST_SPEED * 0.86;
          kart.stats.driftsBoosted += 1;
          this._emitEvent({
            type: 'rocket_start',
            kartId: kart.id,
            playerId: kart.id,
          });
        }

        kart.rocketCharge = 0;
        kart._rocketHoldStartTimer = null;
        kart._overheated = false;
        kart._driftBtnWasDown = stillHolding;
      }
    } else {
      const nextInt = Math.ceil(this._countdownTimer);
      this.countdown = nextInt;
      if (nextInt < this._lastCountdownInt && nextInt >= 1) {
        this._lastCountdownInt = nextInt;
        this._emitEvent({ type: 'countdown', count: nextInt });
      }
    }
  }

  _consumeHumanInput(id) {
    const p = this.players.get(id);
    if (!p) {
      return {
        steer: 0,
        drift: false,
        brake: false,
        accel: true,
        useItem: false,
        itemAim: 0,
        holdShield: false,
      };
    }
    const out = {
      steer: p.input.steer,
      drift: p.input.drift,
      brake: p.input.brake,
      accel: p.input.accel !== false,
      useItem: p.input.useItem,
      itemAim: p.input.itemAim || 0,
      holdShield: p.input.holdShield,
    };
    p.input.useItem = false;
    p.input.itemAim = 0;
    return out;
  }

  _computeAutopilotInput(kart, _dt, postFinish = false) {
    const lookT = wrap01(kart._prevT + 0.032);
    const targetSample = getTrackSample(lookT, this.trackId);
    const desiredYaw = Math.atan2(targetSample.x - kart.x, targetSample.z - kart.z);
    const yawErr = wrapAngle(desiredYaw - kart.yaw);
    const steer = clamp(-yawErr * 1.9, -1, 1);
    return {
      steer,
      drift: false,
      brake: false,
      accel: true,
      useItem: false,
      itemAim: 0,
      holdShield: false,
      _postFinishCruise: postFinish,
    };
  }

  _computeBotInput(kart, dt) {
    const ai = kart._ai || (kart._ai = this._createBotPersonality(0));
    const meta = getTrackMeta(this.trackId);
    const curT = kart._prevT;

    ai.laneTimer -= dt;
    if (ai.laneTimer <= 0) {
      ai.laneTimer = 2.0 + ((kart.rank * 0.73 + this.raceTimeMs * 0.001) % 2.4);
      const pseudo = Math.sin(this.raceTimeMs * 0.0023 + kart.id.length * 3.1);
      ai.preferredLane = pseudo * 3.2;
    }

    let targetLane = ai.preferredLane;

    if (kart.item === ITEMS.NONE && kart.itemRouletteTimer <= 0) {
      for (let i = 0; i < meta.itemBoxSpots.length; i++) {
        if (this._boxRespawnTimers[i] > 0) continue;
        const spot = meta.itemBoxSpots[i];
        const dtAhead = wrap01(spot.t - curT);
        if (dtAhead > 0.008 && dtAhead < 0.055 && Math.abs(spot.lateral - targetLane) < 4.2) {
          targetLane = spot.lateral;
          break;
        }
      }
    }
    for (let i = 0; i < meta.boostPadSpots.length; i++) {
      const pad = meta.boostPadSpots[i];
      const dtAhead = wrap01(pad.t - curT);
      if (dtAhead > 0.008 && dtAhead < 0.055 && Math.abs(pad.lateral - targetLane) < 4.0) {
        targetLane = pad.lateral;
        break;
      }
    }
    for (let i = 0; i < meta.rampSpots.length; i++) {
      const ramp = meta.rampSpots[i];
      const dtAhead = wrap01(ramp.t - curT);
      if (dtAhead > 0.008 && dtAhead < 0.05 && Math.abs(ramp.lateral - targetLane) < 3.6) {
        targetLane = ramp.lateral;
        break;
      }
    }

    const fx = Math.sin(kart.yaw);
    const fz = Math.cos(kart.yaw);
    for (const proj of this.projectiles) {
      if (proj.type !== ITEMS.BANANA) continue;
      const dx = proj.x - kart.x;
      const dz = proj.z - kart.z;
      const fwdDist = dx * fx + dz * fz;
      if (fwdDist > 1.5 && fwdDist < 16) {
        const rightDist = dx * -fz + dz * fx;
        if (Math.abs(rightDist) < 2.2) {
          targetLane = clamp(targetLane + (rightDist >= 0 ? -3.0 : 3.0), -4.5, 4.5);
        }
      }
    }

    const lookSample = getTrackSample(wrap01(curT + 0.034), this.trackId);
    const farSample = getTrackSample(wrap01(curT + 0.068), this.trackId);

    if (!lookSample.hasGuardrail || !farSample.hasGuardrail) {
      targetLane = clamp(targetLane * 0.45, -2.4, 2.4);
    }

    const goalX = lookSample.x + lookSample.nx * targetLane;
    const goalZ = lookSample.z + lookSample.nz * targetLane;
    const desiredYaw = Math.atan2(goalX - kart.x, goalZ - kart.z);
    const yawErr = wrapAngle(desiredYaw - kart.yaw);
    const steer = clamp(-yawErr * 2.1, -1, 1);

    const curveAngle = wrapAngle(farSample.yaw - lookSample.yaw);
    const absCurve = Math.abs(curveAngle);
    let drift = false;

    if (kart.airborne) {
      ai.airTime += dt;
      if (!kart._trickDone && ai.airTime > 0.14) {
        drift = true;
      }
    } else {
      ai.airTime = 0;
      if (kart.speed > 30 && lookSample.hasGuardrail) {
        if (!kart.drifting && absCurve > 0.34 && Math.abs(steer) > 0.32) {
          drift = true;
        } else if (kart.drifting && absCurve > 0.16 && kart.driftCharge < 2) {
          drift = true;
        }
      }
    }

    // Bots hold shield defensively when threatened from behind by a red shell!
    let holdShield = false;
    let useItem = false;
    let itemAim = 0;

    if (kart.item !== ITEMS.NONE && kart.itemRouletteTimer <= 0 && kart.spinoutTimer <= 0 && kart.fallTimer <= 0) {
      ai.itemHoldTimer += dt;

      if (kart.incomingThreat === ITEMS.RED_SHELL && SHIELDABLE_ITEMS.has(kart.item)) {
        holdShield = true;
      } else if (ai.itemHoldTimer > 1.05) {
        if (kart.item === ITEMS.TURBO || kart.item === ITEMS.STAR) {
          useItem = absCurve < 0.45 || ai.itemHoldTimer > 2.3;
        } else if (kart.item === ITEMS.BLUE_SHELL || kart.item === ITEMS.LIGHTNING) {
          useItem = ai.itemHoldTimer > 1.5;
        } else if (kart.item === ITEMS.RED_SHELL) {
          useItem = kart.rank > 1 || ai.itemHoldTimer > 3.8;
          if (kart.rank === 1) itemAim = -1; // leader fires red shell backward!
        } else if (kart.item === ITEMS.BANANA) {
          useItem = absCurve > 0.28 || ai.itemHoldTimer > 2.5;
        } else if (kart.item === ITEMS.GREEN_SHELL) {
          let linedUp = false;
          for (const other of this.karts) {
            if (other.id === kart.id || other.finished) continue;
            const dx = other.x - kart.x;
            const dz = other.z - kart.z;
            const fwd = dx * fx + dz * fz;
            const lat = Math.abs(dx * -fz + dz * fx);
            if (fwd > 4 && fwd < 36 && lat < 2.6) {
              linedUp = true;
              break;
            }
          }
          useItem = linedUp || ai.itemHoldTimer > 3.4;
        }
      }
    } else {
      ai.itemHoldTimer = 0;
    }

    return { steer, drift, brake: false, accel: true, useItem, itemAim, holdShield };
  }

  _stepKartPhysics(kart, input, dt, activeHumans, bestHumanProg, worstHumanProg) {
    const meta = getTrackMeta(this.trackId);

    // Tick timers
    if (kart.boostTimer > 0) kart.boostTimer = Math.max(0, kart.boostTimer - dt);
    if (kart.starTimer > 0) kart.starTimer = Math.max(0, kart.starTimer - dt);
    if (kart.invulnTimer > 0) kart.invulnTimer = Math.max(0, kart.invulnTimer - dt);
    if (kart.shrinkTimer > 0) kart.shrinkTimer = Math.max(0, kart.shrinkTimer - dt);
    if (kart.stuntTimer > 0) kart.stuntTimer = Math.max(0, kart.stuntTimer - dt);
    if (kart._respawnCooldown > 0) kart._respawnCooldown = Math.max(0, kart._respawnCooldown - dt);

    const wasSpinning = kart.spinoutTimer > 0;
    if (wasSpinning) {
      kart.spinoutTimer = Math.max(0, kart.spinoutTimer - dt);
      // Auto-straighten 75% toward road forward yaw right when spinout finishes!
      if (kart.spinoutTimer === 0) {
        const recProj = projectOnTrack(kart.x, kart.z, this.trackId);
        kart.yaw = wrapAngle(kart.yaw + wrapAngle(recProj.sample.yaw - kart.yaw) * 0.75);
      }
    }

    for (let i = 0; i < kart._padCooldowns.length; i++) {
      if (kart._padCooldowns[i] > 0) kart._padCooldowns[i] = Math.max(0, kart._padCooldowns[i] - dt);
    }
    for (let i = 0; i < kart._rampCooldowns.length; i++) {
      if (kart._rampCooldowns[i] > 0) kart._rampCooldowns[i] = Math.max(0, kart._rampCooldowns[i] - dt);
    }

    // Void fall & swift UFO rescue sequence
    if (kart.fallTimer > 0) {
      kart.shieldItem = null;
      kart.drafting = false;
      kart._draftTimer = 0;
      kart.fallTimer = Math.max(0, kart.fallTimer - dt);
      if (kart.fallTimer > 0.45) {
        kart._fallDrop += 17 * dt;
        kart.speed *= Math.max(0, 1 - 4 * dt);
        const fx = Math.sin(kart.yaw);
        const fz = Math.cos(kart.yaw);
        kart.x += fx * kart.speed * dt;
        kart.z += fz * kart.speed * dt;
        const s = getTrackSample(kart._fallSafeT, this.trackId);
        kart.y = s.y - kart._fallDrop;
      } else {
        const s = getTrackSample(kart._fallSafeT, this.trackId);
        if (!kart._fallRespawned) {
          kart._fallRespawned = true;
          kart.x = s.x;
          kart.z = s.z;
          kart.yaw = s.yaw;
          kart.speed = 0;
        }
        const rescueFrac = kart.fallTimer / 0.45;
        kart.y = s.y + rescueFrac * 2.4;
        if (kart.fallTimer === 0) {
          kart.y = s.y;
          kart.speed = 20;
          kart.invulnTimer = Math.max(kart.invulnTimer, 1.2);
        }
      }
      return;
    }

    // Item roulette countdown -> lock weighted item
    if (kart.itemRouletteTimer > 0) {
      kart.itemRouletteTimer = Math.max(0, kart.itemRouletteTimer - dt);
      if (kart.itemRouletteTimer === 0 && kart.item === ITEMS.NONE) {
        kart.item = this._rollWeightedItem(kart.rank, this.karts.length);
      }
    }

    // Activate item (on tap or shield release)
    if (input.useItem && !kart.finished && kart.spinoutTimer <= 0) {
      kart.shieldItem = null;
      this._activateKartItem(kart, input.itemAim || 0);
    }

    // Update trailing shield state
    if (
      input.holdShield &&
      !kart.finished &&
      kart.spinoutTimer <= 0 &&
      kart.itemRouletteTimer <= 0 &&
      SHIELDABLE_ITEMS.has(kart.item)
    ) {
      kart.shieldItem = kart.item;
    } else {
      kart.shieldItem = null;
    }

    // Permissive drift hop buffer (0.38s window after pressing drift)
    const freshDriftPress = Boolean(input.drift && !kart._driftBtnWasDown);
    if (freshDriftPress) {
      kart._lastDriftPressAge = 0;
      kart._driftArmedTimer = 0.38;
    } else {
      kart._lastDriftPressAge += dt;
      if (input.drift) {
        kart._driftArmedTimer = Math.max(0, kart._driftArmedTimer - dt);
      } else {
        kart._driftArmedTimer = 0;
      }
    }

    const targetSteer = clamp(input.steer || 0, -1, 1);
    kart.steer += (targetSteer - kart.steer) * Math.min(1, dt * 16);

    // Airborne stunt trick check & vertical arc
    if (kart.airborne) {
      if (
        !kart._trickDone &&
        kart.spinoutTimer <= 0 &&
        (freshDriftPress || kart._lastDriftPressAge < 0.2)
      ) {
        kart._trickDone = true;
        kart._landingBoostPending = true;
        kart.stuntTimer = 0.55;
        kart.stats.stunts += 1;
        this._emitEvent({
          type: 'stunt',
          kartId: kart.id,
          playerId: kart.id,
        });
      }

      kart._airOffset += kart._vy * dt;
      kart._vy -= 24 * dt;

      if (kart._airOffset <= 0 && kart._vy <= 0) {
        kart._airOffset = 0;
        kart._vy = 0;
        kart.airborne = false;
        if (kart._landingBoostPending) {
          kart._landingBoostPending = false;
          kart.boostTimer = Math.max(kart.boostTimer, 1.0);
          kart.hopOffset = 0.16;
          kart._hopVel = 2.0;
          this._emitEvent({
            type: 'boost',
            kartId: kart.id,
            playerId: kart.id,
            source: 'stunt',
          });
        }
      }
    } else {
      if (freshDriftPress && kart.spinoutTimer <= 0 && kart.hopOffset <= 0.01) {
        kart._hopVel = 4.5;
      }
      if (kart.hopOffset > 0 || kart._hopVel > 0) {
        kart.hopOffset += kart._hopVel * dt;
        kart._hopVel -= 24 * dt;
        if (kart.hopOffset <= 0) {
          kart.hopOffset = 0;
          kart._hopVel = 0;
        }
      }
    }
    kart._driftBtnWasDown = Boolean(input.drift);

    // Slipstream / Aspiration behind ahead karts (3.5..18u ahead, <= 2.3u lateral, speed > 24)
    if (!kart.airborne && !kart.finished && kart.spinoutTimer <= 0 && kart.speed > 24) {
      const fxNow = Math.sin(kart.yaw);
      const fzNow = Math.cos(kart.yaw);
      let inSlipstream = false;

      for (const other of this.karts) {
        if (other.id === kart.id || other.fallTimer > 0) continue;
        const dx = other.x - kart.x;
        const dz = other.z - kart.z;
        const fwdDist = dx * fxNow + dz * fzNow;
        if (fwdDist >= 3.5 && fwdDist <= 18.0) {
          const latDist = Math.abs(dx * -fzNow + dz * fxNow);
          if (latDist <= 2.3) {
            inSlipstream = true;
            break;
          }
        }
      }

      if (inSlipstream) {
        kart.drafting = true;
        kart._draftTimer += dt;
        if (kart._draftTimer >= 1.35) {
          kart._draftTimer = 0;
          kart.drafting = false;
          kart.boostTimer = Math.max(kart.boostTimer, 1.1);
          kart.stats.driftsBoosted += 1;
          this._emitEvent({
            type: 'boost',
            kartId: kart.id,
            playerId: kart.id,
            source: 'draft',
          });
        }
      } else {
        kart.drafting = false;
        kart._draftTimer = Math.max(0, kart._draftTimer - dt * 1.5);
      }
    } else {
      kart.drafting = false;
      kart._draftTimer = Math.max(0, kart._draftTimer - dt * 2.0);
    }

    const preProj = projectOnTrack(kart.x, kart.z, this.trackId);
    const absLat = Math.abs(preProj.lateralOffset);
    const isOffRoad = !kart.airborne && preProj.sample.hasGuardrail && absLat > preProj.sample.roadHalfWidth;

    if (kart.spinoutTimer > 0) {
      kart.drifting = false;
      kart.driftDir = 0;
      kart.driftCharge = 0;
      kart._driftTime = 0;
      kart._driftArmedTimer = 0;
      kart.shieldItem = null;
      kart.speed += (5 - kart.speed) * Math.min(1, dt * 5.5);
      kart.yaw -= kart.steer * 0.8 * dt;
    } else {
      // Permissive Drift initiation, counter-steer friendly charging & mini-turbo release
      if (!kart.airborne) {
        if (!kart.drifting) {
          const steerThreshold = kart._driftArmedTimer > 0 ? 0.12 : 0.16;
          if (input.drift && !input.brake && kart.speed > 18 && Math.abs(targetSteer) > steerThreshold) {
            kart.drifting = true;
            kart.driftDir = targetSteer >= 0 ? 1 : -1;
            kart._driftTime = 0;
            kart.driftCharge = 0;
            kart._driftArmedTimer = 0;
          }
        } else {
          if (!input.drift || input.brake || kart.speed < 13) {
            const boostDurations = [0, 0.7, 1.2, 1.8];
            const grant = boostDurations[kart.driftCharge] || 0;
            if (grant > 0) {
              kart.boostTimer = Math.max(kart.boostTimer, grant);
              kart.stats.driftsBoosted += 1;
              this._emitEvent({
                type: 'boost',
                kartId: kart.id,
                playerId: kart.id,
                charge: kart.driftCharge,
              });
            }
            kart.drifting = false;
            kart.driftDir = 0;
            kart.driftCharge = 0;
            kart._driftTime = 0;
          } else {
            // Counter-steering (intoTurn < 0) smoothly widens arc without losing charge!
            const intoTurn = targetSteer * kart.driftDir;
            const chargeRate = intoTurn >= 0 ? 1.0 + intoTurn * 0.3 : 0.92;
            kart._driftTime += dt * chargeRate;
            if (kart._driftTime >= 2.1) kart.driftCharge = 3;
            else if (kart._driftTime >= 1.3) kart.driftCharge = 2;
            else if (kart._driftTime >= 0.6) kart.driftCharge = 1;
            else kart.driftCharge = 0;
          }
        }
      }

      // Compute target top speed
      let topSpeed = RACE_CONFIG.KART_MAX_SPEED;
      if (kart.finished) {
        topSpeed = RACE_CONFIG.KART_MAX_SPEED * 0.72;
      } else if (kart.isBot && kart._ai) {
        let rubber = kart._ai.baseSkill;
        if (activeHumans > 0) {
          if (kart.progress - bestHumanProg > 0.12) {
            rubber *= clamp(1 - (kart.progress - bestHumanProg - 0.12) * 0.45, 0.88, 1);
          } else if (worstHumanProg - kart.progress > 0.14) {
            rubber *= clamp(1 + (worstHumanProg - kart.progress - 0.14) * 0.45, 1, 1.08);
          }
        }
        topSpeed *= rubber;
      }

      // Slight slipstream pull while drafting
      if (kart.drafting) {
        topSpeed *= 1.06;
      }

      const isBoosting = kart.boostTimer > 0;
      const isStar = kart.starTimer > 0;

      if (isBoosting) {
        topSpeed = Math.max(topSpeed, RACE_CONFIG.BOOST_SPEED);
      } else if (isStar) {
        topSpeed = Math.max(topSpeed, RACE_CONFIG.BOOST_SPEED * 0.93);
      } else if (isOffRoad) {
        const offAmount = clamp((absLat - preProj.sample.roadHalfWidth) / 3.5, 0, 1);
        topSpeed *= 1 - 0.42 * offAmount;
      }

      if (kart.shrinkTimer > 0 && !isStar) {
        topSpeed *= 0.78;
      }

      const wantsAccel = input.accel !== false || kart.finished;

      // Acceleration / Manual Throttle Coasting / Braking
      if (input.brake && !kart.finished && !kart.airborne) {
        if (kart.speed > 1.5) {
          kart.speed = Math.max(0, kart.speed - 56 * dt);
        } else {
          kart.speed = Math.max(-14, kart.speed - 24 * dt);
        }
      } else if (!wantsAccel && !isBoosting && !isStar) {
        if (kart.speed > 0) {
          kart.speed = Math.max(0, kart.speed - 18 * dt);
        } else if (kart.speed < 0) {
          kart.speed = Math.min(0, kart.speed + 22 * dt);
        }
      } else {
        if (isBoosting || isStar) {
          const burstRate = isBoosting ? 96 : 68;
          if (kart.speed < topSpeed) {
            kart.speed = Math.min(topSpeed, kart.speed + burstRate * dt);
          } else {
            kart.speed += (topSpeed - kart.speed) * Math.min(1, dt * 5);
          }
        } else if (kart.speed < topSpeed) {
          const lowEndBoost = kart.speed < 18 ? 38 : 26;
          kart.speed = Math.min(topSpeed, kart.speed + lowEndBoost * dt);
        } else {
          kart.speed += (topSpeed - kart.speed) * Math.min(1, dt * 4.5);
        }
      }

      // Turning (steer > 0 = turn RIGHT = decrease yaw)
      if (kart.airborne) {
        kart.yaw = wrapAngle(kart.yaw - kart.steer * 1.15 * dt);
        kart._lateralSlide *= Math.max(0, 1 - 6 * dt);
      } else if (kart.drifting) {
        const intoTurn = targetSteer * kart.driftDir;
        const driftTurnRate = kart.driftDir * (1.12 + 0.88 * intoTurn);
        kart.yaw = wrapAngle(kart.yaw - driftTurnRate * dt);
        const desiredSlide = -kart.driftDir * (3.6 + Math.max(0, intoTurn) * 1.2);
        kart._lateralSlide += (desiredSlide - kart._lateralSlide) * Math.min(1, dt * 8);
      } else {
        const speedNorm = clamp(Math.abs(kart.speed) / 14, 0.25, 1.0);
        const reverseSign = kart.speed < -0.5 ? -1 : 1;
        const turnRate = 2.15 * speedNorm * reverseSign;
        kart.yaw = wrapAngle(kart.yaw - kart.steer * turnRate * dt);
        kart._lateralSlide += (0 - kart._lateralSlide) * Math.min(1, dt * 10);
      }
    }

    // Advance world XZ
    const fx = Math.sin(kart.yaw);
    const fz = Math.cos(kart.yaw);
    const rx = -fz;
    const rz = fx;

    kart.x += (fx * kart.speed + rx * kart._lateralSlide) * dt;
    kart.z += (fz * kart.speed + rz * kart._lateralSlide) * dt;

    if (kart.finished) return;

    // Check Jump Ramps
    if (!kart.airborne) {
      for (let i = 0; i < meta.rampSpots.length; i++) {
        if (kart._rampCooldowns[i] > 0) continue;
        const ramp = meta.rampSpots[i];
        const dx = kart.x - ramp.x;
        const dz = kart.z - ramp.z;
        const rfx = Math.sin(ramp.yaw);
        const rfz = Math.cos(ramp.yaw);
        const localFwd = dx * rfx + dz * rfz;
        const localRight = dx * -rfz + dz * rfx;

        if (
          kart.speed > 16 &&
          Math.abs(localFwd) <= ramp.length * 0.52 &&
          Math.abs(localRight) <= ramp.width * 0.56
        ) {
          kart._rampCooldowns[i] = 1.4;
          kart.airborne = true;
          kart._vy = 11.4;
          kart._airOffset = 0.2;
          kart._trickDone = false;
          kart._landingBoostPending = false;
          kart.drifting = false;
          kart.driftDir = 0;
          kart.driftCharge = 0;
          kart._driftTime = 0;
          kart.boostTimer = Math.max(kart.boostTimer, 0.55);
          this._emitEvent({
            type: 'jump',
            kartId: kart.id,
            playerId: kart.id,
            rampId: ramp.id,
          });
          break;
        }
      }
    }

    // Check Boost Pads
    if (kart._airOffset < 1.2) {
      for (let i = 0; i < meta.boostPadSpots.length; i++) {
        if (kart._padCooldowns[i] > 0) continue;
        const pad = meta.boostPadSpots[i];
        const dx = kart.x - pad.x;
        const dz = kart.z - pad.z;
        if (dx * dx + dz * dz < 6.8) {
          kart._padCooldowns[i] = 1.0;
          kart.boostTimer = Math.max(kart.boostTimer, 1.2);
          this._emitEvent({ type: 'boost', kartId: kart.id, playerId: kart.id, source: 'pad' });
        }
      }
    }

    // Check Item Boxes
    if (kart._airOffset < 2.2) {
      for (let i = 0; i < meta.itemBoxSpots.length; i++) {
        if (this._boxRespawnTimers[i] > 0) continue;
        const box = meta.itemBoxSpots[i];
        const dx = kart.x - box.x;
        const dz = kart.z - box.z;
        if (dx * dx + dz * dz < 5.5) {
          this._boxRespawnTimers[i] = 6.0;
          this._emitEvent({ type: 'pickup', kartId: kart.id, playerId: kart.id, boxId: box.id });
          if (kart.item === ITEMS.NONE && kart.itemRouletteTimer <= 0) {
            kart.itemRouletteTimer = 1.2;
          }
        }
      }
    }
  }

  _rollWeightedItem(rank, totalKarts) {
    const normRank = totalKarts > 1 ? (rank - 1) / (totalKarts - 1) : 0.35;
    const blueAlreadyActive = this.projectiles.some((p) => p.type === ITEMS.BLUE_SHELL);
    const r = Math.random();

    if (normRank <= 0.15) {
      if (r < 0.46) return ITEMS.BANANA;
      if (r < 0.86) return ITEMS.GREEN_SHELL;
      return ITEMS.TURBO;
    }

    if (normRank <= 0.45) {
      if (r < 0.14) return ITEMS.BANANA;
      if (r < 0.38) return ITEMS.GREEN_SHELL;
      if (r < 0.72) return ITEMS.RED_SHELL;
      if (r < 0.94) return ITEMS.TURBO;
      return ITEMS.STAR;
    }

    if (normRank <= 0.75) {
      if (!blueAlreadyActive && rank >= 4 && r < 0.18) return ITEMS.BLUE_SHELL;
      if (r < 0.46) return ITEMS.RED_SHELL;
      if (r < 0.78) return ITEMS.TURBO;
      return ITEMS.STAR;
    }

    if (this._lightningCooldown <= 0 && rank >= 5 && r < 0.16) {
      this._lightningCooldown = 18.0;
      return ITEMS.LIGHTNING;
    }
    if (!blueAlreadyActive && rank >= 4 && r < 0.34) {
      return ITEMS.BLUE_SHELL;
    }
    if (r < 0.60) return ITEMS.STAR;
    if (r < 0.84) return ITEMS.TURBO;
    return ITEMS.RED_SHELL;
  }

  _activateKartItem(kart, itemAim = 0) {
    if (kart.item === ITEMS.NONE || kart.itemRouletteTimer > 0) return;
    const item = kart.item;
    kart.item = ITEMS.NONE;
    kart.shieldItem = null;

    const fx = Math.sin(kart.yaw);
    const fz = Math.cos(kart.yaw);

    if (item === ITEMS.TURBO) {
      kart.boostTimer = Math.max(kart.boostTimer, 1.5);
      this._emitEvent({ type: 'boost', kartId: kart.id, playerId: kart.id, item });
      return;
    }

    if (item === ITEMS.STAR) {
      kart.starTimer = 6.0;
      kart.spinoutTimer = 0;
      kart.shrinkTimer = 0;
      this._emitEvent({ type: 'boost', kartId: kart.id, playerId: kart.id, item });
      return;
    }

    if (item === ITEMS.LIGHTNING) {
      this._lightningCooldown = Math.max(this._lightningCooldown, 16.0);
      this._emitEvent({ type: 'lightning', kartId: kart.id, playerId: kart.id, item });

      for (const other of this.karts) {
        if (other.id === kart.id || other.finished) continue;
        if (kart.rank > 1 && other.rank >= kart.rank) continue;
        if (other.starTimer > 0 || other.invulnTimer > 0) continue;

        other.shrinkTimer = 4.5;
        other.item = ITEMS.NONE;
        other.shieldItem = null;
        other.itemRouletteTimer = 0;
        other.boostTimer = 0;
        other.spinoutTimer = Math.max(other.spinoutTimer, 0.45);
        other.invulnTimer = Math.max(other.invulnTimer, 0.45 + 1.35);
        other.speed *= 0.65;
        kart.stats.hitsDealt += 1;
        other.stats.timesHit += 1;
      }
      return;
    }

    if (item === ITEMS.BANANA) {
      let bx;
      let by;
      let bz;

      if (itemAim === 1) {
        // Forward banana throw: 15u ahead along track tangent onto road surface!
        const meta = getTrackMeta(this.trackId);
        const curProj = projectOnTrack(kart.x, kart.z, this.trackId);
        const aheadSample = getTrackSample(wrap01(curProj.t + 15 / meta.length), this.trackId);
        const safeLat = clamp(
          curProj.lateralOffset,
          -aheadSample.roadHalfWidth + 0.8,
          aheadSample.roadHalfWidth - 0.8
        );
        bx = aheadSample.x + aheadSample.nx * safeLat;
        by = aheadSample.y;
        bz = aheadSample.z + aheadSample.nz * safeLat;
      } else {
        bx = kart.x - fx * 2.4;
        bz = kart.z - fz * 2.4;
        const proj = projectOnTrack(bx, bz, this.trackId);
        by = proj.sample.y;
      }

      this.projectiles.push({
        id: `p_${this._nextProjectileId++}`,
        type: ITEMS.BANANA,
        x: bx,
        y: by,
        z: bz,
        yaw: kart.yaw,
        ownerId: kart.id,
        _ttl: 30,
        _armTimer: 0.35,
      });
      this._emitEvent({ type: 'fire', kartId: kart.id, playerId: kart.id, item, aim: itemAim });
      return;
    }

    if (item === ITEMS.GREEN_SHELL) {
      const isRear = itemAim === -1;
      const fireYaw = isRear ? wrapAngle(kart.yaw + Math.PI) : kart.yaw;
      const dfx = Math.sin(fireYaw);
      const dfz = Math.cos(fireYaw);
      const sx = kart.x + dfx * 2.5;
      const sz = kart.z + dfz * 2.5;
      const shellSpeed = isRear ? 68 : Math.max(68, kart.speed + 20);

      this.projectiles.push({
        id: `p_${this._nextProjectileId++}`,
        type: ITEMS.GREEN_SHELL,
        x: sx,
        y: kart.y + 0.35,
        z: sz,
        yaw: fireYaw,
        ownerId: kart.id,
        _vx: dfx * shellSpeed,
        _vz: dfz * shellSpeed,
        _speed: shellSpeed,
        _bouncesLeft: 4,
        _ttl: 9.0,
        _armTimer: 0.25,
      });
      this._emitEvent({ type: 'fire', kartId: kart.id, playerId: kart.id, item, aim: itemAim });
      return;
    }

    if (item === ITEMS.RED_SHELL) {
      const isRear = itemAim === -1;
      const fireYaw = isRear ? wrapAngle(kart.yaw + Math.PI) : kart.yaw;
      const dfx = Math.sin(fireYaw);
      const dfz = Math.cos(fireYaw);
      const sx = kart.x + dfx * 2.5;
      const sz = kart.z + dfz * 2.5;
      const shellSpeed = isRear ? 66 : Math.max(64, kart.speed + 18);
      const targetKart = isRear
        ? null
        : this.karts.find((k) => k.rank === kart.rank - 1 && !k.finished) || null;

      this.projectiles.push({
        id: `p_${this._nextProjectileId++}`,
        type: ITEMS.RED_SHELL,
        x: sx,
        y: kart.y + 0.35,
        z: sz,
        yaw: fireYaw,
        ownerId: kart.id,
        _speed: shellSpeed,
        _targetId: targetKart ? targetKart.id : null,
        _backward: isRear,
        _ttl: 10.5,
        _armTimer: 0.25,
      });
      this._emitEvent({ type: 'fire', kartId: kart.id, playerId: kart.id, item, aim: itemAim });
      return;
    }

    if (item === ITEMS.BLUE_SHELL) {
      const sx = kart.x + fx * 2.6;
      const sz = kart.z + fz * 2.6;
      const leader = this.karts.find((k) => k.rank === 1 && !k.finished) || null;
      this.projectiles.push({
        id: `p_${this._nextProjectileId++}`,
        type: ITEMS.BLUE_SHELL,
        x: sx,
        y: kart.y + 1.8,
        z: sz,
        yaw: kart.yaw,
        ownerId: kart.id,
        _speed: 76,
        _targetId: leader ? leader.id : null,
        _ttl: 15.0,
        _armTimer: 0.3,
      });
      this._emitEvent({ type: 'fire', kartId: kart.id, playerId: kart.id, item });
    }
  }

  _resolveKartCollisions() {
    const baseDist = 2.25;
    const n = this.karts.length;

    for (let i = 0; i < n; i++) {
      const a = this.karts[i];
      if (a.fallTimer > 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.karts[j];
        if (b.fallTimer > 0) continue;
        if (Math.abs(a.y - b.y) > 1.8) continue;

        const minDist = a.shrinkTimer > 0 || b.shrinkTimer > 0 ? 1.85 : baseDist;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist * minDist) continue;

        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const nz = dz / d;
        const push = (minDist - d) * 0.5;

        const aWeight = a.shrinkTimer > 0 && b.shrinkTimer <= 0 ? 1.35 : 1.0;
        const bWeight = b.shrinkTimer > 0 && a.shrinkTimer <= 0 ? 1.35 : 1.0;

        a.x -= nx * push * aWeight;
        a.z -= nz * push * aWeight;
        b.x += nx * push * bWeight;
        b.z += nz * push * bWeight;

        if (a.starTimer > 0 && b.starTimer <= 0 && b.invulnTimer <= 0 && !b.finished) {
          this._triggerSpinout(b, a.id, ITEMS.STAR);
        } else if (b.starTimer > 0 && a.starTimer <= 0 && a.invulnTimer <= 0 && !a.finished) {
          this._triggerSpinout(a, b.id, ITEMS.STAR);
        }
      }
    }
  }

  _triggerSpinout(victim, attackerId, itemType, duration = 1.1) {
    if (victim.invulnTimer > 0 || victim.starTimer > 0) return;

    victim.spinoutTimer = Math.max(victim.spinoutTimer, duration);
    victim.invulnTimer = duration + 1.35;
    victim.boostTimer = 0;
    victim.speed *= 0.32;
    victim.drifting = false;
    victim.driftDir = 0;
    victim.driftCharge = 0;
    victim._driftTime = 0;
    victim._driftArmedTimer = 0;
    victim.shieldItem = null;

    victim.stats.timesHit += 1;
    if (attackerId && attackerId !== victim.id) {
      const attacker = this.karts.find((k) => k.id === attackerId);
      if (attacker) {
        attacker.stats.hitsDealt += 1;
      }
    }

    this._emitEvent({
      type: 'hit',
      kartId: victim.id,
      playerId: victim.id,
      targetId: victim.id,
      attackerId,
      item: itemType,
    });
  }

  _detonateBlueShell(proj, cx, cy, cz) {
    this.explosions.push({
      id: `exp_${this._nextExplosionId++}`,
      x: cx,
      y: cy + 0.5,
      z: cz,
      timer: 0.55,
      maxTimer: 0.55,
      type: ITEMS.BLUE_SHELL,
    });

    this._emitEvent({
      type: 'explosion',
      kartId: proj._targetId || proj.ownerId,
      playerId: proj._targetId || proj.ownerId,
      attackerId: proj.ownerId,
      x: +cx.toFixed(2),
      y: +cy.toFixed(2),
      z: +cz.toFixed(2),
    });

    const blastRadiusSq = 5.5 * 5.5;
    for (const kart of this.karts) {
      if (kart.finished || kart.fallTimer > 0) continue;
      const dx = kart.x - cx;
      const dz = kart.z - cz;
      if (dx * dx + dz * dz <= blastRadiusSq) {
        if (kart.starTimer <= 0 && kart.invulnTimer <= 0) {
          this._triggerSpinout(kart, proj.ownerId, ITEMS.BLUE_SHELL, 1.35);
        }
      }
    }
  }

  _updateKartTrackProgress(dt = 1 / 60) {
    for (const kart of this.karts) {
      if (kart.fallTimer > 0) continue;

      const proj = projectOnTrack(kart.x, kart.z, this.trackId);

      if (!proj.sample.hasGuardrail) {
        if (!kart.finished && Math.abs(proj.lateralOffset) > proj.sample.roadHalfWidth + 1.8) {
          kart.fallTimer = 1.15;
          kart._fallDrop = 0;
          kart._fallRespawned = false;
          kart._fallSafeT = proj.t;
          kart.airborne = false;
          kart._airOffset = 0;
          kart._vy = 0;
          kart.drifting = false;
          kart.driftDir = 0;
          kart.driftCharge = 0;
          kart.boostTimer = 0;
          kart.shieldItem = null;
          kart.wrongWay = false;
          kart._wrongWayTimer = 0;
          kart.stats.timesHit += 1;
          this._emitEvent({
            type: 'fall',
            kartId: kart.id,
            playerId: kart.id,
          });
          continue;
        }
      } else {
        const wallLimit = proj.sample.roadHalfWidth + 3.5;
        if (Math.abs(proj.lateralOffset) > wallLimit) {
          const sign = proj.lateralOffset >= 0 ? 1 : -1;
          const clamped = sign * wallLimit;
          kart.x = proj.sample.x + proj.sample.nx * clamped;
          kart.z = proj.sample.z + proj.sample.nz * clamped;
          const yawDiff = wrapAngle(proj.sample.yaw - kart.yaw);
          kart.yaw = wrapAngle(kart.yaw + yawDiff * 0.38);
          kart.speed *= 0.94;
        }
      }

      kart.y = proj.sample.y + kart._airOffset;

      let deltaT = proj.t - kart._prevT;
      if (deltaT > 0.5) deltaT -= 1;
      if (deltaT < -0.5) deltaT += 1;
      kart._unwrappedT += deltaT;
      kart._prevT = proj.t;

      if (kart._unwrappedT < -0.15) {
        kart._unwrappedT = -0.15;
      }

      kart.progress = kart._unwrappedT;

      // Wrong-way detection & assisted 2.5s auto-respawn
      if (!kart.finished && this.phase === 'racing' && kart.spinoutTimer <= 0) {
        const headingDiff = Math.abs(wrapAngle(kart.yaw - proj.sample.yaw));
        if (headingDiff > 2.05 && kart.speed >= -2) {
          kart._wrongWayTimer += dt;
        } else {
          kart._wrongWayTimer = Math.max(0, kart._wrongWayTimer - dt * 2.5);
        }
        kart.wrongWay = kart._wrongWayTimer >= 0.65;
        if (kart._wrongWayTimer >= 2.5) {
          this.respawnKart(kart.id);
          continue;
        }
      } else {
        kart.wrongWay = false;
        kart._wrongWayTimer = 0;
      }

      const currentLap = clamp(
        Math.floor(Math.max(0, kart._unwrappedT)) + 1,
        1,
        RACE_CONFIG.TOTAL_LAPS
      );
      kart.lap = currentLap;

      if (!kart.finished) {
        if (currentLap > kart._highestLapAnnounced) {
          kart._highestLapAnnounced = currentLap;
          this._emitEvent({
            type: 'lap',
            kartId: kart.id,
            playerId: kart.id,
            lap: currentLap,
          });
        }

        if (kart._unwrappedT >= RACE_CONFIG.TOTAL_LAPS) {
          kart.finished = true;
          kart.wrongWay = false;
          kart.shieldItem = null;
          kart.drafting = false;
          kart.finishTimeMs = Math.round(this.raceTimeMs);
          kart._finishOrder = ++this._finishedCount;
          kart.rank = kart._finishOrder;
          if (kart._finishOrder === 1) {
            this.championId = kart.id;
            for (const k of this.karts) {
              k.hasCrown = k.id === this.championId;
            }
          }
          this._emitEvent({
            type: 'finish',
            kartId: kart.id,
            playerId: kart.id,
            rank: kart._finishOrder,
            finishTimeMs: kart.finishTimeMs,
          });
        }
      }
    }
  }

  _stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p._ttl -= dt;
      if (p._armTimer > 0) p._armTimer = Math.max(0, p._armTimer - dt);

      if (p._ttl <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.type === ITEMS.BLUE_SHELL) {
        const leader =
          this.karts.find((k) => k.rank === 1 && !k.finished) ||
          this.karts.find((k) => !k.finished) ||
          null;
        p._targetId = leader ? leader.id : null;

        const proj = projectOnTrack(p.x, p.z, this.trackId);
        let goalX;
        let goalZ;
        let targetAltitude = proj.sample.y + 1.8;

        if (leader) {
          const dx = leader.x - p.x;
          const dz = leader.z - p.z;
          const dist = Math.hypot(dx, dz);
          const aheadT = wrap01(leader._prevT - proj.t);

          if (dist < 2.4) {
            this.projectiles.splice(i, 1);
            this._detonateBlueShell(p, leader.x, leader.y, leader.z);
            continue;
          }

          if (dist < 24 && (aheadT < 0.14 || aheadT > 0.95)) {
            goalX = leader.x;
            goalZ = leader.z;
            targetAltitude = leader.y + 0.55 + (dist / 24) * 1.25;
          } else {
            const look = getTrackSample(wrap01(proj.t + 0.032), this.trackId);
            goalX = look.x;
            goalZ = look.z;
          }
        } else {
          const look = getTrackSample(wrap01(proj.t + 0.032), this.trackId);
          goalX = look.x;
          goalZ = look.z;
        }

        const desiredYaw = Math.atan2(goalX - p.x, goalZ - p.z);
        const diff = wrapAngle(desiredYaw - p.yaw);
        p.yaw = wrapAngle(p.yaw + clamp(diff, -10.0 * dt, 10.0 * dt));

        p.x += Math.sin(p.yaw) * p._speed * dt;
        p.z += Math.cos(p.yaw) * p._speed * dt;
        p.y += (targetAltitude - p.y) * Math.min(1, dt * 10);

        if (leader) {
          const postDistSq = (leader.x - p.x) ** 2 + (leader.z - p.z) ** 2;
          if (postDistSq < 2.5 * 2.5) {
            this.projectiles.splice(i, 1);
            this._detonateBlueShell(p, leader.x, leader.y, leader.z);
          }
        }
        continue;
      }

      if (p.type === ITEMS.GREEN_SHELL) {
        p.x += p._vx * dt;
        p.z += p._vz * dt;
        const proj = projectOnTrack(p.x, p.z, this.trackId);
        p.y = proj.sample.y + 0.35;

        if (!proj.sample.hasGuardrail && Math.abs(proj.lateralOffset) > proj.sample.roadHalfWidth + 2.5) {
          this.projectiles.splice(i, 1);
          continue;
        }

        const wallLimit = proj.sample.roadHalfWidth + 2.8;
        if (proj.sample.hasGuardrail && Math.abs(proj.lateralOffset) > wallLimit) {
          const sign = proj.lateralOffset >= 0 ? 1 : -1;
          p.x = proj.sample.x + proj.sample.nx * (sign * wallLimit);
          p.z = proj.sample.z + proj.sample.nz * (sign * wallLimit);
          const vDotN = p._vx * proj.sample.nx + p._vz * proj.sample.nz;
          if (vDotN * sign > 0) {
            p._vx -= 2 * vDotN * proj.sample.nx;
            p._vz -= 2 * vDotN * proj.sample.nz;
            p.yaw = Math.atan2(p._vx, p._vz);
            p._bouncesLeft -= 1;
            if (p._bouncesLeft < 0) {
              this.projectiles.splice(i, 1);
              continue;
            }
          }
        }
      } else if (p.type === ITEMS.RED_SHELL) {
        const proj = projectOnTrack(p.x, p.z, this.trackId);

        if (p._backward) {
          // Rear-fired red shell: rockets backward along the road to snipe pursuers/shells!
          const backLook = getTrackSample(wrap01(proj.t - 0.028), this.trackId);
          const safeLat = clamp(proj.lateralOffset * 0.85, -5.5, 5.5);
          const goalX = backLook.x + backLook.nx * safeLat;
          const goalZ = backLook.z + backLook.nz * safeLat;
          const desiredYaw = Math.atan2(goalX - p.x, goalZ - p.z);
          const diff = wrapAngle(desiredYaw - p.yaw);
          p.yaw = wrapAngle(p.yaw + clamp(diff, -8.0 * dt, 8.0 * dt));

          p.x += Math.sin(p.yaw) * p._speed * dt;
          p.z += Math.cos(p.yaw) * p._speed * dt;
          const postProj = projectOnTrack(p.x, p.z, this.trackId);
          p.y = postProj.sample.y + 0.35;
        } else {
          let target = p._targetId
            ? this.karts.find((k) => k.id === p._targetId && !k.finished && k.fallTimer <= 0)
            : null;
          if (!target) {
            const owner = this.karts.find((k) => k.id === p.ownerId);
            if (owner && owner.rank > 1) {
              target =
                this.karts.find((k) => k.rank === owner.rank - 1 && !k.finished && k.fallTimer <= 0) ||
                null;
              if (target) p._targetId = target.id;
            }
          }

          let goalX;
          let goalZ;
          let homingDirect = false;
          if (target) {
            const dx = target.x - p.x;
            const dz = target.z - p.z;
            const distSq = dx * dx + dz * dz;
            const aheadT = wrap01(target._prevT - proj.t);
            if (distSq < 26 * 26 && (aheadT < 0.16 || aheadT > 0.96)) {
              goalX = target.x;
              goalZ = target.z;
              homingDirect = true;
            }
          }

          if (!homingDirect) {
            const look = getTrackSample(wrap01(proj.t + 0.028), this.trackId);
            goalX = look.x;
            goalZ = look.z;
          }

          const desiredYaw = Math.atan2(goalX - p.x, goalZ - p.z);
          const diff = wrapAngle(desiredYaw - p.yaw);
          p.yaw = wrapAngle(p.yaw + clamp(diff, -8.5 * dt, 8.5 * dt));

          p.x += Math.sin(p.yaw) * p._speed * dt;
          p.z += Math.cos(p.yaw) * p._speed * dt;
          const postProj = projectOnTrack(p.x, p.z, this.trackId);
          p.y = postProj.sample.y + 0.35;
        }
      }

      // Projectile-vs-projectile cancellation (moving shells vs bananas or opposing shells)
      if (p.type === ITEMS.GREEN_SHELL || p.type === ITEMS.RED_SHELL) {
        let cancelled = false;
        for (let j = this.projectiles.length - 1; j >= 0; j--) {
          if (i === j) continue;
          const other = this.projectiles[j];
          if (other.type === ITEMS.BLUE_SHELL) continue;
          const dx = p.x - other.x;
          const dz = p.z - other.z;
          if (dx * dx + dz * dz < 1.8) {
            const hi = Math.max(i, j);
            const lo = Math.min(i, j);
            this.projectiles.splice(hi, 1);
            this.projectiles.splice(lo, 1);
            if (j < i) i--;
            cancelled = true;
            break;
          }
        }
        if (cancelled) continue;
      }

      // Trailing Shield Block Check (2.2u behind shielded kart, 2.4u radius)
      if (p.type === ITEMS.GREEN_SHELL || p.type === ITEMS.RED_SHELL) {
        let blockedByShield = false;
        for (const kart of this.karts) {
          if (!kart.shieldItem || kart.finished || kart.fallTimer > 0) continue;
          if (kart.id === p.ownerId && p._armTimer > 0) continue;
          const sx = kart.x - Math.sin(kart.yaw) * 2.2;
          const sz = kart.z - Math.cos(kart.yaw) * 2.2;
          const dx = p.x - sx;
          const dz = p.z - sz;
          if (dx * dx + dz * dz <= 2.4 * 2.4) {
            this.projectiles.splice(i, 1);
            kart.item = ITEMS.NONE;
            kart.shieldItem = null;
            this._emitEvent({
              type: 'shield_block',
              kartId: kart.id,
              playerId: kart.id,
              blockedType: p.type,
              attackerId: p.ownerId,
            });
            blockedByShield = true;
            break;
          }
        }
        if (blockedByShield) continue;
      }

      // Check collision against karts
      const hitRadiusSq = p.type === ITEMS.BANANA ? 2.1 : 2.9;
      for (const kart of this.karts) {
        if (kart.finished || kart.fallTimer > 0) continue;
        if (kart.id === p.ownerId && p._armTimer > 0) continue;
        if (Math.abs(kart.y - p.y) > 1.7) continue;
        const dx = kart.x - p.x;
        const dz = kart.z - p.z;
        if (dx * dx + dz * dz < hitRadiusSq) {
          this.projectiles.splice(i, 1);
          if (kart.starTimer <= 0 && kart.invulnTimer <= 0 && kart.spinoutTimer <= 0) {
            this._triggerSpinout(kart, p.ownerId, p.type);
          }
          break;
        }
      }
    }
  }

  _updateIncomingThreats() {
    const meta = getTrackMeta(this.trackId);

    for (const kart of this.karts) {
      const prevThreat = kart.incomingThreat;
      let nextThreat = null;

      if (!kart.finished && this.phase === 'racing') {
        for (const p of this.projectiles) {
          if (p.ownerId === kart.id || p._backward) continue;
          if (p.type !== ITEMS.BLUE_SHELL && p.type !== ITEMS.RED_SHELL) continue;

          const isTargeted =
            (p.type === ITEMS.BLUE_SHELL && (p._targetId === kart.id || kart.rank === 1)) ||
            (p.type === ITEMS.RED_SHELL && p._targetId === kart.id);

          if (!isTargeted) continue;

          const proj = projectOnTrack(p.x, p.z, this.trackId);
          const behindArc = wrap01(kart._prevT - proj.t) * meta.length;
          const worldDist = Math.hypot(kart.x - p.x, kart.z - p.z);

          if (worldDist <= 80 || behindArc <= 80) {
            if (p.type === ITEMS.BLUE_SHELL) {
              nextThreat = ITEMS.BLUE_SHELL;
              break;
            }
            nextThreat = ITEMS.RED_SHELL;
          }
        }
      }

      kart.incomingThreat = nextThreat;
      if (nextThreat && nextThreat !== prevThreat) {
        this._emitEvent({
          type: 'warning',
          kartId: kart.id,
          playerId: kart.id,
          threat: nextThreat,
        });
      }
    }
  }

  _updateRanks() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) {
        return a._finishOrder - b._finishOrder;
      }
      if (a.finished !== b.finished) {
        return a.finished ? -1 : 1;
      }
      return b.progress - a.progress;
    });

    for (let i = 0; i < sorted.length; i++) {
      sorted[i].rank = i + 1;
    }
  }

  _checkRaceEnd(dt) {
    const humans = this.karts.filter((k) => !k.isBot);
    const allKartsFinished = this.karts.length > 0 && this.karts.every((k) => k.finished);

    if (allKartsFinished) {
      this._finalizeRace();
      return;
    }

    if (humans.length > 0) {
      const allHumansFinished = humans.every((h) => h.finished);
      const anyHumanFinished = humans.some((h) => h.finished);

      if (allHumansFinished) {
        if (this._postFinishTimer === null) {
          this._postFinishTimer = 0.85;
        } else {
          this._postFinishTimer -= dt;
          if (this._postFinishTimer <= 0) {
            this._finalizeRace();
          }
        }
      } else if (anyHumanFinished) {
        if (this._postFinishTimer === null) {
          this._postFinishTimer = 18.0;
        } else {
          this._postFinishTimer -= dt;
          if (this._postFinishTimer <= 0) {
            this._finalizeRace();
          }
        }
      }
    }
  }

  _finalizeRace() {
    const meta = getTrackMeta(this.trackId);
    this._updateRanks();
    const sorted = [...this.karts].sort((a, b) => a.rank - b.rank);
    let lastTimeMs = Math.round(this.raceTimeMs);

    for (const kart of sorted) {
      kart.incomingThreat = null;
      kart.wrongWay = false;
      kart.drafting = false;
      kart.shieldItem = null;
      if (!kart.finished) {
        const remainingLaps = Math.max(0.01, RACE_CONFIG.TOTAL_LAPS - kart.progress);
        const remainingDist = remainingLaps * meta.length;
        const estSpeed = Math.max(30, kart.speed || 38);
        const extraMs = Math.round((remainingDist / estSpeed) * 1000);
        const estTotal = Math.max(lastTimeMs + 180, Math.round(this.raceTimeMs) + extraMs);
        kart.finished = true;
        kart.finishTimeMs = estTotal;
        kart._finishOrder = ++this._finishedCount;
        lastTimeMs = estTotal;
      } else if (kart.finishTimeMs > lastTimeMs) {
        lastTimeMs = kart.finishTimeMs;
      }
    }

    this._updateRanks();
    const winner = this.karts.find((k) => k.rank === 1);
    if (winner) {
      this.championId = winner.id;
      for (const k of this.karts) {
        k.hasCrown = k.id === this.championId;
      }
    }

    this.phase = 'finished';
    this.projectiles = [];
    this.explosions = [];
  }

  getEventsSince(lastEventId = 0) {
    return this._eventHistory.filter((ev) => ev.id > lastEventId);
  }

  getLatestEventId() {
    return this._eventHistory.length > 0
      ? this._eventHistory[this._eventHistory.length - 1].id
      : 0;
  }

  getState({ localId = null, sinceEventId = null } = {}) {
    const meta = getTrackMeta(this.trackId);
    const activeItemBoxes = [];
    for (let i = 0; i < meta.itemBoxSpots.length; i++) {
      if (this._boxRespawnTimers[i] <= 0) {
        activeItemBoxes.push(meta.itemBoxSpots[i].id);
      }
    }

    const events =
      sinceEventId !== null
        ? this.getEventsSince(sinceEventId)
        : [...this._stepEvents];

    return {
      mode: this.mode,
      roomCode: this.roomCode,
      isPublic: this.isPublic,
      publicCountdown: this.publicCountdown,
      trackId: this.trackId,
      championId: this.championId,
      hostId: this.hostId,
      localId,
      phase: this.phase,
      countdown: this.countdown,
      countdownRemaining: +this._countdownTimer.toFixed(3),
      raceTimeMs: Math.round(this.raceTimeMs),
      karts: this.karts.map((k) => ({
        id: k.id,
        name: k.name,
        racerId: k.racerId,
        isBot: k.isBot,
        x: +k.x.toFixed(3),
        y: +k.y.toFixed(3),
        z: +k.z.toFixed(3),
        yaw: +k.yaw.toFixed(4),
        speed: +k.speed.toFixed(2),
        steer: +k.steer.toFixed(3),
        drifting: k.drifting,
        driftDir: k.driftDir,
        driftCharge: k.driftCharge,
        rocketCharge: +k.rocketCharge.toFixed(3),
        boostTimer: +k.boostTimer.toFixed(3),
        starTimer: +k.starTimer.toFixed(3),
        spinoutTimer: +k.spinoutTimer.toFixed(3),
        invulnTimer: +k.invulnTimer.toFixed(3),
        shrinkTimer: +k.shrinkTimer.toFixed(3),
        stuntTimer: +k.stuntTimer.toFixed(3),
        fallTimer: +k.fallTimer.toFixed(3),
        airborne: k.airborne,
        hopOffset: +k.hopOffset.toFixed(3),
        wrongWay: k.wrongWay,
        drafting: k.drafting,
        shieldItem: k.shieldItem,
        item: k.item,
        itemRouletteTimer: +k.itemRouletteTimer.toFixed(3),
        incomingThreat: k.incomingThreat,
        hasCrown: k.hasCrown,
        emote: k.emote
          ? {
              id: k.emote.id,
              icon: k.emote.icon,
              timer: +k.emote.timer.toFixed(2),
            }
          : null,
        stats: { ...k.stats },
        lap: k.lap,
        progress: +k.progress.toFixed(4),
        rank: k.rank,
        finished: k.finished,
        finishTimeMs: k.finishTimeMs,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        type: p.type,
        x: +p.x.toFixed(3),
        y: +p.y.toFixed(3),
        z: +p.z.toFixed(3),
        yaw: +p.yaw.toFixed(4),
        ownerId: p.ownerId,
      })),
      explosions: this.explosions.map((e) => ({
        id: e.id,
        x: +e.x.toFixed(3),
        y: +e.y.toFixed(3),
        z: +e.z.toFixed(3),
        timer: +e.timer.toFixed(3),
        maxTimer: e.maxTimer,
        type: e.type,
      })),
      activeItemBoxes,
      events,
    };
  }
}

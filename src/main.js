import './ui/styles.css';
import { RACERS, TRACKS, RACE_CONFIG } from './shared/constants.js';
import { GameClient } from './net/gameClient.js';
import { SceneManager } from './gfx/sceneManager.js';
import { TouchController } from './ui/touchControls.js';
import { UIManager } from './ui/hudAndScreens.js';
import { SoundEngine } from './audio/soundEngine.js';

const STORAGE_KEYS = {
  NAME: 'pocketkart_player_name',
  RACER: 'pocketkart_racer_id',
  TRACK: 'pocketkart_track_id',
  STEER_MODE: 'pocketkart_steer_mode',
  MUTED: 'pocketkart_muted',
  MUSIC: 'pocketkart_music',
  GYRO: 'pocketkart_gyro',
  AUTO_ACCEL: 'pocketkart_auto_accel',
};

const GHOST_SAMPLE_INTERVAL_MS = 250;
const MAX_GHOST_FRAMES = 960; // Up to 4 minutes of 250ms samples
const VALID_RACER_IDS = new Set(RACERS.map((r) => r.id));
const VALID_TRACK_IDS = new Set(TRACKS.map((t) => t.id));

function readStorage(key, fallback) {
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage quota / private browsing restrictions
  }
}

function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function lerpAngle(a, b, t) {
  return wrapAngle(a + wrapAngle(b - a) * t);
}

function clampInt16(n) {
  const rounded = Math.round(Number(n) || 0);
  return Math.max(-32768, Math.min(32767, rounded));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64url) {
  const clean = String(b64url || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
  const binary = window.atob(clean + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Encodes a quantized ghost run into a compact URL-safe `#challenge=<header>.<frames>` token.
 * Spatial precision: 0.1u (Int16), Angular precision: 0.001 rad (Int16).
 */
function encodeGhostChallenge(run) {
  if (!run || !Array.isArray(run.frames) || run.frames.length < 2) {
    throw new Error('Course fantôme trop courte pour générer un défi.');
  }

  const headerObj = {
    v: 1,
    n: String(run.name || 'Pilote').slice(0, 14),
    r: VALID_RACER_IDS.has(run.racerId) ? run.racerId : 'red',
    k: VALID_TRACK_IDS.has(run.trackId) ? run.trackId : 'coco',
    t: Math.max(1, Math.round(Number(run.timeMs) || 0)),
    dt: run.intervalMs || GHOST_SAMPLE_INTERVAL_MS,
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const frameCount = Math.min(run.frames.length, MAX_GHOST_FRAMES);
  const frameBuf = new ArrayBuffer(frameCount * 8);
  const view = new DataView(frameBuf);

  for (let i = 0; i < frameCount; i++) {
    const f = run.frames[i];
    const offset = i * 8;
    view.setInt16(offset, clampInt16(f.x * 10), true);
    view.setInt16(offset + 2, clampInt16(f.y * 10), true);
    view.setInt16(offset + 4, clampInt16(f.z * 10), true);
    view.setInt16(offset + 6, clampInt16(wrapAngle(f.yaw || 0) * 1000), true);
  }

  return `${bytesToBase64Url(headerBytes)}.${bytesToBase64Url(new Uint8Array(frameBuf))}`;
}

/**
 * Decodes a `#challenge=<header>.<frames>` token into a playable 60fps interpolatable ghost object.
 */
function decodeGhostChallenge(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;

  try {
    const headerJson = new TextDecoder().decode(base64UrlToBytes(parts[0]));
    const header = JSON.parse(headerJson);
    if (!header || typeof header !== 'object') return null;

    const frameBytes = base64UrlToBytes(parts[1]);
    if (frameBytes.byteLength < 16 || frameBytes.byteLength % 8 !== 0) return null;

    const count = frameBytes.byteLength / 8;
    const view = new DataView(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength);
    const frames = new Array(count);

    for (let i = 0; i < count; i++) {
      const offset = i * 8;
      frames[i] = {
        x: view.getInt16(offset, true) / 10,
        y: view.getInt16(offset + 2, true) / 10,
        z: view.getInt16(offset + 4, true) / 10,
        yaw: view.getInt16(offset + 6, true) / 1000,
      };
    }

    const trackId = VALID_TRACK_IDS.has(header.k) ? header.k : 'coco';
    const racerId = VALID_RACER_IDS.has(header.r) ? header.r : 'aqua';
    const intervalMs = Math.max(50, Math.min(1000, Number(header.dt) || GHOST_SAMPLE_INTERVAL_MS));
    const timeMs = Math.max(
      intervalMs,
      Math.round(Number(header.t) || (count - 1) * intervalMs)
    );

    return {
      name: String(header.n || 'Fantôme').trim().slice(0, 14) || 'Fantôme',
      racerId,
      trackId,
      timeMs,
      intervalMs,
      frames,
    };
  } catch {
    return null;
  }
}

function interpolateGhostPose(ghost, raceTimeMs) {
  if (!ghost || !Array.isArray(ghost.frames) || ghost.frames.length === 0) {
    return null;
  }
  const frames = ghost.frames;
  const clampedMs = Math.max(0, Number(raceTimeMs) || 0);
  const exactIndex = clampedMs / (ghost.intervalMs || GHOST_SAMPLE_INTERVAL_MS);
  const maxIdx = frames.length - 1;

  if (exactIndex >= maxIdx) {
    const last = frames[maxIdx];
    return {
      x: last.x,
      y: last.y,
      z: last.z,
      yaw: last.yaw,
      racerId: ghost.racerId,
      name: ghost.name,
    };
  }

  const i0 = Math.max(0, Math.floor(exactIndex));
  const i1 = Math.min(maxIdx, i0 + 1);
  const alpha = exactIndex - i0;
  const f0 = frames[i0];
  const f1 = frames[i1];

  return {
    x: f0.x + (f1.x - f0.x) * alpha,
    y: f0.y + (f1.y - f0.y) * alpha,
    z: f0.z + (f1.z - f0.z) * alpha,
    yaw: lerpAngle(f0.yaw, f1.yaw, alpha),
    racerId: ghost.racerId,
    name: ghost.name,
  };
}

function getInitialRoomCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('room') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return raw.slice(0, 4);
  } catch {
    return '';
  }
}

function getGhostChallengeFromUrl() {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith('challenge=')) {
      const token = decodeURIComponent(hash.slice('challenge='.length));
      const parsed = decodeGhostChallenge(token);
      if (parsed) return parsed;
    }
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get('challenge');
    if (qToken) {
      return decodeGhostChallenge(qToken);
    }
  } catch {
    // Ignore malformed hash/query
  }
  return null;
}

function setRoomCodeInUrl(roomCode) {
  try {
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set('room', roomCode.toUpperCase());
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore history API restrictions
  }
}

function bootstrap() {
  const canvasContainer = document.getElementById('canvas-container');
  const uiRoot = document.getElementById('ui-root');

  if (!canvasContainer || !uiRoot) {
    throw new Error('Conteneurs DOM #canvas-container ou #ui-root introuvables.');
  }

  const defaultRacerFallback = RACERS[0]?.id || 'red';
  const defaultTrackFallback = TRACKS[0]?.id || 'coco';

  let currentPlayerName =
    (readStorage(STORAGE_KEYS.NAME, '') || 'Pilote').trim().slice(0, 14) || 'Pilote';
  let currentRacerId = readStorage(STORAGE_KEYS.RACER, defaultRacerFallback);
  if (!VALID_RACER_IDS.has(currentRacerId)) {
    currentRacerId = defaultRacerFallback;
  }

  let currentTrackId = readStorage(STORAGE_KEYS.TRACK, defaultTrackFallback);
  if (!VALID_TRACK_IDS.has(currentTrackId)) {
    currentTrackId = defaultTrackFallback;
  }

  let steerMode = readStorage(STORAGE_KEYS.STEER_MODE, 'joystick') === 'buttons' ? 'buttons' : 'joystick';
  let autoAccel = readStorage(STORAGE_KEYS.AUTO_ACCEL, 'true') !== 'false';
  const initialMuted = readStorage(STORAGE_KEYS.MUTED, 'false') === 'true';
  const initialMusic = readStorage(STORAGE_KEYS.MUSIC, 'true') !== 'false';
  const savedGyroPref = readStorage(STORAGE_KEYS.GYRO, 'false') === 'true';

  const prefillRoomCode = getInitialRoomCodeFromUrl();
  let activeGhost = getGhostChallengeFromUrl();
  if (activeGhost && VALID_TRACK_IDS.has(activeGhost.trackId)) {
    currentTrackId = activeGhost.trackId;
    writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
  }

  // Ghost Recorder state for local player's runs
  const ghostRecorder = {
    recording: false,
    trackId: currentTrackId,
    racerId: currentRacerId,
    name: currentPlayerName,
    nextSampleMs: 0,
    frames: [],
    completedRun: null,
    beatenAnnounced: false,
  };

  function resetGhostRecording(trackId, localKart) {
    ghostRecorder.recording = true;
    ghostRecorder.trackId = trackId || currentTrackId;
    ghostRecorder.racerId = localKart?.racerId || currentRacerId;
    ghostRecorder.name = localKart?.name || currentPlayerName;
    ghostRecorder.nextSampleMs = 0;
    ghostRecorder.frames = [];
    ghostRecorder.beatenAnnounced = false;

    if (localKart && Number.isFinite(localKart.x) && Number.isFinite(localKart.z)) {
      ghostRecorder.frames.push({
        x: localKart.x,
        y: localKart.y || 0,
        z: localKart.z,
        yaw: localKart.yaw || 0,
      });
      ghostRecorder.nextSampleMs = GHOST_SAMPLE_INTERVAL_MS;
    }
  }

  function stepGhostRecorder(state, localKart) {
    if (!state || !localKart) return;

    if (state.phase === 'countdown') {
      if (!ghostRecorder.recording || ghostRecorder.frames.length > 1) {
        resetGhostRecording(state.trackId || currentTrackId, localKart);
      } else if (ghostRecorder.frames.length === 0 && Number.isFinite(localKart.x)) {
        ghostRecorder.frames.push({
          x: localKart.x,
          y: localKart.y || 0,
          z: localKart.z,
          yaw: localKart.yaw || 0,
        });
        ghostRecorder.nextSampleMs = GHOST_SAMPLE_INTERVAL_MS;
      }
      return;
    }

    if (state.phase === 'racing' && ghostRecorder.recording) {
      const timeMs = Math.max(0, Number(state.raceTimeMs) || 0);
      if (
        !localKart.finished &&
        timeMs >= ghostRecorder.nextSampleMs &&
        ghostRecorder.frames.length < MAX_GHOST_FRAMES
      ) {
        ghostRecorder.frames.push({
          x: localKart.x,
          y: localKart.y || 0,
          z: localKart.z,
          yaw: localKart.yaw || 0,
        });
        ghostRecorder.nextSampleMs =
          Math.floor(timeMs / GHOST_SAMPLE_INTERVAL_MS + 1) * GHOST_SAMPLE_INTERVAL_MS;
      }

      if (localKart.finished) {
        finalizeGhostRecording(state, localKart);
      }
      return;
    }

    if (state.phase === 'finished' && ghostRecorder.recording) {
      finalizeGhostRecording(state, localKart);
    }
  }

  function finalizeGhostRecording(state, localKart) {
    if (!ghostRecorder.recording) return;
    ghostRecorder.recording = false;

    if (localKart && Number.isFinite(localKart.x) && ghostRecorder.frames.length < MAX_GHOST_FRAMES) {
      ghostRecorder.frames.push({
        x: localKart.x,
        y: localKart.y || 0,
        z: localKart.z,
        yaw: localKart.yaw || 0,
      });
    }

    const finalTimeMs = Math.max(
      1000,
      Math.round(Number(localKart?.finishTimeMs || state?.raceTimeMs || 0))
    );

    if (ghostRecorder.frames.length >= 2) {
      ghostRecorder.completedRun = {
        name: localKart?.name || ghostRecorder.name || currentPlayerName,
        racerId: localKart?.racerId || ghostRecorder.racerId || currentRacerId,
        trackId: state?.trackId || ghostRecorder.trackId || currentTrackId,
        timeMs: finalTimeMs,
        intervalMs: GHOST_SAMPLE_INTERVAL_MS,
        frames: ghostRecorder.frames.slice(),
      };
    }

    if (
      activeGhost &&
      !ghostRecorder.beatenAnnounced &&
      activeGhost.trackId === (state?.trackId || currentTrackId) &&
      finalTimeMs < activeGhost.timeMs &&
      ui
    ) {
      ghostRecorder.beatenAnnounced = true;
      ui.showToast(`🏆 Fantôme de ${activeGhost.name} battu ! Bien joué !`, 'success');
    }
  }

  // Initialize subsystems
  const sound = new SoundEngine();
  sound.setMuted(initialMuted);
  sound.setMusicEnabled(initialMusic);

  const sceneManager = new SceneManager(canvasContainer);
  sceneManager.setShowcaseRacer(currentRacerId);
  sceneManager.setShowcaseTrack(currentTrackId);

  const touchControls = new TouchController(uiRoot);
  touchControls.setSteerMode(steerMode);
  touchControls.setAutoAccel(autoAccel);
  touchControls.setEnabled(false);

  let ui = null;
  let gameClient = null;
  let lastMusicPhase = null;
  let lastMusicTrackId = null;

  function silenceEngine() {
    sound.updateEngine({
      speed: 0,
      maxSpeed: RACE_CONFIG.KART_MAX_SPEED || 42,
      drifting: false,
      active: false,
      shrunk: false,
      shrinkTimer: 0,
    });
  }

  function clearPauseState() {
    gameClient?.setPaused(false);
    sound.setPaused(false);
    ui?.setPaused(false, false);
  }

  function applySoloPause(paused) {
    const canPause = Boolean(
      gameClient &&
        gameClient.mode === 'solo' &&
        (gameClient.getState()?.phase === 'countdown' || gameClient.getState()?.phase === 'racing')
    );
    const nextPaused = canPause ? Boolean(paused) : false;

    gameClient?.setPaused(nextPaused);
    sound.setPaused(nextPaused);
    if (nextPaused) {
      silenceEngine();
    }
    ui?.setPaused(nextPaused, false);
    syncControlsVisibility(gameClient?.getState() || null);
    return nextPaused;
  }

  function syncMusicLifecycle(state, localKart) {
    const phase = state?.phase || 'home';
    const trackId = state?.trackId || currentTrackId;

    if (phase === 'racing' && !localKart?.finished) {
      if (lastMusicPhase !== 'racing' || lastMusicTrackId !== trackId) {
        sound.startMusic(trackId);
        lastMusicTrackId = trackId;
      }
      const isFinalLap = (localKart?.lap || 1) >= (RACE_CONFIG.TOTAL_LAPS || 3);
      sound.setFinalLap(isFinalLap);
    } else if (lastMusicPhase === 'racing') {
      sound.stopMusic();
    }

    lastMusicPhase = phase;
  }

  function syncControlsVisibility(state) {
    const isPaused = Boolean(state?.paused || gameClient?.isPaused());
    const isDrivingPhase = Boolean(
      state && !isPaused && (state.phase === 'countdown' || state.phase === 'racing')
    );
    touchControls.setEnabled(isDrivingPhase);
    return isDrivingPhase;
  }

  function returnToHome(clearUrlRoom = true) {
    clearPauseState();
    gameClient.leave();
    touchControls.setEnabled(false);
    silenceEngine();
    sound.stopMusic();
    lastMusicPhase = 'home';
    ghostRecorder.recording = false;

    sceneManager.setGhostState(null);
    sceneManager.setShowcaseRacer(currentRacerId);
    sceneManager.setShowcaseTrack(currentTrackId);

    if (clearUrlRoom) {
      setRoomCodeInUrl('');
    }
    if (ui) {
      ui.showHome({
        defaultName: currentPlayerName,
        defaultRacerId: currentRacerId,
        defaultTrackId: currentTrackId,
        defaultSteerMode: steerMode,
        prefillRoomCode: clearUrlRoom ? '' : getInitialRoomCodeFromUrl(),
        ghostChallengeInfo: activeGhost,
      });
    }
  }

  function handleEventHaptics(ev, localId) {
    if (!ev || !ev.type) return;
    const actorId = ev.targetId ?? ev.kartId ?? ev.playerId ?? null;
    const isLocal = !actorId || !localId || actorId === localId;

    switch (ev.type) {
      case 'rocket_start':
        if (isLocal) touchControls.vibrate([22, 24, 38]);
        break;
      case 'rocket_fail':
        if (isLocal) touchControls.vibrate([35, 30, 35]);
        break;
      case 'boost':
        if (isLocal && ev.source === 'draft') touchControls.vibrate([14, 18]);
        break;
      case 'stunt':
        if (isLocal) touchControls.vibrate(20);
        break;
      case 'shield_block':
        if (isLocal) touchControls.vibrate([20, 18, 28]);
        break;
      case 'respawn':
        if (isLocal) touchControls.vibrate([18, 24]);
        break;
      case 'hit':
        if (ev.targetId === localId || (!ev.targetId && isLocal)) {
          touchControls.vibrate([35, 25, 55]);
        }
        break;
      case 'explosion':
        touchControls.vibrate([45, 28, 65]);
        break;
      case 'lightning':
        touchControls.vibrate([28, 20, 42]);
        break;
      case 'fall':
        if (isLocal) touchControls.vibrate([30, 35, 45]);
        break;
      default:
        break;
    }
  }

  gameClient = new GameClient({
    onState: (state) => {
      if (!ui || !state) return;
      if (state.trackId && VALID_TRACK_IDS.has(state.trackId)) {
        sceneManager.setShowcaseTrack(state.trackId);
      }
      if (state.phase === 'finished' || state.phase === 'lobby') {
        clearPauseState();
      }
      syncControlsVisibility(state);
      ui.update(state);
    },
    onEvent: (ev) => {
      if (!ev) return;
      const state = gameClient.getState();
      const localId = state?.localId ?? null;
      sound.handleEvent(ev, localId);
      handleEventHaptics(ev, localId);
    },
    onError: (err) => {
      const msg = typeof err === 'string' ? err : err?.message || 'Erreur de connexion au salon.';
      const transportLost =
        gameClient.mode === 'online' &&
        !gameClient.ws &&
        !gameClient._p2pHost &&
        !gameClient._p2pGuest;
      if (transportLost) {
        returnToHome(false);
      }
      if (ui) {
        ui.showToast(msg, 'error');
      }
    },
  });

  // Unlock Web Audio (and non-prompt gyro if previously enabled) on first user interaction
  let audioUnlocked = false;
  let gyroAutoRestored = false;
  const unlockAudioOnGesture = () => {
    sound.unlock();
    audioUnlocked = true;
    if (
      savedGyroPref &&
      !gyroAutoRestored &&
      typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission !== 'function'
    ) {
      gyroAutoRestored = true;
      touchControls.setGyroEnabled(true).then((ok) => {
        ui?.setGyroEnabled?.(ok);
      });
    }
  };
  window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });
  window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });

  function syncPlayerPrefs(opts = {}) {
    if (typeof opts.playerName === 'string' && opts.playerName.trim()) {
      currentPlayerName = opts.playerName.trim().slice(0, 14);
      writeStorage(STORAGE_KEYS.NAME, currentPlayerName);
    }
    if (typeof opts.racerId === 'string' && VALID_RACER_IDS.has(opts.racerId)) {
      currentRacerId = opts.racerId;
      writeStorage(STORAGE_KEYS.RACER, currentRacerId);
      sceneManager.setShowcaseRacer(currentRacerId);
    }
    if (typeof opts.trackId === 'string' && VALID_TRACK_IDS.has(opts.trackId)) {
      currentTrackId = opts.trackId;
      writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      sceneManager.setShowcaseTrack(currentTrackId);
    }
  }

  ui = new UIManager(uiRoot, {
    onSelectRacer: (racerId) => {
      sound.unlock();
      if (racerId && VALID_RACER_IDS.has(racerId)) {
        currentRacerId = racerId;
        writeStorage(STORAGE_KEYS.RACER, currentRacerId);
        sceneManager.setShowcaseRacer(currentRacerId);
      }
    },

    onSelectTrack: (trackId) => {
      sound.unlock();
      if (trackId && VALID_TRACK_IDS.has(trackId)) {
        currentTrackId = trackId;
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
        sceneManager.setShowcaseTrack(currentTrackId);
        if (gameClient.mode) {
          gameClient.selectTrack(currentTrackId);
        }
      }
    },

    onSelectSteerMode: (mode) => {
      sound.unlock();
      const next = mode === 'buttons' ? 'buttons' : 'joystick';
      steerMode = next;
      touchControls.setSteerMode(next);
      writeStorage(STORAGE_KEYS.STEER_MODE, next);
      return next;
    },

    onQuickPlay: (payload = {}) => {
      sound.unlock();
      clearPauseState();
      syncPlayerPrefs(payload);
      const botCount = typeof payload.botCount === 'number' ? payload.botCount : 5;
      setRoomCodeInUrl('');
      try {
        gameClient.startSolo({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          trackId: currentTrackId,
          botCount,
        });
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de lancer la course solo.', 'error');
      }
    },

    onStartGhostChallenge: (payload = {}) => {
      sound.unlock();
      clearPauseState();
      if (activeGhost && VALID_TRACK_IDS.has(activeGhost.trackId)) {
        currentTrackId = activeGhost.trackId;
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      }
      syncPlayerPrefs({ ...payload, trackId: activeGhost?.trackId || payload.trackId });
      setRoomCodeInUrl('');
      try {
        gameClient.startSolo({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          trackId: currentTrackId,
          botCount: 5,
        });
        if (activeGhost) {
          ui.showToast(`👻 Défi lancé contre le fantôme de ${activeGhost.name} !`, 'info');
        }
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de lancer le défi fantôme.', 'error');
      }
    },

    onJoinPublic: async (payload = {}) => {
      sound.unlock();
      clearPauseState();
      syncPlayerPrefs(payload);
      try {
        const res = await gameClient.joinPublicMatch({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          trackId: currentTrackId,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          ui.showToast(`⚡ Partie publique rejointe (${res.roomCode}) !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de rejoindre une partie publique.', 'error');
      }
    },

    onCreateRoom: async (payload = {}) => {
      sound.unlock();
      clearPauseState();
      syncPlayerPrefs(payload);
      try {
        const res = await gameClient.createRoom({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          trackId: currentTrackId,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          ui.showToast(`Salon ${res.roomCode} créé !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de créer le salon multijoueur.', 'error');
      }
    },

    onJoinRoom: async (payloadOrCode, maybeName, maybeRacer) => {
      sound.unlock();
      clearPauseState();
      const payload =
        typeof payloadOrCode === 'string'
          ? { roomCode: payloadOrCode, playerName: maybeName, racerId: maybeRacer }
          : payloadOrCode || {};

      syncPlayerPrefs(payload);
      const roomCode = String(payload.roomCode || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4);

      if (roomCode.length < 4) {
        ui.showToast('Entre un code de salon à 4 lettres.', 'warning');
        return;
      }

      try {
        const res = await gameClient.joinRoom({
          roomCode,
          playerName: currentPlayerName,
          racerId: currentRacerId,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          ui.showToast(`Connecté au salon ${res.roomCode} !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || `Impossible de rejoindre le salon ${roomCode}.`, 'error');
      }
    },

    onSetBots: (botCount) => {
      const count = typeof botCount === 'object' ? botCount?.botCount : botCount;
      if (typeof count === 'number') {
        gameClient.setBotCount(count);
      }
    },

    onStartRace: () => {
      sound.unlock();
      clearPauseState();
      gameClient.startRace();
    },

    onRematch: () => {
      sound.unlock();
      clearPauseState();
      gameClient.requestRematch();
    },

    onRespawn: () => {
      sound.unlock();
      gameClient.requestRespawn();
    },

    onTogglePause: (paused) => {
      sound.unlock();
      const target = typeof paused === 'boolean' ? paused : !gameClient.isPaused();
      return applySoloPause(target);
    },

    onLeave: () => {
      returnToHome(true);
    },

    onSendEmote: (emoteId) => {
      sound.unlock();
      gameClient.sendEmote(emoteId);
    },

    onShareGhost: async (finishedState) => {
      const state = finishedState || gameClient.getState();
      const localKart = state?.karts?.find((k) => k.id === state.localId) || null;
      if (ghostRecorder.recording && state && localKart) {
        finalizeGhostRecording(state, localKart);
      }

      const run = ghostRecorder.completedRun;
      if (!run || run.frames.length < 2) {
        throw new Error('Termine une course complète pour partager ton fantôme !');
      }

      const token = encodeGhostChallenge(run);
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.delete('room');
      shareUrl.searchParams.delete('challenge');
      shareUrl.hash = `challenge=${token}`;
      return shareUrl.toString();
    },

    onToggleMute: (forcedState) => {
      sound.unlock();
      const nextMuted = typeof forcedState === 'boolean' ? forcedState : !sound.isMuted();
      sound.setMuted(nextMuted);
      writeStorage(STORAGE_KEYS.MUTED, nextMuted);
      return nextMuted;
    },

    onToggleMusic: (forcedState) => {
      sound.unlock();
      const nextMusic = typeof forcedState === 'boolean' ? forcedState : !sound.isMusicEnabled();
      sound.setMusicEnabled(nextMusic);
      writeStorage(STORAGE_KEYS.MUSIC, nextMusic);
      return nextMusic;
    },

    onToggleGyro: async (forcedState) => {
      sound.unlock();
      const wantGyro =
        typeof forcedState === 'boolean' ? forcedState : !touchControls.isGyroEnabled();
      const active = await touchControls.setGyroEnabled(wantGyro);
      gyroAutoRestored = true;
      writeStorage(STORAGE_KEYS.GYRO, active);
      if (wantGyro && !active) {
        ui.showToast('Capteur gyroscope indisponible ou refusé sur cet appareil.', 'warning');
      }
      return active;
    },

    onToggleAutoAccel: (forcedState) => {
      const nextAuto = typeof forcedState === 'boolean' ? forcedState : !autoAccel;
      autoAccel = nextAuto;
      touchControls.setAutoAccel(autoAccel);
      writeStorage(STORAGE_KEYS.AUTO_ACCEL, autoAccel);
      return autoAccel;
    },
  });

  // Sync initial UI toggle icons with actual subsystem states
  ui.setMuted(sound.isMuted());
  ui.setMusicEnabled(sound.isMusicEnabled());
  ui.setGyroEnabled(touchControls.isGyroEnabled());
  ui.setSteerMode(steerMode);
  ui.setAutoAccel(autoAccel);

  // Show Home screen initially
  ui.showHome({
    defaultName: currentPlayerName,
    defaultRacerId: currentRacerId,
    defaultTrackId: currentTrackId,
    defaultSteerMode: steerMode,
    prefillRoomCode,
    ghostChallengeInfo: activeGhost,
  });

  if (prefillRoomCode) {
    ui.showToast(`Salon ${prefillRoomCode} détecté — clique sur Rejoindre !`, 'info');
  } else if (activeGhost) {
    ui.showToast(`👻 Défi Fantôme de ${activeGhost.name} chargé !`, 'info');
  }

  // Support live pasting/opening of `#challenge=...` hash links in the same tab
  window.addEventListener('hashchange', () => {
    const incomingGhost = getGhostChallengeFromUrl();
    if (!incomingGhost) return;
    activeGhost = incomingGhost;
    if (VALID_TRACK_IDS.has(incomingGhost.trackId)) {
      currentTrackId = incomingGhost.trackId;
      writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      sceneManager.setShowcaseTrack(currentTrackId);
    }
    if (!gameClient.getState()) {
      ui.showHome({
        defaultName: currentPlayerName,
        defaultRacerId: currentRacerId,
        defaultTrackId: currentTrackId,
        defaultSteerMode: steerMode,
        prefillRoomCode: getInitialRoomCodeFromUrl(),
        ghostChallengeInfo: activeGhost,
      });
      ui.showToast(`👻 Défi Fantôme de ${activeGhost.name} prêt !`, 'info');
    }
  });

  // Auto-pause Solo & silence continuous engine synth when browser tab or phone screen hides
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      silenceEngine();
      const st = gameClient.getState();
      if (
        gameClient.mode === 'solo' &&
        st &&
        (st.phase === 'countdown' || st.phase === 'racing')
      ) {
        applySoloPause(true);
      }
    } else if (audioUnlocked) {
      sound.unlock();
    }
  });

  // Main 60fps Arcade Loop
  let lastTime = performance.now();

  function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    const preStepState = gameClient.getState();
    const controlsActive = syncControlsVisibility(preStepState);

    if (controlsActive) {
      const input = touchControls.pollInput();
      gameClient.sendInput(input);
    }

    const state = gameClient.step(dt) || gameClient.getState();
    syncControlsVisibility(state);

    if (state) {
      const isPaused = Boolean(state.paused || gameClient.isPaused());
      const localKart = state.karts?.find((k) => k.id === state.localId) || null;
      const raceTrackId = state.trackId || currentTrackId;

      // 1. Record local player's 250ms quantized ghost keyframes when not paused
      if (!isPaused) {
        stepGhostRecorder(state, localKart);
      }

      // 2. Interpolate active Ghost Challenge kart at 60fps when on matching track
      if (
        activeGhost &&
        activeGhost.trackId === raceTrackId &&
        (state.phase === 'countdown' || state.phase === 'racing' || state.phase === 'finished')
      ) {
        const ghostMs = state.phase === 'countdown' ? 0 : state.raceTimeMs;
        sceneManager.setGhostState(interpolateGhostPose(activeGhost, ghostMs));
      } else {
        sceneManager.setGhostState(null);
      }

      // 3. Update thumb-zone button visuals (including V3 trailing shield ring) & haptics
      if (typeof touchControls.updateVisualState === 'function') {
        touchControls.updateVisualState({
          driftCharge: localKart?.driftCharge || 0,
          item: localKart?.item ?? null,
          itemRouletteTimer: localKart?.itemRouletteTimer || 0,
          boosting: Boolean((localKart?.boostTimer || 0) > 0 || (localKart?.starTimer || 0) > 0),
          shieldItem: localKart?.shieldItem ?? null,
        });
      }

      // 4. Sync procedural background music & final-lap tempo boost
      syncMusicLifecycle(state, localKart);

      // 5. Update continuous kart engine purr (quieted when paused or hidden)
      const engineActive =
        !document.hidden &&
        !isPaused &&
        (state.phase === 'racing' || state.phase === 'countdown') &&
        Boolean(localKart && !localKart.finished);

      const countdownRevSpeed =
        state.phase === 'countdown' && (localKart?.rocketCharge || 0) > 0
          ? localKart.rocketCharge * 30
          : 0;

      sound.updateEngine({
        speed: Math.max(Math.abs(localKart?.speed || 0), countdownRevSpeed),
        maxSpeed: RACE_CONFIG.KART_MAX_SPEED || 42,
        drifting: Boolean(localKart?.drifting && state.phase === 'racing'),
        active: engineActive,
        shrunk: Boolean((localKart?.shrinkTimer || 0) > 0),
        shrinkTimer: localKart?.shrinkTimer || 0,
      });

      // 6. Render 3D world, karts, trailing shields, slipstream & corner look-ahead camera
      sceneManager.update(state, state.localId, isPaused ? 0.0005 : dt);
    } else {
      sceneManager.setGhostState(null);
      silenceEngine();
      sceneManager.update(null, null, dt);
    }

    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    sound.stopMusic();
    gameClient.leave();
    sceneManager.dispose();
  });
}

bootstrap();

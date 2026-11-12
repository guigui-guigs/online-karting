import './ui/styles.css';
import {
  RACERS,
  TRACKS,
  RACE_CONFIG,
  KARTS,
  BOOST_STYLES,
  CUPS,
  CC_CLASSES,
  GAME_FORMATS,
  GP_POINTS,
  MIRROR_UNLOCK_LEVEL,
} from './shared/constants.js';
import { getBaseTrackId, getTrackKey, isArenaTrack } from './shared/trackData.js';
import {
  loadProfile,
  saveProfile,
  purchaseKartWithCoins,
  purchaseBoostWithCoins,
  recordMatchResult,
  recordGrandPrixResult,
  isCcUnlocked,
  isMirrorUnlocked,
} from './shared/progression.js';
import {
  encodeGhostChallenge,
  decodeGhostChallenge,
  interpolateGhostPose,
  GHOST_SAMPLE_INTERVAL_MS,
  MAX_GHOST_FRAMES,
} from './shared/ghostCodec.js';
import { AuthAndSocialManager, isRacerUnlocked } from './net/authAndSocialService.js';
import { AuthSocialOverlay } from './ui/authSocialOverlay.js';
import { GameClient } from './net/gameClient.js';
import { SceneManager } from './gfx/sceneManager.js';
import { TouchController } from './ui/touchControls.js';
import { UIManager } from './ui/hudAndScreens.js';
import { SoundEngine } from './audio/soundEngine.js';
import { getDeviceMode, isMobileMode, onDeviceModeChange } from './ui/deviceMode.js';

const STORAGE_KEYS = {
  NAME: 'pocketkart_player_name',
  RACER: 'pocketkart_racer_id',
  TRACK: 'pocketkart_track_id',
  STEER_MODE: 'pocketkart_steer_mode',
  MUTED: 'pocketkart_muted',
  MUSIC: 'pocketkart_music',
  GYRO: 'pocketkart_gyro',
  GYRO_SENS: 'pocketkart_gyro_sens',
  GYRO_INVERT: 'pocketkart_gyro_invert',
  HAPTICS: 'pocketkart_haptics',
  AUTO_ACCEL: 'pocketkart_auto_accel',
  AUTO_ACCEL_PC: 'pocketkart_auto_accel_pc',
  QUALITY: 'pocketkart_quality',
};

const VALID_RACER_IDS = new Set(RACERS.map((r) => r.id));
const VALID_TRACK_IDS = new Set(TRACKS.map((t) => t.id));
const VALID_QUALITY_TIERS = new Set(['auto', 'ultra', 'balanced', 'low']);

function isValidTrackAny(trackId) {
  return Boolean(trackId) && (isArenaTrack(trackId) || VALID_TRACK_IDS.has(getBaseTrackId(trackId)));
}

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
  const savedInitialRacerId = currentRacerId;
  if (!isRacerUnlocked(currentRacerId, { isAuthenticated: false, level: 1 })) {
    currentRacerId = defaultRacerFallback;
  }

  let profile = loadProfile();
  let selectedFormat = 'race';
  let selectedCupId = CUPS[0]?.id || 'sun';
  let selectedCc = isCcUnlocked(profile, '100cc') ? '100cc' : '50cc';
  let mirrorMode = false;
  let gpSession = null;

  let currentTrackId = getBaseTrackId(readStorage(STORAGE_KEYS.TRACK, defaultTrackFallback));
  if (!VALID_TRACK_IDS.has(currentTrackId)) {
    currentTrackId = defaultTrackFallback;
  }

  const readAutoAccelForMode = (mode) => {
    if (mode === 'mobile') {
      return readStorage(STORAGE_KEYS.AUTO_ACCEL, 'true') !== 'false';
    }
    return readStorage(STORAGE_KEYS.AUTO_ACCEL_PC, 'false') === 'true';
  };

  let deviceMode = getDeviceMode();
  let steerMode = readStorage(STORAGE_KEYS.STEER_MODE, 'joystick') === 'buttons' ? 'buttons' : 'joystick';
  let autoAccel = readAutoAccelForMode(deviceMode);
  const initialMuted = readStorage(STORAGE_KEYS.MUTED, 'false') === 'true';
  const initialMusic = readStorage(STORAGE_KEYS.MUSIC, 'true') !== 'false';
  let savedGyroPref = readStorage(STORAGE_KEYS.GYRO, 'false') === 'true';
  const initialGyroSens = readStorage(STORAGE_KEYS.GYRO_SENS, 'normal');
  const initialGyroInvert = readStorage(STORAGE_KEYS.GYRO_INVERT, 'false') === 'true';
  const initialHaptics = readStorage(STORAGE_KEYS.HAPTICS, 'true') !== 'false';
  let qualityMode = readStorage(STORAGE_KEYS.QUALITY, 'auto');
  if (!VALID_QUALITY_TIERS.has(qualityMode)) {
    qualityMode = 'auto';
  }

  const prefillRoomCode = getInitialRoomCodeFromUrl();
  let activeGhost = getGhostChallengeFromUrl();
  if (activeGhost && isValidTrackAny(activeGhost.trackId) && !isArenaTrack(activeGhost.trackId)) {
    currentTrackId = getBaseTrackId(activeGhost.trackId);
    mirrorMode = Boolean(activeGhost.trackId.endsWith('__mirror'));
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

    if (
      localKart &&
      Number.isFinite(localKart.x) &&
      Number.isFinite(localKart.z) &&
      ghostRecorder.frames.length < MAX_GHOST_FRAMES
    ) {
      ghostRecorder.frames.push({
        x: localKart.x,
        y: Number.isFinite(localKart.y) ? localKart.y : 0,
        z: localKart.z,
        yaw: Number.isFinite(localKart.yaw) ? localKart.yaw : 0,
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

  function getEffectiveTrackId(baseOverride = currentTrackId) {
    if (selectedFormat === 'balloon') return 'arena';
    return getTrackKey(getBaseTrackId(baseOverride), mirrorMode);
  }

  function refreshShowcase() {
    sceneManager.setShowcaseRacer(currentRacerId, profile.selectedKart, profile.selectedBoost);
    const showcaseTrack =
      selectedFormat === 'grandprix'
        ? getTrackKey(CUPS.find((c) => c.id === selectedCupId)?.tracks[0] || currentTrackId, mirrorMode)
        : getEffectiveTrackId();
    sceneManager.setShowcaseTrack(showcaseTrack);
  }

  const sceneManager = new SceneManager(canvasContainer);
  const appliedQuality = sceneManager.setQualityTier?.(qualityMode);
  if (typeof appliedQuality === 'string' && VALID_QUALITY_TIERS.has(appliedQuality)) {
    qualityMode = appliedQuality;
  }
  refreshShowcase();

  const touchControls = new TouchController(uiRoot);
  touchControls.setDeviceMode(deviceMode);
  touchControls.setSteerMode(steerMode);
  touchControls.setAutoAccel(autoAccel);
  touchControls.setGyroSensitivity(initialGyroSens);
  touchControls.setGyroInvert(initialGyroInvert);
  touchControls.setHapticsEnabled(initialHaptics);
  touchControls.setEnabled(false);

  let ui = null;
  let authService = null;
  let authOverlay = null;
  let gameClient = null;
  let lastMusicPhase = null;
  let lastMusicTrackId = null;
  let lastHandledFinishedRaceKey = null;
  let raceFinishSeq = 0;
  let lastObservedPhase = 'home';
  let prevDriftCharge = 0;
  let prevRaceRank = null;
  let prevRaceTimeMs = 0;
  let lastGamepadConnected = false;
  let bootLoaderDismissed = false;

  function dismissBootLoader() {
    if (bootLoaderDismissed) return;
    bootLoaderDismissed = true;
    const loader = document.getElementById('pk-boot-loader');
    if (!loader) return;
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
    window.setTimeout(() => {
      loader.remove();
    }, 420);
  }

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
    const isBalloon = state?.gameFormat === 'balloon' || isArenaTrack(trackId);
    const isMenuPhase = phase === 'home' || phase === 'lobby' || phase === 'finished';

    if (phase === 'racing' && !localKart?.finished && !localKart?.eliminated) {
      if (lastMusicPhase !== 'racing' || lastMusicTrackId !== trackId) {
        sound.stopMenuMusic?.();
        sound.startMusic(trackId);
        lastMusicTrackId = trackId;
      }
      const isFinalLap = !isBalloon && (localKart?.lap || 1) >= (RACE_CONFIG.TOTAL_LAPS || 3);
      sound.setFinalLap(isFinalLap);
    } else if (isMenuPhase) {
      if (lastMusicPhase === 'racing') {
        sound.stopMusic();
      }
      if (
        lastMusicPhase === null ||
        (lastMusicPhase !== 'home' && lastMusicPhase !== 'lobby' && lastMusicPhase !== 'finished')
      ) {
        sound.startMenuMusic?.();
      }
    } else {
      if (lastMusicPhase === 'racing') {
        sound.stopMusic();
      }
      if (
        lastMusicPhase === null ||
        lastMusicPhase === 'home' ||
        lastMusicPhase === 'lobby' ||
        lastMusicPhase === 'finished'
      ) {
        sound.stopMenuMusic?.();
      }
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
    sound.startMenuMusic?.();
    lastMusicPhase = 'home';
    lastObservedPhase = 'home';
    lastHandledFinishedRaceKey = null;
    prevDriftCharge = 0;
    prevRaceRank = null;
    prevRaceTimeMs = 0;
    ghostRecorder.recording = false;
    gpSession = null;

    sceneManager.setGhostState(null);
    sceneManager.setMenuViewMode('paddock');
    refreshShowcase();
    authService?.setActiveRoomCode(null);
    authOverlay?.renderPodiumBanner(ui?.getPodiumAuthSlot?.(), null);
    authOverlay?.setBarVisible(true);

    if (clearUrlRoom) {
      setRoomCodeInUrl('');
    }
    if (ui) {
      ui.setProgressionResult(null, null);
      ui.setProfile(profile);
      ui.setFormatState({
        format: selectedFormat,
        cupId: selectedCupId,
        cc: selectedCc,
        mirror: mirrorMode,
      });
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

  authService = new AuthAndSocialManager({
    onNotice: (msg, type = 'info') => {
      ui?.showToast?.(msg, type);
    },
    onProfileUpdated: (supaProfile, { isInitial } = {}) => {
      if (!supaProfile) return;
      if (supaProfile.display_name) {
        currentPlayerName = supaProfile.display_name.slice(0, 14);
        writeStorage(STORAGE_KEYS.NAME, currentPlayerName);
      }

      const unlockedSet = new Set(authService.getSnapshot().unlockedRacers);
      const preferredRacer = isInitial
        ? (unlockedSet.has(savedInitialRacerId) ? savedInitialRacerId : supaProfile.favorite_racer)
        : supaProfile.favorite_racer;

      if (preferredRacer && VALID_RACER_IDS.has(preferredRacer) && unlockedSet.has(preferredRacer)) {
        currentRacerId = preferredRacer;
        writeStorage(STORAGE_KEYS.RACER, currentRacerId);
        refreshShowcase();
      }

      if (!gameClient?.getState() && ui) {
        ui.setProfile(profile);
        ui.setFormatState({
          format: selectedFormat,
          cupId: selectedCupId,
          cc: selectedCc,
          mirror: mirrorMode,
        });
        ui.showHome({
          defaultName: currentPlayerName,
          defaultRacerId: currentRacerId,
          defaultTrackId: currentTrackId,
          defaultSteerMode: steerMode,
          prefillRoomCode: getInitialRoomCodeFromUrl(),
          ghostChallengeInfo: activeGhost,
        });
      }
    },
  });

  async function handleFinishedRaceState(state) {
    const trackId = state.trackId || getEffectiveTrackId();
    const raceFinishKey = `${state.roomCode || gameClient.mode || 'solo'}|${trackId}|${raceFinishSeq}`;
    if (raceFinishKey === lastHandledFinishedRaceKey) {
      return;
    }
    lastHandledFinishedRaceKey = raceFinishKey;

    const localKart = state.karts?.find((k) => k.id === state.localId) || null;
    if (ghostRecorder.recording) {
      finalizeGhostRecording(state, localKart);
    }

    let ghostToken = null;
    if (
      !isArenaTrack(trackId) &&
      ghostRecorder.completedRun &&
      ghostRecorder.completedRun.trackId === trackId &&
      ghostRecorder.completedRun.frames?.length >= 2
    ) {
      ghostToken = encodeGhostChallenge(ghostRecorder.completedRun);
    }

    const finishTimeMs =
      Number(localKart?.finishTimeMs) ||
      (localKart?.finished ? Math.round(Number(state.raceTimeMs) || 0) : 0);
    const rank = Number(localKart?.rank) || 1;
    const gameFormat = state.gameFormat || 'race';
    const cc = state.cc || selectedCc || '100cc';
    const awardsMap = ui?.getLastAwardsMap?.();
    const trophiesCount = awardsMap && localKart && awardsMap.has(localKart.id) ? 1 : 0;
    const isOnline =
      gameClient.mode === 'online' || Boolean(state.roomCode && state.roomCode !== 'SOLO');
    const mode = state.format || (isOnline ? 'online' : 'solo');

    const rewardRes = recordMatchResult(profile, {
      format: gameFormat,
      cc,
      rank,
      totalPlayers: state.karts?.length || 6,
      coinsCollected: localKart?.stats?.coinsCollected ?? localKart?.coins ?? 0,
      drifts: localKart?.stats?.driftsBoosted || 0,
      itemsHit: localKart?.stats?.hitsDealt || 0,
      battleScore: localKart?.battleScore || 0,
      balloonsLeft: localKart?.balloons ?? 0,
      eliminated: Boolean(localKart?.eliminated),
      trackId,
      finishTimeMs,
      ghostToken,
      isOnline,
    });
    profile = rewardRes.profile;

    let gpViewState = null;
    if (gpSession && gameClient.mode === 'solo' && gameFormat === 'grandprix') {
      if (gpSession.lastScoredIndex !== gpSession.raceIndex) {
        gpSession.lastScoredIndex = gpSession.raceIndex;
        for (const k of state.karts || []) {
          const pts = GP_POINTS[Math.max(0, (k.rank || 6) - 1)] || 0;
          const key = k.id === state.localId ? 'LOCAL' : k.racerId || k.id;
          const prev = gpSession.standings.get(key) || {
            id: key,
            name: k.name || k.racerId,
            racerId: k.racerId || 'red',
            isLocal: k.id === state.localId,
            points: 0,
            lastAdded: 0,
          };
          prev.name = k.name || prev.name;
          prev.racerId = k.racerId || prev.racerId;
          prev.points += pts;
          prev.lastAdded = pts;
          gpSession.standings.set(key, prev);
        }
      }

      const standings = [...gpSession.standings.values()].sort(
        (a, b) => b.points - a.points || (a.isLocal ? -1 : 1)
      );
      const isFinalRace = gpSession.raceIndex >= gpSession.tracks.length - 1;
      let gpRes = null;
      if (isFinalRace) {
        const localIdx = Math.max(
          0,
          standings.findIndex((s) => s.isLocal)
        );
        const localEntry = standings[localIdx];
        gpRes = recordGrandPrixResult(profile, {
          cupId: gpSession.cupId,
          cc: gpSession.cc,
          mirror: gpSession.mirror,
          position: localIdx + 1,
          totalPoints: localEntry?.points || 0,
          maxPoints: gpSession.tracks.length * (GP_POINTS[0] || 15),
        });
        profile = gpRes.profile;
      }

      gpViewState = {
        cupName: gpSession.cupName,
        raceIndex: gpSession.raceIndex,
        totalRaces: gpSession.tracks.length,
        isFinalRace,
        standings,
        gpRes,
      };
    }

    ui?.setProfile?.(profile);
    ui?.setProgressionResult?.(rewardRes, gpViewState);
    if (
      rewardRes.leveledUp ||
      (rewardRes.newUnlocks && rewardRes.newUnlocks.length > 0) ||
      gpViewState?.gpRes?.trophy
    ) {
      sound.playLevelUpFanfare();
    }

    const authTrackId = isArenaTrack(trackId) ? 'coco' : getBaseTrackId(trackId);
    const outcome = await authService.recordFinishedRace({
      raceKey: raceFinishKey,
      mode,
      trackId: authTrackId,
      finishTimeMs,
      rank,
      trophiesCount,
      isOnline,
      racerId: localKart?.racerId || currentRacerId,
      kartId: localKart?.kartId || profile.selectedKart || 'classic',
      ghostToken,
    });

    if (gameClient.getState()?.phase === 'finished') {
      authOverlay?.renderPodiumBanner(ui?.getPodiumAuthSlot?.(), outcome);
    }
  }

  gameClient = new GameClient({
    onState: (state) => {
      try {
        if (!ui || !state) return;
        if (state.trackId && isValidTrackAny(state.trackId)) {
          sceneManager.setShowcaseTrack(state.trackId);
        }
        if (state.phase === 'finished' || state.phase === 'lobby') {
          clearPauseState();
        }

        if (
          (state.phase === 'countdown' || state.phase === 'racing') &&
          lastObservedPhase !== 'countdown' &&
          lastObservedPhase !== 'racing'
        ) {
          raceFinishSeq += 1;
          lastHandledFinishedRaceKey = null;
          if (touchControls.isGyroEnabled()) {
            touchControls.recalibrateGyro({ silent: true });
          }
          ui?.setProgressionResult?.(
            null,
            gpSession && state.gameFormat === 'grandprix'
              ? {
                  cupName: gpSession.cupName,
                  raceIndex: gpSession.raceIndex,
                  totalRaces: gpSession.tracks.length,
                  isFinalRace: false,
                  standings: [],
                }
              : null
          );
          authOverlay?.renderPodiumBanner(ui?.getPodiumAuthSlot?.(), null);
        }
        lastObservedPhase = state.phase || 'home';

        authOverlay?.setBarVisible(state.phase === 'lobby' || state.phase === 'finished');
        syncControlsVisibility(state);
        ui.update(state);

        if (state.phase === 'finished') {
          handleFinishedRaceState(state).catch((err) => {
            console.warn('[PocketKart Auth] Failed to record race outcome:', err?.message || err);
          });
        }
      } catch (err) {
        console.error('[PocketKart] Callback error:', err);
      }
    },
    onEvent: (ev) => {
      try {
        if (!ev) return;
        const state = gameClient.getState();
        const localId = state?.localId ?? null;
        sound.handleEvent(ev, localId);
        handleEventHaptics(ev, localId);
        ui?.pushRaceEvent?.(ev, state, localId);
        sceneManager.handleEvent?.(ev, state, localId);
      } catch (err) {
        console.error('[PocketKart] Callback error:', err);
      }
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

  // Unlock Web Audio (and non-prompt gyro if previously enabled) on user interaction
  let audioUnlocked = false;
  let gyroAutoRestored = false;
  let gestureListenersBound = true;

  const tryRestoreSavedGyroOnClick = () => {
    if (
      isMobileMode() &&
      savedGyroPref &&
      !gyroAutoRestored &&
      !touchControls.isGyroEnabled() &&
      typeof window.DeviceOrientationEvent !== 'undefined'
    ) {
      gyroAutoRestored = true;
      touchControls.setGyroEnabled(true).then((ok) => {
        ui?.setGyroEnabled?.(ok);
      });
    }
  };

  const unlockAudioOnGesture = () => {
    sound.unlock();
    const isCtxRunning = sound.ctx?.state === 'running';
    if (isCtxRunning) {
      audioUnlocked = true;
    }
    const phase = gameClient?.getState()?.phase || 'home';
    if (phase === 'home' || phase === 'lobby' || phase === 'finished') {
      sound.startMenuMusic?.();
    }
    if (
      isMobileMode() &&
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
    const gyroDone =
      gyroAutoRestored ||
      !savedGyroPref ||
      !isMobileMode() ||
      typeof window.DeviceOrientationEvent?.requestPermission === 'function';
    if (isCtxRunning && gyroDone && gestureListenersBound) {
      gestureListenersBound = false;
      window.removeEventListener('pointerdown', unlockAudioOnGesture);
      window.removeEventListener('touchstart', unlockAudioOnGesture);
      window.removeEventListener('keydown', unlockAudioOnGesture);
    }
  };
  window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });
  window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });

  function syncPlayerPrefs(opts = {}) {
    if (typeof opts.playerName === 'string' && opts.playerName.trim()) {
      currentPlayerName = opts.playerName.trim().slice(0, 14);
      writeStorage(STORAGE_KEYS.NAME, currentPlayerName);
      if (
        authService?.isAuthenticated() &&
        authService.getSnapshot().profile?.display_name !== currentPlayerName
      ) {
        authService.updateDisplayName(currentPlayerName).catch(() => {});
      }
    }
    if (typeof opts.racerId === 'string' && VALID_RACER_IDS.has(opts.racerId)) {
      const snap = authService?.getSnapshot();
      const canUseRacer = isRacerUnlocked(opts.racerId, {
        isAuthenticated: Boolean(authService?.isAuthenticated()),
        level: snap?.levelInfo?.level || 1,
      });
      if (canUseRacer) {
        currentRacerId = opts.racerId;
        writeStorage(STORAGE_KEYS.RACER, currentRacerId);
      }
    }
    if (typeof opts.trackId === 'string' && !isArenaTrack(opts.trackId)) {
      const baseId = getBaseTrackId(opts.trackId);
      if (VALID_TRACK_IDS.has(baseId)) {
        currentTrackId = baseId;
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      }
    }
    if (typeof opts.gameFormat === 'string' && GAME_FORMATS.some((f) => f.id === opts.gameFormat)) {
      selectedFormat = opts.gameFormat;
    }
    if (typeof opts.cupId === 'string' && CUPS.some((c) => c.id === opts.cupId)) {
      selectedCupId = opts.cupId;
    }
    if (typeof opts.cc === 'string' && isCcUnlocked(profile, opts.cc)) {
      selectedCc = opts.cc;
    }
    if (typeof opts.mirror === 'boolean' && (!opts.mirror || isMirrorUnlocked(profile))) {
      mirrorMode = opts.mirror;
    }
    refreshShowcase();
  }

  function startSoloGpStage(cup, raceIndex) {
    const trackKey = getTrackKey(cup.tracks[raceIndex], gpSession.mirror);
    gameClient.startSolo({
      playerName: currentPlayerName,
      racerId: currentRacerId,
      kartId: profile.selectedKart,
      boostColorId: profile.selectedBoost,
      trackId: trackKey,
      gameFormat: 'grandprix',
      cc: gpSession.cc,
      mirror: gpSession.mirror,
      botCount: 5,
    });
  }

  ui = new UIManager(uiRoot, {
    onSelectRacer: (racerId) => {
      sound.unlock();
      if (racerId && VALID_RACER_IDS.has(racerId)) {
        const snap = authService?.getSnapshot();
        const canUseRacer = isRacerUnlocked(racerId, {
          isAuthenticated: Boolean(authService?.isAuthenticated()),
          level: snap?.levelInfo?.level || 1,
        });
        if (!canUseRacer) return;
        currentRacerId = racerId;
        writeStorage(STORAGE_KEYS.RACER, currentRacerId);
        refreshShowcase();
        authService?.updateFavoriteRacer(racerId);
      }
    },

    onLockedRacerClick: (racer) => {
      sound.unlock();
      authOverlay?.openAuthModal({ reason: 'locked_racer', racer });
    },

    onSelectTrack: (trackId) => {
      sound.unlock();
      if (isArenaTrack(trackId)) {
        if (gameClient.mode) {
          gameClient.selectTrack('arena');
        }
        return;
      }
      const baseId = getBaseTrackId(trackId);
      if (baseId && VALID_TRACK_IDS.has(baseId)) {
        currentTrackId = baseId;
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
        refreshShowcase();
        if (gameClient.mode) {
          gameClient.selectTrack(getTrackKey(currentTrackId, gameClient.getState()?.mirror ?? mirrorMode));
        }
      }
    },

    onSelectKart: (kartId) => {
      sound.unlock();
      if (!profile.unlockedKarts.includes(kartId)) return;
      profile.selectedKart = kartId;
      saveProfile(profile);
      ui.setProfile(profile);
      refreshShowcase();
      if (gameClient.mode) {
        gameClient.updateLoadout({
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
        });
      }
    },

    onBuyKart: (kartId) => {
      sound.unlock();
      const res = purchaseKartWithCoins(profile, kartId);
      if (!res.ok) {
        ui.showToast(`🪙 ${res.reason || 'Pièces insuffisantes !'}`, 'warning');
        return;
      }
      profile = res.profile;
      profile.selectedKart = kartId;
      saveProfile(profile);
      sound.playLevelUpFanfare();
      ui.setProfile(profile);
      refreshShowcase();
      const kMeta = KARTS.find((k) => k.id === kartId);
      ui.showToast(`🏎️ ${kMeta?.name || 'Kart'} acheté et équipé !`, 'success');
    },

    onSelectBoost: (boostId) => {
      sound.unlock();
      if (!profile.unlockedBoosts.includes(boostId)) return;
      profile.selectedBoost = boostId;
      saveProfile(profile);
      ui.setProfile(profile);
      refreshShowcase();
      if (gameClient.mode) {
        gameClient.updateLoadout({
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
        });
      }
    },

    onBuyBoost: (boostId) => {
      sound.unlock();
      const res = purchaseBoostWithCoins(profile, boostId);
      if (!res.ok) {
        ui.showToast(`🪙 ${res.reason || 'Pièces insuffisantes !'}`, 'warning');
        return;
      }
      profile = res.profile;
      profile.selectedBoost = boostId;
      saveProfile(profile);
      sound.playLevelUpFanfare();
      ui.setProfile(profile);
      refreshShowcase();
      const bMeta = BOOST_STYLES.find((b) => b.id === boostId);
      ui.showToast(`✨ Boost ${bMeta?.name || ''} acheté et équipé !`, 'success');
    },

    onSelectFormat: (fmtId) => {
      sound.unlock();
      if (!GAME_FORMATS.some((f) => f.id === fmtId)) return;
      selectedFormat = fmtId;
      ui.setFormatState({ format: selectedFormat });
      refreshShowcase();
    },

    onSelectCup: (cupId) => {
      sound.unlock();
      const cup = CUPS.find((c) => c.id === cupId);
      if (!cup) return;
      selectedCupId = cup.id;
      ui.setFormatState({ cupId: selectedCupId });
      sceneManager.setShowcaseTrack(getTrackKey(cup.tracks[0], mirrorMode));
    },

    onSelectCc: (ccId) => {
      sound.unlock();
      const ccMeta = CC_CLASSES[ccId];
      if (!ccMeta) return;
      if (!isCcUnlocked(profile, ccId)) {
        ui.showToast(`🔒 ${ccMeta.label} débloqué au niveau ${ccMeta.unlockLevel} !`, 'warning');
        return;
      }
      selectedCc = ccId;
      ui.setFormatState({ cc: selectedCc });
    },

    onToggleMirror: () => {
      sound.unlock();
      if (!isMirrorUnlocked(profile)) {
        ui.showToast(
          `🔒 Mode Miroir débloqué au niveau ${MIRROR_UNLOCK_LEVEL} (ou Coupe 150cc Or) !`,
          'warning'
        );
        return;
      }
      mirrorMode = !mirrorMode;
      ui.setFormatState({ mirror: mirrorMode });
      refreshShowcase();
    },

    onLobbyOptionsChange: (opts = {}) => {
      sound.unlock();
      gameClient.setRoomOptions(opts);
    },

    onLoadoutChange: ({ kartId, boostColorId } = {}) => {
      sound.unlock();
      if (kartId && profile.unlockedKarts.includes(kartId)) {
        profile.selectedKart = kartId;
      }
      if (boostColorId && profile.unlockedBoosts.includes(boostColorId)) {
        profile.selectedBoost = boostColorId;
      }
      saveProfile(profile);
      ui.setProfile(profile);
      refreshShowcase();
      if (gameClient.mode) {
        gameClient.updateLoadout({
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
        });
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
      tryRestoreSavedGyroOnClick();
      clearPauseState();
      syncPlayerPrefs(payload);
      setRoomCodeInUrl('');
      authService?.setActiveRoomCode(null);
      authOverlay?.setBarVisible(false);
      gpSession = null;

      try {
        if (selectedFormat === 'grandprix') {
          const cup = CUPS.find((c) => c.id === selectedCupId) || CUPS[0];
          gpSession = {
            cupId: cup.id,
            cupName: cup.name,
            tracks: [...cup.tracks],
            raceIndex: 0,
            cc: selectedCc,
            mirror: mirrorMode,
            standings: new Map(),
            lastScoredIndex: -1,
          };
          startSoloGpStage(cup, 0);
          return;
        }

        if (selectedFormat === 'balloon') {
          gameClient.startSolo({
            playerName: currentPlayerName,
            racerId: currentRacerId,
            kartId: profile.selectedKart,
            boostColorId: profile.selectedBoost,
            trackId: 'arena',
            gameFormat: 'balloon',
            cc: selectedCc,
            mirror: false,
            botCount: 5,
          });
          return;
        }

        const effTrack = getTrackKey(currentTrackId, mirrorMode);
        if (selectedFormat === 'timetrial') {
          if (
            (!activeGhost || activeGhost.trackId !== effTrack) &&
            profile.timeTrials?.[effTrack]?.ghostToken
          ) {
            const pbGhost = decodeGhostChallenge(profile.timeTrials[effTrack].ghostToken);
            if (pbGhost) {
              activeGhost = pbGhost;
            }
          }
          gameClient.startSolo({
            playerName: currentPlayerName,
            racerId: currentRacerId,
            kartId: profile.selectedKart,
            boostColorId: profile.selectedBoost,
            trackId: effTrack,
            gameFormat: 'timetrial',
            cc: selectedCc,
            mirror: mirrorMode,
            botCount: 0,
          });
          return;
        }

        const botCount = typeof payload.botCount === 'number' ? payload.botCount : 5;
        gameClient.startSolo({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
          trackId: effTrack,
          gameFormat: selectedFormat,
          cc: selectedCc,
          mirror: mirrorMode,
          botCount,
        });
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de lancer la course solo.', 'error');
      }
    },

    onNextGpRace: () => {
      sound.unlock();
      clearPauseState();
      if (!gpSession || gpSession.raceIndex + 1 >= gpSession.tracks.length) return;
      gpSession.raceIndex += 1;
      const cup = CUPS.find((c) => c.id === gpSession.cupId) || CUPS[0];
      startSoloGpStage(cup, gpSession.raceIndex);
    },

    onStartGhostChallenge: (payload = {}) => {
      sound.unlock();
      clearPauseState();
      gpSession = null;
      const ghostTrack = activeGhost?.trackId || payload.trackId;
      if (ghostTrack && isValidTrackAny(ghostTrack) && !isArenaTrack(ghostTrack)) {
        currentTrackId = getBaseTrackId(ghostTrack);
        mirrorMode = Boolean(ghostTrack.endsWith('__mirror'));
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      }
      syncPlayerPrefs({ ...payload, trackId: currentTrackId, mirror: mirrorMode });
      setRoomCodeInUrl('');
      authService?.setActiveRoomCode(null);
      authOverlay?.setBarVisible(false);
      try {
        gameClient.startSolo({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
          trackId: getTrackKey(currentTrackId, mirrorMode),
          gameFormat: 'race',
          cc: selectedCc,
          mirror: mirrorMode,
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
      gpSession = null;
      syncPlayerPrefs(payload);
      const onlineFormat = ['race', 'knockout', 'balloon'].includes(selectedFormat)
        ? selectedFormat
        : 'race';
      const onlineTrack =
        onlineFormat === 'balloon' ? 'arena' : getTrackKey(currentTrackId, mirrorMode);
      try {
        const res = await gameClient.joinPublicMatch({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
          trackId: onlineTrack,
          gameFormat: onlineFormat,
          cc: selectedCc,
          mirror: onlineFormat === 'balloon' ? false : mirrorMode,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          authService?.setActiveRoomCode(res.roomCode);
          ui.showToast(`⚡ Partie publique rejointe (${res.roomCode}) !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de rejoindre une partie publique.', 'error');
      }
    },

    onCreateRoom: async (payload = {}) => {
      sound.unlock();
      if (!authService?.isAuthenticated()) {
        authOverlay?.openAuthModal({ reason: 'create_room' });
        return;
      }
      clearPauseState();
      gpSession = null;
      syncPlayerPrefs(payload);
      const onlineFormat = ['race', 'knockout', 'balloon'].includes(selectedFormat)
        ? selectedFormat
        : 'race';
      const onlineTrack =
        onlineFormat === 'balloon' ? 'arena' : getTrackKey(currentTrackId, mirrorMode);
      try {
        const res = await gameClient.createRoom({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
          trackId: onlineTrack,
          gameFormat: onlineFormat,
          cc: selectedCc,
          mirror: onlineFormat === 'balloon' ? false : mirrorMode,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          authService?.setActiveRoomCode(res.roomCode);
          ui.showToast(`Salon ${res.roomCode} créé !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de créer le salon multijoueur.', 'error');
      }
    },

    onJoinRoom: async (payloadOrCode, maybeName, maybeRacer) => {
      sound.unlock();
      clearPauseState();
      gpSession = null;
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
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          authService?.setActiveRoomCode(res.roomCode);
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
      tryRestoreSavedGyroOnClick();
      clearPauseState();
      gameClient.startRace();
    },

    onRematch: () => {
      sound.unlock();
      clearPauseState();
      if (
        gameClient.mode === 'solo' &&
        gpSession &&
        gpSession.raceIndex >= gpSession.tracks.length - 1
      ) {
        gpSession.raceIndex = 0;
        gpSession.standings.clear();
        gpSession.lastScoredIndex = -1;
        const cup = CUPS.find((c) => c.id === gpSession.cupId) || CUPS[0];
        startSoloGpStage(cup, 0);
        return;
      }
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
      savedGyroPref = active;
      writeStorage(STORAGE_KEYS.GYRO, active);
      if (wantGyro && !active) {
        ui.showToast('Capteur gyroscope indisponible ou refusé sur cet appareil.', 'warning');
      }
      return active;
    },

    onGyroRecalibrate: () => {
      sound.unlock();
      touchControls.recalibrateGyro();
      ui?.showToast?.('🎯 Gyroscope recentré !', 'info');
      return true;
    },

    onRecalibrateGyro: () => {
      sound.unlock();
      touchControls.recalibrateGyro();
      ui?.showToast?.('🎯 Gyroscope recentré !', 'info');
      return true;
    },

    onGyroSensitivityChange: (sens) => {
      sound.unlock();
      const next = touchControls.setGyroSensitivity(sens);
      writeStorage(STORAGE_KEYS.GYRO_SENS, next);
      ui?.setGyroSensitivity?.(next);
      return next;
    },

    onSelectGyroSensitivity: (sens) => {
      sound.unlock();
      const next = touchControls.setGyroSensitivity(sens);
      writeStorage(STORAGE_KEYS.GYRO_SENS, next);
      ui?.setGyroSensitivity?.(next);
      return next;
    },

    onGyroInvertChange: (forcedState) => {
      sound.unlock();
      const want =
        typeof forcedState === 'boolean' ? forcedState : !touchControls.isGyroInverted();
      const next = touchControls.setGyroInvert(want);
      writeStorage(STORAGE_KEYS.GYRO_INVERT, next);
      ui?.setGyroInvert?.(next);
      return next;
    },

    onToggleGyroInvert: (forcedState) => {
      sound.unlock();
      const want =
        typeof forcedState === 'boolean' ? forcedState : !touchControls.isGyroInverted();
      const next = touchControls.setGyroInvert(want);
      writeStorage(STORAGE_KEYS.GYRO_INVERT, next);
      ui?.setGyroInvert?.(next);
      return next;
    },

    onToggleHaptics: (forcedState) => {
      sound.unlock();
      const want =
        typeof forcedState === 'boolean' ? forcedState : !touchControls.isHapticsEnabled();
      const next = touchControls.setHapticsEnabled(want);
      writeStorage(STORAGE_KEYS.HAPTICS, next);
      ui?.setHapticsEnabled?.(next);
      return next;
    },

    onHapticsChange: (forcedState) => {
      sound.unlock();
      const want =
        typeof forcedState === 'boolean' ? forcedState : !touchControls.isHapticsEnabled();
      const next = touchControls.setHapticsEnabled(want);
      writeStorage(STORAGE_KEYS.HAPTICS, next);
      ui?.setHapticsEnabled?.(next);
      return next;
    },

    onToggleAutoAccel: (forcedState) => {
      const nextAuto = typeof forcedState === 'boolean' ? forcedState : !autoAccel;
      autoAccel = nextAuto;
      touchControls.setAutoAccel(autoAccel);
      writeStorage(isMobileMode() ? STORAGE_KEYS.AUTO_ACCEL : STORAGE_KEYS.AUTO_ACCEL_PC, autoAccel);
      return autoAccel;
    },

    onSelectQuality: (tier) => {
      sound.unlock();
      const candidate = VALID_QUALITY_TIERS.has(tier) ? tier : 'auto';
      const applied = sceneManager.setQualityTier?.(candidate) || candidate;
      qualityMode = VALID_QUALITY_TIERS.has(applied) ? applied : candidate;
      writeStorage(STORAGE_KEYS.QUALITY, qualityMode);
      ui?.setQualityMode?.(qualityMode);
      return qualityMode;
    },

    onMenuViewChange: (view) => {
      sceneManager.setMenuViewMode(view === 'tracks' ? 'track_preview' : 'paddock');
      refreshShowcase();
    },

    onOrbitDrag: (deltaRad) => {
      sceneManager.addShowcaseOrbitDelta(deltaRad);
    },

    onPreviewScrub: (deltaT) => {
      sceneManager.addPreviewScrub(deltaT);
    },

    onUiSound: (kind) => {
      sound.unlock();
      if (kind === 'confirm') sound.playUiConfirm();
      else if (kind === 'back') sound.playUiBack();
      else sound.playUiTick();
    },
  });

  // Sync initial UI toggle icons with actual subsystem states
  ui.setDeviceMode(deviceMode);
  ui.setMuted(sound.isMuted());
  ui.setMusicEnabled(sound.isMusicEnabled());
  ui.setGyroEnabled(touchControls.isGyroEnabled());
  ui.setGyroSensitivity?.(touchControls.getGyroSensitivity());
  ui.setGyroInvert?.(touchControls.isGyroInverted());
  ui.setHapticsEnabled?.(touchControls.isHapticsEnabled());
  ui.setSteerMode(steerMode);
  ui.setAutoAccel(autoAccel);
  ui.setQualityMode?.(qualityMode);

  onDeviceModeChange((nextMode) => {
    deviceMode = nextMode;
    autoAccel = readAutoAccelForMode(nextMode);
    touchControls.setDeviceMode(nextMode);
    touchControls.setAutoAccel(autoAccel);
    ui.setDeviceMode(nextMode);
    ui.setAutoAccel(autoAccel);
    if (nextMode === 'desktop' && touchControls.isGyroEnabled()) {
      touchControls.setGyroEnabled(false);
      ui.setGyroEnabled(false);
    }
  });

  // Sync initial progression profile & format state
  ui.setProfile(profile);
  ui.setFormatState({
    format: selectedFormat,
    cupId: selectedCupId,
    cc: selectedCc,
    mirror: mirrorMode,
  });

  // Show Home screen initially
  ui.showHome({
    defaultName: currentPlayerName,
    defaultRacerId: currentRacerId,
    defaultTrackId: currentTrackId,
    defaultSteerMode: steerMode,
    prefillRoomCode,
    ghostChallengeInfo: activeGhost,
  });
  syncMusicLifecycle(null, null);

  if (prefillRoomCode) {
    ui.showToast(`Salon ${prefillRoomCode} détecté — clique sur Rejoindre !`, 'info');
  } else if (activeGhost) {
    ui.showToast(`👻 Défi Fantôme de ${activeGhost.name} chargé !`, 'info');
  }

  authOverlay = new AuthSocialOverlay({
    rootEl: uiRoot,
    authService,
    onToast: (msg, type = 'info') => ui.showToast(msg, type),
    getCurrentTrackId: () => gameClient.getState()?.trackId || getEffectiveTrackId(),
    getActiveRoomContext: () => ({
      roomCode: gameClient.mode === 'online' ? gameClient.getState()?.roomCode || null : null,
      trackId: gameClient.getState()?.trackId || getEffectiveTrackId(),
    }),
    onChallengeGhost: (decodedGhost) => {
      if (!decodedGhost) return;
      sound.unlock();
      gpSession = null;
      activeGhost = decodedGhost;
      if (isValidTrackAny(decodedGhost.trackId) && !isArenaTrack(decodedGhost.trackId)) {
        currentTrackId = getBaseTrackId(decodedGhost.trackId);
        mirrorMode = Boolean(decodedGhost.trackId.endsWith('__mirror'));
        writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
        refreshShowcase();
      }
      clearPauseState();
      gameClient.leave();
      authService.setActiveRoomCode(null);
      setRoomCodeInUrl('');
      lastHandledFinishedRaceKey = null;
      authOverlay.setBarVisible(false);
      try {
        gameClient.startSolo({
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
          trackId: getTrackKey(currentTrackId, mirrorMode),
          gameFormat: 'race',
          cc: selectedCc,
          mirror: mirrorMode,
          botCount: 5,
        });
        ui.showToast(`👻 Défi lancé contre le fantôme de ${decodedGhost.name} !`, 'info');
      } catch (err) {
        ui.showToast(err?.message || 'Impossible de lancer le défi fantôme.', 'error');
      }
    },
    onJoinRoomCode: async (roomCode) => {
      const cleanCode = String(roomCode || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4);
      if (cleanCode.length < 4) return;
      sound.unlock();
      gpSession = null;
      clearPauseState();
      gameClient.leave();
      try {
        const res = await gameClient.joinRoom({
          roomCode: cleanCode,
          playerName: currentPlayerName,
          racerId: currentRacerId,
          kartId: profile.selectedKart,
          boostColorId: profile.selectedBoost,
        });
        if (res?.roomCode) {
          setRoomCodeInUrl(res.roomCode);
          authService.setActiveRoomCode(res.roomCode);
          ui.showToast(`Connecté au salon ${res.roomCode} !`, 'success');
        }
      } catch (err) {
        ui.showToast(err?.message || `Impossible de rejoindre le salon ${cleanCode}.`, 'error');
      }
    },
  });

  const unsubAuthUi = authService.subscribe((snap) => {
    const unlockedSet = new Set(snap.unlockedRacers);
    ui.setUnlockedRacers(unlockedSet, snap.isAuthenticated);
    if (!unlockedSet.has(currentRacerId)) {
      currentRacerId = RACERS.find((r) => unlockedSet.has(r.id))?.id || defaultRacerFallback;
      writeStorage(STORAGE_KEYS.RACER, currentRacerId);
      refreshShowcase();
    }
  });

  authService
    .init()
    .then((snap) => {
      if (snap?.pendingFriendCode && !gameClient.getState()) {
        authOverlay.openFriendsModal();
      }
    })
    .catch((err) => {
      console.warn('[PocketKart Auth] Init error:', err);
    });

  // Support live pasting/opening of `#challenge=...` hash links in the same tab
  window.addEventListener('hashchange', () => {
    const incomingGhost = getGhostChallengeFromUrl();
    if (!incomingGhost) return;
    activeGhost = incomingGhost;
    if (isValidTrackAny(incomingGhost.trackId) && !isArenaTrack(incomingGhost.trackId)) {
      currentTrackId = getBaseTrackId(incomingGhost.trackId);
      mirrorMode = Boolean(incomingGhost.trackId.endsWith('__mirror'));
      writeStorage(STORAGE_KEYS.TRACK, currentTrackId);
      ui.setFormatState({ mirror: mirrorMode });
      refreshShowcase();
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

  // Listen to controller / keyboard pause & gamepad connection events
  const onTogglePauseEvent = () => {
    sound.unlock();
    const st = gameClient?.getState();
    if (
      gameClient?.mode === 'solo' &&
      st &&
      (st.phase === 'countdown' || st.phase === 'racing')
    ) {
      applySoloPause(!gameClient.isPaused());
    }
  };

  const onGamepadStatusEvent = (e) => {
    const connected = Boolean(e?.detail?.connected);
    const name = typeof e?.detail?.name === 'string' ? e.detail.name.trim() : '';
    ui?.setGamepadConnected?.(connected, name);
    if (connected && !lastGamepadConnected) {
      const shortName = name ? name.split('(')[0].trim().slice(0, 28) : 'Manette';
      ui?.showToast?.(`🎮 ${shortName} connectée !`, 'info');
    }
    lastGamepadConnected = connected;
  };

  const onGyroRecalibratedEvent = () => {
    ui?.showToast?.('🎯 Gyroscope recentré !', 'info');
  };

  window.addEventListener('pocketkart:toggle-pause', onTogglePauseEvent);
  window.addEventListener('pocketkart:gamepad-status', onGamepadStatusEvent);
  window.addEventListener('pocketkart:gyro-recalibrated', onGyroRecalibratedEvent);
  if (touchControls._gamepadConnected) {
    lastGamepadConnected = true;
    ui.setGamepadConnected?.(true, touchControls._gamepadName || '');
  }

  // Main 60fps Arcade Loop (capped at 60fps on mobile to save battery/thermal budget on 90/120Hz screens)
  let lastTime = performance.now();
  let pausedSceneRendered = false;

  const onWindowResizeWhilePaused = () => {
    pausedSceneRendered = false;
  };
  window.addEventListener('resize', onWindowResizeWhilePaused, { passive: true });

  function frame(now) {
    window.requestAnimationFrame(frame);

    if (isMobileMode() && now - lastTime < 15.2) {
      return;
    }

    try {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const preStepState = gameClient.getState();
      const controlsActive = syncControlsVisibility(preStepState);
      touchControls.setRacePhase(preStepState?.phase || 'home');

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

        // 3. Update thumb-zone button visuals (including V3 trailing shield ring, smooth driftTime & Time Trial mushrooms) & haptics
        if (typeof touchControls.updateVisualState === 'function') {
          touchControls.updateVisualState({
            driftCharge: localKart?.driftCharge || 0,
            driftTime: localKart?.driftTime ?? localKart?._driftTime ?? null,
            item: localKart?.item ?? null,
            itemRouletteTimer: localKart?.itemRouletteTimer || 0,
            boosting: Boolean((localKart?.boostTimer || 0) > 0 || (localKart?.starTimer || 0) > 0),
            shieldItem: localKart?.shieldItem ?? null,
            tripleMushrooms: localKart?.tripleMushrooms || 0,
          });
        }

        // 4. Drift tier chime & overtake chime detection during active racing
        if (
          state.phase === 'racing' &&
          !isPaused &&
          localKart &&
          !localKart.finished &&
          !localKart.eliminated
        ) {
          const curRaceTimeMs = Number(state.raceTimeMs) || 0;
          if (curRaceTimeMs < prevRaceTimeMs) {
            prevDriftCharge = 0;
            prevRaceRank = null;
          }
          prevRaceTimeMs = curRaceTimeMs;

          const driftCharge = Number(localKart.driftCharge) || 0;
          if (localKart.drifting && driftCharge > prevDriftCharge && driftCharge >= 1) {
            sound.playDriftTierTick?.(Math.min(3, Math.floor(driftCharge)));
          }
          prevDriftCharge = localKart.drifting ? driftCharge : 0;

          const curRank = Number(localKart.rank);
          if (Number.isFinite(curRank) && curRank >= 1) {
            if (prevRaceRank !== null && curRank < prevRaceRank && (state.karts?.length || 0) > 1) {
              sound.playOvertakeChime?.(curRank);
            }
            prevRaceRank = curRank;
          }
        } else if (!isPaused) {
          prevDriftCharge = 0;
          prevRaceRank = null;
          prevRaceTimeMs = 0;
        }

        // 5. Sync procedural background music & final-lap tempo boost
        syncMusicLifecycle(state, localKart);

        // 6. Update continuous kart engine purr (quieted when paused or hidden)
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
          boosting: Boolean((localKart?.boostTimer || 0) > 0 || (localKart?.starTimer || 0) > 0),
          active: engineActive,
          shrunk: Boolean((localKart?.shrinkTimer || 0) > 0),
          shrinkTimer: localKart?.shrinkTimer || 0,
        });

        // 7. Render 3D world, karts, trailing shields, slipstream & corner look-ahead camera
        // Stop continuous 3D WebGL rendering while paused (render once on pause entry / resize)
        if (isPaused) {
          if (!pausedSceneRendered) {
            pausedSceneRendered = true;
            sceneManager.update(state, state.localId, 0.0005);
          }
        } else {
          pausedSceneRendered = false;
          sceneManager.update(state, state.localId, dt);
        }
      } else {
        pausedSceneRendered = false;
        prevDriftCharge = 0;
        prevRaceRank = null;
        prevRaceTimeMs = 0;
        syncMusicLifecycle(null, null);
        sceneManager.setGhostState(null);
        silenceEngine();
        sceneManager.update(null, null, dt);
      }

      dismissBootLoader();
    } catch (err) {
      dismissBootLoader();
      console.error('[PocketKart] Render frame error:', err);
    }
  }

  window.requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('pocketkart:toggle-pause', onTogglePauseEvent);
    window.removeEventListener('pocketkart:gamepad-status', onGamepadStatusEvent);
    window.removeEventListener('pocketkart:gyro-recalibrated', onGyroRecalibratedEvent);
    window.removeEventListener('resize', onWindowResizeWhilePaused);
    unsubAuthUi?.();
    authOverlay?.dispose();
    authService?.dispose();
    sound.stopMenuMusic?.();
    sound.stopMusic();
    gameClient.leave();
    sceneManager.dispose();
  });
}

bootstrap();

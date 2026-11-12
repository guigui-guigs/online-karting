/**
 * PocketKart 3D V4 — Screens, Progression Career Bar, Garage & Challenges Modals,
 * Format/CC/Mirror Selectors, QR Lobby, Live Race HUD, Arena Radar & Podium.
 */

import QRCode from 'qrcode';
import {
  RACERS,
  ITEMS,
  RACE_CONFIG,
  TRACKS,
  EMOTES,
  KARTS,
  BOOST_STYLES,
  CUPS,
  CC_CLASSES,
  GAME_FORMATS,
  ARENA_TRACK,
  GP_POINTS,
  MIRROR_UNLOCK_LEVEL,
} from '../shared/constants.js';
import {
  getTrackSamples,
  getBaseTrackId,
  isArenaTrack,
  ARENA_DATA,
  getTrackKey,
  parseTrackKey,
  getTrackMeta,
} from '../shared/trackData.js';
import {
  computeLevelFromXp,
  getRankTitle,
  isCcUnlocked,
  isMirrorUnlocked,
  getTimeTrialTargets,
  evaluateTimeTrialMedal,
} from '../shared/progression.js';
import {
  getDeviceMode,
  isMobileMode,
  supportsMobileGyro,
  isIOSDevice,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  lockLandscapeOrientation,
} from './deviceMode.js';

const STORAGE_KEYS = {
  NAME: 'pocketkart_player_name',
  RACER: 'pocketkart_racer_id',
  TRACK: 'pocketkart_track_id',
  STEER_MODE: 'pocketkart_steer_mode',
  MUTED: 'pocketkart_muted',
  MUSIC: 'pocketkart_music',
  GYRO: 'pocketkart_gyro',
  GYRO_SENSITIVITY: 'pocketkart_gyro_sens',
  GYRO_INVERT: 'pocketkart_gyro_invert',
  HAPTICS: 'pocketkart_haptics',
  AUTO_ACCEL: 'pocketkart_auto_accel',
  QUALITY: 'pocketkart_quality',
  BEST_LAPS: 'pocketkart_best_laps_v1',
};

const GYRO_SENS_OPTIONS = [
  { id: 'low', label: 'Souple', desc: '32° (Grand angle)' },
  { id: 'normal', label: 'Normal', desc: '24° (Équilibré)' },
  { id: 'high', label: 'Vif', desc: '16° (Réactif)' },
];

function normalizeGyroSensitivity(val) {
  if (val === 'low' || val === 'high') return val;
  return 'normal';
}

const QUALITY_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: '⚙️', desc: 'Adaptatif FPS' },
  { id: 'ultra', label: 'Ultra', icon: '✨', desc: 'Rendu max' },
  { id: 'balanced', label: 'Équilibré', icon: '⚖️', desc: '60 FPS fluide' },
  { id: 'low', label: 'Éco', icon: '🔋', desc: 'Batterie / Mobile' },
];

const TACHO_ARC_LEN = 236;
const TACHO_MAX_KMH = 180;

function normalizeQualityMode(quality) {
  if (quality === 'ultra' || quality === 'balanced' || quality === 'low') {
    return quality;
  }
  return 'auto';
}

const ITEM_DISPLAY = {
  [ITEMS.TURBO]: { icon: '🍄', name: 'TURBO' },
  [ITEMS.GREEN_SHELL]: { icon: '🐢', name: 'CARAPACE' },
  [ITEMS.RED_SHELL]: { icon: '🎯', name: 'TÊTE CHERCH.' },
  [ITEMS.BLUE_SHELL || 'blue_shell']: { icon: '🐚', name: 'CARAPACE BLEUE' },
  [ITEMS.BANANA]: { icon: '🍌', name: 'BANANE' },
  [ITEMS.STAR]: { icon: '⭐', name: 'SUPER ÉTOILE' },
  [ITEMS.LIGHTNING || 'lightning']: { icon: '⚡', name: 'ÉCLAIR' },
};

const ROULETTE_CYCLE = ['🍄', '🐢', '🎯', '🐚', '🍌', '⭐', '⚡'];

function readPref(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, val) {
  try {
    window.localStorage.setItem(key, String(val));
  } catch {
    // Ignore private browsing errors
  }
}

function formatOrdinalFr(rank) {
  const r = Math.max(1, Math.floor(rank || 1));
  return r === 1 ? { num: '1', sup: 'er' } : { num: String(r), sup: 'e' };
}

function formatRaceTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--.--';
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(
    2,
    '0'
  )}`;
}

function formatSplitDelta(deltaMs) {
  if (!Number.isFinite(deltaMs)) return '';
  const sign = deltaMs <= 0 ? '-' : '+';
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
}

function readBestLapsMap() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.BEST_LAPS);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBestLapsMap(map) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.BEST_LAPS, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function getRacerById(racerId) {
  return RACERS.find((r) => r.id === racerId) || RACERS[0];
}

function getTrackById(trackId) {
  if (isArenaTrack(trackId)) {
    return ARENA_TRACK;
  }
  const { baseId, mirror } = parseTrackKey(trackId);
  const base = TRACKS.find((t) => t.id === baseId) || TRACKS[0];
  if (mirror && base) {
    return { ...base, id: trackId, name: `${base.name} ⇄` };
  }
  return base;
}

function getKartMeta(kartId) {
  return KARTS.find((k) => k.id === kartId) || KARTS[0];
}

function getBoostMeta(boostId) {
  return BOOST_STYLES.find((b) => b.id === boostId) || BOOST_STYLES[0];
}

function formatMedalIcon(medal) {
  if (medal === 'author') return '💠';
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  if (medal === 'bronze') return '🥉';
  return '';
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

function computeRaceAwards(karts) {
  const awardsByKart = new Map();
  if (!Array.isArray(karts) || karts.length === 0) return awardsByKart;

  const categories = [
    {
      key: 'hitsDealt',
      icon: '🎯',
      title: 'Sniper Officiel',
      fmt: (n) => `${n} cible${n > 1 ? 's' : ''}`,
    },
    {
      key: 'driftsBoosted',
      icon: '🔥',
      title: 'Roi du Drift',
      fmt: (n) => `${n} turbo-drift${n > 1 ? 's' : ''}`,
    },
    {
      key: 'stunts',
      icon: '🤸',
      title: 'Acrobate Céleste',
      fmt: (n) => `${n} figure${n > 1 ? 's' : ''}`,
    },
    {
      key: 'timesHit',
      icon: '🧲',
      title: 'Aimant à Carapaces',
      fmt: (n) => `${n} choc${n > 1 ? 's' : ''}`,
    },
  ];

  for (const cat of categories) {
    let bestKart = null;
    let bestVal = 0;
    for (const k of karts) {
      const val = Number(k.stats?.[cat.key] || 0);
      if (val > bestVal) {
        bestVal = val;
        bestKart = k;
      }
    }
    if (bestKart && bestVal > 0 && !awardsByKart.has(bestKart.id)) {
      awardsByKart.set(bestKart.id, {
        icon: cat.icon,
        title: cat.title,
        detail: cat.fmt(bestVal),
      });
    }
  }

  return awardsByKart;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const trackSvgCache = new Map();

function buildTrackSvgMarkup(trackId, accent = '#00e5ff') {
  const safeId = trackId || 'coco';
  const cacheKey = `${safeId}__${accent}`;
  const cached = trackSvgCache.get(cacheKey);
  if (cached) return cached;

  let svg = '';
  if (isArenaTrack(safeId)) {
    svg = `
      <svg class="pk-track-svg" viewBox="0 0 120 84" fill="none" aria-hidden="true">
        <circle cx="60" cy="42" r="30" stroke="${accent}" stroke-opacity="0.28" stroke-width="9" />
        <circle cx="60" cy="42" r="30" stroke="rgba(10,18,40,0.9)" stroke-width="6.5" />
        <circle cx="60" cy="42" r="30" stroke="${accent}" stroke-width="3" />
        <circle cx="60" cy="42" r="14" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.6" stroke-dasharray="4 4" />
        <path d="M40 42H80M60 22V62" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="60" cy="12" r="3.6" fill="#ffffff" stroke="#090f24" stroke-width="1.4" />
      </svg>`;
  } else {
    const samples = getTrackSamples(72, safeId);
    if (samples && samples.length > 2) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const s of samples) {
        if (s.x < minX) minX = s.x;
        if (s.x > maxX) maxX = s.x;
        if (s.z < minZ) minZ = s.z;
        if (s.z > maxZ) maxZ = s.z;
      }
      const w = 120;
      const h = 84;
      const pad = 12;
      const spanX = Math.max(1, maxX - minX);
      const spanZ = Math.max(1, maxZ - minZ);
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
      const offX = (w - spanX * scale) * 0.5 - minX * scale;
      const offY = (h - spanZ * scale) * 0.5 - minZ * scale;

      const pts = samples.map((s) => [
        (s.x * scale + offX).toFixed(1),
        (s.z * scale + offY).toFixed(1),
      ]);
      const d = `M ${pts.map((p) => `${p[0]},${p[1]}`).join(' L ')} Z`;
      const [sx, sy] = pts[0];

      svg = `
        <svg class="pk-track-svg" viewBox="0 0 120 84" fill="none" aria-hidden="true">
          <path d="${d}" stroke="${accent}" stroke-opacity="0.28" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${d}" stroke="rgba(10,18,40,0.88)" stroke-width="6.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${d}" stroke="${accent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${d}" stroke="#ffffff" stroke-opacity="0.72" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="${sx}" cy="${sy}" r="4.1" fill="#ffffff" stroke="#090f24" stroke-width="1.5" />
          <circle cx="${sx}" cy="${sy}" r="1.9" fill="${accent}" />
        </svg>`;
    }
  }

  trackSvgCache.set(cacheKey, svg);
  return svg;
}

function getTrackTelemetry(trackId, profile = null, mirror = false) {
  if (isArenaTrack(trackId)) {
    return {
      lengthLabel: 'ARÈNE 360°',
      chips: [
        { icon: '🏟️', label: 'Zone', val: `R ${ARENA_DATA.radius || 52} m` },
        { icon: '⚡', label: 'Turbos', val: '4' },
        { icon: '🛫', label: 'Tremplins', val: '2' },
        { icon: '🎈', label: 'Règles', val: '3 ❤️ • 90s' },
      ],
      compact: `R ${ARENA_DATA.radius || 52} m • 3 ❤️ • 90s`,
    };
  }

  const baseId = getBaseTrackId(trackId);
  const effKey = getTrackKey(baseId, mirror);
  const meta = getTrackMeta(baseId);
  const lengthM = Math.round(meta?.length || 600);
  const turbos = meta?.boostPadSpots?.length || 0;
  const ramps = meta?.rampSpots?.length || 0;
  const ice = meta?.iceZones?.length || 0;
  const gaps = meta?.gapZones?.length || 0;
  const bumpers = meta?.bumperSpots?.length || 0;

  let featureChip = { icon: '🔀', label: 'Raccourcis', val: String(meta?.shortcutZones?.length || 1) };
  if (ice > 0) {
    featureChip = { icon: '❄️', label: 'Glace', val: `${ice} zone${ice > 1 ? 's' : ''}` };
  } else if (gaps > 0) {
    featureChip = { icon: '🌋', label: 'Brèches', val: `${gaps}` };
  } else if (bumpers > 0) {
    featureChip = { icon: '🟡', label: 'Bumpers', val: `${bumpers}` };
  }

  const rec = profile?.timeTrials?.[effKey];
  const goldMs = getTimeTrialTargets(baseId).goldMs;
  const pbChip = rec?.bestMs
    ? { icon: formatMedalIcon(rec.medal) || '⏱️', label: 'Record', val: formatRaceTime(rec.bestMs) }
    : { icon: '🥇', label: 'Obj. Or', val: formatRaceTime(goldMs) };

  return {
    lengthLabel: `${lengthM} m`,
    chips: [
      { icon: '📏', label: 'Dist.', val: `${lengthM} m` },
      { icon: '⚡', label: 'Turbos', val: String(turbos) },
      { icon: '🛫', label: 'Tremplins', val: String(ramps) },
      featureChip,
      pbChip,
    ],
    compact: `${lengthM} m • ⚡ ${turbos}${ramps ? ` • 🛫 ${ramps}` : ''}`,
  };
}

export class UIManager {
  constructor(rootEl, callbacks = {}) {
    this.rootEl = rootEl;
    this.callbacks = callbacks;

    this.activeScreen = 'home'; // 'home' | 'lobby' | 'hud' | 'finished'
    this.paused = false;
    this.deviceMode = getDeviceMode();
    this._currentMode = null;

    this.selectedRacerId = readPref(STORAGE_KEYS.RACER, RACERS[0]?.id || 'red');
    if (!RACERS.some((r) => r.id === this.selectedRacerId)) {
      this.selectedRacerId = RACERS[0]?.id || 'red';
    }

    this.selectedTrackId = readPref(STORAGE_KEYS.TRACK, TRACKS[0]?.id || 'coco');
    if (!TRACKS.some((t) => t.id === this.selectedTrackId)) {
      this.selectedTrackId = TRACKS[0]?.id || 'coco';
    }

    const savedSteer = readPref(STORAGE_KEYS.STEER_MODE, 'joystick');
    this.steerMode = savedSteer === 'buttons' ? 'buttons' : 'joystick';

    this.playerName = readPref(STORAGE_KEYS.NAME, 'Pilote') || 'Pilote';
    this.muted = readPref(STORAGE_KEYS.MUTED, 'false') === 'true';
    this.musicEnabled = readPref(STORAGE_KEYS.MUSIC, 'true') !== 'false';
    this.gyroEnabled = readPref(STORAGE_KEYS.GYRO, 'false') === 'true';
    this.gyroSensitivity = normalizeGyroSensitivity(
      readPref(STORAGE_KEYS.GYRO_SENSITIVITY, 'normal')
    );
    this.gyroInvert = readPref(STORAGE_KEYS.GYRO_INVERT, 'false') === 'true';
    this.hapticsEnabled = readPref(STORAGE_KEYS.HAPTICS, 'true') !== 'false';
    this.autoAccel = readPref(STORAGE_KEYS.AUTO_ACCEL, 'true') !== 'false';
    this.qualityMode = normalizeQualityMode(readPref(STORAGE_KEYS.QUALITY, 'auto'));
    this.gamepadConnected = false;
    this.gamepadName = '';

    this._ghostChallengeInfo = null;
    this._lastFinishedState = null;
    this._lastAwardsMap = new Map();
    this._emoteCooldownUntil = 0;
    this._confirmLeaveUntil = 0;
    this.isAuthenticated = false;
    this.unlockedRacers = new Set(['red', 'aqua', 'kiwi']);

    // V4 progression & mode selection state
    this.profile = null;
    this.selectedFormat = 'race';
    this.selectedCupId = CUPS[0]?.id || 'sun';
    this.selectedCc = '100cc';
    this.mirrorMode = false;
    this._lastProgressionRes = null;
    this._lastGpState = null;
    this._podium3DView = false;
    this._controlsTab = 'touch';

    // Cached diff keys for 60fps zero-thrash updates
    this._lastPhase = null;
    this._lastLobbySig = '';
    this._lastLobbyOptionsSig = '';
    this._lastQrUrl = '';
    this._lastPodiumSig = '';
    this._lastRank = null;
    this._lastLapText = '';
    this._lastLocalLap = 1;
    this._lastClockText = '';
    this._lastClockStep = -1;
    this._lastSplitKey = '';
    this._splitDeltaUntil = 0;
    this._lastLapMarkMs = 0;
    this._raceBestLapMs = Infinity;
    this._bestLapsMap = readBestLapsMap();
    this._lastTachoKmh = -1;
    this._lastTachoDashOffset = -1;
    this._lastTachoCharge = -1;
    this._lastTachoDrifting = false;
    this._lastTachoBoostClass = '';
    this._lastTachoCoinBonus = -1;
    this._lastStandingsSig = '';
    this._lastStandingsUpdateAt = 0;
    this._lastCountdownKey = '';
    this._lastHudItemKey = '';
    this._lastHudCoins = -1;
    this._lastModeBannerKey = '';
    this._lastThreatKey = '';
    this._lastWrongWay = false;
    this._lastDrafting = false;
    this._lastRescueKey = '';
    this._lastSoloMode = null;
    this._lastProxLeftKey = '';
    this._lastProxRightKey = '';
    this._goBannerUntil = 0;
    this._finalLapBannerUntil = 0;
    this._seenRaceEventIds = new Set();
    this._killfeedEntries = [];

    // Multi-track minimap cache + offscreen static canvas cache
    this._minimapCache = new Map();
    this._minimapStaticLayerCache = new Map();
    this._minimapDpr = 0;
    this._lastMinimapDrawAt = 0;

    // Two-stage home navigation & carousel state
    this.homeView = 'paddock'; // 'paddock' | 'tracks'
    this._settingsPopoverOpen = false;
    this._suppressCarouselScrollUntil = 0;
    this._carouselScrollTimer = null;

    this._buildDOM();
    this._bindEvents();
    this._syncUtilityButtons();
    this._renderRacerSelection();
    this._renderFormatControls();
    this._renderHomeContextCards();
    this._renderTrackSelection();
    this._renderCareerBar();
    this._syncRootDatasets();
  }

  _supportsGyroUI() {
    return supportsMobileGyro();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'pk-ui-layer';

    const canFullscreen = Boolean(
      document.fullscreenEnabled || document.webkitFullscreenEnabled || isMobileMode()
    );
    const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    this.el.innerHTML = `
      <!-- Edge Speed-Lines Overlay (Boost / Star) -->
      <div class="pk-speed-lines" data-role="speed-lines"></div>

      <!-- Portrait Orientation Invitation Banner -->
      <div class="pk-portrait-banner" data-role="portrait-banner">
        <span class="pk-portrait-banner-text">🔄 Tourne ton téléphone en mode Paysage pour piloter au Gyroscope !</span>
        <div class="pk-portrait-banner-actions">
          ${
            canFullscreen
              ? `<button type="button" class="pk-mini-pill pk-is-active" data-action="fullscreen" title="Plein écran Paysage">⛶ Plein écran</button>`
              : ''
          }
          <button type="button" class="pk-mini-pill" data-action="dismiss-portrait" aria-label="Continuer en portrait" title="Continuer en portrait">✕</button>
        </div>
      </div>

      <!-- ==================== HOME SCREEN (PADDOCK + 3D CIRCUIT SHOWCASE) ==================== -->
      <section class="pk-screen pk-screen-home" data-screen="home" data-home-view="paddock">
        <!-- Interactive 3D Viewport Drag Capture Layer -->
        <div class="pk-stage-drag-layer" data-role="stage-drag-layer" aria-hidden="true"></div>

        <!-- Compact Glass Topbar -->
        <div class="pk-home-topbar">
          <div class="pk-brand-chip">
            <span class="pk-brand-dot"></span>
            <span class="pk-brand-title">POCKET<strong>KART</strong></span>
            <span class="pk-brand-ver">3D</span>
          </div>

          <div class="pk-top-utils">
            <span class="pk-gamepad-badge is-hidden" data-role="gamepad-badge" title="Manette connectée">
              <span class="pk-gamepad-dot"></span>
              <span class="pk-gamepad-txt" data-role="gamepad-badge-txt">🎮 Manette</span>
            </span>

            <button type="button" class="pk-profile-pill" data-action="open-profile" data-role="topbar-profile-btn" title="Profil & Carrière">
              <span class="pk-level-badge pk-level-badge--sm" data-role="topbar-level">Niv. 1</span>
              <span class="pk-topbar-name" data-role="topbar-name">Pilote</span>
              <span class="pk-coin-chip pk-coin-chip--sm" data-role="topbar-coins">🪙 0</span>
            </button>

            <button type="button" class="pk-topbar-gyro-btn" data-action="toggle-gyro" data-role="topbar-gyro-btn" aria-label="Volant Gyroscope" title="Volant Gyroscope">
              <span class="pk-gyro-icon">📱</span>
              <span class="pk-gyro-txt" data-role="topbar-gyro-txt">Gyro</span>
            </button>

            <button type="button" class="pk-icon-btn pk-help-trigger" data-action="open-controls" aria-label="Aide Commandes" title="Commandes (Tactile / Clavier / Manette)">
              ❓
            </button>

            <div class="pk-settings-anchor">
              <button type="button" class="pk-icon-btn pk-settings-trigger" data-action="toggle-settings-popover" aria-label="Paramètres" title="Réglages">
                ⚙️
              </button>
              <div class="pk-glass-card pk-settings-popover is-hidden" data-role="settings-popover">
                <div class="pk-popover-head">RÉGLAGES RAPIDES</div>
                <span class="pk-util-pill pk-pc-mode-badge" data-role="pc-mode-badge" title="Contrôles clavier flèches détectés automatiquement">
                  ⌨️ Clavier Flèches
                </span>
                <span class="pk-gamepad-badge pk-gamepad-badge--popover is-hidden" data-role="gamepad-badge">
                  <span class="pk-gamepad-dot"></span>
                  <span class="pk-gamepad-txt" data-role="gamepad-badge-txt">🎮 Manette</span>
                </span>
                <div class="pk-popover-subhead">QUALITÉ GRAPHIQUE</div>
                <div class="pk-quality-seg pk-quality-seg--popover" role="group" aria-label="Qualité graphique">
                  ${QUALITY_OPTIONS.map(
                    (opt) =>
                      `<button type="button" class="pk-quality-btn" data-action="set-quality" data-quality="${opt.id}" title="${opt.desc}">${opt.icon} ${opt.label}</button>`
                  ).join('')}
                </div>
                <button type="button" class="pk-popover-row-btn" data-action="cycle-steer-mode">
                  🕹️ Joystick
                </button>
                <button type="button" class="pk-popover-row-btn" data-action="toggle-auto-accel">
                  ⚡ Auto-Gaz: ON
                </button>
                <button type="button" class="pk-popover-row-btn" data-action="toggle-gyro">
                  📱 Gyroscope: OFF
                </button>
                <div class="pk-popover-gyro-controls is-hidden" data-role="popover-gyro-controls">
                  <div class="pk-popover-subhead">SENSIBILITÉ GYROSCOPE</div>
                  <div class="pk-quality-seg pk-quality-seg--popover" role="group" aria-label="Sensibilité Gyroscope">
                    ${GYRO_SENS_OPTIONS.map(
                      (opt) =>
                        `<button type="button" class="pk-quality-btn" data-action="set-gyro-sens" data-sens="${opt.id}" title="${opt.desc}">${opt.label}</button>`
                    ).join('')}
                  </div>
                  <button type="button" class="pk-popover-row-btn" data-action="recalibrate-gyro">
                    🎯 Centrer le volant Gyro
                  </button>
                  <button type="button" class="pk-popover-row-btn" data-action="toggle-gyro-invert">
                    ⇄ Axe Gyro : Normal
                  </button>
                </div>
                <button type="button" class="pk-popover-row-btn" data-action="toggle-haptics" data-role="popover-haptics-btn">
                  📳 Vibrations : ON
                </button>
                <button type="button" class="pk-popover-row-btn" data-action="toggle-music">
                  🎵 Musique: ON
                </button>
                <button type="button" class="pk-popover-row-btn" data-action="toggle-mute">
                  🔊 Effets: ON
                </button>
                <button type="button" class="pk-popover-row-btn" data-action="open-controls">
                  ❓ Guide Commandes
                </button>
                ${
                  canFullscreen
                    ? `<button type="button" class="pk-popover-row-btn" data-action="fullscreen">⛶ Plein écran</button>`
                    : ''
                }
              </div>
            </div>
          </div>
        </div>

        <!-- ===== STAGE 1: PADDOCK SHOWROOM VIEW ===== -->
        <div class="pk-paddock-view" data-role="paddock-view">
          <!-- Floating non-blocking context callouts -->
          <div class="pk-floating-callouts">
            <div class="pk-ghost-banner is-hidden" data-role="ghost-banner">
              <div class="pk-ghost-banner-info">
                <span class="pk-ghost-badge">👻 DÉFI FANTÔME</span>
                <span class="pk-ghost-desc" data-role="ghost-desc">Bats le chrono de Pilote !</span>
              </div>
              <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="accept-ghost">
                👻 Relever !
              </button>
            </div>

            <div class="pk-invite-callout is-hidden" data-role="invite-callout">
              <span>🎟️ Salon invité : <strong data-role="invite-code">KART</strong></span>
              <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-sm" data-action="open-online-hub">
                Rejoindre
              </button>
            </div>
          </div>

          <!-- Bottom Paddock Dock (leaves upper 55%+ 3D kart showroom open) -->
          <div class="pk-paddock-dock">
            <div class="pk-orbit-hint">↔ Glisse pour tourner le kart</div>

            <div class="pk-glass-card pk-dock-panel">
              <!-- Pilot Strip + Garage/Challenges Quick Access -->
              <div class="pk-dock-racer-head">
                <div class="pk-dock-racer-meta">
                  <span class="pk-field-label">PILOTE</span>
                  <span class="pk-racer-selected-name" data-role="selected-racer-name">Turbo Red</span>
                </div>
                <div class="pk-dock-mini-actions">
                  <button type="button" class="pk-dock-chip pk-dock-chip--cyan" data-action="open-garage">
                    <span>🏎️ Garage</span>
                    <span class="pk-notif-dot is-hidden" data-role="garage-notif">!</span>
                  </button>
                  <button type="button" class="pk-dock-chip pk-dock-chip--amber" data-action="open-challenges">
                    <span>🎯 Défis</span>
                  </button>
                </div>
              </div>

              <div class="pk-racer-strip" data-role="racer-strip" role="listbox" aria-label="Pilotes"></div>

              <!-- Featured Active Circuit / Format Card (1 tap opens 3D Circuit Showcase) -->
              <button type="button" class="pk-featured-track-btn" data-action="open-track-showcase" data-role="featured-track-btn">
                <div class="pk-featured-map" data-role="featured-map"></div>
                <div class="pk-featured-info">
                  <div class="pk-featured-badges">
                    <span class="pk-featured-format-badge" data-role="featured-format-badge">🏁 Course • 100cc</span>
                  </div>
                  <div class="pk-featured-title" data-role="featured-title">🌴 Circuit Coco</div>
                  <div class="pk-featured-sub" data-role="featured-sub">Lagon Tropical • 580 m</div>
                </div>
                <span class="pk-featured-cta">
                  <span>Circuits</span>
                  <span class="pk-chevron-glyph">›</span>
                </span>
              </button>

              <!-- Primary Action Dock -->
              <div class="pk-dock-launch-grid">
                <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg pk-dock-play-btn" data-action="quick-play">
                  <span class="pk-btn-emoji" data-role="quick-play-icon">🏁</span>
                  <span data-role="quick-play-label">JOUER <small>(Course Solo)</small></span>
                </button>
                <div class="pk-dock-sub-btns">
                  <button type="button" class="pk-arcade-btn pk-btn-electric pk-btn-md" data-action="open-track-showcase">
                    <span>🗺️ Circuits</span>
                  </button>
                  <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-md" data-action="open-online-hub">
                    <span>🌐 En Ligne</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== STAGE 2: FULL-SCREEN 3D CIRCUIT SHOWCASE VIEW ===== -->
        <div class="pk-tracks-showcase is-hidden" data-role="tracks-showcase">
          <!-- Showcase Top Header -->
          <div class="pk-showcase-header">
            <div class="pk-showcase-header-top">
              <button type="button" class="pk-back-pill" data-action="close-track-showcase">
                <span class="pk-back-arrow">‹</span>
                <span>Paddock</span>
              </button>
              <div class="pk-cc-row" data-role="cc-strip"></div>
            </div>
            <div class="pk-format-strip" data-role="format-strip" role="listbox" aria-label="Formats de jeu"></div>
          </div>

          <!-- Non-Blocking Floating Telemetry Spotlight HUD -->
          <div class="pk-showcase-spotlight" data-role="showcase-spotlight">
            <div class="pk-spotlight-top">
              <span class="pk-spotlight-kicker" data-role="home-track-label">SURVOL DRONE 3D</span>
              <span class="pk-spotlight-diff" data-role="spotlight-diff">★☆☆</span>
            </div>
            <h2 class="pk-spotlight-title" data-role="spotlight-title">CIRCUIT COCO</h2>
            <p class="pk-spotlight-sub" data-role="selected-track-sub">🌴 Lagon Tropical & Virage Soleil</p>
            <div class="pk-spotlight-chips" data-role="spotlight-chips"></div>
          </div>

          <!-- Bottom Touch-Snap Carousel Dock -->
          <div class="pk-showcase-dock">
            <div class="pk-carousel-wrap">
              <button type="button" class="pk-carousel-nav pk-carousel-prev" data-action="carousel-prev" aria-label="Circuit précédent">‹</button>
              <div class="pk-track-strip pk-track-carousel" data-role="home-track-strip" role="listbox" aria-label="Circuits"></div>
              <button type="button" class="pk-carousel-nav pk-carousel-next" data-action="carousel-next" aria-label="Circuit suivant">›</button>
            </div>

            <div class="pk-showcase-cta-row">
              <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-md pk-showcase-confirm-btn" data-action="confirm-track-showcase">
                ✓ Valider
              </button>
              <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg pk-showcase-play-btn" data-action="launch-from-showcase">
                <span class="pk-btn-emoji" data-role="showcase-launch-icon">🏁</span>
                <span data-role="showcase-launch-label">LANCER LA COURSE !</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== LOBBY WAITING ROOM ==================== -->
      <section class="pk-screen pk-screen-lobby is-hidden" data-screen="lobby">
        <div class="pk-glass-card pk-lobby-card">
          <div class="pk-lobby-top-grid">
            <div class="pk-lobby-header-main">
              <div class="pk-lobby-title-row">
                <div>
                  <div class="pk-field-label" data-role="lobby-mode-label">SALON MULTIJOUEUR</div>
                  <div class="pk-room-code-badge" data-role="lobby-code">----</div>
                </div>
                <div class="pk-lobby-share-btns">
                  <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="copy-invite">
                    📋 Copier le lien
                  </button>
                  ${
                    canWebShare
                      ? `<button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-sm" data-action="native-share">📤 Partager</button>`
                      : ''
                  }
                </div>
              </div>

              <!-- Live Lobby Options & Track Selector -->
              <div class="pk-lobby-track-wrap">
                <div class="pk-lobby-options-bar" data-role="lobby-options-bar"></div>
                <div class="pk-field-label" data-role="lobby-track-hint">CIRCUIT DU SALON</div>
                <div class="pk-track-strip pk-track-strip--compact" data-role="lobby-track-strip"></div>
              </div>
            </div>

            <!-- Scannable SVG QR Code Box -->
            <div class="pk-qr-box" data-role="qr-box" title="Scanne avec l'appareil photo d'un téléphone pour rejoindre !">
              <div class="pk-qr-svg-wrap" data-role="qr-svg"></div>
              <span class="pk-qr-caption">📱 SCANNE & JOUE</span>
            </div>
          </div>

          <div class="pk-lobby-loadout-bar" data-role="lobby-loadout-bar"></div>

          <div class="pk-lobby-roster" data-role="lobby-roster"></div>

          <div class="pk-lobby-footer">
            <!-- Host Controls -->
            <div class="pk-host-controls" data-role="host-controls">
              <div class="pk-bot-stepper">
                <span class="pk-bot-stepper-label">🤖 Bots IA</span>
                <button type="button" class="pk-step-btn" data-action="bots-dec" aria-label="Moins de bots">−</button>
                <span class="pk-bot-count" data-role="bot-count">4</span>
                <button type="button" class="pk-step-btn" data-action="bots-inc" aria-label="Plus de bots">+</button>
              </div>

              <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="start-race">
                🚀 Lancer la course !
              </button>
            </div>

            <!-- Guest / Public Auto-Start Waiting Status -->
            <div class="pk-guest-wait is-hidden" data-role="guest-wait">
              <span class="pk-pulse-dot"></span>
              <span data-role="guest-wait-text">En attente de l'hôte…</span>
            </div>

            <button type="button" class="pk-arcade-btn pk-btn-ghost pk-btn-sm" data-action="leave">
              🚪 Quitter
            </button>
          </div>
        </div>
      </section>

      <!-- ==================== LIVE RACE HUD ==================== -->
      <section class="pk-screen pk-screen-hud is-hidden" data-screen="hud">
        <div class="pk-hud-topbar">
          <!-- Top-Left: Rank + Lap + Live Clock + Split Delta + Coins + Standings + Emotes -->
          <div class="pk-hud-left-col">
            <div class="pk-hud-left">
              <div class="pk-rank-badge rank-1" data-role="hud-rank">
                <span class="pk-rank-num" data-role="hud-rank-num">1</span><sup class="pk-rank-sup" data-role="hud-rank-sup">er</sup>
              </div>
              <div class="pk-hud-stats-stack">
                <div class="pk-lap-clock-row">
                  <div class="pk-lap-pill" data-role="hud-lap">TOUR 1/3</div>
                  <div class="pk-clock-pill" data-role="hud-clock">00:00.00</div>
                  <div class="pk-split-delta is-hidden" data-role="hud-split-delta"></div>
                </div>
                <div class="pk-speed-row">
                  <div class="pk-coin-hud-pill" data-role="hud-coins">🪙 0/10</div>
                  <div class="pk-draft-pill is-hidden" data-role="hud-draft">💨 ASPIRATION</div>
                </div>
              </div>
            </div>

            <!-- Mode Status Banner (Knockout / Balloon / TimeTrial / GP) -->
            <div class="pk-hud-mode-banner is-hidden" data-role="hud-mode-banner"></div>

            <!-- Live 6-Driver Standings Tower (Desktop >= 960px only) -->
            <div class="pk-standings-tower" data-role="standings-tower" aria-label="Classement en direct"></div>

            <!-- Compact 4-Button Emote / Horn Bar -->
            <div class="pk-emote-bar" data-role="emote-bar" aria-label="Emotes et Klaxon"></div>
          </div>

          <!-- Top-Center: Item Roulette Box -->
          <div class="pk-hud-center">
            <button type="button" class="pk-item-roulette-box is-empty" data-role="hud-item-box" title="Appuie pour utiliser l'objet">
              <span class="pk-item-box-icon" data-role="hud-item-icon">?</span>
              <span class="pk-item-box-name" data-role="hud-item-name">OBJET</span>
            </button>
          </div>

          <!-- Top-Right: Solo Pause + Utility Toggles + Live Multi-Track Minimap + Compact Killfeed -->
          <div class="pk-hud-right-col">
            <div class="pk-hud-right">
              <div class="pk-hud-quick-btns">
                <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-icon-btn--pause" data-role="btn-pause-solo" data-action="pause-solo" aria-label="Pause et Options" title="Pause / Options (Échap / P)">⏸️</button>
                <button type="button" class="pk-icon-btn pk-icon-btn--sm" data-action="toggle-gyro" aria-label="Gyroscope" title="Volant Gyroscope">📱</button>
                <button type="button" class="pk-icon-btn pk-icon-btn--sm is-hidden" data-role="hud-gyro-recal-btn" data-action="recalibrate-gyro" aria-label="Centrer le gyroscope" title="Centrer l'angle du gyroscope">🎯</button>
                <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-hud-btn-desktop-only" data-action="toggle-mute" aria-label="Son" title="Effets sonores">🔊</button>
                <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-hud-btn-desktop-only" data-action="toggle-music" aria-label="Musique" title="Musique">🎵</button>
                <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-icon-btn--danger pk-hud-btn-desktop-only" data-action="leave" aria-label="Quitter la course" title="Quitter">✕</button>
              </div>
              <div class="pk-minimap-wrap">
                <canvas class="pk-minimap-canvas" data-role="minimap-canvas" width="120" height="120"></canvas>
              </div>
            </div>
            <div class="pk-killfeed" data-role="hud-killfeed" aria-live="polite"></div>
          </div>
        </div>

        <!-- Kinetic Local Action Popups -->
        <div class="pk-action-popups" data-role="action-popups" aria-live="polite"></div>

        <!-- Curved Arcade SVG Tachometer + 3-Tier Mini-Turbo Gauge + Coin Bonus -->
        <div class="pk-tacho-widget" data-role="tacho-widget" aria-hidden="true">
          <div class="pk-tacho-dial">
            <svg class="pk-tacho-svg" viewBox="0 0 160 118">
              <defs>
                <linearGradient id="pk-tacho-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#38bdf8" />
                  <stop offset="52%" stop-color="#22c55e" />
                  <stop offset="80%" stop-color="#facc15" />
                  <stop offset="100%" stop-color="#f43f5e" />
                </linearGradient>
              </defs>
              <path class="pk-tacho-track" d="M 40.17 107.42 A 52 52 0 1 1 119.83 107.42" />
              <path
                class="pk-tacho-fill"
                data-role="tacho-arc"
                d="M 40.17 107.42 A 52 52 0 1 1 119.83 107.42"
                stroke="url(#pk-tacho-grad)"
                stroke-dasharray="236"
                stroke-dashoffset="236"
              />
            </svg>
            <div class="pk-tacho-readout">
              <span class="pk-tacho-num" data-role="hud-speed">0</span>
              <span class="pk-tacho-unit">KM/H</span>
            </div>
            <div class="pk-tacho-coin-bonus" data-role="tacho-coin-bonus">+0%</div>
          </div>
          <div class="pk-tacho-drift" data-role="tacho-drift">
            <div class="pk-tacho-drift-segs">
              <span class="pk-drift-seg tier-1"></span>
              <span class="pk-drift-seg tier-2"></span>
              <span class="pk-drift-seg tier-3"></span>
            </div>
            <span class="pk-tacho-drift-lbl" data-role="tacho-drift-lbl">DRIFT</span>
          </div>
        </div>

        <!-- Center Dynamic Banners: Countdown + Rocket Gauge + Wrong-Way + Final Lap -->
        <div class="pk-center-overlay">
          <div class="pk-countdown-text is-hidden" data-role="countdown-text">3</div>

          <!-- Rocket Start Rev Gauge during 3-2-1 Countdown -->
          <div class="pk-rocket-gauge is-hidden" data-role="rocket-gauge">
            <div class="pk-rocket-hint" data-role="rocket-hint">🚀 MAINTIENS DÉRAPE AU "2" !</div>
            <div class="pk-rocket-bar-track">
              <div class="pk-rocket-sweetspot"></div>
              <div class="pk-rocket-bar-fill" data-role="rocket-fill"></div>
            </div>
          </div>

          <!-- Wrong-Way Alert Banner + Assisted Respawn Button -->
          <div class="pk-wrongway-banner is-hidden" data-role="wrongway-banner">
            <span class="pk-wrongway-label">🔄 DEMI-TOUR !</span>
            <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-sm" data-action="respawn">
              ↺ Replacer
            </button>
          </div>

          <div class="pk-rescue-banner is-hidden" data-role="rescue-banner">🎣 REPÊCHAGE EN COURS !</div>

          <div class="pk-lap-banner is-hidden" data-role="final-lap-banner">🔥 DERNIER TOUR ! 🔥</div>
        </div>

        <!-- Nearby Rival Proximity Edge Arrows (< 14u behind/beside) -->
        <div class="pk-prox-arrow pk-prox-arrow--left is-hidden" data-role="prox-left">
          <span class="pk-prox-chev" data-role="prox-left-chev">❮❮</span>
          <span class="pk-prox-dot" data-role="prox-left-dot"></span>
        </div>
        <div class="pk-prox-arrow pk-prox-arrow--right is-hidden" data-role="prox-right">
          <span class="pk-prox-dot" data-role="prox-right-dot"></span>
          <span class="pk-prox-chev" data-role="prox-right-chev">❯❯</span>
        </div>

        <!-- Rear Threat Radar Pill (Bottom-Center) -->
        <div class="pk-threat-radar is-hidden" data-role="threat-radar">
          <span class="pk-threat-icon" data-role="threat-icon">⚠️</span>
          <span class="pk-threat-label" data-role="threat-label">CARAPACE EN APPROCHE !</span>
        </div>

        <!-- Solo Pause & Race Options Modal Overlay -->
        <div class="pk-pause-backdrop is-hidden" data-role="pause-backdrop">
          <div class="pk-glass-card pk-pause-card">
            <h2 class="pk-pause-title" data-role="pause-title">⏸️ PAUSE</h2>

            <div class="pk-pause-section pk-pause-touch-section">
              <div class="pk-field-label">MODE VOLANT TACTILE</div>
              <div class="pk-steer-seg">
                <button type="button" class="pk-seg-btn is-selected" data-action="set-steer-joystick" data-role="seg-joystick">
                  🕹️ Joystick flottant
                </button>
                <button type="button" class="pk-seg-btn" data-action="set-steer-buttons" data-role="seg-buttons">
                  ◀▶ Boutons
                </button>
              </div>
            </div>

            <div class="pk-pause-section pk-pause-touch-section" data-role="pause-gyro-section">
              <div class="pk-field-label">VOLANT GYROSCOPE & SENSIBILITÉ</div>
              <div class="pk-quality-seg" role="group" aria-label="Sensibilité Gyroscope">
                ${GYRO_SENS_OPTIONS.map(
                  (opt) =>
                    `<button type="button" class="pk-quality-btn" data-action="set-gyro-sens" data-sens="${opt.id}" title="${opt.desc}">${opt.label}</button>`
                ).join('')}
              </div>
              <div class="pk-pause-gyro-actions">
                <button type="button" class="pk-util-pill" data-action="recalibrate-gyro">🎯 Centrer Gyro</button>
                <button type="button" class="pk-util-pill" data-action="toggle-gyro-invert" data-role="pause-gyro-invert-pill">⇄ Axe: Normal</button>
              </div>
            </div>

            <div class="pk-pause-section">
              <div class="pk-field-label">QUALITÉ GRAPHIQUE</div>
              <div class="pk-quality-seg" role="group" aria-label="Qualité graphique">
                ${QUALITY_OPTIONS.map(
                  (opt) =>
                    `<button type="button" class="pk-quality-btn" data-action="set-quality" data-quality="${opt.id}" title="${opt.desc}">${opt.icon} ${opt.label}</button>`
                ).join('')}
              </div>
            </div>

            <div class="pk-pause-toggles">
              <button type="button" class="pk-util-pill" data-action="toggle-auto-accel">⚡ Auto-Gaz: ON</button>
              <button type="button" class="pk-util-pill" data-action="toggle-gyro" data-role="pause-gyro-pill">📱 Gyro: OFF</button>
              <button type="button" class="pk-util-pill pk-pause-touch-only" data-action="toggle-haptics" data-role="pause-haptics-pill">📳 Vibrations: ON</button>
              <button type="button" class="pk-util-pill" data-action="toggle-music" data-role="pause-music-pill">🎵 Musique: ON</button>
              <button type="button" class="pk-util-pill" data-action="toggle-mute" data-role="pause-sfx-pill">🔊 Son: ON</button>
              <button type="button" class="pk-util-pill" data-action="fullscreen" data-role="pause-fullscreen-pill">⛶ Plein écran</button>
              <button type="button" class="pk-util-pill" data-action="open-controls">❓ Commandes</button>
              <span class="pk-gamepad-badge is-hidden" data-role="gamepad-badge">
                <span class="pk-gamepad-dot"></span>
                <span class="pk-gamepad-txt" data-role="gamepad-badge-txt">🎮 Manette</span>
              </span>
            </div>

            <div class="pk-pause-actions">
              <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="resume-solo">
                ▶️ Reprendre
              </button>
              <div class="pk-pause-sub-actions">
                <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="pause-respawn">
                  ↺ Replacer
                </button>
                <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-sm" data-action="pause-restart" data-role="pause-restart-btn">
                  🔄 Recommencer
                </button>
                <button type="button" class="pk-arcade-btn pk-btn-ghost pk-btn-sm" data-action="pause-leave">
                  🏠 Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== FINISH / PODIUM SCREEN ==================== -->
      <section class="pk-screen pk-screen-finished is-hidden" data-screen="finished">
        <div class="pk-podium-3d-bar">
          <button type="button" class="pk-arcade-btn pk-btn-glass pk-btn-sm pk-podium-3d-btn" data-action="toggle-podium-3d" data-role="podium-3d-btn">
            👁️ Vue Podium 3D
          </button>
        </div>

        <div class="pk-glass-card pk-podium-card" data-role="podium-card">
          <div class="pk-podium-header">
            <div class="pk-podium-trophy" data-role="podium-trophy">🏆</div>
            <div class="pk-podium-heading-wrap">
              <h2 class="pk-podium-title" data-role="podium-title">VICTOIRE !</h2>
              <p class="pk-podium-subtitle" data-role="podium-subtitle">Classement officiel</p>
            </div>
          </div>

          <!-- Highlighted Award Strip -->
          <div class="pk-awards-strip" data-role="awards-strip"></div>

          <!-- Progression Rewards + Cup Standings -->
          <div class="pk-podium-progression is-hidden" data-role="podium-progression"></div>

          <div class="pk-podium-table" data-role="podium-table"></div>

          <div class="pk-podium-auth-slot" data-role="podium-auth-slot"></div>

          <!-- Viral Share Row: Story Card PNG + Ghost Challenge Link -->
          <div class="pk-viral-actions">
            <button type="button" class="pk-arcade-btn pk-btn-electric pk-btn-sm" data-action="share-story">
              📸 Carte Podium (Image)
            </button>
            <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="share-ghost">
              👻 Défier un ami (Fantôme)
            </button>
          </div>

          <div class="pk-podium-actions">
            <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-lg is-hidden" data-action="next-gp-race" data-role="next-gp-btn">
              ⏭️ Course suivante
            </button>
            <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="rematch" data-role="rematch-btn">
              🔄 Rejouer
            </button>
            <button type="button" class="pk-arcade-btn pk-btn-ghost pk-btn-lg" data-action="leave">
              🏠 Menu
            </button>
          </div>
        </div>
      </section>

      <!-- ==================== ONLINE MULTIPLAYER MODAL ==================== -->
      <div class="pk-modal-backdrop is-hidden" data-role="online-backdrop" role="dialog" aria-modal="true" aria-label="Multijoueur en ligne">
        <div class="pk-glass-card pk-modal-card pk-online-modal">
          <div class="pk-modal-header">
            <div class="pk-modal-title-group">
              <h2 class="pk-modal-title">🌐 Multijoueur en Ligne</h2>
            </div>
            <button type="button" class="pk-mini-pill" data-action="close-online" aria-label="Fermer">✕</button>
          </div>

          <div class="pk-modal-scroll pk-online-body">
            <div class="pk-online-summary" data-role="online-summary">
              🏁 Course • 100cc • 🌴 Circuit Coco
            </div>

            <button type="button" class="pk-arcade-btn pk-btn-electric pk-btn-lg pk-online-full-btn" data-action="public-match">
              <span class="pk-btn-emoji">⚡</span>
              <span>Partie Publique Rapide</span>
            </button>

            <div class="pk-online-divider"><span>OU SALON PRIVÉ</span></div>

            <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-lg pk-online-full-btn" data-action="create-room" data-role="create-room-btn">
              <span data-role="create-room-label">🌐 Créer un Salon 🔒</span>
            </button>

            <div class="pk-join-group pk-join-group--modal" data-role="join-group">
              <input
                type="text"
                class="pk-code-input"
                data-role="room-code-input"
                maxlength="4"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="CODE"
                aria-label="Code salon à 4 lettres"
              />
              <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-md" data-action="join-room">
                <span>🔗 Rejoindre</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== PROFILE & CAREER MODAL ==================== -->
      <div class="pk-modal-backdrop is-hidden" data-role="profile-backdrop" role="dialog" aria-modal="true" aria-label="Profil Pilote et Carrière">
        <div class="pk-glass-card pk-modal-card pk-profile-modal">
          <div class="pk-modal-header">
            <div class="pk-modal-title-group">
              <h2 class="pk-modal-title">🪪 Profil Pilote</h2>
              <span class="pk-level-badge" data-role="career-level">Niv. 1</span>
            </div>
            <button type="button" class="pk-mini-pill" data-action="close-profile" aria-label="Fermer">✕</button>
          </div>

          <div class="pk-modal-scroll pk-profile-modal-body">
            <div class="pk-profile-row pk-profile-row--modal">
              <label class="pk-field-label" for="pk-player-name">PSEUDO PILOTE</label>
              <input
                id="pk-player-name"
                class="pk-text-input"
                type="text"
                maxlength="14"
                autocomplete="off"
                spellcheck="false"
                placeholder="Ton pseudo…"
              />
            </div>

            <div class="pk-career-bar pk-career-bar--modal" data-role="career-bar">
              <div class="pk-career-left">
                <div class="pk-xp-meta">
                  <div class="pk-xp-top">
                    <span class="pk-rank-title" data-role="career-title">🌱 Rookie du Bitume</span>
                    <span class="pk-xp-text" data-role="career-xp-text">0 / 120 XP</span>
                  </div>
                  <div class="pk-xp-bar-wrap">
                    <div class="pk-xp-bar-fill" data-role="career-xp-fill" style="width: 0%"></div>
                  </div>
                </div>
              </div>
              <span class="pk-coin-chip" data-role="career-coins">🪙 0</span>
            </div>

            <div class="pk-profile-shortcuts">
              <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-md" data-action="open-garage">
                🏎️ Ouvrir Garage
              </button>
              <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-md" data-action="open-challenges">
                🎯 Défis & Stats
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== GARAGE MODAL ==================== -->
      <div class="pk-modal-backdrop is-hidden" data-role="garage-backdrop" role="dialog" aria-modal="true" aria-label="Garage Karts & Boost">
        <div class="pk-glass-card pk-modal-card pk-garage-modal">
          <div class="pk-modal-header">
            <div class="pk-modal-title-group">
              <h2 class="pk-modal-title">🏎️ Garage & Atelier Boost</h2>
              <span class="pk-coin-chip" data-role="garage-coins">🪙 0</span>
            </div>
            <button type="button" class="pk-mini-pill" data-action="close-garage" aria-label="Fermer le garage">✕</button>
          </div>

          <div class="pk-modal-scroll">
            <div class="pk-garage-equipped-bar" data-role="garage-equipped-bar"></div>

            <div class="pk-field-label">CHÂSSIS DE KART (6 MODÈLES • COMPARATIF VS ÉQUIPÉ)</div>
            <div class="pk-garage-grid" data-role="garage-karts-grid"></div>

            <div class="pk-field-label pk-mt-12">COULEUR BOOST & NÉON (5 STYLES)</div>
            <div class="pk-boost-grid" data-role="garage-boosts-grid"></div>
          </div>
        </div>
      </div>

      <!-- ==================== CONTROLS HELP MODAL ==================== -->
      <div class="pk-modal-backdrop is-hidden" data-role="controls-backdrop" role="dialog" aria-modal="true" aria-label="Guide des Commandes">
        <div class="pk-glass-card pk-modal-card pk-controls-modal">
          <div class="pk-modal-header">
            <div class="pk-modal-title-group">
              <h2 class="pk-modal-title">🎮 Guide des Commandes</h2>
              <span class="pk-gamepad-badge is-hidden" data-role="gamepad-badge">
                <span class="pk-gamepad-dot"></span>
                <span class="pk-gamepad-txt" data-role="gamepad-badge-txt">🎮 Manette</span>
              </span>
            </div>
            <button type="button" class="pk-mini-pill" data-action="close-controls" aria-label="Fermer l'aide">✕</button>
          </div>

          <div class="pk-controls-tabs" role="tablist">
            <button type="button" class="pk-seg-btn is-selected" data-action="controls-tab" data-tab="touch" role="tab">👆 Tactile</button>
            <button type="button" class="pk-seg-btn" data-action="controls-tab" data-tab="keyboard" role="tab">⌨️ Clavier</button>
            <button type="button" class="pk-seg-btn" data-action="controls-tab" data-tab="gamepad" role="tab">🎮 Manette</button>
          </div>

          <div class="pk-modal-scroll pk-controls-body" data-role="controls-body"></div>
        </div>
      </div>

      <!-- ==================== FLASH CHALLENGES MODAL ==================== -->
      <div class="pk-modal-backdrop is-hidden" data-role="challenges-backdrop" role="dialog" aria-modal="true" aria-label="Défis Flash et Carrière">
        <div class="pk-glass-card pk-modal-card pk-challenges-modal">
          <div class="pk-modal-header">
            <div class="pk-modal-title-group">
              <h2 class="pk-modal-title">🎯 Défis Flash & Carrière</h2>
              <span class="pk-level-badge" data-role="challenges-level">Niv. 1</span>
            </div>
            <button type="button" class="pk-mini-pill" data-action="close-challenges" aria-label="Fermer les défis">✕</button>
          </div>

          <div class="pk-modal-scroll">
            <div class="pk-field-label">DÉFIS EN COURS (RENOUVELÉS AUTOMATIQUEMENT)</div>
            <div class="pk-challenges-list" data-role="challenges-list"></div>

            <div class="pk-field-label pk-mt-12">STATISTIQUES DE CARRIÈRE</div>
            <div class="pk-career-stats-grid" data-role="career-stats-grid"></div>
          </div>
        </div>
      </div>

      <!-- ==================== TOAST NOTIFICATIONS ==================== -->
      <div class="pk-toast-stack" data-role="toast-stack" aria-live="polite"></div>
    `;

    this.rootEl.appendChild(this.el);

    // Cache DOM refs
    this.speedLinesEl = this.el.querySelector('[data-role="speed-lines"]');
    this.portraitBannerEl = this.el.querySelector('[data-role="portrait-banner"]');

    this.screens = {
      home: this.el.querySelector('[data-screen="home"]'),
      lobby: this.el.querySelector('[data-screen="lobby"]'),
      hud: this.el.querySelector('[data-screen="hud"]'),
      finished: this.el.querySelector('[data-screen="finished"]'),
    };

    // Home & Paddock refs
    this.stageDragLayerEl = this.el.querySelector('[data-role="stage-drag-layer"]');
    this.paddockViewEl = this.el.querySelector('[data-role="paddock-view"]');
    this.tracksShowcaseEl = this.el.querySelector('[data-role="tracks-showcase"]');
    this.topbarLevelEl = this.el.querySelector('[data-role="topbar-level"]');
    this.topbarNameEl = this.el.querySelector('[data-role="topbar-name"]');
    this.topbarCoinsEl = this.el.querySelector('[data-role="topbar-coins"]');
    this.topbarGyroBtnEl = this.el.querySelector('[data-role="topbar-gyro-btn"]');
    this.topbarGyroTxtEl = this.el.querySelector('[data-role="topbar-gyro-txt"]');
    this.settingsPopoverEl = this.el.querySelector('[data-role="settings-popover"]');
    this.settingsTriggerEl = this.el.querySelector('[data-action="toggle-settings-popover"]');

    this.featuredTrackBtnEl = this.el.querySelector('[data-role="featured-track-btn"]');
    this.featuredMapEl = this.el.querySelector('[data-role="featured-map"]');
    this.featuredFormatBadgeEl = this.el.querySelector('[data-role="featured-format-badge"]');
    this.featuredTitleEl = this.el.querySelector('[data-role="featured-title"]');
    this.featuredSubEl = this.el.querySelector('[data-role="featured-sub"]');

    this.spotlightEl = this.el.querySelector('[data-role="showcase-spotlight"]');
    this.spotlightDiffEl = this.el.querySelector('[data-role="spotlight-diff"]');
    this.spotlightTitleEl = this.el.querySelector('[data-role="spotlight-title"]');
    this.spotlightChipsEl = this.el.querySelector('[data-role="spotlight-chips"]');
    this.showcaseLaunchIconEl = this.el.querySelector('[data-role="showcase-launch-icon"]');
    this.showcaseLaunchLabelEl = this.el.querySelector('[data-role="showcase-launch-label"]');

    this.careerLevelEl = this.el.querySelector('[data-role="career-level"]');
    this.careerTitleEl = this.el.querySelector('[data-role="career-title"]');
    this.careerXpTextEl = this.el.querySelector('[data-role="career-xp-text"]');
    this.careerXpFillEl = this.el.querySelector('[data-role="career-xp-fill"]');
    this.careerCoinsEl = this.el.querySelector('[data-role="career-coins"]');
    this.garageNotifEl = this.el.querySelector('[data-role="garage-notif"]');
    this.formatStripEl = this.el.querySelector('[data-role="format-strip"]');
    this.ccStripEl = this.el.querySelector('[data-role="cc-strip"]');
    this.homeTrackLabelEl = this.el.querySelector('[data-role="home-track-label"]');
    this.quickPlayIconEl = this.el.querySelector('[data-role="quick-play-icon"]');
    this.quickPlayLabelEl = this.el.querySelector('[data-role="quick-play-label"]');

    this.ghostBannerEl = this.el.querySelector('[data-role="ghost-banner"]');
    this.ghostDescEl = this.el.querySelector('[data-role="ghost-desc"]');
    this.nameInputEl = this.el.querySelector('#pk-player-name');
    this.racerStripEl = this.el.querySelector('[data-role="racer-strip"]');
    this.selectedRacerNameEl = this.el.querySelector('[data-role="selected-racer-name"]');
    this.homeTrackStripEl = this.el.querySelector('[data-role="home-track-strip"]');
    this.selectedTrackSubEl = this.el.querySelector('[data-role="selected-track-sub"]');
    this.roomCodeInputEl = this.el.querySelector('[data-role="room-code-input"]');
    this.joinGroupEl = this.el.querySelector('[data-role="join-group"]');
    this.inviteCalloutEl = this.el.querySelector('[data-role="invite-callout"]');
    this.inviteCodeEl = this.el.querySelector('[data-role="invite-code"]');

    // Online & Profile Modals
    this.onlineBackdropEl = this.el.querySelector('[data-role="online-backdrop"]');
    this.onlineSummaryEl = this.el.querySelector('[data-role="online-summary"]');
    this.profileBackdropEl = this.el.querySelector('[data-role="profile-backdrop"]');

    // Lobby refs
    this.lobbyModeLabelEl = this.el.querySelector('[data-role="lobby-mode-label"]');
    this.lobbyCodeEl = this.el.querySelector('[data-role="lobby-code"]');
    this.lobbyOptionsBarEl = this.el.querySelector('[data-role="lobby-options-bar"]');
    this.lobbyLoadoutBarEl = this.el.querySelector('[data-role="lobby-loadout-bar"]');
    this.lobbyTrackHintEl = this.el.querySelector('[data-role="lobby-track-hint"]');
    this.lobbyTrackStripEl = this.el.querySelector('[data-role="lobby-track-strip"]');
    this.qrBoxEl = this.el.querySelector('[data-role="qr-box"]');
    this.qrSvgWrapEl = this.el.querySelector('[data-role="qr-svg"]');
    this.lobbyRosterEl = this.el.querySelector('[data-role="lobby-roster"]');
    this.hostControlsEl = this.el.querySelector('[data-role="host-controls"]');
    this.guestWaitEl = this.el.querySelector('[data-role="guest-wait"]');
    this.guestWaitTextEl = this.el.querySelector('[data-role="guest-wait-text"]');
    this.botCountEl = this.el.querySelector('[data-role="bot-count"]');
    this.botsDecBtn = this.el.querySelector('[data-action="bots-dec"]');
    this.botsIncBtn = this.el.querySelector('[data-action="bots-inc"]');

    // HUD refs
    this.hudRankEl = this.el.querySelector('[data-role="hud-rank"]');
    this.hudRankNumEl = this.el.querySelector('[data-role="hud-rank-num"]');
    this.hudRankSupEl = this.el.querySelector('[data-role="hud-rank-sup"]');
    this.hudLapEl = this.el.querySelector('[data-role="hud-lap"]');
    this.hudClockEl = this.el.querySelector('[data-role="hud-clock"]');
    this.hudSplitDeltaEl = this.el.querySelector('[data-role="hud-split-delta"]');
    this.hudSpeedEl = this.el.querySelector('[data-role="hud-speed"]');
    this.hudCoinsEl = this.el.querySelector('[data-role="hud-coins"]');
    this.hudDraftEl = this.el.querySelector('[data-role="hud-draft"]');
    this.hudModeBannerEl = this.el.querySelector('[data-role="hud-mode-banner"]');
    this.standingsTowerEl = this.el.querySelector('[data-role="standings-tower"]');
    this.killfeedEl = this.el.querySelector('[data-role="hud-killfeed"]');
    this.actionPopupsEl = this.el.querySelector('[data-role="action-popups"]');
    this.tachoWidgetEl = this.el.querySelector('[data-role="tacho-widget"]');
    this.tachoArcEl = this.el.querySelector('[data-role="tacho-arc"]');
    this.tachoCoinBonusEl = this.el.querySelector('[data-role="tacho-coin-bonus"]');
    this.tachoDriftEl = this.el.querySelector('[data-role="tacho-drift"]');
    this.tachoDriftLblEl = this.el.querySelector('[data-role="tacho-drift-lbl"]');
    this.emoteBarEl = this.el.querySelector('[data-role="emote-bar"]');
    this.hudItemBoxEl = this.el.querySelector('[data-role="hud-item-box"]');
    this.hudItemIconEl = this.el.querySelector('[data-role="hud-item-icon"]');
    this.hudItemNameEl = this.el.querySelector('[data-role="hud-item-name"]');
    this.pauseSoloBtnEl = this.el.querySelector('[data-role="btn-pause-solo"]');
    this.hudGyroRecalBtnEl = this.el.querySelector('[data-role="hud-gyro-recal-btn"]');
    this.popoverGyroControlsEl = this.el.querySelector('[data-role="popover-gyro-controls"]');
    this.popoverHapticsBtnEl = this.el.querySelector('[data-role="popover-haptics-btn"]');
    this.minimapCanvas = this.el.querySelector('[data-role="minimap-canvas"]');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.countdownTextEl = this.el.querySelector('[data-role="countdown-text"]');
    this.rocketGaugeEl = this.el.querySelector('[data-role="rocket-gauge"]');
    this.rocketHintEl = this.el.querySelector('[data-role="rocket-hint"]');
    this.rocketFillEl = this.el.querySelector('[data-role="rocket-fill"]');
    this.wrongWayBannerEl = this.el.querySelector('[data-role="wrongway-banner"]');
    this.rescueBannerEl = this.el.querySelector('[data-role="rescue-banner"]');
    this.finalLapBannerEl = this.el.querySelector('[data-role="final-lap-banner"]');

    // Rival proximity arrows
    this.proxLeftEl = this.el.querySelector('[data-role="prox-left"]');
    this.proxLeftChevEl = this.el.querySelector('[data-role="prox-left-chev"]');
    this.proxLeftDotEl = this.el.querySelector('[data-role="prox-left-dot"]');
    this.proxRightEl = this.el.querySelector('[data-role="prox-right"]');
    this.proxRightChevEl = this.el.querySelector('[data-role="prox-right-chev"]');
    this.proxRightDotEl = this.el.querySelector('[data-role="prox-right-dot"]');

    // Rear radar & Pause modal
    this.threatRadarEl = this.el.querySelector('[data-role="threat-radar"]');
    this.threatIconEl = this.el.querySelector('[data-role="threat-icon"]');
    this.threatLabelEl = this.el.querySelector('[data-role="threat-label"]');
    this.pauseBackdropEl = this.el.querySelector('[data-role="pause-backdrop"]');
    this.pauseTitleEl = this.el.querySelector('[data-role="pause-title"]');
    this.pauseGyroSectionEl = this.el.querySelector('[data-role="pause-gyro-section"]');
    this.pauseGyroInvertPillEl = this.el.querySelector('[data-role="pause-gyro-invert-pill"]');
    this.pauseHapticsPillEl = this.el.querySelector('[data-role="pause-haptics-pill"]');
    this.pauseFullscreenPillEl = this.el.querySelector('[data-role="pause-fullscreen-pill"]');
    this.pauseRestartBtnEl = this.el.querySelector('[data-role="pause-restart-btn"]');
    this.segJoystickEl = this.el.querySelector('[data-role="seg-joystick"]');
    this.segButtonsEl = this.el.querySelector('[data-role="seg-buttons"]');
    this.pauseGyroPillEl = this.el.querySelector('[data-role="pause-gyro-pill"]');
    this.pauseMusicPillEl = this.el.querySelector('[data-role="pause-music-pill"]');
    this.pauseSfxPillEl = this.el.querySelector('[data-role="pause-sfx-pill"]');

    // Podium refs
    this.podiumCardEl = this.el.querySelector('[data-role="podium-card"]');
    this.podium3DBtnEl = this.el.querySelector('[data-role="podium-3d-btn"]');
    this.podiumTrophyEl = this.el.querySelector('[data-role="podium-trophy"]');
    this.podiumTitleEl = this.el.querySelector('[data-role="podium-title"]');
    this.podiumSubtitleEl = this.el.querySelector('[data-role="podium-subtitle"]');
    this.awardsStripEl = this.el.querySelector('[data-role="awards-strip"]');
    this.podiumProgressionEl = this.el.querySelector('[data-role="podium-progression"]');
    this.podiumTableEl = this.el.querySelector('[data-role="podium-table"]');
    this.podiumAuthSlotEl = this.el.querySelector('[data-role="podium-auth-slot"]');
    this.nextGpBtnEl = this.el.querySelector('[data-action="next-gp-race"]');
    this.rematchBtnEl = this.el.querySelector('[data-action="rematch"]');
    this.createRoomBtnEl = this.el.querySelector('[data-role="create-room-btn"]');
    this.createRoomLabelEl = this.el.querySelector('[data-role="create-room-label"]');

    // Modals (Garage + Flash Challenges + Controls)
    this.garageBackdropEl = this.el.querySelector('[data-role="garage-backdrop"]');
    this.garageEquippedBarEl = this.el.querySelector('[data-role="garage-equipped-bar"]');
    this.garageCoinsEl = this.el.querySelector('[data-role="garage-coins"]');
    this.garageKartsGridEl = this.el.querySelector('[data-role="garage-karts-grid"]');
    this.garageBoostsGridEl = this.el.querySelector('[data-role="garage-boosts-grid"]');
    this.challengesBackdropEl = this.el.querySelector('[data-role="challenges-backdrop"]');
    this.challengesLevelEl = this.el.querySelector('[data-role="challenges-level"]');
    this.challengesListEl = this.el.querySelector('[data-role="challenges-list"]');
    this.careerStatsGridEl = this.el.querySelector('[data-role="career-stats-grid"]');
    this.controlsBackdropEl = this.el.querySelector('[data-role="controls-backdrop"]');
    this.controlsBodyEl = this.el.querySelector('[data-role="controls-body"]');

    // Toast stack
    this.toastStackEl = this.el.querySelector('[data-role="toast-stack"]');

    this._buildRacerPills();
    this._buildTrackCards(this.lobbyTrackStripEl, false);
    this._buildEmoteButtons();
  }

  _buildRacerPills() {
    this.racerStripEl.innerHTML = '';
    RACERS.forEach((racer) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pk-racer-pill';
      btn.dataset.racerId = racer.id;
      btn.style.setProperty('--racer-color', racer.color);
      btn.style.setProperty('--racer-accent', racer.accent);
      btn.style.setProperty('--helmet-color', racer.helmetColor);

      const swatch = document.createElement('span');
      swatch.className = 'pk-racer-avatar';
      if (racer.emoji) {
        swatch.textContent = racer.emoji;
      } else {
        const helmetDot = document.createElement('span');
        helmetDot.className = 'pk-racer-helmet';
        swatch.appendChild(helmetDot);
      }

      const label = document.createElement('span');
      label.className = 'pk-racer-name';
      label.textContent = racer.name;

      const lockTag = document.createElement('span');
      lockTag.className = 'pk-racer-lock-tag is-hidden';
      lockTag.textContent = `🔒 Niv.${racer.unlockLevel || 3}`;

      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.appendChild(lockTag);

      btn.addEventListener('click', () => {
        if (!this.unlockedRacers.has(racer.id)) {
          this.callbacks.onLockedRacerClick?.(racer);
          return;
        }
        this._selectRacer(racer.id, true);
      });

      this.racerStripEl.appendChild(btn);
    });
  }

  _buildTrackCards(containerEl, isHome) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    TRACKS.forEach((track) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pk-track-card';
      card.dataset.trackId = track.id;
      card.style.setProperty('--track-accent', track.accent);

      const mapWrap = document.createElement('span');
      mapWrap.className = 'pk-track-map';
      mapWrap.innerHTML = buildTrackSvgMarkup(track.id, track.accent);

      const body = document.createElement('span');
      body.className = 'pk-track-body';

      const title = document.createElement('span');
      title.className = 'pk-track-name';
      title.textContent = `${track.icon} ${track.name}`;

      const diff = document.createElement('span');
      diff.className = 'pk-track-diff';
      diff.textContent = String(track.difficulty || '').trim();

      body.appendChild(title);
      body.appendChild(diff);
      card.appendChild(mapWrap);
      card.appendChild(body);

      card.addEventListener('click', () => {
        if (!isHome && !this._isLobbyHost) return;
        this._selectTrack(track.id, true);
      });

      containerEl.appendChild(card);
    });
  }

  _hasOpenModal() {
    return Boolean(
      (this.garageBackdropEl && !this.garageBackdropEl.classList.contains('is-hidden')) ||
        (this.challengesBackdropEl && !this.challengesBackdropEl.classList.contains('is-hidden')) ||
        (this.onlineBackdropEl && !this.onlineBackdropEl.classList.contains('is-hidden')) ||
        (this.profileBackdropEl && !this.profileBackdropEl.classList.contains('is-hidden')) ||
        (this.controlsBackdropEl && !this.controlsBackdropEl.classList.contains('is-hidden'))
    );
  }

  _syncRootDatasets() {
    if (!this.rootEl) return;
    this.rootEl.dataset.screen = this.activeScreen || 'home';
    this.rootEl.dataset.homeView = this.homeView || 'paddock';
    this.rootEl.dataset.modalOpen = String(this._hasOpenModal());
  }

  _toggleSettingsPopover(forceState) {
    const next =
      typeof forceState === 'boolean' ? forceState : !this._settingsPopoverOpen;
    this._settingsPopoverOpen = next;
    this.settingsPopoverEl?.classList.toggle('is-hidden', !next);
    this.settingsTriggerEl?.classList.toggle('is-active-toggle', next);
  }

  _setHomeView(view, notify = true) {
    const nextView = view === 'tracks' ? 'tracks' : 'paddock';
    this._toggleSettingsPopover(false);
    if (this.homeView !== nextView) {
      this.homeView = nextView;
      if (this.screens.home) {
        this.screens.home.dataset.homeView = nextView;
      }
      this.paddockViewEl?.classList.toggle('is-hidden', nextView !== 'paddock');
      this.tracksShowcaseEl?.classList.toggle('is-hidden', nextView !== 'tracks');
      this._syncRootDatasets();
      if (nextView === 'tracks') {
        this._renderFormatControls();
        this._renderHomeContextCards();
        requestAnimationFrame(() => this._scrollCarouselToActive('auto'));
      } else {
        this._syncFeaturedTrackCard();
      }
      if (notify) {
        this.callbacks.onMenuViewChange?.(nextView);
      }
    } else if (nextView === 'tracks') {
      requestAnimationFrame(() => this._scrollCarouselToActive('smooth'));
    }
  }

  _scrollCarouselToActive(behavior = 'smooth') {
    const strip = this.homeTrackStripEl;
    if (!strip || this.homeView !== 'tracks') return;
    const activeCard = strip.querySelector('.pk-carousel-card.is-selected');
    if (!activeCard) return;
    const targetLeft = Math.max(
      0,
      activeCard.offsetLeft - (strip.clientWidth - activeCard.offsetWidth) * 0.5
    );
    if (Math.abs(strip.scrollLeft - targetLeft) < 4) return;
    this._suppressCarouselScrollUntil = performance.now() + (behavior === 'smooth' ? 320 : 120);
    strip.scrollTo({ left: targetLeft, behavior });
  }

  _stepCarousel(dir) {
    const strip = this.homeTrackStripEl;
    if (!strip) return;
    const cards = Array.from(strip.querySelectorAll('.pk-carousel-card'));
    if (cards.length <= 1) return;
    const currentIdx = Math.max(
      0,
      cards.findIndex((c) => c.classList.contains('is-selected'))
    );
    const nextIdx = (currentIdx + (dir >= 0 ? 1 : -1) + cards.length) % cards.length;
    cards[nextIdx]?.click();
  }

  _handleCarouselScrollEnd() {
    if (this.homeView !== 'tracks' || performance.now() < this._suppressCarouselScrollUntil) {
      return;
    }
    const strip = this.homeTrackStripEl;
    if (!strip) return;
    const cards = Array.from(strip.querySelectorAll('.pk-carousel-card'));
    if (cards.length <= 1) return;

    const viewCenter = strip.scrollLeft + strip.clientWidth * 0.5;
    let bestCard = null;
    let bestDist = Infinity;
    for (const card of cards) {
      const cardCenter = card.offsetLeft + card.offsetWidth * 0.5;
      const dist = Math.abs(cardCenter - viewCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestCard = card;
      }
    }
    if (!bestCard || bestCard.classList.contains('is-selected')) return;

    if (bestCard.dataset.cupId) {
      this.callbacks.onUiSound?.('tick');
      this.callbacks.onSelectCup?.(bestCard.dataset.cupId);
    } else if (bestCard.dataset.trackId) {
      this.callbacks.onUiSound?.('tick');
      this._selectTrack(bestCard.dataset.trackId, true);
    }
  }

  _syncFeaturedTrackCard() {
    const fmt = GAME_FORMATS.find((f) => f.id === this.selectedFormat) || GAME_FORMATS[0];
    const ccLabel = CC_CLASSES[this.selectedCc]?.label || this.selectedCc || '100cc';
    const mirrorTag = this.mirrorMode && this.selectedFormat !== 'balloon' ? ' • ⇄ Miroir' : '';

    if (this.featuredFormatBadgeEl) {
      this.featuredFormatBadgeEl.textContent = `${fmt.icon} ${fmt.name} • ${ccLabel}${mirrorTag}`;
    }

    if (this.selectedFormat === 'grandprix') {
      const cup = CUPS.find((c) => c.id === this.selectedCupId) || CUPS[0];
      const previewTrackId = getTrackKey(cup.tracks[0], this.mirrorMode);
      if (this.featuredMapEl) {
        this.featuredMapEl.innerHTML = buildTrackSvgMarkup(previewTrackId, cup.accent);
      }
      if (this.featuredTitleEl) {
        this.featuredTitleEl.textContent = `${cup.icon} ${cup.name}`;
      }
      if (this.featuredSubEl) {
        this.featuredSubEl.textContent = `${cup.tracks.map((id) => getTrackById(id).icon).join(' ')} • ${cup.tracks.length} circuits`;
      }
      if (this.featuredTrackBtnEl) {
        this.featuredTrackBtnEl.style.setProperty('--track-accent', cup.accent);
      }
      if (this.onlineSummaryEl) {
        this.onlineSummaryEl.textContent = `${fmt.icon} ${fmt.name} • ${ccLabel}${mirrorTag} • ${cup.icon} ${cup.name}`;
      }
      return;
    }

    if (this.selectedFormat === 'balloon') {
      if (this.featuredMapEl) {
        this.featuredMapEl.innerHTML = buildTrackSvgMarkup('arena', ARENA_TRACK.accent);
      }
      if (this.featuredTitleEl) {
        this.featuredTitleEl.textContent = `${ARENA_TRACK.icon} ${ARENA_TRACK.name}`;
      }
      if (this.featuredSubEl) {
        this.featuredSubEl.textContent = `3 ballons ❤️ • 90s • Combat 360°`;
      }
      if (this.featuredTrackBtnEl) {
        this.featuredTrackBtnEl.style.setProperty('--track-accent', ARENA_TRACK.accent);
      }
      if (this.onlineSummaryEl) {
        this.onlineSummaryEl.textContent = `${fmt.icon} ${fmt.name} • ${ccLabel} • ${ARENA_TRACK.icon} ${ARENA_TRACK.name}`;
      }
      return;
    }

    const baseId = getBaseTrackId(this.selectedTrackId);
    const effKey = getTrackKey(baseId, this.mirrorMode);
    const track = getTrackById(effKey);
    const tel = getTrackTelemetry(baseId, this.profile, this.mirrorMode);

    if (this.featuredMapEl) {
      this.featuredMapEl.innerHTML = buildTrackSvgMarkup(effKey, track.accent);
    }
    if (this.featuredTitleEl) {
      this.featuredTitleEl.textContent = `${track.icon} ${track.name}`;
    }
    if (this.featuredSubEl) {
      this.featuredSubEl.textContent = `${track.subtitle} • ${tel.compact}`;
    }
    if (this.featuredTrackBtnEl) {
      this.featuredTrackBtnEl.style.setProperty('--track-accent', track.accent);
    }
    if (this.onlineSummaryEl) {
      this.onlineSummaryEl.textContent = `${fmt.icon} ${fmt.name} • ${ccLabel}${mirrorTag} • ${track.icon} ${track.name}`;
    }
  }

  _renderCareerBar() {
    const xp = this.profile?.xp || 0;
    const lvlInfo = computeLevelFromXp(xp);
    const coins = this.profile?.coins || 0;
    const title = getRankTitle(lvlInfo.level);
    const xpSpan = Math.max(1, (lvlInfo.nextLevelXp || 0) - (lvlInfo.currentLevelXp || 0));

    if (this.careerLevelEl) this.careerLevelEl.textContent = `Niv. ${lvlInfo.level}`;
    if (this.topbarLevelEl) this.topbarLevelEl.textContent = `Niv. ${lvlInfo.level}`;
    if (this.topbarNameEl) this.topbarNameEl.textContent = this.playerName || 'Pilote';
    if (this.topbarCoinsEl) this.topbarCoinsEl.textContent = `🪙 ${coins}`;
    if (this.careerTitleEl) this.careerTitleEl.textContent = title;
    if (this.careerXpTextEl) {
      this.careerXpTextEl.textContent = lvlInfo.isMax
        ? `${lvlInfo.xp} XP • MAX`
        : `${lvlInfo.xpIntoLevel} / ${xpSpan} XP`;
    }
    if (this.careerXpFillEl) {
      this.careerXpFillEl.style.width = `${Math.round(lvlInfo.progress * 100)}%`;
    }
    if (this.careerCoinsEl) this.careerCoinsEl.textContent = `🪙 ${coins}`;

    const unlockedKarts = new Set(this.profile?.unlockedKarts || ['classic']);
    const unlockedBoosts = new Set(this.profile?.unlockedBoosts || ['flame']);
    const canBuyKart = KARTS.some((k) => !unlockedKarts.has(k.id) && coins >= k.cost);
    const canBuyBoost = BOOST_STYLES.some((b) => !unlockedBoosts.has(b.id) && coins >= b.cost);
    this.garageNotifEl?.classList.toggle('is-hidden', !(canBuyKart || canBuyBoost));
  }

  _renderFormatControls() {
    if (!this.formatStripEl || !this.ccStripEl) return;

    const formatFrag = document.createDocumentFragment();
    for (const fmt of GAME_FORMATS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-format-pill${this.selectedFormat === fmt.id ? ' is-selected' : ''}`;
      btn.dataset.formatId = fmt.id;
      btn.title = fmt.desc;
      btn.innerHTML = `<span class="pk-fmt-icon">${fmt.icon}</span><span class="pk-fmt-label">${fmt.name}</span>`;
      btn.addEventListener('click', () => {
        this.callbacks.onUiSound?.('tick');
        this.callbacks.onSelectFormat?.(fmt.id);
      });
      formatFrag.appendChild(btn);
    }
    this.formatStripEl.replaceChildren(formatFrag);

    const ccFrag = document.createDocumentFragment();
    for (const cc of Object.values(CC_CLASSES)) {
      const unlocked = isCcUnlocked(this.profile, cc.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-cc-pill${this.selectedCc === cc.id ? ' is-selected' : ''}${
        !unlocked ? ' is-locked' : ''
      }`;
      btn.textContent = unlocked ? cc.label : `${cc.label} 🔒 Niv.${cc.unlockLevel}`;
      btn.title = unlocked
        ? `${cc.label} (XP ×${cc.xpMult})`
        : `Débloqué au niveau ${cc.unlockLevel}`;
      btn.addEventListener('click', () => {
        this.callbacks.onUiSound?.('tick');
        this.callbacks.onSelectCc?.(cc.id);
      });
      ccFrag.appendChild(btn);
    }

    const mirrorUnlocked = isMirrorUnlocked(this.profile);
    const mirrorBtn = document.createElement('button');
    mirrorBtn.type = 'button';
    mirrorBtn.className = `pk-mirror-pill${this.mirrorMode ? ' is-selected' : ''}${
      !mirrorUnlocked ? ' is-locked' : ''
    }`;
    mirrorBtn.textContent = mirrorUnlocked
      ? '⇄ Miroir'
      : `⇄ 🔒 Niv.${MIRROR_UNLOCK_LEVEL}`;
    mirrorBtn.title = mirrorUnlocked
      ? 'Inverser les virages des circuits'
      : `Gagne une Coupe 150cc ou atteins le niveau ${MIRROR_UNLOCK_LEVEL}`;
    mirrorBtn.addEventListener('click', () => {
      this.callbacks.onUiSound?.('tick');
      this.callbacks.onToggleMirror?.();
    });
    ccFrag.appendChild(mirrorBtn);
    this.ccStripEl.replaceChildren(ccFrag);

    const ctaMap = {
      race: { icon: '🏁', label: 'JOUER <small>(Course Solo)</small>', showcase: 'LANCER LA COURSE !' },
      grandprix: { icon: '🏆', label: 'Lancer la Coupe <small>(Solo)</small>', showcase: 'LANCER LA COUPE !' },
      knockout: { icon: '💀', label: 'Survie K.O. <small>(Solo)</small>', showcase: 'LANCER SURVIE K.O. !' },
      timetrial: { icon: '⏱️', label: 'Contre-la-Montre <small>(Solo)</small>', showcase: 'LANCER LE CHRONO !' },
      balloon: { icon: '🎈', label: 'Bataille Ballons <small>(Solo)</small>', showcase: 'LANCER LA BATAILLE !' },
    };
    const cta = ctaMap[this.selectedFormat] || ctaMap.race;
    if (this.quickPlayIconEl) this.quickPlayIconEl.textContent = cta.icon;
    if (this.quickPlayLabelEl) this.quickPlayLabelEl.innerHTML = cta.label;
    if (this.showcaseLaunchIconEl) this.showcaseLaunchIconEl.textContent = cta.icon;
    if (this.showcaseLaunchLabelEl) this.showcaseLaunchLabelEl.textContent = cta.showcase;
    this._syncFeaturedTrackCard();
  }

  _renderSpotlightHud({ kicker, diff, title, sub, accent, chips = [] }) {
    if (this.spotlightEl && accent) {
      this.spotlightEl.style.setProperty('--track-accent', accent);
    }
    if (this.homeTrackLabelEl) this.homeTrackLabelEl.textContent = kicker || 'SURVOL DRONE 3D';
    if (this.spotlightDiffEl) this.spotlightDiffEl.textContent = diff || '';
    if (this.spotlightTitleEl) this.spotlightTitleEl.textContent = title || '';
    if (this.selectedTrackSubEl) {
      this.selectedTrackSubEl.textContent = sub || '';
      if (accent) this.selectedTrackSubEl.style.color = accent;
    }
    if (this.spotlightChipsEl) {
      this.spotlightChipsEl.innerHTML = chips
        .map(
          (c) => `
          <div class="pk-tele-chip">
            <span class="pk-tele-icon">${c.icon}</span>
            <span class="pk-tele-meta">
              <span class="pk-tele-val">${c.val}</span>
              <span class="pk-tele-lbl">${c.label}</span>
            </span>
          </div>`
        )
        .join('');
    }
  }

  _renderHomeContextCards() {
    if (!this.homeTrackStripEl) return;
    const frag = document.createDocumentFragment();

    if (this.selectedFormat === 'grandprix') {
      const activeCup = CUPS.find((c) => c.id === this.selectedCupId) || CUPS[0];
      const savedActive = this.profile?.cups?.[`${activeCup.id}_${this.selectedCc}`];
      const trophyMap = { gold: '🥇 Or', silver: '🥈 Argent', bronze: '🥉 Bronze' };
      this._renderSpotlightHud({
        kicker: `COUPES GRAND PRIX • ${this.selectedCc.toUpperCase()}${this.mirrorMode ? ' • ⇄ MIROIR' : ''}`,
        diff: savedActive?.trophy ? trophyMap[savedActive.trophy] || '🏆' : '4 COURSES',
        title: `${activeCup.icon} ${activeCup.name.toUpperCase()}`,
        sub: activeCup.tracks.map((tid) => `${getTrackById(tid).icon} ${getTrackById(tid).name}`).join('  ›  '),
        accent: activeCup.accent,
        chips: [
          { icon: '🏁', label: 'Étapes', val: `${activeCup.tracks.length} circuits` },
          { icon: '🔥', label: 'Classe', val: CC_CLASSES[this.selectedCc]?.label || '100cc' },
          {
            icon: savedActive?.trophy ? (savedActive.trophy === 'gold' ? '🥇' : savedActive.trophy === 'silver' ? '🥈' : '🥉') : '🏆',
            label: 'Trophée',
            val: savedActive?.stars ? `${'★'.repeat(savedActive.stars)}` : 'À gagner',
          },
        ],
      });

      for (const cup of CUPS) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `pk-carousel-card pk-cup-card${
          cup.id === this.selectedCupId ? ' is-selected' : ''
        }`;
        card.dataset.cupId = cup.id;
        card.dataset.theme = 'cup';
        card.style.setProperty('--track-accent', cup.accent);

        const saved = this.profile?.cups?.[`${cup.id}_${this.selectedCc}`];
        const trophyIcon =
          saved?.trophy === 'gold'
            ? '🥇'
            : saved?.trophy === 'silver'
              ? '🥈'
              : saved?.trophy === 'bronze'
                ? '🥉'
                : '🏆';
        const previewKey = getTrackKey(cup.tracks[0], this.mirrorMode);

        card.innerHTML = `
          <div class="pk-card-banner">
            <span class="pk-card-badge">${trophyIcon} ${saved?.stars ? '★'.repeat(saved.stars) : `${cup.tracks.length} courses`}</span>
            ${this.mirrorMode ? '<span class="pk-card-mirror">⇄ MIROIR</span>' : ''}
            <div class="pk-card-svg-wrap">${buildTrackSvgMarkup(previewKey, cup.accent)}</div>
          </div>
          <div class="pk-card-foot">
            <div class="pk-card-title">${cup.icon} ${cup.name}</div>
            <div class="pk-card-sub">${cup.tracks.map((tid) => getTrackById(tid).icon).join(' ')} • Grand Prix</div>
          </div>
        `;
        card.addEventListener('click', () => {
          this.callbacks.onUiSound?.('tick');
          this.callbacks.onSelectCup?.(cup.id);
        });
        frag.appendChild(card);
      }
      this.homeTrackStripEl.replaceChildren(frag);
      this._syncFeaturedTrackCard();
      if (this.homeView === 'tracks') {
        requestAnimationFrame(() => this._scrollCarouselToActive('smooth'));
      }
      return;
    }

    if (this.selectedFormat === 'balloon') {
      const tel = getTrackTelemetry('arena', this.profile, false);
      this._renderSpotlightHud({
        kicker: 'ARÈNE BATAILLE 360°',
        diff: '💥 COMBAT',
        title: `${ARENA_TRACK.icon} ${ARENA_TRACK.name.toUpperCase()}`,
        sub: ARENA_TRACK.subtitle,
        accent: ARENA_TRACK.accent,
        chips: tel.chips,
      });

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pk-carousel-card pk-cup-card is-selected';
      card.dataset.trackId = 'arena';
      card.dataset.theme = 'arena';
      card.style.setProperty('--track-accent', ARENA_TRACK.accent);
      card.innerHTML = `
        <div class="pk-card-banner">
          <span class="pk-card-badge">🎈 3 ❤️ • 90s</span>
          <div class="pk-card-svg-wrap">${buildTrackSvgMarkup('arena', ARENA_TRACK.accent)}</div>
        </div>
        <div class="pk-card-foot">
          <div class="pk-card-title">${ARENA_TRACK.icon} ${ARENA_TRACK.name}</div>
          <div class="pk-card-sub">${tel.compact}</div>
        </div>
      `;
      frag.appendChild(card);
      this.homeTrackStripEl.replaceChildren(frag);
      this._syncFeaturedTrackCard();
      return;
    }

    const baseSelected = getBaseTrackId(this.selectedTrackId);
    const activeKey = getTrackKey(baseSelected, this.mirrorMode);
    const activeTrack = getTrackById(activeKey);
    const activeTel = getTrackTelemetry(baseSelected, this.profile, this.mirrorMode);

    this._renderSpotlightHud({
      kicker: this.mirrorMode ? 'SURVOL DRONE 3D • MIROIR ⇄' : 'SURVOL DRONE 3D',
      diff: activeTrack.difficulty || '',
      title: `${activeTrack.icon} ${activeTrack.name.toUpperCase()}`,
      sub: activeTrack.subtitle || '',
      accent: activeTrack.accent,
      chips: activeTel.chips,
    });

    for (const track of TRACKS) {
      const effKey = getTrackKey(track.id, this.mirrorMode);
      const tel = getTrackTelemetry(track.id, this.profile, this.mirrorMode);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pk-carousel-card${track.id === baseSelected ? ' is-selected' : ''}`;
      card.dataset.trackId = track.id;
      card.dataset.theme = track.id;
      card.style.setProperty('--track-accent', track.accent);

      let badgeTxt = String(track.difficulty || '').trim();
      if (this.selectedFormat === 'timetrial') {
        const rec = this.profile?.timeTrials?.[effKey];
        if (rec?.bestMs) {
          badgeTxt = `${formatMedalIcon(rec.medal) || '⏱️'} ${formatRaceTime(rec.bestMs)}`;
        } else {
          badgeTxt = `🥇 ${formatRaceTime(getTimeTrialTargets(track.id).goldMs)}`;
        }
      }

      card.innerHTML = `
        <div class="pk-card-banner">
          <span class="pk-card-badge">${badgeTxt}</span>
          ${this.mirrorMode ? '<span class="pk-card-mirror">⇄ MIROIR</span>' : ''}
          <div class="pk-card-svg-wrap">${buildTrackSvgMarkup(effKey, track.accent)}</div>
        </div>
        <div class="pk-card-foot">
          <div class="pk-card-title">${track.icon} ${this.mirrorMode ? `${track.name} ⇄` : track.name}</div>
          <div class="pk-card-sub">${tel.compact}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.callbacks.onUiSound?.('tick');
        this._selectTrack(track.id, true);
      });
      frag.appendChild(card);
    }
    this.homeTrackStripEl.replaceChildren(frag);
    this._syncFeaturedTrackCard();
    if (this.homeView === 'tracks') {
      requestAnimationFrame(() => this._scrollCarouselToActive('smooth'));
    }
  }

  _renderGarageModal() {
    if (!this.garageKartsGridEl || !this.garageBoostsGridEl) return;
    const p = this.profile;
    const coins = p?.coins || 0;
    const unlockedKarts = new Set(p?.unlockedKarts || ['classic']);
    const unlockedBoosts = new Set(p?.unlockedBoosts || ['flame']);
    const selectedKart = p?.selectedKart || 'classic';
    const selectedBoost = p?.selectedBoost || 'flame';
    const equippedMeta = getKartMeta(selectedKart);
    const equippedStats = equippedMeta?.stats || { speed: 5, accel: 5, drift: 5, weight: 5 };
    const equippedBoost = getBoostMeta(selectedBoost);

    if (this.garageCoinsEl) {
      this.garageCoinsEl.textContent = `🪙 ${coins}`;
    }

    if (this.garageEquippedBarEl) {
      this.garageEquippedBarEl.innerHTML = `
        <span class="pk-equipped-pill">Équipé : <strong>${equippedMeta.icon} ${equippedMeta.name}</strong></span>
        <span class="pk-equipped-pill">Boost : <strong>${equippedBoost.icon} ${equippedBoost.name}</strong></span>
        <span class="pk-equipped-legend">Δ comparé au châssis équipé</span>
      `;
    }

    const kartFrag = document.createDocumentFragment();
    for (const k of KARTS) {
      const unlocked = unlockedKarts.has(k.id);
      const equipped = selectedKart === k.id;
      const canBuy = !unlocked && coins >= k.cost;

      const card = document.createElement('div');
      card.className = `pk-kart-card${equipped ? ' is-equipped' : ''}${
        !unlocked ? ' is-locked' : ''
      }`;

      const stats = k.stats || { speed: 5, accel: 5, drift: 5, weight: 5 };
      const statRows = [
        ['Vitesse', stats.speed, equippedStats.speed],
        ['Accél.', stats.accel, equippedStats.accel],
        ['Drift', stats.drift, equippedStats.drift],
        ['Poids', stats.weight, equippedStats.weight],
      ]
        .map(([lbl, val, baseVal]) => {
          const pct = Math.min(100, Math.round((val / 10) * 100));
          const basePct = Math.min(100, Math.round((baseVal / 10) * 100));
          const diff = val - baseVal;
          const diffHtml = equipped
            ? '<span class="pk-stat-diff is-same">BASE</span>'
            : diff > 0
            ? `<span class="pk-stat-diff is-up">+${diff}</span>`
            : diff < 0
            ? `<span class="pk-stat-diff is-down">${diff}</span>`
            : '<span class="pk-stat-diff is-same">=</span>';
          return `
          <div class="pk-stat-row">
            <span>${lbl}</span>
            <div class="pk-stat-track">
              <div class="pk-stat-fill" style="width:${pct}%"></div>
              ${!equipped ? `<div class="pk-stat-marker" style="left:${basePct}%"></div>` : ''}
            </div>
            ${diffHtml}
          </div>`;
        })
        .join('');

      let btnHtml = '';
      if (equipped) {
        btnHtml = `<button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-sm" disabled>✓ Équipé</button>`;
      } else if (unlocked) {
        btnHtml = `<button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-select-kart="${k.id}">Choisir</button>`;
      } else {
        btnHtml = `<button type="button" class="pk-arcade-btn ${
          canBuy ? 'pk-btn-amber' : 'pk-btn-ghost'
        } pk-btn-sm" data-buy-kart="${k.id}">🪙 ${k.cost} <small>(Niv.${k.unlockLevel})</small></button>`;
      }

      card.innerHTML = `
        <div class="pk-kart-head">
          <span class="pk-kart-icon">${k.icon}</span>
          <div class="pk-kart-title-wrap">
            <div class="pk-kart-name">${k.name}</div>
            <div class="pk-kart-tag">${k.tagline}</div>
          </div>
        </div>
        <div class="pk-kart-stats">${statRows}</div>
        <div class="pk-kart-cta">${btnHtml}</div>
      `;

      const selBtn = card.querySelector('[data-select-kart]');
      if (selBtn) {
        selBtn.addEventListener('click', () => this.callbacks.onSelectKart?.(k.id));
      }
      const buyBtn = card.querySelector('[data-buy-kart]');
      if (buyBtn) {
        buyBtn.addEventListener('click', () => this.callbacks.onBuyKart?.(k.id));
      }
      kartFrag.appendChild(card);
    }
    this.garageKartsGridEl.replaceChildren(kartFrag);

    const boostFrag = document.createDocumentFragment();
    for (const b of BOOST_STYLES) {
      const unlocked = unlockedBoosts.has(b.id);
      const equipped = selectedBoost === b.id;
      const canBuy = !unlocked && coins >= b.cost;

      const card = document.createElement('div');
      card.className = `pk-boost-card${equipped ? ' is-equipped' : ''}`;
      const swatchBg = b.rainbow
        ? 'linear-gradient(135deg, #f43f5e, #f59e0b, #22c55e, #38bdf8, #a855f7)'
        : b.flameColor;

      let btnHtml = '';
      if (equipped) {
        btnHtml = `<button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-sm" disabled>✓ Équipé</button>`;
      } else if (unlocked) {
        btnHtml = `<button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-select-boost="${b.id}">Choisir</button>`;
      } else {
        btnHtml = `<button type="button" class="pk-arcade-btn ${
          canBuy ? 'pk-btn-amber' : 'pk-btn-ghost'
        } pk-btn-sm" data-buy-boost="${b.id}">🪙 ${b.cost}</button>`;
      }

      card.innerHTML = `
        <span class="pk-boost-swatch" style="background:${swatchBg}; box-shadow: 0 0 12px ${b.underglow};">${b.icon}</span>
        <span class="pk-boost-name">${b.name}</span>
        ${btnHtml}
      `;
      const selBtn = card.querySelector('[data-select-boost]');
      if (selBtn) {
        selBtn.addEventListener('click', () => this.callbacks.onSelectBoost?.(b.id));
      }
      const buyBtn = card.querySelector('[data-buy-boost]');
      if (buyBtn) {
        buyBtn.addEventListener('click', () => this.callbacks.onBuyBoost?.(b.id));
      }
      boostFrag.appendChild(card);
    }
    this.garageBoostsGridEl.replaceChildren(boostFrag);
  }

  _renderChallengesModal() {
    if (!this.challengesListEl || !this.careerStatsGridEl) return;
    const p = this.profile;
    const lvlInfo = computeLevelFromXp(p?.xp || 0);
    if (this.challengesLevelEl) {
      this.challengesLevelEl.textContent = `Niv. ${lvlInfo.level}`;
    }

    const challenges = Array.isArray(p?.challenges) ? p.challenges : [];
    const chFrag = document.createDocumentFragment();
    for (const ch of challenges) {
      const pct = Math.min(100, Math.round(((ch.progress || 0) / Math.max(1, ch.target)) * 100));
      const row = document.createElement('div');
      row.className = `pk-challenge-card${ch.completed ? ' is-done' : ''}`;
      row.innerHTML = `
        <div class="pk-ch-top">
          <span class="pk-ch-title">${ch.icon || '🎯'} ${ch.label}</span>
          <span class="pk-ch-rewards">+${ch.rewardXp} XP • +${ch.rewardCoins} 🪙</span>
        </div>
        <div class="pk-ch-bar-row">
          <div class="pk-xp-bar-wrap"><div class="pk-xp-bar-fill" style="width:${pct}%"></div></div>
          <span class="pk-ch-count">${ch.progress || 0}/${ch.target}</span>
        </div>
      `;
      chFrag.appendChild(row);
    }
    this.challengesListEl.replaceChildren(chFrag);

    const stats = p?.stats || {};
    const cupsWon = Object.values(p?.cups || {}).filter((c) => c.trophy === 'gold').length;
    const statItems = [
      ['Courses', stats.races || 0],
      ['Victoires', stats.wins || 0],
      ['Podiums', stats.podiums || 0],
      ['Pièces totales', stats.coinsCollected || 0],
      ['Turbo-Drifts', stats.drifts || 0],
      ['Coupes Or', cupsWon],
    ];
    this.careerStatsGridEl.innerHTML = statItems
      .map(
        ([k, v]) =>
          `<div class="pk-career-stat-box"><span class="pk-cs-val">${v}</span><span class="pk-cs-lbl">${k}</span></div>`
      )
      .join('');
  }

  _renderControlsModal() {
    if (!this.controlsBackdropEl || !this.controlsBodyEl) return;
    const tabs = this.controlsBackdropEl.querySelectorAll('[data-action="controls-tab"]');
    tabs.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.tab === this._controlsTab);
    });

    const contentByTab = {
      touch: [
        { key: '🕹️ Zone gauche', desc: 'Joystick flottant (ou boutons ◀ / ▶ dans Réglages) pour braquer.' },
        { key: '📱 Gyroscope', desc: 'Active le volant inclinaison depuis la barre du haut ou Pause.' },
        { key: '💨 Bouton DÉRAPE', desc: 'Maintiens en virage pour charger 3 paliers : Cyan (Mini), Orange (Super), Magenta (Ultra).' },
        { key: '🚀 Départ Canon', desc: 'Maintiens DÉRAPE dès le "2" du compte à rebours et relâche au vert !' },
        { key: '🎁 Case / Bouton OBJET', desc: 'Touche pour tirer ou glisse/maintiens pour défendre derrière toi.' },
        { key: '⚡ Auto-Gaz', desc: 'Activé par défaut sur mobile ; désactivable pour contrôler Gaz/Frein manuellement.' },
      ],
      keyboard: [
        { key: '◀ ▶ ou A / D', desc: 'Tourner à gauche / droite.' },
        { key: '▲ / ▼ ou W / S', desc: 'Accélérer / Freiner et marche arrière.' },
        { key: 'SHIFT ou V', desc: 'Saut + Dérape (3 paliers Mini-Turbo). Maintiens au "2" pour Départ Canon !' },
        { key: 'ESPACE ou E', desc: 'Utiliser l’objet (maintiens ▼ + ESPACE pour tirer vers l’arrière).' },
        { key: '1 • 2 • 3 • 4', desc: 'Envoyer un Emote / Klaxon instantané en piste.' },
        { key: 'ÉCHAP ou P', desc: 'Mettre la course Solo en pause.' },
      ],
      gamepad: [
        { key: 'Stick Gauche / Croix', desc: 'Direction précise avec courbe progressive arcade.' },
        { key: 'RT / A (Croix)', desc: 'Accélérer • LT / B (Rond) : Frein & marche arrière.' },
        { key: 'RB / X (Carré)', desc: 'Déraper & charger le Mini-Turbo 3 paliers + Figure sur tremplin.' },
        { key: 'LB / Y (Triangle)', desc: 'Déclencher l’objet équipé (stick arrière pour viser derrière).' },
        { key: 'Start / Menu', desc: 'Ouvrir le menu Pause en course Solo.' },
        {
          key: this.gamepadConnected ? `🟢 ${this.gamepadName || 'Manette détectée'}` : '⚪ Aucune manette',
          desc: this.gamepadConnected
            ? 'Prête à jouer — appuie sur n’importe quelle touche en course.'
            : 'Branche une manette USB/Bluetooth et appuie sur un bouton pour l’activer.',
        },
      ],
    };

    const rows = contentByTab[this._controlsTab] || contentByTab.touch;
    this.controlsBodyEl.innerHTML = `
      <div class="pk-controls-grid">
        ${rows
          .map(
            (r) => `
          <div class="pk-control-row">
            <span class="pk-control-key">${r.key}</span>
            <span class="pk-control-desc">${r.desc}</span>
          </div>`
          )
          .join('')}
      </div>
      <div class="pk-controls-tip">
        💡 Astuce Pro : collecte jusqu'à <strong>10 pièces</strong> (+8% vitesse max), profite de l'<strong>aspiration</strong> derrière tes rivaux et garde un objet défensif contre les carapaces !
      </div>
    `;
  }

  _openModal(type) {
    this._toggleSettingsPopover(false);
    this._closeModals(false);
    if (type === 'garage') {
      this._renderGarageModal();
      this.garageBackdropEl?.classList.remove('is-hidden');
    } else if (type === 'challenges') {
      this._renderChallengesModal();
      this.challengesBackdropEl?.classList.remove('is-hidden');
    } else if (type === 'online') {
      this._syncFeaturedTrackCard();
      this.onlineBackdropEl?.classList.remove('is-hidden');
    } else if (type === 'profile') {
      this._renderCareerBar();
      this.profileBackdropEl?.classList.remove('is-hidden');
    } else if (type === 'controls') {
      if (this.deviceMode === 'desktop' && this._controlsTab === 'touch') {
        this._controlsTab = this.gamepadConnected ? 'gamepad' : 'keyboard';
      }
      this._renderControlsModal();
      this.controlsBackdropEl?.classList.remove('is-hidden');
    }
    this._syncRootDatasets();
  }

  _closeModals(syncDatasets = true) {
    this.garageBackdropEl?.classList.add('is-hidden');
    this.challengesBackdropEl?.classList.add('is-hidden');
    this.onlineBackdropEl?.classList.add('is-hidden');
    this.profileBackdropEl?.classList.add('is-hidden');
    this.controlsBackdropEl?.classList.add('is-hidden');
    if (syncDatasets) {
      this._syncRootDatasets();
    }
  }

  _buildEmoteButtons() {
    this.emoteBarEl.innerHTML = '';
    EMOTES.forEach((emote) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pk-emote-btn';
      btn.dataset.emoteId = emote.id;
      btn.title = emote.label;
      btn.setAttribute('aria-label', emote.label);
      btn.textContent = emote.icon;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._triggerEmote(emote.id, btn);
      });
      this.emoteBarEl.appendChild(btn);
    });
  }

  _triggerEmote(emoteId, btnEl = null) {
    if (this.paused) return;
    const now = performance.now();
    if (now < this._emoteCooldownUntil) return;
    this._emoteCooldownUntil = now + 1200;

    const targetBtn =
      btnEl || this.emoteBarEl.querySelector(`[data-emote-id="${emoteId}"]`);
    if (targetBtn) {
      targetBtn.classList.remove('is-popped');
      void targetBtn.offsetWidth;
      targetBtn.classList.add('is-popped');
    }
    this.callbacks.onSendEmote?.(emoteId);
  }

  _bindEvents() {
    this.nameInputEl.value = this.playerName;
    if (this.topbarNameEl) {
      this.topbarNameEl.textContent = this.playerName;
    }
    this.nameInputEl.addEventListener('input', () => {
      const clean = this.nameInputEl.value.replace(/\s+/g, ' ').trimStart().slice(0, 14);
      if (this.nameInputEl.value !== clean) {
        this.nameInputEl.value = clean;
      }
      this.playerName = clean.trim() || 'Pilote';
      writePref(STORAGE_KEYS.NAME, this.playerName);
      if (this.topbarNameEl) {
        this.topbarNameEl.textContent = this.playerName;
      }
    });

    this.roomCodeInputEl.addEventListener('input', () => {
      const clean = this.roomCodeInputEl.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4);
      this.roomCodeInputEl.value = clean;
    });

    this.roomCodeInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._triggerJoinRoom();
      }
    });

    this.qrBoxEl.addEventListener('click', () => {
      this.qrBoxEl.classList.toggle('is-zoomed');
    });

    this.garageBackdropEl?.addEventListener('click', (e) => {
      if (e.target === this.garageBackdropEl) {
        this.callbacks.onUiSound?.('back');
        this._closeModals();
      }
    });
    this.challengesBackdropEl?.addEventListener('click', (e) => {
      if (e.target === this.challengesBackdropEl) {
        this.callbacks.onUiSound?.('back');
        this._closeModals();
      }
    });
    this.onlineBackdropEl?.addEventListener('click', (e) => {
      if (e.target === this.onlineBackdropEl) {
        this.callbacks.onUiSound?.('back');
        this._closeModals();
      }
    });
    this.profileBackdropEl?.addEventListener('click', (e) => {
      if (e.target === this.profileBackdropEl) {
        this.callbacks.onUiSound?.('back');
        this._closeModals();
      }
    });
    this.controlsBackdropEl?.addEventListener('click', (e) => {
      if (e.target === this.controlsBackdropEl) {
        this.callbacks.onUiSound?.('back');
        this._closeModals();
      }
    });

    // Interactive 3D viewport drag (kart orbit in Paddock / flyover scrub in Circuit Showcase)
    if (this.stageDragLayerEl) {
      let dragPointerId = null;
      let lastX = 0;

      this.stageDragLayerEl.addEventListener('pointerdown', (e) => {
        if (this.activeScreen !== 'home' || this._hasOpenModal()) return;
        this._toggleSettingsPopover(false);
        dragPointerId = e.pointerId;
        lastX = e.clientX;
        this.stageDragLayerEl.classList.add('is-dragging');
        this.stageDragLayerEl.setPointerCapture?.(e.pointerId);
      });

      this.stageDragLayerEl.addEventListener('pointermove', (e) => {
        if (dragPointerId !== e.pointerId) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        if (Math.abs(dx) < 0.5) return;
        if (this.homeView === 'tracks') {
          this.callbacks.onPreviewScrub?.(-dx * 0.0014);
        } else {
          this.callbacks.onOrbitDrag?.(dx * 0.0085);
        }
      });

      const endDrag = (e) => {
        if (dragPointerId !== e.pointerId) return;
        dragPointerId = null;
        this.stageDragLayerEl.classList.remove('is-dragging');
      };
      this.stageDragLayerEl.addEventListener('pointerup', endDrag);
      this.stageDragLayerEl.addEventListener('pointercancel', endDrag);
    }

    // Horizontal snap-carousel scroll sync (debounced, avoids scrollIntoView bugs)
    this.homeTrackStripEl?.addEventListener(
      'scroll',
      () => {
        if (this.homeView !== 'tracks' || performance.now() < this._suppressCarouselScrollUntil) {
          return;
        }
        clearTimeout(this._carouselScrollTimer);
        this._carouselScrollTimer = setTimeout(() => {
          this._handleCarouselScrollEnd();
        }, 90);
      },
      { passive: true }
    );

    // Close settings popover when clicking outside it
    this.el.addEventListener('pointerdown', (e) => {
      if (!this._settingsPopoverOpen) return;
      if (!e.target.closest('.pk-settings-anchor')) {
        this._toggleSettingsPopover(false);
      }
    });

    this.hudItemBoxEl.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('pocketkart:use-item'));
    });

    this._onEmoteShortcut = (e) => {
      if (this.activeScreen !== 'hud' || this.paused) return;
      const idx = Number(e.detail);
      const emote = EMOTES[idx];
      if (emote) {
        this._triggerEmote(emote.id);
      }
    };
    window.addEventListener('pocketkart:emote-shortcut', this._onEmoteShortcut);

    // Keyboard shortcuts: Home Circuit Showcase nav + Escape / P Solo Pause
    this._onPauseKey = (e) => {
      if (e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (this.activeScreen === 'home') {
        if (e.code === 'Escape') {
          if (this._hasOpenModal()) {
            e.preventDefault();
            this.callbacks.onUiSound?.('back');
            this._closeModals();
            return;
          }
          if (this._settingsPopoverOpen) {
            e.preventDefault();
            this._toggleSettingsPopover(false);
            return;
          }
          if (this.homeView === 'tracks') {
            e.preventDefault();
            this.callbacks.onUiSound?.('back');
            this._setHomeView('paddock', true);
            return;
          }
        } else if (this.homeView === 'tracks' && !this._hasOpenModal()) {
          if (e.code === 'ArrowLeft') {
            e.preventDefault();
            this.callbacks.onUiSound?.('tick');
            this._stepCarousel(-1);
            return;
          }
          if (e.code === 'ArrowRight') {
            e.preventDefault();
            this.callbacks.onUiSound?.('tick');
            this._stepCarousel(1);
            return;
          }
          if (e.code === 'Enter') {
            e.preventDefault();
            this.callbacks.onUiSound?.('confirm');
            this.el.querySelector('[data-action="launch-from-showcase"]')?.click();
            return;
          }
        }
      }

      if (
        e.code === 'Escape' &&
        this.controlsBackdropEl &&
        !this.controlsBackdropEl.classList.contains('is-hidden')
      ) {
        e.preventDefault();
        this.callbacks.onUiSound?.('back');
        this._closeModals();
        return;
      }

      if (
        (e.code === 'Escape' || e.code === 'KeyP') &&
        this.activeScreen === 'hud' &&
        this._currentMode === 'solo'
      ) {
        e.preventDefault();
        this.setPaused(!this.paused, true);
      }
    };
    window.addEventListener('keydown', this._onPauseKey);

    // Auto-pause Solo race when browser tab hides
    document.addEventListener('visibilitychange', () => {
      if (
        document.hidden &&
        this.activeScreen === 'hud' &&
        this._currentMode === 'solo' &&
        !this.paused
      ) {
        this.setPaused(true, true);
      }
    });

    // Sync Fullscreen button states and reset portrait banner dismissal on landscape rotation
    const onFullscreenChange = () => this._syncFullscreenButtons();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    window.addEventListener(
      'resize',
      () => {
        if (window.innerWidth > window.innerHeight && this.portraitBannerEl) {
          this.portraitBannerEl.classList.remove('is-dismissed');
        }
      },
      { passive: true }
    );

    // Delegated action clicks
    this.el.addEventListener('click', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      switch (action) {
        case 'open-track-showcase':
          this.callbacks.onUiSound?.('confirm');
          this._setHomeView('tracks', true);
          break;

        case 'close-track-showcase':
          this.callbacks.onUiSound?.('back');
          this._setHomeView('paddock', true);
          break;

        case 'confirm-track-showcase':
          this.callbacks.onUiSound?.('confirm');
          this._setHomeView('paddock', true);
          break;

        case 'carousel-prev':
          this.callbacks.onUiSound?.('tick');
          this._stepCarousel(-1);
          break;

        case 'carousel-next':
          this.callbacks.onUiSound?.('tick');
          this._stepCarousel(1);
          break;

        case 'toggle-settings-popover':
          e.stopPropagation();
          this.callbacks.onUiSound?.('tick');
          this._toggleSettingsPopover();
          break;

        case 'open-online-hub':
          this.callbacks.onUiSound?.('confirm');
          this._openModal('online');
          break;

        case 'open-profile':
          this.callbacks.onUiSound?.('confirm');
          this._openModal('profile');
          break;

        case 'open-garage':
          this.callbacks.onUiSound?.('confirm');
          this._openModal('garage');
          break;

        case 'open-challenges':
          this.callbacks.onUiSound?.('confirm');
          this._openModal('challenges');
          break;

        case 'open-controls':
          this.callbacks.onUiSound?.('confirm');
          this._openModal('controls');
          break;

        case 'controls-tab':
          if (actionEl.dataset.tab) {
            this.callbacks.onUiSound?.('tick');
            this._controlsTab = actionEl.dataset.tab;
            this._renderControlsModal();
          }
          break;

        case 'set-quality': {
          const nextQuality = normalizeQualityMode(actionEl.dataset.quality);
          this.callbacks.onUiSound?.('tick');
          this.setQualityMode(nextQuality);
          this.callbacks.onSelectQuality?.(nextQuality);
          const opt = QUALITY_OPTIONS.find((q) => q.id === nextQuality);
          if (opt) {
            this.showToast(`${opt.icon} Qualité graphique : ${opt.label}`, 'info');
          }
          break;
        }

        case 'toggle-podium-3d':
          this.callbacks.onUiSound?.('tick');
          this._togglePodium3DView();
          break;

        case 'close-online':
        case 'close-profile':
        case 'close-garage':
        case 'close-challenges':
        case 'close-controls':
          this.callbacks.onUiSound?.('back');
          this._closeModals();
          break;

        case 'next-gp-race':
          this.setPaused(false, false);
          this.callbacks.onNextGpRace?.();
          break;

        case 'launch-from-showcase':
        case 'quick-play':
          this._closeModals();
          this._toggleSettingsPopover(false);
          this.callbacks.onUiSound?.('confirm');
          this.setPaused(false, false);
          this.callbacks.onQuickPlay?.({
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
            gameFormat: this.selectedFormat,
            cupId: this.selectedCupId,
            cc: this.selectedCc,
            mirror: this.mirrorMode,
            botCount: 5,
          });
          break;

        case 'accept-ghost': {
          this._closeModals();
          this._toggleSettingsPopover(false);
          this.setPaused(false, false);
          const info = this._ghostChallengeInfo;
          const trackId = info?.trackId || this.selectedTrackId;
          this._selectTrack(trackId, false);
          if (this.callbacks.onStartGhostChallenge) {
            this.callbacks.onStartGhostChallenge({
              playerName: this._getPlayerName(),
              racerId: this.selectedRacerId,
              trackId,
              ghostChallengeInfo: info,
            });
          } else {
            this.callbacks.onQuickPlay?.({
              playerName: this._getPlayerName(),
              racerId: this.selectedRacerId,
              trackId,
              botCount: 5,
              ghostChallenge: true,
            });
          }
          break;
        }

        case 'public-match': {
          this._closeModals();
          this._toggleSettingsPopover(false);
          this.callbacks.onUiSound?.('confirm');
          this.setPaused(false, false);
          const payload = {
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
            gameFormat: this.selectedFormat,
            cc: this.selectedCc,
            mirror: this.mirrorMode,
          };
          if (this.callbacks.onJoinPublic) {
            this.callbacks.onJoinPublic(payload);
          } else {
            this.callbacks.onPublicMatch?.(payload);
          }
          break;
        }

        case 'create-room':
          this._closeModals();
          this._toggleSettingsPopover(false);
          this.callbacks.onUiSound?.('confirm');
          this.setPaused(false, false);
          this.callbacks.onCreateRoom?.({
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
            gameFormat: this.selectedFormat,
            cc: this.selectedCc,
            mirror: this.mirrorMode,
          });
          break;

        case 'join-room':
          this._closeModals();
          this._toggleSettingsPopover(false);
          this.callbacks.onUiSound?.('confirm');
          this.setPaused(false, false);
          this._triggerJoinRoom();
          break;

        case 'copy-invite':
          this._copyInviteLink();
          break;

        case 'native-share':
          this._nativeShareInvite();
          break;

        case 'bots-dec':
          if (typeof this._currentBotCount === 'number') {
            const minB = this._currentMinBots ?? 0;
            const next = Math.max(minB, this._currentBotCount - 1);
            this.callbacks.onSetBots?.(next);
          }
          break;

        case 'bots-inc':
          if (typeof this._currentBotCount === 'number') {
            const maxB = this._currentMaxBots ?? 5;
            const next = Math.min(maxB, this._currentBotCount + 1);
            this.callbacks.onSetBots?.(next);
          }
          break;

        case 'start-race':
          this.callbacks.onStartRace?.();
          break;

        case 'respawn':
          this.callbacks.onRespawn?.();
          break;

        case 'pause-solo':
          this.callbacks.onUiSound?.('tick');
          this.setPaused(!this.paused, this._currentMode === 'solo');
          break;

        case 'resume-solo':
          this.callbacks.onUiSound?.('tick');
          this.setPaused(false, this._currentMode === 'solo');
          break;

        case 'pause-respawn':
          this.setPaused(false, this._currentMode === 'solo');
          this.callbacks.onRespawn?.();
          break;

        case 'pause-restart':
          this.setPaused(false, this._currentMode === 'solo');
          this.callbacks.onRematch?.();
          break;

        case 'pause-leave':
          this.setPaused(false, this._currentMode === 'solo');
          this.callbacks.onLeave?.();
          break;

        case 'cycle-steer-mode': {
          const next = this.steerMode === 'joystick' ? 'buttons' : 'joystick';
          this._setSteerMode(next, true);
          this.showToast(
            next === 'joystick'
              ? '🕹️ Direction : Joystick flottant auto-centré'
              : '◀▶ Direction : Boutons Gauche / Droite',
            'info'
          );
          break;
        }

        case 'set-steer-joystick':
          this._setSteerMode('joystick', true);
          break;

        case 'set-steer-buttons':
          this._setSteerMode('buttons', true);
          break;

        case 'rematch':
          this.setPaused(false, false);
          this.callbacks.onRematch?.();
          break;

        case 'leave': {
          // Require 2-tap confirmation if clicked directly from live race HUD
          if (this.activeScreen === 'hud' && !this.paused) {
            const nowMs = performance.now();
            if (nowMs > this._confirmLeaveUntil) {
              this._confirmLeaveUntil = nowMs + 3000;
              actionEl.classList.add('is-confirming');
              setTimeout(() => actionEl.classList.remove('is-confirming'), 3000);
              this.showToast('⚠️ Appuie encore sur ✕ pour quitter la course', 'warning');
              break;
            }
          }
          this._confirmLeaveUntil = 0;
          this.setPaused(false, false);
          this.callbacks.onLeave?.();
          break;
        }

        case 'recalibrate-gyro': {
          this.callbacks.onUiSound?.('confirm');
          if (this.callbacks.onGyroRecalibrate) {
            this.callbacks.onGyroRecalibrate();
          } else {
            window.dispatchEvent(new CustomEvent('pocketkart:gyro-recalibrate'));
            this.showToast('🎯 Volant Gyroscope recentré sur ta position actuelle !', 'success');
          }
          break;
        }

        case 'set-gyro-sens': {
          const sens = normalizeGyroSensitivity(actionEl.dataset.sens);
          this.callbacks.onUiSound?.('tick');
          this.setGyroSensitivity(sens, true);
          const opt = GYRO_SENS_OPTIONS.find((o) => o.id === sens);
          if (opt) {
            this.showToast(`📱 Sensibilité Gyro : ${opt.label} (${opt.desc})`, 'info');
          }
          break;
        }

        case 'toggle-gyro-invert': {
          this.callbacks.onUiSound?.('tick');
          this.setGyroInvert(!this.gyroInvert, true);
          this.showToast(
            this.gyroInvert ? '⇄ Axe Gyroscope inversé' : '⇄ Axe Gyroscope normal',
            'info'
          );
          break;
        }

        case 'toggle-haptics': {
          this.callbacks.onUiSound?.('tick');
          this.setHapticsEnabled(!this.hapticsEnabled, true);
          this.showToast(
            this.hapticsEnabled ? '📳 Vibrations activées' : '📳 Vibrations désactivées',
            'info'
          );
          break;
        }

        case 'share-story':
          await this._generateAndShareStoryCard();
          break;

        case 'share-ghost':
          await this._handleShareGhost();
          break;

        case 'toggle-mute': {
          const res = await this.callbacks.onToggleMute?.();
          this.muted = typeof res === 'boolean' ? res : !this.muted;
          writePref(STORAGE_KEYS.MUTED, this.muted);
          this._syncUtilityButtons();
          break;
        }

        case 'toggle-music': {
          const res = await this.callbacks.onToggleMusic?.();
          this.musicEnabled = typeof res === 'boolean' ? res : !this.musicEnabled;
          writePref(STORAGE_KEYS.MUSIC, this.musicEnabled);
          this._syncUtilityButtons();
          if (!this.paused) {
            this.showToast(
              this.musicEnabled ? '🎵 Musique arcade activée' : '🎵 Musique coupée',
              'info'
            );
          }
          break;
        }

        case 'toggle-gyro': {
          const res = await this.callbacks.onToggleGyro?.();
          this.gyroEnabled = typeof res === 'boolean' ? res : !this.gyroEnabled;
          writePref(STORAGE_KEYS.GYRO, this.gyroEnabled);
          this._syncUtilityButtons();
          if (!this.paused) {
            this.showToast(
              this.gyroEnabled
                ? '📱 Volant Gyroscope activé — penche ton téléphone !'
                : '📱 Volant Gyroscope désactivé',
              this.gyroEnabled ? 'success' : 'info'
            );
          }
          break;
        }

        case 'toggle-auto-accel': {
          const res = await this.callbacks.onToggleAutoAccel?.();
          this.autoAccel = typeof res === 'boolean' ? res : !this.autoAccel;
          writePref(STORAGE_KEYS.AUTO_ACCEL, this.autoAccel);
          this._syncUtilityButtons();
          if (!this.paused) {
            this.showToast(
              this.autoAccel
                ? '⚡ Auto-accélération activée'
                : '🚀 Accélération manuelle (bouton GAZ)',
              'info'
            );
          }
          break;
        }

        case 'fullscreen':
          this._toggleFullscreen();
          break;

        case 'dismiss-portrait':
          this.portraitBannerEl.classList.add('is-dismissed');
          break;

        default:
          break;
      }
    });
  }

  _getPlayerName() {
    const val = (this.nameInputEl?.value || '').trim().slice(0, 14);
    this.playerName = val || 'Pilote';
    writePref(STORAGE_KEYS.NAME, this.playerName);
    return this.playerName;
  }

  _selectRacer(racerId, notify = false) {
    if (!RACERS.some((r) => r.id === racerId)) return;
    if (this.unlockedRacers && !this.unlockedRacers.has(racerId)) {
      racerId = RACERS.find((r) => this.unlockedRacers.has(r.id))?.id || 'red';
    }
    this.selectedRacerId = racerId;
    writePref(STORAGE_KEYS.RACER, racerId);
    this._renderRacerSelection();
    if (notify) {
      this.callbacks.onUiSound?.('tick');
      this.callbacks.onSelectRacer?.(racerId);
    }
  }

  _selectTrack(trackId, notify = false) {
    if (isArenaTrack(trackId)) {
      this._renderTrackSelection('arena');
      if (notify) {
        this.callbacks.onSelectTrack?.('arena');
      }
      return;
    }
    const baseId = getBaseTrackId(trackId);
    if (!TRACKS.some((t) => t.id === baseId)) return;
    this.selectedTrackId = baseId;
    writePref(STORAGE_KEYS.TRACK, baseId);
    const effKey = getTrackKey(baseId, this.mirrorMode);
    this._renderTrackSelection(effKey);
    if (this.selectedFormat !== 'grandprix' && this.selectedFormat !== 'balloon') {
      const activeTrack = getTrackById(effKey);
      const activeTel = getTrackTelemetry(baseId, this.profile, this.mirrorMode);
      this._renderSpotlightHud({
        kicker: this.mirrorMode ? 'SURVOL DRONE 3D • MIROIR ⇄' : 'SURVOL DRONE 3D',
        diff: activeTrack.difficulty || '',
        title: `${activeTrack.icon} ${activeTrack.name.toUpperCase()}`,
        sub: activeTrack.subtitle || '',
        accent: activeTrack.accent,
        chips: activeTel.chips,
      });
      if (this.homeView === 'tracks' && notify) {
        requestAnimationFrame(() => this._scrollCarouselToActive('smooth'));
      }
    }
    if (notify) {
      this.callbacks.onSelectTrack?.(baseId);
    }
  }

  _setSteerMode(mode, notify = false) {
    const next = mode === 'buttons' ? 'buttons' : 'joystick';
    this.steerMode = next;
    writePref(STORAGE_KEYS.STEER_MODE, next);
    this._syncUtilityButtons();
    if (notify) {
      this.callbacks.onSelectSteerMode?.(next);
    }
    return next;
  }

  setSteerMode(mode) {
    return this._setSteerMode(mode, false);
  }

  getSteerMode() {
    return this.steerMode;
  }

  /**
   * Opens or closes the Pause / Race Options Modal cleanly (idempotent).
   */
  setPaused(paused, notify = false) {
    const next = Boolean(paused);
    if (this.paused === next) return this.paused;
    this.paused = next;
    const isSolo = this._currentMode === 'solo';
    if (this.pauseTitleEl) {
      this.pauseTitleEl.textContent = isSolo ? '⏸️ PAUSE' : '⚙️ OPTIONS COURSE';
    }
    if (this.pauseRestartBtnEl) {
      this.pauseRestartBtnEl.classList.toggle('is-hidden', !isSolo);
    }
    this.pauseBackdropEl?.classList.toggle('is-hidden', !next);
    if (notify) {
      this.callbacks.onTogglePause?.(next);
    }
    return this.paused;
  }

  isPaused() {
    return this.paused;
  }

  setSelectedTrack(trackId) {
    this._selectTrack(trackId, false);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._syncUtilityButtons();
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = Boolean(enabled);
    this._syncUtilityButtons();
  }

  setGyroEnabled(enabled) {
    this.gyroEnabled = Boolean(enabled);
    this._syncUtilityButtons();
  }

  setGyroSensitivity(level, notify = false) {
    const next = normalizeGyroSensitivity(level);
    this.gyroSensitivity = next;
    writePref(STORAGE_KEYS.GYRO_SENSITIVITY, next);
    this._syncUtilityButtons();
    if (notify) {
      if (this.callbacks.onGyroSensitivityChange) {
        this.callbacks.onGyroSensitivityChange(next);
      } else {
        window.dispatchEvent(new CustomEvent('pocketkart:gyro-sensitivity', { detail: next }));
      }
    }
    return next;
  }

  getGyroSensitivity() {
    return this.gyroSensitivity;
  }

  setGyroInvert(invert, notify = false) {
    const next = Boolean(invert);
    this.gyroInvert = next;
    writePref(STORAGE_KEYS.GYRO_INVERT, next);
    this._syncUtilityButtons();
    if (notify) {
      if (this.callbacks.onGyroInvertChange) {
        this.callbacks.onGyroInvertChange(next);
      } else {
        window.dispatchEvent(new CustomEvent('pocketkart:gyro-invert', { detail: next }));
      }
    }
    return next;
  }

  getGyroInvert() {
    return this.gyroInvert;
  }

  setHapticsEnabled(enabled, notify = false) {
    const next = Boolean(enabled);
    this.hapticsEnabled = next;
    writePref(STORAGE_KEYS.HAPTICS, next);
    this._syncUtilityButtons();
    if (notify) {
      if (this.callbacks.onToggleHaptics) {
        this.callbacks.onToggleHaptics(next);
      } else {
        window.dispatchEvent(new CustomEvent('pocketkart:haptics-toggle', { detail: next }));
      }
    }
    return next;
  }

  getHapticsEnabled() {
    return this.hapticsEnabled;
  }

  setAutoAccel(enabled) {
    this.autoAccel = Boolean(enabled);
    this._syncUtilityButtons();
  }

  setDeviceMode(mode) {
    this.deviceMode = mode === 'mobile' ? 'mobile' : 'desktop';
    this._syncUtilityButtons();
  }

  setQualityMode(quality) {
    const normalized = normalizeQualityMode(quality);
    this.qualityMode = normalized;
    writePref(STORAGE_KEYS.QUALITY, normalized);
    this._syncQualityButtons();
    return normalized;
  }

  setGamepadConnected(connected, name = '') {
    this.gamepadConnected = Boolean(connected);
    this.gamepadName = String(name || '').trim();
    this._syncGamepadBadges();
    if (this.controlsBackdropEl && !this.controlsBackdropEl.classList.contains('is-hidden')) {
      this._renderControlsModal();
    }
  }

  _spawnActionPopup(text, tone = 'cyan') {
    if (!this.actionPopupsEl || !text || this.activeScreen !== 'hud') return;
    while (this.actionPopupsEl.children.length >= 3) {
      this.actionPopupsEl.firstElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = `pk-action-popup pk-action-popup--${tone}`;
    el.textContent = text;
    this.actionPopupsEl.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
    }, 1500);
  }

  _pushKillfeedLine(icon, text, isLocalInvolved = false) {
    if (!this.killfeedEl || !text || this.activeScreen !== 'hud') return;
    const row = document.createElement('div');
    row.className = `pk-killfeed-row${isLocalInvolved ? ' is-local' : ''}`;

    const iconEl = document.createElement('span');
    iconEl.className = 'pk-killfeed-icon';
    iconEl.textContent = icon || '⚡';

    const txtEl = document.createElement('span');
    txtEl.className = 'pk-killfeed-text';
    txtEl.textContent = text;

    row.appendChild(iconEl);
    row.appendChild(txtEl);

    while (this.killfeedEl.children.length >= 3) {
      this.killfeedEl.firstElementChild?.remove();
    }
    this.killfeedEl.appendChild(row);

    setTimeout(() => {
      row.classList.add('is-leaving');
      setTimeout(() => row.remove(), 260);
    }, 4000);
  }

  pushRaceEvent(ev, state = null, localId = null) {
    if (!ev || !ev.type) return;
    if (ev.id !== undefined && ev.id !== null) {
      if (this._seenRaceEventIds.has(ev.id)) return;
      this._seenRaceEventIds.add(ev.id);
      if (this._seenRaceEventIds.size > 250) {
        const first = this._seenRaceEventIds.values().next().value;
        this._seenRaceEventIds.delete(first);
      }
    }

    const effLocalId = localId || state?.localId || null;
    const karts = Array.isArray(state?.karts) ? state.karts : [];
    const getKartName = (id) => {
      const k = karts.find((item) => item.id === id);
      if (k?.name) return k.name;
      if (k?.racerId) return getRacerById(k.racerId)?.name || 'Pilote';
      return 'Pilote';
    };
    const isLocalActor = Boolean(effLocalId && (ev.kartId === effLocalId || ev.playerId === effLocalId));
    const isLocalAttacker = Boolean(effLocalId && ev.attackerId === effLocalId);
    const isLocalTarget = Boolean(effLocalId && (ev.targetId === effLocalId || ev.kartId === effLocalId));

    // 1. Kinetic Arcade Action Popups (Local player highlights)
    switch (ev.type) {
      case 'rocket_start':
        if (isLocalActor) this._spawnActionPopup('🚀 DÉPART CANON !', 'gold');
        this._pushKillfeedLine('🚀', `${getKartName(ev.kartId)} • Départ Canon !`, isLocalActor);
        return;

      case 'rocket_fail':
        if (isLocalActor) this._spawnActionPopup('💥 SURCHAUFFE !', 'danger');
        return;

      case 'boost':
        if (isLocalActor) {
          if (ev.charge === 3) {
            this._spawnActionPopup('⚡ ULTRA TURBO !', 'magenta');
          } else if (ev.charge === 2) {
            this._spawnActionPopup('🔥 SUPER TURBO !', 'orange');
          } else if (ev.charge === 1) {
            this._spawnActionPopup('💨 MINI-TURBO !', 'cyan');
          } else if (ev.source === 'draft') {
            this._spawnActionPopup('💨 ASPIRATION TURBO !', 'cyan');
          } else if (ev.source === 'stunt') {
            this._spawnActionPopup('🤸 BOOST FIGURE !', 'gold');
          } else if (ev.source === 'pad') {
            this._spawnActionPopup('⚡ TURBO PISTE !', 'cyan');
          } else if (ev.item === ITEMS.TURBO) {
            this._spawnActionPopup('🍄 TURBO !', 'orange');
          }
        }
        return;

      case 'stunt':
        if (isLocalActor) this._spawnActionPopup('🤸 FIGURE 360° !', 'gold');
        return;

      case 'shield_block':
        if (isLocalActor) this._spawnActionPopup('🛡️ BOUCLIER PARFAIT !', 'cyan');
        this._pushKillfeedLine('🛡️', `${getKartName(ev.kartId)} pare l'attaque`, isLocalActor);
        return;

      case 'hit': {
        const victimId = ev.targetId || ev.kartId;
        const attackerId = ev.attackerId;
        const itemIcon = ITEM_DISPLAY[ev.item]?.icon || '💥';
        if (isLocalAttacker && victimId !== effLocalId) {
          this._spawnActionPopup('🎯 CIBLE TOUCHÉE !', 'gold');
        } else if (isLocalTarget && victimId === effLocalId) {
          this._spawnActionPopup('💥 TOUCHÉ !', 'danger');
        }
        if (attackerId && attackerId !== victimId) {
          this._pushKillfeedLine(
            itemIcon,
            `${getKartName(attackerId)} ➜ ${getKartName(victimId)}`,
            isLocalAttacker || victimId === effLocalId
          );
        } else {
          this._pushKillfeedLine(
            itemIcon,
            `${getKartName(victimId)} glisse !`,
            victimId === effLocalId
          );
        }
        return;
      }

      case 'balloon_pop': {
        const victimId = ev.kartId || ev.playerId;
        if (isLocalAttacker && victimId !== effLocalId) {
          this._spawnActionPopup('🎈 BALLON CREVÉ !', 'gold');
        } else if (victimId === effLocalId) {
          this._spawnActionPopup('💥 BALLON PERDU !', 'danger');
        }
        const actor = ev.attackerId ? `${getKartName(ev.attackerId)} ➜ ` : '';
        this._pushKillfeedLine(
          '🎈',
          `${actor}${getKartName(victimId)} (${ev.balloonsLeft ?? 0} rest.)`,
          isLocalAttacker || victimId === effLocalId
        );
        return;
      }

      case 'eliminated': {
        const victimName = ev.name || getKartName(ev.kartId);
        if (isLocalActor) this._spawnActionPopup('💀 ÉLIMINÉ !', 'danger');
        this._pushKillfeedLine('💀', `${victimName} éliminé !`, isLocalActor);
        return;
      }

      case 'lightning': {
        if (isLocalActor) this._spawnActionPopup('⚡ ÉCLAIR DÉCLENCHÉ !', 'gold');
        this._pushKillfeedLine('⚡', `${getKartName(ev.kartId)} lance l'Éclair !`, isLocalActor);
        return;
      }

      case 'fire': {
        if (ev.item === (ITEMS.BLUE_SHELL || 'blue_shell')) {
          this._pushKillfeedLine('🐚', `${getKartName(ev.kartId)} lance Carapace Bleue !`, isLocalActor);
        }
        return;
      }

      case 'finish': {
        const ord = formatOrdinalFr(ev.rank || 1);
        this._pushKillfeedLine(
          '🏁',
          `${getKartName(ev.kartId)} termine ${ord.num}${ord.sup}`,
          isLocalActor
        );
        return;
      }

      default:
        break;
    }
  }

  setUnlockedRacers(unlockedIds, isAuthenticated = false) {
    this.isAuthenticated = Boolean(isAuthenticated);
    this.unlockedRacers = unlockedIds instanceof Set
      ? new Set(unlockedIds)
      : new Set(Array.isArray(unlockedIds) ? unlockedIds : ['red', 'aqua', 'kiwi']);

    if (!this.unlockedRacers.has(this.selectedRacerId)) {
      const fallback = RACERS.find((r) => this.unlockedRacers.has(r.id))?.id || 'red';
      this.selectedRacerId = fallback;
      writePref(STORAGE_KEYS.RACER, fallback);
    }

    if (this.createRoomLabelEl) {
      this.createRoomLabelEl.textContent = this.isAuthenticated
        ? '🌐 Créer un Salon'
        : '🌐 Créer un Salon 🔒';
    }
    this._renderRacerSelection();
  }

  getPodiumAuthSlot() {
    return this.podiumAuthSlotEl;
  }

  getLastAwardsMap() {
    return this._lastAwardsMap;
  }

  setProfile(profile) {
    this.profile = profile || null;
    if (this.profile) {
      if (!isCcUnlocked(this.profile, this.selectedCc)) {
        this.selectedCc = '100cc';
      }
      if (this.mirrorMode && !isMirrorUnlocked(this.profile)) {
        this.mirrorMode = false;
      }
    }
    this._renderCareerBar();
    this._renderFormatControls();
    this._renderHomeContextCards();
    if (this.garageBackdropEl && !this.garageBackdropEl.classList.contains('is-hidden')) {
      this._renderGarageModal();
    }
    if (this.challengesBackdropEl && !this.challengesBackdropEl.classList.contains('is-hidden')) {
      this._renderChallengesModal();
    }
  }

  setFormatState({ format, cupId, cc, mirror } = {}) {
    if (format && GAME_FORMATS.some((f) => f.id === format)) {
      this.selectedFormat = format;
    }
    if (cupId && CUPS.some((c) => c.id === cupId)) {
      this.selectedCupId = cupId;
    }
    if (cc && CC_CLASSES[cc]) {
      this.selectedCc = cc;
    }
    if (typeof mirror === 'boolean') {
      this.mirrorMode = mirror;
    }
    this._renderFormatControls();
    this._renderHomeContextCards();
  }

  setProgressionResult(rewardRes, gpState = null) {
    this._lastProgressionRes = rewardRes || null;
    this._lastGpState = gpState || null;
    this._renderPodiumProgression();
  }

  _renderPodiumProgression() {
    if (!this.podiumProgressionEl) return;
    const rewardRes = this._lastProgressionRes;
    const gp = this._lastGpState;

    const hasNextGp = Boolean(
      gp && !gp.isFinalRace && gp.raceIndex + 1 < gp.totalRaces
    );
    this.nextGpBtnEl?.classList.toggle('is-hidden', !hasNextGp);
    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = gp && !hasNextGp ? '🏆 Rejouer la Coupe' : '🔄 Rejouer';
    }

    if (!rewardRes && !gp) {
      this.podiumProgressionEl.classList.add('is-hidden');
      this.podiumProgressionEl.innerHTML = '';
      return;
    }

    let html = '';

    if (rewardRes) {
      const p = rewardRes.profile || this.profile;
      const lvlInfo = computeLevelFromXp(p?.xp || 0);
      const breakdownHtml = (rewardRes.breakdown || [])
        .map((b) => `<span class="pk-xp-chip">${b.label} <strong>+${b.value}</strong></span>`)
        .join('');

      const ttMedal =
        typeof rewardRes.medalResult === 'string'
          ? rewardRes.medalResult
          : rewardRes.medalResult?.medal || null;

      const medalHtml = ttMedal
        ? `<div class="pk-unlock-banner pk-unlock-banner--medal">${formatMedalIcon(
            ttMedal
          )} Médaille ${
            ttMedal === 'author'
              ? 'Auteur'
              : ttMedal.toUpperCase()
          }${rewardRes.isNewPb ? ' • 🔥 NOUVEAU RECORD !' : ''}</div>`
        : rewardRes.isNewPb
          ? `<div class="pk-unlock-banner pk-unlock-banner--medal">⏱️ 🔥 NOUVEAU RECORD PERSONNEL !</div>`
          : '';

      const levelBannerHtml = rewardRes.leveledUp
        ? `<div class="pk-unlock-banner pk-unlock-banner--level">⬆️ NIVEAU ${rewardRes.newLevel} ATTEINT ! (${getRankTitle(
            rewardRes.newLevel
          )})</div>`
        : '';

      const unlockHtml = (rewardRes.newUnlocks || []).length
        ? `<div class="pk-unlock-banner pk-unlock-banner--unlock">🎁 Débloqué : ${rewardRes.newUnlocks
            .map((u) => `${u.icon} ${u.name}`)
            .join(' • ')}</div>`
        : '';

      const chHtml = (rewardRes.completedChallenges || []).length
        ? `<div class="pk-unlock-banner pk-unlock-banner--challenge">🎯 Défi validé : ${rewardRes.completedChallenges
            .map((c) => `${c.icon} ${c.label} (+${c.rewardXp} XP, +${c.rewardCoins} 🪙)`)
            .join(' • ')}</div>`
        : '';

      html += `
        <div class="pk-prog-top-row">
          <div class="pk-prog-summary">
            <span class="pk-level-badge">Niv. ${lvlInfo.level}</span>
            <span class="pk-prog-xp-gain">+${rewardRes.xpGained || 0} XP</span>
            <span class="pk-coin-chip">+${rewardRes.coinsEarned || 0} 🪙</span>
          </div>
          <div class="pk-xp-bar-wrap pk-xp-bar-wrap--lg">
            <div class="pk-xp-bar-fill pk-xp-bar-fill--animated" data-role="podium-xp-fill" data-target-pct="${Math.round(
              lvlInfo.progress * 100
            )}" style="width:0%"></div>
          </div>
        </div>
        <div class="pk-xp-chips">${breakdownHtml}</div>
        ${medalHtml}
        ${levelBannerHtml}
        ${unlockHtml}
        ${chHtml}
      `;
    }

    if (gp) {
      const gpRes = gp.gpRes;
      const cupTitle = gpRes?.trophy
        ? `🏆 COUPE TERMINÉE — ${
            gpRes.trophy === 'gold'
              ? '🥇 OR'
              : gpRes.trophy === 'silver'
                ? '🥈 ARGENT'
                : '🥉 BRONZE'
          } (${'★'.repeat(gpRes.stars || 1)}) • +${gpRes.bonusXp} XP / +${gpRes.bonusCoins} 🪙`
        : `🏆 ${gp.cupName} — Course ${gp.raceIndex + 1}/${gp.totalRaces}`;

      const rowsHtml = (gp.standings || [])
        .map((row, idx) => {
          const racer = getRacerById(row.racerId);
          return `
            <div class="pk-gp-row${row.isLocal ? ' is-local' : ''}">
              <span class="pk-gp-pos">${idx + 1}.</span>
              <span class="pk-gp-dot" style="background:${racer.color}"></span>
              <span class="pk-gp-name">${row.name}</span>
              <span class="pk-gp-pts">${row.points} pts${
                row.lastAdded ? ` (+${row.lastAdded})` : ''
              }</span>
            </div>
          `;
        })
        .join('');

      const gpUnlockHtml = gpRes?.newUnlocks?.length
        ? `<div class="pk-unlock-banner pk-unlock-banner--unlock">🎁 Coupe débloquée : ${gpRes.newUnlocks
            .map((u) => `${u.icon} ${u.name}`)
            .join(' • ')}</div>`
        : '';

      html += `
        <div class="pk-gp-standings">
          <div class="pk-gp-header">${cupTitle}</div>
          <div class="pk-gp-rows">${rowsHtml}</div>
          ${gpUnlockHtml}
        </div>
      `;
    }

    this.podiumProgressionEl.innerHTML = html;
    this.podiumProgressionEl.classList.remove('is-hidden');

    const animFill = this.podiumProgressionEl.querySelector('[data-role="podium-xp-fill"]');
    if (animFill) {
      const targetPct = Math.max(0, Math.min(100, Number(animFill.dataset.targetPct) || 0));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          animFill.style.width = `${targetPct}%`;
        });
      });
    }
  }

  _renderRacerSelection() {
    const selected = getRacerById(this.selectedRacerId);
    if (this.selectedRacerNameEl && selected) {
      this.selectedRacerNameEl.textContent = selected.tagline
        ? `${selected.emoji || ''} ${selected.name} — ${selected.tagline}`.trim()
        : selected.name;
      this.selectedRacerNameEl.style.color = selected.color;
    }

    const pills = this.racerStripEl.querySelectorAll('.pk-racer-pill');
    pills.forEach((pill) => {
      const id = pill.dataset.racerId;
      const locked = !this.unlockedRacers.has(id);
      const active = !locked && id === this.selectedRacerId;
      pill.classList.toggle('is-selected', active);
      pill.classList.toggle('is-locked', locked);
      pill.setAttribute('aria-selected', String(active));
      const lockEl = pill.querySelector('.pk-racer-lock-tag');
      if (lockEl) {
        lockEl.classList.toggle('is-hidden', !locked);
      }
    });
  }

  _renderTrackSelection(activeTrackId = this.selectedTrackId) {
    const baseActive = getBaseTrackId(activeTrackId);
    const track = getTrackById(activeTrackId);
    if (
      this.selectedTrackSubEl &&
      track &&
      this.selectedFormat !== 'grandprix' &&
      this.selectedFormat !== 'balloon'
    ) {
      this.selectedTrackSubEl.textContent = `${track.icon} ${track.subtitle}`;
      this.selectedTrackSubEl.style.color = track.accent;
    }

    if (this.homeTrackStripEl && this.selectedFormat !== 'grandprix' && this.selectedFormat !== 'balloon') {
      const homeCards = this.homeTrackStripEl.querySelectorAll('.pk-carousel-card');
      homeCards.forEach((c) => {
        const isSel = c.dataset.trackId === baseActive;
        c.classList.toggle('is-selected', isSel);
        c.setAttribute('aria-selected', String(isSel));
      });
    }

    if (this.lobbyTrackStripEl) {
      const lobbyCards = this.lobbyTrackStripEl.querySelectorAll('.pk-track-card');
      lobbyCards.forEach((c) => {
        const isSel = c.dataset.trackId === baseActive;
        c.classList.toggle('is-selected', isSel);
        c.setAttribute('aria-selected', String(isSel));
      });
    }
    this._syncFeaturedTrackCard();
  }

  _syncUtilityButtons() {
    // Steer mode cycle pills + pause modal segmented buttons
    const steerCycleBtns = this.el.querySelectorAll('[data-action="cycle-steer-mode"]');
    steerCycleBtns.forEach((btn) => {
      btn.textContent =
        this.steerMode === 'buttons'
          ? btn.classList.contains('pk-popover-row-btn')
            ? '◀▶ Direction : Boutons'
            : '◀▶ Boutons'
          : btn.classList.contains('pk-popover-row-btn')
            ? '🕹️ Direction : Joystick'
            : '🕹️ Joystick';
    });
    this.segJoystickEl?.classList.toggle('is-selected', this.steerMode === 'joystick');
    this.segButtonsEl?.classList.toggle('is-selected', this.steerMode === 'buttons');

    // SFX Mute buttons
    const muteBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-mute"], .pk-popover-row-btn[data-action="toggle-mute"]');
    muteBtns.forEach((btn) => {
      btn.textContent = btn.classList.contains('pk-popover-row-btn')
        ? this.muted
          ? '🔇 Effets : OFF'
          : '🔊 Effets : ON'
        : this.muted
          ? '🔇'
          : '🔊';
      btn.classList.toggle('is-off', this.muted);
    });
    if (this.pauseSfxPillEl) {
      this.pauseSfxPillEl.textContent = this.muted ? '🔇 Son: OFF' : '🔊 Son: ON';
      this.pauseSfxPillEl.classList.toggle('is-off', this.muted);
    }

    // Music buttons
    const musicBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-music"], .pk-popover-row-btn[data-action="toggle-music"]');
    musicBtns.forEach((btn) => {
      btn.textContent = btn.classList.contains('pk-popover-row-btn')
        ? this.musicEnabled
          ? '🎵 Musique : ON'
          : '🎵 Musique : OFF'
        : '🎵';
      btn.classList.toggle('is-off', !this.musicEnabled);
    });
    if (this.pauseMusicPillEl) {
      this.pauseMusicPillEl.textContent = this.musicEnabled ? '🎵 Musique: ON' : '🎵 Musique: OFF';
      this.pauseMusicPillEl.classList.toggle('is-off', !this.musicEnabled);
    }

    // Gyro buttons (topbar pill, popover row, pause pill, icon btn)
    const gyroBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-gyro"], .pk-popover-row-btn[data-action="toggle-gyro"], .pk-topbar-gyro-btn[data-action="toggle-gyro"]');
    gyroBtns.forEach((btn) => {
      if (btn.classList.contains('pk-topbar-gyro-btn')) {
        if (this.topbarGyroTxtEl) {
          this.topbarGyroTxtEl.textContent = this.gyroEnabled ? 'Gyro ON' : 'Gyro';
        }
      } else if (btn.classList.contains('pk-popover-row-btn')) {
        btn.textContent = this.gyroEnabled ? '📱 Gyroscope : ON' : '📱 Gyroscope : OFF';
      } else {
        btn.textContent = '📱';
      }
      btn.classList.toggle('is-active-toggle', this.gyroEnabled);
      btn.classList.toggle('is-off', !this.gyroEnabled);
    });
    if (this.pauseGyroPillEl) {
      this.pauseGyroPillEl.textContent = this.gyroEnabled ? '📱 Gyro: ON' : '📱 Gyro: OFF';
      this.pauseGyroPillEl.classList.toggle('is-off', !this.gyroEnabled);
    }

    // Gyro sub-controls visibility & state (recalibrate, sensitivity, invert)
    this.hudGyroRecalBtnEl?.classList.toggle('is-hidden', !this.gyroEnabled);
    this.popoverGyroControlsEl?.classList.toggle('is-hidden', !this.gyroEnabled);
    this.pauseGyroSectionEl?.classList.toggle('is-hidden', !this.gyroEnabled);

    const gyroSensBtns = this.el.querySelectorAll('[data-action="set-gyro-sens"]');
    gyroSensBtns.forEach((btn) => {
      const active = btn.dataset.sens === this.gyroSensitivity;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    const gyroInvertBtns = this.el.querySelectorAll('[data-action="toggle-gyro-invert"]');
    gyroInvertBtns.forEach((btn) => {
      btn.textContent = btn.classList.contains('pk-popover-row-btn')
        ? this.gyroInvert
          ? '⇄ Axe Gyro : Inversé'
          : '⇄ Axe Gyro : Normal'
        : this.gyroInvert
          ? '⇄ Axe: Inversé'
          : '⇄ Axe: Normal';
      btn.classList.toggle('is-active-toggle', this.gyroInvert);
    });

    // Haptics buttons
    const hapticsBtns = this.el.querySelectorAll('[data-action="toggle-haptics"]');
    hapticsBtns.forEach((btn) => {
      btn.textContent = btn.classList.contains('pk-popover-row-btn')
        ? this.hapticsEnabled
          ? '📳 Vibrations : ON'
          : '📳 Vibrations : OFF'
        : this.hapticsEnabled
          ? '📳 Vibrations: ON'
          : '📳 Vibrations: OFF';
      btn.classList.toggle('is-off', !this.hapticsEnabled);
    });

    // Auto-Accel pills
    const autoBtns = this.el.querySelectorAll('[data-action="toggle-auto-accel"]');
    autoBtns.forEach((btn) => {
      btn.textContent = this.autoAccel ? '⚡ Auto-Gaz: ON' : '🚀 Gaz Manuel';
      btn.classList.toggle('is-off', !this.autoAccel);
    });

    this._syncFullscreenButtons();
    this._syncQualityButtons();
    this._syncGamepadBadges();
  }

  _syncFullscreenButtons() {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const fsBtns = this.el.querySelectorAll('[data-action="fullscreen"]');
    fsBtns.forEach((btn) => {
      btn.classList.toggle('is-active-toggle', isFs);
      if (btn.classList.contains('pk-popover-row-btn') || btn.dataset.role === 'pause-fullscreen-pill') {
        btn.textContent = isFs ? '⛶ Quitter plein écran' : '⛶ Plein écran';
      }
    });
  }

  _syncQualityButtons() {
    const btns = this.el.querySelectorAll('[data-action="set-quality"]');
    btns.forEach((btn) => {
      const active = btn.dataset.quality === this.qualityMode;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  _syncGamepadBadges() {
    const badges = this.el.querySelectorAll('[data-role="gamepad-badge"]');
    const shortName = this.gamepadName
      ? this.gamepadName.replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 14)
      : 'Manette';
    badges.forEach((badge) => {
      badge.classList.toggle('is-hidden', !this.gamepadConnected);
      badge.classList.toggle('is-connected', this.gamepadConnected);
      badge.title = this.gamepadConnected
        ? `Manette connectée : ${this.gamepadName || 'Contrôleur'}`
        : 'Aucune manette détectée';
      const txt = badge.querySelector('[data-role="gamepad-badge-txt"]');
      if (txt) {
        txt.textContent = `🎮 ${shortName || 'Manette'}`;
      }
    });
  }

  _togglePodium3DView(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !this._podium3DView;
    this._podium3DView = next;
    this.screens.finished?.classList.toggle('is-podium-3d-view', next);
    if (this.podium3DBtnEl) {
      this.podium3DBtnEl.textContent = next ? '📊 Voir le Classement' : '👁️ Vue Podium 3D';
      this.podium3DBtnEl.classList.toggle('is-active', next);
    }
  }

  _triggerJoinRoom() {
    const code = (this.roomCodeInputEl.value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    this.roomCodeInputEl.value = code;
    this.callbacks.onJoinRoom?.({
      roomCode: code,
      playerName: this._getPlayerName(),
      racerId: this.selectedRacerId,
    });
  }

  _getInviteUrl(roomCode = this._activeRoomCode) {
    const code = roomCode || '';
    const url = new URL(window.location.href);
    url.hash = '';
    if (code) {
      url.searchParams.set('room', code);
    }
    return url.toString();
  }

  async _renderLobbyQR(roomCode) {
    if (!roomCode || roomCode === '----' || roomCode === 'SOLO') {
      this.qrBoxEl.classList.add('is-hidden');
      return;
    }
    this.qrBoxEl.classList.remove('is-hidden');

    const inviteUrl = this._getInviteUrl(roomCode);
    if (inviteUrl === this._lastQrUrl) return;
    this._lastQrUrl = inviteUrl;

    try {
      const svgString = await QRCode.toString(inviteUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#0f1c38',
          light: '#ffffff',
        },
      });
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgEl = doc.documentElement;
      if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
        svgEl.setAttribute('class', 'pk-qr-svg');
        this.qrSvgWrapEl.replaceChildren(svgEl);
      }
    } catch {
      this.qrBoxEl.classList.add('is-hidden');
    }
  }

  async _copyInviteLink() {
    if (!this._activeRoomCode) return;
    const shareUrl = this._getInviteUrl();
    const copied = await copyTextToClipboard(shareUrl);
    if (copied) {
      this.showToast(`Lien du salon ${this._activeRoomCode} copié ! 🎉`, 'success');
    } else {
      this.showToast(`Code salon : ${this._activeRoomCode}`, 'info');
    }
  }

  async _nativeShareInvite() {
    if (!this._activeRoomCode || !navigator.share) return;
    try {
      await navigator.share({
        title: 'PocketKart 3D 🏎️',
        text: `Rejoins ma course PocketKart 3D ! Code salon : ${this._activeRoomCode}`,
        url: this._getInviteUrl(),
      });
    } catch {
      // User cancelled share sheet
    }
  }

  async _handleShareGhost() {
    if (!this.callbacks.onShareGhost) {
      const copied = await copyTextToClipboard(window.location.href);
      if (copied) this.showToast('👻 Lien copié dans le presse-papiers !', 'success');
      return;
    }

    try {
      const maybeUrl = await this.callbacks.onShareGhost(this._lastFinishedState);
      if (typeof maybeUrl === 'string' && maybeUrl.startsWith('http')) {
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'Défi Fantôme — PocketKart 3D 👻',
              text: 'Essaie de battre mon fantôme sur PocketKart 3D !',
              url: maybeUrl,
            });
            return;
          } catch {
            // Fallback to clipboard
          }
        }
        const ok = await copyTextToClipboard(maybeUrl);
        if (ok) {
          this.showToast('👻 Lien Défi Fantôme copié ! Envoie-le à un ami !', 'success');
        }
      }
    } catch (err) {
      this.showToast(err?.message || 'Impossible de générer le lien fantôme.', 'error');
    }
  }

  async _generateAndShareStoryCard() {
    const state = this._lastFinishedState;
    if (!state) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const track = getTrackById(state.trackId || this.selectedTrackId);
    const karts = [...(state.karts || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    const local = karts.find((k) => k.id === state.localId) || karts[0];
    const myRank = local?.rank || 1;
    const ord = formatOrdinalFr(myRank);
    const kartMeta = getKartMeta(local?.kartId);
    const boostMeta = getBoostMeta(local?.boostColorId);
    const formatMeta =
      GAME_FORMATS.find((f) => f.id === (state.gameFormat || 'race')) || GAME_FORMATS[0];
    const modeTagParts = [
      `${formatMeta.icon} ${formatMeta.name.toUpperCase()}`,
      String(state.cc || this.selectedCc || '100cc').toUpperCase(),
    ];
    if (state.mirror) modeTagParts.push('MIROIR ⇄');
    const modeTag = modeTagParts.join(' • ');

    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
    if (track.id.startsWith('neon')) {
      bgGrad.addColorStop(0, '#090d24');
      bgGrad.addColorStop(0.5, '#2b0a4d');
      bgGrad.addColorStop(1, '#0c1b47');
    } else if (track.id.startsWith('rainbow')) {
      bgGrad.addColorStop(0, '#10002b');
      bgGrad.addColorStop(0.5, '#3c096c');
      bgGrad.addColorStop(1, '#1d3557');
    } else {
      bgGrad.addColorStop(0, '#0077b6');
      bgGrad.addColorStop(0.52, '#00b4d8');
      bgGrad.addColorStop(1, '#ff9f1c');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1350);

    ctx.save();
    ctx.translate(540, 380);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let i = 0; i < 18; i++) {
      ctx.rotate((Math.PI * 2) / 18);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-48, -950);
      ctx.lineTo(48, -950);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffbe0b';
    ctx.font = '800 30px Fredoka, Nunito, sans-serif';
    ctx.fillText(`🏁 POCKET KART 3D • ${modeTag}`, 540, 82);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 76px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${track.icon} ${track.name.toUpperCase()}`, 540, 166);

    roundRectPath(ctx, 76, 206, 928, 326, 40);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = track.accent || '#00f5d4';
    ctx.stroke();

    const heroRacer = getRacerById(local?.racerId);
    const heroAward = this._lastAwardsMap.get(local?.id) || {
      icon: (local?.stats?.timesHit || 0) === 0 ? '😎' : '⚡',
      title: (local?.stats?.timesHit || 0) === 0 ? 'Intouchable' : 'Pilote Turbo',
    };

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffbe0b';
    ctx.font = '700 108px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${ord.num}${ord.sup}`, 118, 336);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 52px Fredoka, Nunito, sans-serif';
    ctx.fillText(local?.name || 'Pilote', 330, 294);

    ctx.fillStyle = heroRacer.color;
    ctx.font = '700 32px Nunito, sans-serif';
    ctx.fillText(
      `⏱️ ${formatRaceTime(local?.finishTimeMs || state.raceTimeMs)} • ${kartMeta.icon} ${kartMeta.name} • ${boostMeta.icon}`,
      330,
      344
    );

    roundRectPath(ctx, 330, 366, 480, 54, 27);
    ctx.fillStyle = 'rgba(255, 190, 11, 0.22)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffbe0b';
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.font = '700 28px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${heroAward.icon} ${heroAward.title}`, 356, 403);

    // Local race telemetry strip (Boosts, Stunts, Hits, Coins)
    const lStats = local?.stats || {};
    const telPills = [
      `⚡ ${lStats.driftsBoosted || 0} Boosts`,
      `🤸 ${lStats.stunts || 0} Figures`,
      `🎯 ${lStats.hitsDealt || 0} Touches`,
      `🪙 ${local?.coins || 0}/10 Pièces`,
    ];
    let px = 112;
    ctx.font = '700 24px Nunito, sans-serif';
    telPills.forEach((txt) => {
      roundRectPath(ctx, px, 448, 206, 52, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(txt, px + 103, 482);
      px += 220;
    });

    const medals = ['🥇', '🥈', '🥉', '4e', '5e', '6e'];
    let y = 576;
    karts.slice(0, 6).forEach((k, i) => {
      const isMe = k.id === state.localId;
      const r = getRacerById(k.racerId);

      roundRectPath(ctx, 76, y, 928, 92, 26);
      ctx.fillStyle = isMe ? 'rgba(0, 245, 212, 0.24)' : 'rgba(15, 23, 42, 0.68)';
      ctx.fill();
      ctx.lineWidth = isMe ? 4 : 2;
      ctx.strokeStyle = isMe ? '#00f5d4' : 'rgba(255, 255, 255, 0.24)';
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 42px Fredoka, Nunito, sans-serif';
      ctx.fillText(medals[i] || `${i + 1}e`, 136, y + 60);

      ctx.beginPath();
      ctx.arc(212, y + 46, 20, 0, Math.PI * 2);
      ctx.fillStyle = r.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 38px Fredoka, Nunito, sans-serif';
      const crown = k.hasCrown ? '👑 ' : '';
      ctx.fillText(`${crown}${k.name || r.name}`, 254, y + 58);

      const award = this._lastAwardsMap.get(k.id);
      if (award) {
        ctx.fillStyle = '#fde047';
        ctx.font = '700 26px Nunito, sans-serif';
        ctx.fillText(`${award.icon} ${award.title}`, 580, y + 56);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = '#a8e6ff';
      ctx.font = '700 36px Fredoka, Nunito, sans-serif';
      ctx.fillText(formatRaceTime(k.finishTimeMs || state.raceTimeMs), 968, y + 58);

      y += 104;
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px Fredoka, Nunito, sans-serif';
    ctx.fillText('Viens battre mon record en direct dans ton navigateur !', 540, 1258);

    ctx.fillStyle = '#fff3b0';
    ctx.font = '800 30px Nunito, sans-serif';
    ctx.fillText(window.location.origin, 540, 1306);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const fileName = `pocketkart-${track.id}-${ord.num}${ord.sup}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Mon Podium PocketKart 3D 🏎️',
          text: `J'ai fini ${ord.num}${ord.sup} sur ${track.name} !`,
        });
        this.showToast('📸 Carte Podium partagée !', 'success');
        return;
      } catch {
        // Fallback to download
      }
    }

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    this.showToast('📸 Carte Podium téléchargée en PNG !', 'success');
  }

  async _toggleFullscreen() {
    const docEl = document.documentElement;
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFs) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (typeof req === 'function') {
        try {
          await req.call(docEl);
          if (this.deviceMode === 'mobile') {
            lockLandscapeOrientation();
          }
        } catch {
          if (isIOSDevice()) {
            this.showToast(
              "📲 Sur iPhone/iPad : touche Partager puis « Sur l'écran d'accueil » pour le plein écran !",
              'info'
            );
          }
        }
      } else if (isIOSDevice()) {
        this.showToast(
          "📲 Sur iPhone : touche Partager puis « Sur l'écran d'accueil » pour le plein écran intégral !",
          'info'
        );
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        await exit?.call(document);
      } catch {
        // Ignore exit errors
      }
    }
    this._syncFullscreenButtons();
  }

  _switchScreen(screenName) {
    if (this.activeScreen === screenName) return;
    this.activeScreen = screenName;
    if (screenName !== 'home') {
      this._closeModals(false);
      this._toggleSettingsPopover(false);
    }
    Object.entries(this.screens).forEach(([key, el]) => {
      el.classList.toggle('is-hidden', key !== screenName);
    });

    // Manage Screen Wake Lock & Landscape Orientation Lock for Gyroscope play
    if (screenName === 'hud' || screenName === 'lobby') {
      requestScreenWakeLock();
      if (screenName === 'hud' && this.deviceMode === 'mobile') {
        lockLandscapeOrientation();
      }
    } else if (screenName === 'home') {
      releaseScreenWakeLock();
    }

    if (screenName !== 'hud') {
      this._confirmLeaveUntil = 0;
      this.setPaused(false, false);
      this.speedLinesEl.classList.remove('is-active', 'is-star');
      this.threatRadarEl.classList.add('is-hidden');
      this.wrongWayBannerEl.classList.add('is-hidden');
      this.proxLeftEl.classList.add('is-hidden');
      this.proxRightEl.classList.add('is-hidden');
      if (this.actionPopupsEl) this.actionPopupsEl.innerHTML = '';
      if (this.killfeedEl) this.killfeedEl.innerHTML = '';
    }
    if (screenName !== 'finished') {
      this._togglePodium3DView(false);
    }
    this._syncRootDatasets();
  }

  showHome({
    defaultName,
    defaultRacerId,
    defaultTrackId,
    defaultSteerMode,
    prefillRoomCode,
    ghostChallengeInfo,
  } = {}) {
    this.setPaused(false, false);
    this._closeModals(false);
    this._toggleSettingsPopover(false);
    this._setHomeView('paddock', false);
    this._currentMode = null;

    if (typeof defaultName === 'string' && defaultName.trim()) {
      this.playerName = defaultName.trim().slice(0, 14);
      this.nameInputEl.value = this.playerName;
      if (this.topbarNameEl) {
        this.topbarNameEl.textContent = this.playerName;
      }
    }
    if (typeof defaultRacerId === 'string' && RACERS.some((r) => r.id === defaultRacerId)) {
      this._selectRacer(defaultRacerId, false);
    }
    if (
      typeof defaultTrackId === 'string' &&
      !isArenaTrack(defaultTrackId) &&
      TRACKS.some((t) => t.id === getBaseTrackId(defaultTrackId))
    ) {
      this._selectTrack(getBaseTrackId(defaultTrackId), false);
    }
    if (typeof defaultSteerMode === 'string') {
      this._setSteerMode(defaultSteerMode, false);
    }

    this._renderCareerBar();
    this._renderFormatControls();
    this._renderHomeContextCards();

    this._ghostChallengeInfo = ghostChallengeInfo || null;
    if (ghostChallengeInfo && ghostChallengeInfo.name) {
      const gTrack = getTrackById(ghostChallengeInfo.trackId);
      if (ghostChallengeInfo.trackId) {
        this._selectTrack(ghostChallengeInfo.trackId, false);
      }
      const timeTxt = ghostChallengeInfo.timeMs
        ? ` (${formatRaceTime(ghostChallengeInfo.timeMs)})`
        : '';
      this.ghostDescEl.textContent = `Bats ${ghostChallengeInfo.name}${timeTxt} sur ${gTrack.icon} ${gTrack.name} !`;
      this.ghostBannerEl.classList.remove('is-hidden');
    } else {
      this.ghostBannerEl.classList.add('is-hidden');
    }

    const code = String(prefillRoomCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);

    if (code) {
      this.roomCodeInputEl.value = code;
      this.inviteCodeEl.textContent = code;
      this.inviteCalloutEl.classList.remove('is-hidden');
      this.joinGroupEl.classList.add('is-highlighted');
    } else {
      this.inviteCalloutEl.classList.add('is-hidden');
      this.joinGroupEl.classList.remove('is-highlighted');
    }

    this._lastPhase = null;
    this._lastLobbySig = '';
    this._lastPodiumSig = '';
    this._switchScreen('home');
    this._syncRootDatasets();
  }

  /**
   * Live 60fps UI & HUD update driven by RaceState.
   */
  update(raceState) {
    if (!raceState || !raceState.phase) return;

    this._currentMode = raceState.mode || null;
    const phase = raceState.phase;

    if (phase === 'lobby') {
      this._switchScreen('lobby');
      this._updateLobby(raceState);
      this._lastPhase = phase;
      return;
    }

    if (phase === 'countdown' || phase === 'racing') {
      this._switchScreen('hud');
      this._updateHUD(raceState);
      this._lastPhase = phase;
      return;
    }

    if (phase === 'finished') {
      this._switchScreen('finished');
      this._updatePodium(raceState);
      this._lastPhase = phase;
    }
  }

  _updateLobby(state) {
    const code = state.roomCode || '----';
    this._activeRoomCode = code;
    if (this.lobbyCodeEl.textContent !== code) {
      this.lobbyCodeEl.textContent = code;
    }

    this._renderLobbyQR(code);

    const karts = Array.isArray(state.karts) ? state.karts : [];
    const isPublic = Boolean(state.isPublic);
    const isHost = Boolean(
      !isPublic && state.hostId && state.localId && state.hostId === state.localId
    );
    this._isLobbyHost = isHost;

    const roomFormat = state.gameFormat || 'race';
    const roomCc = state.cc || '100cc';
    const roomMirror = Boolean(state.mirror);
    const roomTrackId = state.trackId || (roomFormat === 'balloon' ? 'arena' : 'coco');
    const isBalloon = roomFormat === 'balloon' || isArenaTrack(roomTrackId);

    this._renderTrackSelection(roomTrackId);
    this.lobbyTrackStripEl.classList.toggle('is-readonly', !isHost);
    this.lobbyTrackStripEl.classList.toggle('is-hidden', isBalloon);
    this.lobbyTrackHintEl.textContent = isBalloon
      ? 'ARÈNE : 🎈 STADE BALLON'
      : isHost
        ? `CHOISIS LE CIRCUIT${roomMirror ? ' (MIROIR ⇄)' : ''}`
        : `CIRCUIT : ${getTrackById(roomTrackId).name.toUpperCase()}`;

    const myKartId = this.profile?.selectedKart || 'classic';
    const myBoostId = this.profile?.selectedBoost || 'flame';
    const optSig = `${isHost}|${roomFormat}|${roomCc}|${roomMirror}|${myKartId}|${myBoostId}|${
      this.profile?.xp || 0
    }`;
    if (optSig !== this._lastLobbyOptionsSig) {
      this._lastLobbyOptionsSig = optSig;
      this._renderLobbyOptionsBar(isHost, roomFormat, roomCc, roomMirror);
      this._renderLobbyLoadoutBar(myKartId, myBoostId);
    }

    if (isPublic) {
      const pubRem =
        typeof state.publicCountdown === 'number'
          ? Math.ceil(state.publicCountdown)
          : typeof state.autoStartTimer === 'number'
            ? Math.ceil(state.autoStartTimer)
            : null;
      this.lobbyModeLabelEl.textContent = '⚡ PARTIE PUBLIQUE EN LIGNE';
      this.guestWaitTextEl.textContent =
        pubRem !== null && pubRem > 0
          ? `Départ automatique dans ${pubRem}s…`
          : 'Recherche de pilotes — départ imminent…';
    } else {
      this.lobbyModeLabelEl.textContent = 'SALON MULTIJOUEUR';
      this.guestWaitTextEl.textContent = "En attente de l'hôte…";
    }

    const bots = karts.filter((k) => k.isBot);
    const humans = karts.length - bots.length;
    const maxPlayers = RACE_CONFIG.MAX_PLAYERS || 6;
    const maxBots = Math.max(0, maxPlayers - humans);
    const minBots = humans <= 1 ? Math.min(1, maxBots) : 0;

    this._currentBotCount = bots.length;
    this._currentMinBots = minBots;
    this._currentMaxBots = maxBots;

    this.hostControlsEl.classList.toggle('is-hidden', !isHost);
    this.guestWaitEl.classList.toggle('is-hidden', isHost);

    if (isHost) {
      this.botCountEl.textContent = String(bots.length);
      this.botsDecBtn.disabled = bots.length <= minBots;
      this.botsIncBtn.disabled = bots.length >= maxBots;
    }

    const sig = `${code}|${roomTrackId}|${roomFormat}|${roomCc}|${roomMirror}|${isPublic}|${
      state.hostId
    }|${state.localId}|${state.championId || ''}|${karts
      .map(
        (k) =>
          `${k.id}:${k.name}:${k.racerId}:${k.kartId || 'classic'}:${k.boostColorId || 'flame'}:${
            k.isBot ? 1 : 0
          }:${k.hasCrown ? 1 : 0}`
      )
      .join(',')}`;

    if (sig === this._lastLobbySig) return;
    this._lastLobbySig = sig;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < maxPlayers; i++) {
      const kart = karts[i];
      const slot = document.createElement('div');

      if (kart) {
        const racer = getRacerById(kart.racerId);
        const kartMeta = getKartMeta(kart.kartId);
        const isMe = kart.id === state.localId;
        const isSlotHost = !isPublic && kart.id === state.hostId;
        const hasCrown = Boolean(
          kart.hasCrown || (state.championId && kart.id === state.championId)
        );

        slot.className = `pk-roster-slot is-filled${isMe ? ' is-local' : ''}`;
        slot.style.setProperty('--slot-color', racer.color);

        const dot = document.createElement('span');
        dot.className = 'pk-roster-swatch';
        dot.style.background = racer.color;

        const info = document.createElement('div');
        info.className = 'pk-roster-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'pk-roster-name';
        nameEl.textContent = `${hasCrown ? '👑 ' : ''}${kart.name || racer.name}`;

        const subEl = document.createElement('span');
        subEl.className = 'pk-roster-sub';
        subEl.textContent = `${racer.name} • ${kartMeta.icon} ${kartMeta.name}`;

        info.appendChild(nameEl);
        info.appendChild(subEl);

        const badges = document.createElement('div');
        badges.className = 'pk-roster-badges';
        if (isSlotHost) {
          const b = document.createElement('span');
          b.className = 'pk-tag pk-tag--gold';
          b.textContent = 'HÔTE';
          badges.appendChild(b);
        }
        if (isMe) {
          const b = document.createElement('span');
          b.className = 'pk-tag pk-tag--cyan';
          b.textContent = 'TOI';
          badges.appendChild(b);
        } else if (kart.isBot) {
          const b = document.createElement('span');
          b.className = 'pk-tag pk-tag--bot';
          b.textContent = '🤖 IA';
          badges.appendChild(b);
        }

        slot.appendChild(dot);
        slot.appendChild(info);
        slot.appendChild(badges);
      } else {
        slot.className = 'pk-roster-slot is-empty';
        slot.textContent = 'Slot libre…';
      }

      frag.appendChild(slot);
    }

    this.lobbyRosterEl.replaceChildren(frag);
  }

  _renderLobbyOptionsBar(isHost, roomFormat, roomCc, roomMirror) {
    if (!this.lobbyOptionsBarEl) return;
    const onlineFormats = GAME_FORMATS.filter((f) => ['race', 'knockout', 'balloon'].includes(f.id));
    if (!isHost) {
      const fmtMeta = onlineFormats.find((f) => f.id === roomFormat) || onlineFormats[0];
      this.lobbyOptionsBarEl.innerHTML = `
        <span class="pk-mini-pill pk-is-active">${fmtMeta.icon} ${fmtMeta.name}</span>
        <span class="pk-mini-pill">${roomCc}</span>
        ${roomMirror ? '<span class="pk-mini-pill pk-is-active">⇄ Miroir</span>' : ''}
      `;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const fmt of onlineFormats) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-mini-pill${roomFormat === fmt.id ? ' pk-is-active' : ''}`;
      btn.textContent = `${fmt.icon} ${fmt.name}`;
      btn.addEventListener('click', () => {
        this.callbacks.onLobbyOptionsChange?.({
          gameFormat: fmt.id,
          trackId:
            fmt.id === 'balloon'
              ? 'arena'
              : getBaseTrackId(this.selectedTrackId || 'coco'),
        });
      });
      frag.appendChild(btn);
    }

    for (const cc of Object.values(CC_CLASSES)) {
      const unlocked = isCcUnlocked(this.profile, cc.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-mini-pill${roomCc === cc.id ? ' pk-is-active' : ''}${
        !unlocked ? ' is-locked' : ''
      }`;
      btn.textContent = unlocked ? cc.label : `${cc.label} 🔒`;
      btn.addEventListener('click', () => {
        if (!unlocked) {
          this.showToast(`🔒 ${cc.label} débloqué au niveau ${cc.unlockLevel} !`, 'warning');
          return;
        }
        this.callbacks.onLobbyOptionsChange?.({ cc: cc.id });
      });
      frag.appendChild(btn);
    }

    const mirrorOk = isMirrorUnlocked(this.profile);
    const mBtn = document.createElement('button');
    mBtn.type = 'button';
    mBtn.className = `pk-mini-pill${roomMirror ? ' pk-is-active' : ''}${
      !mirrorOk ? ' is-locked' : ''
    }`;
    mBtn.textContent = mirrorOk ? '⇄ Miroir' : '⇄ 🔒';
    mBtn.addEventListener('click', () => {
      if (!mirrorOk) {
        this.showToast(`🔒 Mode Miroir débloqué au niveau ${MIRROR_UNLOCK_LEVEL} !`, 'warning');
        return;
      }
      this.callbacks.onLobbyOptionsChange?.({ mirror: !roomMirror });
    });
    frag.appendChild(mBtn);

    this.lobbyOptionsBarEl.replaceChildren(frag);
  }

  _renderLobbyLoadoutBar(kartId, boostId) {
    if (!this.lobbyLoadoutBarEl) return;
    const unlockedKarts = this.profile?.unlockedKarts || ['classic'];
    const unlockedBoosts = this.profile?.unlockedBoosts || ['flame'];
    const kMeta = getKartMeta(kartId);
    const bMeta = getBoostMeta(boostId);

    this.lobbyLoadoutBarEl.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.className = 'pk-field-label';
    lbl.textContent = 'TON ÉQUIPEMENT';

    const kartBtn = document.createElement('button');
    kartBtn.type = 'button';
    kartBtn.className = 'pk-mini-pill pk-is-active';
    kartBtn.title = 'Changer de kart';
    kartBtn.textContent = `${kMeta.icon} ${kMeta.name} ↻`;
    kartBtn.addEventListener('click', () => {
      const idx = unlockedKarts.indexOf(kartId);
      const nextKart = unlockedKarts[(idx + 1) % unlockedKarts.length] || 'classic';
      this.callbacks.onLoadoutChange?.({ kartId: nextKart, boostColorId: boostId });
    });

    const boostBtn = document.createElement('button');
    boostBtn.type = 'button';
    boostBtn.className = 'pk-mini-pill';
    boostBtn.title = 'Changer de boost';
    boostBtn.textContent = `${bMeta.icon} ${bMeta.name} ↻`;
    boostBtn.addEventListener('click', () => {
      const idx = unlockedBoosts.indexOf(boostId);
      const nextBoost = unlockedBoosts[(idx + 1) % unlockedBoosts.length] || 'flame';
      this.callbacks.onLoadoutChange?.({ kartId, boostColorId: nextBoost });
    });

    this.lobbyLoadoutBarEl.appendChild(lbl);
    this.lobbyLoadoutBarEl.appendChild(kartBtn);
    this.lobbyLoadoutBarEl.appendChild(boostBtn);
  }

  _updateHUD(state) {
    const now = performance.now();
    const karts = Array.isArray(state.karts) ? state.karts : [];
    const localKart = karts.find((k) => k.id === state.localId) || karts[0] || null;
    const totalLaps = RACE_CONFIG.TOTAL_LAPS || 3;

    // Show Pause button in solo mode on desktop, and always on mobile (acts as Race Options drawer online)
    const isSolo = state.mode === 'solo';
    const pauseBtnModeKey = `${isSolo ? 'solo' : 'online'}:${this.deviceMode}`;
    if (pauseBtnModeKey !== this._lastSoloMode) {
      this._lastSoloMode = pauseBtnModeKey;
      const showBtn = isSolo || this.deviceMode === 'mobile';
      this.pauseSoloBtnEl.classList.toggle('is-hidden', !showBtn);
      this.pauseSoloBtnEl.textContent = isSolo ? '⏸️' : '⚙️';
      this.pauseSoloBtnEl.title = isSolo ? 'Pause (Échap / P)' : 'Options de course';
    }

    if (state.phase === 'countdown' && this._lastPhase !== 'countdown') {
      this._lastLocalLap = 1;
      this._finalLapBannerUntil = 0;
      this._goBannerUntil = 0;
      this._lastLapMarkMs = 0;
      this._raceBestLapMs = Infinity;
      this._splitDeltaUntil = 0;
      this._lastSplitKey = '';
      this._lastClockStep = -1;
      this._lastStandingsSig = '';
      this._seenRaceEventIds.clear();
      this.hudSplitDeltaEl?.classList.add('is-hidden');
      if (this.hudClockEl) this.hudClockEl.textContent = '00:00.00';
      if (this.actionPopupsEl) this.actionPopupsEl.innerHTML = '';
      if (this.killfeedEl) this.killfeedEl.innerHTML = '';
    }

    if (state.phase === 'racing' && this._lastPhase === 'countdown') {
      this._goBannerUntil = now + 900;
      this._lastLapMarkMs = 0;
    }

    // 1. Rank Badge
    const rank = localKart?.rank || 1;
    if (rank !== this._lastRank) {
      const ord = formatOrdinalFr(rank);
      this.hudRankNumEl.textContent = ord.num;
      this.hudRankSupEl.textContent = ord.sup;
      this.hudRankEl.className = `pk-rank-badge rank-${Math.min(6, Math.max(1, rank))} is-pop`;
      void this.hudRankEl.offsetWidth;
      this._lastRank = rank;
    }

    // 2. Lap Counter, Live Race Clock, Lap Split Delta & Final Lap Banner
    const gameFormat = state.gameFormat || 'race';
    const isBalloon = gameFormat === 'balloon' || isArenaTrack(state.trackId);
    const rawLap = Math.max(1, localKart?.lap || 1);
    const displayLap = Math.min(totalLaps, rawLap);
    const lapText = isBalloon ? 'ARÈNE 🎈' : `TOUR ${displayLap}/${totalLaps}`;
    if (lapText !== this._lastLapText) {
      this.hudLapEl.textContent = lapText;
      this._lastLapText = lapText;
    }

    const raceMs = Math.max(0, Number(state.raceTimeMs) || 0);
    const clockStep = state.phase === 'racing' ? Math.floor(raceMs / 25) : -2;
    if (this.hudClockEl && clockStep !== this._lastClockStep) {
      this._lastClockStep = clockStep;
      const formattedClock = state.phase === 'racing' && raceMs > 0 ? formatRaceTime(raceMs) : '00:00.00';
      if (formattedClock !== this._lastClockText) {
        this.hudClockEl.textContent = formattedClock;
        this._lastClockText = formattedClock;
      }
    }

    if (!isBalloon && state.phase === 'racing' && rawLap > this._lastLocalLap && raceMs > 1000) {
      const completedLapMs = raceMs - this._lastLapMarkMs;
      this._lastLapMarkMs = raceMs;
      const lapKey = `${getBaseTrackId(state.trackId)}_${state.cc || '100cc'}`;
      const savedBest = Number(this._bestLapsMap[lapKey]) || Infinity;
      const refBest = Math.min(savedBest, this._raceBestLapMs);

      if (Number.isFinite(refBest) && refBest > 0 && completedLapMs > 1000) {
        const deltaMs = completedLapMs - refBest;
        const deltaStr = formatSplitDelta(deltaMs);
        const isAhead = deltaMs <= 0;
        const splitKey = `${deltaStr}|${isAhead ? 'a' : 'b'}`;
        if (this.hudSplitDeltaEl && splitKey !== this._lastSplitKey) {
          this.hudSplitDeltaEl.textContent = deltaStr;
          this.hudSplitDeltaEl.className = `pk-split-delta ${isAhead ? 'is-ahead' : 'is-behind'}`;
          this._lastSplitKey = splitKey;
        }
        this._splitDeltaUntil = now + 4500;
      }

      if (completedLapMs > 1000 && completedLapMs < this._raceBestLapMs) {
        this._raceBestLapMs = completedLapMs;
      }
      if (completedLapMs > 1000 && completedLapMs < savedBest) {
        this._bestLapsMap[lapKey] = Math.round(completedLapMs);
        writeBestLapsMap(this._bestLapsMap);
      }
    }

    if (this.hudSplitDeltaEl && this._splitDeltaUntil > 0 && now > this._splitDeltaUntil) {
      this._splitDeltaUntil = 0;
      this.hudSplitDeltaEl.classList.add('is-hidden');
    }

    if (
      !isBalloon &&
      state.phase === 'racing' &&
      displayLap === totalLaps &&
      this._lastLocalLap < totalLaps
    ) {
      this._finalLapBannerUntil = now + 2400;
    }
    this._lastLocalLap = displayLap;

    // 3. Curved Arcade SVG Speedometer + 3-Tier Drift Charge + Coin Speed Bonus + Slipstream
    const kmh = Math.round(Math.abs(localKart?.speed || 0) * 3.1);
    if (kmh !== this._lastTachoKmh) {
      this._lastTachoKmh = kmh;
      this.hudSpeedEl.textContent = String(kmh);
      if (this.tachoArcEl) {
        const ratio = Math.max(0, Math.min(1, kmh / TACHO_MAX_KMH));
        const offset = Math.round((1 - ratio) * TACHO_ARC_LEN);
        if (offset !== this._lastTachoDashOffset) {
          this._lastTachoDashOffset = offset;
          this.tachoArcEl.style.strokeDashoffset = String(offset);
        }
      }
    }

    const coinsCount = Math.max(0, Math.round(localKart?.coins || 0));
    if (coinsCount !== this._lastHudCoins && this.hudCoinsEl) {
      this._lastHudCoins = coinsCount;
      this.hudCoinsEl.textContent = `🪙 ${coinsCount}/10`;
    }

    const coinBonusTenths = Math.min(10, coinsCount) * 8; // +0.8% per coin -> +8.0% max
    if (coinBonusTenths !== this._lastTachoCoinBonus && this.tachoCoinBonusEl) {
      this._lastTachoCoinBonus = coinBonusTenths;
      const pctStr =
        coinBonusTenths === 0
          ? '+0%'
          : coinBonusTenths % 10 === 0
          ? `+${coinBonusTenths / 10}%`
          : `+${(coinBonusTenths / 10).toFixed(1)}%`;
      this.tachoCoinBonusEl.textContent = `${pctStr} VIT.`;
      this.tachoCoinBonusEl.classList.toggle('is-maxed', coinsCount >= 10);
    }

    const driftCharge = localKart?.drifting
      ? Math.max(0, Math.min(3, Math.floor(localKart.driftCharge || 0)))
      : 0;
    const isDriftingNow = Boolean(localKart?.drifting);
    if (driftCharge !== this._lastTachoCharge || isDriftingNow !== this._lastTachoDrifting) {
      this._lastTachoCharge = driftCharge;
      this._lastTachoDrifting = isDriftingNow;
      if (this.tachoDriftEl) {
        this.tachoDriftEl.dataset.tier = String(driftCharge);
        this.tachoDriftEl.classList.toggle('is-drifting', isDriftingNow);
      }
      if (this.tachoDriftLblEl) {
        this.tachoDriftLblEl.textContent =
          driftCharge === 3
            ? 'ULTRA ⚡'
            : driftCharge === 2
            ? 'SUPER 🔥'
            : driftCharge === 1
            ? 'MINI 💨'
            : isDriftingNow
            ? 'DÉRAPE…'
            : 'DRIFT';
      }
    }

    const tachoBoostClass =
      (localKart?.starTimer || 0) > 0
        ? 'is-star'
        : (localKart?.boostTimer || 0) > 0
        ? 'is-boosting'
        : kmh >= 150
        ? 'is-high'
        : '';
    if (tachoBoostClass !== this._lastTachoBoostClass && this.tachoWidgetEl) {
      this.tachoWidgetEl.classList.remove('is-boosting', 'is-star', 'is-high');
      if (tachoBoostClass) {
        this.tachoWidgetEl.classList.add(tachoBoostClass);
      }
      this._lastTachoBoostClass = tachoBoostClass;
    }

    const isDrafting = Boolean(localKart?.drafting && state.phase === 'racing');
    if (isDrafting !== this._lastDrafting) {
      this.hudDraftEl.classList.toggle('is-hidden', !isDrafting);
      this._lastDrafting = isDrafting;
    }

    // 3b. Live 6-Driver Standings Tower (Desktop >= 960px only)
    this._updateStandingsTower(karts, state.localId, isBalloon);

    if (this.hudModeBannerEl) {
      let modeText = '';
      let modeClass = '';
      if (gameFormat === 'knockout') {
        if (localKart?.eliminated) {
          modeText = '💀 ÉLIMINÉ — FIN DE PARTIE';
          modeClass = 'is-danger';
        } else {
          const koSec = Math.max(0, Math.ceil(state.knockoutTimer || 0));
          modeText = `💀 ÉLIM. ${koSec}s • ${state.aliveCount ?? karts.length} EN LICE`;
          modeClass = koSec <= 4 ? 'is-danger' : 'is-warn';
        }
      } else if (isBalloon) {
        const bCount = Math.max(0, localKart?.balloons ?? 0);
        const hearts = bCount > 0 ? '🎈'.repeat(bCount) : '💀';
        const remSec = Math.max(0, Math.ceil(state.battleTimeRemaining ?? 0));
        const remMin = Math.floor(remSec / 60);
        const remS = String(remSec % 60).padStart(2, '0');
        modeText = `${hearts} • ${localKart?.battleScore || 0} PTS • ⏱️ ${remMin}:${remS}`;
        modeClass = bCount <= 1 ? 'is-danger' : 'is-battle';
      } else if (gameFormat === 'timetrial') {
        const mush = localKart?.tripleMushrooms ?? 0;
        modeText = `⏱️ ${formatRaceTime(state.raceTimeMs || 0)} • 🍄×${mush}`;
        modeClass = 'is-tt';
      } else if (gameFormat === 'grandprix' && this._lastGpState) {
        modeText = `🏆 COUPE • COURSE ${this._lastGpState.raceIndex + 1}/${this._lastGpState.totalRaces}`;
        modeClass = 'is-gp';
      }

      const modeKey = `${modeText}|${modeClass}`;
      if (modeKey !== this._lastModeBannerKey) {
        this._lastModeBannerKey = modeKey;
        if (!modeText) {
          this.hudModeBannerEl.className = 'pk-hud-mode-banner is-hidden';
        } else {
          this.hudModeBannerEl.textContent = modeText;
          this.hudModeBannerEl.className = `pk-hud-mode-banner ${modeClass}`;
        }
      }
    }

    // 4. Item Roulette Box (shows shield status & Time Trial triple mushrooms too!)
    const rouletteTimer = localKart?.itemRouletteTimer || 0;
    const currentItem = localKart?.item && localKart.item !== 'none' ? localKart.item : null;
    const shieldItem = localKart?.shieldItem && localKart.shieldItem !== 'none' ? localKart.shieldItem : null;
    const tripleMushrooms = Math.max(0, Number(localKart?.tripleMushrooms || 0));

    if (rouletteTimer > 0) {
      const idx = Math.floor(now / 75) % ROULETTE_CYCLE.length;
      const key = `spin:${idx}`;
      if (key !== this._lastHudItemKey) {
        this.hudItemIconEl.textContent = ROULETTE_CYCLE[idx];
        this.hudItemNameEl.textContent = 'TIRAGE…';
        this.hudItemBoxEl.className = 'pk-item-roulette-box is-spinning';
        this._lastHudItemKey = key;
      }
    } else if (currentItem && ITEM_DISPLAY[currentItem]) {
      const key = `locked:${currentItem}:${shieldItem ? 1 : 0}`;
      if (key !== this._lastHudItemKey) {
        const info = ITEM_DISPLAY[currentItem];
        this.hudItemIconEl.textContent = info.icon;
        this.hudItemNameEl.textContent = shieldItem ? '🛡️ BOUCLIER' : info.name;
        this.hudItemBoxEl.className = `pk-item-roulette-box is-locked${
          shieldItem ? ' is-shielding' : ''
        }`;
        this._lastHudItemKey = key;
      }
    } else if (tripleMushrooms > 0) {
      const key = `tt-mush:${tripleMushrooms}`;
      if (key !== this._lastHudItemKey) {
        this.hudItemIconEl.textContent = '🍄';
        this.hudItemNameEl.textContent = `TURBO ×${tripleMushrooms}`;
        this.hudItemBoxEl.className = 'pk-item-roulette-box is-locked is-tt-mush';
        this._lastHudItemKey = key;
      }
    } else if (this._lastHudItemKey !== 'empty') {
      this.hudItemIconEl.textContent = '?';
      this.hudItemNameEl.textContent = 'OBJET';
      this.hudItemBoxEl.className = 'pk-item-roulette-box is-empty';
      this._lastHudItemKey = 'empty';
    }

    // 5. Center Countdown + Rocket Start Rev Gauge
    if (state.phase === 'countdown') {
      const countNum = Math.max(1, Math.ceil(state.countdown || 1));
      const key = `c:${countNum}`;
      if (key !== this._lastCountdownKey) {
        this.countdownTextEl.textContent = String(countNum);
        this.countdownTextEl.className = `pk-countdown-text count-${Math.min(3, countNum)}`;
        this.countdownTextEl.style.animation = 'none';
        void this.countdownTextEl.offsetWidth;
        this.countdownTextEl.style.animation = '';
        this._lastCountdownKey = key;
      }

      this.rocketGaugeEl.classList.remove('is-hidden');
      const rCharge = Number(localKart?.rocketCharge || 0);
      if (rCharge < 0) {
        this.rocketGaugeEl.classList.add('is-overheat');
        this.rocketGaugeEl.classList.remove('is-sweet');
        this.rocketHintEl.textContent = '💥 SURCHAUFFE ! TROP TÔT !';
        this.rocketFillEl.style.width = '100%';
      } else {
        this.rocketGaugeEl.classList.remove('is-overheat');
        const pct = Math.max(0, Math.min(100, Math.round(rCharge * 100)));
        const inSweet = pct >= 55;
        this.rocketGaugeEl.classList.toggle('is-sweet', inSweet);
        if (this.deviceMode === 'desktop') {
          this.rocketHintEl.textContent =
            pct > 5
              ? '🔥 GARDE APPUYÉ JUSQU’AU GO !'
              : this.autoAccel
              ? '🚀 MAINTIENS ESPACE AU "2" !'
              : '🚀 MAINTIENS ▲ OU ESPACE AU "2" !';
        } else {
          this.rocketHintEl.textContent =
            pct > 5 ? '🔥 GARDE DÉRAPE APPUYÉ !' : '🚀 MAINTIENS DÉRAPE AU "2" !';
        }
        this.rocketFillEl.style.width = `${pct}%`;
      }
    } else {
      this.rocketGaugeEl.classList.add('is-hidden');

      if (now < this._goBannerUntil) {
        const hasRocketBoost = (localKart?.boostTimer || 0) > 1.0;
        const goKey = hasRocketBoost ? 'go-rocket' : 'go';
        if (this._lastCountdownKey !== goKey) {
          this.countdownTextEl.textContent = hasRocketBoost
            ? 'DÉPART TURBO ! 🚀'
            : 'PARTEZ ! 🏁';
          this.countdownTextEl.className = 'pk-countdown-text count-go';
          this.countdownTextEl.style.animation = 'none';
          void this.countdownTextEl.offsetWidth;
          this.countdownTextEl.style.animation = '';
          this._lastCountdownKey = goKey;
        }
      } else if (this._lastCountdownKey !== 'hidden') {
        this.countdownTextEl.className = 'pk-countdown-text is-hidden';
        this._lastCountdownKey = 'hidden';
      }
    }

    // 6. Wrong-Way Alert Banner + Ditch Rescue Banner + Final Lap
    const isWrongWay = Boolean(!isBalloon && state.phase === 'racing' && localKart?.wrongWay);
    if (isWrongWay !== this._lastWrongWay) {
      this.wrongWayBannerEl.classList.toggle('is-hidden', !isWrongWay);
      this._lastWrongWay = isWrongWay;
    }

    const fallT = Number(localKart?.fallTimer || 0);
    const rescueKey =
      state.phase === 'racing' && fallT > 0
        ? fallT > 0.75
          ? getBaseTrackId(state.trackId) === 'rainbow'
            ? 'fall-void'
            : 'fall-ditch'
          : 'rescue-hook'
        : 'none';
    if (rescueKey !== this._lastRescueKey) {
      this._lastRescueKey = rescueKey;
      if (rescueKey === 'none') {
        this.rescueBannerEl.classList.add('is-hidden');
      } else {
        this.rescueBannerEl.textContent =
          rescueKey === 'fall-void'
            ? '🌌 CHUTE DANS LE VIDE !'
            : rescueKey === 'fall-ditch'
            ? '🌊 OUPS ! DANS LE FOSSÉ !'
            : '🎣 REPÊCHAGE EXPRESS !';
        this.rescueBannerEl.classList.remove('is-hidden', 'is-hoist');
        if (rescueKey === 'rescue-hook') {
          this.rescueBannerEl.classList.add('is-hoist');
        }
      }
    }

    const showFinalBanner =
      now < this._finalLapBannerUntil && !isWrongWay && rescueKey === 'none';
    this.finalLapBannerEl.classList.toggle('is-hidden', !showFinalBanner);

    // 7. Nearby Rival Proximity Arrows (< 14u behind/beside localKart)
    this._updateProximityArrows(karts, localKart, state.phase === 'racing');

    // 8. Rear Threat Radar Warning Pill
    const threat = localKart?.incomingThreat || null;
    if (threat !== this._lastThreatKey) {
      if (threat === 'blue_shell') {
        this.threatIconEl.textContent = '🐚';
        this.threatLabelEl.textContent = '⚠️ CARAPACE BLEUE EN APPROCHE !';
        this.threatRadarEl.className = 'pk-threat-radar is-blue';
      } else if (threat) {
        this.threatIconEl.textContent = '🎯';
        this.threatLabelEl.textContent = '⚠️ CARAPACE EN APPROCHE !';
        this.threatRadarEl.className = 'pk-threat-radar is-red';
      } else {
        this.threatRadarEl.className = 'pk-threat-radar is-hidden';
      }
      this._lastThreatKey = threat;
    }

    // 9. Edge Speed-Lines Overlay
    const isStar = (localKart?.starTimer || 0) > 0;
    const isBoosting = isStar || (localKart?.boostTimer || 0) > 0;
    this.speedLinesEl.classList.toggle('is-active', isBoosting && !this.paused);
    this.speedLinesEl.classList.toggle('is-star', isStar);

    // 10. Live Multi-Track 2D Minimap
    this._drawMinimap(karts, state.localId, state.trackId || 'coco', state.projectiles);
  }

  _updateStandingsTower(karts, localId, isBalloon) {
    if (!this.standingsTowerEl) return;
    const isCompactMobile = this.deviceMode === 'mobile' || window.innerWidth < 960;

    if (isCompactMobile) {
      if (!Array.isArray(karts) || karts.length <= 1) {
        if (this._lastStandingsSig !== 'hidden') {
          this._lastStandingsSig = 'hidden';
          this.standingsTowerEl.innerHTML = '';
          this.standingsTowerEl.classList.remove('is-mobile-compact');
        }
        return;
      }
      const now = performance.now();
      if (now - this._lastStandingsUpdateAt < 180 && this._lastStandingsSig !== '') {
        return;
      }
      this._lastStandingsUpdateAt = now;
    }

    const sortedAll = [...karts].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    let visibleDrivers = sortedAll.slice(0, 6);

    if (isCompactMobile) {
      const myIdx = Math.max(
        0,
        sortedAll.findIndex((k) => k.id === localId)
      );
      const startIdx = Math.max(0, Math.min(Math.max(0, sortedAll.length - 3), myIdx - 1));
      visibleDrivers = sortedAll.slice(startIdx, startIdx + 3);
    }

    const sig = `${isCompactMobile ? 'm' : 'd'}|${visibleDrivers
      .map((k) => {
        const badge = k.eliminated
          ? '💀'
          : k.finished
          ? '🏁'
          : (k.starTimer || 0) > 0
          ? '⭐'
          : k.shieldItem
          ? '🛡️'
          : (k.spinoutTimer || 0) > 0
          ? '💥'
          : k.hasCrown
          ? '👑'
          : '';
        return `${k.id}:${k.rank}:${k.name}:${badge}:${isBalloon ? k.balloons : k.lap}`;
      })
      .join('|')}`;

    if (sig === this._lastStandingsSig) return;
    this._lastStandingsSig = sig;
    this.standingsTowerEl.classList.toggle('is-mobile-compact', isCompactMobile);

    const frag = document.createDocumentFragment();
    visibleDrivers.forEach((k, idx) => {
      const rank = k.rank || idx + 1;
      const racer = getRacerById(k.racerId);
      const isMe = k.id === localId;

      const row = document.createElement('div');
      row.className = `pk-tower-row${isMe ? ' is-local' : ''}${k.eliminated ? ' is-out' : ''}`;

      const rankEl = document.createElement('span');
      rankEl.className = `pk-tower-rank rank-${Math.min(6, rank)}`;
      rankEl.textContent = String(rank);

      const dotEl = document.createElement('span');
      dotEl.className = 'pk-tower-dot';
      dotEl.style.background = racer.color;

      const nameEl = document.createElement('span');
      nameEl.className = 'pk-tower-name';
      nameEl.textContent = k.name || racer.name;

      const badge = k.eliminated
        ? '💀'
        : k.finished
        ? '🏁'
        : (k.starTimer || 0) > 0
        ? '⭐'
        : k.shieldItem
        ? '🛡️'
        : (k.spinoutTimer || 0) > 0
        ? '💥'
        : k.hasCrown
        ? '👑'
        : '';

      row.appendChild(rankEl);
      row.appendChild(dotEl);
      row.appendChild(nameEl);

      if (badge) {
        const statusEl = document.createElement('span');
        statusEl.className = 'pk-tower-status';
        statusEl.textContent = badge;
        row.appendChild(statusEl);
      } else if (isBalloon) {
        const bEl = document.createElement('span');
        bEl.className = 'pk-tower-status';
        bEl.textContent = `🎈${k.balloons ?? 0}`;
        row.appendChild(bEl);
      }

      frag.appendChild(row);
    });

    this.standingsTowerEl.replaceChildren(frag);
  }

  _updateProximityArrows(karts, localKart, isRacing) {
    if (!isRacing || !localKart || !Number.isFinite(localKart.x) || !Number.isFinite(localKart.z)) {
      if (this._lastProxLeftKey !== 'none') {
        this.proxLeftEl.classList.add('is-hidden');
        this._lastProxLeftKey = 'none';
      }
      if (this._lastProxRightKey !== 'none') {
        this.proxRightEl.classList.add('is-hidden');
        this._lastProxRightKey = 'none';
      }
      return;
    }

    const yaw = localKart.yaw || 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz; // Three.js right unit vector
    const rz = fx;

    let leftRival = null;
    let leftDist = Infinity;
    let rightRival = null;
    let rightDist = Infinity;

    for (const k of karts) {
      if (k.id === localKart.id || k.finished) continue;
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;

      const dx = k.x - localKart.x;
      const dz = k.z - localKart.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 14 || dist < 0.05) continue;

      const fwdDot = dx * fx + dz * fz;
      // Show rivals behind or alongside (fwdDot <= 2.8)
      if (fwdDot > 2.8) continue;

      const rightDot = dx * rx + dz * rz;
      if (rightDot < 0) {
        if (dist < leftDist) {
          leftDist = dist;
          leftRival = k;
        }
      } else if (dist < rightDist) {
        rightDist = dist;
        rightRival = k;
      }
    }

    if (leftRival) {
      const racer = getRacerById(leftRival.racerId);
      const tier = leftDist < 5 ? 3 : leftDist < 9.5 ? 2 : 1;
      const key = `${racer.id}:${tier}`;
      if (key !== this._lastProxLeftKey) {
        this.proxLeftEl.classList.remove('is-hidden');
        this.proxLeftEl.classList.toggle('is-close', tier === 3);
        this.proxLeftEl.style.setProperty('--prox-color', racer.color);
        this.proxLeftDotEl.style.background = racer.color;
        this.proxLeftChevEl.textContent = '❮'.repeat(tier);
        this._lastProxLeftKey = key;
      }
    } else if (this._lastProxLeftKey !== 'none') {
      this.proxLeftEl.classList.add('is-hidden');
      this._lastProxLeftKey = 'none';
    }

    if (rightRival) {
      const racer = getRacerById(rightRival.racerId);
      const tier = rightDist < 5 ? 3 : rightDist < 9.5 ? 2 : 1;
      const key = `${racer.id}:${tier}`;
      if (key !== this._lastProxRightKey) {
        this.proxRightEl.classList.remove('is-hidden');
        this.proxRightEl.classList.toggle('is-close', tier === 3);
        this.proxRightEl.style.setProperty('--prox-color', racer.color);
        this.proxRightDotEl.style.background = racer.color;
        this.proxRightChevEl.textContent = '❯'.repeat(tier);
        this._lastProxRightKey = key;
      }
    } else if (this._lastProxRightKey !== 'none') {
      this.proxRightEl.classList.add('is-hidden');
      this._lastProxRightKey = 'none';
    }
  }

  _getMinimapTrackData(trackId) {
    const key = trackId || 'coco';
    if (this._minimapCache.has(key)) {
      return this._minimapCache.get(key);
    }
    try {
      const samples = getTrackSamples(120, key);
      if (!Array.isArray(samples) || samples.length < 4) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const s of samples) {
        if (s.x < minX) minX = s.x;
        if (s.x > maxX) maxX = s.x;
        if (s.z < minZ) minZ = s.z;
        if (s.z > maxZ) maxZ = s.z;
      }
      const entry = {
        samples,
        bounds: {
          midX: (minX + maxX) * 0.5,
          midZ: (minZ + maxZ) * 0.5,
          spanX: Math.max(1, maxX - minX),
          spanZ: Math.max(1, maxZ - minZ),
        },
      };
      this._minimapCache.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  _getMinimapStaticLayer(trackId = 'coco', cssSize = 112, dpr = 1) {
    const targetPx = Math.round(cssSize * dpr);
    const cacheKey = `${trackId}|${targetPx}|${dpr}`;
    if (this._minimapStaticLayerCache.has(cacheKey)) {
      return this._minimapStaticLayerCache.get(cacheKey);
    }

    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetPx;
    offCanvas.height = targetPx;
    const octx = offCanvas.getContext('2d');
    if (!octx) return null;

    octx.save();
    octx.scale(dpr, dpr);

    const cx = cssSize * 0.5;
    const cy = cssSize * 0.5;

    if (isArenaTrack(trackId)) {
      const arenaR = ARENA_DATA?.radius || 48;
      const scale = (cssSize - 18) / (arenaR * 2);
      const toMapX = (wx) => cx - wx * scale;
      const toMapY = (wz) => cy - wz * scale;

      octx.beginPath();
      octx.arc(cx, cy, arenaR * scale, 0, Math.PI * 2);
      octx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      octx.fill();
      octx.lineWidth = 3;
      octx.strokeStyle = '#ef4444';
      octx.stroke();

      if (Array.isArray(ARENA_DATA?.pillars)) {
        for (const p of ARENA_DATA.pillars) {
          octx.beginPath();
          octx.arc(toMapX(p.x), toMapY(p.z), Math.max(2, (p.radius || 3.4) * scale), 0, Math.PI * 2);
          octx.fillStyle = 'rgba(148, 163, 184, 0.85)';
          octx.fill();
        }
      }

      if (Array.isArray(ARENA_DATA?.bumperSpots)) {
        for (const b of ARENA_DATA.bumperSpots) {
          octx.beginPath();
          octx.arc(toMapX(b.x), toMapY(b.z), Math.max(2.5, (b.radius || 3.5) * scale), 0, Math.PI * 2);
          octx.fillStyle = '#facc15';
          octx.fill();
        }
      }

      octx.restore();
      const layer = { canvas: offCanvas, isArena: true, scale, cx, cy, midX: 0, midZ: 0 };
      this._minimapStaticLayerCache.set(cacheKey, layer);
      return layer;
    }

    const trackData = this._getMinimapTrackData(trackId);
    if (!trackData) {
      octx.restore();
      return null;
    }

    const pad = 12;
    const { midX, midZ, spanX, spanZ } = trackData.bounds;
    const scale = (cssSize - pad * 2) / Math.max(spanX, spanZ);
    const toMapX = (wx) => cx - (wx - midX) * scale;
    const toMapY = (wz) => cy - (wz - midZ) * scale;
    const samples = trackData.samples;

    octx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const mx = toMapX(samples[i].x);
      const my = toMapY(samples[i].z);
      if (i === 0) octx.moveTo(mx, my);
      else octx.lineTo(mx, my);
    }
    octx.closePath();

    octx.lineJoin = 'round';
    octx.lineCap = 'round';
    octx.lineWidth = 8.5;
    octx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    octx.stroke();

    const baseTrack = getBaseTrackId(trackId);
    octx.lineWidth = 4.6;
    if (baseTrack === 'neon') {
      octx.strokeStyle = '#4cc9f0';
    } else if (baseTrack === 'rainbow') {
      octx.strokeStyle = '#fde047';
    } else if (baseTrack === 'polar') {
      octx.strokeStyle = '#67e8f9';
    } else if (baseTrack === 'pinball') {
      octx.strokeStyle = '#f472b6';
    } else if (baseTrack === 'volcano') {
      octx.strokeStyle = '#fb923c';
    } else {
      octx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    }
    octx.stroke();

    const s0 = samples[0];
    const sx = toMapX(s0.x);
    const sy = toMapY(s0.z);
    const nx = -s0.nx;
    const ny = -s0.nz;
    octx.beginPath();
    octx.moveTo(sx - nx * 5.5, sy - ny * 5.5);
    octx.lineTo(sx + nx * 5.5, sy + ny * 5.5);
    octx.lineWidth = 3;
    octx.strokeStyle = '#ff3b6b';
    octx.stroke();

    octx.restore();
    const layer = { canvas: offCanvas, isArena: false, scale, cx, cy, midX, midZ };
    this._minimapStaticLayerCache.set(cacheKey, layer);
    return layer;
  }

  _drawMinimap(karts, localId, trackId = 'coco', projectiles = []) {
    if (!this.minimapCtx) return;

    const now = performance.now();
    if (this.deviceMode === 'mobile' && now - this._lastMinimapDrawAt < 38) {
      return;
    }
    this._lastMinimapDrawAt = now;

    const canvas = this.minimapCanvas;
    const ctx = this.minimapCtx;
    const cssSize = canvas.clientWidth || 112;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = Math.round(cssSize * dpr);

    if (canvas.width !== targetPx || canvas.height !== targetPx || this._minimapDpr !== dpr) {
      canvas.width = targetPx;
      canvas.height = targetPx;
      this._minimapDpr = dpr;
    }

    const staticLayer = this._getMinimapStaticLayer(trackId, cssSize, dpr);
    if (!staticLayer) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.drawImage(staticLayer.canvas, 0, 0, cssSize, cssSize);

    const { scale, cx, cy, midX, midZ, isArena } = staticLayer;
    const toMapX = (wx) => cx - (wx - midX) * scale;
    const toMapY = (wz) => cy - (wz - midZ) * scale;

    if (!isArena && Array.isArray(projectiles)) {
      for (const p of projectiles) {
        if (p.type === 'blue_shell' && Number.isFinite(p.x) && Number.isFinite(p.z)) {
          ctx.beginPath();
          ctx.arc(toMapX(p.x), toMapY(p.z), 3.6, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      }
    }

    const rivalDotR = this.deviceMode === 'mobile' ? 4.3 : 3.8;
    const localDotR = this.deviceMode === 'mobile' ? 6.2 : 5.6;

    let localKart = null;
    for (const k of karts) {
      if (k.id === localId) {
        localKart = k;
        continue;
      }
      if (k.eliminated || !Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const racer = getRacerById(k.racerId);
      ctx.beginPath();
      ctx.arc(toMapX(k.x), toMapY(k.z), rivalDotR, 0, Math.PI * 2);
      ctx.fillStyle = racer.color;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }

    if (
      localKart &&
      (!isArena || !localKart.eliminated) &&
      Number.isFinite(localKart.x) &&
      Number.isFinite(localKart.z)
    ) {
      const racer = getRacerById(localKart.racerId);
      const kx = toMapX(localKart.x);
      const ky = toMapY(localKart.z);
      const yaw = localKart.yaw || 0;
      const dirX = -Math.sin(yaw);
      const dirY = -Math.cos(yaw);

      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(kx + dirX * 8.5, ky + dirY * 8.5);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(kx, ky, localDotR, 0, Math.PI * 2);
      ctx.fillStyle = racer.color;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    ctx.restore();
  }

  _updatePodium(state) {
    this._lastFinishedState = state;

    const karts = Array.isArray(state.karts) ? [...state.karts] : [];
    karts.sort((a, b) => (a.rank || 99) - (b.rank || 99));

    const gameFormat = state.gameFormat || 'race';
    const isBalloon = gameFormat === 'balloon' || isArenaTrack(state.trackId);

    const sig = `${state.trackId || 'coco'}|${gameFormat}|${state.cc || '100cc'}|${karts
      .map(
        (k) =>
          `${k.id}:${k.rank}:${Math.round(k.finishTimeMs || 0)}:${k.battleScore || 0}:${
            k.balloons ?? 0
          }:${k.eliminated ? 1 : 0}:${k.stats?.hitsDealt || 0}:${
            k.stats?.driftsBoosted || 0
          }:${k.stats?.stunts || 0}:${k.stats?.timesHit || 0}`
      )
      .join('|')}`;
    if (sig === this._lastPodiumSig) return;
    this._lastPodiumSig = sig;
    this._togglePodium3DView(false);

    const track = getTrackById(state.trackId || this.selectedTrackId);
    const local = karts.find((k) => k.id === state.localId);
    const myRank = local?.rank || 1;
    const ord = formatOrdinalFr(myRank);

    if (isBalloon) {
      this.podiumTrophyEl.textContent = myRank === 1 ? '🎈' : myRank <= 3 ? '🥈' : '💥';
      this.podiumTitleEl.textContent =
        myRank === 1
          ? "ROI DE L'ARÈNE !"
          : `BATAILLE TERMINÉE (${ord.num}${ord.sup})`;
      this.podiumSubtitleEl.textContent = `${track.icon} ${track.name} • ${
        local?.battleScore || 0
      } pts`;
    } else if (gameFormat === 'timetrial') {
      const medal = evaluateTimeTrialMedal(
        state.trackId || this.selectedTrackId,
        local?.finishTimeMs || state.raceTimeMs || 0
      );
      this.podiumTrophyEl.textContent = formatMedalIcon(medal) || '⏱️';
      this.podiumTitleEl.textContent = 'CHRONO ENREGISTRÉ !';
      this.podiumSubtitleEl.textContent = `${track.icon} ${track.name} • ${formatRaceTime(
        local?.finishTimeMs || state.raceTimeMs
      )}`;
    } else if (myRank === 1) {
      this.podiumTrophyEl.textContent = '🏆';
      this.podiumTitleEl.textContent = 'VICTOIRE ROYALE !';
      this.podiumSubtitleEl.textContent = `Champion sur ${track.icon} ${track.name} !`;
    } else if (myRank <= 3) {
      this.podiumTrophyEl.textContent = myRank === 2 ? '🥈' : '🥉';
      this.podiumTitleEl.textContent = `PODIUM — ${ord.num}${ord.sup} PLACE !`;
      this.podiumSubtitleEl.textContent = `${track.icon} ${track.name} • La 1re place est proche !`;
    } else {
      this.podiumTrophyEl.textContent = local?.eliminated ? '💀' : '🏁';
      this.podiumTitleEl.textContent = `COURSE TERMINÉE (${ord.num}${ord.sup})`;
      this.podiumSubtitleEl.textContent = `${track.icon} ${track.name} • Prêt pour la revanche ?`;
    }

    const awardsMap = computeRaceAwards(karts);
    this._lastAwardsMap = awardsMap;

    const awardsFrag = document.createDocumentFragment();
    for (const [kartId, award] of awardsMap.entries()) {
      const k = karts.find((x) => x.id === kartId);
      if (!k) continue;
      const chip = document.createElement('div');
      chip.className = `pk-award-chip${kartId === state.localId ? ' is-local' : ''}`;
      chip.textContent = `${award.icon} ${award.title} : ${k.name}`;
      awardsFrag.appendChild(chip);
    }
    this.awardsStripEl.replaceChildren(awardsFrag);
    this.awardsStripEl.classList.toggle('is-hidden', awardsMap.size === 0);

    const medals = ['🥇', '🥈', '🥉'];
    const frag = document.createDocumentFragment();

    karts.forEach((kart, idx) => {
      const rank = kart.rank || idx + 1;
      const racer = getRacerById(kart.racerId);
      const kartMeta = getKartMeta(kart.kartId);
      const isMe = kart.id === state.localId;
      const award = awardsMap.get(kart.id);

      const row = document.createElement('div');
      row.className = `pk-podium-row rank-${Math.min(6, rank)}${isMe ? ' is-local' : ''}`;

      const medalEl = document.createElement('span');
      medalEl.className = 'pk-podium-rank';
      medalEl.textContent = rank <= 3 ? medals[rank - 1] : `${rank}e`;

      const dotEl = document.createElement('span');
      dotEl.className = 'pk-podium-dot';
      dotEl.style.background = racer.color;

      const nameWrap = document.createElement('div');
      nameWrap.className = 'pk-podium-driver';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'pk-podium-name';
      nameSpan.textContent = `${kart.hasCrown ? '👑 ' : ''}${kart.name || racer.name} ${kartMeta.icon}`;
      nameWrap.appendChild(nameSpan);

      if (isMe) {
        const meBadge = document.createElement('span');
        meBadge.className = 'pk-tag pk-tag--cyan';
        meBadge.textContent = 'TOI';
        nameWrap.appendChild(meBadge);
      } else if (kart.isBot) {
        const botBadge = document.createElement('span');
        botBadge.className = 'pk-tag pk-tag--bot';
        botBadge.textContent = 'IA';
        nameWrap.appendChild(botBadge);
      }

      if (award) {
        const awBadge = document.createElement('span');
        awBadge.className = 'pk-tag pk-tag--award';
        awBadge.title = `${award.title} (${award.detail})`;
        awBadge.textContent = `${award.icon} ${award.title}`;
        nameWrap.appendChild(awBadge);
      }

      const timeEl = document.createElement('span');
      timeEl.className = 'pk-podium-time';
      if (isBalloon) {
        const hearts = '🎈'.repeat(Math.max(0, kart.balloons ?? 0)) || '💀';
        timeEl.textContent = `${kart.battleScore || 0} pts (${hearts})`;
      } else if (gameFormat === 'knockout' && kart.eliminated && !kart.finished) {
        timeEl.textContent = '💀 Éliminé';
      } else {
        timeEl.textContent = kart.finishTimeMs
          ? formatRaceTime(kart.finishTimeMs)
          : formatRaceTime(state.raceTimeMs);
      }

      row.appendChild(medalEl);
      row.appendChild(dotEl);
      row.appendChild(nameWrap);
      row.appendChild(timeEl);
      frag.appendChild(row);
    });

    this.podiumTableEl.replaceChildren(frag);
    this._renderPodiumProgression();
  }

  showToast(message, kind = 'info') {
    if (!message || !this.toastStackEl) return;

    const normalizedKind = kind === 'warn' ? 'warning' : kind;
    const toast = document.createElement('div');
    toast.className = `pk-toast pk-toast--${normalizedKind}`;
    toast.textContent = String(message);

    this.toastStackEl.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => {
        toast.remove();
      }, 280);
    }, 2900);
  }
}

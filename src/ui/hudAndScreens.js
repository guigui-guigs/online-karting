/**
 * PocketKart 3D V3 — Screens, Track Picker, QR Lobby, Live Race HUD,
 * Wrong-Way & Rival Proximity Radar, Solo Pause Modal, Viral Podium & Story Card.
 */

import QRCode from 'qrcode';
import { RACERS, ITEMS, RACE_CONFIG, TRACKS, EMOTES } from '../shared/constants.js';
import { getTrackSamples } from '../shared/trackData.js';

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

function getRacerById(racerId) {
  return RACERS.find((r) => r.id === racerId) || RACERS[0];
}

function getTrackById(trackId) {
  return TRACKS.find((t) => t.id === trackId) || TRACKS[0];
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

export class UIManager {
  constructor(rootEl, callbacks = {}) {
    this.rootEl = rootEl;
    this.callbacks = callbacks;

    this.activeScreen = 'home'; // 'home' | 'lobby' | 'hud' | 'finished'
    this.paused = false;
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
    this.autoAccel = readPref(STORAGE_KEYS.AUTO_ACCEL, 'true') !== 'false';

    this._ghostChallengeInfo = null;
    this._lastFinishedState = null;
    this._lastAwardsMap = new Map();
    this._emoteCooldownUntil = 0;

    // Cached diff keys for 60fps zero-thrash updates
    this._lastPhase = null;
    this._lastLobbySig = '';
    this._lastQrUrl = '';
    this._lastPodiumSig = '';
    this._lastRank = null;
    this._lastLapText = '';
    this._lastLocalLap = 1;
    this._lastCountdownKey = '';
    this._lastHudItemKey = '';
    this._lastThreatKey = '';
    this._lastWrongWay = false;
    this._lastDrafting = false;
    this._lastSoloMode = null;
    this._lastProxLeftKey = '';
    this._lastProxRightKey = '';
    this._goBannerUntil = 0;
    this._finalLapBannerUntil = 0;

    // Multi-track minimap cache
    this._minimapCache = new Map();
    this._minimapDpr = 0;

    this._buildDOM();
    this._bindEvents();
    this._syncUtilityButtons();
    this._renderRacerSelection();
    this._renderTrackSelection();
  }

  _supportsGyroUI() {
    if (typeof window === 'undefined') return false;
    return Boolean(
      'DeviceOrientationEvent' in window ||
        'ontouchstart' in window ||
        (navigator && navigator.maxTouchPoints > 0)
    );
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'pk-ui-layer';

    const canFullscreen = Boolean(
      document.fullscreenEnabled || document.webkitFullscreenEnabled
    );
    const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const hasGyro = this._supportsGyroUI();

    this.el.innerHTML = `
      <!-- Edge Speed-Lines Overlay (Boost / Star) -->
      <div class="pk-speed-lines" data-role="speed-lines"></div>

      <!-- Subtle Non-Blocking Portrait Suggestion Banner -->
      <div class="pk-portrait-banner" data-role="portrait-banner">
        <span class="pk-portrait-banner-text">📱 Paysage conseillé pour une vue grand angle !</span>
        <div class="pk-portrait-banner-actions">
          ${
            canFullscreen
              ? `<button type="button" class="pk-mini-pill" data-action="fullscreen" title="Plein écran">⛶</button>`
              : ''
          }
          <button type="button" class="pk-mini-pill" data-action="dismiss-portrait" aria-label="Fermer">✕</button>
        </div>
      </div>

      <!-- ==================== HOME SCREEN ==================== -->
      <section class="pk-screen pk-screen-home" data-screen="home">
        <div class="pk-home-topbar">
          <div class="pk-brand-chip">🏎️ PocketKart 3D • V3</div>
          <div class="pk-top-utils">
            <button type="button" class="pk-util-pill" data-action="cycle-steer-mode" title="Mode de direction tactile">
              🕹️ Joystick
            </button>
            <button type="button" class="pk-util-pill" data-action="toggle-auto-accel" title="Accélération automatique">
              ⚡ Auto-Gaz: ON
            </button>
            ${
              hasGyro
                ? `<button type="button" class="pk-icon-btn" data-action="toggle-gyro" aria-label="Volant Gyroscope" title="Volant Gyroscope">📱</button>`
                : ''
            }
            <button type="button" class="pk-icon-btn" data-action="toggle-music" aria-label="Musique" title="Musique">
              🎵
            </button>
            <button type="button" class="pk-icon-btn" data-action="toggle-mute" aria-label="Effets sonores" title="Son">
              🔊
            </button>
            ${
              canFullscreen
                ? `<button type="button" class="pk-icon-btn" data-action="fullscreen" aria-label="Plein écran" title="Plein écran">⛶</button>`
                : ''
            }
          </div>
        </div>

        <div class="pk-home-layout">
          <header class="pk-logo-hero">
            <div class="pk-logo-kicker">🏁 TURBO ARCADE MULTIJOUEUR</div>
            <h1 class="pk-logo-title">
              <span class="pk-logo-word-pocket">POCKET</span>
              <span class="pk-logo-word-kart">KART</span>
              <span class="pk-logo-badge-3d">3D</span>
            </h1>
          </header>

          <div class="pk-glass-card pk-home-card">
            <!-- Ghost Challenge Callout Banner (#challenge=...) -->
            <div class="pk-ghost-banner is-hidden" data-role="ghost-banner">
              <div class="pk-ghost-banner-info">
                <span class="pk-ghost-badge">👻 DÉFI FANTÔME</span>
                <span class="pk-ghost-desc" data-role="ghost-desc">Bats le chrono de Pilote !</span>
              </div>
              <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="accept-ghost">
                👻 Relever le Défi !
              </button>
            </div>

            <!-- Pseudo Input -->
            <div class="pk-profile-row">
              <label class="pk-field-label" for="pk-player-name">PSEUDO</label>
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

            <!-- Racer Selector Strip -->
            <div class="pk-racer-section">
              <div class="pk-section-header">
                <span class="pk-field-label">PILOTE</span>
                <span class="pk-racer-selected-name" data-role="selected-racer-name">Turbo Red</span>
              </div>
              <div class="pk-racer-strip" data-role="racer-strip" role="listbox" aria-label="Pilotes"></div>
            </div>

            <!-- Track Picker Cards (3 Circuits) -->
            <div class="pk-track-section">
              <div class="pk-section-header">
                <span class="pk-field-label">CIRCUIT</span>
                <span class="pk-track-selected-sub" data-role="selected-track-sub">Lagon Tropical</span>
              </div>
              <div class="pk-track-strip" data-role="home-track-strip" role="listbox" aria-label="Circuits"></div>
            </div>

            <!-- Invite Banner when ?room=XXXX is in URL -->
            <div class="pk-invite-callout is-hidden" data-role="invite-callout">
              <span>🎟️ Invitation détectée pour le salon <strong data-role="invite-code">KART</strong> !</span>
            </div>

            <!-- Primary Row: Solo + Public Matchmaking -->
            <div class="pk-primary-cta-row">
              <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="quick-play">
                <span class="pk-btn-emoji">🏁</span>
                <span>Course Rapide <small>(Solo)</small></span>
              </button>

              <button type="button" class="pk-arcade-btn pk-btn-electric pk-btn-lg" data-action="public-match">
                <span class="pk-btn-emoji">⚡</span>
                <span>Partie Publique</span>
              </button>
            </div>

            <!-- Private Room Row: Create + Code Join -->
            <div class="pk-multi-row">
              <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="create-room">
                <span>🌐 Créer un Salon</span>
              </button>

              <div class="pk-join-group" data-role="join-group">
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
                <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-sm" data-action="join-room">
                  <span>🔗 Rejoindre</span>
                </button>
              </div>
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

              <!-- Live Lobby Track Selector -->
              <div class="pk-lobby-track-wrap">
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
          <!-- Top-Left: Rank + Lap + Speed + Slipstream + Emotes -->
          <div class="pk-hud-left-col">
            <div class="pk-hud-left">
              <div class="pk-rank-badge rank-1" data-role="hud-rank">
                <span class="pk-rank-num" data-role="hud-rank-num">1</span><sup class="pk-rank-sup" data-role="hud-rank-sup">er</sup>
              </div>
              <div class="pk-hud-stats-stack">
                <div class="pk-lap-pill" data-role="hud-lap">TOUR 1/3</div>
                <div class="pk-speed-row">
                  <div class="pk-speed-pill" data-role="hud-speed">0 km/h</div>
                  <div class="pk-draft-pill is-hidden" data-role="hud-draft">💨 ASPIRATION</div>
                </div>
              </div>
            </div>

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

          <!-- Top-Right: Solo Pause + Utility Toggles + Live Multi-Track Minimap -->
          <div class="pk-hud-right">
            <div class="pk-hud-quick-btns">
              <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-icon-btn--pause is-hidden" data-role="btn-pause-solo" data-action="pause-solo" aria-label="Pause" title="Pause (Échap / P)">⏸️</button>
              <button type="button" class="pk-icon-btn pk-icon-btn--sm" data-action="toggle-mute" aria-label="Son" title="Effets sonores">🔊</button>
              <button type="button" class="pk-icon-btn pk-icon-btn--sm" data-action="toggle-music" aria-label="Musique" title="Musique">🎵</button>
              ${
                hasGyro
                  ? `<button type="button" class="pk-icon-btn pk-icon-btn--sm" data-action="toggle-gyro" aria-label="Gyroscope" title="Volant Gyroscope">📱</button>`
                  : ''
              }
              <button type="button" class="pk-icon-btn pk-icon-btn--sm pk-icon-btn--danger" data-action="leave" aria-label="Quitter la course" title="Quitter">✕</button>
            </div>
            <div class="pk-minimap-wrap">
              <canvas class="pk-minimap-canvas" data-role="minimap-canvas" width="120" height="120"></canvas>
            </div>
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

        <!-- Solo Pause Modal Overlay -->
        <div class="pk-pause-backdrop is-hidden" data-role="pause-backdrop">
          <div class="pk-glass-card pk-pause-card">
            <h2 class="pk-pause-title">⏸️ PAUSE</h2>

            <div class="pk-pause-section">
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

            <div class="pk-pause-toggles">
              <button type="button" class="pk-util-pill" data-action="toggle-auto-accel">⚡ Auto-Gaz: ON</button>
              ${
                hasGyro
                  ? `<button type="button" class="pk-util-pill" data-action="toggle-gyro" data-role="pause-gyro-pill">📱 Gyro: OFF</button>`
                  : ''
              }
              <button type="button" class="pk-util-pill" data-action="toggle-music" data-role="pause-music-pill">🎵 Musique: ON</button>
              <button type="button" class="pk-util-pill" data-action="toggle-mute" data-role="pause-sfx-pill">🔊 Son: ON</button>
            </div>

            <div class="pk-pause-actions">
              <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="resume-solo">
                ▶️ Reprendre
              </button>
              <div class="pk-pause-sub-actions">
                <button type="button" class="pk-arcade-btn pk-btn-cyan pk-btn-sm" data-action="pause-respawn">
                  ↺ Replacer
                </button>
                <button type="button" class="pk-arcade-btn pk-btn-amber pk-btn-sm" data-action="pause-restart">
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
        <div class="pk-glass-card pk-podium-card">
          <div class="pk-podium-header">
            <div class="pk-podium-trophy" data-role="podium-trophy">🏆</div>
            <div class="pk-podium-heading-wrap">
              <h2 class="pk-podium-title" data-role="podium-title">VICTOIRE !</h2>
              <p class="pk-podium-subtitle" data-role="podium-subtitle">Classement officiel</p>
            </div>
          </div>

          <!-- Highlighted Award Strip -->
          <div class="pk-awards-strip" data-role="awards-strip"></div>

          <div class="pk-podium-table" data-role="podium-table"></div>

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
            <button type="button" class="pk-arcade-btn pk-btn-primary pk-btn-lg" data-action="rematch">
              🔄 Rejouer
            </button>
            <button type="button" class="pk-arcade-btn pk-btn-ghost pk-btn-lg" data-action="leave">
              🏠 Menu
            </button>
          </div>
        </div>
      </section>

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

    // Home refs
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

    // Lobby refs
    this.lobbyModeLabelEl = this.el.querySelector('[data-role="lobby-mode-label"]');
    this.lobbyCodeEl = this.el.querySelector('[data-role="lobby-code"]');
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
    this.hudSpeedEl = this.el.querySelector('[data-role="hud-speed"]');
    this.hudDraftEl = this.el.querySelector('[data-role="hud-draft"]');
    this.emoteBarEl = this.el.querySelector('[data-role="emote-bar"]');
    this.hudItemBoxEl = this.el.querySelector('[data-role="hud-item-box"]');
    this.hudItemIconEl = this.el.querySelector('[data-role="hud-item-icon"]');
    this.hudItemNameEl = this.el.querySelector('[data-role="hud-item-name"]');
    this.pauseSoloBtnEl = this.el.querySelector('[data-role="btn-pause-solo"]');
    this.minimapCanvas = this.el.querySelector('[data-role="minimap-canvas"]');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.countdownTextEl = this.el.querySelector('[data-role="countdown-text"]');
    this.rocketGaugeEl = this.el.querySelector('[data-role="rocket-gauge"]');
    this.rocketHintEl = this.el.querySelector('[data-role="rocket-hint"]');
    this.rocketFillEl = this.el.querySelector('[data-role="rocket-fill"]');
    this.wrongWayBannerEl = this.el.querySelector('[data-role="wrongway-banner"]');
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
    this.segJoystickEl = this.el.querySelector('[data-role="seg-joystick"]');
    this.segButtonsEl = this.el.querySelector('[data-role="seg-buttons"]');
    this.pauseGyroPillEl = this.el.querySelector('[data-role="pause-gyro-pill"]');
    this.pauseMusicPillEl = this.el.querySelector('[data-role="pause-music-pill"]');
    this.pauseSfxPillEl = this.el.querySelector('[data-role="pause-sfx-pill"]');

    // Podium refs
    this.podiumTrophyEl = this.el.querySelector('[data-role="podium-trophy"]');
    this.podiumTitleEl = this.el.querySelector('[data-role="podium-title"]');
    this.podiumSubtitleEl = this.el.querySelector('[data-role="podium-subtitle"]');
    this.awardsStripEl = this.el.querySelector('[data-role="awards-strip"]');
    this.podiumTableEl = this.el.querySelector('[data-role="podium-table"]');

    // Toast stack
    this.toastStackEl = this.el.querySelector('[data-role="toast-stack"]');

    this._buildRacerPills();
    this._buildTrackCards(this.homeTrackStripEl, true);
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
      const helmetDot = document.createElement('span');
      helmetDot.className = 'pk-racer-helmet';
      swatch.appendChild(helmetDot);

      const label = document.createElement('span');
      label.className = 'pk-racer-name';
      label.textContent = racer.name;

      btn.appendChild(swatch);
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        this._selectRacer(racer.id, true);
      });

      this.racerStripEl.appendChild(btn);
    });
  }

  _buildTrackCards(containerEl, isHome) {
    containerEl.innerHTML = '';
    TRACKS.forEach((track) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pk-track-card';
      card.dataset.trackId = track.id;
      card.style.setProperty('--track-accent', track.accent);

      const icon = document.createElement('span');
      icon.className = 'pk-track-icon';
      icon.textContent = track.icon;

      const body = document.createElement('span');
      body.className = 'pk-track-body';

      const title = document.createElement('span');
      title.className = 'pk-track-name';
      title.textContent = track.name;

      const diff = document.createElement('span');
      diff.className = 'pk-track-diff';
      diff.textContent = String(track.difficulty || '').trim();

      body.appendChild(title);
      body.appendChild(diff);
      card.appendChild(icon);
      card.appendChild(body);

      card.addEventListener('click', () => {
        if (!isHome && !this._isLobbyHost) return;
        this._selectTrack(track.id, true);
      });

      containerEl.appendChild(card);
    });
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
    this.nameInputEl.addEventListener('input', () => {
      const clean = this.nameInputEl.value.replace(/\s+/g, ' ').trimStart().slice(0, 14);
      if (this.nameInputEl.value !== clean) {
        this.nameInputEl.value = clean;
      }
      this.playerName = clean.trim() || 'Pilote';
      writePref(STORAGE_KEYS.NAME, this.playerName);
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

    // Escape / P toggles Solo Pause Modal
    this._onPauseKey = (e) => {
      if (e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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

    // Delegated action clicks
    this.el.addEventListener('click', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      switch (action) {
        case 'quick-play':
          this.setPaused(false, false);
          this.callbacks.onQuickPlay?.({
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
            botCount: 5,
          });
          break;

        case 'accept-ghost': {
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
          this.setPaused(false, false);
          const payload = {
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
          };
          if (this.callbacks.onJoinPublic) {
            this.callbacks.onJoinPublic(payload);
          } else {
            this.callbacks.onPublicMatch?.(payload);
          }
          break;
        }

        case 'create-room':
          this.setPaused(false, false);
          this.callbacks.onCreateRoom?.({
            playerName: this._getPlayerName(),
            racerId: this.selectedRacerId,
            trackId: this.selectedTrackId,
          });
          break;

        case 'join-room':
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
          if (this._currentMode === 'solo') {
            this.setPaused(true, true);
          }
          break;

        case 'resume-solo':
          this.setPaused(false, true);
          break;

        case 'pause-respawn':
          this.setPaused(false, true);
          this.callbacks.onRespawn?.();
          break;

        case 'pause-restart':
          this.setPaused(false, true);
          this.callbacks.onRematch?.();
          break;

        case 'pause-leave':
          this.setPaused(false, true);
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

        case 'leave':
          this.setPaused(false, false);
          this.callbacks.onLeave?.();
          break;

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
    this.selectedRacerId = racerId;
    writePref(STORAGE_KEYS.RACER, racerId);
    this._renderRacerSelection();
    if (notify) {
      this.callbacks.onSelectRacer?.(racerId);
    }
  }

  _selectTrack(trackId, notify = false) {
    if (!TRACKS.some((t) => t.id === trackId)) return;
    this.selectedTrackId = trackId;
    writePref(STORAGE_KEYS.TRACK, trackId);
    this._renderTrackSelection(trackId);
    if (notify) {
      this.callbacks.onSelectTrack?.(trackId);
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
   * Opens or closes the Solo Pause Modal cleanly (idempotent).
   */
  setPaused(paused, notify = false) {
    const next = Boolean(paused);
    if (this.paused === next) return this.paused;
    this.paused = next;
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

  setAutoAccel(enabled) {
    this.autoAccel = Boolean(enabled);
    this._syncUtilityButtons();
  }

  _renderRacerSelection() {
    const selected = getRacerById(this.selectedRacerId);
    if (this.selectedRacerNameEl && selected) {
      this.selectedRacerNameEl.textContent = selected.name;
      this.selectedRacerNameEl.style.color = selected.color;
    }

    const pills = this.racerStripEl.querySelectorAll('.pk-racer-pill');
    pills.forEach((pill) => {
      const active = pill.dataset.racerId === this.selectedRacerId;
      pill.classList.toggle('is-selected', active);
      pill.setAttribute('aria-selected', String(active));
    });
  }

  _renderTrackSelection(activeTrackId = this.selectedTrackId) {
    const track = getTrackById(activeTrackId);
    if (this.selectedTrackSubEl && track) {
      this.selectedTrackSubEl.textContent = `${track.icon} ${track.subtitle}`;
      this.selectedTrackSubEl.style.color = track.accent;
    }

    [this.homeTrackStripEl, this.lobbyTrackStripEl].forEach((strip) => {
      if (!strip) return;
      const cards = strip.querySelectorAll('.pk-track-card');
      cards.forEach((c) => {
        const isSel = c.dataset.trackId === activeTrackId;
        c.classList.toggle('is-selected', isSel);
        c.setAttribute('aria-selected', String(isSel));
      });
    });
  }

  _syncUtilityButtons() {
    // Steer mode cycle pill + pause modal segmented buttons
    const steerCycleBtn = this.el.querySelector('[data-action="cycle-steer-mode"]');
    if (steerCycleBtn) {
      steerCycleBtn.textContent =
        this.steerMode === 'buttons' ? '◀▶ Boutons' : '🕹️ Joystick';
    }
    this.segJoystickEl?.classList.toggle('is-selected', this.steerMode === 'joystick');
    this.segButtonsEl?.classList.toggle('is-selected', this.steerMode === 'buttons');

    // SFX Mute buttons
    const muteBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-mute"]');
    muteBtns.forEach((btn) => {
      btn.textContent = this.muted ? '🔇' : '🔊';
      btn.classList.toggle('is-off', this.muted);
    });
    if (this.pauseSfxPillEl) {
      this.pauseSfxPillEl.textContent = this.muted ? '🔇 Son: OFF' : '🔊 Son: ON';
      this.pauseSfxPillEl.classList.toggle('is-off', this.muted);
    }

    // Music buttons
    const musicBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-music"]');
    musicBtns.forEach((btn) => {
      btn.textContent = '🎵';
      btn.classList.toggle('is-off', !this.musicEnabled);
    });
    if (this.pauseMusicPillEl) {
      this.pauseMusicPillEl.textContent = this.musicEnabled ? '🎵 Musique: ON' : '🎵 Musique: OFF';
      this.pauseMusicPillEl.classList.toggle('is-off', !this.musicEnabled);
    }

    // Gyro buttons
    const gyroBtns = this.el.querySelectorAll('.pk-icon-btn[data-action="toggle-gyro"]');
    gyroBtns.forEach((btn) => {
      btn.textContent = '📱';
      btn.classList.toggle('is-active-toggle', this.gyroEnabled);
      btn.classList.toggle('is-off', !this.gyroEnabled);
    });
    if (this.pauseGyroPillEl) {
      this.pauseGyroPillEl.textContent = this.gyroEnabled ? '📱 Gyro: ON' : '📱 Gyro: OFF';
      this.pauseGyroPillEl.classList.toggle('is-off', !this.gyroEnabled);
    }

    // Auto-Accel pills
    const autoBtns = this.el.querySelectorAll('[data-action="toggle-auto-accel"]');
    autoBtns.forEach((btn) => {
      btn.textContent = this.autoAccel ? '⚡ Auto-Gaz: ON' : '🚀 Gaz Manuel';
      btn.classList.toggle('is-off', !this.autoAccel);
    });
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

    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
    if (track.id === 'neon') {
      bgGrad.addColorStop(0, '#090d24');
      bgGrad.addColorStop(0.5, '#2b0a4d');
      bgGrad.addColorStop(1, '#0c1b47');
    } else if (track.id === 'rainbow') {
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
    ctx.font = '800 34px Fredoka, Nunito, sans-serif';
    ctx.fillText('🏁 CLASSEMENT OFFICIEL • POCKET KART 3D', 540, 92);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 84px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${track.icon} ${track.name.toUpperCase()}`, 540, 185);

    roundRectPath(ctx, 76, 235, 928, 285, 42);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
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
    ctx.fillText(`${ord.num}${ord.sup}`, 126, 378);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 54px Fredoka, Nunito, sans-serif';
    ctx.fillText(local?.name || 'Pilote', 340, 336);

    ctx.fillStyle = heroRacer.color;
    ctx.font = '700 36px Nunito, sans-serif';
    ctx.fillText(
      `⏱️ Chrono : ${formatRaceTime(local?.finishTimeMs || state.raceTimeMs)}`,
      340,
      394
    );

    roundRectPath(ctx, 340, 422, 480, 64, 32);
    ctx.fillStyle = 'rgba(255, 190, 11, 0.22)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffbe0b';
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.font = '700 32px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${heroAward.icon} ${heroAward.title}`, 368, 465);

    const medals = ['🥇', '🥈', '🥉', '4e', '5e', '6e'];
    let y = 570;
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

      y += 106;
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

  _toggleFullscreen() {
    const docEl = document.documentElement;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFs) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      req?.call(docEl)?.catch?.(() => {});
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      exit?.call(document)?.catch?.(() => {});
    }
  }

  _switchScreen(screenName) {
    if (this.activeScreen === screenName) return;
    this.activeScreen = screenName;
    Object.entries(this.screens).forEach(([key, el]) => {
      el.classList.toggle('is-hidden', key !== screenName);
    });

    if (screenName !== 'hud') {
      this.setPaused(false, false);
      this.speedLinesEl.classList.remove('is-active', 'is-star');
      this.threatRadarEl.classList.add('is-hidden');
      this.wrongWayBannerEl.classList.add('is-hidden');
      this.proxLeftEl.classList.add('is-hidden');
      this.proxRightEl.classList.add('is-hidden');
    }
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
    this._currentMode = null;

    if (typeof defaultName === 'string' && defaultName.trim()) {
      this.playerName = defaultName.trim().slice(0, 14);
      this.nameInputEl.value = this.playerName;
    }
    if (typeof defaultRacerId === 'string' && RACERS.some((r) => r.id === defaultRacerId)) {
      this._selectRacer(defaultRacerId, false);
    }
    if (typeof defaultTrackId === 'string' && TRACKS.some((t) => t.id === defaultTrackId)) {
      this._selectTrack(defaultTrackId, false);
    }
    if (typeof defaultSteerMode === 'string') {
      this._setSteerMode(defaultSteerMode, false);
    }

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

    const roomTrackId = state.trackId || 'coco';
    this._renderTrackSelection(roomTrackId);
    this.lobbyTrackStripEl.classList.toggle('is-readonly', !isHost);
    this.lobbyTrackHintEl.textContent = isHost
      ? 'CHOISIS LE CIRCUIT DU SALON'
      : `CIRCUIT : ${getTrackById(roomTrackId).name.toUpperCase()}`;

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

    const sig = `${code}|${roomTrackId}|${isPublic}|${state.hostId}|${state.localId}|${
      state.championId || ''
    }|${karts
      .map((k) => `${k.id}:${k.name}:${k.racerId}:${k.isBot ? 1 : 0}:${k.hasCrown ? 1 : 0}`)
      .join(',')}`;

    if (sig === this._lastLobbySig) return;
    this._lastLobbySig = sig;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < maxPlayers; i++) {
      const kart = karts[i];
      const slot = document.createElement('div');

      if (kart) {
        const racer = getRacerById(kart.racerId);
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
        subEl.textContent = racer.name;

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

  _updateHUD(state) {
    const now = performance.now();
    const karts = Array.isArray(state.karts) ? state.karts : [];
    const localKart = karts.find((k) => k.id === state.localId) || karts[0] || null;
    const totalLaps = RACE_CONFIG.TOTAL_LAPS || 3;

    // Show Solo Pause button only in solo mode
    const isSolo = state.mode === 'solo';
    if (isSolo !== this._lastSoloMode) {
      this.pauseSoloBtnEl.classList.toggle('is-hidden', !isSolo);
      this._lastSoloMode = isSolo;
    }

    if (state.phase === 'countdown' && this._lastPhase !== 'countdown') {
      this._lastLocalLap = 1;
      this._finalLapBannerUntil = 0;
      this._goBannerUntil = 0;
    }

    if (state.phase === 'racing' && this._lastPhase === 'countdown') {
      this._goBannerUntil = now + 900;
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

    // 2. Lap Counter & Final Lap Banner
    const rawLap = Math.max(1, localKart?.lap || 1);
    const displayLap = Math.min(totalLaps, rawLap);
    const lapText = `TOUR ${displayLap}/${totalLaps}`;
    if (lapText !== this._lastLapText) {
      this.hudLapEl.textContent = lapText;
      this._lastLapText = lapText;
    }

    if (
      state.phase === 'racing' &&
      displayLap === totalLaps &&
      this._lastLocalLap < totalLaps
    ) {
      this._finalLapBannerUntil = now + 2400;
    }
    this._lastLocalLap = displayLap;

    // 3. Speedometer + Slipstream Draft Indicator
    const kmh = Math.round(Math.abs(localKart?.speed || 0) * 3.1);
    this.hudSpeedEl.textContent = `${kmh} km/h`;

    const isDrafting = Boolean(localKart?.drafting && state.phase === 'racing');
    if (isDrafting !== this._lastDrafting) {
      this.hudDraftEl.classList.toggle('is-hidden', !isDrafting);
      this._lastDrafting = isDrafting;
    }

    // 4. Item Roulette Box (shows shield status too!)
    const rouletteTimer = localKart?.itemRouletteTimer || 0;
    const currentItem = localKart?.item ?? null;
    const shieldItem = localKart?.shieldItem ?? null;

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
        this.rocketHintEl.textContent =
          pct > 5 ? '🔥 GARDE DÉRAPE APPUYÉ !' : '🚀 MAINTIENS DÉRAPE AU "2" !';
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

    // 6. Wrong-Way Alert Banner + Respawn CTA
    const isWrongWay = Boolean(state.phase === 'racing' && localKart?.wrongWay);
    if (isWrongWay !== this._lastWrongWay) {
      this.wrongWayBannerEl.classList.toggle('is-hidden', !isWrongWay);
      this._lastWrongWay = isWrongWay;
    }

    const showFinalBanner = now < this._finalLapBannerUntil && !isWrongWay;
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

  _drawMinimap(karts, localId, trackId = 'coco', projectiles = []) {
    if (!this.minimapCtx) return;
    const trackData = this._getMinimapTrackData(trackId);
    if (!trackData) return;

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

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssSize, cssSize);

    const pad = 12;
    const { midX, midZ, spanX, spanZ } = trackData.bounds;
    const scale = (cssSize - pad * 2) / Math.max(spanX, spanZ);
    const cx = cssSize * 0.5;
    const cy = cssSize * 0.5;

    const toMapX = (wx) => cx - (wx - midX) * scale;
    const toMapY = (wz) => cy - (wz - midZ) * scale;

    const samples = trackData.samples;

    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const mx = toMapX(samples[i].x);
      const my = toMapY(samples[i].z);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 8.5;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.stroke();

    ctx.lineWidth = 4.6;
    if (trackId === 'neon') {
      ctx.strokeStyle = '#4cc9f0';
    } else if (trackId === 'rainbow') {
      ctx.strokeStyle = '#fde047';
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    }
    ctx.stroke();

    const s0 = samples[0];
    const sx = toMapX(s0.x);
    const sy = toMapY(s0.z);
    const nx = -s0.nx;
    const ny = -s0.nz;
    ctx.beginPath();
    ctx.moveTo(sx - nx * 5.5, sy - ny * 5.5);
    ctx.lineTo(sx + nx * 5.5, sy + ny * 5.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff3b6b';
    ctx.stroke();

    if (Array.isArray(projectiles)) {
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

    let localKart = null;
    for (const k of karts) {
      if (k.id === localId) {
        localKart = k;
        continue;
      }
      if (!Number.isFinite(k.x) || !Number.isFinite(k.z)) continue;
      const racer = getRacerById(k.racerId);
      ctx.beginPath();
      ctx.arc(toMapX(k.x), toMapY(k.z), 3.8, 0, Math.PI * 2);
      ctx.fillStyle = racer.color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }

    if (localKart && Number.isFinite(localKart.x) && Number.isFinite(localKart.z)) {
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
      ctx.arc(kx, ky, 5.6, 0, Math.PI * 2);
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

    const sig = `${state.trackId || 'coco'}|${karts
      .map(
        (k) =>
          `${k.id}:${k.rank}:${Math.round(k.finishTimeMs || 0)}:${k.stats?.hitsDealt || 0}:${
            k.stats?.driftsBoosted || 0
          }:${k.stats?.stunts || 0}:${k.stats?.timesHit || 0}`
      )
      .join('|')}`;
    if (sig === this._lastPodiumSig) return;
    this._lastPodiumSig = sig;

    const track = getTrackById(state.trackId || this.selectedTrackId);
    const local = karts.find((k) => k.id === state.localId);
    const myRank = local?.rank || 1;
    const ord = formatOrdinalFr(myRank);

    if (myRank === 1) {
      this.podiumTrophyEl.textContent = '🏆';
      this.podiumTitleEl.textContent = 'VICTOIRE ROYALE !';
      this.podiumSubtitleEl.textContent = `Champion sur ${track.icon} ${track.name} !`;
    } else if (myRank <= 3) {
      this.podiumTrophyEl.textContent = myRank === 2 ? '🥈' : '🥉';
      this.podiumTitleEl.textContent = `PODIUM — ${ord.num}${ord.sup} PLACE !`;
      this.podiumSubtitleEl.textContent = `${track.icon} ${track.name} • La 1re place est proche !`;
    } else {
      this.podiumTrophyEl.textContent = '🏁';
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
      nameSpan.textContent = `${kart.hasCrown ? '👑 ' : ''}${kart.name || racer.name}`;
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
      timeEl.textContent = kart.finishTimeMs
        ? formatRaceTime(kart.finishTimeMs)
        : formatRaceTime(state.raceTimeMs);

      row.appendChild(medalEl);
      row.appendChild(dotEl);
      row.appendChild(nameWrap);
      row.appendChild(timeEl);
      frag.appendChild(row);
    });

    this.podiumTableEl.replaceChildren(frag);
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

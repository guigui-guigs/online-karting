/**
 * PocketKart 3D V3 — Ergonomic Multi-Touch Controller, Floating Joystick / D-Pad,
 * Manual Gas Pedal, Smart Item Gestures (Swipe Aim + Hold Shield), Gyroscope & Haptics.
 */

import { ITEMS } from '../shared/constants.js';

const ITEM_META = {
  [ITEMS.TURBO]: { icon: '🍄', label: 'TURBO' },
  [ITEMS.GREEN_SHELL]: { icon: '🐢', label: 'CARAPACE' },
  [ITEMS.RED_SHELL]: { icon: '🎯', label: 'ROUGE' },
  [ITEMS.BLUE_SHELL || 'blue_shell']: { icon: '🐚', label: 'BLEUE' },
  [ITEMS.BANANA]: { icon: '🍌', label: 'BANANE' },
  [ITEMS.STAR]: { icon: '⭐', label: 'ÉTOILE' },
  [ITEMS.LIGHTNING || 'lightning']: { icon: '⚡', label: 'ÉCLAIR' },
};

const SHIELDABLE_ITEMS = new Set([
  ITEMS.BANANA || 'banana',
  ITEMS.GREEN_SHELL || 'green_shell',
  ITEMS.RED_SHELL || 'red_shell',
  'banana',
  'green_shell',
  'red_shell',
]);

const ROULETTE_ICONS = ['🍄', '🐢', '🎯', '🐚', '🍌', '⭐', '⚡'];
const DRIFT_ARC_RADIUS = 46;
const DRIFT_ARC_CIRCUMFERENCE = Number((2 * Math.PI * DRIFT_ARC_RADIUS).toFixed(2));
const GAMEPAD_DEADZONE = 0.12;
const RACING_HINT_FADE_MS = 4500;

const GYRO_MAX_DEG_BY_SENS = {
  low: 32,
  normal: 24,
  high: 16,
};

function readTouchPref(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeTouchPref(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage restrictions
  }
}

export class TouchController {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.enabled = false;
    this.deviceMode = 'desktop';
    this.racePhase = 'home';
    this.autoAccel = true;
    this.steerMode = 'joystick'; // 'joystick' | 'buttons'

    // Floating joystick state
    this.touchSteer = 0;
    this.steerPointerId = null;
    this._steerAnchorX = 0;

    // Arcade Left/Right button state + smooth ramp
    this._btnDir = 0; // -1 | 0 | 1
    this._btnPointerId = null;
    this._buttonSteer = 0;
    this._lastPollMs = performance.now();

    // Action hold pointers
    this.driftPointers = new Set();
    this.brakePointers = new Set();
    this.gasPointers = new Set();

    // Smart Item Gesture state (Tap / Swipe Aim / Hold Shield / Lock Auto-Trail)
    this._currentHeldItem = null;
    this._itemPointer = null; // { id, startY, startTime, aim, wasShieldLocked }
    this._shieldLocked = false;
    this._shieldLockedOnCurrentPress = false;
    this._keyItemDownAt = null;
    this._padItemDownAt = null;
    this._padItemWasDown = false;
    this._padStartWasDown = false;
    this.useItemLatched = false;
    this.latchedItemAim = 0;

    // Gamepad state
    this._gamepadConnected = false;
    this._gamepadName = '';
    this._padPauseWatchTimer = null;

    // Gyroscope & Haptics state
    this.gyroEnabled = false;
    this.gyroSteer = 0;
    this._gyroTargetSteer = 0;
    this._gyroRawTiltDeg = 0;
    this._gyroNeutralOffset = 0;
    this._gyroNeedsCalibration = true;
    this._lastScreenAngle = null;
    this._hasReceivedGyroData = false;
    this._gyroNullSensorDetected = false;
    this._gyroListenerBound = false;

    const savedSens = readTouchPref('pocketkart_gyro_sens', 'normal');
    this.gyroSensitivity = GYRO_MAX_DEG_BY_SENS[savedSens] ? savedSens : 'normal';
    this.gyroInvert = readTouchPref('pocketkart_gyro_invert', 'false') === 'true';
    this.hapticsEnabled = readTouchPref('pocketkart_haptics', 'true') !== 'false';

    // Keyboard state
    this.keys = new Set();

    // Cached visual state to avoid redundant DOM writes at 60fps
    this._lastDriftCharge = 0;
    this._lastDriftChargeRendered = -1;
    this._lastDriftArcOffset = '';
    this._lastItemKey = '__init__';
    this._lastBoosting = false;
    this._lastShieldActive = false;
    this._lastAimPreview = 0;
    this._lastGamepadBadgeKey = '';
    this._lastHintFaded = false;
    this._racingStartedAt = null;

    this._buildDOM();
    this._bindEvents();
    this._syncGamepadStatus(this._findConnectedGamepad());
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'pk-touch-layer is-hidden';
    this.el.setAttribute('aria-hidden', 'true');

    this.el.innerHTML = `
      <!-- Left Thumb Zone: Floating Auto-Centered Joystick OR Arcade ◀/▶ Buttons + Gyro Tilt HUD -->
      <div class="pk-steer-zone" data-role="steer-zone">
        <!-- Gyro Tilt Horizon Gauge + Quick Recalibrate Pill -->
        <div class="pk-gyro-hud is-hidden" data-role="gyro-hud">
          <div class="pk-gyro-arc" data-role="gyro-arc" aria-hidden="true">
            <span class="pk-gyro-arc-track"></span>
            <span class="pk-gyro-arc-center"></span>
            <span class="pk-gyro-needle" data-role="gyro-needle"></span>
          </div>
          <button type="button" class="pk-gyro-recal-btn" data-role="gyro-recal" title="Recentrer le gyroscope" aria-label="Recentrer le gyroscope">
            🎯 <span>Centrer</span>
          </button>
        </div>

        <!-- Mode 1: Auto-Centered Floating Joystick -->
        <div class="pk-steer-pad" data-role="steer-pad">
          <div class="pk-steer-track">
            <span class="pk-steer-chevron pk-steer-chevron--left" data-role="chev-left">◀</span>
            <span class="pk-steer-center-dot"></span>
            <span class="pk-steer-chevron pk-steer-chevron--right" data-role="chev-right">▶</span>
          </div>
          <div class="pk-steer-puck" data-role="steer-puck">
            <span class="pk-steer-puck-grip">🛞</span>
          </div>
        </div>

        <!-- Mode 2: Generous Arcade ◀ / ▶ Buttons -->
        <div class="pk-dpad-group is-hidden" data-role="dpad-group">
          <button type="button" class="pk-dpad-btn" data-role="dpad-left" aria-label="Tourner à gauche">◀</button>
          <button type="button" class="pk-dpad-btn" data-role="dpad-right" aria-label="Tourner à droite">▶</button>
        </div>

        <div class="pk-zone-caption" data-role="steer-caption">JOYSTICK FLOTTANT</div>
      </div>

      <!-- Right Thumb Zone: Smart Item + Optional Gas + Brake + Prominent Drift -->
      <div class="pk-action-zone">
        <div class="pk-action-top-row">
          <button type="button" class="pk-ctrl-btn pk-btn-item is-empty" data-role="btn-item" aria-label="Objet (Appui, Glisser Haut/Bas ou Maintenir Bouclier)">
            <span class="pk-item-shield-ring"></span>
            <span class="pk-item-hint pk-item-hint--up" data-role="hint-up">⬆</span>
            <span class="pk-btn-item-icon" data-role="item-icon">🎁</span>
            <span class="pk-btn-item-label" data-role="item-label">OBJET</span>
            <span class="pk-item-hint pk-item-hint--down" data-role="hint-down">⬇</span>
            <span class="pk-item-hint pk-item-hint--shield" data-role="hint-shield">🛡️</span>
          </button>
        </div>

        <div class="pk-action-bottom-row">
          <button type="button" class="pk-ctrl-btn pk-btn-brake" data-role="btn-brake" aria-label="Freiner ou reculer">
            <span class="pk-btn-brake-icon">🔻</span>
            <span class="pk-btn-brake-label">FREIN</span>
          </button>

          <button type="button" class="pk-ctrl-btn pk-btn-gas is-hidden" data-role="btn-gas" aria-label="Accélérer">
            <span class="pk-btn-gas-icon">🚀</span>
            <span class="pk-btn-gas-label">GAZ</span>
          </button>

          <button type="button" class="pk-ctrl-btn pk-btn-drift charge-0" data-role="btn-drift" aria-label="Déraper ou Figure">
            <svg class="pk-drift-svg" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="pk-drift-svg-track" cx="50" cy="50" r="${DRIFT_ARC_RADIUS}" fill="none"></circle>
              <circle class="pk-drift-svg-arc" data-role="drift-arc" cx="50" cy="50" r="${DRIFT_ARC_RADIUS}" fill="none" stroke-dasharray="${DRIFT_ARC_CIRCUMFERENCE}" stroke-dashoffset="${DRIFT_ARC_CIRCUMFERENCE}" transform="rotate(-90 50 50)"></circle>
            </svg>
            <span class="pk-drift-ring"></span>
            <span class="pk-btn-drift-icon">💨</span>
            <span class="pk-btn-drift-label">DÉRAPE</span>
          </button>
        </div>
      </div>

      <!-- Subtle Desktop Keyboard & Gamepad Hint -->
      <div class="pk-desktop-hint" data-role="desktop-hint">
        <span class="pk-gamepad-badge is-hidden" data-role="gamepad-badge">🎮 Manette</span>
        <span><kbd>▲</kbd> Gaz</span>
        <span><kbd>▼</kbd> Frein / Recul</span>
        <span><kbd>◀</kbd><kbd>▶</kbd> Tourner</span>
        <span><kbd>ESPACE</kbd> Déraper</span>
        <span><kbd>ENTRÉE</kbd> / <kbd>E</kbd> Objet</span>
        <span><kbd>1</kbd>-<kbd>4</kbd> Emotes</span>
      </div>
    `;

    this.rootEl.appendChild(this.el);

    this.steerZoneEl = this.el.querySelector('[data-role="steer-zone"]');
    this.gyroHudEl = this.el.querySelector('[data-role="gyro-hud"]');
    this.gyroArcEl = this.el.querySelector('[data-role="gyro-arc"]');
    this.gyroNeedleEl = this.el.querySelector('[data-role="gyro-needle"]');
    this.gyroRecalBtnEl = this.el.querySelector('[data-role="gyro-recal"]');
    this.steerPadEl = this.el.querySelector('[data-role="steer-pad"]');
    this.steerPuckEl = this.el.querySelector('[data-role="steer-puck"]');
    this.dpadGroupEl = this.el.querySelector('[data-role="dpad-group"]');
    this.dpadLeftEl = this.el.querySelector('[data-role="dpad-left"]');
    this.dpadRightEl = this.el.querySelector('[data-role="dpad-right"]');
    this.steerCaptionEl = this.el.querySelector('[data-role="steer-caption"]');
    this.chevLeftEl = this.el.querySelector('[data-role="chev-left"]');
    this.chevRightEl = this.el.querySelector('[data-role="chev-right"]');

    this.itemBtnEl = this.el.querySelector('[data-role="btn-item"]');
    this.itemIconEl = this.el.querySelector('[data-role="item-icon"]');
    this.itemLabelEl = this.el.querySelector('[data-role="item-label"]');
    this.hintUpEl = this.el.querySelector('[data-role="hint-up"]');
    this.hintDownEl = this.el.querySelector('[data-role="hint-down"]');
    this.hintShieldEl = this.el.querySelector('[data-role="hint-shield"]');

    this.brakeBtnEl = this.el.querySelector('[data-role="btn-brake"]');
    this.gasBtnEl = this.el.querySelector('[data-role="btn-gas"]');
    this.driftBtnEl = this.el.querySelector('[data-role="btn-drift"]');
    this.driftArcEl = this.el.querySelector('[data-role="drift-arc"]');
    this.desktopHintEl = this.el.querySelector('[data-role="desktop-hint"]');
    this.gamepadBadgeEl = this.el.querySelector('[data-role="gamepad-badge"]');
  }

  _bindEvents() {
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    // Quick Gyro Recalibrate pill inside left zone
    if (this.gyroRecalBtnEl) {
      const onRecalTap = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.recalibrateGyro();
        window.dispatchEvent(new CustomEvent('pocketkart:gyro-recalibrated'));
      };
      this.gyroRecalBtnEl.addEventListener('pointerdown', onRecalTap);
      this.gyroRecalBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    }

    // --- Steering Zone: Floating Joystick + D-Pad Buttons ---
    const onSteerDown = (e) => {
      if (!this.enabled) return;
      if (e.target?.closest?.('[data-role="gyro-recal"]')) return;
      if (e.pointerType === 'mouse' && this.deviceMode === 'desktop') return;

      if (this.steerMode === 'buttons') {
        if (this._btnPointerId !== null) return;
        e.preventDefault();
        this._btnPointerId = e.pointerId;
        try {
          this.steerZoneEl.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic
        }
        this.vibrate(6);
        this._syncGyroIdleVisual();
        this._updateDpadFromClientX(e.clientX);
        return;
      }

      // Floating Auto-Centered Joystick: anchorX = initial finger touch point!
      if (this.steerPointerId !== null) return;
      e.preventDefault();
      this.steerPointerId = e.pointerId;
      this._steerAnchorX = e.clientX;
      this.touchSteer = 0;

      try {
        this.steerZoneEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic
      }

      // Visually shift floating pad ring around thumb anchor inside left zone
      const zoneRect = this.steerZoneEl.getBoundingClientRect();
      if (zoneRect.width > 0) {
        const zoneMidX = zoneRect.left + zoneRect.width * 0.5;
        const maxShift = Math.max(20, zoneRect.width * 0.24);
        const shiftPx = Math.max(-maxShift, Math.min(maxShift, e.clientX - zoneMidX));
        this.steerPadEl.style.transform = `translate3d(${shiftPx.toFixed(1)}px, 0, 0)`;
      }

      this.steerPadEl.classList.add('is-active');
      this._syncGyroIdleVisual();
      this._renderSteerVisual(0);
    };

    const onSteerMove = (e) => {
      if (this.steerMode === 'buttons') {
        if (e.pointerId !== this._btnPointerId) return;
        e.preventDefault();
        this._updateDpadFromClientX(e.clientX);
        return;
      }

      if (e.pointerId !== this.steerPointerId) return;
      e.preventDefault();
      this._updateFloatingSteerFromClientX(e.clientX);
    };

    const onSteerEnd = (e) => {
      if (e.pointerId === this._btnPointerId) {
        this._btnPointerId = null;
        this._btnDir = 0;
        this.dpadLeftEl.classList.remove('is-pressed');
        this.dpadRightEl.classList.remove('is-pressed');
        this._syncGyroIdleVisual();
      }
      if (e.pointerId === this.steerPointerId) {
        this.steerPointerId = null;
        this.touchSteer = 0;
        this.steerPadEl.style.transform = 'translate3d(0, 0, 0)';
        this.steerPadEl.classList.remove('is-active');
        this._syncGyroIdleVisual();
        this._renderSteerVisual(0);
      }
    };

    this.steerZoneEl.addEventListener('pointerdown', onSteerDown);
    this.steerZoneEl.addEventListener('pointermove', onSteerMove);
    this.steerZoneEl.addEventListener('pointerup', onSteerEnd);
    this.steerZoneEl.addEventListener('pointercancel', onSteerEnd);
    this.steerZoneEl.addEventListener('lostpointercapture', onSteerEnd);

    // --- Drift Hold Button ---
    this._bindHoldButton(this.driftBtnEl, this.driftPointers, 8);

    // --- Brake Hold Button ---
    this._bindHoldButton(this.brakeBtnEl, this.brakePointers, 6);

    // --- Manual Gas Hold Button (when autoAccel === false) ---
    this._bindHoldButton(this.gasBtnEl, this.gasPointers, 0);

    // --- Smart Item Button: Tap, Swipe Up/Down Aim, or Hold >0.18s Auto-Lock Shield ---
    const onItemDown = (e) => {
      if (!this.enabled || this._itemPointer !== null) return;
      if (e.pointerType === 'mouse' && this.deviceMode === 'desktop') return;
      e.preventDefault();
      this._shieldLockedOnCurrentPress = false;
      this._itemPointer = {
        id: e.pointerId,
        startY: e.clientY,
        startTime: performance.now(),
        aim: 0,
        wasShieldLocked: this._shieldLocked,
      };
      try {
        this.itemBtnEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      if (this.itemBtnEl.classList.contains('has-item')) {
        this.vibrate(10);
      }
      this.itemBtnEl.classList.add('is-pressed');
    };

    const onItemMove = (e) => {
      if (!this._itemPointer || e.pointerId !== this._itemPointer.id) return;
      e.preventDefault();
      const dy = e.clientY - this._itemPointer.startY;
      let aim = 0;
      if (dy > 24) {
        aim = -1; // Swipe down = rear shot!
      } else if (dy < -24) {
        aim = 1; // Swipe up = forward throw!
      }
      this._itemPointer.aim = aim;
      this._setAimPreviewVisual(aim);
    };

    const onItemEnd = (e) => {
      if (!this._itemPointer || e.pointerId !== this._itemPointer.id) return;
      const finalAim = this._itemPointer.aim;
      const lockedDuringPress = this._shieldLockedOnCurrentPress;
      this._itemPointer = null;
      this._shieldLockedOnCurrentPress = false;
      this.itemBtnEl.classList.remove('is-pressed', 'is-tapped');
      this._setAimPreviewVisual(0);

      // If user held >180ms with aim === 0 to lock the trailing shield, keep shield locked
      // upon lifting the thumb so the right thumb is free to tap Drift/Brake!
      if (lockedDuringPress && finalAim === 0 && this._shieldLocked) {
        this.itemBtnEl.classList.add('is-shield-locked', 'is-shielding');
        this.itemLabelEl.textContent = '🛡️ AUTO';
        return;
      }

      // Otherwise (quick tap, swipe aim, or tapping again while shield is already locked):
      // unlock shield and fire/release the item!
      this._shieldLocked = false;
      this.itemBtnEl.classList.remove('is-shield-locked', 'is-shielding');
      this.useItemLatched = true;
      this.latchedItemAim = finalAim;
      void this.itemBtnEl.offsetWidth;
      this.itemBtnEl.classList.add('is-tapped');
    };

    const onItemCancel = (e) => {
      if (!this._itemPointer || e.pointerId !== this._itemPointer.id) return;
      this._itemPointer = null;
      this._shieldLockedOnCurrentPress = false;
      this.itemBtnEl.classList.remove('is-pressed');
      this._setAimPreviewVisual(0);
    };

    this.itemBtnEl.addEventListener('pointerdown', onItemDown);
    this.itemBtnEl.addEventListener('pointermove', onItemMove);
    this.itemBtnEl.addEventListener('pointerup', onItemEnd);
    this.itemBtnEl.addEventListener('pointercancel', onItemCancel);
    this.itemBtnEl.addEventListener('lostpointercapture', onItemEnd);

    // Allow tapping HUD top-center item box to fire item (aim = 0)
    this._onExternalItemTap = () => {
      if (this.enabled) {
        this._shieldLocked = false;
        this.itemBtnEl?.classList.remove('is-shield-locked', 'is-shielding');
        this.useItemLatched = true;
        this.latchedItemAim = 0;
        this.vibrate(12);
      }
    };
    window.addEventListener('pocketkart:use-item', this._onExternalItemTap);

    // Listen for external gyro/haptic control events from HUD / Pause menu
    this._onExternalGyroRecal = () => this.recalibrateGyro();
    this._onExternalGyroSens = (e) => {
      if (e?.detail) this.setGyroSensitivity(e.detail);
    };
    this._onExternalGyroInvert = (e) => {
      if (typeof e?.detail === 'boolean') this.setGyroInvert(e.detail);
    };
    this._onExternalHapticsToggle = (e) => {
      if (typeof e?.detail === 'boolean') this.setHapticsEnabled(e.detail);
    };
    window.addEventListener('pocketkart:gyro-recalibrate', this._onExternalGyroRecal);
    window.addEventListener('pocketkart:gyro-sensitivity', this._onExternalGyroSens);
    window.addEventListener('pocketkart:gyro-invert', this._onExternalGyroInvert);
    window.addEventListener('pocketkart:haptics-toggle', this._onExternalHapticsToggle);

    // --- Gyroscope Orientation Handler (with iOS -90° fix, pitch compensation & neutral offset) ---
    this._onDeviceOrientation = (e) => {
      if (e && e.beta === null && e.gamma === null) {
        this._gyroNullSensorDetected = true;
        return;
      }
      const beta = Number(e?.beta);
      const gamma = Number(e?.gamma);
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

      this._hasReceivedGyroData = true;
      this._gyroNullSensorDetected = false;

      if (!this.gyroEnabled) return;

      const rawAngle =
        window.screen?.orientation?.angle ??
        (typeof window.orientation === 'number' ? window.orientation : 0);
      const angle = ((rawAngle % 360) + 360) % 360;

      if (this._lastScreenAngle !== null && this._lastScreenAngle !== angle) {
        this._gyroNeedsCalibration = true;
      }
      this._lastScreenAngle = angle;

      let rawTiltDeg = 0;
      if (angle === 90 || angle === 270) {
        // Landscape Left (90) or Landscape Right (270 / -90 on iOS):
        // Roll around screen normal is driven by beta; clamp extreme values & prevent flip past vertical.
        const sign = angle === 90 ? 1 : -1;
        const clampedBeta = Math.max(-75, Math.min(75, beta));
        rawTiltDeg = sign * clampedBeta;
      } else {
        // Portrait (0) or Portrait Upside-Down (180):
        // Compensate W3C Euler gimbal lock when phone is held upright (|beta| near or past 90°).
        const sign = angle === 180 ? -1 : 1;
        const betaRad = (beta * Math.PI) / 180;
        const gammaRad = (gamma * Math.PI) / 180;
        const flipCorrection = Math.abs(beta) > 90 ? -1 : 1;
        const pitchAtten = Math.max(0.55, Math.abs(Math.cos(betaRad)));
        const sinRoll = Math.max(-1, Math.min(1, Math.sin(gammaRad) * flipCorrection * pitchAtten));
        rawTiltDeg = sign * ((Math.asin(sinRoll) * 180) / Math.PI);
      }

      this._gyroRawTiltDeg = rawTiltDeg;

      if (this._gyroNeedsCalibration) {
        this._gyroNeutralOffset = Math.max(-20, Math.min(20, rawTiltDeg));
        this._gyroNeedsCalibration = false;
      }

      let calibratedTilt = rawTiltDeg - this._gyroNeutralOffset;
      if (this.gyroInvert) {
        calibratedTilt = -calibratedTilt;
      }

      const maxDeg = GYRO_MAX_DEG_BY_SENS[this.gyroSensitivity] || 24;
      const rawNorm = Math.max(-1, Math.min(1, calibratedTilt / maxDeg));
      const abs = Math.abs(rawNorm);
      const deadzone = 0.06;
      let target = 0;
      if (abs > deadzone) {
        const v = (abs - deadzone) / (1 - deadzone);
        target = Math.sign(rawNorm) * Math.pow(v, 1.2);
      }

      this._gyroTargetSteer = Math.max(-1, Math.min(1, target));
    };

    // --- Desktop Keyboard Support ---
    const isItemKey = (code) =>
      code === 'Enter' || code === 'NumpadEnter' || code === 'KeyE' || code === 'KeyF';

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const code = e.code;
      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowDown' ||
        code === 'ArrowUp' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      this.keys.add(code);

      if (!e.repeat && isItemKey(code)) {
        e.preventDefault();
        if (SHIELDABLE_ITEMS.has(this._currentHeldItem)) {
          this._keyItemDownAt = performance.now();
        } else {
          this._keyItemDownAt = null;
          this.useItemLatched = true;
          this.latchedItemAim = this._computeKeyboardItemAim();
        }
      }

      if (!e.repeat) {
        if (code === 'Digit1') {
          window.dispatchEvent(new CustomEvent('pocketkart:emote-shortcut', { detail: 0 }));
        } else if (code === 'Digit2') {
          window.dispatchEvent(new CustomEvent('pocketkart:emote-shortcut', { detail: 1 }));
        } else if (code === 'Digit3') {
          window.dispatchEvent(new CustomEvent('pocketkart:emote-shortcut', { detail: 2 }));
        } else if (code === 'Digit4' || code === 'KeyH') {
          window.dispatchEvent(new CustomEvent('pocketkart:emote-shortcut', { detail: 3 }));
        }
      }
    };

    this._onKeyUp = (e) => {
      const code = e.code;
      this.keys.delete(code);

      if (isItemKey(code) && this._keyItemDownAt !== null) {
        this._keyItemDownAt = null;
        this.useItemLatched = true;
        this.latchedItemAim = this._computeKeyboardItemAim();
      }
    };

    this._onResetInputs = () => {
      this._clearTransientInputs();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onResetInputs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._clearTransientInputs();
    });

    this._onGamepadChange = () => {
      this._syncGamepadStatus(this._findConnectedGamepad());
      this._updatePauseWatchTimer();
    };
    window.addEventListener('gamepadconnected', this._onGamepadChange);
    window.addEventListener('gamepaddisconnected', this._onGamepadChange);
  }

  _bindHoldButton(btnEl, pointerSet, hapticMs = 0) {
    const onDown = (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && this.deviceMode === 'desktop') return;
      e.preventDefault();
      const wasEmpty = pointerSet.size === 0;
      pointerSet.add(e.pointerId);
      try {
        btnEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      btnEl.classList.add('is-pressed');
      if (wasEmpty && hapticMs > 0) {
        this.vibrate(hapticMs);
      }
    };

    const onEnd = (e) => {
      if (!pointerSet.has(e.pointerId)) return;
      pointerSet.delete(e.pointerId);
      if (pointerSet.size === 0) {
        btnEl.classList.remove('is-pressed');
      }
    };

    btnEl.addEventListener('pointerdown', onDown);
    btnEl.addEventListener('pointerup', onEnd);
    btnEl.addEventListener('pointercancel', onEnd);
    btnEl.addEventListener('lostpointercapture', onEnd);
  }

  _computeKeyboardItemAim() {
    const downHeld = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    const upHeld =
      this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('KeyZ');
    if (downHeld) return -1;
    if (
      this.autoAccel &&
      upHeld &&
      (this._currentHeldItem === 'banana' || this._currentHeldItem === ITEMS.BANANA)
    ) {
      return 1;
    }
    return 0;
  }

  _setAimPreviewVisual(aim) {
    if (aim === this._lastAimPreview) return;
    this._lastAimPreview = aim;
    this.hintUpEl.classList.toggle('is-lit', aim === 1);
    this.hintDownEl.classList.toggle('is-lit', aim === -1);
  }

  _updateDpadFromClientX(clientX) {
    const rect = this.dpadGroupEl.getBoundingClientRect();
    if (!rect.width) return;
    const mid = rect.left + rect.width * 0.5;
    this._btnDir = clientX < mid ? -1 : 1;
    this.dpadLeftEl.classList.toggle('is-pressed', this._btnDir < 0);
    this.dpadRightEl.classList.toggle('is-pressed', this._btnDir > 0);
  }

  _updateFloatingSteerFromClientX(clientX) {
    const maxTravel = 52;
    const rawOffset = Math.max(-1, Math.min(1, (clientX - this._steerAnchorX) / maxTravel));

    const deadzone = 0.05;
    const abs = Math.abs(rawOffset);
    let steer = 0;
    if (abs > deadzone) {
      const v = Math.min(1, (abs - deadzone) / (1 - deadzone));
      steer = Math.sign(rawOffset) * Math.pow(Math.abs(v), 1.25);
    }

    this.touchSteer = Math.max(-1, Math.min(1, steer));
    this._renderSteerVisual(this.touchSteer, maxTravel);
  }

  _renderSteerVisual(steer, maxTravel = 50) {
    const px = (steer * maxTravel).toFixed(1);
    const tilt = (steer * 18).toFixed(1);
    this.steerPuckEl.style.transform = `translate3d(${px}px, 0, 0) rotate(${tilt}deg)`;
    this.chevLeftEl.classList.toggle('is-lit', steer < -0.12);
    this.chevRightEl.classList.toggle('is-lit', steer > 0.12);
    this._renderGyroGauge(steer);
  }

  _renderGyroGauge(steer) {
    if (!this.gyroEnabled || !this.gyroNeedleEl) return;
    const needlePx = (steer * 34).toFixed(1);
    const needleDeg = (steer * 24).toFixed(1);
    this.gyroNeedleEl.style.transform = `translate3d(${needlePx}px, 0, 0) rotate(${needleDeg}deg)`;
    if (this.gyroArcEl) {
      this.gyroArcEl.classList.toggle('is-tilted-left', steer < -0.12);
      this.gyroArcEl.classList.toggle('is-tilted-right', steer > 0.12);
    }
  }

  _syncGyroIdleVisual() {
    if (!this.steerZoneEl) return;
    const touchActive = this.steerPointerId !== null || this._btnPointerId !== null;
    this.steerZoneEl.classList.toggle('is-gyro-idle', Boolean(this.gyroEnabled && !touchActive));
  }

  _syncCaption() {
    if (this.steerZoneEl) {
      this.steerZoneEl.classList.toggle('is-gyro-enabled', this.gyroEnabled);
    }
    if (this.gyroHudEl) {
      this.gyroHudEl.classList.toggle('is-hidden', !this.gyroEnabled);
    }
    this._syncGyroIdleVisual();
    if (!this.steerCaptionEl) return;
    if (this.gyroEnabled) {
      this.steerCaptionEl.textContent =
        this.steerMode === 'buttons' ? '🛞 VOLANT GYRO + BOUTONS' : '🛞 VOLANT GYRO ACTIF';
      return;
    }
    this.steerCaptionEl.textContent =
      this.steerMode === 'buttons' ? 'BOUTONS ◀ ▶' : 'JOYSTICK FLOTTANT';
  }

  _clearTransientInputs() {
    this.touchSteer = 0;
    this.gyroSteer = 0;
    this._gyroTargetSteer = 0;
    this._btnDir = 0;
    this._btnPointerId = null;
    this._buttonSteer = 0;
    this.steerPointerId = null;
    this.driftPointers.clear();
    this.brakePointers.clear();
    this.gasPointers.clear();
    this._itemPointer = null;
    this._shieldLocked = false;
    this._shieldLockedOnCurrentPress = false;
    this._keyItemDownAt = null;
    this._padItemDownAt = null;
    this._padItemWasDown = false;
    this.keys.clear();
    this.useItemLatched = false;
    this.latchedItemAim = 0;

    if (this.steerPadEl) {
      this.steerPadEl.style.transform = 'translate3d(0, 0, 0)';
      this.steerPadEl.classList.remove('is-active');
    }
    this._syncGyroIdleVisual();
    this.dpadLeftEl?.classList.remove('is-pressed', 'is-gyro-lit');
    this.dpadRightEl?.classList.remove('is-pressed', 'is-gyro-lit');
    this.driftBtnEl?.classList.remove('is-pressed', 'is-tier-pulse');
    this.brakeBtnEl?.classList.remove('is-pressed');
    this.gasBtnEl?.classList.remove('is-pressed');
    this.itemBtnEl?.classList.remove('is-pressed', 'is-shielding', 'is-shield-locked');
    this._setAimPreviewVisual(0);
    if (this.steerPuckEl) this._renderSteerVisual(0);
  }

  /**
   * Switches between 'joystick' (auto-centered floating) and 'buttons' (arcade ◀/▶).
   */
  setSteerMode(mode) {
    const next = mode === 'buttons' ? 'buttons' : 'joystick';
    this.steerMode = next;
    this.steerPadEl.classList.toggle('is-hidden', next !== 'joystick');
    this.dpadGroupEl.classList.toggle('is-hidden', next !== 'buttons');
    this._syncCaption();
    return this.steerMode;
  }

  getSteerMode() {
    return this.steerMode;
  }

  setHapticsEnabled(enabled) {
    this.hapticsEnabled = Boolean(enabled);
    writeTouchPref('pocketkart_haptics', this.hapticsEnabled);
    if (this.hapticsEnabled) {
      this.vibrate(10);
    }
    return this.hapticsEnabled;
  }

  isHapticsEnabled() {
    return this.hapticsEnabled;
  }

  setGyroSensitivity(level) {
    const next = GYRO_MAX_DEG_BY_SENS[level] ? level : 'normal';
    this.gyroSensitivity = next;
    writeTouchPref('pocketkart_gyro_sens', next);
    return this.gyroSensitivity;
  }

  getGyroSensitivity() {
    return this.gyroSensitivity;
  }

  setGyroInvert(inverted) {
    this.gyroInvert = Boolean(inverted);
    writeTouchPref('pocketkart_gyro_invert', this.gyroInvert);
    return this.gyroInvert;
  }

  isGyroInverted() {
    return this.gyroInvert;
  }

  recalibrateGyro({ silent = false } = {}) {
    if (this._hasReceivedGyroData) {
      this._gyroNeutralOffset = Math.max(-20, Math.min(20, this._gyroRawTiltDeg));
      this._gyroNeedsCalibration = false;
    } else {
      this._gyroNeedsCalibration = true;
    }
    this._gyroTargetSteer = 0;
    this.gyroSteer = 0;
    this._renderGyroGauge(0);
    if (!silent) {
      this.vibrate(12);
    }
    return this._gyroNeutralOffset;
  }

  hasGyroSensorData() {
    return this._hasReceivedGyroData;
  }

  vibrate(pattern = 15) {
    if (!this.hapticsEnabled) return;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration permission restrictions
    }

    try {
      const gp = this._findConnectedGamepad();
      const actuator = gp?.vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        let duration = 60;
        let weakMagnitude = 0.45;
        let strongMagnitude = 0.3;

        if (Array.isArray(pattern) && pattern.length > 0) {
          const totalMs = pattern.reduce((acc, v) => acc + (Number(v) || 0), 0);
          duration = Math.max(55, Math.min(450, totalMs * 1.4));
          weakMagnitude = 0.72;
          strongMagnitude = 0.52;
        } else {
          const ms = Math.max(8, Number(pattern) || 15);
          duration = Math.max(40, Math.min(350, ms * 2.4));
          const strength = Math.min(0.85, 0.25 + ms / 55);
          weakMagnitude = strength;
          strongMagnitude = strength * 0.7;
        }

        const res = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude,
          strongMagnitude,
        });
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Ignore unsupported gamepad rumble implementations
    }
  }

  async setGyroEnabled(enabled) {
    const want = Boolean(enabled);
    if (!want) {
      this.gyroEnabled = false;
      this.gyroSteer = 0;
      this._gyroTargetSteer = 0;
      if (this._gyroListenerBound) {
        window.removeEventListener('deviceorientation', this._onDeviceOrientation);
        this._gyroListenerBound = false;
      }
      this._syncCaption();
      return false;
    }

    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      this.gyroEnabled = false;
      this._syncCaption();
      return false;
    }

    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await window.DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          this.gyroEnabled = false;
          this._syncCaption();
          return false;
        }
      } catch {
        this.gyroEnabled = false;
        this._syncCaption();
        return false;
      }
    }

    this.gyroEnabled = true;
    this._gyroNeedsCalibration = true;
    this._gyroNullSensorDetected = false;
    if (!this._gyroListenerBound) {
      window.addEventListener('deviceorientation', this._onDeviceOrientation, { passive: true });
      this._gyroListenerBound = true;
    }

    // Brief sensor probe: desktop browsers often fire a single event with beta: null, gamma: null.
    if (!this._hasReceivedGyroData) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener('deviceorientation', onProbe);
          resolve();
        };
        const onProbe = (ev) => {
          if (ev && ev.beta === null && ev.gamma === null) {
            this._gyroNullSensorDetected = true;
          } else if (Number.isFinite(Number(ev?.beta)) && Number.isFinite(Number(ev?.gamma))) {
            this._hasReceivedGyroData = true;
            this._gyroNullSensorDetected = false;
          }
          finish();
        };
        window.addEventListener('deviceorientation', onProbe, { passive: true });
        setTimeout(finish, 140);
      });

      if (this._gyroNullSensorDetected && !this._hasReceivedGyroData) {
        this.gyroEnabled = false;
        if (this._gyroListenerBound) {
          window.removeEventListener('deviceorientation', this._onDeviceOrientation);
          this._gyroListenerBound = false;
        }
        this._syncCaption();
        return false;
      }
    }

    this._syncCaption();
    return true;
  }

  isGyroEnabled() {
    return this.gyroEnabled;
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (this.enabled === next) return;
    this.enabled = next;
    this.el.classList.toggle('is-hidden', !next);
    this.el.setAttribute('aria-hidden', String(!next));
    const now = performance.now();
    this._lastPollMs = now;
    if (!next) {
      this._clearTransientInputs();
      this._lastDriftCharge = 0;
      this._lastBoosting = false;
      this._lastShieldActive = false;
      this._racingStartedAt = null;
      this._syncDesktopHintFade(false);
    } else if (this.racePhase === 'racing') {
      this._racingStartedAt = now;
      this._syncDesktopHintFade(false);
    }
    this._updatePauseWatchTimer();
  }

  setDeviceMode(mode) {
    const next = mode === 'mobile' ? 'mobile' : 'desktop';
    if (this.deviceMode === next) return;
    this.deviceMode = next;
    if (next === 'desktop') {
      this.steerPointerId = null;
      this._btnPointerId = null;
      this._btnDir = 0;
      this.touchSteer = 0;
      this.driftPointers.clear();
      this.brakePointers.clear();
      this.gasPointers.clear();
      this._syncGyroIdleVisual();
    }
  }

  setRacePhase(phase) {
    const next = phase || 'home';
    if (next !== this.racePhase) {
      this.racePhase = next;
      if (next === 'racing' && this.enabled) {
        this._racingStartedAt = performance.now();
        this._syncDesktopHintFade(false);
      } else if (next !== 'racing') {
        this._racingStartedAt = null;
        this._syncDesktopHintFade(false);
      }
      this._updatePauseWatchTimer();
    }
  }

  setAutoAccel(enabled) {
    this.autoAccel = Boolean(enabled);
    if (this.gasBtnEl) {
      this.gasBtnEl.classList.toggle('is-hidden', this.autoAccel);
    }
  }

  _syncDesktopHintFade(faded) {
    const next = Boolean(faded);
    if (next === this._lastHintFaded || !this.desktopHintEl) return;
    this._lastHintFaded = next;
    this.desktopHintEl.classList.toggle('is-racing-faded', next);
  }

  _findConnectedGamepad() {
    if (typeof navigator === 'undefined') return null;
    const getPads = navigator.getGamepads || navigator.webkitGetGamepads;
    if (typeof getPads !== 'function') return null;
    let pads;
    try {
      pads = getPads.call(navigator);
    } catch {
      return null;
    }
    if (!pads) return null;

    let fallback = null;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      if (gp.mapping === 'standard') return gp;
      if (!fallback) fallback = gp;
    }
    return fallback;
  }

  _formatGamepadBadgeLabel(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('dualsense') || lower.includes('dualshock') || lower.includes('054c')) {
      return '🎮 DualSense';
    }
    if (lower.includes('xbox') || lower.includes('xinput') || lower.includes('045e')) {
      return '🎮 Xbox';
    }
    if (lower.includes('switch') || lower.includes('pro controller') || lower.includes('057e')) {
      return '🎮 Switch Pro';
    }
    return '🎮 Manette';
  }

  _syncGamepadStatus(gp) {
    const connected = Boolean(gp && gp.connected);
    const name = connected ? String(gp.id || 'Manette') : '';

    const changed = connected !== this._gamepadConnected || (connected && name !== this._gamepadName);
    this._gamepadConnected = connected;
    this._gamepadName = name;

    const badgeKey = connected ? this._formatGamepadBadgeLabel(name) : 'off';
    if (this.gamepadBadgeEl && badgeKey !== this._lastGamepadBadgeKey) {
      this._lastGamepadBadgeKey = badgeKey;
      this.gamepadBadgeEl.classList.toggle('is-hidden', !connected);
      this.gamepadBadgeEl.classList.toggle('is-connected', connected);
      if (connected) {
        this.gamepadBadgeEl.textContent = badgeKey;
        this.gamepadBadgeEl.title = name;
      }
    }

    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pocketkart:gamepad-status', {
          detail: { connected, name },
        })
      );
    }
  }

  _isPadBtnDown(gp, index, analogThreshold = 0.18) {
    const btn = gp?.buttons?.[index];
    if (!btn) return false;
    return Boolean(btn.pressed || (typeof btn.value === 'number' && btn.value > analogThreshold));
  }

  _updatePauseWatchTimer() {
    const shouldWatch =
      this._gamepadConnected &&
      !this.enabled &&
      (this.racePhase === 'countdown' || this.racePhase === 'racing');

    if (shouldWatch && !this._padPauseWatchTimer) {
      this._padPauseWatchTimer = setInterval(() => {
        if (this.enabled || (this.racePhase !== 'countdown' && this.racePhase !== 'racing')) {
          this._updatePauseWatchTimer();
          return;
        }
        const gp = this._findConnectedGamepad();
        this._syncGamepadStatus(gp);
        if (!gp) {
          this._padStartWasDown = false;
          return;
        }
        const startDown = this._isPadBtnDown(gp, 9);
        if (startDown && !this._padStartWasDown) {
          window.dispatchEvent(new CustomEvent('pocketkart:toggle-pause'));
        }
        this._padStartWasDown = startDown;
      }, 90);
    } else if (!shouldWatch && this._padPauseWatchTimer) {
      clearInterval(this._padPauseWatchTimer);
      this._padPauseWatchTimer = null;
    }
  }

  /**
   * Updates thumb-zone button visuals + shield ring + subtle haptic/visual pulses at 60fps.
   */
  updateVisualState({
    driftCharge = 0,
    driftTime = null,
    item = null,
    itemRouletteTimer = 0,
    boosting = false,
    shieldItem = null,
    tripleMushrooms = 0,
  } = {}) {
    const mushroomCount = Math.max(0, Math.floor(Number(tripleMushrooms) || 0));
    const hasRegularItem = Boolean(item && item !== ITEMS.NONE && item !== 'none');
    const effectiveItem =
      itemRouletteTimer > 0
        ? null
        : hasRegularItem
          ? item
          : mushroomCount > 0
            ? ITEMS.TURBO
            : null;

    this._currentHeldItem = effectiveItem;

    // Clear shield lock if current item is no longer shieldable
    if (this._shieldLocked && (!effectiveItem || !SHIELDABLE_ITEMS.has(effectiveItem))) {
      this._shieldLocked = false;
      this.itemBtnEl.classList.remove('is-shield-locked', 'is-shielding');
    }

    const rawCharge = Number.isFinite(driftCharge) ? Math.max(0, Math.min(3, driftCharge)) : 0;
    const charge = Math.max(0, Math.min(3, Math.floor(rawCharge)));
    if (this.enabled && charge > this._lastDriftCharge) {
      if (charge === 1) this.vibrate(10);
      else if (charge === 2) this.vibrate(16);
      else if (charge === 3) this.vibrate([18, 22, 24]);

      // Visual shockwave pulse on Drift button (essential on iOS where Web Vibration is absent)
      this.driftBtnEl.classList.remove('is-tier-pulse');
      void this.driftBtnEl.offsetWidth;
      this.driftBtnEl.classList.add('is-tier-pulse');
    }
    this._lastDriftCharge = charge;

    if (charge !== this._lastDriftChargeRendered) {
      this.driftBtnEl.classList.remove('charge-0', 'charge-1', 'charge-2', 'charge-3');
      if (charge === 0) {
        this.driftBtnEl.classList.remove('is-tier-pulse');
      }
      this.driftBtnEl.classList.add(`charge-${charge}`);
      this._lastDriftChargeRendered = charge;
    }

    if (this.driftArcEl) {
      const progress =
        driftTime !== null && Number.isFinite(driftTime)
          ? Math.max(0, Math.min(1, driftTime / 2.1))
          : rawCharge / 3;
      const offsetStr = (DRIFT_ARC_CIRCUMFERENCE * (1 - progress)).toFixed(1);
      if (offsetStr !== this._lastDriftArcOffset) {
        this.driftArcEl.style.strokeDashoffset = offsetStr;
        this._lastDriftArcOffset = offsetStr;
      }
    }

    const isBoost = Boolean(boosting);
    if (isBoost !== this._lastBoosting) {
      if (this.enabled && isBoost) {
        this.vibrate(22);
      }
      this.driftBtnEl.classList.toggle('is-boosting', isBoost);
      this._lastBoosting = isBoost;
    }

    const shieldActive = Boolean(shieldItem || this._shieldLocked);
    if (shieldActive !== this._lastShieldActive) {
      this.itemBtnEl.classList.toggle('is-shielding', shieldActive);
      this._lastShieldActive = shieldActive;
    }
    this.itemBtnEl.classList.toggle('is-shield-locked', Boolean(this._shieldLocked && shieldActive));

    if (itemRouletteTimer > 0) {
      const idx = Math.floor(performance.now() / 75) % ROULETTE_ICONS.length;
      const key = `roulette:${idx}`;
      if (key !== this._lastItemKey) {
        this.itemIconEl.textContent = ROULETTE_ICONS[idx];
        this.itemLabelEl.textContent = 'TIRAGE…';
        this.itemBtnEl.classList.remove('is-empty', 'has-item', 'is-shieldable', 'is-shield-locked');
        this.itemBtnEl.classList.add('is-roulette');
        this._lastItemKey = key;
      }
      return;
    }

    if (!hasRegularItem && mushroomCount > 0) {
      const ttKey = `tt_mush:${mushroomCount}`;
      if (ttKey !== this._lastItemKey) {
        this.itemBtnEl.classList.remove('is-roulette', 'is-empty', 'is-shieldable', 'is-shield-locked');
        this.itemBtnEl.classList.add('has-item');
        this.itemIconEl.textContent = '🍄';
        this.itemLabelEl.textContent = `TURBO ×${mushroomCount}`;
        this._lastItemKey = ttKey;
      }
      return;
    }

    const meta = hasRegularItem ? ITEM_META[item] : null;
    const isShieldable = Boolean(hasRegularItem && SHIELDABLE_ITEMS.has(item));
    const itemKey = meta ? `item:${item}:${shieldActive ? 1 : 0}:${this._shieldLocked ? 1 : 0}` : 'empty';

    if (itemKey !== this._lastItemKey) {
      this.itemBtnEl.classList.remove('is-roulette');
      if (meta) {
        this.itemIconEl.textContent = meta.icon;
        this.itemLabelEl.textContent = this._shieldLocked
          ? '🛡️ AUTO'
          : shieldActive
            ? '🛡️ BOUCLIER'
            : meta.label;
        this.itemBtnEl.classList.remove('is-empty');
        this.itemBtnEl.classList.add('has-item');
        this.itemBtnEl.classList.toggle('is-shieldable', isShieldable);
      } else {
        this.itemIconEl.textContent = '🎁';
        this.itemLabelEl.textContent = 'OBJET';
        this.itemBtnEl.classList.remove('has-item', 'is-shieldable', 'is-shield-locked');
        this.itemBtnEl.classList.add('is-empty');
      }
      this._lastItemKey = itemKey;
    }
  }

  /**
   * Returns V3 player input shape:
   * { steer, drift, brake, accel, useItem, itemAim, holdShield }
   */
  pollInput() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this._lastPollMs) / 1000));
    this._lastPollMs = now;

    const gp = this._findConnectedGamepad();
    this._syncGamepadStatus(gp);

    if (!this.enabled) {
      return {
        steer: 0,
        drift: false,
        brake: false,
        accel: this.autoAccel,
        useItem: false,
        itemAim: 0,
        holdShield: false,
      };
    }

    // Fade desktop hint banner gently after a few seconds of active racing
    if (this.racePhase === 'racing') {
      if (this._racingStartedAt === null) {
        this._racingStartedAt = now;
      }
      this._syncDesktopHintFade(now - this._racingStartedAt >= RACING_HINT_FADE_MS);
    } else {
      this._racingStartedAt = null;
      this._syncDesktopHintFade(false);
    }

    // Frame-rate independent exponential smoothing for Gyro steering
    if (this.gyroEnabled) {
      const gyroSmooth = 1 - Math.exp(-dt * 20);
      this.gyroSteer += (this._gyroTargetSteer - this.gyroSteer) * gyroSmooth;
      if (Math.abs(this.gyroSteer) < 0.004 && this._gyroTargetSteer === 0) {
        this.gyroSteer = 0;
      }
    } else {
      this.gyroSteer = 0;
    }

    // Smoothly ramp arcade D-Pad steering (dt * 12)
    if (this.steerMode === 'buttons') {
      const targetBtn = this._btnPointerId !== null ? this._btnDir : 0;
      this._buttonSteer += (targetBtn - this._buttonSteer) * Math.min(1, dt * 12);
      if (Math.abs(this._buttonSteer) < 0.01 && targetBtn === 0) {
        this._buttonSteer = 0;
      }
    } else {
      this._buttonSteer = 0;
    }

    // --- Gamepad polling (Xbox, DualSense, Switch Pro standard mapping) ---
    let padSteer = 0;
    let padAccel = false;
    let padBrake = false;
    let padDrift = false;
    let padItemDown = false;
    let padItemAim = 0;

    if (gp) {
      const rawAxisX = gp.axes?.[0] ?? 0;
      const absX = Math.abs(rawAxisX);
      let stickSteer = 0;
      if (absX > GAMEPAD_DEADZONE) {
        const norm = Math.min(1, (absX - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE));
        stickSteer = Math.sign(rawAxisX) * Math.pow(norm, 1.35);
      }

      const dpadLeft = this._isPadBtnDown(gp, 14);
      const dpadRight = this._isPadBtnDown(gp, 15);
      const dpadSteer = (dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0);
      padSteer = Math.abs(stickSteer) >= Math.abs(dpadSteer) ? stickSteer : dpadSteer;

      padAccel = this._isPadBtnDown(gp, 7) || this._isPadBtnDown(gp, 0);
      padBrake = this._isPadBtnDown(gp, 6) || this._isPadBtnDown(gp, 1);
      padDrift = this._isPadBtnDown(gp, 5) || this._isPadBtnDown(gp, 3);
      padItemDown = this._isPadBtnDown(gp, 4) || this._isPadBtnDown(gp, 2);

      const rawAxisY = gp.axes?.[1] ?? 0;
      const dpadUp = this._isPadBtnDown(gp, 12);
      const dpadDown = this._isPadBtnDown(gp, 13);
      if (dpadUp || rawAxisY < -0.45) {
        padItemAim = 1;
      } else if (dpadDown || rawAxisY > 0.45) {
        padItemAim = -1;
      }

      const startDown = this._isPadBtnDown(gp, 9);
      if (startDown && !this._padStartWasDown) {
        window.dispatchEvent(new CustomEvent('pocketkart:toggle-pause'));
      }
      this._padStartWasDown = startDown;
    } else {
      this._padStartWasDown = false;
    }

    const canShield = Boolean(this._currentHeldItem && SHIELDABLE_ITEMS.has(this._currentHeldItem));
    if (!canShield && this._shieldLocked) {
      this._shieldLocked = false;
      this.itemBtnEl?.classList.remove('is-shield-locked', 'is-shielding');
    }

    if (padItemDown && !this._padItemWasDown) {
      if (canShield) {
        this._padItemDownAt = now;
      } else {
        this._padItemDownAt = null;
        this.useItemLatched = true;
        this.latchedItemAim = padItemAim;
      }
    } else if (!padItemDown && this._padItemWasDown && this._padItemDownAt !== null) {
      this._padItemDownAt = null;
      this.useItemLatched = true;
      this.latchedItemAim = padItemAim;
    }
    this._padItemWasDown = padItemDown;

    const keyLeft =
      this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.keys.has('KeyQ');
    const keyRight = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const keySteer = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);

    let steer = 0;
    if (this.steerMode === 'buttons' && (this._btnPointerId !== null || Math.abs(this._buttonSteer) > 0.01)) {
      steer = Math.max(-1, Math.min(1, this._buttonSteer));
    } else if (this.steerPointerId !== null) {
      steer = this.touchSteer;
    } else if (keySteer !== 0) {
      steer = Math.max(-1, Math.min(1, keySteer));
    } else if (padSteer !== 0) {
      steer = Math.max(-1, Math.min(1, padSteer));
    } else if (this.gyroEnabled) {
      steer = Math.max(-1, Math.min(1, this.gyroSteer));
    }

    // Fix: steer < 0 is LEFT, steer > 0 is RIGHT
    if (this.steerMode === 'buttons' && this._btnPointerId === null) {
      this.dpadLeftEl?.classList.toggle('is-gyro-lit', this.gyroEnabled && steer < -0.14);
      this.dpadRightEl?.classList.toggle('is-gyro-lit', this.gyroEnabled && steer > 0.14);
    } else if (!this.gyroEnabled) {
      this.dpadLeftEl?.classList.remove('is-gyro-lit');
      this.dpadRightEl?.classList.remove('is-gyro-lit');
    }

    if (this.steerPointerId === null && this.steerMode === 'joystick') {
      this._renderSteerVisual(steer);
    } else if (this.gyroEnabled) {
      this._renderGyroGauge(steer);
    }

    const keyDrift =
      this.keys.has('Space') ||
      this.keys.has('KeyK') ||
      this.keys.has('ShiftRight') ||
      this.keys.has('ControlRight');
    const keyUpHeld =
      this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('KeyZ');
    const countdownGasRev =
      this.racePhase === 'countdown' &&
      !this.autoAccel &&
      (this.gasPointers.size > 0 || keyUpHeld || padAccel);
    const drift = this.driftPointers.size > 0 || keyDrift || padDrift || countdownGasRev;

    const keyBrake =
      this.keys.has('ArrowDown') ||
      this.keys.has('KeyS') ||
      this.keys.has('ShiftLeft');
    const brake = this.brakePointers.size > 0 || keyBrake || padBrake;

    const accel = this.autoAccel ? true : this.gasPointers.size > 0 || keyUpHeld || padAccel;

    // Hold Shield detection (> 0.18s hold on shieldable item without swipe aim)
    // Locks shield on mobile so the player can lift their right thumb to tap Drift/Brake!
    const touchShieldHold = Boolean(
      canShield &&
        this._itemPointer !== null &&
        this._itemPointer.aim === 0 &&
        now - this._itemPointer.startTime > 180
    );
    if (touchShieldHold && !this._shieldLocked) {
      this._shieldLocked = true;
      this._shieldLockedOnCurrentPress = true;
      this.vibrate(14);
      this.itemBtnEl.classList.add('is-shield-locked', 'is-shielding');
      this.itemLabelEl.textContent = '🛡️ AUTO';
    }

    const keyShieldHold = Boolean(
      canShield &&
        this._keyItemDownAt !== null &&
        now - this._keyItemDownAt > 180
    );
    const padShieldHold = Boolean(
      canShield &&
        this._padItemDownAt !== null &&
        now - this._padItemDownAt > 180
    );
    const holdShield = Boolean(
      canShield && (this._shieldLocked || touchShieldHold || keyShieldHold || padShieldHold)
    );

    if (touchShieldHold || this._shieldLocked) {
      this.itemBtnEl.classList.add('is-shielding');
      this.itemLabelEl.textContent = this._shieldLocked ? '🛡️ AUTO' : '🛡️ BOUCLIER';
    }

    const useItem = this.useItemLatched;
    const itemAim = useItem ? this.latchedItemAim : 0;
    this.useItemLatched = false;
    this.latchedItemAim = 0;

    return {
      steer: Number(steer.toFixed(4)),
      drift,
      brake,
      accel,
      useItem,
      itemAim,
      holdShield,
    };
  }
}

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

export class TouchController {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.enabled = false;
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

    // Smart Item Gesture state (Tap / Swipe Aim / Hold Shield)
    this._currentHeldItem = null;
    this._itemPointer = null; // { id, startY, startTime, aim }
    this._keyItemDownAt = null;
    this.useItemLatched = false;
    this.latchedItemAim = 0;

    // Gyroscope state
    this.gyroEnabled = false;
    this.gyroSteer = 0;
    this._gyroListenerBound = false;

    // Keyboard state
    this.keys = new Set();

    // Cached visual state to avoid redundant DOM writes at 60fps
    this._lastDriftCharge = 0;
    this._lastDriftChargeRendered = -1;
    this._lastItemKey = '__init__';
    this._lastBoosting = false;
    this._lastShieldActive = false;
    this._lastAimPreview = 0;

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'pk-touch-layer is-hidden';
    this.el.setAttribute('aria-hidden', 'true');

    this.el.innerHTML = `
      <!-- Left Thumb Zone: Floating Auto-Centered Joystick OR Arcade ◀/▶ Buttons -->
      <div class="pk-steer-zone" data-role="steer-zone">
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
            <span class="pk-drift-ring"></span>
            <span class="pk-btn-drift-icon">💨</span>
            <span class="pk-btn-drift-label">DÉRAPE</span>
          </button>
        </div>
      </div>

      <!-- Subtle Desktop Keyboard Hint -->
      <div class="pk-desktop-hint">
        <span><kbd>◀</kbd><kbd>▶</kbd> / <kbd>Q</kbd><kbd>A</kbd>·<kbd>D</kbd> Tourner</span>
        <span><kbd>ESPACE</kbd> Déraper</span>
        <span><kbd>E</kbd> Objet (Maintenir = 🛡️, <kbd>▲</kbd>/<kbd>▼</kbd> Viser)</span>
        <span><kbd>1</kbd>-<kbd>4</kbd> Emotes</span>
      </div>
    `;

    this.rootEl.appendChild(this.el);

    this.steerZoneEl = this.el.querySelector('[data-role="steer-zone"]');
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
  }

  _bindEvents() {
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Steering Zone: Floating Joystick + D-Pad Buttons ---
    const onSteerDown = (e) => {
      if (!this.enabled) return;

      if (this.steerMode === 'buttons') {
        if (this._btnPointerId !== null) return;
        e.preventDefault();
        this._btnPointerId = e.pointerId;
        try {
          this.steerZoneEl.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic
        }
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
      }
      if (e.pointerId === this.steerPointerId) {
        this.steerPointerId = null;
        this.touchSteer = 0;
        this.steerPadEl.style.transform = 'translate3d(0, 0, 0)';
        this.steerPadEl.classList.remove('is-active');
        this._renderSteerVisual(0);
      }
    };

    this.steerZoneEl.addEventListener('pointerdown', onSteerDown);
    this.steerZoneEl.addEventListener('pointermove', onSteerMove);
    this.steerZoneEl.addEventListener('pointerup', onSteerEnd);
    this.steerZoneEl.addEventListener('pointercancel', onSteerEnd);
    this.steerZoneEl.addEventListener('lostpointercapture', onSteerEnd);

    // --- Drift Hold Button ---
    this._bindHoldButton(this.driftBtnEl, this.driftPointers);

    // --- Brake Hold Button ---
    this._bindHoldButton(this.brakeBtnEl, this.brakePointers);

    // --- Manual Gas Hold Button (when autoAccel === false) ---
    this._bindHoldButton(this.gasBtnEl, this.gasPointers);

    // --- Smart Item Button: Tap, Swipe Up/Down Aim, or Hold >0.18s Shield ---
    const onItemDown = (e) => {
      if (!this.enabled || this._itemPointer !== null) return;
      e.preventDefault();
      this._itemPointer = {
        id: e.pointerId,
        startY: e.clientY,
        startTime: performance.now(),
        aim: 0,
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
      this._itemPointer = null;
      this.useItemLatched = true;
      this.latchedItemAim = finalAim;
      this.itemBtnEl.classList.remove('is-pressed', 'is-shielding', 'is-tapped');
      this._setAimPreviewVisual(0);
      void this.itemBtnEl.offsetWidth;
      this.itemBtnEl.classList.add('is-tapped');
    };

    this.itemBtnEl.addEventListener('pointerdown', onItemDown);
    this.itemBtnEl.addEventListener('pointermove', onItemMove);
    this.itemBtnEl.addEventListener('pointerup', onItemEnd);
    this.itemBtnEl.addEventListener('pointercancel', onItemEnd);
    this.itemBtnEl.addEventListener('lostpointercapture', onItemEnd);

    // Allow tapping HUD top-center item box to fire item (aim = 0)
    this._onExternalItemTap = () => {
      if (this.enabled) {
        this.useItemLatched = true;
        this.latchedItemAim = 0;
        this.vibrate(12);
      }
    };
    window.addEventListener('pocketkart:use-item', this._onExternalItemTap);

    // --- Gyroscope Orientation Handler ---
    this._onDeviceOrientation = (e) => {
      if (!this.gyroEnabled || !this.enabled) return;
      const beta = Number(e.beta);
      const gamma = Number(e.gamma);
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

      const rawAngle =
        window.screen?.orientation?.angle ??
        (typeof window.orientation === 'number' ? window.orientation : 0);
      const angle = ((rawAngle % 360) + 360) % 360;

      let tiltDeg = 0;
      if (angle === 90) tiltDeg = beta;
      else if (angle === 270) tiltDeg = -beta;
      else if (angle === 180) tiltDeg = -gamma;
      else tiltDeg = gamma;

      const maxDeg = 25;
      const rawNorm = Math.max(-1, Math.min(1, tiltDeg / maxDeg));
      const abs = Math.abs(rawNorm);
      const deadzone = 0.08;
      let target = 0;
      if (abs > deadzone) {
        const v = (abs - deadzone) / (1 - deadzone);
        target = Math.sign(rawNorm) * Math.pow(v, 1.2);
      }

      this.gyroSteer += (target - this.gyroSteer) * 0.35;
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
  }

  _bindHoldButton(btnEl, pointerSet) {
    const onDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      pointerSet.add(e.pointerId);
      try {
        btnEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      btnEl.classList.add('is-pressed');
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
    if (upHeld && (this._currentHeldItem === 'banana' || this._currentHeldItem === ITEMS.BANANA)) {
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
  }

  _syncCaption() {
    if (!this.steerCaptionEl) return;
    const base = this.steerMode === 'buttons' ? 'BOUTONS ◀ ▶' : 'JOYSTICK FLOTTANT';
    this.steerCaptionEl.textContent = this.gyroEnabled ? `${base} • GYRO 📱` : base;
  }

  _clearTransientInputs() {
    this.touchSteer = 0;
    this.gyroSteer = 0;
    this._btnDir = 0;
    this._btnPointerId = null;
    this._buttonSteer = 0;
    this.steerPointerId = null;
    this.driftPointers.clear();
    this.brakePointers.clear();
    this.gasPointers.clear();
    this._itemPointer = null;
    this._keyItemDownAt = null;
    this.keys.clear();
    this.useItemLatched = false;
    this.latchedItemAim = 0;

    if (this.steerPadEl) {
      this.steerPadEl.style.transform = 'translate3d(0, 0, 0)';
      this.steerPadEl.classList.remove('is-active');
    }
    this.dpadLeftEl?.classList.remove('is-pressed');
    this.dpadRightEl?.classList.remove('is-pressed');
    this.driftBtnEl?.classList.remove('is-pressed');
    this.brakeBtnEl?.classList.remove('is-pressed');
    this.gasBtnEl?.classList.remove('is-pressed');
    this.itemBtnEl?.classList.remove('is-pressed', 'is-shielding');
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

  vibrate(pattern = 15) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration permission restrictions
    }
  }

  async setGyroEnabled(enabled) {
    const want = Boolean(enabled);
    if (!want) {
      this.gyroEnabled = false;
      this.gyroSteer = 0;
      if (this._gyroListenerBound) {
        window.removeEventListener('deviceorientation', this._onDeviceOrientation);
        this._gyroListenerBound = false;
      }
      this._syncCaption();
      return false;
    }

    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
      this.gyroEnabled = false;
      return false;
    }

    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await window.DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          this.gyroEnabled = false;
          return false;
        }
      } catch {
        this.gyroEnabled = false;
        return false;
      }
    }

    this.gyroEnabled = true;
    if (!this._gyroListenerBound) {
      window.addEventListener('deviceorientation', this._onDeviceOrientation, { passive: true });
      this._gyroListenerBound = true;
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
    this._lastPollMs = performance.now();
    if (!next) {
      this._clearTransientInputs();
      this._lastDriftCharge = 0;
      this._lastBoosting = false;
      this._lastShieldActive = false;
    }
  }

  setAutoAccel(enabled) {
    this.autoAccel = Boolean(enabled);
    if (this.gasBtnEl) {
      this.gasBtnEl.classList.toggle('is-hidden', this.autoAccel);
    }
  }

  /**
   * Updates thumb-zone button visuals + shield ring + subtle haptic pulses at 60fps.
   */
  updateVisualState({
    driftCharge = 0,
    item = null,
    itemRouletteTimer = 0,
    boosting = false,
    shieldItem = null,
  } = {}) {
    this._currentHeldItem = itemRouletteTimer > 0 ? null : item;

    const charge = Math.max(0, Math.min(3, Math.floor(driftCharge || 0)));
    if (this.enabled && charge > this._lastDriftCharge) {
      if (charge === 1) this.vibrate(10);
      else if (charge === 2) this.vibrate(16);
      else if (charge === 3) this.vibrate([18, 22, 24]);
    }
    this._lastDriftCharge = charge;

    if (charge !== this._lastDriftChargeRendered) {
      this.driftBtnEl.classList.remove('charge-0', 'charge-1', 'charge-2', 'charge-3');
      this.driftBtnEl.classList.add(`charge-${charge}`);
      this._lastDriftChargeRendered = charge;
    }

    const isBoost = Boolean(boosting);
    if (isBoost !== this._lastBoosting) {
      if (this.enabled && isBoost) {
        this.vibrate(22);
      }
      this.driftBtnEl.classList.toggle('is-boosting', isBoost);
      this._lastBoosting = isBoost;
    }

    const shieldActive = Boolean(shieldItem);
    if (shieldActive !== this._lastShieldActive) {
      this.itemBtnEl.classList.toggle('is-shielding', shieldActive);
      this._lastShieldActive = shieldActive;
    }

    if (itemRouletteTimer > 0) {
      const idx = Math.floor(performance.now() / 75) % ROULETTE_ICONS.length;
      const key = `roulette:${idx}`;
      if (key !== this._lastItemKey) {
        this.itemIconEl.textContent = ROULETTE_ICONS[idx];
        this.itemLabelEl.textContent = 'TIRAGE…';
        this.itemBtnEl.classList.remove('is-empty', 'has-item', 'is-shieldable');
        this.itemBtnEl.classList.add('is-roulette');
        this._lastItemKey = key;
      }
      return;
    }

    const meta = item ? ITEM_META[item] : null;
    const isShieldable = Boolean(item && SHIELDABLE_ITEMS.has(item));
    const itemKey = meta ? `item:${item}:${shieldActive ? 1 : 0}` : 'empty';

    if (itemKey !== this._lastItemKey) {
      this.itemBtnEl.classList.remove('is-roulette');
      if (meta) {
        this.itemIconEl.textContent = meta.icon;
        this.itemLabelEl.textContent = shieldActive ? '🛡️ BOUCLIER' : meta.label;
        this.itemBtnEl.classList.remove('is-empty');
        this.itemBtnEl.classList.add('has-item');
        this.itemBtnEl.classList.toggle('is-shieldable', isShieldable);
      } else {
        this.itemIconEl.textContent = '🎁';
        this.itemLabelEl.textContent = 'OBJET';
        this.itemBtnEl.classList.remove('has-item', 'is-shieldable');
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
    } else if (this.gyroEnabled) {
      steer = Math.max(-1, Math.min(1, this.gyroSteer));
    }

    if (this.steerPointerId === null && this.steerMode === 'joystick') {
      this._renderSteerVisual(steer);
    }

    const keyDrift = this.keys.has('Space') || this.keys.has('KeyK');
    const drift = this.driftPointers.size > 0 || keyDrift;

    const keyBrake =
      this.keys.has('ArrowDown') ||
      this.keys.has('KeyS') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight');
    const brake = this.brakePointers.size > 0 || keyBrake;

    const keyUpHeld =
      this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('KeyZ');
    const accel = this.autoAccel ? true : this.gasPointers.size > 0 || keyUpHeld;

    // Hold Shield detection (> 0.18s hold on shieldable item without swipe aim)
    const canShield = Boolean(this._currentHeldItem && SHIELDABLE_ITEMS.has(this._currentHeldItem));
    const touchShieldHold = Boolean(
      canShield &&
        this._itemPointer !== null &&
        this._itemPointer.aim === 0 &&
        now - this._itemPointer.startTime > 180
    );
    const keyShieldHold = Boolean(
      canShield &&
        this._keyItemDownAt !== null &&
        now - this._keyItemDownAt > 180
    );
    const holdShield = touchShieldHold || keyShieldHold;

    if (touchShieldHold) {
      this.itemBtnEl.classList.add('is-shielding');
      this.itemLabelEl.textContent = '🛡️ BOUCLIER';
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

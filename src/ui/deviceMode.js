/**
 * Reactive Device Mode Detector (Mobile vs Desktop PC) for PocketKart 3D.
 * Distinguishes phones/tablets/mobile emulation from desktop/laptop PCs (even touch laptops),
 * toggling `is-mobile` / `is-desktop` root classes and notifying subscribers cleanly.
 */

const subscribers = new Set();
let initialized = false;
let currentMode = 'desktop';
let activeInputOverride = null; // null | 'mobile' | 'desktop'
let coarseNoHoverQuery = null;
let anyCoarseQuery = null;
let finePointerQuery = null;

// Screen Wake Lock state (prevents screen dimming/locking during gyroscope play)
let wakeLockSentinel = null;
let wakeLockDesired = false;
let wakeLockRequestInFlight = false;

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return Boolean(
    navigator.platform === 'MacIntel' &&
      (navigator.maxTouchPoints || 0) > 1 &&
      !window.matchMedia?.('(pointer: fine)').matches
  );
}

async function acquireWakeLockInternal() {
  if (!wakeLockDesired || wakeLockRequestInFlight) return false;
  if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  if (wakeLockSentinel && !wakeLockSentinel.released) return true;

  wakeLockRequestInFlight = true;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (!wakeLockDesired) {
      sentinel.release?.().catch?.(() => {});
      return false;
    }
    wakeLockSentinel = sentinel;
    sentinel.addEventListener?.('release', () => {
      if (wakeLockSentinel === sentinel) {
        wakeLockSentinel = null;
      }
    });
    return true;
  } catch {
    return false;
  } finally {
    wakeLockRequestInFlight = false;
  }
}

export async function requestScreenWakeLock() {
  wakeLockDesired = true;
  return acquireWakeLockInternal();
}

export async function releaseScreenWakeLock() {
  wakeLockDesired = false;
  const current = wakeLockSentinel;
  wakeLockSentinel = null;
  if (current && !current.released) {
    try {
      await current.release();
    } catch {
      // Ignore release errors
    }
  }
}

export function isWakeLockActive() {
  return Boolean(wakeLockSentinel && !wakeLockSentinel.released);
}

export async function lockLandscapeOrientation() {
  if (typeof window === 'undefined') return false;
  const orientation = window.screen?.orientation;
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock('landscape');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function unlockOrientation() {
  if (typeof window === 'undefined') return;
  try {
    window.screen?.orientation?.unlock?.();
  } catch {
    // Ignore unlock errors
  }
}

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    if (navigator.userAgentData.mobile) return true;
  }
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) {
    return true;
  }
  // iPadOS Safari reports Macintosh + touchpoints without fine mouse pointer
  const isIPadOS =
    navigator.platform === 'MacIntel' &&
    (navigator.maxTouchPoints || 0) > 1 &&
    !window.matchMedia?.('(pointer: fine)').matches;
  return Boolean(isIPadOS);
}

export function detectNativeMobileEnvironment() {
  if (typeof window === 'undefined') return false;

  if (isMobileUserAgent()) {
    return true;
  }

  const coarseNoHover = Boolean(
    window.matchMedia?.('(pointer: coarse) and (hover: none)')?.matches
  );
  if (coarseNoHover) {
    return true;
  }

  const anyCoarse = Boolean(window.matchMedia?.('(any-pointer: coarse)')?.matches);
  const finePrimary = Boolean(window.matchMedia?.('(pointer: fine)')?.matches);
  if (window.innerWidth <= 900 && anyCoarse && !finePrimary) {
    return true;
  }

  return false;
}

function applyRootClasses(mode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('is-mobile', mode === 'mobile');
  root.classList.toggle('is-desktop', mode === 'desktop');
  root.dataset.device = mode;
}

function setMode(nextMode) {
  const clean = nextMode === 'mobile' ? 'mobile' : 'desktop';
  const changed = clean !== currentMode;
  currentMode = clean;
  applyRootClasses(currentMode);
  if (changed) {
    for (const cb of subscribers) {
      try {
        cb(currentMode);
      } catch {
        // Ignore subscriber listener errors
      }
    }
  }
}

function recomputeMode() {
  if (detectNativeMobileEnvironment()) {
    activeInputOverride = null;
    setMode('mobile');
    return;
  }
  setMode(activeInputOverride || 'desktop');
}

function bindListenersOnce() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  currentMode = detectNativeMobileEnvironment() ? 'mobile' : 'desktop';
  applyRootClasses(currentMode);

  if (typeof window.matchMedia === 'function') {
    coarseNoHoverQuery = window.matchMedia('(pointer: coarse) and (hover: none)');
    anyCoarseQuery = window.matchMedia('(any-pointer: coarse)');
    finePointerQuery = window.matchMedia('(pointer: fine)');

    const onMediaChange = () => recomputeMode();
    coarseNoHoverQuery.addEventListener?.('change', onMediaChange);
    anyCoarseQuery.addEventListener?.('change', onMediaChange);
    finePointerQuery.addEventListener?.('change', onMediaChange);
  }

  window.addEventListener('resize', () => recomputeMode(), { passive: true });

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') {
        activeInputOverride = 'mobile';
        setMode('mobile');
      } else if (e.pointerType === 'mouse' && !detectNativeMobileEnvironment()) {
        activeInputOverride = 'desktop';
        setMode('desktop');
      }
      if (wakeLockDesired && (!wakeLockSentinel || wakeLockSentinel.released)) {
        acquireWakeLockInternal();
      }
    },
    { passive: true, capture: true }
  );

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && wakeLockDesired) {
        acquireWakeLockInternal();
      }
    });
  }

  // Block iOS Safari pinch-to-zoom gestures during multi-touch gameplay
  const blockPinchGesture = (e) => {
    if (e.cancelable) {
      e.preventDefault();
    }
  };
  window.addEventListener('gesturestart', blockPinchGesture, { passive: false });
  window.addEventListener('gesturechange', blockPinchGesture, { passive: false });
  window.addEventListener('gestureend', blockPinchGesture, { passive: false });

  // Block parasitic long-press context menu outside text inputs
  window.addEventListener(
    'contextmenu',
    (e) => {
      const target = e.target;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    },
    { capture: true }
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if (
        (e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight') &&
        !detectNativeMobileEnvironment()
      ) {
        activeInputOverride = 'desktop';
        setMode('desktop');
      }
    },
    { passive: true, capture: true }
  );
}

bindListenersOnce();

export function getDeviceMode() {
  bindListenersOnce();
  return currentMode;
}

export function isMobileMode() {
  return getDeviceMode() === 'mobile';
}

export function supportsMobileGyro() {
  return Boolean(
    isMobileMode() && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  );
}

export function onDeviceModeChange(callback) {
  bindListenersOnce();
  if (typeof callback !== 'function') return () => {};
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

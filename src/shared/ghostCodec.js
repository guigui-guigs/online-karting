import { RACERS, TRACKS } from './constants.js';

export const GHOST_SAMPLE_INTERVAL_MS = 250;
export const MAX_GHOST_FRAMES = 960; // Up to 4 minutes of 250ms samples

const VALID_RACER_IDS = new Set(RACERS.map((r) => r.id));
const VALID_BASE_TRACK_IDS = new Set(TRACKS.map((t) => t.id));

function normalizeValidTrackId(rawTrackId) {
  const clean = String(rawTrackId || 'coco').trim().slice(0, 32);
  if (clean.endsWith('__mirror')) {
    const base = clean.slice(0, -'__mirror'.length);
    if (VALID_BASE_TRACK_IDS.has(base)) {
      return `${base}__mirror`;
    }
  }
  if (clean.endsWith('_mirror')) {
    const base = clean.slice(0, -'_mirror'.length);
    if (VALID_BASE_TRACK_IDS.has(base)) {
      return `${base}__mirror`;
    }
  }
  if (VALID_BASE_TRACK_IDS.has(clean)) {
    return clean;
  }
  return TRACKS[0]?.id || 'coco';
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
  let base64;
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    base64 = globalThis.btoa(binary);
  } else {
    base64 = Buffer.from(bytes).toString('base64');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64url) {
  const clean = String(b64url || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(clean + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(clean + pad, 'base64'));
}

/**
 * Encodes a quantized ghost run into a compact URL-safe `<header>.<frames>` token.
 * Spatial precision: 0.1u (Int16), Angular precision: 0.001 rad (Int16).
 */
export function encodeGhostChallenge(run) {
  if (!run || !Array.isArray(run.frames) || run.frames.length < 2) {
    throw new Error('Course fantôme trop courte pour générer un défi.');
  }

  const headerObj = {
    v: 1,
    n: String(run.name || 'Pilote').slice(0, 14),
    r: VALID_RACER_IDS.has(run.racerId) ? run.racerId : 'red',
    k: normalizeValidTrackId(run.trackId),
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
 * Decodes a `<header>.<frames>` ghost token into an interpolatable 60fps ghost object.
 */
export function decodeGhostChallenge(token) {
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

    const trackId = normalizeValidTrackId(header.k);
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

/**
 * Interpolates a decoded ghost pose at a given race timestamp (ms).
 */
export function interpolateGhostPose(ghost, raceTimeMs) {
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

import * as THREE from 'three';
import { RACE_CONFIG } from '../shared/constants.js';
import {
  getTrackSample,
  getTrackSamples,
  getTrackMeta,
  getBaseTrackId,
  isArenaTrack,
  ARENA_DATA,
} from '../shared/trackData.js';

/**
 * Push a quad (two triangles) oriented so its geometric normal aligns with (ox, oy, oz).
 */
function pushOrientedQuad(indices, positions, i0, i1, j0, j1, ox = 0, oy = 1, oz = 0) {
  const ax = positions[i0 * 3];
  const ay = positions[i0 * 3 + 1];
  const az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3];
  const by = positions[i1 * 3 + 1];
  const bz = positions[i1 * 3 + 2];
  const cx = positions[j0 * 3];
  const cy = positions[j0 * 3 + 1];
  const cz = positions[j0 * 3 + 2];

  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;

  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;

  if (nx * ox + ny * oy + nz * oz >= 0) {
    indices.push(i0, i1, j0, i1, j1, j0);
  } else {
    indices.push(i0, j0, i1, i1, j0, j1);
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isInsidePolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function createSkyTexture(trackId) {
  const baseId = getBaseTrackId(trackId);
  const canvas = document.createElement('canvas');
  canvas.width = baseId === 'rainbow' ? 512 : 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (baseId === 'neon' || baseId === 'arena') {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#040210');
    grad.addColorStop(0.28, '#120732');
    grad.addColorStop(0.46, '#3b096c');
    grad.addColorStop(0.51, '#f72585');
    grad.addColorStop(0.56, '#00bbf9');
    grad.addColorStop(0.65, '#09051c');
    grad.addColorStop(1.0, '#040210');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 512);

    const rng = mulberry32(8080);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 90; i++) {
      ctx.fillRect(rng() * canvas.width, rng() * 210, 1.5, 1.5);
    }
  } else if (baseId === 'polar') {
    // 'polar' Aurora twilight + frosty glacier sky
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#04142c');
    grad.addColorStop(0.28, '#0c3559');
    grad.addColorStop(0.46, '#22d3ee');
    grad.addColorStop(0.52, '#a5f3fc');
    grad.addColorStop(0.62, '#38bdf8');
    grad.addColorStop(1.0, '#0c4a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 512);
    const rng = mulberry32(1225);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 80; i++) ctx.fillRect(rng() * canvas.width, rng() * 200, 1.5, 1.5);
  } else if (baseId === 'pinball') {
    // 'pinball' Deep arcade cabinet magenta-indigo sky
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#120329');
    grad.addColorStop(0.32, '#2d0c59');
    grad.addColorStop(0.48, '#a855f7');
    grad.addColorStop(0.54, '#f43f5e');
    grad.addColorStop(1.0, '#0f0424');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 512);
  } else if (baseId === 'volcano') {
    // 'volcano' Crimson caldera twilight
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#1a0605');
    grad.addColorStop(0.26, '#4c0f0a');
    grad.addColorStop(0.45, '#dc2626');
    grad.addColorStop(0.52, '#fb923c');
    grad.addColorStop(0.65, '#450a0a');
    grad.addColorStop(1.0, '#1c0503');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 512);
  } else if (baseId === 'rainbow') {
    // Full 360 cosmic nebula + starfield above & below!
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#050216');
    grad.addColorStop(0.25, '#17093a');
    grad.addColorStop(0.48, '#381068');
    grad.addColorStop(0.54, '#1b1452');
    grad.addColorStop(0.78, '#0c0628');
    grad.addColorStop(1.0, '#040112');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const rng = mulberry32(31415);
    const nebulaColors = [
      'rgba(247, 37, 133, 0.16)',
      'rgba(0, 187, 249, 0.16)',
      'rgba(131, 56, 236, 0.18)',
      'rgba(0, 245, 212, 0.12)',
    ];
    for (let i = 0; i < 28; i++) {
      const nx = rng() * 512;
      const ny = rng() * 512;
      const nr = 36 + rng() * 88;
      const ng = ctx.createRadialGradient(nx, ny, 4, nx, ny, nr);
      ng.addColorStop(0, nebulaColors[i % nebulaColors.length]);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, 512, 512);
    }

    for (let i = 0; i < 420; i++) {
      const sx = rng() * 512;
      const sy = rng() * 512;
      const sz = rng() > 0.88 ? 2.4 : 1.3;
      ctx.fillStyle = rng() > 0.7 ? '#fff3b0' : rng() > 0.4 ? '#bae6fd' : '#ffffff';
      ctx.fillRect(sx, sy, sz, sz);
    }
  } else {
    // 'coco' Sunny tropical sky
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#0c6cf2');
    grad.addColorStop(0.24, '#25a4ff');
    grad.addColorStop(0.45, '#6cd8ff');
    grad.addColorStop(0.51, '#fff3b8');
    grad.addColorStop(0.56, '#ffd28a');
    grad.addColorStop(1.0, '#38bdf8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSynthwaveSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 16, 0, 240);
  grad.addColorStop(0.0, '#fff066');
  grad.addColorStop(0.45, '#ff5400');
  grad.addColorStop(1.0, '#f72585');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.fill();

  // Retro synthwave horizontal scanline cutouts in lower half
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) {
    const y = 138 + i * 17;
    const h = 3 + i * 1.6;
    ctx.fillRect(0, y, 256, h);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawRacingLineWear(ctx, darkColor, highlightColor, count = 2) {
  // Seamless longitudinal racing-line rubber grooves (wraps cleanly at y=0 / y=512)
  const lanes = count === 2 ? [168, 344] : [256];
  for (let l = 0; l < lanes.length; l++) {
    const cx = lanes[l];
    ctx.save();
    ctx.lineCap = 'round';
    // Soft outer tire wear band
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 54;
    ctx.beginPath();
    for (let y = 0; y <= 512; y += 16) {
      const wave = Math.sin((y / 512) * Math.PI * 2 + l * 1.1) * 7;
      if (y === 0) ctx.moveTo(cx + wave, y);
      else ctx.lineTo(cx + wave, y);
    }
    ctx.stroke();

    // Inner concentrated tire groove
    ctx.lineWidth = 22;
    ctx.beginPath();
    for (let y = 0; y <= 512; y += 16) {
      const wave = Math.sin((y / 512) * Math.PI * 2 + l * 1.1) * 7;
      if (y === 0) ctx.moveTo(cx + wave, y);
      else ctx.lineTo(cx + wave, y);
    }
    ctx.stroke();

    if (highlightColor) {
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let y = 0; y <= 512; y += 16) {
        const wave = Math.sin((y / 512) * Math.PI * 2 + l * 1.1) * 7;
        if (y === 0) ctx.moveTo(cx + wave - 16, y);
        else ctx.lineTo(cx + wave - 16, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function createRoadTexture(trackId) {
  const baseId = getBaseTrackId(trackId);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (baseId === 'neon') {
    ctx.fillStyle = '#121528';
    ctx.fillRect(0, 0, 512, 512);

    const rng = mulberry32(2049);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(0, 245, 212, 0.035)' : 'rgba(6, 8, 20, 0.18)';
      ctx.fillRect(rng() * 512, rng() * 512, 2, 2);
    }

    // Subtle cyber grid lines on dark wet asphalt
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.09)';
    ctx.lineWidth = 2;
    for (let x = 64; x < 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Glossy racing-line rubber streaks on wet asphalt
    drawRacingLineWear(ctx, 'rgba(4, 6, 18, 0.34)', 'rgba(0, 245, 212, 0.08)');

    // Glowing hot-pink edge lines
    ctx.fillStyle = '#f72585';
    ctx.fillRect(20, 0, 12, 512);
    ctx.fillRect(480, 0, 12, 512);

    // Glowing cyan dashed center line
    ctx.fillStyle = '#00f5d4';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  } else if (baseId === 'polar') {
    // 'polar' Frosted packed-snow & glacier highway
    ctx.fillStyle = '#cbe7f8';
    ctx.fillRect(0, 0, 512, 512);
    const rng = mulberry32(9012);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.32)' : 'rgba(56,189,248,0.16)';
      ctx.fillRect(rng() * 512, rng() * 512, 3, 3);
    }
    // Packed snow / ice tire ruts along racing line
    drawRacingLineWear(ctx, 'rgba(14, 116, 144, 0.14)', 'rgba(255, 255, 255, 0.35)');
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(20, 0, 14, 512);
    ctx.fillRect(478, 0, 14, 512);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  } else if (baseId === 'pinball') {
    // 'pinball' Lacquered purple arcade table lane
    ctx.fillStyle = '#241046';
    ctx.fillRect(0, 0, 512, 512);
    const rng = mulberry32(5522);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(250, 204, 21, 0.04)' : 'rgba(10, 4, 24, 0.14)';
      ctx.fillRect(rng() * 512, rng() * 512, 2, 2);
    }
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.16)';
    ctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(256, y + 32);
      ctx.lineTo(472, y);
      ctx.stroke();
    }
    drawRacingLineWear(ctx, 'rgba(12, 4, 28, 0.28)', 'rgba(250, 204, 21, 0.09)');
    ctx.fillStyle = '#facc15';
    ctx.fillRect(18, 0, 14, 512);
    ctx.fillRect(480, 0, 14, 512);
    ctx.fillStyle = '#e879f9';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  } else if (baseId === 'volcano') {
    // 'volcano' Dark volcanic basalt rock with glowing ember cracks & soot grooves
    ctx.fillStyle = '#2a1c19';
    ctx.fillRect(0, 0, 512, 512);
    const rng = mulberry32(6661);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = rng() > 0.45 ? 'rgba(15, 8, 6, 0.22)' : 'rgba(251, 146, 60, 0.045)';
      ctx.fillRect(rng() * 512, rng() * 512, 2, 2);
    }
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.36)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      const sx = 40 + rng() * 432;
      const sy = rng() * 512;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * 80, sy + 40);
      ctx.stroke();
    }
    drawRacingLineWear(ctx, 'rgba(12, 6, 4, 0.34)', 'rgba(249, 115, 22, 0.1)');
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(20, 0, 12, 512);
    ctx.fillRect(480, 0, 12, 512);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  } else if (baseId === 'rainbow') {
    // Vivid 7-band Mario-Kart style rainbow highway + cosmic tile shimmer & stars!
    const bands = ['#ff2e63', '#ff7a00', '#ffd600', '#00e676', '#00bbf9', '#5e60ce', '#b5179e'];
    const bandW = (512 - 56) / bands.length;
    for (let b = 0; b < bands.length; b++) {
      ctx.fillStyle = bands[b];
      ctx.fillRect(28 + b * bandW, 0, bandW + 1, 512);
    }

    const cols = 8;
    const rows = 8;
    const cw = 512 / cols;
    const ch = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(20,10,55,0.14)';
        ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
      }
    }

    drawRacingLineWear(ctx, 'rgba(15, 10, 42, 0.12)', 'rgba(255, 255, 255, 0.22)');

    // Twinkling starlight flecks across the track
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let s = 0; s < 26; s++) {
      const sx = ((s * 97 + 41) % 440) + 36;
      const sy = (s * 73 + 19) % 500;
      ctx.fillRect(sx, sy, 4, 4);
    }

    // Golden starlight border rails
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(10, 0, 18, 512);
    ctx.fillRect(484, 0, 18, 512);
  } else {
    // 'coco' Rich sunshine-arcade slate asphalt with multi-scale grain & racing-line rubber
    ctx.fillStyle = '#363b4e';
    ctx.fillRect(0, 0, 512, 512);

    const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
    grooveGrad.addColorStop(0.0, 'rgba(20, 24, 36, 0.28)');
    grooveGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.03)');
    grooveGrad.addColorStop(0.5, 'rgba(18, 22, 34, 0.14)');
    grooveGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.03)');
    grooveGrad.addColorStop(1.0, 'rgba(20, 24, 36, 0.28)');
    ctx.fillStyle = grooveGrad;
    ctx.fillRect(0, 0, 512, 512);

    const rng = mulberry32(4242);
    for (let i = 0; i < 3200; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const sz = rng() > 0.85 ? 3 : 2;
      ctx.fillStyle = rng() > 0.48 ? 'rgba(255,255,255,0.045)' : 'rgba(10,12,20,0.12)';
      ctx.fillRect(x, y, sz, sz);
    }

    // Rubber tire-wear grooves on the racing line + subtle micro-skids
    drawRacingLineWear(ctx, 'rgba(12, 14, 22, 0.26)', 'rgba(255, 255, 255, 0.04)');
    ctx.strokeStyle = 'rgba(12, 14, 22, 0.16)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const sx = 90 + rng() * 332;
      const sy = rng() * 440;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * 18, sy + 28 + rng() * 36);
      ctx.stroke();
    }

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(22, 0, 10, 512);
    ctx.fillRect(480, 0, 10, 512);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function createCheckeredLineTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const cols = 16;
  const rows = 4;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#181824';
      ctx.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
    }
  }

  ctx.fillStyle = '#ffd166';
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 122, 512, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createGantryBannerTexture(trackId) {
  const baseId = getBaseTrackId(trackId);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 1024, 256);
  if (baseId === 'neon') {
    bg.addColorStop(0.0, '#7209b7');
    bg.addColorStop(0.5, '#f72585');
    bg.addColorStop(1.0, '#3a0ca3');
  } else if (baseId === 'polar') {
    bg.addColorStop(0.0, '#0284c7');
    bg.addColorStop(0.5, '#38bdf8');
    bg.addColorStop(1.0, '#0369a1');
  } else if (baseId === 'pinball') {
    bg.addColorStop(0.0, '#9333ea');
    bg.addColorStop(0.5, '#facc15');
    bg.addColorStop(1.0, '#db2777');
  } else if (baseId === 'volcano') {
    bg.addColorStop(0.0, '#b91c1c');
    bg.addColorStop(0.5, '#f97316');
    bg.addColorStop(1.0, '#7c2d12');
  } else if (baseId === 'rainbow') {
    bg.addColorStop(0.0, '#ff2a54');
    bg.addColorStop(0.33, '#ffbe0b');
    bg.addColorStop(0.66, '#00f5d4');
    bg.addColorStop(1.0, '#8338ec');
  } else {
    bg.addColorStop(0.0, '#ff2a54');
    bg.addColorStop(0.5, '#ff9e00');
    bg.addColorStop(1.0, '#ff2a54');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);

  const sq = 32;
  for (let c = 0; c < 1024 / sq; c++) {
    ctx.fillStyle = c % 2 === 0 ? '#ffffff' : '#1e2235';
    ctx.fillRect(c * sq, 0, sq, 28);
    ctx.fillStyle = (c + 1) % 2 === 0 ? '#ffffff' : '#1e2235';
    ctx.fillRect(c * sq, 228, sq, 28);
  }

  ctx.fillStyle = 'rgba(15, 20, 48, 0.9)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(76, 44, 872, 168, 42);
  } else {
    ctx.rect(76, 44, 872, 168);
  }
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = baseId === 'neon' ? '#00f5d4' : '#ffd166';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 74px "Fredoka", "Nunito", "Arial Rounded MT Bold", sans-serif';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#0f172a';
  ctx.strokeText('★ POCKET KART ★', 512, 118);

  const txtGrad = ctx.createLinearGradient(0, 72, 0, 164);
  txtGrad.addColorStop(0, '#ffffff');
  txtGrad.addColorStop(0.55, '#ffe66d');
  txtGrad.addColorStop(1, baseId === 'neon' ? '#00f5d4' : '#ff9f1c');
  ctx.fillStyle = txtGrad;
  ctx.fillText('★ POCKET KART ★', 512, 118);

  const subtitles = {
    coco: 'ÎLE COCO • SUNSHINE LAGOON',
    polar: 'PIC POLAIRE • GLACIER AURORA',
    neon: 'NÉON DRIFT • CYBER TOKYO',
    pinball: 'FLIPPER ARCADE • SUPER BUMPERS',
    volcano: 'VOLCAN MAGMA • CALDEIRA',
    rainbow: 'ROUTE CÉLESTE • RAINBOW SKY',
  };
  ctx.font = '800 28px "Nunito", sans-serif';
  ctx.fillStyle = baseId === 'neon' ? '#ff70a6' : '#56f0ff';
  ctx.fillText(subtitles[baseId] || subtitles.coco, 512, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createBoostPadTexture(colors = ['#00f5d4', '#ffe600', '#ff2a85'], bgHex = '#140b2e') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 512);

  const railGrad = ctx.createLinearGradient(0, 0, 256, 0);
  railGrad.addColorStop(0.0, colors[0]);
  railGrad.addColorStop(0.09, bgHex);
  railGrad.addColorStop(0.91, bgHex);
  railGrad.addColorStop(1.0, colors[0]);
  ctx.fillStyle = railGrad;
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 3; i++) {
    const baseY = 110 + i * 165;
    ctx.save();
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 22;
    ctx.fillStyle = colors[i % colors.length];

    ctx.beginPath();
    ctx.moveTo(128, baseY - 78);
    ctx.lineTo(226, baseY + 18);
    ctx.lineTo(226, baseY + 64);
    ctx.lineTo(128, baseY - 26);
    ctx.lineTo(30, baseY + 64);
    ctx.lineTo(30, baseY + 18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(46, baseY + 34);
    ctx.lineTo(128, baseY - 46);
    ctx.lineTo(210, baseY + 34);
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createWaterRippleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(0, 0, 256, 256);

  const rng = mulberry32(9001);
  ctx.strokeStyle = 'rgba(186, 250, 255, 0.34)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const rx = 18 + rng() * 28;
    const ry = 8 + rng() * 14;
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, rng() * 0.6 - 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  for (let i = 0; i < 36; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + rng() * 10, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(34, 34);
  return tex;
}

function createNeonGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#070418';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(247, 37, 133, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 252);

  ctx.strokeStyle = 'rgba(0, 245, 212, 0.24)';
  ctx.lineWidth = 2;
  for (let k = 64; k < 256; k += 64) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 256);
    ctx.moveTo(0, k);
    ctx.lineTo(256, k);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(64, 64);
  return tex;
}

function createCyberWindowsTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0d1e';
  ctx.fillRect(0, 0, 128, 256);

  const rng = mulberry32(2077);
  const winColors = ['#00f5d4', '#f72585', '#ffbe0b', '#38bdf8', '#b5179e'];
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 6; c++) {
      if (rng() > 0.36) {
        ctx.fillStyle = winColors[Math.floor(rng() * winColors.length)];
        ctx.fillRect(8 + c * 19, 8 + r * 15, 12, 8);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createTurnChevronTexture(turnDir = 1, trackId = 'coco') {
  const baseId = getBaseTrackId(trackId);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // High-contrast arcade sign housing
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 256);

  const borderCol = baseId === 'neon' ? '#00f5d4' : '#ffbe0b';
  ctx.lineWidth = 16;
  ctx.strokeStyle = borderCol;
  ctx.strokeRect(8, 8, 496, 240);

  // 3 bold glowing directional chevrons (turnDir > 0 => '>>>' right, turnDir < 0 => '<<<' left)
  const arrowColors =
    baseId === 'neon'
      ? ['#00f5d4', '#ffbe0b', '#f72585']
      : ['#ffe600', '#ff9e00', '#ff2a54'];

  ctx.save();
  if (turnDir < 0) {
    ctx.translate(512, 0);
    ctx.scale(-1, 1);
  }

  for (let i = 0; i < 3; i++) {
    const x0 = 58 + i * 138;
    ctx.shadowColor = arrowColors[i];
    ctx.shadowBlur = 18;
    ctx.fillStyle = arrowColors[i];

    ctx.beginPath();
    ctx.moveTo(x0, 42);
    ctx.lineTo(x0 + 56, 42);
    ctx.lineTo(x0 + 118, 128);
    ctx.lineTo(x0 + 56, 214);
    ctx.lineTo(x0, 214);
    ctx.lineTo(x0 + 62, 128);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createHazardSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);
  // Glowing red-amber warning triangle
  ctx.fillStyle = '#ffbe0b';
  ctx.strokeStyle = '#ff1e42';
  ctx.lineWidth = 18;
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(128, 22);
  ctx.lineTo(234, 218);
  ctx.lineTo(22, 218);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 132px "Fredoka", "Nunito", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 128, 152);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a 3D Jump Ramp wedge geometry rising toward +Z (forward), with UVs aligned so v=1 is the top lip (+Z).
 */
function buildJumpRampGeometry(width = 4.4, length = 5.2, lipHeight = 0.92) {
  const hw = width * 0.5;
  const hl = length * 0.5;

  // 6 vertices of a solid wedge: back-bottom (-hl), front-bottom (+hl), front-lip (+hl, lipHeight)
  const positions = new Float32Array([
    // Top sloped ramp face (0..3)
    -hw, 0.03, -hl,
     hw, 0.03, -hl,
    -hw, lipHeight, hl,
     hw, lipHeight, hl,
    // Front vertical face & side faces (4..5 bottom front)
    -hw, 0.0, hl,
     hw, 0.0, hl,
  ]);

  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    1, 1,
    0, 0,
    1, 0,
  ]);

  const indices = [];
  // Sloped top ramp face (+Y/+Z normal)
  pushOrientedQuad(indices, positions, 0, 1, 2, 3, 0, 1, -0.2);
  // Front drop face (+Z normal)
  pushOrientedQuad(indices, positions, 4, 5, 2, 3, 0, 0, 1);
  // Left & right triangular cheeks
  // Left (-X): 0, 2, 4
  indices.push(0, 2, 4);
  // Right (+X): 1, 5, 3
  indices.push(1, 5, 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createAuroraTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Vertical soft fade (transparent at top & bottom, glowing curtains in middle)
  const vGrad = ctx.createLinearGradient(0, 0, 0, 128);
  vGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
  vGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.55)');
  vGrad.addColorStop(0.62, 'rgba(255, 255, 255, 0.95)');
  vGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.4)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 256, 128);

  // Vertical curtain striations
  ctx.globalCompositeOperation = 'source-atop';
  for (let x = 0; x < 256; x += 4) {
    const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.14) * Math.cos(x * 0.07));
    ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(2)})`;
    ctx.fillRect(x, 0, 3, 128);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createHoloSignTexture(variant = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const palettes = [
    { main: '#00f5d4', sub: '#f72585', label: 'TOKYO DRIFT', kanji: '電脳高速' },
    { main: '#f72585', sub: '#ffbe0b', label: 'TURBO ZONE', kanji: '加速全開' },
    { main: '#38bdf8', sub: '#a855f7', label: 'CYBER GP', kanji: '未来軌道' },
  ];
  const pal = palettes[variant % palettes.length];

  ctx.fillStyle = 'rgba(8, 12, 32, 0.42)';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = pal.main;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);

  ctx.strokeStyle = pal.sub;
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 228, 100);

  // Horizontal hologram scanlines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 8; y < 120; y += 6) {
    ctx.fillRect(10, y, 236, 2);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.sub;
  ctx.font = '800 22px "Nunito", sans-serif';
  ctx.fillText(pal.kanji, 128, 42);

  ctx.fillStyle = pal.main;
  ctx.font = '900 28px "Fredoka", "Nunito", sans-serif';
  ctx.fillText(pal.label, 128, 84);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLavaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 256);

  const rng = mulberry32(9911);
  // Bright yellow-orange magma veins
  for (let i = 0; i < 38; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 18 + rng() * 34;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0.0, 'rgba(254, 240, 138, 0.92)');
    grad.addColorStop(0.45, 'rgba(249, 115, 22, 0.68)');
    grad.addColorStop(1.0, 'rgba(220, 38, 38, 0.0)');
    ctx.fillStyle = grad;
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Dark cooled basalt crust islands
  ctx.fillStyle = 'rgba(41, 16, 12, 0.65)';
  for (let i = 0; i < 24; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const rx = 8 + rng() * 18;
    const ry = 6 + rng() * 14;
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  return tex;
}

function buildSweepingSpotlights(root, spots, disposables, { beamLength = 44, topR = 0.45, botR = 4.6 } = {}) {
  const housingGeo = new THREE.CylinderGeometry(0.65, 0.8, 1.3, 10);
  const lensGeo = new THREE.CircleGeometry(0.62, 12);
  const beamGeo = new THREE.ConeGeometry(botR, beamLength, 16, 1, true);
  // Shift cone so apex (topR/point) is at pivot (0,0,0) and beam extends downward/forward along +Y
  beamGeo.translate(0, -beamLength * 0.5, 0);
  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b,
    roughness: 0.35,
    metalness: 0.65,
  });
  disposables.push(housingGeo, lensGeo, beamGeo, housingMat);

  const sweepers = [];
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    const colHex = sp.color ?? 0x00f5d4;

    const mount = new THREE.Group();
    mount.position.set(sp.x, sp.y, sp.z);
    mount.rotation.y = sp.yaw || 0;
    root.add(mount);

    const pivot = new THREE.Group();
    mount.add(pivot);

    const housing = new THREE.Mesh(housingGeo, housingMat);
    pivot.add(housing);

    const beamMat = new THREE.MeshBasicMaterial({
      color: colHex,
      transparent: true,
      opacity: 0.19,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lensMat = new THREE.MeshBasicMaterial({ color: colHex });
    disposables.push(beamMat, lensMat);

    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.y = -0.66;
    lens.rotation.x = Math.PI * 0.5;
    pivot.add(lens);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = -0.5;
    // Slight inward tilt by default
    pivot.add(beam);

    sweepers.push({
      pivot,
      beamMat,
      baseTiltX: sp.baseTiltX ?? 0.55,
      baseTiltZ: sp.baseTiltZ ?? 0,
      ampX: sp.ampX ?? 0.35,
      ampZ: sp.ampZ ?? 0.45,
      speedX: sp.speedX ?? (1.1 + (i % 3) * 0.28),
      speedZ: sp.speedZ ?? (0.85 + (i % 2) * 0.35),
      phase: sp.phase ?? i * 1.35,
    });
  }
  return sweepers;
}

function buildArenaWorld(scene, trackId = 'arena') {
  const root = new THREE.Group();
  root.name = `TrackWorld_${trackId}`;
  scene.add(root);

  const disposables = [];
  const trackTex = [];

  const skyTex = createSkyTexture('arena');
  trackTex.push(skyTex);
  const skyGeo = new THREE.SphereGeometry(720, 32, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  root.add(new THREE.Mesh(skyGeo, skyMat));
  disposables.push(skyGeo, skyMat);

  const floorY = ARENA_DATA.floorY ?? 0.6;
  const radius = ARENA_DATA.radius ?? 48;

  // Circular neon stadium floor
  const floorGeo = new THREE.CircleGeometry(radius, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x161b33,
    roughness: 0.35,
    metalness: 0.25,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = floorY;
  floorMesh.receiveShadow = true;
  root.add(floorMesh);
  disposables.push(floorGeo, floorMat);

  // Concentric neon stadium rings
  const ringColors = [0xff2a54, 0x00bbf9, 0xfacc15];
  for (let i = 0; i < 3; i++) {
    const rIn = 12 + i * 13;
    const rGeo = new THREE.RingGeometry(rIn, rIn + 0.7, 64);
    rGeo.rotateX(-Math.PI / 2);
    const rMat = new THREE.MeshBasicMaterial({
      color: ringColors[i],
      transparent: true,
      opacity: 0.75,
    });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.position.y = floorY + 0.03;
    root.add(rMesh);
    disposables.push(rGeo, rMat);
  }

  // Outer perimeter glowing rim wall
  const rimGeo = new THREE.CylinderGeometry(radius + 0.8, radius + 0.8, 3.2, 64, 1, true);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b,
    emissive: 0xf72585,
    emissiveIntensity: 0.45,
    side: THREE.BackSide,
    roughness: 0.3,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = floorY + 1.5;
  root.add(rimMesh);
  const topTorusGeo = new THREE.TorusGeometry(radius + 0.6, 0.55, 10, 64);
  topTorusGeo.rotateX(Math.PI / 2);
  const topTorusMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00f5d4,
    emissiveIntensity: 0.65,
  });
  const topTorus = new THREE.Mesh(topTorusGeo, topTorusMat);
  topTorus.position.y = floorY + 3.1;
  root.add(topTorus);
  disposables.push(rimGeo, rimMat, topTorusGeo, topTorusMat);

  // Dynamic sweeping stadium spotlights around perimeter
  const arenaSpots = [];
  const spotPalette = [0x00f5d4, 0xf72585, 0xfacc15, 0x38bdf8, 0xa855f7, 0xff2a54];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const dist = radius + 2.5;
    arenaSpots.push({
      x: Math.sin(ang) * dist,
      y: floorY + 28,
      z: Math.cos(ang) * dist,
      yaw: ang,
      color: spotPalette[i % spotPalette.length],
      baseTiltX: 0.62,
      ampX: 0.26,
      ampZ: 0.42,
      phase: i * 1.1,
    });
  }
  const arenaSweepers = buildSweepingSpotlights(root, arenaSpots, disposables, {
    beamLength: 52,
    botR: 5.2,
  });

  // 4 Cylindrical Neon Pillars
  const pillarGeo = new THREE.CylinderGeometry(2.5, 2.5, 9.5, 20);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x3b0764,
    emissive: 0x00bbf9,
    emissiveIntensity: 0.38,
    roughness: 0.25,
  });
  disposables.push(pillarGeo, pillarMat);
  for (const p of ARENA_DATA.pillars || []) {
    const pm = new THREE.Mesh(pillarGeo, pillarMat);
    pm.position.set(p.x, floorY + 4.75, p.z);
    pm.castShadow = true;
    root.add(pm);
  }

  // Central Glowing Arcade Bumper
  const bumperRings = [];
  const bBaseGeo = new THREE.CylinderGeometry(2.6, 2.9, 1.5, 24);
  const bCapGeo = new THREE.CylinderGeometry(3.05, 2.6, 0.5, 24);
  const bRingGeo = new THREE.TorusGeometry(2.85, 0.26, 10, 24);
  bRingGeo.rotateX(Math.PI / 2);
  const bMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xf97316,
    emissiveIntensity: 0.65,
    roughness: 0.2,
  });
  const bRingMat = new THREE.MeshBasicMaterial({ color: 0xff2a54 });
  disposables.push(bBaseGeo, bCapGeo, bRingGeo, bMat, bRingMat);
  for (const b of ARENA_DATA.bumperSpots || []) {
    const bg = new THREE.Group();
    bg.position.set(b.x, floorY, b.z);
    const body = new THREE.Mesh(bBaseGeo, bMat);
    body.position.y = 0.75;
    const cap = new THREE.Mesh(bCapGeo, bRingMat);
    cap.position.y = 1.65;
    const ring = new THREE.Mesh(bRingGeo, bRingMat);
    ring.position.y = 0.95;
    bg.add(body, cap, ring);
    root.add(bg);
    bumperRings.push(ring);
  }

  // 4 Directional Boost Pads
  const boostTex = createBoostPadTexture(['#00f5d4', '#ffe600', '#ff2a85'], '#140b2e');
  trackTex.push(boostTex);
  const boostMat = new THREE.MeshStandardMaterial({
    map: boostTex,
    emissive: 0xffffff,
    emissiveMap: boostTex,
    emissiveIntensity: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const boostGeo = new THREE.PlaneGeometry(3.2, 5.4);
  boostGeo.rotateX(-Math.PI / 2);
  boostGeo.rotateY(Math.PI);
  disposables.push(boostMat, boostGeo);
  for (const pad of ARENA_DATA.boostPadSpots || []) {
    const m = new THREE.Mesh(boostGeo, boostMat);
    m.position.set(pad.x, floorY + 0.05, pad.z);
    m.rotation.y = pad.yaw || 0;
    root.add(m);
  }

  return {
    trackId,
    group: root,
    startSample: { x: 0, y: floorY, z: 14, yaw: 0 },
    centerX: 0,
    centerZ: 0,
    update(dt, elapsed) {
      boostTex.offset.y = (boostTex.offset.y - dt * 2.4) % 1;
      for (const r of bumperRings) {
        r.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.08);
      }
      for (const sw of arenaSweepers) {
        sw.pivot.rotation.x = sw.baseTiltX + Math.sin(elapsed * sw.speedX + sw.phase) * sw.ampX;
        sw.pivot.rotation.z = sw.baseTiltZ + Math.cos(elapsed * sw.speedZ + sw.phase) * sw.ampZ;
        sw.beamMat.opacity = 0.14 + (Math.sin(elapsed * 3.2 + sw.phase) + 1) * 0.05;
      }
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d?.dispose?.();
      for (const t of trackTex) t?.dispose?.();
    },
  };
}

/**
 * Builds the entire 3D circuit + themed world.
 */
export function buildTrackWorld(scene, trackId = 'coco') {
  if (isArenaTrack(trackId)) {
    return buildArenaWorld(scene, trackId);
  }
  const baseId = getBaseTrackId(trackId);
  const root = new THREE.Group();
  root.name = `TrackWorld_${trackId}`;
  scene.add(root);

  const disposables = [];
  const trackTex = [];

  const isMobile =
    typeof window !== 'undefined' &&
    (Boolean(window.matchMedia?.('(pointer: coarse)')?.matches) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
      Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 768);

  const meta = typeof getTrackMeta === 'function' ? getTrackMeta(trackId) : null;
  const samples = getTrackSamples(360, trackId);
  const coarseSamples = getTrackSamples(isMobile ? 112 : 160, trackId);
  const roadHalfW = meta?.roadHalfWidth || samples[0]?.roadHalfWidth || RACE_CONFIG.ROAD_HALF_WIDTH || 7.5;

  // Compute track centroid & bounds
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumZ = 0;
  for (const s of coarseSamples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
    sumX += s.x;
    sumZ += s.z;
  }
  const centerX = sumX / coarseSamples.length;
  const centerZ = sumZ / coarseSamples.length;

  function evaluateTrackProximity(x, z) {
    let minDistSq = Infinity;
    let nearest = coarseSamples[0];
    let weightSum = 0;
    let yWeighted = 0;

    for (let i = 0; i < coarseSamples.length; i++) {
      const s = coarseSamples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDistSq) {
        minDistSq = d2;
        nearest = s;
      }
      const w = 1 / (d2 + 85);
      weightSum += w;
      yWeighted += s.y * w;
    }

    return {
      dist: Math.sqrt(minDistSq),
      nearest,
      smoothY: weightSum > 0 ? yWeighted / weightSum : nearest.y,
    };
  }

  // 1. SKY DOME + CELESTIAL HERO OBJECT
  const skyTex = createSkyTexture(trackId);
  trackTex.push(skyTex);
  const skyGeo = new THREE.SphereGeometry(720, 32, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  root.add(skyMesh);
  disposables.push(skyGeo, skyMat);

  if (baseId === 'coco') {
    const sunGroup = new THREE.Group();
    sunGroup.position.set(210, 250, -240);
    const sunCoreGeo = new THREE.SphereGeometry(22, 20, 16);
    const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff8c8, fog: false });
    const sunHaloGeo = new THREE.SphereGeometry(36, 20, 16);
    const sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffe27a,
      transparent: true,
      opacity: 0.32,
      fog: false,
      depthWrite: false,
    });
    sunGroup.add(new THREE.Mesh(sunCoreGeo, sunCoreMat), new THREE.Mesh(sunHaloGeo, sunHaloMat));
    root.add(sunGroup);
    disposables.push(sunCoreGeo, sunCoreMat, sunHaloGeo, sunHaloMat);
  } else if (baseId === 'neon') {
    // Giant Synthwave Retro Striped Sun on the horizon!
    const synthSunTex = createSynthwaveSunTexture();
    trackTex.push(synthSunTex);
    const sunPlaneGeo = new THREE.PlaneGeometry(190, 190);
    const sunPlaneMat = new THREE.MeshBasicMaterial({
      map: synthSunTex,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    const synthSun = new THREE.Mesh(sunPlaneGeo, sunPlaneMat);
    synthSun.position.set(centerX + 40, 92, minZ - 340);
    synthSun.lookAt(centerX, 20, centerZ);
    root.add(synthSun);
    disposables.push(sunPlaneGeo, sunPlaneMat);
  }

  // Track-specific animatable refs
  let waterTex = null;
  let neonGridTex = null;
  let lavaTex = null;
  let lavaMat = null;
  let foamPosAttr = null;
  let foamMat = null;
  let foamCenters = null;
  const foamSteps = 160;
  let cloudsGroup = null;
  let crownInst = null;
  let palmPlacements = [];
  const cosmicSpinners = [];
  const neonArchMats = [];
  const bumperRings = [];
  const dummy = new THREE.Object3D();
  const tmpWeatherColor = new THREE.Color();

  // Biome weather & 3D life refs (zero per-frame GC allocations)
  const seagulls = [];
  let cocoFirefliesInst = null;
  const cocoFireflies = [];
  let specBodyInst = null;
  let specHeadInst = null;
  const spectators = [];

  let snowInst = null;
  const snowData = [];
  const auroraRibbons = [];

  let neonRainInst = null;
  const neonRainData = [];
  const holoBillboards = [];
  let cyberCarHullInst = null;
  let cyberCarGlowInst = null;
  const cyberTraffic = [];

  let emberInst = null;
  const volcanoEmbers = [];
  const lavaPulseMats = [];

  const shootingStars = [];
  let cosmicDustInst = null;
  const cosmicDustData = [];

  let pinballSweepers = [];

  // 2. TRACK-THEMED TERRAIN / GROUND / SPACE ENVIRONMENT
  const rng = mulberry32(baseId === 'neon' ? 208899 : baseId === 'rainbow' ? 994411 : baseId === 'pinball' ? 515151 : 777123);

  if (baseId === 'coco') {
    // --- ÎLE COCO: Turquoise Ocean + Sculpted Island + Shoreline Foam + Palms & Hills ---
    function evaluateIslandHeight(x, z) {
      const { dist, nearest, smoothY } = evaluateTrackProximity(x, z);
      const inside = isInsidePolygon(x, z, coarseSamples);
      const angle = Math.atan2(z - centerZ, x - centerX);
      const coastWave =
        Math.sin(angle * 5 + 0.7) * 6.5 +
        Math.cos(angle * 3 - 1.2) * 5.0 +
        Math.sin(x * 0.035) * Math.cos(z * 0.035) * 3.5;

      const shoulderEnd = roadHalfW + 5.2;
      const baseRoadBedY = smoothY - 0.16;
      const isDitchZone = nearest && nearest.hasGuardrail === false;

      let y;
      let inDitch = false;
      if (isDitchZone && dist > roadHalfW + 0.15 && dist < roadHalfW + 24) {
        inDitch = true;
        const innerDrop = smoothstep(roadHalfW + 0.15, roadHalfW + 3.2, dist);
        const outerRise = 1 - smoothstep(roadHalfW + 13.5, roadHalfW + 24, dist);
        const carve = innerDrop * outerRise;
        y = THREE.MathUtils.lerp(baseRoadBedY, -2.15, carve);
        return { y, dist, inside, nearest, inDitch };
      }

      if (dist <= shoulderEnd) {
        return { y: baseRoadBedY, dist, inside, nearest, inDitch };
      }

      if (inside) {
        const tIn = smoothstep(shoulderEnd, shoulderEnd + 28, dist);
        const hillBump =
          1.35 +
          Math.sin(x * 0.055 + 1.1) * Math.cos(z * 0.055 - 0.4) * 1.65 +
          Math.max(0, Math.sin(x * 0.028 - z * 0.031)) * 1.8;
        return { y: baseRoadBedY + tIn * hillBump, dist, inside, nearest, inDitch };
      }

      const beachStart = shoulderEnd + 16 + coastWave * 0.35;
      const waterEdge = shoulderEnd + 40 + coastWave;
      const deepEdge = waterEdge + 26;

      if (dist < beachStart) {
        y = THREE.MathUtils.lerp(baseRoadBedY, 0.85, smoothstep(shoulderEnd, beachStart, dist));
      } else if (dist < waterEdge) {
        y = THREE.MathUtils.lerp(0.85, 0.0, smoothstep(beachStart, waterEdge, dist));
      } else {
        y = THREE.MathUtils.lerp(0.0, -2.2, smoothstep(waterEdge, deepEdge, dist));
      }
      return { y, dist, inside, nearest, inDitch };
    }

    waterTex = createWaterRippleTexture();
    trackTex.push(waterTex);
    const oceanGeo = new THREE.PlaneGeometry(1600, 1600);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x10d0e8,
      map: waterTex,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(centerX, 0.0, centerZ);
    root.add(oceanMesh);

    const seabedGeo = new THREE.PlaneGeometry(1600, 1600);
    seabedGeo.rotateX(-Math.PI / 2);
    const seabedMat = new THREE.MeshBasicMaterial({ color: 0x0369a1 });
    const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
    seabedMesh.position.set(centerX, -2.3, centerZ);
    root.add(seabedMesh);
    disposables.push(oceanGeo, oceanMat, seabedGeo, seabedMat);

    const pad = 108;
    const x0 = minX - pad;
    const x1 = maxX + pad;
    const z0 = minZ - pad;
    const z1 = maxZ + pad;
    const segs = isMobile ? 56 : 90;
    const vertsPerRow = segs + 1;

    const terrainPos = new Float32Array(vertsPerRow * vertsPerRow * 3);
    const terrainCol = new Float32Array(vertsPerRow * vertsPerRow * 3);
    const terrainIndices = [];

    const cGrassBright = new THREE.Color('#3be068');
    const cGrassDeep = new THREE.Color('#20b854');
    const cGrassHill = new THREE.Color('#7ae54a');
    const cSandDry = new THREE.Color('#ffe484');
    const cSandWarm = new THREE.Color('#fbbf24');
    const cSandWet = new THREE.Color('#38bdf8');
    const tmpColor = new THREE.Color();

    for (let iz = 0; iz <= segs; iz++) {
      const vz = z0 + (z1 - z0) * (iz / segs);
      for (let ix = 0; ix <= segs; ix++) {
        const vx = x0 + (x1 - x0) * (ix / segs);
        const idx = iz * vertsPerRow + ix;
        const { y, inside, inDitch } = evaluateIslandHeight(vx, vz);

        terrainPos[idx * 3] = vx;
        terrainPos[idx * 3 + 1] = y;
        terrainPos[idx * 3 + 2] = vz;

        const stripe = (Math.sin(vx * 0.16) * Math.cos(vz * 0.16) + 1) * 0.5;
        if (inDitch) {
          tmpColor.copy(cSandWet).lerp(cSandWarm, smoothstep(-1.8, 0.4, y) * 0.75);
        } else if (inside || y > 1.05) {
          tmpColor.copy(cGrassDeep).lerp(cGrassBright, 0.35 + stripe * 0.5);
          if (y > 2.4) tmpColor.lerp(cGrassHill, smoothstep(2.4, 4.8, y) * 0.55);
        } else if (y > 0.18) {
          const sandBlend = smoothstep(0.18, 1.05, y);
          tmpColor.copy(cSandWarm).lerp(cSandDry, 0.35 + sandBlend * 0.65);
          if (y > 0.82) tmpColor.lerp(cGrassBright, smoothstep(0.82, 1.05, y));
        } else {
          tmpColor.copy(cSandWet).lerp(cSandWarm, smoothstep(-1.4, 0.18, y));
        }

        terrainCol[idx * 3] = tmpColor.r;
        terrainCol[idx * 3 + 1] = tmpColor.g;
        terrainCol[idx * 3 + 2] = tmpColor.b;
      }
    }

    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const i0 = iz * vertsPerRow + ix;
        const i1 = i0 + 1;
        const j0 = (iz + 1) * vertsPerRow + ix;
        pushOrientedQuad(terrainIndices, terrainPos, i0, i1, j0, j0 + 1, 0, 1, 0);
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(terrainPos, 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(terrainCol, 3));
    terrainGeo.setIndex(terrainIndices);
    terrainGeo.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    root.add(terrainMesh);
    disposables.push(terrainGeo, terrainMat);

    // Shoreline Foam Ring
    foamCenters = [];
    const maxSpan = Math.max(maxX - minX, maxZ - minZ) * 0.5 + pad;
    for (let i = 0; i < foamSteps; i++) {
      const ang = (i / foamSteps) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      let hitR = maxSpan * 0.75;
      for (let r = maxSpan; r >= 20; r -= 2.4) {
        if (evaluateIslandHeight(centerX + dx * r, centerZ + dz * r).y >= 0.02) {
          hitR = r + 0.8;
          break;
        }
      }
      foamCenters.push({ dx, dz, baseR: hitR });
    }

    const foamPos = new Float32Array((foamSteps + 1) * 2 * 3);
    const foamCol = new Float32Array((foamSteps + 1) * 2 * 3);
    const foamIndices = [];
    for (let i = 0; i <= foamSteps; i++) {
      const pt = foamCenters[i % foamSteps];
      const idx0 = i * 2;
      const idx1 = i * 2 + 1;
      foamPos[idx0 * 3] = centerX + pt.dx * (pt.baseR - 1.3);
      foamPos[idx0 * 3 + 1] = 0.045;
      foamPos[idx0 * 3 + 2] = centerZ + pt.dz * (pt.baseR - 1.3);
      foamPos[idx1 * 3] = centerX + pt.dx * (pt.baseR + 2.1);
      foamPos[idx1 * 3 + 1] = 0.035;
      foamPos[idx1 * 3 + 2] = centerZ + pt.dz * (pt.baseR + 2.1);
      foamCol.set([1, 1, 1, 0.65, 0.96, 1.0], idx0 * 3);
      if (i < foamSteps) pushOrientedQuad(foamIndices, foamPos, idx0, idx1, idx0 + 2, idx1 + 2, 0, 1, 0);
    }
    const foamGeo = new THREE.BufferGeometry();
    foamPosAttr = new THREE.BufferAttribute(foamPos, 3);
    foamGeo.setAttribute('position', foamPosAttr);
    foamGeo.setAttribute('color', new THREE.BufferAttribute(foamCol, 3));
    foamGeo.setIndex(foamIndices);
    foamGeo.computeVertexNormals();
    foamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
    root.add(new THREE.Mesh(foamGeo, foamMat));
    disposables.push(foamGeo, foamMat);

    // Instanced Curved Palm Trees + Coconuts + Hills + Clouds
    const MIN_TREE_CLEARANCE = roadHalfW + 6.4;
    palmPlacements = [];
    for (let attempt = 0; attempt < 460 && palmPlacements.length < 54; attempt++) {
      const rx = x0 + 18 + rng() * (x1 - x0 - 36);
      const rz = z0 + 18 + rng() * (z1 - z0 - 36);
      const info = evaluateIslandHeight(rx, rz);
      if (info.dist < MIN_TREE_CLEARANCE || info.y < 0.22 || info.y > 4.6) continue;
      if (palmPlacements.some((o) => (rx - o.x) ** 2 + (rz - o.z) ** 2 < 52)) continue;
      palmPlacements.push({
        x: rx,
        y: info.y - 0.08,
        z: rz,
        yaw: rng() * Math.PI * 2,
        scale: 0.85 + rng() * 0.48,
        phase: rng() * Math.PI * 2,
      });
    }

    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.25, 1.9, 0.1),
      new THREE.Vector3(0.68, 3.8, 0.2),
      new THREE.Vector3(1.15, 5.7, 0.25),
    ]);
    const palmTrunkGeo = new THREE.TubeGeometry(trunkCurve, 7, 0.34, 7, false);
    const tPos = palmTrunkGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const py = tPos.getY(i);
      const u = Math.max(0, Math.min(1, py / 5.7));
      const sp = trunkCurve.getPoint(u);
      const tap = THREE.MathUtils.lerp(1.18, 0.56, u);
      tPos.setXYZ(i, sp.x + (tPos.getX(i) - sp.x) * tap, py, sp.z + (tPos.getZ(i) - sp.z) * tap);
    }
    palmTrunkGeo.computeVertexNormals();

    // Crown geometry
    const crownPositions = [];
    const crownColors = [];
    const crownIndices = [];
    const cLeafBase = new THREE.Color('#16a34a');
    const cLeafMid = new THREE.Color('#22c55e');
    const cLeafTip = new THREE.Color('#84cc16');
    const cTmp = new THREE.Color();
    for (let f = 0; f < 7; f++) {
      const az = (f / 7) * Math.PI * 2 + (f % 2) * 0.14;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const len = f % 2 === 0 ? 3.25 : 2.85;
      const baseV = crownPositions.length / 3;
      for (let s = 0; s <= 5; s++) {
        const u = s / 5;
        const r = u * len;
        const archY = Math.sin(u * Math.PI * 0.72) * 0.85 - u * u * 1.45;
        const halfW = Math.sin(Math.pow(u, 0.65) * Math.PI) * 0.58 + 0.05;
        crownPositions.push(ca * r + sa * halfW, archY - 0.08, sa * r - ca * halfW);
        crownPositions.push(ca * r, archY + 0.08, sa * r);
        crownPositions.push(ca * r - sa * halfW, archY - 0.08, sa * r + ca * halfW);
        cTmp.copy(cLeafBase).lerp(cLeafMid, u).lerp(cLeafTip, u * u * 0.75);
        for (let k = 0; k < 3; k++) {
          const boost = k === 1 ? 1.1 : 0.94;
          crownColors.push(Math.min(1, cTmp.r * boost), Math.min(1, cTmp.g * boost), Math.min(1, cTmp.b * boost));
        }
        if (s < 5) {
          const r0 = baseV + s * 3;
          pushOrientedQuad(crownIndices, crownPositions, r0, r0 + 1, r0 + 3, r0 + 4, 0, 1, 0);
          pushOrientedQuad(crownIndices, crownPositions, r0 + 1, r0 + 2, r0 + 4, r0 + 5, 0, 1, 0);
        }
      }
    }
    const palmCrownGeo = new THREE.BufferGeometry();
    palmCrownGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(crownPositions), 3));
    palmCrownGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(crownColors), 3));
    palmCrownGeo.setIndex(crownIndices);
    palmCrownGeo.computeVertexNormals();

    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x9c6644, roughness: 0.85 });
    const palmCrownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, side: THREE.DoubleSide });
    const coconutGeo = new THREE.SphereGeometry(0.26, 8, 6);
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x582f0e, roughness: 0.65 });
    disposables.push(palmTrunkGeo, palmTrunkMat, palmCrownGeo, palmCrownMat, coconutGeo, coconutMat);

    const pCount = palmPlacements.length;
    const trunkInst = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, pCount);
    crownInst = new THREE.InstancedMesh(palmCrownGeo, palmCrownMat, pCount);
    const cocoInst = new THREE.InstancedMesh(coconutGeo, coconutMat, pCount * 3);
    trunkInst.castShadow = true;
    crownInst.castShadow = true;

    const topOff = new THREE.Vector3(1.15, 5.65, 0.25);
    const tmpV = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    palmPlacements.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      tmpV.copy(topOff).multiplyScalar(p.scale).applyAxisAngle(yAxis, p.yaw);
      p.crownX = p.x + tmpV.x;
      p.crownY = p.y + tmpV.y;
      p.crownZ = p.z + tmpV.z;

      dummy.position.set(p.crownX, p.crownY, p.crownZ);
      dummy.rotation.set(0.06, p.yaw, 0.05);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      crownInst.setMatrixAt(idx, dummy.matrix);

      for (let c = 0; c < 3; c++) {
        const ca = p.yaw + (c / 3) * Math.PI * 2;
        dummy.position.set(
          p.crownX + Math.cos(ca) * 0.26 * p.scale,
          p.crownY - 0.22 * p.scale,
          p.crownZ + Math.sin(ca) * 0.26 * p.scale
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        cocoInst.setMatrixAt(idx * 3 + c, dummy.matrix);
      }
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    cocoInst.instanceMatrix.needsUpdate = true;
    root.add(trunkInst, crownInst, cocoInst);

    // Puffy White Clouds with funny Mario-style eyes
    cloudsGroup = new THREE.Group();
    cloudsGroup.position.set(centerX, 0, centerZ);
    root.add(cloudsGroup);
    const cloudPuffGeo = new THREE.IcosahedronGeometry(1, 1);
    const cloudEyeGeo = new THREE.SphereGeometry(0.18, 8, 8);
    cloudEyeGeo.scale(0.85, 1.55, 0.6);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdbeafe,
      emissiveIntensity: 0.25,
      roughness: 0.9,
      flatShading: true,
      fog: false,
    });
    const cloudEyeMat = new THREE.MeshBasicMaterial({ color: 0x111827, fog: false });
    disposables.push(cloudPuffGeo, cloudEyeGeo, cloudMat, cloudEyeMat);
    for (let c = 0; c < 18; c++) {
      const cl = new THREE.Group();
      const ang = (c / 18) * Math.PI * 2 + rng() * 0.22;
      const rad = 165 + rng() * 145;
      cl.position.set(Math.cos(ang) * rad, 48 + rng() * 34, Math.sin(ang) * rad);
      cl.rotation.y = -ang + Math.PI * 0.5;
      const sc = 5.5 + rng() * 4.5;
      for (const pf of [
        [0, 0, 0, 1.35, 0.88, 1.0],
        [-1.15, -0.18, 0.1, 0.95, 0.7, 0.85],
        [1.18, -0.15, -0.1, 1.0, 0.72, 0.88],
        [0.35, 0.42, 0.15, 0.82, 0.68, 0.78],
      ]) {
        const m = new THREE.Mesh(cloudPuffGeo, cloudMat);
        m.position.set(pf[0] * sc, pf[1] * sc, pf[2] * sc);
        m.scale.set(pf[3] * sc, pf[4] * sc, pf[5] * sc);
        cl.add(m);
      }
      for (const ex of [-0.32, 0.32]) {
        const eye = new THREE.Mesh(cloudEyeGeo, cloudEyeMat);
        eye.position.set(ex * sc, 0.12 * sc, 0.95 * sc);
        eye.scale.setScalar(sc * 0.9);
        cl.add(eye);
      }
      cloudsGroup.add(cl);
    }

    // Iconic Mario-Kart Green Warp Pipes & Giant Polka-Dot Mushrooms along scenic roadside
    const pipeCylGeo = new THREE.CylinderGeometry(1.15, 1.15, 3.6, 16);
    const pipeRimGeo = new THREE.CylinderGeometry(1.42, 1.42, 0.85, 16);
    const pipeVoidGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.2, 14);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.28, metalness: 0.08 });
    const pipeVoidMat = new THREE.MeshBasicMaterial({ color: 0x052e16 });
    const mushStemGeo = new THREE.CylinderGeometry(0.7, 0.95, 2.2, 12);
    const mushCapGeo = new THREE.SphereGeometry(2.1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const mushSpotGeo = new THREE.SphereGeometry(0.45, 10, 8);
    const mushStemMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.75 });
    const mushCapMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 });
    const mushSpotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    disposables.push(
      pipeCylGeo,
      pipeRimGeo,
      pipeVoidGeo,
      pipeMat,
      pipeVoidMat,
      mushStemGeo,
      mushCapGeo,
      mushSpotGeo,
      mushStemMat,
      mushCapMat,
      mushSpotMat
    );

    const cocoPropSlots = [
      { t: 0.08, side: 1, kind: 'pipe', scale: 1.15 },
      { t: 0.17, side: -1, kind: 'mush', scale: 1.25 },
      { t: 0.28, side: 1, kind: 'mush', scale: 1.05 },
      { t: 0.51, side: -1, kind: 'pipe', scale: 1.3 },
      { t: 0.62, side: 1, kind: 'pipe', scale: 1.1 },
      { t: 0.71, side: -1, kind: 'mush', scale: 1.35 },
      { t: 0.94, side: 1, kind: 'mush', scale: 1.15 },
    ];
    for (const slot of cocoPropSlots) {
      const s = getTrackSample(slot.t, trackId);
      const px = s.x + s.nx * slot.side * (roadHalfW + 6.4);
      const pz = s.z + s.nz * slot.side * (roadHalfW + 6.4);
      const { dist, y, nearest } = evaluateIslandHeight(px, pz);
      if (dist < roadHalfW + 4.8 || nearest?.hasGuardrail === false || y < -0.3) continue;

      const propGroup = new THREE.Group();
      propGroup.position.set(px, y, pz);
      propGroup.scale.setScalar(slot.scale);

      if (slot.kind === 'pipe') {
        const body = new THREE.Mesh(pipeCylGeo, pipeMat);
        body.position.y = 1.8;
        body.castShadow = true;
        const rim = new THREE.Mesh(pipeRimGeo, pipeMat);
        rim.position.y = 3.55;
        rim.castShadow = true;
        const hollow = new THREE.Mesh(pipeVoidGeo, pipeVoidMat);
        hollow.position.y = 3.92;
        propGroup.add(body, rim, hollow);
      } else {
        const stem = new THREE.Mesh(mushStemGeo, mushStemMat);
        stem.position.y = 1.1;
        stem.castShadow = true;
        const cap = new THREE.Mesh(mushCapGeo, mushCapMat);
        cap.position.y = 2.0;
        cap.castShadow = true;
        propGroup.add(stem, cap);
        for (const [sx, sy, sz] of [
          [1.25, 2.85, 0.85],
          [-1.35, 2.75, 0.7],
          [0.15, 3.85, 0.25],
          [0.2, 2.7, -1.45],
        ]) {
          const spot = new THREE.Mesh(mushSpotGeo, mushSpotMat);
          spot.position.set(sx, sy, sz);
          propGroup.add(spot);
        }
      }
      root.add(propGroup);
    }

    // Seagulls circling gracefully over the tropical lagoon
    const gullBodyGeo = new THREE.ConeGeometry(0.24, 1.05, 6);
    gullBodyGeo.rotateX(Math.PI * 0.5);
    const gullBeakGeo = new THREE.ConeGeometry(0.08, 0.34, 5);
    gullBeakGeo.rotateX(Math.PI * 0.5);
    const gullWingGeo = new THREE.BoxGeometry(0.95, 0.05, 0.36);
    gullWingGeo.translate(0.48, 0, 0);
    const gullWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    const gullBeakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    disposables.push(gullBodyGeo, gullBeakGeo, gullWingGeo, gullWhiteMat, gullBeakMat);

    for (let g = 0; g < 8; g++) {
      const gullGroup = new THREE.Group();
      const body = new THREE.Mesh(gullBodyGeo, gullWhiteMat);
      const beak = new THREE.Mesh(gullBeakGeo, gullBeakMat);
      beak.position.set(0, -0.02, 0.65);
      const wingL = new THREE.Group();
      const wingLMesh = new THREE.Mesh(gullWingGeo, gullWhiteMat);
      wingL.add(wingLMesh);
      const wingR = new THREE.Group();
      const wingRMesh = new THREE.Mesh(gullWingGeo, gullWhiteMat);
      wingRMesh.scale.x = -1;
      wingR.add(wingRMesh);
      gullGroup.add(body, beak, wingL, wingR);
      gullGroup.scale.setScalar(1.15 + (g % 3) * 0.15);
      root.add(gullGroup);
      seagulls.push({
        group: gullGroup,
        wingL,
        wingR,
        rx: 72 + (g % 4) * 22,
        rz: 68 + ((g + 2) % 4) * 20,
        baseY: 18 + (g % 3) * 5.5,
        speed: (g % 2 === 0 ? 1 : -1) * (0.18 + (g % 3) * 0.04),
        phase: (g / 8) * Math.PI * 2,
        flapSpeed: 6.5 + (g % 3) * 1.4,
      });
    }

    // Tropical Sun-Motes / Fireflies drifting over the island
    const FIREFLY_COUNT = 100;
    const fireflyGeo = new THREE.OctahedronGeometry(0.14, 0);
    const fireflyMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(fireflyGeo, fireflyMat);
    cocoFirefliesInst = new THREE.InstancedMesh(fireflyGeo, fireflyMat, FIREFLY_COUNT);
    cocoFirefliesInst.frustumCulled = false;
    disposables.push(cocoFirefliesInst);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const fx = x0 + 25 + rng() * (x1 - x0 - 50);
      const fz = z0 + 25 + rng() * (z1 - z0 - 50);
      const info = evaluateIslandHeight(fx, fz);
      const fy = Math.max(0.8, info.y + 1.0 + rng() * 5.5);
      cocoFireflies.push({
        x: fx,
        y: fy,
        z: fz,
        phase: rng() * Math.PI * 2,
        speed: 0.9 + rng() * 1.4,
        amp: 0.6 + rng() * 1.1,
      });
      dummy.position.set(fx, fy, fz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cocoFirefliesInst.setMatrixAt(i, dummy.matrix);
      tmpWeatherColor.setHex(i % 3 === 0 ? 0xa7f3d0 : i % 3 === 1 ? 0xfef08a : 0xffedd5);
      cocoFirefliesInst.setColorAt(i, tmpWeatherColor);
    }
    cocoFirefliesInst.instanceMatrix.needsUpdate = true;
    if (cocoFirefliesInst.instanceColor) cocoFirefliesInst.instanceColor.needsUpdate = true;
    root.add(cocoFirefliesInst);

    // Colorful Grandstands with Animated Cheering Spectators
    const standSlots = [
      { t: 0.028, side: -1 },
      { t: 0.67, side: 1 },
      { t: 0.96, side: -1 },
    ];
    const standBaseGeo = new THREE.BoxGeometry(14, 1.0, 5.4);
    const standStepGeo = new THREE.BoxGeometry(13.6, 0.85, 3.4);
    const standRoofGeo = new THREE.BoxGeometry(14.6, 0.35, 5.8);
    const standPostGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.8, 8);
    const standWoodMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.78 });
    const standTrimMat = new THREE.MeshStandardMaterial({ color: 0xff2a54, roughness: 0.45 });
    const standCanopyMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.55 });
    disposables.push(
      standBaseGeo,
      standStepGeo,
      standRoofGeo,
      standPostGeo,
      standWoodMat,
      standTrimMat,
      standCanopyMat
    );

    const specPalette = [0xff2a3c, 0xffbe0b, 0x00bbf9, 0xff70a6, 0x38b000, 0x7209b7, 0xffffff];
    const specPositions = [];
    for (const slot of standSlots) {
      const s = getTrackSample(slot.t, trackId);
      const gx = s.x + s.nx * slot.side * (roadHalfW + 9.2);
      const gz = s.z + s.nz * slot.side * (roadHalfW + 9.2);
      const info = evaluateIslandHeight(gx, gz);
      if (info.dist < roadHalfW + 7.5 || info.nearest?.hasGuardrail === false || info.y < 0.05) continue;

      const stand = new THREE.Group();
      stand.position.set(gx, info.y - 0.1, gz);
      // Face toward the road
      const faceYaw = Math.atan2(-s.nx * slot.side, -s.nz * slot.side);
      stand.rotation.y = faceYaw;

      const step1 = new THREE.Mesh(standBaseGeo, standWoodMat);
      step1.position.set(0, 0.5, 0);
      step1.castShadow = true;
      step1.receiveShadow = true;
      const step2 = new THREE.Mesh(standStepGeo, standTrimMat);
      step2.position.set(0, 1.35, -0.95);
      step2.castShadow = true;
      const roof = new THREE.Mesh(standRoofGeo, standCanopyMat);
      roof.position.set(0, 5.1, -0.1);
      roof.rotation.x = 0.14;
      roof.castShadow = true;
      stand.add(step1, step2, roof);

      for (const px of [-6.6, 6.6]) {
        for (const pz of [-2.2, 2.2]) {
          const post = new THREE.Mesh(standPostGeo, standWoodMat);
          post.position.set(px, 2.6, pz);
          stand.add(post);
        }
      }
      root.add(stand);

      const cosY = Math.cos(faceYaw);
      const sinY = Math.sin(faceYaw);
      for (let row = 0; row < 2; row++) {
        const localZ = row === 0 ? 1.1 : -0.95;
        const localY = row === 0 ? 1.05 : 1.82;
        for (let col = 0; col < 10; col++) {
          const localX = -5.6 + col * 1.24;
          const wx = gx + localX * cosY + localZ * sinY;
          const wz = gz - localX * sinY + localZ * cosY;
          specPositions.push({
            x: wx,
            baseY: info.y - 0.1 + localY,
            z: wz,
            yaw: faceYaw,
            color: specPalette[(col + row * 3 + specPositions.length) % specPalette.length],
            phase: rng() * Math.PI * 2,
            speed: 5.2 + rng() * 3.8,
          });
        }
      }
    }

    if (specPositions.length > 0) {
      const specBodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.52, 7);
      const specHeadGeo = new THREE.SphereGeometry(0.21, 8, 6);
      const specBodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
      const specHeadMat = new THREE.MeshStandardMaterial({ color: 0xffd6b0, roughness: 0.6 });
      disposables.push(specBodyGeo, specHeadGeo, specBodyMat, specHeadMat);

      specBodyInst = new THREE.InstancedMesh(specBodyGeo, specBodyMat, specPositions.length);
      specHeadInst = new THREE.InstancedMesh(specHeadGeo, specHeadMat, specPositions.length);
      specBodyInst.frustumCulled = false;
      specHeadInst.frustumCulled = false;
      disposables.push(specBodyInst, specHeadInst);

      for (let i = 0; i < specPositions.length; i++) {
        const sp = specPositions[i];
        spectators.push(sp);
        dummy.position.set(sp.x, sp.baseY + 0.26, sp.z);
        dummy.rotation.set(0, sp.yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        specBodyInst.setMatrixAt(i, dummy.matrix);
        tmpWeatherColor.setHex(sp.color);
        specBodyInst.setColorAt(i, tmpWeatherColor);

        dummy.position.set(sp.x, sp.baseY + 0.66, sp.z);
        dummy.updateMatrix();
        specHeadInst.setMatrixAt(i, dummy.matrix);
      }
      specBodyInst.instanceMatrix.needsUpdate = true;
      if (specBodyInst.instanceColor) specBodyInst.instanceColor.needsUpdate = true;
      specHeadInst.instanceMatrix.needsUpdate = true;
      root.add(specBodyInst, specHeadInst);
    }
  } else if (baseId === 'neon') {
    // --- NÉON DRIFT: Cyber Tokyo Neon Grid Floor + Glowing Skyscraper Skyline + Overpass Pillars ---
    neonGridTex = createNeonGridTexture();
    trackTex.push(neonGridTex);
    const floorGeo = new THREE.PlaneGeometry(1600, 1600);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x100b28,
      map: neonGridTex,
      emissive: 0xffffff,
      emissiveMap: neonGridTex,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.5,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(centerX, 0.0, centerZ);
    root.add(floorMesh);
    disposables.push(floorGeo, floorMat);

    // Highway support pillars under elevated overpass sections (s.y > 2.2)
    const pillarGeo = new THREE.CylinderGeometry(0.65, 0.8, 1, 10);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x00bbf9,
      emissiveIntensity: 0.12,
      roughness: 0.5,
    });
    disposables.push(pillarGeo, pillarMat);
    for (let i = 0; i < coarseSamples.length; i += 4) {
      const s = coarseSamples[i];
      if (s.y < 2.3) continue;
      // Ensure no lower road passes directly underneath
      let clearBelow = true;
      for (let j = 0; j < coarseSamples.length; j++) {
        if (Math.abs(i - j) < 8 || Math.abs(i - j) > coarseSamples.length - 8) continue;
        const other = coarseSamples[j];
        const d2 = (s.x - other.x) ** 2 + (s.z - other.z) ** 2;
        if (d2 < (roadHalfW + 3.5) ** 2 && other.y < s.y) {
          clearBelow = false;
          break;
        }
      }
      if (!clearBelow) continue;

      for (const side of [-1, 1]) {
        const px = s.x + s.nx * side * (roadHalfW * 0.68);
        const pz = s.z + s.nz * side * (roadHalfW * 0.68);
        const h = s.y - 0.15;
        const pil = new THREE.Mesh(pillarGeo, pillarMat);
        pil.scale.set(1, h, 1);
        pil.position.set(px, h * 0.5, pz);
        root.add(pil);
      }
    }

    // Instanced Cyber Tokyo Neon Skyscrapers safely outside the road corridor
    const winTex = createCyberWindowsTexture();
    trackTex.push(winTex);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      map: winTex,
      emissive: 0xffffff,
      emissiveMap: winTex,
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.4,
    });
    const roofTrimGeo = new THREE.BoxGeometry(1.06, 0.5, 1.06);
    const roofCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    const roofPinkMat = new THREE.MeshBasicMaterial({ color: 0xf72585 });
    disposables.push(towerGeo, towerMat, roofTrimGeo, roofCyanMat, roofPinkMat);

    const pad = 135;
    const tx0 = minX - pad;
    const tx1 = maxX + pad;
    const tz0 = minZ - pad;
    const tz1 = maxZ + pad;
    const towers = [];
    for (let attempt = 0; attempt < 520 && towers.length < 56; attempt++) {
      const bx = tx0 + rng() * (tx1 - tx0);
      const bz = tz0 + rng() * (tz1 - tz0);
      const w = 8 + rng() * 11;
      const d = 8 + rng() * 11;
      const prox = evaluateTrackProximity(bx, bz);
      if (prox.dist < roadHalfW + Math.hypot(w, d) * 0.5 + 6.5) continue;
      if (towers.some((t) => (bx - t.x) ** 2 + (bz - t.z) ** 2 < 180)) continue;
      towers.push({ x: bx, z: bz, w, d, h: 18 + rng() * 54, yaw: (Math.floor(rng() * 4) * Math.PI) / 2 });
    }

    if (towers.length > 0) {
      const towerInst = new THREE.InstancedMesh(towerGeo, towerMat, towers.length);
      const trimCyanInst = new THREE.InstancedMesh(roofTrimGeo, roofCyanMat, Math.ceil(towers.length / 2));
      const trimPinkInst = new THREE.InstancedMesh(roofTrimGeo, roofPinkMat, Math.floor(towers.length / 2));
      let ci = 0;
      let pi = 0;
      towers.forEach((t, idx) => {
        dummy.position.set(t.x, t.h * 0.5, t.z);
        dummy.rotation.set(0, t.yaw, 0);
        dummy.scale.set(t.w, t.h, t.d);
        dummy.updateMatrix();
        towerInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, t.h + 0.25, t.z);
        dummy.scale.set(t.w, 1, t.d);
        dummy.updateMatrix();
        if (idx % 2 === 0) trimCyanInst.setMatrixAt(ci++, dummy.matrix);
        else trimPinkInst.setMatrixAt(pi++, dummy.matrix);
      });
      towerInst.instanceMatrix.needsUpdate = true;
      trimCyanInst.instanceMatrix.needsUpdate = true;
      trimPinkInst.instanceMatrix.needsUpdate = true;
      root.add(towerInst, trimCyanInst, trimPinkInst);
    }

    // 3 Glowing Cyber Holo-Arches spanning Néon Drift
    const archSpan = roadHalfW + 1.85;
    const archLegGeo = new THREE.BoxGeometry(0.85, 8.6, 0.85);
    const archBeamGeo = new THREE.BoxGeometry(archSpan * 2 + 1.2, 0.85, 1.0);
    const archTorusGeo = new THREE.TorusGeometry(archSpan * 0.72, 0.24, 8, 28, Math.PI);
    const archBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.3, metalness: 0.6 });
    disposables.push(archLegGeo, archBeamGeo, archTorusGeo, archBodyMat);

    for (const [idx, tArch] of [0.10, 0.49, 0.85].entries()) {
      const s = getTrackSample(tArch, trackId);
      const archG = new THREE.Group();
      archG.position.set(s.x, s.y, s.z);
      archG.rotation.y = s.yaw;

      const legL = new THREE.Mesh(archLegGeo, archBodyMat);
      legL.position.set(-archSpan, 4.3, 0);
      const legR = new THREE.Mesh(archLegGeo, archBodyMat);
      legR.position.set(archSpan, 4.3, 0);
      const beam = new THREE.Mesh(archBeamGeo, archBodyMat);
      beam.position.set(0, 8.6, 0);

      const neonHex = idx % 2 === 0 ? 0x00f5d4 : 0xf72585;
      const archNeonMat = new THREE.MeshStandardMaterial({
        color: neonHex,
        emissive: neonHex,
        emissiveIntensity: 1.1,
        roughness: 0.15,
      });
      disposables.push(archNeonMat);
      neonArchMats.push(archNeonMat);

      const neonArc = new THREE.Mesh(archTorusGeo, archNeonMat);
      neonArc.position.set(0, 5.2, 0);
      archG.add(legL, legR, beam, neonArc);
      root.add(archG);
    }

    // Neon Rain (InstancedMesh streaks falling diagonally)
    const NEON_RAIN_COUNT = 220;
    const rainGeo = new THREE.BoxGeometry(0.045, 1.85, 0.045);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(rainGeo, rainMat);
    neonRainInst = new THREE.InstancedMesh(rainGeo, rainMat, NEON_RAIN_COUNT);
    neonRainInst.frustumCulled = false;
    disposables.push(neonRainInst);
    for (let i = 0; i < NEON_RAIN_COUNT; i++) {
      const rx = minX - 35 + rng() * (maxX - minX + 70);
      const rz = minZ - 35 + rng() * (maxZ - minZ + 70);
      const ry = rng() * 44;
      neonRainData.push({
        x: rx,
        y: ry,
        z: rz,
        speed: 34 + rng() * 18,
      });
      dummy.position.set(rx, ry, rz);
      dummy.rotation.set(0, 0, 0.09);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      neonRainInst.setMatrixAt(i, dummy.matrix);
      tmpWeatherColor.setHex(i % 2 === 0 ? 0x00f5d4 : 0xf72585);
      neonRainInst.setColorAt(i, tmpWeatherColor);
    }
    neonRainInst.instanceMatrix.needsUpdate = true;
    if (neonRainInst.instanceColor) neonRainInst.instanceColor.needsUpdate = true;
    root.add(neonRainInst);

    // Floating Translucent Hologram Billboards along Neon Boulevard
    const holoGeo = new THREE.PlaneGeometry(6.8, 3.4);
    const holoSpecs = [
      { t: 0.04, side: 1, v: 0 },
      { t: 0.17, side: -1, v: 1 },
      { t: 0.34, side: 1, v: 2 },
      { t: 0.53, side: -1, v: 0 },
      { t: 0.72, side: 1, v: 1 },
      { t: 0.90, side: -1, v: 2 },
    ];
    disposables.push(holoGeo);
    const holoTextures = [0, 1, 2].map((v) => {
      const ht = createHoloSignTexture(v);
      trackTex.push(ht);
      return ht;
    });
    for (let i = 0; i < holoSpecs.length; i++) {
      const hs = holoSpecs[i];
      const s = getTrackSample(hs.t, trackId);
      const hMat = new THREE.MeshBasicMaterial({
        map: holoTextures[hs.v],
        transparent: true,
        opacity: 0.84,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      disposables.push(hMat);
      const hm = new THREE.Mesh(holoGeo, hMat);
      const baseY = s.y + 4.4;
      hm.position.set(
        s.x + s.nx * hs.side * (roadHalfW + 5.8),
        baseY,
        s.z + s.nz * hs.side * (roadHalfW + 5.8)
      );
      hm.rotation.y = s.yaw + Math.PI - hs.side * 0.38;
      root.add(hm);
      holoBillboards.push({ mesh: hm, mat: hMat, baseY, phase: i * 1.3 });
    }

    // Cyber Sky Traffic (hover vehicles cruising high sky corridors)
    const CYBER_CARS = 12;
    const carHullGeo = new THREE.BoxGeometry(1.35, 0.52, 3.2);
    const carGlowGeo = new THREE.BoxGeometry(1.1, 0.22, 3.45);
    const carHullMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.7 });
    const carGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    disposables.push(carHullGeo, carGlowGeo, carHullMat, carGlowMat);
    cyberCarHullInst = new THREE.InstancedMesh(carHullGeo, carHullMat, CYBER_CARS);
    cyberCarGlowInst = new THREE.InstancedMesh(carGlowGeo, carGlowMat, CYBER_CARS);
    cyberCarHullInst.frustumCulled = false;
    cyberCarGlowInst.frustumCulled = false;
    disposables.push(cyberCarHullInst, cyberCarGlowInst);
    for (let i = 0; i < CYBER_CARS; i++) {
      const lane = i % 2;
      cyberTraffic.push({
        rx: lane === 0 ? 115 : 148,
        rz: lane === 0 ? 105 : 132,
        y: 26 + (i % 4) * 6.5,
        angle: (i / CYBER_CARS) * Math.PI * 2,
        speed: (lane === 0 ? 1 : -1) * (0.24 + (i % 3) * 0.05),
      });
      dummy.position.set(centerX, 30, centerZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cyberCarHullInst.setMatrixAt(i, dummy.matrix);
      cyberCarGlowInst.setMatrixAt(i, dummy.matrix);
      tmpWeatherColor.setHex(i % 2 === 0 ? 0x00f5d4 : 0xf72585);
      cyberCarGlowInst.setColorAt(i, tmpWeatherColor);
    }
    cyberCarHullInst.instanceMatrix.needsUpdate = true;
    cyberCarGlowInst.instanceMatrix.needsUpdate = true;
    if (cyberCarGlowInst.instanceColor) cyberCarGlowInst.instanceColor.needsUpdate = true;
    root.add(cyberCarHullInst, cyberCarGlowInst);
  } else if (baseId === 'polar') {
    // --- PIC POLAIRE: Glacier Ocean, Snowy Horizon Peaks, Snow Pines & Glowing Cyan Ice Zones ---
    const iceOceanGeo = new THREE.PlaneGeometry(1400, 1400);
    iceOceanGeo.rotateX(-Math.PI / 2);
    const iceOceanMat = new THREE.MeshStandardMaterial({
      color: 0x0c4a6e,
      roughness: 0.25,
      metalness: 0.15,
    });
    const iceOcean = new THREE.Mesh(iceOceanGeo, iceOceanMat);
    iceOcean.position.set(centerX, -2.8, centerZ);
    iceOcean.receiveShadow = true;
    root.add(iceOcean);

    const snowPeakGeo = new THREE.ConeGeometry(16, 36, 7);
    const snowPeakMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.65, flatShading: true });
    disposables.push(iceOceanGeo, iceOceanMat, snowPeakGeo, snowPeakMat);
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2 + rng() * 0.2;
      const dist = 170 + rng() * 140;
      const peak = new THREE.Mesh(snowPeakGeo, snowPeakMat);
      peak.position.set(centerX + Math.cos(ang) * dist, 10 + rng() * 8, centerZ + Math.sin(ang) * dist);
      peak.scale.set(0.7 + rng() * 1.1, 0.7 + rng() * 1.4, 0.7 + rng() * 1.1);
      root.add(peak);
    }

    // Translucent cyan ice patches rendered right over track `iceZones`
    const icePatchMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.56,
      roughness: 0.08,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    disposables.push(icePatchMat);
    for (const iz of meta?.iceZones || []) {
      const steps = 18;
      const iPos = [];
      const iIdx = [];
      for (let k = 0; k <= steps; k++) {
        const t = iz.startT + ((iz.endT - iz.startT) * k) / steps;
        const s = getTrackSample(t, trackId);
        const hw = (s.roadHalfWidth || roadHalfW) - 0.3;
        iPos.push(s.x - s.nx * hw, s.y + 0.045, s.z - s.nz * hw);
        iPos.push(s.x + s.nx * hw, s.y + 0.045, s.z + s.nz * hw);
        if (k < steps) {
          const b = k * 2;
          pushOrientedQuad(iIdx, iPos, b, b + 1, b + 2, b + 3, 0, 1, 0);
        }
      }
      const ig = new THREE.BufferGeometry();
      ig.setAttribute('position', new THREE.Float32BufferAttribute(iPos, 3));
      ig.setIndex(iIdx);
      ig.computeVertexNormals();
      root.add(new THREE.Mesh(ig, icePatchMat));
      disposables.push(ig);
    }

    // 3D Falling Crystal Snowflakes
    const SNOW_COUNT = 220;
    const snowGeo = new THREE.OctahedronGeometry(0.19, 0);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    disposables.push(snowGeo, snowMat);
    snowInst = new THREE.InstancedMesh(snowGeo, snowMat, SNOW_COUNT);
    snowInst.frustumCulled = false;
    disposables.push(snowInst);
    for (let i = 0; i < SNOW_COUNT; i++) {
      const sx = minX - 40 + rng() * (maxX - minX + 80);
      const sz = minZ - 40 + rng() * (maxZ - minZ + 80);
      const sy = rng() * 34;
      snowData.push({
        x: sx,
        y: sy,
        z: sz,
        fallSpeed: 3.6 + rng() * 3.2,
        swayFreq: 1.1 + rng() * 1.3,
        swayAmp: 1.4 + rng() * 2.2,
        phase: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.75,
        spin: (rng() - 0.5) * 4.5,
      });
      dummy.position.set(sx, sy, sz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      snowInst.setMatrixAt(i, dummy.matrix);
    }
    snowInst.instanceMatrix.needsUpdate = true;
    root.add(snowInst);

    // Undulating Aurora Borealis Curtains in the Polar Sky
    const auroraTex = createAuroraTexture();
    trackTex.push(auroraTex);
    const auroraPalettes = [
      [new THREE.Color(0x00f5d4), new THREE.Color(0x38bdf8), new THREE.Color(0xa855f7)],
      [new THREE.Color(0x34d399), new THREE.Color(0x22d3ee), new THREE.Color(0x818cf8)],
    ];
    for (let a = 0; a < 2; a++) {
      const segW = 36;
      const segH = 4;
      const aGeo = new THREE.PlaneGeometry(340, 68, segW, segH);
      const posAttr = aGeo.attributes.position;
      const cols = new Float32Array(posAttr.count * 3);
      const pal = auroraPalettes[a];
      const basePos = new Float32Array(posAttr.array.length);

      for (let v = 0; v < posAttr.count; v++) {
        const lx = posAttr.getX(v);
        const ly = posAttr.getY(v);
        const u = (lx + 170) / 340;
        const arcAngle = (u - 0.5) * 1.45;
        const radius = 265 + a * 35;
        const wx = Math.sin(arcAngle) * radius;
        const wz = -Math.cos(arcAngle) * radius;
        const wy = ly + 86 + a * 12;
        posAttr.setXYZ(v, wx, wy, wz);

        if (u < 0.5) tmpWeatherColor.copy(pal[0]).lerp(pal[1], u * 2);
        else tmpWeatherColor.copy(pal[1]).lerp(pal[2], (u - 0.5) * 2);
        cols[v * 3] = tmpWeatherColor.r;
        cols[v * 3 + 1] = tmpWeatherColor.g;
        cols[v * 3 + 2] = tmpWeatherColor.b;
      }
      basePos.set(posAttr.array);
      aGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

      const aMat = new THREE.MeshBasicMaterial({
        map: auroraTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      });
      disposables.push(aGeo, aMat);
      const aMesh = new THREE.Mesh(aGeo, aMat);
      aMesh.position.set(centerX, 0, centerZ);
      aMesh.rotation.y = a * 2.1 - 0.4;
      root.add(aMesh);
      auroraRibbons.push({
        posAttr,
        basePos,
        mat: aMat,
        phase: a * 2.3,
      });
    }
  } else if (baseId === 'pinball') {
    // --- FLIPPER ARCADE: Illuminated Cabinet Floor, Neon Star Pylons & 3D Bouncing Bumpers ---
    const cabFloorGeo = new THREE.PlaneGeometry(1400, 1400);
    cabFloorGeo.rotateX(-Math.PI / 2);
    const cabFloorMat = new THREE.MeshStandardMaterial({ color: 0x12062a, roughness: 0.4 });
    const cabFloor = new THREE.Mesh(cabFloorGeo, cabFloorMat);
    cabFloor.position.set(centerX, -3.2, centerZ);
    root.add(cabFloor);

    const starColGeo = new THREE.OctahedronGeometry(4.5, 0);
    const starColMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xc084fc,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });
    disposables.push(cabFloorGeo, cabFloorMat, starColGeo, starColMat);
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const d = 155 + (i % 3) * 38;
      const st = new THREE.Mesh(starColGeo, starColMat);
      st.position.set(centerX + Math.cos(ang) * d, 14 + (i % 2) * 10, centerZ + Math.sin(ang) * d);
      root.add(st);
      cosmicSpinners.push({ obj: st, speedY: 0.8 + (i % 3) * 0.3 });
    }

    // 3D Glowing Pinball Bumpers at meta.bumperSpots
    const bCoreGeo = new THREE.CylinderGeometry(1.5, 1.85, 1.35, 20);
    const bCapGeo = new THREE.CylinderGeometry(2.15, 1.65, 0.45, 20);
    const bRingGeo = new THREE.TorusGeometry(2.0, 0.22, 10, 22);
    bRingGeo.rotateX(Math.PI / 2);
    const bBodyMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf97316, emissiveIntensity: 0.55 });
    const bCapMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xf43f5e, emissiveIntensity: 0.85 });
    const bRingMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    disposables.push(bCoreGeo, bCapGeo, bRingGeo, bBodyMat, bCapMat, bRingMat);
    for (const bp of meta?.bumperSpots || []) {
      const grp = new THREE.Group();
      grp.position.set(bp.x, bp.y, bp.z);
      const scale = (bp.radius || 2.15) / 2.15;
      grp.scale.setScalar(scale);
      const core = new THREE.Mesh(bCoreGeo, bBodyMat);
      core.position.y = 0.68;
      const cap = new THREE.Mesh(bCapGeo, bCapMat);
      cap.position.y = 1.52;
      const ring = new THREE.Mesh(bRingGeo, bRingMat);
      ring.position.y = 0.9;
      grp.add(core, cap, ring);
      root.add(grp);
      bumperRings.push(ring);
    }

    // Dynamic Sweeping Arcade Spotlights
    const pinballSpots = [];
    const pSpotColors = [0xfacc15, 0xf43f5e, 0x00f5d4, 0xc084fc, 0x38bdf8, 0xff2a54];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.2;
      const dist = 128;
      pinballSpots.push({
        x: centerX + Math.sin(ang) * dist,
        y: 42,
        z: centerZ + Math.cos(ang) * dist,
        yaw: ang,
        color: pSpotColors[i % pSpotColors.length],
        baseTiltX: 0.72,
        ampX: 0.28,
        ampZ: 0.45,
        phase: i * 1.15,
      });
    }
    pinballSweepers = buildSweepingSpotlights(root, pinballSpots, disposables, {
      beamLength: 68,
      botR: 6.4,
    });
  } else if (baseId === 'volcano') {
    // --- VOLCAN MAGMA: Pulsing Molten Sea, Dark Volcanic Cones & Enriched Rising Embers ---
    lavaTex = createLavaTexture();
    trackTex.push(lavaTex);
    const lavaGeo = new THREE.PlaneGeometry(1400, 1400);
    lavaGeo.rotateX(-Math.PI / 2);
    lavaMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      map: lavaTex,
      emissive: 0xff5400,
      emissiveMap: lavaTex,
      emissiveIntensity: 1.15,
      roughness: 0.45,
    });
    const lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.position.set(centerX, -4.5, centerZ);
    root.add(lava);

    const coneGeo = new THREE.ConeGeometry(24, 48, 8);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x291a18, roughness: 0.9, flatShading: true });
    const emberGeo = new THREE.OctahedronGeometry(0.28, 0);
    const emberMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lavaRingGeo = new THREE.RingGeometry(46, 54, 40);
    lavaRingGeo.rotateX(-Math.PI / 2);
    disposables.push(lavaGeo, lavaMat, coneGeo, coneMat, emberGeo, emberMat, lavaRingGeo);

    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + rng() * 0.2;
      const dist = 165 + rng() * 130;
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(centerX + Math.cos(ang) * dist, 14, centerZ + Math.sin(ang) * dist);
      cone.scale.set(0.8 + rng(), 0.7 + rng() * 1.1, 0.8 + rng());
      root.add(cone);
    }

    // Pulsing molten caldera glow rings
    for (let r = 0; r < 3; r++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: r % 2 === 0 ? 0xf97316 : 0xfacc15,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(ringMat);
      lavaPulseMats.push(ringMat);
      const rm = new THREE.Mesh(lavaRingGeo, ringMat);
      rm.position.set(centerX + (r - 1) * 55, -4.2, centerZ + (r === 1 ? 45 : -35));
      rm.scale.setScalar(1 + r * 0.55);
      root.add(rm);
    }

    const EMBER_COUNT = 180;
    emberInst = new THREE.InstancedMesh(emberGeo, emberMat, EMBER_COUNT);
    emberInst.frustumCulled = false;
    disposables.push(emberInst);
    const emberPalette = [0xfde047, 0xfb923c, 0xf97316, 0xef4444];
    for (let i = 0; i < EMBER_COUNT; i++) {
      const ex = centerX + (rng() - 0.5) * 260;
      const ez = centerZ + (rng() - 0.5) * 260;
      const baseY = -1 + rng() * 14;
      volcanoEmbers.push({
        x: ex,
        z: ez,
        baseY,
        speed: 6.5 + rng() * 9.5,
        phase: rng() * 28,
        driftFreq: 1.5 + rng() * 2.0,
        driftAmp: 1.2 + rng() * 2.2,
        scale: 0.65 + rng() * 0.95,
      });
      dummy.position.set(ex, baseY, ez);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      emberInst.setMatrixAt(i, dummy.matrix);
      tmpWeatherColor.setHex(emberPalette[i % emberPalette.length]);
      emberInst.setColorAt(i, tmpWeatherColor);
    }
    emberInst.instanceMatrix.needsUpdate = true;
    if (emberInst.instanceColor) emberInst.instanceColor.needsUpdate = true;
    root.add(emberInst);
  } else if (baseId === 'rainbow') {
    // --- ROUTE CÉLESTE: Floating Cosmic Planets, Crystal Star Rings & Space Sparkles ---
    // Ringed Saturn Planet
    const planetGroup = new THREE.Group();
    planetGroup.position.set(centerX - 165, 58, centerZ + 175);
    planetGroup.rotation.set(0.35, 0.4, -0.28);
    const planetGeo = new THREE.SphereGeometry(28, 24, 18);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0xff70a6,
      emissive: 0x7209b7,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    const pRingGeo = new THREE.RingGeometry(36, 54, 40);
    pRingGeo.rotateX(Math.PI / 2);
    const pRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.68,
    });
    planetGroup.add(new THREE.Mesh(planetGeo, planetMat), new THREE.Mesh(pRingGeo, pRingMat));
    root.add(planetGroup);
    cosmicSpinners.push({ obj: planetGroup, speedY: 0.08 });
    disposables.push(planetGeo, planetMat, pRingGeo, pRingMat);

    // Glowing Golden Moon on opposite horizon
    const moonGeo = new THREE.SphereGeometry(18, 20, 16);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xffe66d,
      emissive: 0xffbe0b,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(centerX + 185, 72, centerZ - 160);
    root.add(moonMesh);
    disposables.push(moonGeo, moonMat);

    // Floating Cosmic Star Crystals outside road corridor
    const starCrystalGeo = new THREE.OctahedronGeometry(3.2, 0);
    const starCrystalColors = [0x00f5d4, 0xffbe0b, 0xff70a6, 0x8338ec];
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const rad = 125 + (i % 3) * 28;
      const cx = centerX + Math.cos(ang) * rad;
      const cz = centerZ + Math.sin(ang) * rad;
      if (evaluateTrackProximity(cx, cz).dist < roadHalfW + 16) continue;
      const cMat = new THREE.MeshStandardMaterial({
        color: starCrystalColors[i % starCrystalColors.length],
        emissive: starCrystalColors[i % starCrystalColors.length],
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.3,
      });
      disposables.push(cMat);
      const crystal = new THREE.Mesh(starCrystalGeo, cMat);
      crystal.position.set(cx, -8 + (i % 5) * 9, cz);
      crystal.scale.setScalar(0.8 + (i % 3) * 0.45);
      root.add(crystal);
      cosmicSpinners.push({ obj: crystal, speedY: 0.6 + (i % 4) * 0.25 });
    }
    disposables.push(starCrystalGeo);

    // 3 Giant Spinning Golden Star Rings overarching Route Céleste
    const starArchRadius = roadHalfW + 2.4;
    const starRingGeo = new THREE.TorusGeometry(starArchRadius, 0.36, 10, 36);
    const miniStarGeo = new THREE.OctahedronGeometry(0.95, 0);
    const starRingMat = new THREE.MeshStandardMaterial({
      color: 0xffd60a,
      emissive: 0xffbe0b,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.4,
    });
    const gemStarMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x00bbf9,
      emissiveIntensity: 0.9,
      roughness: 0.15,
    });
    disposables.push(starRingGeo, miniStarGeo, starRingMat, gemStarMat);

    for (const [idx, tRing] of [0.12, 0.43, 0.89].entries()) {
      const s = getTrackSample(tRing, trackId);
      const ringContainer = new THREE.Group();
      ringContainer.position.set(s.x, s.y + 1.2, s.z);
      ringContainer.rotation.y = s.yaw;

      const spinRing = new THREE.Group();
      const mainRing = new THREE.Mesh(starRingGeo, starRingMat);
      spinRing.add(mainRing);

      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const gem = new THREE.Mesh(miniStarGeo, k % 2 === 0 ? gemStarMat : starRingMat);
        gem.position.set(Math.cos(a) * starArchRadius, Math.sin(a) * starArchRadius, 0);
        spinRing.add(gem);
      }
      ringContainer.add(spinRing);
      root.add(ringContainer);
      cosmicSpinners.push({ obj: spinRing, speedZ: idx % 2 === 0 ? 0.55 : -0.55 });
    }

    // Sparkling Cosmic Stardust floating around the sky ribbon
    const DUST_COUNT = 200;
    const dustGeo = new THREE.OctahedronGeometry(0.18, 0);
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(dustGeo, dustMat);
    cosmicDustInst = new THREE.InstancedMesh(dustGeo, dustMat, DUST_COUNT);
    cosmicDustInst.frustumCulled = false;
    disposables.push(cosmicDustInst);
    const dustPalette = [0x00f5d4, 0xffbe0b, 0xff70a6, 0x38bdf8, 0xe879f9];
    for (let i = 0; i < DUST_COUNT; i++) {
      const s = samples[Math.floor(rng() * samples.length)];
      const lat = (rng() - 0.5) * 46;
      const dx = s.x + s.nx * lat;
      const dz = s.z + s.nz * lat;
      const dy = s.y + (rng() - 0.35) * 18;
      cosmicDustData.push({
        x: dx,
        y: dy,
        z: dz,
        phase: rng() * Math.PI * 2,
        twinkleSpeed: 2.2 + rng() * 3.8,
        driftSpeed: 0.5 + rng() * 0.9,
        baseScale: 0.6 + rng() * 1.1,
      });
      dummy.position.set(dx, dy, dz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cosmicDustInst.setMatrixAt(i, dummy.matrix);
      tmpWeatherColor.setHex(dustPalette[i % dustPalette.length]);
      cosmicDustInst.setColorAt(i, tmpWeatherColor);
    }
    cosmicDustInst.instanceMatrix.needsUpdate = true;
    if (cosmicDustInst.instanceColor) cosmicDustInst.instanceColor.needsUpdate = true;
    root.add(cosmicDustInst);

    // Shooting Stars streaking across the cosmic sky dome
    const starHeadGeo = new THREE.OctahedronGeometry(0.95, 0);
    const starTailGeo = new THREE.ConeGeometry(0.55, 22, 6);
    starTailGeo.rotateX(-Math.PI * 0.5);
    starTailGeo.translate(0, 0, -11);
    const starHeadMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const starTailMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    disposables.push(starHeadGeo, starTailGeo, starHeadMat, starTailMat);

    for (let i = 0; i < 7; i++) {
      const sg = new THREE.Group();
      const head = new THREE.Mesh(starHeadGeo, starHeadMat);
      const tail = new THREE.Mesh(starTailGeo, starTailMat);
      sg.add(head, tail);
      root.add(sg);

      const az = (i / 7) * Math.PI * 2 + 0.4;
      const rad = 220 + (i % 3) * 45;
      const sx = centerX + Math.cos(az) * rad;
      const sz = centerZ + Math.sin(az) * rad;
      const sy = 55 + (i % 4) * 24;
      const vx = -Math.sin(az) * 140 + 35;
      const vy = -22 - (i % 3) * 10;
      const vz = Math.cos(az) * 140 - 25;
      sg.position.set(sx, sy, sz);
      sg.lookAt(sx + vx, sy + vy, sz + vz);
      shootingStars.push({
        group: sg,
        startX: sx,
        startY: sy,
        startZ: sz,
        vx,
        vy,
        vz,
        cycle: 3.4 + (i % 3) * 1.1,
        offset: i * 1.15,
      });
    }
  }

  // 3. ROAD RIBBON + CONDITIONAL 3D CURBSTONES (respecting `hasGuardrail` on Rainbow Sky!)
  const N = samples.length;
  const roadPos = new Float32Array((N + 1) * 2 * 3);
  const roadUV = new Float32Array((N + 1) * 2 * 2);
  const roadCol = new Float32Array((N + 1) * 2 * 3);
  const roadIndices = [];
  const tmpRainbow = new THREE.Color();

  let arcDist = 0;
  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    if (i > 0) {
      const prev = samples[(i - 1) % N];
      arcDist += Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z);
    }

    const hw = (s.roadHalfWidth || roadHalfW) + 0.12;
    const roadY = s.y + 0.025;

    const iL = i * 2;
    const iR = i * 2 + 1;
    roadPos[iL * 3] = s.x - s.nx * hw;
    roadPos[iL * 3 + 1] = roadY;
    roadPos[iL * 3 + 2] = s.z - s.nz * hw;

    roadPos[iR * 3] = s.x + s.nx * hw;
    roadPos[iR * 3 + 1] = roadY;
    roadPos[iR * 3 + 2] = s.z + s.nz * hw;

    roadUV[iL * 2] = 0;
    roadUV[iL * 2 + 1] = arcDist * 0.085;
    roadUV[iR * 2] = 1;
    roadUV[iR * 2 + 1] = arcDist * 0.085;

    if (baseId === 'rainbow') {
      const hueL = ((i / N) * 5.0) % 1;
      const hueR = (hueL + 0.14) % 1;
      tmpRainbow.setHSL(hueL, 0.95, 0.62);
      roadCol[iL * 3] = tmpRainbow.r;
      roadCol[iL * 3 + 1] = tmpRainbow.g;
      roadCol[iL * 3 + 2] = tmpRainbow.b;
      tmpRainbow.setHSL(hueR, 0.95, 0.62);
      roadCol[iR * 3] = tmpRainbow.r;
      roadCol[iR * 3 + 1] = tmpRainbow.g;
      roadCol[iR * 3 + 2] = tmpRainbow.b;
    } else {
      roadCol.fill(1, iL * 3, iL * 3 + 6);
    }

    if (i < N) {
      pushOrientedQuad(roadIndices, roadPos, iL, iR, iL + 2, iR + 2, 0, 1, 0);
    }
  }

  const roadTex = createRoadTexture(trackId);
  trackTex.push(roadTex);
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUV, 2));
  roadGeo.setAttribute('color', new THREE.BufferAttribute(roadCol, 3));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    vertexColors: true,
    roughness: baseId === 'neon' ? 0.24 : baseId === 'rainbow' ? 0.2 : 0.72,
    metalness: baseId === 'neon' ? 0.35 : baseId === 'rainbow' ? 0.18 : 0.06,
    transparent: baseId === 'rainbow',
    opacity: baseId === 'rainbow' ? 0.9 : 1.0,
    side: baseId === 'rainbow' ? THREE.DoubleSide : THREE.FrontSide,
    emissive: baseId === 'neon' || baseId === 'rainbow' ? 0xffffff : 0x000000,
    emissiveMap: baseId === 'neon' ? roadTex : null,
    emissiveIntensity: baseId === 'neon' ? 0.45 : baseId === 'rainbow' ? 0.22 : 0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  root.add(roadMesh);
  disposables.push(roadGeo, roadMat);

  // 3b. Raised 3D Curbstones, Safety Guardrails & Unwalled Ditch Retaining Walls
  const curbPos = [];
  const curbCol = [];
  const curbIndices = [];
  const railPos = [];
  const railCol = [];
  const railIndices = [];
  const ditchPos = [];
  const ditchCol = [];
  const ditchIndices = [];
  const railPostPositions = [];

  const cCurbA = new THREE.Color(
    baseId === 'neon' ? '#00f5d4' : baseId === 'rainbow' ? '#ffe600' : baseId === 'polar' ? '#38bdf8' : baseId === 'pinball' ? '#facc15' : baseId === 'volcano' ? '#f97316' : '#ff2438'
  );
  const cCurbB = new THREE.Color(
    baseId === 'neon' ? '#f72585' : baseId === 'rainbow' ? '#00f5d4' : baseId === 'polar' ? '#ffffff' : baseId === 'pinball' ? '#c084fc' : baseId === 'volcano' ? '#291a18' : '#ffffff'
  );
  const cSkirt = new THREE.Color(
    baseId === 'neon' ? '#1e1b4b' : baseId === 'rainbow' ? '#7209b7' : baseId === 'polar' ? '#0284c7' : baseId === 'pinball' ? '#4c1d95' : baseId === 'volcano' ? '#450a0a' : '#27ae60'
  );
  const cRailA = new THREE.Color(
    baseId === 'neon' ? '#00f5d4' : baseId === 'rainbow' ? '#ffd60a' : baseId === 'polar' ? '#7dd3fc' : baseId === 'pinball' ? '#facc15' : baseId === 'volcano' ? '#fb923c' : '#ef4444'
  );
  const cRailB = new THREE.Color(
    baseId === 'neon' ? '#f72585' : baseId === 'rainbow' ? '#a855f7' : baseId === 'polar' ? '#e0f2fe' : baseId === 'pinball' ? '#f43f5e' : baseId === 'volcano' ? '#fde047' : '#ffffff'
  );
  const cDitchRim = new THREE.Color(baseId === 'rainbow' ? '#f59e0b' : '#ff2e63');
  const cDitchWall = new THREE.Color(
    baseId === 'neon' ? '#160d35' : baseId === 'rainbow' ? '#2e1065' : '#334155'
  );

  const shortcutZones = meta?.shortcutZones || [];
  const blockStep = 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const tMid = (i + 0.5) / N;
      if (
        shortcutZones.some(
          (sz) =>
            Math.sign(sz.lateral) === side &&
            tMid >= sz.startT - 0.015 &&
            tMid <= sz.endT + 0.015
        )
      ) {
        continue;
      }

      const s0 = samples[i];
      const s1 = samples[(i + 1) % N];
      const hw0 = s0.roadHalfWidth || roadHalfW;
      const hw1 = s1.roadHalfWidth || roadHalfW;
      const outX = s0.nx * side;
      const outZ = s0.nz * side;

      // In ditch/void gapZones: omit curbs & guardrails and draw a steep 3D trench drop wall!
      if (s0.hasGuardrail === false || s1.hasGuardrail === false) {
        const wallDrop = baseId === 'rainbow' ? -1.45 : -2.65;
        const rimDrop = -0.22;
        const baseD = ditchPos.length / 3;
        const dPts = [
          [s0.x + s0.nx * side * (hw0 + 0.08), s0.y + 0.03, s0.z + s0.nz * side * (hw0 + 0.08), cDitchRim],
          [s0.x + s0.nx * side * (hw0 + 0.16), s0.y + rimDrop, s0.z + s0.nz * side * (hw0 + 0.16), cDitchWall],
          [s0.x + s0.nx * side * (hw0 + 0.35), s0.y + wallDrop, s0.z + s0.nz * side * (hw0 + 0.35), cDitchWall],
          [s1.x + s1.nx * side * (hw1 + 0.08), s1.y + 0.03, s1.z + s1.nz * side * (hw1 + 0.08), cDitchRim],
          [s1.x + s1.nx * side * (hw1 + 0.16), s1.y + rimDrop, s1.z + s1.nz * side * (hw1 + 0.16), cDitchWall],
          [s1.x + s1.nx * side * (hw1 + 0.35), s1.y + wallDrop, s1.z + s1.nz * side * (hw1 + 0.35), cDitchWall],
        ];
        for (const p of dPts) {
          ditchPos.push(p[0], p[1], p[2]);
          ditchCol.push(p[3].r, p[3].g, p[3].b);
        }
        pushOrientedQuad(ditchIndices, ditchPos, baseD + 0, baseD + 1, baseD + 3, baseD + 4, outX, 0.25, outZ);
        pushOrientedQuad(ditchIndices, ditchPos, baseD + 1, baseD + 2, baseD + 4, baseD + 5, outX, 0.1, outZ);
        continue;
      }

      const topCol = Math.floor(i / blockStep) % 2 === 0 ? cCurbA : cCurbB;

      const innerOff = -0.05;
      const innerTopOff = 0.12;
      const outerTopOff = 0.92;
      const outerBotOff = baseId === 'rainbow' ? 0.98 : 1.42;
      const curbH = baseId === 'rainbow' ? 0.24 : 0.15;
      const skirtDrop = baseId === 'rainbow' ? -0.18 : -0.45;

      const baseIdx = curbPos.length / 3;
      const pts = [
        [s0.x + s0.nx * side * (hw0 + innerOff), s0.y + 0.02, s0.z + s0.nz * side * (hw0 + innerOff), topCol],
        [s0.x + s0.nx * side * (hw0 + innerTopOff), s0.y + curbH, s0.z + s0.nz * side * (hw0 + innerTopOff), topCol],
        [s0.x + s0.nx * side * (hw0 + outerTopOff), s0.y + curbH * 0.88, s0.z + s0.nz * side * (hw0 + outerTopOff), topCol],
        [s0.x + s0.nx * side * (hw0 + outerBotOff), s0.y + skirtDrop, s0.z + s0.nz * side * (hw0 + outerBotOff), cSkirt],
        [s1.x + s1.nx * side * (hw1 + innerOff), s1.y + 0.02, s1.z + s1.nz * side * (hw1 + innerOff), topCol],
        [s1.x + s1.nx * side * (hw1 + innerTopOff), s1.y + curbH, s1.z + s1.nz * side * (hw1 + innerTopOff), topCol],
        [s1.x + s1.nx * side * (hw1 + outerTopOff), s1.y + curbH * 0.88, s1.z + s1.nz * side * (hw1 + outerTopOff), topCol],
        [s1.x + s1.nx * side * (hw1 + outerBotOff), s1.y + skirtDrop, s1.z + s1.nz * side * (hw1 + outerBotOff), cSkirt],
      ];

      for (const p of pts) {
        curbPos.push(p[0], p[1], p[2]);
        curbCol.push(p[3].r, p[3].g, p[3].b);
      }

      pushOrientedQuad(curbIndices, curbPos, baseIdx + 0, baseIdx + 1, baseIdx + 4, baseIdx + 5, -outX * 0.5, 1, -outZ * 0.5);
      pushOrientedQuad(curbIndices, curbPos, baseIdx + 1, baseIdx + 2, baseIdx + 5, baseIdx + 6, 0, 1, 0);
      pushOrientedQuad(curbIndices, curbPos, baseIdx + 2, baseIdx + 3, baseIdx + 6, baseIdx + 7, outX, 0.6, outZ);

      // Raised 3D Mario-Kart safety guardrail beam + periodic posts
      const rCol = Math.floor(i / blockStep) % 2 === 0 ? cRailA : cRailB;
      const rIn = 0.78;
      const rOut = 0.98;
      const rBot = 0.28;
      const rTop = 0.78;
      const baseR = railPos.length / 3;
      const rPts = [
        [s0.x + s0.nx * side * (hw0 + rIn), s0.y + rBot, s0.z + s0.nz * side * (hw0 + rIn), rCol],
        [s0.x + s0.nx * side * (hw0 + rIn), s0.y + rTop, s0.z + s0.nz * side * (hw0 + rIn), rCol],
        [s0.x + s0.nx * side * (hw0 + rOut), s0.y + rTop, s0.z + s0.nz * side * (hw0 + rOut), rCol],
        [s0.x + s0.nx * side * (hw0 + rOut), s0.y + rBot, s0.z + s0.nz * side * (hw0 + rOut), rCol],
        [s1.x + s1.nx * side * (hw1 + rIn), s1.y + rBot, s1.z + s1.nz * side * (hw1 + rIn), rCol],
        [s1.x + s1.nx * side * (hw1 + rIn), s1.y + rTop, s1.z + s1.nz * side * (hw1 + rIn), rCol],
        [s1.x + s1.nx * side * (hw1 + rOut), s1.y + rTop, s1.z + s1.nz * side * (hw1 + rOut), rCol],
        [s1.x + s1.nx * side * (hw1 + rOut), s1.y + rBot, s1.z + s1.nz * side * (hw1 + rOut), rCol],
      ];
      for (const p of rPts) {
        railPos.push(p[0], p[1], p[2]);
        railCol.push(p[3].r, p[3].g, p[3].b);
      }
      pushOrientedQuad(railIndices, railPos, baseR + 0, baseR + 1, baseR + 4, baseR + 5, -outX, 0, -outZ);
      pushOrientedQuad(railIndices, railPos, baseR + 1, baseR + 2, baseR + 5, baseR + 6, 0, 1, 0);
      pushOrientedQuad(railIndices, railPos, baseR + 2, baseR + 3, baseR + 6, baseR + 7, outX, 0, outZ);

      if (i % 4 === 0) {
        railPostPositions.push([
          s0.x + s0.nx * side * (hw0 + 0.88),
          s0.y + 0.36,
          s0.z + s0.nz * side * (hw0 + 0.88),
        ]);
      }
    }
  }

  if (curbIndices.length > 0) {
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(curbPos), 3));
    curbGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(curbCol), 3));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: baseId === 'coco' ? 0.48 : 0.25,
      metalness: 0.08,
      emissive: baseId === 'coco' ? 0x000000 : 0xffffff,
      emissiveIntensity: baseId === 'coco' ? 0 : 0.26,
    });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.castShadow = true;
    curbMesh.receiveShadow = true;
    root.add(curbMesh);
    disposables.push(curbGeo, curbMat);
  }

  if (railIndices.length > 0) {
    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(railPos), 3));
    railGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(railCol), 3));
    railGeo.setIndex(railIndices);
    railGeo.computeVertexNormals();

    const railMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: baseId === 'coco' ? 0.32 : 0.2,
      metalness: 0.22,
      emissive: baseId === 'coco' ? 0x000000 : 0xffffff,
      emissiveIntensity: baseId === 'coco' ? 0 : 0.35,
    });
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.castShadow = true;
    root.add(railMesh);
    disposables.push(railGeo, railMat);
  }

  if (railPostPositions.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.72, 6);
    const postMat = new THREE.MeshStandardMaterial({
      color: baseId === 'neon' ? 0x334155 : baseId === 'rainbow' ? 0xfbbf24 : 0x64748b,
      roughness: 0.4,
      metalness: 0.45,
    });
    const postInst = new THREE.InstancedMesh(postGeo, postMat, railPostPositions.length);
    for (let p = 0; p < railPostPositions.length; p++) {
      const pos = railPostPositions[p];
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      postInst.setMatrixAt(p, dummy.matrix);
    }
    postInst.instanceMatrix.needsUpdate = true;
    root.add(postInst);
    disposables.push(postGeo, postMat);
  }

  if (ditchIndices.length > 0) {
    const ditchGeo = new THREE.BufferGeometry();
    ditchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ditchPos), 3));
    ditchGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ditchCol), 3));
    ditchGeo.setIndex(ditchIndices);
    ditchGeo.computeVertexNormals();

    const ditchMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.1,
    });
    const ditchMesh = new THREE.Mesh(ditchGeo, ditchMat);
    ditchMesh.receiveShadow = true;
    root.add(ditchMesh);
    disposables.push(ditchGeo, ditchMat);
  }

  // 3c. Visible Off-Road Shortcut Strips (`meta.shortcutZones`)
  if (shortcutZones.length > 0) {
    const shortcutMat = new THREE.MeshStandardMaterial({
      color: baseId === 'neon' ? 0xf72585 : baseId === 'polar' ? 0x38bdf8 : baseId === 'volcano' ? 0xf97316 : 0xe9b872,
      emissive: baseId === 'neon' ? 0x7209b7 : 0x78350f,
      emissiveIntensity: baseId === 'neon' ? 0.4 : 0.14,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });
    disposables.push(shortcutMat);
    for (const sz of shortcutZones) {
      const steps = 16;
      const scPos = [];
      const scIdx = [];
      const hw = sz.halfWidth || 3.2;
      for (let k = 0; k <= steps; k++) {
        const t = sz.startT + ((sz.endT - sz.startT) * k) / steps;
        const s = getTrackSample(t, trackId);
        const cx = s.x + s.nx * sz.lateral;
        const cz = s.z + s.nz * sz.lateral;
        scPos.push(cx - s.nx * hw, s.y + 0.03, cz - s.nz * hw);
        scPos.push(cx + s.nx * hw, s.y + 0.03, cz + s.nz * hw);
        if (k < steps) {
          const b = k * 2;
          pushOrientedQuad(scIdx, scPos, b, b + 1, b + 2, b + 3, 0, 1, 0);
        }
      }
      const scGeo = new THREE.BufferGeometry();
      scGeo.setAttribute('position', new THREE.Float32BufferAttribute(scPos, 3));
      scGeo.setIndex(scIdx);
      scGeo.computeVertexNormals();
      const scMesh = new THREE.Mesh(scGeo, shortcutMat);
      scMesh.receiveShadow = true;
      root.add(scMesh);
      disposables.push(scGeo);
    }
  }

  // 4. START / FINISH FESTIVE GANTRY ARCH AT t = 0
  const startSample = getTrackSample(0, trackId);
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(startSample.x, startSample.y, startSample.z);
  gantryGroup.rotation.y = startSample.yaw;
  root.add(gantryGroup);

  const checkerTex = createCheckeredLineTexture();
  trackTex.push(checkerTex);
  const startLineGeo = new THREE.PlaneGeometry(roadHalfW * 2.02, 2.5);
  startLineGeo.rotateX(-Math.PI / 2);
  const startLineMat = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const startLineMesh = new THREE.Mesh(startLineGeo, startLineMat);
  startLineMesh.position.y = 0.045;
  startLineMesh.receiveShadow = true;
  gantryGroup.add(startLineMesh);
  disposables.push(startLineGeo, startLineMat);

  const pillarSpan = roadHalfW + 1.45;
  const pillarH = 7.4;
  const pillarGeo = new THREE.CylinderGeometry(0.46, 0.58, pillarH, 14);
  const baseGeo = new THREE.CylinderGeometry(0.95, 1.15, 0.75, 12);
  const ringGeo = new THREE.TorusGeometry(0.56, 0.14, 8, 16);
  ringGeo.rotateX(Math.PI / 2);

  const primaryPillarMat = new THREE.MeshStandardMaterial({
    color: baseId === 'neon' ? 0xf72585 : baseId === 'rainbow' ? 0x8338ec : 0xff3b4e,
    emissive: baseId === 'coco' ? 0x000000 : 0x3a0ca3,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });
  const accentPillarMat = new THREE.MeshStandardMaterial({
    color: baseId === 'neon' ? 0x00f5d4 : 0xffbe0b,
    emissive: baseId === 'neon' ? 0x00bbf9 : 0x000000,
    emissiveIntensity: 0.3,
    roughness: 0.3,
  });
  const whiteToyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  disposables.push(pillarGeo, baseGeo, ringGeo, primaryPillarMat, accentPillarMat, whiteToyMat);

  for (const sx of [-1, 1]) {
    const px = sx * pillarSpan;
    const pillar = new THREE.Mesh(pillarGeo, primaryPillarMat);
    pillar.position.set(px, pillarH * 0.5, 0);
    pillar.castShadow = true;
    gantryGroup.add(pillar);

    const base = new THREE.Mesh(baseGeo, accentPillarMat);
    base.position.set(px, 0.38, 0);
    gantryGroup.add(base);

    for (let r = 0; r < 3; r++) {
      const stripeRing = new THREE.Mesh(ringGeo, r % 2 === 0 ? whiteToyMat : accentPillarMat);
      stripeRing.position.set(px, 1.8 + r * 2.0, 0);
      gantryGroup.add(stripeRing);
    }
  }

  const crossGeo = new THREE.CylinderGeometry(0.32, 0.32, pillarSpan * 2.08, 12);
  crossGeo.rotateZ(Math.PI / 2);
  const crossTop = new THREE.Mesh(crossGeo, accentPillarMat);
  crossTop.position.set(0, pillarH + 0.1, 0);
  const crossBot = new THREE.Mesh(crossGeo, accentPillarMat);
  crossBot.position.set(0, pillarH - 2.35, 0);
  gantryGroup.add(crossTop, crossBot);
  disposables.push(crossGeo);

  const bannerTex = createGantryBannerTexture(trackId);
  trackTex.push(bannerTex);
  const bannerGeo = new THREE.BoxGeometry(pillarSpan * 1.9, 2.3, 0.38);
  const bannerFaceMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    roughness: 0.32,
    emissive: 0xffffff,
    emissiveMap: bannerTex,
    emissiveIntensity: baseId === 'coco' ? 0.22 : 0.55,
  });
  const bannerMesh = new THREE.Mesh(bannerGeo, [
    accentPillarMat,
    accentPillarMat,
    accentPillarMat,
    accentPillarMat,
    bannerFaceMat,
    bannerFaceMat,
  ]);
  bannerMesh.position.set(0, pillarH - 1.12, 0);
  bannerMesh.castShadow = true;
  gantryGroup.add(bannerMesh);
  disposables.push(bannerGeo, bannerFaceMat);

  // Mario-Kart suspended start-light pods below gantry banner
  const lightBarGeo = new THREE.BoxGeometry(4.4, 0.52, 0.52);
  const lightPodGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.56, 10);
  lightPodGeo.rotateX(Math.PI / 2);
  const lightBarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });
  const lampColors = [0xff2e63, 0xff2e63, 0xffbe0b, 0x00e676, 0x00e676];
  disposables.push(lightBarGeo, lightPodGeo, lightBarMat);
  const lightBar = new THREE.Mesh(lightBarGeo, lightBarMat);
  lightBar.position.set(0, pillarH - 2.65, 0);
  gantryGroup.add(lightBar);
  const gantryLampMats = [];
  for (let l = 0; l < 5; l++) {
    const lx = (l - 2) * 0.88;
    const lampMat = new THREE.MeshStandardMaterial({
      color: lampColors[l],
      emissive: lampColors[l],
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    disposables.push(lampMat);
    gantryLampMats.push(lampMat);
    const pod = new THREE.Mesh(lightPodGeo, lampMat);
    pod.position.set(lx, pillarH - 2.65, 0);
    gantryGroup.add(pod);
  }

  // Animated Chasing LED Trim around Start/Finish Gantry (top crossbar + pillars)
  const gantryLeds = [];
  const topLedCount = 18;
  for (let i = 0; i < topLedCount; i++) {
    const u = i / (topLedCount - 1);
    const lx = THREE.MathUtils.lerp(-pillarSpan * 0.92, pillarSpan * 0.92, u);
    gantryLeds.push({ x: lx, y: pillarH + 0.34, z: 0.24, order: i });
    gantryLeds.push({ x: lx, y: pillarH + 0.34, z: -0.24, order: i });
  }
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 6; j++) {
      gantryLeds.push({ x: sx * (pillarSpan + sx * 0.42), y: 1.2 + j * 1.0, z: 0, order: j });
    }
  }
  const ledGeo = new THREE.BoxGeometry(0.28, 0.22, 0.22);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  disposables.push(ledGeo, ledMat);
  const gantryLedInst = new THREE.InstancedMesh(ledGeo, ledMat, gantryLeds.length);
  disposables.push(gantryLedInst);
  for (let i = 0; i < gantryLeds.length; i++) {
    const gl = gantryLeds[i];
    dummy.position.set(gl.x, gl.y, gl.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    gantryLedInst.setMatrixAt(i, dummy.matrix);
    tmpWeatherColor.setHex(0xffbe0b);
    gantryLedInst.setColorAt(i, tmpWeatherColor);
  }
  gantryLedInst.instanceMatrix.needsUpdate = true;
  if (gantryLedInst.instanceColor) gantryLedInst.instanceColor.needsUpdate = true;
  gantryGroup.add(gantryLedInst);

  // Festive Balloons tethered to gantry pillars
  const balloons = [];
  const balloonGeo = new THREE.SphereGeometry(0.62, 14, 12);
  balloonGeo.scale(1, 1.22, 1);
  disposables.push(balloonGeo);
  for (const b of [
    { x: -pillarSpan - 0.8, y: pillarH + 2.0, z: 0.3, color: 0xff3b4e, phase: 0.0 },
    { x: -pillarSpan + 0.4, y: pillarH + 2.8, z: -0.3, color: 0xffbe0b, phase: 1.4 },
    { x: pillarSpan + 0.8, y: pillarH + 2.1, z: -0.2, color: 0x00bbf9, phase: 2.3 },
    { x: pillarSpan - 0.4, y: pillarH + 2.9, z: 0.3, color: 0xff70a6, phase: 3.7 },
  ]) {
    const bMat = new THREE.MeshStandardMaterial({
      color: b.color,
      emissive: b.color,
      emissiveIntensity: baseId === 'coco' ? 0.08 : 0.35,
      roughness: 0.18,
    });
    disposables.push(bMat);
    const mesh = new THREE.Mesh(balloonGeo, bMat);
    mesh.position.set(b.x, b.y, b.z);
    gantryGroup.add(mesh);
    balloons.push({ mesh, baseX: b.x, baseY: b.y, phase: b.phase });
  }

  // 5. BOOST PADS AT meta.boostPadSpots
  const boostSpots = meta?.boostPadSpots || [];
  const boostTex = createBoostPadTexture(['#00f5d4', '#ffe600', '#ff2a85'], '#140b2e');
  trackTex.push(boostTex);
  const boostMat = new THREE.MeshStandardMaterial({
    map: boostTex,
    emissive: 0xffffff,
    emissiveMap: boostTex,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const boostFrameMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00bbf9,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  const boostGeo = new THREE.PlaneGeometry(3.1, 5.4);
  boostGeo.rotateX(-Math.PI / 2);
  boostGeo.rotateY(Math.PI); // v=1 at +Z forward
  const railGeo = new THREE.BoxGeometry(0.18, 0.08, 5.5);
  disposables.push(boostMat, boostFrameMat, boostGeo, railGeo);

  for (const spot of boostSpots) {
    const s = getTrackSample(spot.t ?? 0, trackId);
    const padGroup = new THREE.Group();
    padGroup.rotation.order = 'YXZ';
    padGroup.position.set(spot.x, spot.y + 0.048, spot.z);
    padGroup.rotation.y = spot.yaw ?? s.yaw;
    padGroup.rotation.x = -Math.atan2(s.ty || 0, Math.hypot(s.tx, s.tz) || 1);

    const padMesh = new THREE.Mesh(boostGeo, boostMat);
    const leftRail = new THREE.Mesh(railGeo, boostFrameMat);
    leftRail.position.set(-1.62, 0.02, 0);
    const rightRail = new THREE.Mesh(railGeo, boostFrameMat);
    rightRail.position.set(1.62, 0.02, 0);
    padGroup.add(padMesh, leftRail, rightRail);
    root.add(padGroup);
  }

  // 6. 3D JUMP RAMPS AT meta.rampSpots WITH ANIMATED UPWARD BOOST CHEVRONS!
  const rampSpots = meta?.rampSpots || [];
  const rampTex = createBoostPadTexture(['#ffbe0b', '#ff5400', '#00f5d4'], '#1f1147');
  trackTex.push(rampTex);
  const rampMat = new THREE.MeshStandardMaterial({
    map: rampTex,
    emissive: 0xffffff,
    emissiveMap: rampTex,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });
  const rampSideMat = new THREE.MeshStandardMaterial({
    color: 0xff9e00,
    emissive: 0xff5400,
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });
  disposables.push(rampMat, rampSideMat);

  for (const ramp of rampSpots) {
    const s = getTrackSample(ramp.t ?? 0, trackId);
    const rw = ramp.width || 4.4;
    const rl = ramp.length || 5.4;
    const lipH = 0.95;

    const rGeo = buildJumpRampGeometry(rw, rl, lipH);
    const rRailGeo = new THREE.BoxGeometry(0.22, 0.18, Math.hypot(rl, lipH));
    disposables.push(rGeo, rRailGeo);

    const rGroup = new THREE.Group();
    rGroup.rotation.order = 'YXZ';
    rGroup.position.set(ramp.x, ramp.y + 0.01, ramp.z);
    rGroup.rotation.y = ramp.yaw ?? s.yaw;
    rGroup.rotation.x = -Math.atan2(s.ty || 0, Math.hypot(s.tx, s.tz) || 1);

    const wedge = new THREE.Mesh(rGeo, rampMat);
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    rGroup.add(wedge);

    const slopeAngle = -Math.atan2(lipH, rl);
    for (const sx of [-1, 1]) {
      const sideRail = new THREE.Mesh(rRailGeo, rampSideMat);
      sideRail.position.set(sx * (rw * 0.5 + 0.08), lipH * 0.5 + 0.05, 0);
      sideRail.rotation.x = slopeAngle;
      rGroup.add(sideRail);
    }

    root.add(rGroup);
  }

  // 7. V3 3D TURN CHEVRON SIGNS AT meta.turnSigns (facing oncoming drivers!)
  const turnSigns = meta?.turnSigns || [];
  let turnSignRightMat = null;
  let turnSignLeftMat = null;
  if (turnSigns.length > 0) {
    const rightTex = createTurnChevronTexture(1, trackId);
    const leftTex = createTurnChevronTexture(-1, trackId);
    trackTex.push(rightTex, leftTex);

    turnSignRightMat = new THREE.MeshStandardMaterial({
      map: rightTex,
      emissive: 0xffffff,
      emissiveMap: rightTex,
      emissiveIntensity: 0.85,
      roughness: 0.25,
    });
    turnSignLeftMat = new THREE.MeshStandardMaterial({
      map: leftTex,
      emissive: 0xffffff,
      emissiveMap: leftTex,
      emissiveIntensity: 0.85,
      roughness: 0.25,
    });
    const signBackMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.3,
    });
    const signBoardGeo = new THREE.BoxGeometry(3.1, 1.48, 0.22);
    const signPostGeo = new THREE.CylinderGeometry(0.13, 0.17, 2.2, 8);
    disposables.push(turnSignRightMat, turnSignLeftMat, signBackMat, signBoardGeo, signPostGeo);

    for (const ts of turnSigns) {
      const s = getTrackSample(ts.t ?? 0, trackId);
      const faceMat = (ts.turnDir ?? 1) >= 0 ? turnSignRightMat : turnSignLeftMat;

      const signGroup = new THREE.Group();
      signGroup.position.set(ts.x, ts.y, ts.z);
      // Face oncoming drivers (-T => sample.yaw + PI), angled slightly inward (-sideSign) toward road center!
      const sideSign = ts.side || 1;
      signGroup.rotation.y = (s.yaw ?? ts.yaw ?? 0) + Math.PI - sideSign * 0.26;

      const postL = new THREE.Mesh(signPostGeo, signBackMat);
      postL.position.set(-0.95, 1.1, -0.05);
      const postR = new THREE.Mesh(signPostGeo, signBackMat);
      postR.position.set(0.95, 1.1, -0.05);

      const board = new THREE.Mesh(signBoardGeo, [
        signBackMat,
        signBackMat,
        signBackMat,
        signBackMat,
        faceMat, // +Z faces oncoming driver!
        signBackMat,
      ]);
      board.position.set(0, 2.25, 0);
      board.castShadow = true;

      signGroup.add(postL, postR, board);
      root.add(signGroup);
    }
  }

  // 8. V3 GLOWING AMBER/RED GAP WARNING LASER PYLONS AT meta.gapMarkers (Rainbow Sky!)
  const gapMarkers = meta?.gapMarkers || [];
  let laserBeamMat = null;
  let beaconOrbMat = null;
  const gapBeacons = [];
  if (gapMarkers.length > 0) {
    const hazardTex = createHazardSignTexture();
    trackTex.push(hazardTex);

    const pylonBaseGeo = new THREE.CylinderGeometry(0.45, 0.62, 0.75, 10);
    const pylonShaftGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.8, 10);
    const beaconOrbGeo = new THREE.SphereGeometry(0.42, 12, 10);
    const laserBeamGeo = new THREE.CylinderGeometry(0.14, 0.22, 6.8, 10, 1, true);
    const hazardSignGeo = new THREE.PlaneGeometry(1.45, 1.45);

    const pylonDarkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.45, metalness: 0.4 });
    const pylonAmberMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xff5400,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    beaconOrbMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });
    laserBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff2a54,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hazardSignMat = new THREE.MeshBasicMaterial({
      map: hazardTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    disposables.push(
      pylonBaseGeo,
      pylonShaftGeo,
      beaconOrbGeo,
      laserBeamGeo,
      hazardSignGeo,
      pylonDarkMat,
      pylonAmberMat,
      beaconOrbMat,
      laserBeamMat,
      hazardSignMat
    );

    for (const gm of gapMarkers) {
      const s = getTrackSample(gm.t ?? 0, trackId);
      const hw = gm.roadHalfWidth || roadHalfW;

      for (const side of [-1, 1]) {
        const px = gm.x + s.nx * side * (hw + 0.68);
        const pz = gm.z + s.nz * side * (hw + 0.68);

        const pylon = new THREE.Group();
        pylon.position.set(px, gm.y, pz);
        pylon.rotation.y = (gm.yaw ?? s.yaw ?? 0) + Math.PI;

        const base = new THREE.Mesh(pylonBaseGeo, pylonAmberMat);
        base.position.y = 0.38;
        const shaft = new THREE.Mesh(pylonShaftGeo, pylonDarkMat);
        shaft.position.y = 1.9;
        const orb = new THREE.Mesh(beaconOrbGeo, beaconOrbMat);
        orb.position.y = 3.5;
        const laser = new THREE.Mesh(laserBeamGeo, laserBeamMat);
        laser.position.y = 5.4;
        const sign = new THREE.Mesh(hazardSignGeo, hazardSignMat);
        sign.position.set(0, 2.35, 0.32);

        pylon.add(base, shaft, orb, laser, sign);
        root.add(pylon);
        gapBeacons.push(orb);
      }
    }
  }

  let decorFrameToggle = false;

  function update(dt, elapsed) {
    decorFrameToggle = !decorFrameToggle;
    const runSecondaryDecor = !isMobile || decorFrameToggle;
    const decorDt = isMobile ? dt * 2 : dt;

    // Boost pad & Jump ramp scrolling neon chevrons
    boostTex.offset.y = (boostTex.offset.y - dt * 2.6) % 1;
    boostMat.emissiveIntensity = 0.88 + Math.sin(elapsed * 7.5) * 0.28;

    rampTex.offset.y = (rampTex.offset.y - dt * 3.1) % 1;
    rampMat.emissiveIntensity = 0.85 + Math.sin(elapsed * 8.5) * 0.25;

    // V3 Turn chevron sign pulse & Gap warning laser pylon flash!
    if (turnSignRightMat && turnSignLeftMat) {
      const signPulse = 0.82 + Math.sin(elapsed * 6.5) * 0.25;
      turnSignRightMat.emissiveIntensity = signPulse;
      turnSignLeftMat.emissiveIntensity = signPulse;
    }
    if (laserBeamMat && beaconOrbMat) {
      const flash = (Math.sin(elapsed * 12.0) + 1) * 0.5;
      laserBeamMat.opacity = 0.42 + flash * 0.45;
      beaconOrbMat.color.setHex(flash > 0.5 ? 0xff1e42 : 0xffbe0b);
      const orbScale = 0.92 + flash * 0.28;
      for (const orb of gapBeacons) {
        orb.scale.setScalar(orbScale);
      }
    }

    if (!runSecondaryDecor) return;

    // Bobbing gantry balloons + Animated Start Gantry LED chase
    for (const b of balloons) {
      b.mesh.position.y = b.baseY + Math.sin(elapsed * 2.4 + b.phase) * 0.22;
      b.mesh.position.x = b.baseX + Math.cos(elapsed * 1.7 + b.phase) * 0.12;
    }

    if (gantryLedInst && gantryLeds.length > 0) {
      const chasePhase = elapsed * 8.0;
      for (let i = 0; i < gantryLeds.length; i++) {
        const gl = gantryLeds[i];
        const wave = (Math.sin(chasePhase - gl.order * 0.65) + 1) * 0.5;
        if (baseId === 'neon') {
          tmpWeatherColor.setRGB(
            THREE.MathUtils.lerp(0.0, 0.97, wave),
            THREE.MathUtils.lerp(0.96, 0.15, wave),
            THREE.MathUtils.lerp(0.83, 0.52, wave)
          );
        } else if (baseId === 'polar') {
          tmpWeatherColor.setRGB(
            THREE.MathUtils.lerp(0.22, 0.95, wave),
            THREE.MathUtils.lerp(0.74, 0.98, wave),
            1.0
          );
        } else if (baseId === 'rainbow') {
          tmpWeatherColor.setHSL((elapsed * 0.6 + gl.order * 0.06) % 1, 1.0, 0.58);
        } else {
          tmpWeatherColor.setRGB(
            1.0,
            THREE.MathUtils.lerp(0.2, 0.92, wave),
            THREE.MathUtils.lerp(0.28, 0.2, wave)
          );
        }
        gantryLedInst.setColorAt(i, tmpWeatherColor);
      }
      if (gantryLedInst.instanceColor) gantryLedInst.instanceColor.needsUpdate = true;
    }
    for (let l = 0; l < gantryLampMats.length; l++) {
      gantryLampMats[l].emissiveIntensity = 0.65 + (Math.sin(elapsed * 5.0 - l * 0.9) + 1) * 0.3;
    }
    bannerFaceMat.emissiveIntensity = (baseId === 'coco' ? 0.22 : 0.55) + Math.sin(elapsed * 3.5) * 0.08;

    if (baseId === 'coco') {
      if (waterTex) {
        waterTex.offset.x = (elapsed * 0.032) % 1;
        waterTex.offset.y = (elapsed * 0.024) % 1;
      }
      if (foamPosAttr && foamCenters) {
        const posArr = foamPosAttr.array;
        for (let i = 0; i <= foamSteps; i++) {
          const pt = foamCenters[i % foamSteps];
          const wave = Math.sin(elapsed * 2.2 + i * 0.22) * 0.65;
          const idx0 = i * 2;
          const idx1 = i * 2 + 1;
          posArr[idx0 * 3] = centerX + pt.dx * (pt.baseR - 1.2 + wave);
          posArr[idx0 * 3 + 2] = centerZ + pt.dz * (pt.baseR - 1.2 + wave);
          posArr[idx1 * 3] = centerX + pt.dx * (pt.baseR + 2.0 + wave * 1.25);
          posArr[idx1 * 3 + 2] = centerZ + pt.dz * (pt.baseR + 2.0 + wave * 1.25);
        }
        foamPosAttr.needsUpdate = true;
        foamMat.opacity = 0.62 + Math.sin(elapsed * 2.2) * 0.14;
      }
      if (cloudsGroup) {
        cloudsGroup.rotation.y = elapsed * 0.014;
      }
      if (crownInst && palmPlacements.length > 0) {
        for (let i = 0; i < palmPlacements.length; i++) {
          const p = palmPlacements[i];
          dummy.position.set(p.crownX, p.crownY, p.crownZ);
          dummy.rotation.set(
            0.06 + Math.sin(elapsed * 1.9 + p.phase) * 0.065,
            p.yaw,
            0.05 + Math.cos(elapsed * 1.5 + p.phase) * 0.055
          );
          dummy.scale.setScalar(p.scale);
          dummy.updateMatrix();
          crownInst.setMatrixAt(i, dummy.matrix);
        }
        crownInst.instanceMatrix.needsUpdate = true;
      }
      // Seagulls circling & flapping wings
      for (let i = 0; i < seagulls.length; i++) {
        const g = seagulls[i];
        const ang = elapsed * g.speed + g.phase;
        const gx = centerX + Math.cos(ang) * g.rx;
        const gz = centerZ + Math.sin(ang) * g.rz;
        const gy = g.baseY + Math.sin(elapsed * 1.4 + g.phase) * 1.6;
        const vx = -Math.sin(ang) * g.rx * g.speed;
        const vz = Math.cos(ang) * g.rz * g.speed;
        g.group.position.set(gx, gy, gz);
        g.group.rotation.y = Math.atan2(vx, vz);
        const flap = Math.sin(elapsed * g.flapSpeed + g.phase) * 0.58;
        g.wingL.rotation.z = flap;
        g.wingR.rotation.z = -flap;
      }
      // Tropical sun-motes / fireflies
      if (cocoFirefliesInst && cocoFireflies.length > 0) {
        for (let i = 0; i < cocoFireflies.length; i++) {
          const f = cocoFireflies[i];
          const t = elapsed * f.speed + f.phase;
          dummy.position.set(
            f.x + Math.sin(t) * f.amp,
            f.y + Math.sin(t * 1.3 + 0.7) * 0.55,
            f.z + Math.cos(t * 0.85) * f.amp
          );
          dummy.rotation.set(t, t * 0.7, 0);
          const sc = 0.55 + (Math.sin(t * 2.2) + 1) * 0.45;
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          cocoFirefliesInst.setMatrixAt(i, dummy.matrix);
        }
        cocoFirefliesInst.instanceMatrix.needsUpdate = true;
      }
      // Cheering grandstand spectators
      if (specBodyInst && specHeadInst && spectators.length > 0) {
        for (let i = 0; i < spectators.length; i++) {
          const sp = spectators[i];
          const jump = Math.abs(Math.sin(elapsed * sp.speed + sp.phase)) * 0.34;
          dummy.rotation.set(0, sp.yaw, Math.sin(elapsed * sp.speed + sp.phase) * 0.14);
          dummy.scale.setScalar(1);
          dummy.position.set(sp.x, sp.baseY + 0.26 + jump, sp.z);
          dummy.updateMatrix();
          specBodyInst.setMatrixAt(i, dummy.matrix);
          dummy.position.set(sp.x, sp.baseY + 0.66 + jump, sp.z);
          dummy.updateMatrix();
          specHeadInst.setMatrixAt(i, dummy.matrix);
        }
        specBodyInst.instanceMatrix.needsUpdate = true;
        specHeadInst.instanceMatrix.needsUpdate = true;
      }
    } else if (baseId === 'neon') {
      if (neonGridTex) {
        neonGridTex.offset.y = (elapsed * 0.08) % 1;
      }
      for (let i = 0; i < neonArchMats.length; i++) {
        neonArchMats[i].emissiveIntensity = 0.85 + Math.sin(elapsed * 4.5 + i * 1.4) * 0.35;
      }
      if (neonRainInst && neonRainData.length > 0) {
        for (let i = 0; i < neonRainData.length; i++) {
          const r = neonRainData[i];
          r.y -= r.speed * decorDt;
          r.x -= r.speed * 0.09 * decorDt;
          if (r.y < 0) {
            r.y += 44;
            r.x += 44 * 0.09;
          }
          dummy.position.set(r.x, r.y, r.z);
          dummy.rotation.set(0, 0, 0.09);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          neonRainInst.setMatrixAt(i, dummy.matrix);
        }
        neonRainInst.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < holoBillboards.length; i++) {
        const hb = holoBillboards[i];
        hb.mesh.position.y = hb.baseY + Math.sin(elapsed * 2.2 + hb.phase) * 0.35;
        const flicker = Math.sin(elapsed * 19 + hb.phase) > 0.94 ? 0.45 : 0.84;
        hb.mat.opacity = flicker + Math.sin(elapsed * 3.0 + hb.phase) * 0.08;
      }
      if (cyberCarHullInst && cyberCarGlowInst && cyberTraffic.length > 0) {
        for (let i = 0; i < cyberTraffic.length; i++) {
          const c = cyberTraffic[i];
          const ang = elapsed * c.speed + c.angle;
          const cx = centerX + Math.cos(ang) * c.rx;
          const cz = centerZ + Math.sin(ang) * c.rz;
          const vx = -Math.sin(ang) * c.rx * c.speed;
          const vz = Math.cos(ang) * c.rz * c.speed;
          dummy.position.set(cx, c.y + Math.sin(elapsed * 1.8 + i) * 0.9, cz);
          dummy.rotation.set(0, Math.atan2(vx, vz), c.speed > 0 ? -0.14 : 0.14);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          cyberCarHullInst.setMatrixAt(i, dummy.matrix);
          cyberCarGlowInst.setMatrixAt(i, dummy.matrix);
        }
        cyberCarHullInst.instanceMatrix.needsUpdate = true;
        cyberCarGlowInst.instanceMatrix.needsUpdate = true;
      }
    } else if (baseId === 'polar') {
      if (snowInst && snowData.length > 0) {
        for (let i = 0; i < snowData.length; i++) {
          const fl = snowData[i];
          fl.y -= fl.fallSpeed * decorDt;
          if (fl.y < 0) fl.y += 34;
          const sx = fl.x + Math.sin(elapsed * fl.swayFreq + fl.phase) * fl.swayAmp;
          const sz = fl.z + Math.cos(elapsed * fl.swayFreq * 0.8 + fl.phase) * fl.swayAmp;
          dummy.position.set(sx, fl.y, sz);
          dummy.rotation.set(elapsed * fl.spin, elapsed * fl.spin * 0.7, fl.phase);
          dummy.scale.setScalar(fl.scale);
          dummy.updateMatrix();
          snowInst.setMatrixAt(i, dummy.matrix);
        }
        snowInst.instanceMatrix.needsUpdate = true;
      }
      for (let a = 0; a < auroraRibbons.length; a++) {
        const rib = auroraRibbons[a];
        const arr = rib.posAttr.array;
        const base = rib.basePos;
        for (let v = 0; v < arr.length; v += 3) {
          const bx = base[v];
          const by = base[v + 1];
          const bz = base[v + 2];
          const wave = Math.sin(elapsed * 0.75 + bx * 0.022 + rib.phase) * 14;
          const waveY = Math.cos(elapsed * 0.55 + bz * 0.025 + rib.phase) * 4.5;
          arr[v] = bx + wave * 0.4;
          arr[v + 1] = by + waveY;
          arr[v + 2] = bz + wave;
        }
        rib.posAttr.needsUpdate = true;
        rib.mat.opacity = 0.44 + Math.sin(elapsed * 0.9 + rib.phase) * 0.14;
      }
    } else if (baseId === 'pinball') {
      for (let i = 0; i < bumperRings.length; i++) {
        bumperRings[i].scale.setScalar(1 + Math.sin(elapsed * 7 + i) * 0.1);
      }
      for (const sp of cosmicSpinners) {
        if (sp.speedY) sp.obj.rotation.y += decorDt * sp.speedY;
      }
      for (let i = 0; i < pinballSweepers.length; i++) {
        const sw = pinballSweepers[i];
        sw.pivot.rotation.x = sw.baseTiltX + Math.sin(elapsed * sw.speedX + sw.phase) * sw.ampX;
        sw.pivot.rotation.z = sw.baseTiltZ + Math.cos(elapsed * sw.speedZ + sw.phase) * sw.ampZ;
        sw.beamMat.opacity = 0.14 + (Math.sin(elapsed * 3.6 + sw.phase) + 1) * 0.055;
      }
    } else if (baseId === 'volcano') {
      if (lavaTex && lavaMat) {
        lavaTex.offset.x = (elapsed * 0.018) % 1;
        lavaTex.offset.y = (elapsed * 0.012) % 1;
        lavaMat.emissiveIntensity = 1.0 + Math.sin(elapsed * 2.4) * 0.35;
      }
      for (let i = 0; i < lavaPulseMats.length; i++) {
        lavaPulseMats[i].opacity = 0.22 + (Math.sin(elapsed * 3.1 + i * 1.4) + 1) * 0.18;
      }
      if (emberInst && volcanoEmbers.length > 0) {
        for (let i = 0; i < volcanoEmbers.length; i++) {
          const em = volcanoEmbers[i];
          const progress = ((elapsed * em.speed + em.phase) % 30) / 30;
          const ey = em.baseY + progress * 30;
          const ex = em.x + Math.sin(elapsed * em.driftFreq + em.phase) * em.driftAmp;
          const ez = em.z + Math.cos(elapsed * em.driftFreq * 0.8 + em.phase) * em.driftAmp;
          dummy.position.set(ex, ey, ez);
          dummy.rotation.set(elapsed * 3 + em.phase, elapsed * 2.2, 0);
          dummy.scale.setScalar(em.scale * (1 - progress * 0.72));
          dummy.updateMatrix();
          emberInst.setMatrixAt(i, dummy.matrix);
        }
        emberInst.instanceMatrix.needsUpdate = true;
      }
    } else if (baseId === 'rainbow') {
      roadMat.emissiveIntensity = 0.24 + Math.sin(elapsed * 3.2) * 0.1;
      for (const sp of cosmicSpinners) {
        if (sp.speedY) sp.obj.rotation.y += decorDt * sp.speedY;
        if (sp.speedZ) sp.obj.rotation.z += decorDt * sp.speedZ;
      }
      if (cosmicDustInst && cosmicDustData.length > 0) {
        for (let i = 0; i < cosmicDustData.length; i++) {
          const d = cosmicDustData[i];
          dummy.position.set(
            d.x + Math.sin(elapsed * d.driftSpeed + d.phase) * 0.7,
            d.y + Math.cos(elapsed * d.driftSpeed * 0.8 + d.phase) * 0.6,
            d.z
          );
          dummy.rotation.set(elapsed * 1.8 + d.phase, elapsed * 2.1, 0);
          const twinkle = Math.max(0.15, Math.sin(elapsed * d.twinkleSpeed + d.phase));
          dummy.scale.setScalar(d.baseScale * twinkle);
          dummy.updateMatrix();
          cosmicDustInst.setMatrixAt(i, dummy.matrix);
        }
        cosmicDustInst.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < shootingStars.length; i++) {
        const st = shootingStars[i];
        const t = ((elapsed + st.offset) % st.cycle) / st.cycle;
        const active = t < 0.45;
        st.group.visible = active;
        if (active) {
          const u = t / 0.45;
          st.group.position.set(
            st.startX + st.vx * u,
            st.startY + st.vy * u,
            st.startZ + st.vz * u
          );
          const sc = Math.sin(u * Math.PI) * 1.15;
          st.group.scale.set(sc, sc, Math.max(0.2, sc));
        }
      }
    }
  }

  function dispose() {
    scene.remove(root);
    for (const d of disposables) {
      if (d && typeof d.dispose === 'function') d.dispose();
    }
    for (const t of trackTex) {
      if (t && typeof t.dispose === 'function') t.dispose();
    }
  }

  return {
    trackId,
    group: root,
    startSample,
    centerX,
    centerZ,
    update,
    dispose,
  };
}

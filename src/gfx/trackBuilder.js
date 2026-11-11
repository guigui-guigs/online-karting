import * as THREE from 'three';
import { RACE_CONFIG } from '../shared/constants.js';
import { getTrackSample, getTrackSamples, getTrackMeta } from '../shared/trackData.js';

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
  const canvas = document.createElement('canvas');
  canvas.width = trackId === 'rainbow' ? 512 : 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (trackId === 'neon') {
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
  } else if (trackId === 'rainbow') {
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

function createRoadTexture(trackId) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (trackId === 'neon') {
    ctx.fillStyle = '#121528';
    ctx.fillRect(0, 0, 512, 512);

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

    // Glowing hot-pink edge lines
    ctx.fillStyle = '#f72585';
    ctx.fillRect(20, 0, 12, 512);
    ctx.fillRect(480, 0, 12, 512);

    // Glowing cyan dashed center line
    ctx.fillStyle = '#00f5d4';
    ctx.fillRect(250, 36, 12, 176);
    ctx.fillRect(250, 292, 12, 176);
  } else if (trackId === 'rainbow') {
    // Sparkling cosmic tile pattern multiplied with per-vertex rainbow colors!
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(0, 0, 512, 512);

    const cols = 8;
    const rows = 8;
    const cw = 512 / cols;
    const ch = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.96)' : 'rgba(215,228,255,0.82)';
        ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
      }
    }

    // Golden starlight border rails
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(14, 0, 14, 512);
    ctx.fillRect(484, 0, 14, 512);
  } else {
    // 'coco' Rich sunshine-arcade slate asphalt
    ctx.fillStyle = '#363b4e';
    ctx.fillRect(0, 0, 512, 512);

    const grooveGrad = ctx.createLinearGradient(0, 0, 512, 0);
    grooveGrad.addColorStop(0.0, 'rgba(20, 24, 36, 0.25)');
    grooveGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.03)');
    grooveGrad.addColorStop(0.5, 'rgba(18, 22, 34, 0.12)');
    grooveGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.03)');
    grooveGrad.addColorStop(1.0, 'rgba(20, 24, 36, 0.25)');
    ctx.fillStyle = grooveGrad;
    ctx.fillRect(0, 0, 512, 512);

    const rng = mulberry32(4242);
    for (let i = 0; i < 2000; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(10,12,20,0.08)';
      ctx.fillRect(x, y, 2, 2);
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
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 1024, 256);
  if (trackId === 'neon') {
    bg.addColorStop(0.0, '#7209b7');
    bg.addColorStop(0.5, '#f72585');
    bg.addColorStop(1.0, '#3a0ca3');
  } else if (trackId === 'rainbow') {
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
  ctx.strokeStyle = trackId === 'neon' ? '#00f5d4' : '#ffd166';
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
  txtGrad.addColorStop(1, trackId === 'neon' ? '#00f5d4' : '#ff9f1c');
  ctx.fillStyle = txtGrad;
  ctx.fillText('★ POCKET KART ★', 512, 118);

  const subtitles = {
    coco: 'ÎLE COCO • SUNSHINE LAGOON',
    neon: 'NÉON DRIFT • CYBER TOKYO',
    rainbow: 'ROUTE CÉLESTE • RAINBOW SKY',
  };
  ctx.font = '800 28px "Nunito", sans-serif';
  ctx.fillStyle = trackId === 'neon' ? '#ff70a6' : '#56f0ff';
  ctx.fillText(subtitles[trackId] || subtitles.coco, 512, 182);

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
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // High-contrast arcade sign housing
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 256);

  const borderCol = trackId === 'neon' ? '#00f5d4' : '#ffbe0b';
  ctx.lineWidth = 16;
  ctx.strokeStyle = borderCol;
  ctx.strokeRect(8, 8, 496, 240);

  // 3 bold glowing directional chevrons (turnDir > 0 => '>>>' right, turnDir < 0 => '<<<' left)
  const arrowColors =
    trackId === 'neon'
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

/**
 * Builds the entire 3D circuit + themed world for `'coco'`, `'neon'`, or `'rainbow'`.
 */
export function buildTrackWorld(scene, trackId = 'coco') {
  const root = new THREE.Group();
  root.name = `TrackWorld_${trackId}`;
  scene.add(root);

  const disposables = [];
  const trackTex = [];

  const meta = typeof getTrackMeta === 'function' ? getTrackMeta(trackId) : null;
  const samples = getTrackSamples(360, trackId);
  const coarseSamples = getTrackSamples(160, trackId);
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

  if (trackId === 'coco') {
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
  } else if (trackId === 'neon') {
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
  let foamPosAttr = null;
  let foamMat = null;
  let foamCenters = null;
  const foamSteps = 160;
  let cloudsGroup = null;
  let crownInst = null;
  let palmPlacements = [];
  const cosmicSpinners = [];
  const dummy = new THREE.Object3D();

  // 2. TRACK-THEMED TERRAIN / GROUND / SPACE ENVIRONMENT
  const rng = mulberry32(trackId === 'neon' ? 208899 : trackId === 'rainbow' ? 994411 : 777123);

  if (trackId === 'coco') {
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

      if (dist <= shoulderEnd) {
        return { y: baseRoadBedY, dist, inside, nearest };
      }

      if (inside) {
        const tIn = smoothstep(shoulderEnd, shoulderEnd + 28, dist);
        const hillBump =
          1.35 +
          Math.sin(x * 0.055 + 1.1) * Math.cos(z * 0.055 - 0.4) * 1.65 +
          Math.max(0, Math.sin(x * 0.028 - z * 0.031)) * 1.8;
        return { y: baseRoadBedY + tIn * hillBump, dist, inside, nearest };
      }

      const beachStart = shoulderEnd + 16 + coastWave * 0.35;
      const waterEdge = shoulderEnd + 40 + coastWave;
      const deepEdge = waterEdge + 26;

      let y;
      if (dist < beachStart) {
        y = THREE.MathUtils.lerp(baseRoadBedY, 0.85, smoothstep(shoulderEnd, beachStart, dist));
      } else if (dist < waterEdge) {
        y = THREE.MathUtils.lerp(0.85, 0.0, smoothstep(beachStart, waterEdge, dist));
      } else {
        y = THREE.MathUtils.lerp(0.0, -2.2, smoothstep(waterEdge, deepEdge, dist));
      }
      return { y, dist, inside, nearest };
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
    const segs = 90;
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
        const { y, inside } = evaluateIslandHeight(vx, vz);

        terrainPos[idx * 3] = vx;
        terrainPos[idx * 3 + 1] = y;
        terrainPos[idx * 3 + 2] = vz;

        const stripe = (Math.sin(vx * 0.16) * Math.cos(vz * 0.16) + 1) * 0.5;
        if (inside || y > 1.05) {
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

    // Puffy White Clouds
    cloudsGroup = new THREE.Group();
    cloudsGroup.position.set(centerX, 0, centerZ);
    root.add(cloudsGroup);
    const cloudPuffGeo = new THREE.IcosahedronGeometry(1, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdbeafe,
      emissiveIntensity: 0.25,
      roughness: 0.9,
      flatShading: true,
      fog: false,
    });
    disposables.push(cloudPuffGeo, cloudMat);
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
      cloudsGroup.add(cl);
    }
  } else if (trackId === 'neon') {
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
  } else if (trackId === 'rainbow') {
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

    if (trackId === 'rainbow') {
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
    roughness: trackId === 'neon' ? 0.24 : trackId === 'rainbow' ? 0.2 : 0.72,
    metalness: trackId === 'neon' ? 0.35 : trackId === 'rainbow' ? 0.18 : 0.06,
    transparent: trackId === 'rainbow',
    opacity: trackId === 'rainbow' ? 0.9 : 1.0,
    side: trackId === 'rainbow' ? THREE.DoubleSide : THREE.FrontSide,
    emissive: trackId === 'neon' || trackId === 'rainbow' ? 0xffffff : 0x000000,
    emissiveMap: trackId === 'neon' ? roadTex : null,
    emissiveIntensity: trackId === 'neon' ? 0.45 : trackId === 'rainbow' ? 0.22 : 0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  root.add(roadMesh);
  disposables.push(roadGeo, roadMat);

  // 3b. Raised 3D Curbstones (omitted in gapZones where hasGuardrail === false!)
  const curbPos = [];
  const curbCol = [];
  const curbIndices = [];

  const cCurbA = new THREE.Color(
    trackId === 'neon' ? '#00f5d4' : trackId === 'rainbow' ? '#ffe600' : '#ff2438'
  );
  const cCurbB = new THREE.Color(
    trackId === 'neon' ? '#f72585' : trackId === 'rainbow' ? '#00f5d4' : '#ffffff'
  );
  const cSkirt = new THREE.Color(
    trackId === 'neon' ? '#1e1b4b' : trackId === 'rainbow' ? '#7209b7' : '#27ae60'
  );

  const blockStep = 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % N];

      // On Rainbow Sky, leave gapZones completely open to the starry sky!
      if (s0.hasGuardrail === false || s1.hasGuardrail === false) {
        continue;
      }

      const hw0 = s0.roadHalfWidth || roadHalfW;
      const hw1 = s1.roadHalfWidth || roadHalfW;
      const topCol = Math.floor(i / blockStep) % 2 === 0 ? cCurbA : cCurbB;

      const innerOff = -0.05;
      const innerTopOff = 0.12;
      const outerTopOff = 0.92;
      const outerBotOff = trackId === 'rainbow' ? 0.98 : 1.42;
      const curbH = trackId === 'rainbow' ? 0.24 : 0.15;
      const skirtDrop = trackId === 'rainbow' ? -0.18 : -0.45;

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

      const outX = s0.nx * side;
      const outZ = s0.nz * side;
      pushOrientedQuad(curbIndices, curbPos, baseIdx + 0, baseIdx + 1, baseIdx + 4, baseIdx + 5, -outX * 0.5, 1, -outZ * 0.5);
      pushOrientedQuad(curbIndices, curbPos, baseIdx + 1, baseIdx + 2, baseIdx + 5, baseIdx + 6, 0, 1, 0);
      pushOrientedQuad(curbIndices, curbPos, baseIdx + 2, baseIdx + 3, baseIdx + 6, baseIdx + 7, outX, 0.6, outZ);
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
      roughness: trackId === 'coco' ? 0.48 : 0.25,
      metalness: 0.08,
      emissive: trackId === 'coco' ? 0x000000 : 0xffffff,
      emissiveIntensity: trackId === 'coco' ? 0 : 0.26,
    });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.castShadow = true;
    curbMesh.receiveShadow = true;
    root.add(curbMesh);
    disposables.push(curbGeo, curbMat);
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
    color: trackId === 'neon' ? 0xf72585 : trackId === 'rainbow' ? 0x8338ec : 0xff3b4e,
    emissive: trackId === 'coco' ? 0x000000 : 0x3a0ca3,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });
  const accentPillarMat = new THREE.MeshStandardMaterial({
    color: trackId === 'neon' ? 0x00f5d4 : 0xffbe0b,
    emissive: trackId === 'neon' ? 0x00bbf9 : 0x000000,
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
    emissiveIntensity: trackId === 'coco' ? 0.22 : 0.55,
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
      emissiveIntensity: trackId === 'coco' ? 0.08 : 0.35,
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

  function update(dt, elapsed) {
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

    // Bobbing gantry balloons
    for (const b of balloons) {
      b.mesh.position.y = b.baseY + Math.sin(elapsed * 2.4 + b.phase) * 0.22;
      b.mesh.position.x = b.baseX + Math.cos(elapsed * 1.7 + b.phase) * 0.12;
    }

    if (trackId === 'coco') {
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
    } else if (trackId === 'neon') {
      if (neonGridTex) {
        neonGridTex.offset.y = (elapsed * 0.08) % 1;
      }
    } else if (trackId === 'rainbow') {
      roadMat.emissiveIntensity = 0.24 + Math.sin(elapsed * 3.2) * 0.1;
      for (const sp of cosmicSpinners) {
        sp.obj.rotation.y += dt * sp.speedY;
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

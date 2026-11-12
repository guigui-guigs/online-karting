import { RACE_CONFIG } from './constants.js';

/**
 * Multi-Track Spline Engine for PocketKart 3D V2:
 * - 'coco':    Île Coco (~603u, sunny lagoon, 2 jump ramps, full guardrails)
 * - 'neon':    Néon Drift (~640u, cyber viaduct & sweeping drift corners, 2 jump ramps, full guardrails)
 * - 'rainbow': Route Céleste (~620u, undulating sky ribbon y in [4.7..11.7], 3 jump ramps, 2 guardrail-free gapZones)
 *
 * Coordinate convention (Three.js right-handed):
 * - +Y is UP.
 * - yaw = 0 faces +Z, forward unit horizontal direction is (Math.sin(yaw), 0, Math.cos(yaw)).
 * - Horizontal unit RIGHT normal is (nx, 0, nz) = (-tz / h, 0, tx / h).
 */

const TRACK_BLUEPRINTS = {
  coco: {
    id: 'coco',
    scaleXZ: 0.9,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-80, 1.0,    0],
      [-80, 1.1,   24],
      [-80, 1.4,   48],
      [-72, 2.0,   72],
      [-52, 2.8,   90],
      [-26, 3.5,   98],
      [  2, 4.0,   96],
      [ 30, 4.2,   88],
      [ 56, 3.6,   76],
      [ 78, 2.8,   58],
      [ 90, 2.0,   34],
      [ 88, 1.4,    8],
      [ 72, 1.2,  -14],
      [ 62, 1.6,  -36],
      [ 70, 2.2,  -60],
      [ 82, 2.6,  -82],
      [ 74, 2.4, -102],
      [ 50, 1.8, -110],
      [ 24, 1.2, -104],
      [ -2, 0.8,  -94],
      [-28, 0.7,  -92],
      [-54, 0.9,  -96],
      [-76, 1.2,  -88],
      [-88, 1.3,  -68],
      [-84, 1.1,  -46],
      [-80, 1.0,  -24],
    ],
    itemBoxRowsT: [0.16, 0.48, 0.78],
    boostPadDefs: [
      { t: 0.065, lateral: 2.2 },
      { t: 0.335, lateral: -2.0 },
      { t: 0.685, lateral: 0.0 },
      { t: 0.925, lateral: -1.8 },
    ],
    rampDefs: [
      { t: 0.245, lateral: 0.0, width: 5.4, length: 7.0 },
      { t: 0.735, lateral: 1.2, width: 5.4, length: 7.0 },
    ],
    shortcutZones: [
      { startT: 0.54, endT: 0.60, lateral: -9.6, halfWidth: 3.3 },
    ],
    gapZones: [
      { startT: 0.36, endT: 0.43 },
      { startT: 0.81, endT: 0.88 },
    ],
  },

  polar: {
    id: 'polar',
    scaleXZ: 0.92,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-82, 1.2,    0],
      [-82, 1.3,   26],
      [-80, 1.8,   52],
      [-64, 2.8,   78],
      [-38, 4.0,   94],
      [ -8, 4.8,   98],
      [ 22, 4.6,   94],
      [ 52, 3.8,   82],
      [ 78, 2.8,   60],
      [ 92, 2.2,   34],
      [ 88, 1.8,    6],
      [ 70, 1.6,  -16],
      [ 66, 2.2,  -42],
      [ 80, 3.0,  -68],
      [ 84, 3.2,  -94],
      [ 64, 2.6, -110],
      [ 36, 1.8, -106],
      [  8, 1.3,  -96],
      [-22, 1.0,  -94],
      [-52, 1.1,  -96],
      [-76, 1.4,  -84],
      [-88, 1.4,  -56],
      [-84, 1.2,  -28],
    ],
    itemBoxRowsT: [0.15, 0.46, 0.76],
    boostPadDefs: [
      { t: 0.06, lateral: 2.0 },
      { t: 0.34, lateral: -1.8 },
      { t: 0.63, lateral: 1.6 },
      { t: 0.91, lateral: 0.0 },
    ],
    rampDefs: [
      { t: 0.22, lateral: 0.0, width: 5.4, length: 7.0 },
      { t: 0.72, lateral: -1.0, width: 5.4, length: 7.0 },
    ],
    iceZones: [
      { startT: 0.20, endT: 0.38 },
      { startT: 0.65, endT: 0.84 },
    ],
    shortcutZones: [
      { startT: 0.51, endT: 0.58, lateral: -9.6, halfWidth: 3.3 },
    ],
    gapZones: [
      { startT: 0.43, endT: 0.49 },
    ],
  },

  neon: {
    id: 'neon',
    scaleXZ: 0.88,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-86, 1.2,    0], // 0: Start / Finish Neon Boulevard (yaw = 0)
      [-86, 1.3,   28], // 1: Boulevard straight
      [-86, 2.1,   56], // 2: Viaduct ramp entry
      [-70, 3.6,   82], // 3: Shibuya sweeper
      [-44, 5.2,   98], // 4: Climbing Cyber Viaduct
      [-14, 6.4,  102], // 5: High Expressway Deck
      [ 18, 6.6,   98], // 6: Skyline Overpass
      [ 48, 6.1,   90], // 7: Overpass sweeper
      [ 74, 4.9,   74], // 8: Descending Neon Canyon
      [ 90, 3.3,   48], // 9: Wide East drift curve
      [ 92, 2.0,   18], // 10: East avenue
      [ 78, 1.4,   -8], // 11: Technical S-drift entry
      [ 54, 1.4,  -24], // 12: Inner neon apex
      [ 48, 1.8,  -48], // 13: S-drift switchback
      [ 66, 2.4,  -70], // 14: Harbor approach
      [ 84, 2.8,  -90], // 15: Harbor 180 entry
      [ 78, 2.4, -112], // 16: Harbor drift apex 1
      [ 52, 1.8, -120], // 17: Harbor drift apex 2
      [ 24, 1.4, -110], // 18: Harbor exit
      [ -2, 1.2,  -96], // 19: Mid-south straight
      [-30, 1.2,  -94], // 20: Fast cyber straight
      [-58, 1.4,  -98], // 21: Akihabara corner entry
      [-80, 1.6,  -88], // 22: Akihabara apex
      [-88, 1.4,  -60], // 23: Aligning onto boulevard
      [-86, 1.2,  -30], // 24: Home straight
    ],
    itemBoxRowsT: [0.15, 0.46, 0.77],
    boostPadDefs: [
      { t: 0.06, lateral: -2.2 },
      { t: 0.29, lateral: 1.8 },
      { t: 0.65, lateral: 0.0 },
      { t: 0.91, lateral: 2.0 },
    ],
    rampDefs: [
      { t: 0.225, lateral: 0.0, width: 5.4, length: 7.2 },
      { t: 0.74, lateral: -1.0, width: 5.4, length: 7.2 },
    ],
    shortcutZones: [
      { startT: 0.48, endT: 0.54, lateral: -9.6, halfWidth: 3.3 },
    ],
    gapZones: [
      { startT: 0.31, endT: 0.38 },
      { startT: 0.56, endT: 0.63 },
    ],
  },

  pinball: {
    id: 'pinball',
    scaleXZ: 0.92,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-84, 1.5,    0],
      [-84, 1.5,   28],
      [-82, 2.0,   58],
      [-64, 3.0,   86],
      [-34, 4.0,  100],
      [ -2, 4.2,   98],
      [ 30, 3.6,   92],
      [ 60, 2.8,   80],
      [ 84, 2.2,   56],
      [ 92, 1.8,   24],
      [ 84, 1.6,   -8],
      [ 60, 1.8,  -30],
      [ 54, 2.2,  -56],
      [ 74, 2.6,  -82],
      [ 82, 2.8, -108],
      [ 58, 2.4, -120],
      [ 28, 2.0, -110],
      [  0, 1.6,  -98],
      [-30, 1.4,  -96],
      [-60, 1.6,  -98],
      [-82, 1.8,  -82],
      [-90, 1.6,  -54],
      [-84, 1.5,  -26],
    ],
    itemBoxRowsT: [0.14, 0.43, 0.74],
    boostPadDefs: [
      { t: 0.055, lateral: -2.0 },
      { t: 0.32, lateral: 2.0 },
      { t: 0.58, lateral: -1.8 },
      { t: 0.91, lateral: 1.8 },
    ],
    rampDefs: [
      { t: 0.165, lateral: 0.0, width: 5.5, length: 7.2 },
      { t: 0.50, lateral: 0.0, width: 5.5, length: 7.2 },
      { t: 0.81, lateral: 0.0, width: 5.5, length: 7.2 },
    ],
    bumperDefs: [
      { t: 0.20, lateral: 1.8, radius: 2.15 },
      { t: 0.245, lateral: -2.2, radius: 2.15 },
      { t: 0.46, lateral: 0.2, radius: 2.3 },
      { t: 0.625, lateral: -2.0, radius: 2.15 },
      { t: 0.675, lateral: 2.1, radius: 2.15 },
      { t: 0.87, lateral: -0.6, radius: 2.2 },
    ],
    shortcutZones: [
      { startT: 0.52, endT: 0.58, lateral: -9.6, halfWidth: 3.3 },
    ],
    gapZones: [],
  },

  volcano: {
    id: 'volcano',
    scaleXZ: 0.94,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-82,  1.6,    0],
      [-82,  2.2,   26],
      [-78,  4.0,   54],
      [-60,  7.0,   80],
      [-32, 10.6,   94],
      [  0, 12.8,   98],
      [ 32, 13.0,   92],
      [ 62, 11.2,   78],
      [ 84,  8.6,   54],
      [ 92,  6.0,   24],
      [ 84,  4.2,   -6],
      [ 64,  3.6,  -28],
      [ 62,  4.8,  -56],
      [ 78,  6.4,  -84],
      [ 74,  6.0, -108],
      [ 48,  4.6, -114],
      [ 20,  3.2, -104],
      [-10,  2.2,  -94],
      [-40,  1.8,  -92],
      [-68,  2.0,  -88],
      [-86,  2.0,  -66],
      [-86,  1.8,  -38],
      [-82,  1.6,  -18],
    ],
    itemBoxRowsT: [0.13, 0.45, 0.77],
    boostPadDefs: [
      { t: 0.06, lateral: 0.0 },
      { t: 0.36, lateral: 1.8 },
      { t: 0.64, lateral: -1.8 },
      { t: 0.92, lateral: 0.0 },
    ],
    rampDefs: [
      { t: 0.21, lateral: 0.0, width: 5.5, length: 7.4 },
      { t: 0.51, lateral: 0.8, width: 5.5, length: 7.4 },
      { t: 0.82, lateral: -0.8, width: 5.5, length: 7.4 },
    ],
    shortcutZones: [
      { startT: 0.56, endT: 0.63, lateral: -9.8, halfWidth: 3.4 },
    ],
    gapZones: [
      { startT: 0.27, endT: 0.34 },
      { startT: 0.70, endT: 0.77 },
    ],
  },

  rainbow: {
    id: 'rainbow',
    scaleXZ: 0.97,
    roadHalfWidth: RACE_CONFIG.ROAD_HALF_WIDTH,
    rawPoints: [
      [-76,  6.0,    0], // 0: Starlight Start / Finish (yaw = 0)
      [-76,  6.5,   26], // 1: Rainbow straight
      [-76,  7.6,   52], // 2: Ascending Star Curve
      [-60,  9.2,   76], // 3: Nebula Sweeper
      [-34, 10.8,   92], // 4: Comet Crest climb
      [ -4, 11.6,   96], // 5: Peak of Rainbow Sky
      [ 26, 11.0,   90], // 6: Starlight Bridge entry
      [ 54,  9.6,   78], // 7: Starlight Bridge (Gap Zone 1)
      [ 78,  8.0,   58], // 8: East Rainbow Bend
      [ 88,  6.6,   32], // 9: Cosmic Curve
      [ 86,  5.4,    4], // 10: Mid-East Ribbon
      [ 74,  4.8,  -22], // 11: Star Valley dip
      [ 76,  5.8,  -50], // 12: Rising to Supernova Loop
      [ 84,  7.4,  -76], // 13: Supernova Loop entry
      [ 72,  8.6,  -98], // 14: Supernova Apex 1
      [ 46,  8.8, -106], // 15: Supernova Apex 2
      [ 18,  7.8,  -98], // 16: Milky Way Straight entry
      [-10,  6.5,  -90], // 17: Milky Way Bridge (Gap Zone 2)
      [-38,  5.4,  -88], // 18: Milky Way exit
      [-64,  4.9,  -86], // 19: Aurora Turn entry
      [-80,  5.3,  -68], // 20: Aurora Turn apex
      [-78,  5.7,  -44], // 21: Aurora Turn exit
      [-76,  5.9,  -22], // 22: Starlight Home Straight
    ],
    itemBoxRowsT: [0.14, 0.44, 0.69],
    boostPadDefs: [
      { t: 0.06, lateral: 0.0 },
      { t: 0.39, lateral: -2.0 },
      { t: 0.64, lateral: 1.8 },
      { t: 0.92, lateral: 0.0 },
    ],
    rampDefs: [
      { t: 0.21, lateral: 0.0, width: 5.6, length: 7.4 },
      { t: 0.48, lateral: 0.0, width: 5.6, length: 7.4 },
      { t: 0.715, lateral: 0.0, width: 5.6, length: 7.4 },
    ],
    gapZones: [
      { startT: 0.29, endT: 0.37 },
      { startT: 0.55, endT: 0.62 },
      { startT: 0.76, endT: 0.83 },
    ],
  },
};

function wrap01(t) {
  const r = t % 1;
  return r < 0 ? r + 1 : r;
}

function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

function catmullRom(p0, p1, p2, p3, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * s +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * s3)
  );
}

function catmullRomDeriv(p0, p1, p2, p3, s) {
  const s2 = s * s;
  return (
    0.5 *
    ((-p0 + p2) +
      2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * s +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * s2)
  );
}

function isInsideGapZone(t, gapZones) {
  for (let i = 0; i < gapZones.length; i++) {
    const gz = gapZones[i];
    if (t >= gz.startT && t <= gz.endT) return true;
  }
  return false;
}

const ITEM_BOX_LATERALS = [-4.5, -1.5, 1.5, 4.5];
const ARC_SUBSTEPS = 2048;
const PROJ_N = 512;
const PROJ_COARSE_STEP = 4;

function compileTrack(blueprint, { mirror = false } = {}) {
  const latSign = mirror ? -1 : 1;
  const controlPoints = blueprint.rawPoints.map(([x, y, z]) => ({
    x: +((mirror ? -x : x) * blueprint.scaleXZ).toFixed(3),
    y: +y.toFixed(3),
    z: +(z * blueprint.scaleXZ).toFixed(3),
  }));
  const numCp = controlPoints.length;

  function evalRaw(u) {
    const uw = wrap01(u);
    const scaled = uw * numCp;
    const idx = Math.min(numCp - 1, Math.floor(scaled));
    const local = scaled - idx;

    const p0 = controlPoints[(idx - 1 + numCp) % numCp];
    const p1 = controlPoints[idx];
    const p2 = controlPoints[(idx + 1) % numCp];
    const p3 = controlPoints[(idx + 2) % numCp];

    const x = catmullRom(p0.x, p1.x, p2.x, p3.x, local);
    const y = catmullRom(p0.y, p1.y, p2.y, p3.y, local);
    const z = catmullRom(p0.z, p1.z, p2.z, p3.z, local);

    const dx = catmullRomDeriv(p0.x, p1.x, p2.x, p3.x, local);
    const dy = catmullRomDeriv(p0.y, p1.y, p2.y, p3.y, local);
    const dz = catmullRomDeriv(p0.z, p1.z, p2.z, p3.z, local);

    const len3 = Math.hypot(dx, dy, dz) || 1;
    const tx = dx / len3;
    const ty = dy / len3;
    const tz = dz / len3;

    const hLen = Math.hypot(tx, tz) || 1;
    const nx = -tz / hLen;
    const ny = 0;
    const nz = tx / hLen;
    const yaw = Math.atan2(tx, tz);

    return {
      x,
      y,
      z,
      tx,
      ty,
      tz,
      nx,
      ny,
      nz,
      yaw,
      roadHalfWidth: blueprint.roadHalfWidth,
    };
  }

  const cumArc = new Float64Array(ARC_SUBSTEPS + 1);
  let prev = evalRaw(0);
  cumArc[0] = 0;
  for (let i = 1; i <= ARC_SUBSTEPS; i++) {
    const cur = evalRaw(i / ARC_SUBSTEPS);
    cumArc[i] = cumArc[i - 1] + Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
    prev = cur;
  }
  const length = cumArc[ARC_SUBSTEPS];

  function arcTToRawU(tw) {
    const target = tw * length;
    let lo = 0;
    let hi = ARC_SUBSTEPS;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cumArc[mid] <= target) lo = mid;
      else hi = mid;
    }
    const segLen = cumArc[hi] - cumArc[lo];
    const frac = segLen > 1e-9 ? (target - cumArc[lo]) / segLen : 0;
    return (lo + frac) / ARC_SUBSTEPS;
  }

  const iceZones = (blueprint.iceZones || []).map((z) => ({ ...z }));
  const shortcutZones = (blueprint.shortcutZones || []).map((sz) => ({
    ...sz,
    lateral: sz.lateral * latSign,
  }));

  function sampleAt(t) {
    const tw = wrap01(t);
    const u = arcTToRawU(tw);
    const s = evalRaw(u);
    return {
      t: tw,
      ...s,
      hasGuardrail: !isInsideGapZone(tw, blueprint.gapZones),
      inIceZone: isInsideGapZone(tw, iceZones),
    };
  }

  const projSamples = new Array(PROJ_N);
  for (let i = 0; i < PROJ_N; i++) {
    projSamples[i] = sampleAt(i / PROJ_N);
  }

  const itemBoxSpots = [];
  let boxId = 0;
  for (const rowT of blueprint.itemBoxRowsT) {
    const s = sampleAt(rowT);
    for (const lateral of ITEM_BOX_LATERALS) {
      itemBoxSpots.push({
        id: boxId++,
        t: s.t,
        lateral,
        x: s.x + s.nx * lateral,
        y: s.y,
        z: s.z + s.nz * lateral,
      });
    }
  }

  const boostPadSpots = blueprint.boostPadDefs.map((def, id) => {
    const s = sampleAt(def.t);
    const lateral = def.lateral * latSign;
    return {
      id,
      t: s.t,
      lateral,
      x: s.x + s.nx * lateral,
      y: s.y,
      z: s.z + s.nz * lateral,
      yaw: s.yaw,
    };
  });

  // Add shortcut boost pad at midpoint of each off-road shortcut strip
  for (const sz of shortcutZones) {
    const midT = (sz.startT + sz.endT) * 0.5;
    const s = sampleAt(midT);
    boostPadSpots.push({
      id: boostPadSpots.length,
      t: s.t,
      lateral: sz.lateral,
      x: s.x + s.nx * sz.lateral,
      y: s.y,
      z: s.z + s.nz * sz.lateral,
      yaw: s.yaw,
      isShortcut: true,
    });
  }

  const rampSpots = blueprint.rampDefs.map((def, id) => {
    const s = sampleAt(def.t);
    const lateral = def.lateral * latSign;
    return {
      id,
      t: s.t,
      lateral,
      width: def.width,
      length: def.length,
      x: s.x + s.nx * lateral,
      y: s.y,
      z: s.z + s.nz * lateral,
      yaw: s.yaw,
    };
  });

  const bumperSpots = (blueprint.bumperDefs || []).map((def, id) => {
    const s = sampleAt(def.t);
    const lateral = def.lateral * latSign;
    return {
      id,
      t: s.t,
      lateral,
      radius: def.radius || 2.2,
      x: s.x + s.nx * lateral,
      y: s.y,
      z: s.z + s.nz * lateral,
    };
  });

  const coinGroups = [
    { startT: 0.085, step: 0.012, lateral: -1.6 * latSign },
    { startT: 0.345, step: 0.012, lateral: 2.0 * latSign },
    { startT: 0.595, step: 0.012, lateral: 0.0 },
    { startT: 0.875, step: 0.012, lateral: -1.8 * latSign },
  ];
  const coinSpots = [];
  let coinId = 0;
  for (const grp of coinGroups) {
    for (let k = 0; k < 4; k += 1) {
      const ct = wrap01(grp.startT + k * grp.step);
      const s = sampleAt(ct);
      let lat = grp.lateral;
      // Avoid clipping inside pinball bumpers
      for (const bmp of bumperSpots) {
        if (Math.hypot(s.x + s.nx * lat - bmp.x, s.z + s.nz * lat - bmp.z) < bmp.radius + 1.8) {
          lat = -lat || 2.8 * latSign;
        }
      }
      coinSpots.push({
        id: coinId++,
        t: s.t,
        lateral: lat,
        x: s.x + s.nx * lat,
        y: s.y,
        z: s.z + s.nz * lat,
      });
    }
  }

  const gapZones = blueprint.gapZones.map((gz) => ({ ...gz }));

  // Automatically place chevron turnSigns outside sharp bends (clear of outer wall & start gantry)
  const turnSigns = [];
  {
    const scanN = 160;
    let lastSignT = -1;
    let signId = 0;
    for (let i = 0; i < scanN; i++) {
      const t = i / scanN;
      if (t < 0.035 || t > 0.965) continue; // keep Start/Finish gantry area uncluttered
      if (lastSignT >= 0 && t - lastSignT < 0.042) continue;

      const s = sampleAt(t);
      if (!s.hasGuardrail) continue;

      const sPrev = sampleAt(t - 0.022);
      const sNext = sampleAt(t + 0.022);
      const dYaw = wrapAngle(sNext.yaw - sPrev.yaw);
      const sharpness = Math.abs(dYaw);

      if (sharpness >= 0.34) {
        // yaw decreases on RIGHT turns (turnDir = +1), increases on LEFT turns (turnDir = -1)
        const turnDir = dYaw < 0 ? 1 : -1;
        // Place sign on the OUTSIDE shoulder of the curve, beyond physics outer wall
        const side = -turnDir;
        const lateral = side * (s.roadHalfWidth + 3.9);
        turnSigns.push({
          id: signId++,
          t: s.t,
          x: s.x + s.nx * lateral,
          y: s.y,
          z: s.z + s.nz * lateral,
          yaw: s.yaw,
          side,
          turnDir,
          sharpness: +sharpness.toFixed(3),
        });
        lastSignT = t;
      }
    }
  }

  // Place gapMarkers right before each gapZones start (e.g. on 'rainbow')
  const gapMarkers = gapZones.map((gz, id) => {
    const markerT = wrap01(gz.startT - 0.005);
    const s = sampleAt(markerT);
    return {
      id,
      t: s.t,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      roadHalfWidth: s.roadHalfWidth,
    };
  });

  return {
    id: mirror ? `${blueprint.id}__mirror` : blueprint.id,
    baseId: blueprint.id,
    isMirror: mirror,
    controlPoints,
    length,
    roadHalfWidth: blueprint.roadHalfWidth,
    sampleAt,
    projSamples,
    itemBoxSpots,
    boostPadSpots,
    rampSpots,
    bumperSpots,
    coinSpots,
    iceZones,
    shortcutZones,
    gapZones,
    turnSigns,
    gapMarkers,
  };
}

export function parseTrackKey(trackKey = 'coco') {
  if (!trackKey || trackKey === 'arena') {
    return { baseId: trackKey === 'arena' ? 'arena' : 'coco', isMirror: false };
  }
  if (trackKey.endsWith('__mirror')) {
    return { baseId: trackKey.slice(0, -8), isMirror: true };
  }
  return { baseId: trackKey, isMirror: false };
}

export function getBaseTrackId(trackKey = 'coco') {
  return parseTrackKey(trackKey).baseId;
}

export function getTrackKey(baseId = 'coco', mirror = false) {
  if (baseId === 'arena') return 'arena';
  const cleanBase = getBaseTrackId(baseId);
  return mirror ? `${cleanBase}__mirror` : cleanBase;
}

export function isArenaTrack(trackKey = 'coco') {
  return trackKey === 'arena';
}

export const ARENA_DATA = (() => {
  const radius = RACE_CONFIG.ARENA_RADIUS || 48;
  const itemBoxSpots = [];
  let boxId = 0;
  for (let i = 0; i < 4; i += 1) {
    const a1 = (i * Math.PI) / 2 + Math.PI / 4;
    itemBoxSpots.push({
      id: boxId++,
      x: Math.cos(a1) * 16,
      y: 0.6,
      z: Math.sin(a1) * 16,
    });
    const a2 = (i * Math.PI) / 2;
    itemBoxSpots.push({
      id: boxId++,
      x: Math.cos(a2) * 33,
      y: 0.6,
      z: Math.sin(a2) * 33,
    });
  }

  const boostPadSpots = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    boostPadSpots.push({
      id: i,
      x: Math.cos(a) * 29,
      y: 0.6,
      z: Math.sin(a) * 29,
      yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
    });
  }

  const coinSpots = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 11 : 25;
    coinSpots.push({
      id: i,
      x: Math.cos(a) * r,
      y: 0.6,
      z: Math.sin(a) * r,
    });
  }

  const pillars = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    return {
      id: i,
      x: Math.cos(a) * 21,
      z: Math.sin(a) * 21,
      radius: 2.5,
    };
  });

  const bumperSpots = [
    { id: 0, x: 0, y: 0.6, z: 0, radius: 2.8 },
  ];

  return {
    id: 'arena',
    baseId: 'arena',
    isArena: true,
    radius,
    floorY: 0.6,
    length: radius * Math.PI * 2,
    roadHalfWidth: radius,
    itemBoxSpots,
    boostPadSpots,
    coinSpots,
    pillars,
    bumperSpots,
    rampSpots: [],
    iceZones: [],
    shortcutZones: [],
    gapZones: [],
    turnSigns: [],
    gapMarkers: [],
  };
})();

const COMPILED_TRACKS = {};
for (const key of Object.keys(TRACK_BLUEPRINTS)) {
  COMPILED_TRACKS[key] = compileTrack(TRACK_BLUEPRINTS[key], { mirror: false });
  COMPILED_TRACKS[`${key}__mirror`] = compileTrack(TRACK_BLUEPRINTS[key], { mirror: true });
}

function resolveTrack(trackId = 'coco') {
  return COMPILED_TRACKS[trackId] || COMPILED_TRACKS.coco;
}

export function isPointInShortcut(t, lateralOffset, trackId = 'coco') {
  if (isArenaTrack(trackId)) return false;
  const tr = resolveTrack(trackId);
  const zones = tr.shortcutZones || [];
  for (let i = 0; i < zones.length; i += 1) {
    const sz = zones[i];
    if (t >= sz.startT && t <= sz.endT && Math.abs(lateralOffset - sz.lateral) <= sz.halfWidth) {
      return true;
    }
  }
  return false;
}

export function getTrackSample(t, trackId = 'coco') {
  return resolveTrack(trackId).sampleAt(t);
}

export function getTrackSamples(count = 240, trackId = 'coco') {
  const tr = resolveTrack(trackId);
  const n = Math.max(4, Math.floor(count));
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = tr.sampleAt(i / n);
  }
  return out;
}

export function projectOnTrack(x, z, trackId = 'coco') {
  const tr = resolveTrack(trackId);
  const samples = tr.projSamples;

  let bestIdx = 0;
  let bestDistSq = Infinity;

  for (let i = 0; i < PROJ_N; i += PROJ_COARSE_STEP) {
    const s = samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }

  let fineIdx = bestIdx;
  for (let offset = -PROJ_COARSE_STEP; offset <= PROJ_COARSE_STEP; offset++) {
    const idx = (bestIdx + offset + PROJ_N) % PROJ_N;
    const s = samples[idx];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      fineIdx = idx;
    }
  }

  let bestT = fineIdx / PROJ_N;
  const invN = 1 / PROJ_N;
  for (let seg = -1; seg <= 0; seg++) {
    const i0 = (fineIdx + seg + PROJ_N) % PROJ_N;
    const i1 = (i0 + 1) % PROJ_N;
    const a = samples[i0];
    const b = samples[i1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq > 1e-9) {
      let alpha = ((x - a.x) * abx + (z - a.z) * abz) / abLenSq;
      alpha = Math.max(0, Math.min(1, alpha));
      const px = a.x + abx * alpha;
      const pz = a.z + abz * alpha;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 <= bestDistSq) {
        bestDistSq = d2;
        bestT = wrap01((i0 + alpha) * invN);
      }
    }
  }

  const sample = tr.sampleAt(bestT);
  const rx = x - sample.x;
  const rz = z - sample.z;
  const lateralOffset = rx * sample.nx + rz * sample.nz;
  const distSq = rx * rx + rz * rz;

  return {
    t: sample.t,
    lateralOffset,
    distSq,
    sample,
  };
}

export function getTrackMeta(trackId = 'coco') {
  if (isArenaTrack(trackId)) {
    return ARENA_DATA;
  }
  const tr = resolveTrack(trackId);
  return {
    id: tr.id,
    baseId: tr.baseId,
    isMirror: tr.isMirror,
    isArena: false,
    length: tr.length,
    roadHalfWidth: tr.roadHalfWidth,
    itemBoxSpots: tr.itemBoxSpots,
    boostPadSpots: tr.boostPadSpots,
    rampSpots: tr.rampSpots,
    bumperSpots: tr.bumperSpots,
    coinSpots: tr.coinSpots,
    iceZones: tr.iceZones,
    shortcutZones: tr.shortcutZones,
    gapZones: tr.gapZones,
    turnSigns: tr.turnSigns,
    gapMarkers: tr.gapMarkers,
  };
}

// Legacy V1 exports aliased to 'coco'
export const TRACK_CONTROL_POINTS = COMPILED_TRACKS.coco.controlPoints;
export const TRACK_LENGTH = COMPILED_TRACKS.coco.length;
export const ITEM_BOX_SPOTS = COMPILED_TRACKS.coco.itemBoxSpots;
export const BOOST_PAD_SPOTS = COMPILED_TRACKS.coco.boostPadSpots;
export const RAMP_SPOTS = COMPILED_TRACKS.coco.rampSpots;

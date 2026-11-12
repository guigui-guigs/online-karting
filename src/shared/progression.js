import {
  KARTS,
  BOOST_STYLES,
  TRACKS,
  CC_CLASSES,
  MIRROR_UNLOCK_LEVEL,
} from './constants.js';

export const PROFILE_STORAGE_KEY = 'pocketkart_profile_v4';
export const MAX_LEVEL = 30;

let memoryFallbackStorage = null;

export function xpForLevel(level) {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (lvl <= 1) return 0;
  return Math.round(140 * Math.pow(lvl - 1, 1.45) + 80 * (lvl - 1));
}

export function computeLevelFromXp(xp = 0) {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l += 1) {
    if (safeXp >= xpForLevel(l)) {
      level = l;
    } else {
      break;
    }
  }
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = level < MAX_LEVEL ? xpForLevel(level + 1) : currentLevelXp;
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const progress = level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (safeXp - currentLevelXp) / span));
  return {
    level,
    xp: safeXp,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel: safeXp - currentLevelXp,
    xpNeededForNext: level >= MAX_LEVEL ? 0 : Math.max(0, nextLevelXp - safeXp),
    progress,
    isMax: level >= MAX_LEVEL,
  };
}

export function getRankTitle(level = 1) {
  if (level >= 30) return 'Roi de l’Arcade';
  if (level >= 22) return 'Grand Champion';
  if (level >= 15) return 'Légende Pocket';
  if (level >= 10) return 'Maestro Turbo';
  if (level >= 6) return 'Asphalte Pro';
  if (level >= 3) return 'As du Drift';
  return 'Pilote Novice';
}

const CHALLENGE_POOL = [
  { key: 'finish_podium', icon: '🥇', label: 'Finir sur le Podium (Top 3)', target: 2, rewardXp: 140, rewardCoins: 35, stat: 'podium' },
  { key: 'win_race', icon: '🏆', label: 'Remporter 1 victoire', target: 1, rewardXp: 180, rewardCoins: 45, stat: 'win' },
  { key: 'collect_coins', icon: '🪙', label: 'Ramasser 15 pièces en piste', target: 15, rewardXp: 120, rewardCoins: 30, stat: 'coins' },
  { key: 'super_drift', icon: '🔥', label: 'Réussir 6 dérapages turbo', target: 6, rewardXp: 150, rewardCoins: 35, stat: 'drifts' },
  { key: 'hit_rivals', icon: '💥', label: 'Toucher 4 rivaux avec des objets', target: 4, rewardXp: 160, rewardCoins: 40, stat: 'hits' },
  { key: 'play_knockout', icon: '💀', label: 'Survivre en mode Élimination', target: 1, rewardXp: 170, rewardCoins: 45, stat: 'knockout_win' },
  { key: 'battle_pops', icon: '🎈', label: 'Éclater 4 ballons en Arène', target: 4, rewardXp: 175, rewardCoins: 45, stat: 'balloon_pops' },
  { key: 'time_trial', icon: '⏱️', label: 'Décrocher une médaille Chrono', target: 1, rewardXp: 155, rewardCoins: 40, stat: 'tt_medal' },
];

function createChallengeFromTemplate(tpl, seq = 0) {
  return {
    id: `${tpl.key}_${Date.now().toString(36)}_${seq}`,
    key: tpl.key,
    stat: tpl.stat,
    icon: tpl.icon,
    label: tpl.label,
    target: tpl.target,
    progress: 0,
    rewardXp: tpl.rewardXp,
    rewardCoins: tpl.rewardCoins,
  };
}

export function generateFlashChallenges(existing = [], count = 3) {
  const list = Array.isArray(existing) ? existing.slice(0, count) : [];
  const usedKeys = new Set(list.map((c) => c.key));
  let seq = 0;
  while (list.length < count) {
    const candidates = CHALLENGE_POOL.filter((t) => !usedKeys.has(t.key));
    const pool = candidates.length > 0 ? candidates : CHALLENGE_POOL;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedKeys.add(pick.key);
    list.push(createChallengeFromTemplate(pick, seq++));
  }
  return list;
}

export function createDefaultProfile() {
  const profile = {
    version: 4,
    xp: 0,
    level: 1,
    coins: 0,
    selectedKart: 'classic',
    selectedBoost: 'flame',
    selectedCc: '100cc',
    mirrorEnabled: false,
    selectedFormat: 'race',
    selectedCup: 'sun',
    unlockedKarts: ['classic'],
    unlockedBoosts: ['flame'],
    stats: {
      races: 0,
      wins: 0,
      podiums: 0,
      itemsHit: 0,
      drifts: 0,
      coinsCollected: 0,
      knockoutsWon: 0,
      battlePops: 0,
    },
    cups: {},
    timeTrials: {},
    challenges: generateFlashChallenges([], 3),
  };
  return profile;
}

export function syncAutoUnlocks(profile) {
  const levelInfo = computeLevelFromXp(profile.xp);
  profile.level = levelInfo.level;
  const newlyUnlocked = [];

  for (const kart of KARTS) {
    if (!profile.unlockedKarts.includes(kart.id) && levelInfo.level >= kart.unlockLevel) {
      profile.unlockedKarts.push(kart.id);
      newlyUnlocked.push({ kind: 'kart', id: kart.id, name: kart.name, icon: kart.icon });
    }
  }
  for (const boost of BOOST_STYLES) {
    if (!profile.unlockedBoosts.includes(boost.id) && levelInfo.level >= boost.unlockLevel) {
      profile.unlockedBoosts.push(boost.id);
      newlyUnlocked.push({ kind: 'boost', id: boost.id, name: boost.name, icon: boost.icon });
    }
  }
  return newlyUnlocked;
}

export function normalizeProfile(raw) {
  const base = createDefaultProfile();
  if (!raw || typeof raw !== 'object') return base;

  const profile = {
    ...base,
    xp: Math.max(0, Number(raw.xp) || 0),
    coins: Math.max(0, Number(raw.coins) || 0),
    selectedKart: KARTS.some((k) => k.id === raw.selectedKart) ? raw.selectedKart : 'classic',
    selectedBoost: BOOST_STYLES.some((b) => b.id === raw.selectedBoost) ? raw.selectedBoost : 'flame',
    selectedCc: CC_CLASSES[raw.selectedCc] ? raw.selectedCc : '100cc',
    mirrorEnabled: Boolean(raw.mirrorEnabled),
    selectedFormat: typeof raw.selectedFormat === 'string' ? raw.selectedFormat : 'race',
    selectedCup: typeof raw.selectedCup === 'string' ? raw.selectedCup : 'sun',
    unlockedKarts: Array.isArray(raw.unlockedKarts) ? [...new Set(['classic', ...raw.unlockedKarts])] : ['classic'],
    unlockedBoosts: Array.isArray(raw.unlockedBoosts) ? [...new Set(['flame', ...raw.unlockedBoosts])] : ['flame'],
    stats: { ...base.stats, ...(raw.stats && typeof raw.stats === 'object' ? raw.stats : {}) },
    cups: raw.cups && typeof raw.cups === 'object' ? { ...raw.cups } : {},
    timeTrials: raw.timeTrials && typeof raw.timeTrials === 'object' ? { ...raw.timeTrials } : {},
    challenges: generateFlashChallenges(
      Array.isArray(raw.challenges) ? raw.challenges.filter((c) => c && c.key && Number.isFinite(c.target)) : [],
      3
    ),
  };

  syncAutoUnlocks(profile);

  if (!profile.unlockedKarts.includes(profile.selectedKart)) {
    profile.selectedKart = 'classic';
  }
  if (!profile.unlockedBoosts.includes(profile.selectedBoost)) {
    profile.selectedBoost = 'flame';
  }
  if (!isCcUnlocked(profile, profile.selectedCc)) {
    profile.selectedCc = '100cc';
  }
  if (!isMirrorUnlocked(profile)) {
    profile.mirrorEnabled = false;
  }
  return profile;
}

export function loadProfile() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) return normalizeProfile(JSON.parse(raw));
    } else if (memoryFallbackStorage) {
      return normalizeProfile(JSON.parse(memoryFallbackStorage));
    }
  } catch {
    // ignore corrupted profile
  }
  const fresh = createDefaultProfile();
  saveProfile(fresh);
  return fresh;
}

export function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  const json = JSON.stringify(normalized);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PROFILE_STORAGE_KEY, json);
    } else {
      memoryFallbackStorage = json;
    }
  } catch {
    memoryFallbackStorage = json;
  }
  return normalized;
}

export function isCcUnlocked(profile, cc) {
  const cfg = CC_CLASSES[cc];
  if (!cfg) return false;
  return (profile?.level || 1) >= cfg.unlockLevel;
}

export function isMirrorUnlocked(profile) {
  if (!profile) return false;
  if ((profile.level || 1) >= MIRROR_UNLOCK_LEVEL) return true;
  return Object.values(profile.cups || {}).some((entry) => entry && entry.trophy === 'gold');
}

export function purchaseKartWithCoins(profile, kartId) {
  const kart = KARTS.find((k) => k.id === kartId);
  if (!kart) return { ok: false, reason: 'Kart introuvable' };
  if (profile.unlockedKarts.includes(kartId)) {
    profile.selectedKart = kartId;
    saveProfile(profile);
    return { ok: true, alreadyUnlocked: true, profile };
  }
  if ((profile.coins || 0) < kart.cost) {
    return { ok: false, reason: `Il manque ${kart.cost - (profile.coins || 0)} pièces` };
  }
  profile.coins -= kart.cost;
  profile.unlockedKarts.push(kartId);
  profile.selectedKart = kartId;
  saveProfile(profile);
  return { ok: true, purchased: kart, profile };
}

export function purchaseBoostWithCoins(profile, boostId) {
  const boost = BOOST_STYLES.find((b) => b.id === boostId);
  if (!boost) return { ok: false, reason: 'Boost introuvable' };
  if (profile.unlockedBoosts.includes(boostId)) {
    profile.selectedBoost = boostId;
    saveProfile(profile);
    return { ok: true, alreadyUnlocked: true, profile };
  }
  if ((profile.coins || 0) < boost.cost) {
    return { ok: false, reason: `Il manque ${boost.cost - (profile.coins || 0)} pièces` };
  }
  profile.coins -= boost.cost;
  profile.unlockedBoosts.push(boostId);
  profile.selectedBoost = boostId;
  saveProfile(profile);
  return { ok: true, purchased: boost, profile };
}

export function getTimeTrialTargets(trackId) {
  const baseId = String(trackId || 'coco').replace(/__mirror$/, '');
  const track = TRACKS.find((t) => t.id === baseId) || TRACKS[0];
  const authorMs = track.authorMs || 62000;
  return {
    authorMs,
    goldMs: Math.round(authorMs * 1.12),
    silverMs: Math.round(authorMs * 1.28),
    bronzeMs: Math.round(authorMs * 1.48),
  };
}

export function evaluateTimeTrialMedal(trackId, timeMs) {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return null;
  const targets = getTimeTrialTargets(trackId);
  if (timeMs <= targets.authorMs) return 'author';
  if (timeMs <= targets.goldMs) return 'gold';
  if (timeMs <= targets.silverMs) return 'silver';
  if (timeMs <= targets.bronzeMs) return 'bronze';
  return null;
}

const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3, author: 4 };

export function recordMatchResult(profile, {
  format = 'race',
  cc = '100cc',
  rank = 1,
  totalPlayers = 6,
  coinsCollected = 0,
  drifts = 0,
  itemsHit = 0,
  battleScore = 0,
  balloonsLeft = 0,
  eliminated = false,
  trackId = 'coco',
  finishTimeMs = null,
  ghostToken = null,
  isOnline = false,
} = {}) {
  const prevLevel = profile.level || 1;
  const ccMult = CC_CLASSES[cc]?.xpMult || 1.0;

  profile.stats.races += 1;
  profile.stats.coinsCollected += Math.max(0, coinsCollected);
  profile.stats.drifts += Math.max(0, drifts);
  profile.stats.itemsHit += Math.max(0, itemsHit);
  profile.stats.battlePops += Math.max(0, battleScore);

  const isWin = rank === 1 && !eliminated;
  const isPodium = rank <= 3 && !eliminated;
  if (isWin) profile.stats.wins += 1;
  if (isPodium) profile.stats.podiums += 1;
  if (format === 'knockout' && isWin) profile.stats.knockoutsWon += 1;

  // Compute XP breakdown
  const breakdown = [];
  let baseXp = 60;
  if (format === 'timetrial') baseXp = 55;
  if (format === 'balloon') baseXp = 70;
  if (format === 'knockout') baseXp = 75;
  breakdown.push({ label: 'Course terminée', value: baseXp });

  const rankTable = [130, 95, 70, 45, 30, 18];
  const rankBonus = format === 'timetrial' ? 0 : (rankTable[Math.max(0, Math.min(5, rank - 1))] || 18);
  if (rankBonus > 0) breakdown.push({ label: `Classement #${rank}`, value: rankBonus });

  const actionBonus = Math.min(75, Math.round(drifts * 5 + itemsHit * 12 + battleScore * 20));
  if (actionBonus > 0) breakdown.push({ label: 'Style & Action', value: actionBonus });

  if (isOnline && totalPlayers > 1) {
    breakdown.push({ label: 'Bonus Multijoueur', value: 40 });
  }

  let medalResult = null;
  let isNewPb = false;
  if (format === 'timetrial' && Number.isFinite(finishTimeMs) && finishTimeMs > 0) {
    medalResult = evaluateTimeTrialMedal(trackId, finishTimeMs);
    const prevTt = profile.timeTrials[trackId];
    if (!prevTt || finishTimeMs < prevTt.bestMs) {
      isNewPb = true;
      const bestMedal = !prevTt?.medal || (MEDAL_RANK[medalResult] || 0) >= (MEDAL_RANK[prevTt.medal] || 0)
        ? medalResult
        : prevTt.medal;
      profile.timeTrials[trackId] = {
        bestMs: Math.round(finishTimeMs),
        medal: bestMedal,
        ghostToken: ghostToken || prevTt?.ghostToken || null,
      };
      breakdown.push({ label: 'Nouveau Record !', value: 65 });
    } else if (medalResult && (!prevTt.medal || MEDAL_RANK[medalResult] > MEDAL_RANK[prevTt.medal])) {
      prevTt.medal = medalResult;
    }
    if (medalResult) {
      const medalBonus = { bronze: 35, silver: 60, gold: 95, author: 160 }[medalResult] || 0;
      breakdown.push({ label: `Médaille ${medalResult.toUpperCase()}`, value: medalBonus });
    }
  }

  const rawXpSum = breakdown.reduce((sum, item) => sum + item.value, 0);
  let xpGained = Math.round(rawXpSum * ccMult);
  if (ccMult > 1) {
    breakdown.push({ label: `Multiplicateur ${cc}`, value: xpGained - rawXpSum });
  }

  // Coins earned (rank coins + track pickups)
  const rankCoins = format === 'timetrial'
    ? (medalResult ? { bronze: 12, silver: 20, gold: 32, author: 55 }[medalResult] : 8)
    : ([25, 18, 13, 9, 6, 4][Math.max(0, Math.min(5, rank - 1))] || 4);
  const pickupCoins = Math.max(0, coinsCollected);
  let coinsEarned = rankCoins + pickupCoins + (isNewPb ? 15 : 0);

  // Advance Flash Challenges
  const increments = {
    podium: isPodium ? 1 : 0,
    win: isWin ? 1 : 0,
    coins: Math.max(0, coinsCollected),
    drifts: Math.max(0, drifts),
    hits: Math.max(0, itemsHit),
    knockout_win: format === 'knockout' && isWin ? 1 : 0,
    balloon_pops: format === 'balloon' ? Math.max(0, battleScore) : 0,
    tt_medal: format === 'timetrial' && medalResult ? 1 : 0,
  };

  const completedChallenges = [];
  const remainingChallenges = [];
  for (const ch of profile.challenges || []) {
    const add = increments[ch.stat] || 0;
    const nextProgress = Math.min(ch.target, (ch.progress || 0) + add);
    const updated = { ...ch, progress: nextProgress };
    if (nextProgress >= ch.target) {
      completedChallenges.push(updated);
      xpGained += updated.rewardXp;
      coinsEarned += updated.rewardCoins;
      breakdown.push({ label: `Défi: ${updated.label}`, value: updated.rewardXp });
    } else {
      remainingChallenges.push(updated);
    }
  }
  profile.challenges = generateFlashChallenges(remainingChallenges, 3);

  profile.xp += xpGained;
  profile.coins += coinsEarned;

  const newUnlocks = syncAutoUnlocks(profile);
  const newLevel = profile.level;
  if (format === 'balloon' && balloonsLeft > 0) {
    coinsEarned += balloonsLeft * 2;
    profile.coins += balloonsLeft * 2;
  }

  const saved = saveProfile(profile);
  return {
    profile: saved,
    xpGained,
    breakdown,
    coinsEarned,
    prevLevel,
    newLevel,
    leveledUp: newLevel > prevLevel,
    newUnlocks,
    completedChallenges,
    medalResult,
    isNewPb,
  };
}

export function recordGrandPrixResult(profile, {
  cupId = 'sun',
  cc = '100cc',
  mirror = false,
  position = 1,
  totalPoints = 0,
  maxPoints = 45,
} = {}) {
  const prevLevel = profile.level || 1;
  const key = `${cupId}_${cc}${mirror ? '_mirror' : ''}`;
  const trophy = position === 1 ? 'gold' : position === 2 ? 'silver' : position === 3 ? 'bronze' : null;
  const stars = totalPoints >= maxPoints * 0.9 ? 3 : position === 1 ? 2 : position <= 3 ? 1 : 0;

  const TROPHY_RANK = { bronze: 1, silver: 2, gold: 3 };
  const prev = profile.cups[key];
  const bestTrophy = (!prev?.trophy || (TROPHY_RANK[trophy] || 0) >= (TROPHY_RANK[prev.trophy] || 0))
    ? trophy
    : prev.trophy;
  const bestPos = prev?.bestPos ? Math.min(prev.bestPos, position) : position;
  const bestStars = Math.max(prev?.stars || 0, stars);

  profile.cups[key] = {
    bestPos,
    trophy: bestTrophy || prev?.trophy || null,
    stars: bestStars,
    points: Math.max(prev?.points || 0, totalPoints),
  };

  const bonusXp = trophy === 'gold' ? 260 : trophy === 'silver' ? 170 : trophy === 'bronze' ? 110 : 60;
  const bonusCoins = trophy === 'gold' ? 85 : trophy === 'silver' ? 55 : trophy === 'bronze' ? 35 : 15;
  profile.xp += bonusXp;
  profile.coins += bonusCoins;

  const newUnlocks = syncAutoUnlocks(profile);
  const saved = saveProfile(profile);
  return {
    profile: saved,
    trophy,
    stars,
    bonusXp,
    bonusCoins,
    prevLevel,
    newLevel: saved.level,
    leveledUp: saved.level > prevLevel,
    newUnlocks,
  };
}

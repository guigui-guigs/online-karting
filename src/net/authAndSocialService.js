import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { RACERS, TRACKS } from '../shared/constants.js';

export const STARTER_RACERS = ['red', 'aqua', 'kiwi'];

export const RACER_UNLOCK_LEVELS = {
  red: 1,
  aqua: 1,
  kiwi: 1,
  berry: 3,
  sunny: 6,
  cosmic: 10,
};

const LEVEL_THRESHOLDS = [0, 140, 340, 600, 920, 1300, 1750, 2260, 2840, 3500];
const MAX_LEVEL = 99;
const PENDING_CLAIM_KEY = 'pocketkart_pending_guest_claim';
const PENDING_FRIEND_KEY = 'pocketkart_pending_friend_code';
const LOCAL_V4_PROFILE_KEY = 'pocketkart_profile_v4';
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function xpThresholdForLevel(level) {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level || 1)));
  if (lvl <= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[lvl - 1];
  }
  return Math.round(3500 + 750 * Math.pow(lvl - 10, 1.18));
}

export function computePilotLevel(xp = 0) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l += 1) {
    if (safeXp >= xpThresholdForLevel(l)) {
      level = l;
    } else {
      break;
    }
  }
  const currentThreshold = xpThresholdForLevel(level);
  const nextThreshold = level < MAX_LEVEL ? xpThresholdForLevel(level + 1) : currentThreshold;
  const span = Math.max(1, nextThreshold - currentThreshold);
  const progress = level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (safeXp - currentThreshold) / span));
  return {
    level,
    xp: safeXp,
    currentThreshold,
    nextThreshold,
    xpIntoLevel: safeXp - currentThreshold,
    xpToNext: level >= MAX_LEVEL ? 0 : Math.max(0, nextThreshold - safeXp),
    progress,
    isMax: level >= MAX_LEVEL,
  };
}

export function getPilotTitle(level = 1) {
  if (level >= 15) return '👑 Légende Céleste';
  if (level >= 10) return '🐢 Boss des Circuits';
  if (level >= 6) return '⚡ As du Turbo-Drift';
  if (level >= 3) return '🔥 Pilote Confirmé';
  return '🌱 Rookie du Bitume';
}

export function getUnlockedRacerIds({ isAuthenticated = false, level = 1 } = {}) {
  if (!isAuthenticated) {
    return [...STARTER_RACERS];
  }
  const lvl = Math.max(1, Number(level) || 1);
  return RACERS.filter((r) => lvl >= (RACER_UNLOCK_LEVELS[r.id] || 1)).map((r) => r.id);
}

export function isRacerUnlocked(racerId, { isAuthenticated = false, level = 1 } = {}) {
  if (!isAuthenticated) {
    return STARTER_RACERS.includes(racerId);
  }
  const req = RACER_UNLOCK_LEVELS[racerId] || 1;
  return Math.max(1, Number(level) || 1) >= req;
}

export function computeRaceReward({
  rank = 1,
  trophiesCount = 0,
  isNewPb = false,
  isOnline = false,
  finishTimeMs = 0,
  trackId = 'coco',
  racerId = 'red',
  kartId = 'classic',
  ghostToken = null,
} = {}) {
  const safeRank = Math.max(1, Math.min(6, Math.round(Number(rank) || 6)));
  const safeTrophies = Math.max(0, Math.round(Number(trophiesCount) || 0));
  const breakdown = [];

  breakdown.push({ label: 'Course terminée', value: 40 });

  const placementTable = [100, 70, 50, 30, 15, 5];
  const placementBonus = placementTable[safeRank - 1] ?? 5;
  breakdown.push({ label: `Place #${safeRank}`, value: placementBonus });

  if (safeTrophies > 0) {
    breakdown.push({
      label: `${safeTrophies} Trophée${safeTrophies > 1 ? 's' : ''}`,
      value: 25 * safeTrophies,
    });
  }

  if (isNewPb) {
    breakdown.push({ label: 'Record Personnel', value: 35 });
  }

  if (isOnline) {
    breakdown.push({ label: 'Course en Ligne', value: 30 });
  }

  const xpGained = breakdown.reduce((sum, item) => sum + item.value, 0);
  return {
    xpGained,
    breakdown,
    rank: safeRank,
    trophiesCount: safeTrophies,
    isNewPb: Boolean(isNewPb),
    isOnline: Boolean(isOnline),
    finishTimeMs: Math.max(0, Math.round(Number(finishTimeMs) || 0)),
    trackId: String(trackId || TRACKS[0]?.id || 'coco'),
    racerId: RACERS.some((r) => r.id === racerId) ? racerId : 'red',
    kartId: String(kartId || 'classic'),
    ghostToken: typeof ghostToken === 'string' && ghostToken.length > 0 ? ghostToken : null,
  };
}

function readJsonStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, val) {
  try {
    if (val === null || val === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(val));
    }
  } catch {
    // Ignore storage restrictions
  }
}

function generateLocalFriendCode() {
  let code = 'PK-';
  for (let i = 0; i < 4; i++) {
    code += FRIEND_ALPHABET[Math.floor(Math.random() * FRIEND_ALPHABET.length)];
  }
  return code;
}

export function normalizeFriendCode(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('PK-')) return cleaned.slice(0, 10);
  const bare = cleaned.replace(/^PK/, '');
  return bare ? `PK-${bare.slice(0, 6)}` : '';
}

function cleanDisplayName(raw, fallback = 'Pilote') {
  const s = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return s || fallback;
}

function buildCleanRedirectUrl() {
  const url = new URL(window.location.href);
  const authErrorParams = ['error', 'error_code', 'error_description', 'code', 'state'];
  authErrorParams.forEach((p) => url.searchParams.delete(p));
  if (url.hash && (url.hash.includes('access_token=') || url.hash.includes('error='))) {
    url.hash = '';
  }
  return url.toString();
}

export class AuthAndSocialManager {
  constructor({ onNotice = null, onProfileUpdated = null } = {}) {
    this.onNotice = typeof onNotice === 'function' ? onNotice : null;
    this.onProfileUpdated = typeof onProfileUpdated === 'function' ? onProfileUpdated : null;

    this._listeners = new Set();
    this._authSub = null;
    this._realtimeChannel = null;
    this._lastRecordedRaceKey = null;

    this.state = {
      initialized: false,
      isConfigured: isSupabaseConfigured(),
      user: null,
      profile: null,
      pendingGuestClaim: this._loadPendingGuestClaim(),
      friends: [],
      incomingFriendRequests: [],
      outgoingFriendRequests: [],
      roomInvites: [],
      lastRaceOutcome: null,
      pendingFriendCode: this._consumeFriendCodeFromUrl(),
    };
  }

  _consumeFriendCodeFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('friend');
      if (raw) {
        const normalized = normalizeFriendCode(raw);
        if (normalized) {
          window.sessionStorage.setItem(PENDING_FRIEND_KEY, normalized);
          return normalized;
        }
      }
      return window.sessionStorage.getItem(PENDING_FRIEND_KEY) || '';
    } catch {
      return '';
    }
  }

  clearPendingFriendCode() {
    this.state.pendingFriendCode = '';
    try {
      window.sessionStorage.removeItem(PENDING_FRIEND_KEY);
      const url = new URL(window.location.href);
      if (url.searchParams.has('friend')) {
        url.searchParams.delete('friend');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // ignore
    }
    this._emit();
  }

  _loadPendingGuestClaim() {
    const claim = readJsonStorage(PENDING_CLAIM_KEY);
    if (!claim || typeof claim !== 'object') return null;
    if (Date.now() - (Number(claim.createdAt) || 0) > CLAIM_TTL_MS) {
      writeJsonStorage(PENDING_CLAIM_KEY, null);
      return null;
    }
    return claim;
  }

  _savePendingGuestClaim(claim) {
    this.state.pendingGuestClaim = claim;
    writeJsonStorage(PENDING_CLAIM_KEY, claim);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this._listeners.delete(listener);
    };
  }

  _emit() {
    const snap = this.getSnapshot();
    for (const fn of this._listeners) {
      try {
        fn(snap);
      } catch (err) {
        console.error('[PocketKart Auth] Subscriber error:', err);
      }
    }
  }

  getSnapshot() {
    const user = this.state.user;
    const profile = this.state.profile;
    const isAuthenticated = Boolean(user && profile);
    const levelInfo = computePilotLevel(profile?.xp || 0);
    const unlockedRacers = getUnlockedRacerIds({
      isAuthenticated,
      level: levelInfo.level,
    });
    return {
      ...this.state,
      isAuthenticated,
      levelInfo,
      title: profile?.title || getPilotTitle(levelInfo.level),
      unlockedRacers,
      unreadSocialCount:
        (this.state.incomingFriendRequests?.length || 0) + (this.state.roomInvites?.length || 0),
    };
  }

  isAuthenticated() {
    return Boolean(this.state.user && this.state.profile);
  }

  async init() {
    if (!supabase) {
      this.state.initialized = true;
      this._emit();
      return this.getSnapshot();
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      await this._handleSignedInUser(sessionData.session.user, { isInitial: true });
    } else {
      this.state.initialized = true;
      this._emit();
    }

    const { data: listenerData } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const signedInUser = session.user;
        setTimeout(() => {
          this._handleSignedInUser(signedInUser, { isInitial: false }).catch((err) => {
            console.warn('[PocketKart Auth] Sign-in sync error:', err?.message || err);
          });
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        this._teardownRealtime();
        this.state.user = null;
        this.state.profile = null;
        this.state.friends = [];
        this.state.incomingFriendRequests = [];
        this.state.outgoingFriendRequests = [];
        this.state.roomInvites = [];
        this._emit();
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        this.state.user = session.user;
      }
    });

    this._authSub = listenerData?.subscription || null;
    this.state.initialized = true;
    this._emit();
    return this.getSnapshot();
  }

  async _handleSignedInUser(user, { isInitial = false } = {}) {
    if (this._signInInFlight) {
      return this._signInInFlight;
    }
    this._signInInFlight = (async () => {
      try {
        this.state.user = user;
        await this.ensureProfile(user);
        await this.claimPendingGuestRaceIfAny();
        await this.loadFriendsAndRequests();
        this._setupRealtime(user.id);
        this.state.initialized = true;
        this._emit();
        if (this.state.profile) {
          this.onProfileUpdated?.(this.state.profile, { isInitial });
        }
      } finally {
        this._signInInFlight = null;
      }
    })();
    return this._signInInFlight;
  }

  async ensureProfile(user) {
    if (!supabase || !user) return null;

    const { data: existing, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[PocketKart Auth] Failed to fetch profile:', error.message);
      return null;
    }

    if (existing) {
      this.state.profile = existing;
      return existing;
    }

    const meta = user.user_metadata || {};
    const localSavedName = readJsonStorage('pocketkart_player_name');
    const candidateName = cleanDisplayName(
      meta.full_name || meta.name || user.email?.split('@')[0] || localSavedName || 'Pilote'
    );
    const avatarUrl = (meta.avatar_url || meta.picture || '').trim() || null;
    const localProfileData = readJsonStorage(LOCAL_V4_PROFILE_KEY) || {};

    const insertRow = {
      id: user.id,
      friend_code: generateLocalFriendCode(),
      display_name: candidateName,
      avatar_url: avatarUrl,
      favorite_racer: 'red',
      xp: 0,
      level: 1,
      title: getPilotTitle(1),
      unlocked_racers: [...STARTER_RACERS],
      profile_data: localProfileData,
    };

    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .insert(insertRow)
      .select('*')
      .single();

    if (insertErr) {
      console.warn('[PocketKart Auth] Profile fallback insert failed:', insertErr.message);
      return null;
    }
    this.state.profile = created;
    return created;
  }

  async signInWithGoogle() {
    if (!supabase) {
      throw new Error('Supabase non configuré (.env manquant).');
    }
    const redirectTo = buildCleanRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      const msg = String(error.message || '');
      if (msg.toLowerCase().includes('not enabled') || msg.toLowerCase().includes('provider')) {
        const err = new Error(
          'Google OAuth doit encore être activé dans le Dashboard Supabase (Client ID & Secret Google). Utilise le lien magique par e-mail ci-dessous pour tester tout de suite !'
        );
        err.code = 'google_disabled';
        throw err;
      }
      throw error;
    }
    return data;
  }

  async signInWithMagicLink(email) {
    if (!supabase) {
      throw new Error('Supabase non configuré (.env manquant).');
    }
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Entre une adresse e-mail valide.');
    }
    const redirectTo = buildCleanRedirectUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return { ok: true, email: cleanEmail };
  }

  async signOut() {
    this._teardownRealtime();
    if (supabase) {
      await supabase.auth.signOut();
    }
    this.state.user = null;
    this.state.profile = null;
    this.state.friends = [];
    this.state.incomingFriendRequests = [];
    this.state.outgoingFriendRequests = [];
    this.state.roomInvites = [];
    this._emit();
  }

  async updateDisplayName(newName) {
    const clean = cleanDisplayName(newName);
    if (!supabase || !this.isAuthenticated()) return clean;

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: clean,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.state.user.id)
      .select('*')
      .single();

    if (error) throw error;
    this.state.profile = data;
    this._emit();
    this.onProfileUpdated?.(data, { isInitial: false });
    return data.display_name;
  }

  async updateFavoriteRacer(racerId) {
    if (!supabase || !this.isAuthenticated()) return;
    if (!RACERS.some((r) => r.id === racerId)) return;
    if (this.state.profile?.favorite_racer === racerId) return;

    const { data, error } = await supabase
      .from('profiles')
      .update({
        favorite_racer: racerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.state.user.id)
      .select('*')
      .single();

    if (!error && data) {
      this.state.profile = data;
      this._emit();
    }
  }

  async setActiveRoomCode(roomCode) {
    if (!supabase || !this.isAuthenticated()) return;
    const cleanCode = roomCode ? String(roomCode).trim().toUpperCase().slice(0, 8) : null;
    try {
      const { data } = await supabase
        .from('profiles')
        .update({
          active_room_code: cleanCode,
          active_room_updated_at: cleanCode ? new Date().toISOString() : null,
        })
        .eq('id', this.state.user.id)
        .select('*')
        .single();
      if (data) {
        this.state.profile = data;
        this._emit();
      }
    } catch {
      // Non-critical presence update
    }
  }

  async recordFinishedRace(raceSummary = {}) {
    const dedupKey =
      raceSummary.raceKey ||
      `${raceSummary.mode || 'solo'}|${raceSummary.trackId || 'coco'}|${Math.round(
        raceSummary.finishTimeMs || 0
      )}|${raceSummary.rank || 1}`;
    if (dedupKey === this._lastRecordedRaceKey && this.state.lastRaceOutcome) {
      return this.state.lastRaceOutcome;
    }
    this._lastRecordedRaceKey = dedupKey;

    if (!this.isAuthenticated() || !supabase) {
      const reward = computeRaceReward({
        ...raceSummary,
        isNewPb: false,
      });
      const claim = {
        ...reward,
        createdAt: Date.now(),
      };
      this._savePendingGuestClaim(claim);
      const outcome = {
        savedToCloud: false,
        pendingClaim: claim,
        ...reward,
      };
      this.state.lastRaceOutcome = outcome;
      this._emit();
      return outcome;
    }

    const outcome = await this._applyRaceToCloudProfile(raceSummary);
    this.state.lastRaceOutcome = outcome;
    this._emit();
    return outcome;
  }

  async _applyRaceToCloudProfile(raceSummary) {
    const userId = this.state.user.id;
    const profile = this.state.profile;
    const trackId = String(raceSummary.trackId || 'coco').slice(0, 32);
    const finishTimeMs = Math.round(Number(raceSummary.finishTimeMs) || 0);
    const validTime = finishTimeMs >= 5000 && finishTimeMs <= 600000;

    let isNewPb = false;
    let existingRecord = null;
    if (validTime && trackId !== 'arena') {
      const { data: rec } = await supabase
        .from('track_records')
        .select('best_time_ms')
        .eq('user_id', userId)
        .eq('track_id', trackId)
        .maybeSingle();
      existingRecord = rec || null;
      isNewPb = !existingRecord || finishTimeMs < existingRecord.best_time_ms;
    }

    const reward = computeRaceReward({
      ...raceSummary,
      isNewPb,
    });

    const prevLevel = profile.level || computePilotLevel(profile.xp || 0).level;
    const nextXp = (profile.xp || 0) + reward.xpGained;
    const levelInfo = computePilotLevel(nextXp);
    const nextUnlockedRacers = getUnlockedRacerIds({
      isAuthenticated: true,
      level: levelInfo.level,
    });
    const prevUnlocked = new Set(profile.unlocked_racers || STARTER_RACERS);
    const newlyUnlockedRacers = nextUnlockedRacers.filter((id) => !prevUnlocked.has(id));
    const localProfileData = readJsonStorage(LOCAL_V4_PROFILE_KEY);

    const { data: updatedProfile, error: profErr } = await supabase
      .from('profiles')
      .update({
        xp: nextXp,
        level: levelInfo.level,
        title: getPilotTitle(levelInfo.level),
        races_played: (profile.races_played || 0) + 1,
        wins: (profile.wins || 0) + (reward.rank === 1 ? 1 : 0),
        podiums: (profile.podiums || 0) + (reward.rank <= 3 ? 1 : 0),
        trophies_won: (profile.trophies_won || 0) + reward.trophiesCount,
        unlocked_racers: nextUnlockedRacers,
        favorite_racer: reward.racerId,
        ...(localProfileData ? { profile_data: localProfileData } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (profErr) {
      throw profErr;
    }
    this.state.profile = updatedProfile;

    let bestTimeMs = existingRecord?.best_time_ms || null;
    if (isNewPb) {
      const safeGhost =
        typeof reward.ghostToken === 'string' && reward.ghostToken.length <= 24000
          ? reward.ghostToken
          : null;
      const { error: recErr } = await supabase.from('track_records').upsert(
        {
          user_id: userId,
          track_id: trackId,
          best_time_ms: finishTimeMs,
          racer_id: reward.racerId,
          kart_id: reward.kartId,
          ghost_token: safeGhost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,track_id' }
      );
      if (!recErr) {
        bestTimeMs = finishTimeMs;
      } else {
        console.warn('[PocketKart Records] Failed to upsert record:', recErr.message);
      }
    }

    return {
      savedToCloud: true,
      ...reward,
      prevLevel,
      newLevel: levelInfo.level,
      leveledUp: levelInfo.level > prevLevel,
      newlyUnlockedRacers,
      bestTimeMs,
    };
  }

  async claimPendingGuestRaceIfAny() {
    if (!this.isAuthenticated() || !supabase) return null;
    const claim = this._loadPendingGuestClaim();
    if (!claim) return null;

    writeJsonStorage(PENDING_CLAIM_KEY, null);
    this.state.pendingGuestClaim = null;

    try {
      const res = await this._applyRaceToCloudProfile(claim);
      this.state.lastRaceOutcome = res;
      this.onNotice?.(
        `🎉 Connecté ! Tes +${res.xpGained} XP${res.isNewPb ? ' et ton record' : ''} ont été sauvegardés !`,
        'success'
      );
      this._emit();
      return res;
    } catch (err) {
      console.warn('[PocketKart Auth] Failed to claim guest race:', err?.message);
      return null;
    }
  }

  async fetchTrackLeaderboard(trackId = 'coco', scope = 'global') {
    if (!supabase) {
      return { rows: [], myBest: null };
    }

    const cleanTrack = String(trackId || 'coco');
    let query = supabase
      .from('track_records')
      .select(
        'id, user_id, track_id, best_time_ms, racer_id, kart_id, ghost_token, updated_at, profiles!inner(id, display_name, avatar_url, level, title, friend_code)'
      )
      .eq('track_id', cleanTrack)
      .order('best_time_ms', { ascending: true })
      .limit(50);

    if (scope === 'friends') {
      if (!this.isAuthenticated()) {
        return { rows: [], myBest: null };
      }
      const ids = [
        this.state.user.id,
        ...this.state.friends.map((f) => f.profile?.id).filter(Boolean),
      ];
      query = query.in('user_id', ids);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    let myBest = null;
    if (this.isAuthenticated()) {
      myBest = rows.find((r) => r.user_id === this.state.user.id) || null;
      if (!myBest && scope === 'global') {
        const { data: own } = await supabase
          .from('track_records')
          .select('best_time_ms, racer_id, kart_id, updated_at')
          .eq('user_id', this.state.user.id)
          .eq('track_id', cleanTrack)
          .maybeSingle();
        myBest = own || null;
      }
    }

    return { rows, myBest };
  }

  async loadFriendsAndRequests() {
    if (!supabase || !this.isAuthenticated()) return;
    const myId = this.state.user.id;

    const [{ data: ships, error: shipErr }, { data: invites, error: invErr }] = await Promise.all([
      supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`),
      supabase
        .from('room_invites')
        .select('id, sender_id, recipient_id, room_code, track_id, created_at')
        .eq('recipient_id', myId)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (shipErr) {
      console.warn('[PocketKart Friends] Load error:', shipErr.message);
    }
    if (invErr) {
      console.warn('[PocketKart Invites] Load error:', invErr.message);
    }

    const shipRows = Array.isArray(ships) ? ships : [];
    const inviteRows = Array.isArray(invites) ? invites : [];
    const otherIds = new Set();
    for (const s of shipRows) {
      otherIds.add(s.requester_id === myId ? s.addressee_id : s.requester_id);
    }
    for (const inv of inviteRows) {
      otherIds.add(inv.sender_id);
    }

    let profileMap = new Map();
    if (otherIds.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, friend_code, display_name, avatar_url, level, title, active_room_code, active_room_updated_at')
        .in('id', [...otherIds]);
      for (const p of profs || []) {
        profileMap.set(p.id, p);
      }
    }

    const friends = [];
    const incoming = [];
    const outgoing = [];

    for (const s of shipRows) {
      const otherId = s.requester_id === myId ? s.addressee_id : s.requester_id;
      const otherProfile = profileMap.get(otherId) || { id: otherId, display_name: 'Pilote', level: 1 };
      const entry = {
        friendshipId: s.id,
        status: s.status,
        profile: otherProfile,
      };
      if (s.status === 'accepted') {
        friends.push(entry);
      } else if (s.addressee_id === myId) {
        incoming.push(entry);
      } else {
        outgoing.push(entry);
      }
    }

    const hydratedInvites = inviteRows.map((inv) => ({
      ...inv,
      sender: profileMap.get(inv.sender_id) || { display_name: 'Un ami' },
    }));

    this.state.friends = friends;
    this.state.incomingFriendRequests = incoming;
    this.state.outgoingFriendRequests = outgoing;
    this.state.roomInvites = hydratedInvites;
    this._emit();
  }

  async sendFriendRequestByCode(rawCode) {
    if (!supabase || !this.isAuthenticated()) {
      throw new Error('Connecte-toi pour ajouter des amis.');
    }
    const code = normalizeFriendCode(rawCode);
    if (!code || code.length < 6) {
      throw new Error('Entre un Code Ami valide (ex. PK-7X4M).');
    }
    if (this.state.profile?.friend_code === code) {
      throw new Error("C'est ton propre Code Ami !");
    }

    const { data: target, error: findErr } = await supabase
      .from('profiles')
      .select('id, display_name, friend_code')
      .eq('friend_code', code)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!target) {
      throw new Error(`Aucun pilote trouvé avec le code ${code}.`);
    }

    const myId = this.state.user.id;
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(requester_id.eq.${myId},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${myId})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        throw new Error(`${target.display_name} est déjà dans ta liste d'amis !`);
      }
      throw new Error(`Une demande avec ${target.display_name} est déjà en attente.`);
    }

    const { error: insertErr } = await supabase.from('friendships').insert({
      requester_id: myId,
      addressee_id: target.id,
      status: 'pending',
    });
    if (insertErr) throw insertErr;

    await this.loadFriendsAndRequests();
    return target;
  }

  async respondToFriendRequest(friendshipId, accept = true) {
    if (!supabase || !this.isAuthenticated()) return;
    if (accept) {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    }
    await this.loadFriendsAndRequests();
  }

  async removeFriendship(friendshipId) {
    if (!supabase || !this.isAuthenticated()) return;
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) throw error;
    await this.loadFriendsAndRequests();
  }

  async sendRoomInvite(recipientId, roomCode, trackId = 'coco') {
    if (!supabase || !this.isAuthenticated()) {
      throw new Error('Connecte-toi pour inviter un ami.');
    }
    const cleanCode = String(roomCode || '').trim().toUpperCase().slice(0, 8);
    if (!cleanCode || cleanCode === 'SOLO') {
      throw new Error('Crée ou rejoins un salon en ligne pour inviter tes amis.');
    }
    const { error } = await supabase.from('room_invites').insert({
      sender_id: this.state.user.id,
      recipient_id: recipientId,
      room_code: cleanCode,
      track_id: String(trackId || 'coco').slice(0, 32),
    });
    if (error) throw error;
  }

  async dismissRoomInvite(inviteId) {
    if (!supabase || !this.isAuthenticated()) return;
    await supabase.from('room_invites').delete().eq('id', inviteId);
    this.state.roomInvites = this.state.roomInvites.filter((i) => i.id !== inviteId);
    this._emit();
  }

  _setupRealtime(userId) {
    if (!supabase || this._realtimeChannel) return;
    this._realtimeChannel = supabase
      .channel(`pk-social-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_invites',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          await this.loadFriendsAndRequests();
          const row = payload?.new;
          if (row?.room_code) {
            const sender = this.state.friends.find((f) => f.profile?.id === row.sender_id)?.profile;
            const senderName = sender?.display_name || 'Un ami';
            this.onNotice?.(
              `🏎️ ${senderName} t'invite dans le salon ${row.room_code} ! (Ouvre Amis pour rejoindre)`,
              'info'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${userId}`,
        },
        async (payload) => {
          await this.loadFriendsAndRequests();
          if (payload?.eventType === 'INSERT') {
            this.onNotice?.('👋 Nouvelle demande d’ami reçue !', 'info');
          }
        }
      )
      .subscribe();
  }

  _teardownRealtime() {
    if (this._realtimeChannel && supabase) {
      supabase.removeChannel(this._realtimeChannel);
    }
    this._realtimeChannel = null;
  }

  dispose() {
    this._teardownRealtime();
    this._authSub?.unsubscribe?.();
    this._authSub = null;
  }
}

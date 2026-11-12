import './authSocialOverlay.css';
import { RACERS, TRACKS } from '../shared/constants.js';
import { decodeGhostChallenge } from '../shared/ghostCodec.js';
import {
  RACER_UNLOCK_LEVELS,
  computePilotLevel,
  normalizeFriendCode,
} from '../net/authAndSocialService.js';

function formatTimeMs(ms) {
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

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
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

function createGoogleSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const paths = [
    { d: 'M21.8 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.48z', fill: '#4285F4' },
    { d: 'M12 22c2.75 0 5.06-.91 6.75-2.46l-3.3-2.56c-.91.61-2.08.97-3.45.97-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64A10 10 0 0 0 12 22z', fill: '#34A853' },
    { d: 'M6.3 13.75A6.01 6.01 0 0 1 6 12c0-.61.11-1.2.3-1.75V7.61H2.89A10 10 0 0 0 2 12c0 1.61.39 3.14 1.09 4.39l3.21-2.64z', fill: '#FBBC05' },
    { d: 'M12 6.05c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 3.02 14.75 2 12 2A10 10 0 0 0 2.89 7.61l3.41 2.64c.8-2.41 3.05-4.2 5.7-4.2z', fill: '#EA4335' },
  ];
  for (const p of paths) {
    const el = document.createElementNS(ns, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('fill', p.fill);
    svg.appendChild(el);
  }
  return svg;
}

function makeAvatarEl(profile, className = 'pk-social-avatar-mini') {
  if (profile?.avatar_url) {
    const img = document.createElement('img');
    img.className = className;
    img.src = profile.avatar_url;
    img.alt = profile.display_name || 'Pilote';
    img.referrerPolicy = 'no-referrer';
    return img;
  }
  const span = document.createElement('span');
  span.className = className;
  const letter = (profile?.display_name || 'P').trim().charAt(0).toUpperCase() || 'P';
  span.textContent = letter;
  return span;
}

export class AuthSocialOverlay {
  constructor({
    rootEl,
    authService,
    onToast = null,
    onChallengeGhost = null,
    onJoinRoomCode = null,
    getActiveRoomContext = null,
    getCurrentTrackId = null,
  }) {
    this.rootEl = rootEl;
    this.authService = authService;
    this.onToast = typeof onToast === 'function' ? onToast : () => {};
    this.onChallengeGhost = typeof onChallengeGhost === 'function' ? onChallengeGhost : () => {};
    this.onJoinRoomCode = typeof onJoinRoomCode === 'function' ? onJoinRoomCode : () => {};
    this.getActiveRoomContext =
      typeof getActiveRoomContext === 'function' ? getActiveRoomContext : () => ({ roomCode: null, trackId: 'coco' });
    this.getCurrentTrackId =
      typeof getCurrentTrackId === 'function' ? getCurrentTrackId : () => TRACKS[0]?.id || 'coco';

    this.activeModal = null; // 'auth' | 'leaderboard' | 'friends' | null
    this.authReasonContext = null;
    this.lbTrackId = this.getCurrentTrackId() || TRACKS[0]?.id || 'coco';
    this.lbScope = 'global'; // 'global' | 'friends'
    this.lbLoading = false;
    this.lbData = { rows: [], myBest: null };
    this._podiumSlotEl = null;
    this._barVisible = true;
    this._snap = this.authService.getSnapshot();

    this._buildDOM();
    this._unsub = this.authService.subscribe((snap) => {
      this._snap = snap;
      this._renderBar();
      if (this.activeModal) {
        this._renderModal();
      }
      if (this._podiumSlotEl && this._podiumSlotEl.isConnected && snap.lastRaceOutcome) {
        this.renderPodiumBanner(this._podiumSlotEl, snap.lastRaceOutcome);
      }
    });
  }

  _buildDOM() {
    this.el = document.createElement('div');
    this.el.className = 'pk-social-root';

    this.barEl = document.createElement('div');
    this.barEl.className = 'pk-social-bar';

    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'pk-social-backdrop is-hidden';
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) {
        this.closeModal();
      }
    });

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'pk-social-modal';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');

    this.backdropEl.appendChild(this.modalEl);
    this.el.appendChild(this.barEl);
    this.el.appendChild(this.backdropEl);
    this.rootEl.appendChild(this.el);

    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    this._renderBar();
  }

  setBarVisible(visible) {
    this._barVisible = Boolean(visible);
    this.barEl.classList.toggle('is-hidden', !this._barVisible);
  }

  openAuthModal(reasonContext = null) {
    this.authReasonContext = reasonContext;
    this.activeModal = 'auth';
    this.backdropEl.classList.remove('is-hidden');
    this._renderModal();
  }

  async openLeaderboardModal(trackId = null) {
    if (trackId && TRACKS.some((t) => t.id === trackId)) {
      this.lbTrackId = trackId;
    } else {
      const cur = this.getCurrentTrackId();
      if (TRACKS.some((t) => t.id === cur)) {
        this.lbTrackId = cur;
      }
    }
    this.activeModal = 'leaderboard';
    this.backdropEl.classList.remove('is-hidden');
    this._renderModal();
    await this._loadLeaderboard();
  }

  async openFriendsModal() {
    if (!this._snap.isAuthenticated) {
      this.openAuthModal({ reason: 'friends' });
      return;
    }
    this.activeModal = 'friends';
    this.backdropEl.classList.remove('is-hidden');
    this._renderModal();
    await this.authService.loadFriendsAndRequests();
  }

  closeModal() {
    this.activeModal = null;
    this.authReasonContext = null;
    this.backdropEl.classList.add('is-hidden');
  }

  _renderBar() {
    const snap = this._snap;
    const frag = document.createDocumentFragment();

    // Account button
    const accountBtn = document.createElement('button');
    accountBtn.type = 'button';
    if (snap.isAuthenticated) {
      accountBtn.className = 'pk-social-pill pk-social-pill--authed';
      accountBtn.appendChild(makeAvatarEl(snap.profile, 'pk-social-avatar-mini'));

      const nameSpan = document.createElement('span');
      nameSpan.textContent = snap.profile.display_name || 'Pilote';
      accountBtn.appendChild(nameSpan);

      const lvlTag = document.createElement('span');
      lvlTag.className = 'pk-social-lvl-tag';
      lvlTag.textContent = `Niv.${snap.levelInfo.level}`;
      accountBtn.appendChild(lvlTag);

      const xpBar = document.createElement('span');
      xpBar.className = 'pk-social-mini-xp';
      const xpFill = document.createElement('i');
      xpFill.style.width = `${Math.round(snap.levelInfo.progress * 100)}%`;
      xpBar.appendChild(xpFill);
      accountBtn.appendChild(xpBar);
    } else {
      accountBtn.className = 'pk-social-pill pk-social-pill--guest';
      accountBtn.textContent = snap.pendingGuestClaim
        ? `👤 Invité • +${snap.pendingGuestClaim.xpGained} XP`
        : '👤 Invité • Connexion';
    }
    accountBtn.addEventListener('click', () => this.openAuthModal());
    frag.appendChild(accountBtn);

    // Leaderboard button
    const lbBtn = document.createElement('button');
    lbBtn.type = 'button';
    lbBtn.className = 'pk-social-pill';
    lbBtn.textContent = '🏆 Records';
    lbBtn.addEventListener('click', () => this.openLeaderboardModal());
    frag.appendChild(lbBtn);

    // Friends button
    const frBtn = document.createElement('button');
    frBtn.type = 'button';
    frBtn.className = 'pk-social-pill';
    frBtn.textContent = '👥 Amis';
    if (snap.unreadSocialCount > 0) {
      const dot = document.createElement('span');
      dot.className = 'pk-notif-dot';
      dot.textContent = String(snap.unreadSocialCount);
      frBtn.appendChild(dot);
    }
    frBtn.addEventListener('click', () => this.openFriendsModal());
    frag.appendChild(frBtn);

    this.barEl.replaceChildren(frag);
  }

  _buildModalHeader(titleText) {
    const head = document.createElement('div');
    head.className = 'pk-social-modal-head';

    const title = document.createElement('h2');
    title.className = 'pk-social-modal-title';
    title.textContent = titleText;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pk-social-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.closeModal());

    head.appendChild(title);
    head.appendChild(closeBtn);
    return head;
  }

  _renderModal() {
    this.modalEl.innerHTML = '';
    if (this.activeModal === 'auth') {
      this._renderAuthModal();
    } else if (this.activeModal === 'leaderboard') {
      this._renderLeaderboardModal();
    } else if (this.activeModal === 'friends') {
      this._renderFriendsModal();
    }
  }

  _getAuthReasonBannerText() {
    const ctx = this.authReasonContext;
    if (ctx?.reason === 'create_room') {
      return "🌐 Connecte-toi pour créer ton propre salon privé et inviter tes amis ! (Rejoindre un salon par code ou QR reste gratuit en mode Invité.)";
    }
    if (ctx?.reason === 'locked_racer' && ctx.racer) {
      const reqLvl = RACER_UNLOCK_LEVELS[ctx.racer.id] || 3;
      return `🔒 ${ctx.racer.emoji || ''} ${ctx.racer.name} se débloque au Niveau ${reqLvl} avec un compte !`;
    }
    if (ctx?.reason === 'friends') {
      return '👥 Connecte-toi pour obtenir ton Code Ami, ajouter tes amis et comparer vos records !';
    }
    if (this._snap.pendingGuestClaim) {
      return `⏳ Tu as +${this._snap.pendingGuestClaim.xpGained} XP en attente de ta dernière course ! Connecte-toi pour les créditer immédiatement.`;
    }
    return null;
  }

  _renderAuthModal() {
    const snap = this._snap;
    if (!snap.isAuthenticated) {
      this.modalEl.appendChild(this._buildModalHeader('🏎️ Compte Pilote PocketKart'));
      const body = document.createElement('div');
      body.className = 'pk-social-modal-body';

      const reasonMsg = this._getAuthReasonBannerText();
      if (reasonMsg) {
        const callout = document.createElement('div');
        callout.className = 'pk-social-callout';
        callout.textContent = reasonMsg;
        body.appendChild(callout);
      }

      const googleBtn = document.createElement('button');
      googleBtn.type = 'button';
      googleBtn.className = 'pk-google-btn';
      googleBtn.appendChild(createGoogleSvg());
      const gLabel = document.createElement('span');
      gLabel.textContent = 'Continuer avec Google';
      googleBtn.appendChild(gLabel);

      const fallbackHint = document.createElement('div');
      fallbackHint.className = 'pk-social-callout is-hidden';

      const magicDetails = document.createElement('details');
      magicDetails.className = 'pk-magic-details';

      googleBtn.addEventListener('click', async () => {
        googleBtn.disabled = true;
        try {
          await this.authService.signInWithGoogle();
        } catch (err) {
          googleBtn.disabled = false;
          if (err?.code === 'google_disabled') {
            magicDetails.open = true;
            fallbackHint.textContent = err.message;
            fallbackHint.classList.remove('is-hidden');
          }
          this.onToast(err?.message || 'Erreur lors de la connexion Google.', 'error');
        }
      });
      body.appendChild(googleBtn);
      body.appendChild(fallbackHint);

      const perks = document.createElement('div');
      perks.className = 'pk-perks-grid';
      const perkItems = [
        ['📈 XP & 6 Pilotes', 'Débloque Princesse Pêche (Niv.3), Wario-Bling (Niv.6) et Koopa-Boss (Niv.10).'],
        ['👻 Classements 3D', 'Enregistre tes records sur chaque circuit et défie les fantômes mondiaux.'],
        ['👥 Salons & Amis', 'Crée des salons privés, ajoute tes amis par code PK et invite-les en 1 clic.'],
      ];
      for (const [t, d] of perkItems) {
        const card = document.createElement('div');
        card.className = 'pk-perk-card';
        const strong = document.createElement('strong');
        strong.textContent = t;
        const span = document.createElement('span');
        span.textContent = d;
        card.appendChild(strong);
        card.appendChild(span);
        perks.appendChild(card);
      }
      body.appendChild(perks);

      const summary = document.createElement('summary');
      summary.textContent = '✉️ Connexion rapide par e-mail (lien magique)';
      magicDetails.appendChild(summary);

      const magicForm = document.createElement('form');
      magicForm.className = 'pk-magic-form';
      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.required = true;
      emailInput.placeholder = 'ton@email.com';
      emailInput.className = 'pk-social-input';
      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
      sendBtn.textContent = 'Envoyer';

      magicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        sendBtn.disabled = true;
        try {
          await this.authService.signInWithMagicLink(emailInput.value);
          this.onToast('✉️ Lien de connexion envoyé ! Vérifie ta boîte mail.', 'success');
          emailInput.value = '';
        } catch (err) {
          this.onToast(err?.message || "Impossible d'envoyer le lien magique.", 'error');
        } finally {
          sendBtn.disabled = false;
        }
      });

      magicForm.appendChild(emailInput);
      magicForm.appendChild(sendBtn);
      magicDetails.appendChild(magicForm);
      body.appendChild(magicDetails);

      this.modalEl.appendChild(body);
      return;
    }

    // Authenticated Profile Modal
    const prof = snap.profile;
    const lvl = snap.levelInfo;
    this.modalEl.appendChild(this._buildModalHeader('🪪 Mon Profil Pilote'));

    const body = document.createElement('div');
    body.className = 'pk-social-modal-body';

    const hero = document.createElement('div');
    hero.className = 'pk-profile-hero';
    hero.appendChild(makeAvatarEl(prof, 'pk-profile-avatar-lg'));

    const meta = document.createElement('div');
    meta.className = 'pk-profile-meta';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.gap = '8px';

    const nameLabel = document.createElement('strong');
    nameLabel.style.fontFamily = 'var(--font-display, Fredoka, sans-serif)';
    nameLabel.style.fontSize = '1.05rem';
    nameLabel.textContent = prof.display_name || 'Pilote';

    const lvlBadge = document.createElement('span');
    lvlBadge.className = 'pk-social-lvl-tag';
    lvlBadge.textContent = `Niveau ${lvl.level} • ${snap.title}`;

    titleRow.appendChild(nameLabel);
    titleRow.appendChild(lvlBadge);
    meta.appendChild(titleRow);

    const xpTrack = document.createElement('div');
    xpTrack.className = 'pk-xp-bar-track';
    const xpFill = document.createElement('div');
    xpFill.className = 'pk-xp-bar-fill';
    xpFill.style.width = `${Math.round(lvl.progress * 100)}%`;
    xpTrack.appendChild(xpFill);
    meta.appendChild(xpTrack);

    const xpCaption = document.createElement('div');
    xpCaption.className = 'pk-xp-caption';
    const leftXp = document.createElement('span');
    leftXp.textContent = `${lvl.xp} XP total`;
    const rightXp = document.createElement('span');
    rightXp.textContent = lvl.isMax ? 'Niveau MAX' : `${lvl.xpToNext} XP → Niv.${lvl.level + 1}`;
    xpCaption.appendChild(leftXp);
    xpCaption.appendChild(rightXp);
    meta.appendChild(xpCaption);

    hero.appendChild(meta);
    body.appendChild(hero);

    // Pseudo Edit Row
    const nameForm = document.createElement('form');
    nameForm.className = 'pk-magic-form';
    nameForm.style.marginTop = '0';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 14;
    nameInput.value = prof.display_name || 'Pilote';
    nameInput.className = 'pk-social-input';
    const saveNameBtn = document.createElement('button');
    saveNameBtn.type = 'submit';
    saveNameBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
    saveNameBtn.textContent = 'Renommer';
    nameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveNameBtn.disabled = true;
      try {
        await this.authService.updateDisplayName(nameInput.value);
        this.onToast('✅ Pseudo mis à jour !', 'success');
      } catch (err) {
        this.onToast(err?.message || 'Erreur mise à jour pseudo.', 'error');
      } finally {
        saveNameBtn.disabled = false;
      }
    });
    nameForm.appendChild(nameInput);
    nameForm.appendChild(saveNameBtn);
    body.appendChild(nameForm);

    // Career Stats
    const statsGrid = document.createElement('div');
    statsGrid.className = 'pk-stats-4';
    const statItems = [
      ['Courses', prof.races_played || 0],
      ['Victoires', prof.wins || 0],
      ['Podiums', prof.podiums || 0],
      ['Trophées', prof.trophies_won || 0],
    ];
    for (const [label, val] of statItems) {
      const box = document.createElement('div');
      box.className = 'pk-stat-box';
      const v = document.createElement('span');
      v.className = 'pk-stat-val';
      v.textContent = String(val);
      const l = document.createElement('span');
      l.className = 'pk-stat-lbl';
      l.textContent = label;
      box.appendChild(v);
      box.appendChild(l);
      statsGrid.appendChild(box);
    }
    body.appendChild(statsGrid);

    // Racer unlocks progress
    const unlocksRow = document.createElement('div');
    unlocksRow.className = 'pk-racer-unlocks-row';
    for (const r of RACERS) {
      const req = RACER_UNLOCK_LEVELS[r.id] || 1;
      const unlocked = lvl.level >= req;
      const chip = document.createElement('div');
      chip.className = `pk-unlock-chip${unlocked ? '' : ' is-locked'}`;
      chip.textContent = unlocked
        ? `${r.emoji || ''} ${r.name}`
        : `🔒 ${r.emoji || ''} ${r.name} (Niv.${req})`;
      unlocksRow.appendChild(chip);
    }
    body.appendChild(unlocksRow);

    // Friend code box
    body.appendChild(this._buildFriendCodeBox(prof.friend_code));

    // Sign out
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.gap = '8px';

    const lbShortcut = document.createElement('button');
    lbShortcut.type = 'button';
    lbShortcut.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
    lbShortcut.textContent = '🏆 Mes Records';
    lbShortcut.addEventListener('click', () => this.openLeaderboardModal());

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'pk-arcade-btn pk-btn-ghost pk-btn-sm';
    signOutBtn.textContent = '🚪 Déconnexion';
    signOutBtn.addEventListener('click', async () => {
      await this.authService.signOut();
      this.onToast('Déconnecté — retour en mode Invité.', 'info');
      this.closeModal();
    });

    footer.appendChild(lbShortcut);
    footer.appendChild(signOutBtn);
    body.appendChild(footer);

    this.modalEl.appendChild(body);
  }

  _buildFriendCodeBox(friendCode) {
    const box = document.createElement('div');
    box.className = 'pk-friend-code-box';

    const left = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.style.fontSize = '0.7rem';
    lbl.style.color = '#a8e6ff';
    lbl.style.fontWeight = '800';
    lbl.textContent = 'MON CODE AMI';
    const val = document.createElement('div');
    val.className = 'pk-friend-code-val';
    val.textContent = friendCode || 'PK-XXXX';
    left.appendChild(lbl);
    left.appendChild(val);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '6px';

    const copyCodeBtn = document.createElement('button');
    copyCodeBtn.type = 'button';
    copyCodeBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
    copyCodeBtn.textContent = '📋 Code';
    copyCodeBtn.addEventListener('click', async () => {
      if (await copyText(friendCode)) {
        this.onToast(`Code ami ${friendCode} copié !`, 'success');
      }
    });

    const copyLinkBtn = document.createElement('button');
    copyLinkBtn.type = 'button';
    copyLinkBtn.className = 'pk-arcade-btn pk-btn-primary pk-btn-sm';
    copyLinkBtn.textContent = '🔗 Lien Ami';
    copyLinkBtn.addEventListener('click', async () => {
      const url = new URL(window.location.origin);
      url.searchParams.set('friend', friendCode);
      if (await copyText(url.toString())) {
        this.onToast("Lien d'ajout d'ami copié !", 'success');
      }
    });

    btns.appendChild(copyCodeBtn);
    btns.appendChild(copyLinkBtn);
    box.appendChild(left);
    box.appendChild(btns);
    return box;
  }

  async _loadLeaderboard() {
    this.lbLoading = true;
    if (this.activeModal === 'leaderboard') this._renderModal();
    try {
      this.lbData = await this.authService.fetchTrackLeaderboard(this.lbTrackId, this.lbScope);
    } catch (err) {
      this.lbData = { rows: [], myBest: null };
      this.onToast(err?.message || 'Erreur chargement du classement.', 'error');
    } finally {
      this.lbLoading = false;
      if (this.activeModal === 'leaderboard') this._renderModal();
    }
  }

  _renderLeaderboardModal() {
    this.modalEl.appendChild(this._buildModalHeader('🏆 Classements & Fantômes 3D'));
    const body = document.createElement('div');
    body.className = 'pk-social-modal-body';

    // Track tabs
    const trackTabs = document.createElement('div');
    trackTabs.className = 'pk-tabs-row';
    for (const tr of TRACKS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-tab-btn${tr.id === this.lbTrackId ? ' is-active' : ''}`;
      btn.textContent = `${tr.icon} ${tr.name}`;
      btn.addEventListener('click', () => {
        this.lbTrackId = tr.id;
        this._loadLeaderboard();
      });
      trackTabs.appendChild(btn);
    }
    body.appendChild(trackTabs);

    // Scope toggle
    const scopeTabs = document.createElement('div');
    scopeTabs.className = 'pk-tabs-row';
    const scopes = [
      ['global', '🌍 Mondial (Top 50)'],
      ['friends', '👥 Mes Amis'],
    ];
    for (const [id, label] of scopes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pk-tab-btn${id === this.lbScope ? ' is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (id === 'friends' && !this._snap.isAuthenticated) {
          this.openAuthModal({ reason: 'friends' });
          return;
        }
        this.lbScope = id;
        this._loadLeaderboard();
      });
      scopeTabs.appendChild(btn);
    }
    body.appendChild(scopeTabs);

    if (this.lbData.myBest) {
      const pbBar = document.createElement('div');
      pbBar.className = 'pk-social-callout';
      pbBar.textContent = `⏱️ Ton record personnel sur ce circuit : ${formatTimeMs(
        this.lbData.myBest.best_time_ms
      )}`;
      body.appendChild(pbBar);
    }

    if (this.lbLoading) {
      const loading = document.createElement('div');
      loading.className = 'pk-social-empty';
      loading.textContent = 'Chargement des chronos…';
      body.appendChild(loading);
    } else if (!this.lbData.rows || this.lbData.rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pk-social-empty';
      empty.textContent =
        this.lbScope === 'friends'
          ? "Aucun de tes amis n'a encore enregistré de chrono sur ce circuit."
          : 'Aucun chrono enregistré sur ce circuit pour le moment — sois le premier !';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'pk-social-list';
      const medals = ['🥇', '🥈', '🥉'];
      const myUid = this._snap.user?.id || null;

      this.lbData.rows.forEach((row, idx) => {
        const prof = row.profiles || {};
        const racer = RACERS.find((r) => r.id === row.racer_id) || RACERS[0];
        const isMe = myUid && row.user_id === myUid;

        const item = document.createElement('div');
        item.className = `pk-social-row${isMe ? ' is-me' : ''}`;

        const main = document.createElement('div');
        main.className = 'pk-social-row-main';

        const rankSpan = document.createElement('strong');
        rankSpan.style.minWidth = '28px';
        rankSpan.style.fontFamily = 'var(--font-display, Fredoka, sans-serif)';
        rankSpan.textContent = idx < 3 ? medals[idx] : `#${idx + 1}`;
        main.appendChild(rankSpan);

        main.appendChild(makeAvatarEl(prof, 'pk-social-avatar-mini'));

        const textWrap = document.createElement('div');
        textWrap.className = 'pk-social-row-text';
        const nameEl = document.createElement('strong');
        nameEl.textContent = `${prof.display_name || 'Pilote'}${isMe ? ' (Toi)' : ''}`;
        const subEl = document.createElement('small');
        subEl.textContent = `${racer.emoji || ''} Niv.${prof.level || 1} • ${prof.title || ''}`.trim();
        textWrap.appendChild(nameEl);
        textWrap.appendChild(subEl);
        main.appendChild(textWrap);

        const actions = document.createElement('div');
        actions.className = 'pk-social-row-actions';

        const timeEl = document.createElement('strong');
        timeEl.style.fontFamily = 'var(--font-display, Fredoka, sans-serif)';
        timeEl.style.color = '#72efdd';
        timeEl.textContent = formatTimeMs(row.best_time_ms);
        actions.appendChild(timeEl);

        if (row.ghost_token) {
          const ghostBtn = document.createElement('button');
          ghostBtn.type = 'button';
          ghostBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
          ghostBtn.textContent = '👻 Défier';
          ghostBtn.addEventListener('click', () => {
            const decoded = decodeGhostChallenge(row.ghost_token);
            if (!decoded) {
              this.onToast('Fantôme indisponible pour ce chrono.', 'warning');
              return;
            }
            this.closeModal();
            this.onChallengeGhost(decoded);
          });
          actions.appendChild(ghostBtn);
        }

        item.appendChild(main);
        item.appendChild(actions);
        list.appendChild(item);
      });

      body.appendChild(list);
    }

    this.modalEl.appendChild(body);
  }

  _renderFriendsModal() {
    const snap = this._snap;
    const prof = snap.profile;
    this.modalEl.appendChild(this._buildModalHeader('👥 Amis & Invitations'));

    const body = document.createElement('div');
    body.className = 'pk-social-modal-body';

    body.appendChild(this._buildFriendCodeBox(prof?.friend_code));

    // Add friend by code form
    const addForm = document.createElement('form');
    addForm.className = 'pk-magic-form';
    addForm.style.marginTop = '0';

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.maxLength = 10;
    codeInput.placeholder = 'Code Ami (ex. PK-7X4M)';
    codeInput.className = 'pk-social-input';
    if (snap.pendingFriendCode) {
      codeInput.value = normalizeFriendCode(snap.pendingFriendCode);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.className = 'pk-arcade-btn pk-btn-primary pk-btn-sm';
    addBtn.textContent = '➕ Ajouter';

    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      addBtn.disabled = true;
      try {
        const target = await this.authService.sendFriendRequestByCode(codeInput.value);
        this.authService.clearPendingFriendCode();
        codeInput.value = '';
        this.onToast(`👋 Demande d'ami envoyée à ${target.display_name} !`, 'success');
      } catch (err) {
        this.onToast(err?.message || "Impossible d'ajouter cet ami.", 'error');
      } finally {
        addBtn.disabled = false;
      }
    });

    addForm.appendChild(codeInput);
    addForm.appendChild(addBtn);
    body.appendChild(addForm);

    // Live Room Invites
    if (snap.roomInvites.length > 0) {
      const invTitle = document.createElement('div');
      invTitle.className = 'pk-field-label';
      invTitle.textContent = '🎟️ INVITATIONS DE SALON';
      body.appendChild(invTitle);

      const invList = document.createElement('div');
      invList.className = 'pk-social-list';
      for (const inv of snap.roomInvites) {
        const row = document.createElement('div');
        row.className = 'pk-social-row is-me';

        const main = document.createElement('div');
        main.className = 'pk-social-row-main';
        main.appendChild(makeAvatarEl(inv.sender, 'pk-social-avatar-mini'));
        const txt = document.createElement('div');
        txt.className = 'pk-social-row-text';
        const strong = document.createElement('strong');
        strong.textContent = `${inv.sender?.display_name || 'Un ami'} → Salon ${inv.room_code}`;
        const small = document.createElement('small');
        const tr = TRACKS.find((t) => t.id === inv.track_id);
        small.textContent = tr ? `${tr.icon} ${tr.name}` : 'Course en ligne';
        txt.appendChild(strong);
        txt.appendChild(small);
        main.appendChild(txt);

        const acts = document.createElement('div');
        acts.className = 'pk-social-row-actions';
        const joinBtn = document.createElement('button');
        joinBtn.type = 'button';
        joinBtn.className = 'pk-arcade-btn pk-btn-primary pk-btn-sm';
        joinBtn.textContent = 'Rejoindre';
        joinBtn.addEventListener('click', () => {
          this.authService.dismissRoomInvite(inv.id);
          this.closeModal();
          this.onJoinRoomCode(inv.room_code);
        });
        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'pk-arcade-btn pk-btn-ghost pk-btn-sm';
        dismissBtn.textContent = '✕';
        dismissBtn.addEventListener('click', () => this.authService.dismissRoomInvite(inv.id));

        acts.appendChild(joinBtn);
        acts.appendChild(dismissBtn);
        row.appendChild(main);
        row.appendChild(acts);
        invList.appendChild(row);
      }
      body.appendChild(invList);
    }

    // Incoming Friend Requests
    if (snap.incomingFriendRequests.length > 0) {
      const reqTitle = document.createElement('div');
      reqTitle.className = 'pk-field-label';
      reqTitle.textContent = '📩 DEMANDES REÇUES';
      body.appendChild(reqTitle);

      const reqList = document.createElement('div');
      reqList.className = 'pk-social-list';
      for (const req of snap.incomingFriendRequests) {
        const row = document.createElement('div');
        row.className = 'pk-social-row';

        const main = document.createElement('div');
        main.className = 'pk-social-row-main';
        main.appendChild(makeAvatarEl(req.profile, 'pk-social-avatar-mini'));
        const txt = document.createElement('div');
        txt.className = 'pk-social-row-text';
        const strong = document.createElement('strong');
        strong.textContent = req.profile?.display_name || 'Pilote';
        const small = document.createElement('small');
        small.textContent = `Niv.${req.profile?.level || 1} • ${req.profile?.friend_code || ''}`;
        txt.appendChild(strong);
        txt.appendChild(small);
        main.appendChild(txt);

        const acts = document.createElement('div');
        acts.className = 'pk-social-row-actions';
        const acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
        acceptBtn.textContent = '✓ Accepter';
        acceptBtn.addEventListener('click', async () => {
          await this.authService.respondToFriendRequest(req.friendshipId, true);
          this.onToast(`🤝 ${req.profile?.display_name || 'Pilote'} ajouté en ami !`, 'success');
        });
        const declineBtn = document.createElement('button');
        declineBtn.type = 'button';
        declineBtn.className = 'pk-arcade-btn pk-btn-ghost pk-btn-sm';
        declineBtn.textContent = '✕';
        declineBtn.addEventListener('click', () =>
          this.authService.respondToFriendRequest(req.friendshipId, false)
        );
        acts.appendChild(acceptBtn);
        acts.appendChild(declineBtn);

        row.appendChild(main);
        row.appendChild(acts);
        reqList.appendChild(row);
      }
      body.appendChild(reqList);
    }

    // Friends List
    const frTitle = document.createElement('div');
    frTitle.className = 'pk-field-label';
    frTitle.textContent = `🤝 MES AMIS (${snap.friends.length})`;
    body.appendChild(frTitle);

    if (snap.friends.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pk-social-empty';
      empty.textContent = 'Partage ton Code Ami PK ci-dessus pour ajouter tes amis !';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'pk-social-list';
      const activeCtx = this.getActiveRoomContext();
      const myActiveRoom =
        activeCtx?.roomCode && activeCtx.roomCode !== 'SOLO' && activeCtx.roomCode !== '----'
          ? activeCtx.roomCode
          : null;

      for (const fr of snap.friends) {
        const p = fr.profile || {};
        const row = document.createElement('div');
        row.className = 'pk-social-row';

        const main = document.createElement('div');
        main.className = 'pk-social-row-main';
        main.appendChild(makeAvatarEl(p, 'pk-social-avatar-mini'));

        const txt = document.createElement('div');
        txt.className = 'pk-social-row-text';
        const strong = document.createElement('strong');
        strong.textContent = p.display_name || 'Pilote';
        const small = document.createElement('small');
        const roomRecent =
          p.active_room_code &&
          p.active_room_updated_at &&
          Date.now() - Date.parse(p.active_room_updated_at) < 20 * 60 * 1000;
        small.textContent = roomRecent
          ? `🟢 En salon ${p.active_room_code} • Niv.${p.level || 1}`
          : `Niv.${p.level || 1} • ${p.title || ''}`;
        txt.appendChild(strong);
        txt.appendChild(small);
        main.appendChild(txt);

        const acts = document.createElement('div');
        acts.className = 'pk-social-row-actions';

        if (roomRecent) {
          const joinFriendBtn = document.createElement('button');
          joinFriendBtn.type = 'button';
          joinFriendBtn.className = 'pk-arcade-btn pk-btn-primary pk-btn-sm';
          joinFriendBtn.textContent = 'Rejoindre';
          joinFriendBtn.addEventListener('click', () => {
            this.closeModal();
            this.onJoinRoomCode(p.active_room_code);
          });
          acts.appendChild(joinFriendBtn);
        }

        if (myActiveRoom) {
          const inviteBtn = document.createElement('button');
          inviteBtn.type = 'button';
          inviteBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
          inviteBtn.textContent = '📩 Inviter';
          inviteBtn.addEventListener('click', async () => {
            try {
              await this.authService.sendRoomInvite(p.id, myActiveRoom, activeCtx.trackId);
              this.onToast(`📩 Invitation envoyée à ${p.display_name} !`, 'success');
            } catch (err) {
              this.onToast(err?.message || "Erreur d'envoi d'invitation.", 'error');
            }
          });
          acts.appendChild(inviteBtn);
        }

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'pk-arcade-btn pk-btn-ghost pk-btn-sm';
        rmBtn.title = 'Retirer cet ami';
        rmBtn.textContent = '✕';
        rmBtn.addEventListener('click', () => this.authService.removeFriendship(fr.friendshipId));
        acts.appendChild(rmBtn);

        row.appendChild(main);
        row.appendChild(acts);
        list.appendChild(row);
      }
      body.appendChild(list);
    }

    this.modalEl.appendChild(body);
  }

  /**
   * Renders the post-race XP / Guest Conversion banner inside UIManager's podium slot.
   */
  renderPodiumBanner(slotEl, outcome) {
    if (!slotEl) return;
    this._podiumSlotEl = slotEl;
    if (!outcome) {
      slotEl.innerHTML = '';
      return;
    }

    const card = document.createElement('div');
    const isGuest = !outcome.savedToCloud;
    card.className = `pk-podium-xp-card${isGuest ? ' pk-podium-xp-card--guest' : ''}`;

    const top = document.createElement('div');
    top.className = 'pk-podium-xp-top';

    const gain = document.createElement('span');
    gain.className = 'pk-podium-xp-gain';
    if (isGuest) {
      gain.textContent = `⏳ Performance en attente : +${outcome.xpGained} XP`;
    } else {
      gain.textContent = `⚡ +${outcome.xpGained} XP enregistrés !`;
    }
    top.appendChild(gain);

    if (!isGuest && outcome.isNewPb) {
      const pb = document.createElement('span');
      pb.className = 'pk-tag pk-tag--gold';
      pb.textContent = `🏆 NOUVEAU RECORD (${formatTimeMs(outcome.finishTimeMs)})`;
      top.appendChild(pb);
    } else if (isGuest && outcome.finishTimeMs > 0) {
      const tm = document.createElement('span');
      tm.className = 'pk-tag pk-tag--cyan';
      tm.textContent = `⏱️ ${formatTimeMs(outcome.finishTimeMs)}`;
      top.appendChild(tm);
    }
    card.appendChild(top);

    if (Array.isArray(outcome.breakdown) && outcome.breakdown.length > 0) {
      const pills = document.createElement('div');
      pills.className = 'pk-breakdown-pills';
      for (const b of outcome.breakdown) {
        const chip = document.createElement('span');
        chip.className = 'pk-breakdown-chip';
        chip.textContent = `${b.label} +${b.value}`;
        pills.appendChild(chip);
      }
      card.appendChild(pills);
    }

    if (!isGuest && this._snap.isAuthenticated) {
      const lvl = computePilotLevel(this._snap.profile?.xp || 0);
      const track = document.createElement('div');
      track.className = 'pk-xp-bar-track';
      const fill = document.createElement('div');
      fill.className = 'pk-xp-bar-fill';
      fill.style.width = `${Math.round(lvl.progress * 100)}%`;
      track.appendChild(fill);
      card.appendChild(track);

      if (outcome.leveledUp || (outcome.newlyUnlockedRacers && outcome.newlyUnlockedRacers.length > 0)) {
        const up = document.createElement('div');
        up.className = 'pk-social-callout';
        const unlockedNames = (outcome.newlyUnlockedRacers || [])
          .map((id) => RACERS.find((r) => r.id === id))
          .filter(Boolean)
          .map((r) => `${r.emoji || ''} ${r.name}`)
          .join(', ');
        up.textContent = unlockedNames
          ? `🎉 Niveau ${outcome.newLevel} atteint ! Nouveau pilote débloqué : ${unlockedNames} !`
          : `🎉 Niveau ${outcome.newLevel} atteint !`;
        card.appendChild(up);
      }
    }

    const ctaRow = document.createElement('div');
    ctaRow.className = 'pk-podium-auth-cta';

    if (isGuest) {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'pk-arcade-btn pk-btn-primary pk-btn-sm';
      saveBtn.textContent = 'Continuer avec Google pour sauvegarder';
      saveBtn.addEventListener('click', () => this.openAuthModal({ reason: 'save_race' }));
      ctaRow.appendChild(saveBtn);
    }

    const lbBtn = document.createElement('button');
    lbBtn.type = 'button';
    lbBtn.className = 'pk-arcade-btn pk-btn-cyan pk-btn-sm';
    lbBtn.textContent = '🏆 Classement';
    lbBtn.addEventListener('click', () => this.openLeaderboardModal(outcome.trackId));
    ctaRow.appendChild(lbBtn);

    card.appendChild(ctaRow);
    slotEl.replaceChildren(card);
  }

  dispose() {
    this._unsub?.();
    window.removeEventListener('keydown', this._onKeyDown);
    this.el?.remove();
  }
}

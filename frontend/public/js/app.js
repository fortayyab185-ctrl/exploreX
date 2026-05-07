/* ═══════════════════════════════════════════════════════════════════════════
   ExploreX App Shell — vanilla JS
   - Top nav (with "Places" instead of "Connect")
   - Profile dropdown shows points balance + Connect link
   - Toast helper, modal helper, plan-gate helper
   - Trial banner + seasonal-offer banner
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Toasts ─────────────────────────────────────────────────────────────── */
  function ensureToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
    return c;
  }

  // Inline SVG icons (no Lucide dependency required at toast-time)
  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    loading: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  };
  const TOAST_DEFAULT_TITLES = { success: 'Success', error: 'Error', info: 'Info', loading: 'Working…' };

  function showToast(opts) {
    // Allow shorthand: showToast('text') becomes { type:'info', message:'text' }
    if (typeof opts === 'string') opts = { message: opts };
    const type = opts.type || 'info';
    const message = opts.message || '';
    const title = opts.title || TOAST_DEFAULT_TITLES[type] || '';
    const duration = opts.duration === 0 || opts.duration ? opts.duration : 4000;
    const sticky = duration === 0 || type === 'loading';

    const c = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.style.setProperty('--toast-duration', duration + 'ms');
    el.innerHTML =
      '<div class="toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.info) + '</div>' +
      '<div class="toast-body">' +
        '<div class="toast-title">' + escapeHtmlT(title) + '</div>' +
        (message ? '<div class="toast-msg">' + escapeHtmlT(message) + '</div>' : '') +
      '</div>' +
      '<button class="toast-close" aria-label="Dismiss">&times;</button>' +
      (sticky ? '' : '<div class="toast-progress"></div>');
    c.appendChild(el);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      el.classList.add('toast-leaving');
      // Match the slide-out animation duration.
      setTimeout(() => el.remove(), 280);
    };

    el.addEventListener('click', dismiss);
    el.querySelector('.toast-close').addEventListener('click', e => {
      e.stopPropagation();
      dismiss();
    });

    let timer;
    if (!sticky) timer = setTimeout(dismiss, duration);

    // Pause progress on hover so the user has time to read long messages.
    if (!sticky) {
      const prog = el.querySelector('.toast-progress');
      el.addEventListener('mouseenter', () => {
        if (prog) prog.style.animationPlayState = 'paused';
        clearTimeout(timer);
      });
      el.addEventListener('mouseleave', () => {
        if (prog) prog.style.animationPlayState = 'running';
        timer = setTimeout(dismiss, duration / 2);
      });
    }

    return {
      dismiss,
      // For loading toasts: replace the toast in-place with a final state.
      update: (newOpts) => {
        const newType = newOpts.type || type;
        el.className = 'toast toast-' + newType;
        const ic = el.querySelector('.toast-icon');
        if (ic) ic.innerHTML = TOAST_ICONS[newType] || TOAST_ICONS.info;
        const t = el.querySelector('.toast-title');
        if (t) t.textContent = newOpts.title || TOAST_DEFAULT_TITLES[newType] || '';
        const m = el.querySelector('.toast-msg');
        if (m && newOpts.message) m.textContent = newOpts.message;
        else if (newOpts.message && !m) {
          const body = el.querySelector('.toast-body');
          const newMsg = document.createElement('div');
          newMsg.className = 'toast-msg'; newMsg.textContent = newOpts.message;
          body.appendChild(newMsg);
        }
        // Re-add a progress bar and auto-dismiss for the new state.
        const oldProg = el.querySelector('.toast-progress');
        if (oldProg) oldProg.remove();
        const newDuration = newOpts.duration || 4000;
        if (newDuration > 0 && newType !== 'loading') {
          el.style.setProperty('--toast-duration', newDuration + 'ms');
          const np = document.createElement('div');
          np.className = 'toast-progress';
          el.appendChild(np);
          clearTimeout(timer);
          timer = setTimeout(dismiss, newDuration);
        }
      },
    };
  }

  /* ── Global image fallback ──────────────────────────────────────────────────
     Any <img data-fallback="logo"> that fails to load (Unsplash 404, network
     error, broken URL) is automatically replaced with the ExploreX logo.
     We also cover bare <img> elements on common hero/card surfaces by listening
     globally, but only swap when the broken src is a remote http(s) URL so we
     don't loop on the logo itself. ──────────────────────────────────────────── */
  document.addEventListener('error', function (e) {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    if (el.dataset.fallbackApplied === '1') return;
    const optedIn = el.dataset.fallback === 'logo';
    const isRemote = (el.src || '').indexOf('http') === 0;
    if (!optedIn && !isRemote) return;
    el.dataset.fallbackApplied = '1';
    el.src = '/logo.png';
    el.classList.add('img-logo-fallback');
  }, true);

  function escapeHtmlT(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  // Public API — keeps backwards-compat with toast.success(msg) etc.
  window.toast = {
    success: (msg, opts) => showToast(Object.assign({ type: 'success', message: msg }, opts || {})),
    error:   (msg, opts) => showToast(Object.assign({ type: 'error',   message: msg }, opts || {})),
    info:    (msg, opts) => showToast(Object.assign({ type: 'info',    message: msg }, opts || {})),
    loading: (msg, opts) => showToast(Object.assign({ type: 'loading', message: msg, duration: 0 }, opts || {})),
    // Generic — caller passes the full options object (including title etc.)
    show:    (opts)      => showToast(opts || {}),
  };

  /* ── Modal helper ───────────────────────────────────────────────────────── */
  window.openModal = function (innerHTML, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + innerHTML + '</div>';
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    const close = () => { wrap.remove(); document.body.style.overflow = ''; if (opts.onClose) opts.onClose(); };
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    return { close, root: wrap };
  };

  /* ── Confirm modal (returns Promise<boolean>) ───────────────────────────── */
  window.confirmModal = function (opts) {
    return new Promise(resolve => {
      const o = Object.assign({ title: 'Confirm', message: 'Are you sure?', confirm: 'Confirm', cancel: 'Cancel', danger: false }, opts || {});
      const html = '<div class="modal-head"><h2 class="modal-title">' + o.title + '</h2><button class="modal-close" data-close>&times;</button></div>' +
        '<p class="text-muted text-sm" style="margin-bottom:1rem">' + o.message + '</p>' +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" data-action="cancel">' + o.cancel + '</button>' +
          '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm">' + o.confirm + '</button>' +
        '</div>';
      const m = openModal(html);
      m.root.querySelector('[data-action="cancel"]').addEventListener('click', () => { m.close(); resolve(false); });
      m.root.querySelector('[data-action="confirm"]').addEventListener('click', () => { m.close(); resolve(true); });
    });
  };

  /* ── Plan gate ──────────────────────────────────────────────────────────── */
  window.requirePlan = function (level, featureName) {
    if (!window.currentUser) return false;
    if (db.hasPlan(window.currentUser, level)) return true;
    showUpgradeModal(level, featureName || 'this feature');
    return false;
  };

  function showUpgradeModal(plan, feature) {
    const html = '<div class="modal-head"><h2 class="modal-title">Upgrade to ' + (plan === 'high' ? 'Max' : 'Pro') + '</h2><button class="modal-close" data-close>&times;</button></div>' +
      '<p class="text-muted text-sm" style="margin-bottom:1rem">' + feature + ' is available on the ' + (plan === 'high' ? 'Max' : 'Pro') + ' plan and above</p>' +
      '<ul style="list-style:none;padding:0;margin:0 0 1.25rem;display:flex;flex-direction:column;gap:.5rem">' +
      (plan === 'medium' ? '<li>+ AI travel chatbot</li><li>+ All free features</li>' : '') +
      (plan === 'high'   ? '<li>+ Full AI trip planner</li><li>+ AI chatbot</li><li>+ All Pro + Free features</li>' : '') +
      '</ul><div class="modal-foot"><button class="btn btn-ghost" data-close>Not now</button><a class="btn btn-primary" href="/pricing">View plans</a></div>';
    openModal(html);
  }

  /* ── Nav structure ──────────────────────────────────────────────────────── */
  const MAIN_NAV = [
    { path: '/explore',  label: 'Explore'    },
    { path: '/places',   label: 'Places'     },
    { path: '/planner',  label: 'AI Planner' },
    { path: '/weather',  label: 'Weather'    },
  ];
  const PROFILE_MENU = [
    { path: '/home',              label: 'Home'           },
    { path: '/profile',           label: 'Profile'        },
    { path: '/bookings',          label: 'My Trips'       },
    { path: '/favorites',         label: 'Favorites'      },
    { path: '/notifications',     label: 'Notifications'  },
    { path: '/pricing',           label: 'Pricing'        },
  ];

  function fmtPoints(n) {
    n = +n || 0;
    if (n >= 1000) return n.toLocaleString('en-US');
    return String(n);
  }

  function renderNav(user) {
    const initials = user && user.full_name
      ? user.full_name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
      : 'EX';
    const path = window.location.pathname;
    const cur  = '/' + (path.split('/').filter(Boolean).pop() || '').replace('.html', '');
    const planBadge = user && user.effective_plan && user.effective_plan !== 'free'
      ? '<span class="plan-chip plan-' + user.effective_plan + '">' + (user.trial_active ? 'TRIAL' : window.db.planDisplayName(user.effective_plan)) + '</span>'
      : '';
    const points = (user && user.points) || 0;

    let nav = '<nav class="app-nav"><div class="app-nav-inner">';
    nav += '<a href="/home" class="app-logo"><img src="/logo.png" class="app-logo-img" alt="ExploreX Logo"><span class="app-logo-text"><span class="bx-e">explore</span><span class="bx-x">X</span></span></a>';
    nav += '<div class="app-nav-center">';
    MAIN_NAV.forEach(n => { nav += '<a href="' + n.path + '" class="app-nav-link ' + (cur === n.path ? 'active' : '') + '">' + n.label + '</a>'; });
    nav += '</div><div class="app-nav-right">';
    nav += '<a href="/connect" class="icon-btn" aria-label="Connect"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></a>';
    nav += '<a href="/notifications" class="icon-btn" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot"></span></a>';

    const avatarHtml = user && user.avatar_url
      ? '<img src="' + user.avatar_url + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" alt="Avatar">'
      : '<div class="profile-avatar">' + initials + '</div>';
    nav += '<div class="profile-wrap" id="profile-wrap"><button class="profile-trigger" id="profile-trigger">' + avatarHtml + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14" style="color:var(--muted-foreground)"><polyline points="6 9 12 15 18 9"/></svg></button>';
    nav += '<div class="profile-menu hidden" id="profile-menu">' +
      '<div class="profile-menu-head">' +
        '<div class="name">' + ((user && user.full_name) || 'Explorer') + '</div>' +
        '<div class="email">' + ((user && user.email) || '') + '</div>' +
        '<div class="profile-menu-points" title="Points balance">' +
          '<span class="star">★</span> ' +
          '<strong>' + fmtPoints(points) + '</strong> pts' +
        '</div>' +
        (planBadge ? '<div style="margin-top:.5rem">' + planBadge + '</div>' : '') +
      '</div>';
    nav += '<div class="profile-menu-list">';
    PROFILE_MENU.forEach(n => { nav += '<a class="profile-menu-item" href="' + n.path + '">' + n.label + '</a>'; });
    nav += '</div><div class="profile-menu-foot"><button id="logout-btn">Log out</button></div></div></div>';
    nav += '<button class="mobile-toggle" id="mobile-toggle" aria-label="Open menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button></div></div></nav>';
    nav += '<div class="mobile-drawer hidden" id="mobile-drawer">';
    [].concat(MAIN_NAV, PROFILE_MENU).forEach(n => { nav += '<a href="' + n.path + '" class="' + (cur === n.path ? 'active' : '') + '">' + n.label + '</a>'; });
    nav += '</div>';

    const slot = document.getElementById('app-nav-slot');
    if (slot) slot.outerHTML = nav;
    else document.body.insertAdjacentHTML('afterbegin', nav);
    bindNavEvents();
    renderTrialBanner(user);
  }

  function bindNavEvents() {
    const trig = document.getElementById('profile-trigger');
    const menu = document.getElementById('profile-menu');
    if (trig && menu) {
      trig.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
      document.addEventListener('click', e => {
        const wrap = document.getElementById('profile-wrap');
        if (wrap && !wrap.contains(e.target)) menu.classList.add('hidden');
      });
    }
    const lo = document.getElementById('logout-btn');
    if (lo) lo.addEventListener('click', () => window.db.auth.logout('/'));
    const mt = document.getElementById('mobile-toggle');
    const md = document.getElementById('mobile-drawer');
    if (mt && md) mt.addEventListener('click', () => md.classList.toggle('hidden'));
  }

  function renderTrialBanner(user) {
    const old = document.getElementById('trial-banner');
    if (old) old.remove();
    if (!user || !user.trial_active || !user.trial_remaining_ms) return;
    const banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.className = 'trial-banner';
    banner.innerHTML = '<span><strong>Trial active</strong> &middot; Max plan &middot; <span id="trial-countdown"></span> left</span> <a href="/pricing">Upgrade</a>';
    document.body.insertAdjacentElement('afterbegin', banner);
    const bootTs = Date.now();
    function tick() {
      const left = user.trial_remaining_ms - (Date.now() - bootTs);
      const el = document.getElementById('trial-countdown');
      if (!el) return;
      if (left <= 0) { el.textContent = 'Expired'; return; }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      el.textContent = (h ? h + 'h ' : '') + m + 'm ' + s + 's';
    }
    tick();
    setInterval(tick, 1000);
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
  window.escapeHtml = escapeHtml;

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  /* ── Theme — light only ─────────────────────────────────────────────────── */
  function applyTheme(theme) {
    // Dark theme removed — site is always light.
    const root = document.documentElement;
    root.classList.remove('theme-dark');
    root.classList.add('theme-light');
    root.dataset.theme = 'light';
  }
  function applyPreferences(prefs) {
    if (!prefs) return;
    window.userPreferences = prefs;
    applyTheme('light');
    // Cache locally so the next page load can apply theme INSTANTLY
    // before /api/auth/me resolves, avoiding a flash of light theme.
    try { localStorage.setItem('explorex_prefs', JSON.stringify(prefs)); } catch (e) {}
  }
  // Apply cached prefs immediately on script load (before bootApp finishes).
  try {
    const cached = JSON.parse(localStorage.getItem('explorex_prefs') || 'null');
    if (cached) applyPreferences(cached);
  } catch (e) {}

  // React to OS dark-mode changes when user is on 'system' theme.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => {
      if ((window.userPreferences && window.userPreferences.theme) === 'system') applyTheme('system');
    });
  }
  window.applyPreferences = applyPreferences;

  async function bootApp() {
    if (!window.db.auth.isLoggedIn()) { window.location.href = '/'; return; }
    try {
      const user = await window.db.auth.me();
      window.currentUser = user;
      if (user.preferences) applyPreferences(user.preferences);
      renderNav(user);
      document.dispatchEvent(new CustomEvent('app:ready', { detail: { user } }));
    } catch (e) {
      window.db.auth.logout('/');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
  else bootApp();
})();

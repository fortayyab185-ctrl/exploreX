/* ═══════════════════════════════════════════════════════════════════════════
   /profile — show user info, points balance, rewards redemption, history.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let me = null, tiers = [], history = [];

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;
    fillHeader();
    document.getElementById('edit-profile-btn').addEventListener('click', openEditModal);
    await Promise.all([loadTiers(), loadHistory(), loadPreferences()]);

    // Honor #prefs-card deep links (from the profile dropdown menu).
    if (location.hash === '#prefs-card') {
      const card = document.getElementById('prefs-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  function fillHeader() {
    const initials = (me.full_name || 'Explorer')
      .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    const av = document.getElementById('profile-avatar');
    if (me.avatar_url) av.innerHTML = '<img src="' + escapeHtml(me.avatar_url) + '" alt="">';
    else av.textContent = initials;

    document.getElementById('profile-name').textContent  = me.full_name || 'Explorer';
    document.getElementById('profile-email').textContent = me.email;
    document.getElementById('points-balance').textContent = (me.points || 0).toLocaleString('en-US');

    const meta = [];
    if (me.effective_plan && me.effective_plan !== 'free') {
      meta.push('<span class="plan-chip plan-' + me.effective_plan + '">' + (me.trial_active ? 'TRIAL' : window.db.planDisplayName(me.effective_plan)) + '</span>');
    }
    if (me.member_since) meta.push('<span class="text-xs text-muted">Member since ' + new Date(me.member_since).toLocaleDateString() + '</span>');
    document.getElementById('profile-meta').innerHTML = meta.join('');
  }

  async function loadTiers() {
    try {
      const data = await window.db.rewards.tiers();
      tiers = data.tiers || [];
      renderTiers();
    } catch (e) {
      document.getElementById('rewards-list').innerHTML = '<p class="text-muted text-sm">Could not load reward tiers.</p>';
    }
  }

  function renderTiers() {
    const out = document.getElementById('rewards-list');
    if (!tiers.length) { out.innerHTML = '<p class="text-muted text-sm">No rewards available.</p>'; return; }
    out.innerHTML = tiers.map(t => {
      const have   = (me.points || 0);
      const enough = have >= t.cost;
      return '<div class="reward-tier">' +
        '<div class="left">' +
          '<div class="lab">' + escapeHtml(t.label) + '</div>' +
          '<div class="cost">Costs ' + t.cost.toLocaleString() + ' pts &middot; you have ' + have.toLocaleString() + '</div>' +
        '</div>' +
        '<button class="btn btn-primary" data-tier="' + escapeHtml(t.id) + '" ' + (enough ? '' : 'disabled') + '>' +
          (enough ? 'Redeem' : 'Need ' + (t.cost - have).toLocaleString() + ' more') +
        '</button>' +
      '</div>';
    }).join('');
    out.querySelectorAll('[data-tier]').forEach(btn => btn.addEventListener('click', () => redeem(btn.dataset.tier)));
  }

  async function redeem(tier_id) {
    const tier = tiers.find(t => t.id === tier_id);
    if (!tier) return;
    const ok = await window.confirmModal({
      title: 'Redeem ' + tier.label + '?',
      message: 'This will deduct ' + tier.cost.toLocaleString() + ' points from your balance and issue a reward.',
      confirm: 'Redeem',
    });
    if (!ok) return;
    try {
      const data = await window.db.rewards.redeem(tier_id);
      let msg = 'Redeemed!';
      if (data.coupon_code) msg += ' Use code ' + data.coupon_code + ' at checkout.';
      else if (data.message) msg = data.message;
      toast.success(msg);
      // Update local state
      me.points = data.points_after;
      document.getElementById('points-balance').textContent = (me.points || 0).toLocaleString('en-US');
      renderTiers();
      await loadHistory();
    } catch (e) { toast.error(e.message); }
  }

  async function loadHistory() {
    try {
      const data = await window.db.rewards.history();
      history = data.items || [];
      renderHistory();
    } catch (e) {
      document.getElementById('history-out').innerHTML = '<p class="text-muted text-sm">Could not load history.</p>';
    }
  }

  function renderHistory() {
    const out = document.getElementById('history-out');
    if (!history.length) { out.innerHTML = '<p class="text-muted text-sm">No activity yet. Create a trip or add bookings to start earning.</p>'; return; }
    out.innerHTML = '<table class="points-table">' +
      '<thead><tr><th>Date</th><th>Reason</th><th style="text-align:right">Points</th></tr></thead>' +
      '<tbody>' +
        history.slice(0, 60).map(h =>
          '<tr>' +
            '<td>' + new Date(h.created_date).toLocaleDateString() + '</td>' +
            '<td>' + escapeHtml(humanReason(h.reason, h.meta)) + '</td>' +
            '<td style="text-align:right" class="' + (h.amount >= 0 ? 'amt-pos' : 'amt-neg') + '">' + (h.amount >= 0 ? '+' : '') + h.amount + '</td>' +
          '</tr>'
        ).join('') +
      '</tbody></table>';
  }

  function humanReason(r, meta) {
    return ({
      trip_create:        'Created a trip' + (meta && meta.destination ? ' to ' + meta.destination : ''),
      booking_create:     'Added a booking',
      trip_started:       'Trip began',
      trip_completed:     'Trip completed',
      connection_accept:  'New travel connection',
      daily_login:        'Daily login bonus',
      reward_redemption:  'Redeemed reward' + (meta && meta.tier ? ' (' + meta.tier + ')' : ''),
    })[r] || r;
  }

  function openEditModal() {
    const html =
      '<div class="modal-head"><h2 class="modal-title">Edit profile</h2><button class="modal-close" data-close>&times;</button></div>' +
      '<div class="field"><label class="field-label">Full name</label><input id="ep-name" class="field-input" value="' + escapeHtml(me.full_name || '') + '"></div>' +
      '<div class="field"><label class="field-label">Phone</label><input id="ep-phone" class="field-input" value="' + escapeHtml(me.phone || '') + '"></div>' +
      '<div class="field"><label class="field-label">Bio</label><textarea id="ep-bio" class="field-input" rows="3">' + escapeHtml(me.bio || '') + '</textarea></div>' +
      '<div class="field"><label class="field-label">Avatar URL (optional)</label><input id="ep-avatar" class="field-input" value="' + escapeHtml(me.avatar_url || '') + '" placeholder="https://..."></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close>Cancel</button>' +
        '<button class="btn btn-primary" id="ep-save">Save</button>' +
      '</div>';
    const m = window.openModal(html);
    m.root.querySelector('#ep-save').addEventListener('click', async () => {
      const updates = {
        full_name:  m.root.querySelector('#ep-name').value.trim(),
        phone:      m.root.querySelector('#ep-phone').value.trim(),
        bio:        m.root.querySelector('#ep-bio').value.trim(),
        avatar_url: m.root.querySelector('#ep-avatar').value.trim(),
      };
      const btn = m.root.querySelector('#ep-save');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const updated = await window.db.auth.updateMe(updates);
        me = updated;
        toast.success('Profile updated');
        m.close();
        fillHeader();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Save';
        toast.error(e.message);
      }
    });
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  /* ── Preferences ────────────────────────────────────────────────────────── */
  // Defaults must mirror backend defaults so the UI shows sensible values
  // even before the user has saved anything.
  const PREF_DEFAULTS = {
    theme: 'system', distance_unit: 'km', currency_display: 'AED',
    default_travelers: 1, default_budget_tier: 'moderate', default_trip_duration_days: 3,
    notify_email: true, notify_in_app: true, weekly_digest: false, auto_geo: true,
    home_currency: 'AED', language: 'en',
  };

  let prefs = Object.assign({}, PREF_DEFAULTS);
  let prefSaveTimer = null;

  async function loadPreferences() {
    try {
      const data = await window.db.auth.getPreferences();
      prefs = Object.assign({}, PREF_DEFAULTS, data.preferences || {});
    } catch (e) {
      // Use cached or defaults if we can't read from server.
      prefs = Object.assign({}, PREF_DEFAULTS, (me && me.preferences) || {});
    }
    renderPreferences();
  }

  function renderPreferences() {
    const out = document.getElementById('prefs-out');
    if (!out) return;
    out.innerHTML =
      '<div class="prefs-grid">' +
        prefRow('Distance unit',
          select('pref-distance', prefs.distance_unit, [['km','Kilometres (km)'],['mi','Miles (mi)']])) +
        prefRow('Currency display',
          select('pref-currency', prefs.currency_display, [['AED','AED — UAE Dirham'],['USD','USD — US Dollar'],['EUR','EUR — Euro'],['GBP','GBP — British Pound'],['INR','INR — Indian Rupee']])) +
        prefRow('Language',
          select('pref-language', prefs.language, [['en','English'],['ar','العربية'],['hi','हिन्दी'],['fr','Français'],['es','Español']])) +
        prefRow('Default travellers',
          numberField('pref-travelers', prefs.default_travelers, 1, 20)) +
        prefRow('Default trip duration (days)',
          numberField('pref-duration', prefs.default_trip_duration_days, 1, 30)) +
        prefRow('Default budget tier',
          select('pref-budget', prefs.default_budget_tier, [['budget','Budget'],['moderate','Moderate'],['premium','Premium'],['luxury','Luxury']])) +
        prefRow('Home currency',
          textField('pref-home-currency', prefs.home_currency, 'AED')) +
      '</div>' +
      '<div style="margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1.25rem">' +
        '<h3 style="font-size:.95rem;margin-bottom:.85rem;color:var(--muted-foreground);letter-spacing:.05em">Notifications &amp; privacy</h3>' +
        toggleRow('pref-notify-email', 'Email notifications',     'Booking confirmations, payment receipts, password resets',  prefs.notify_email) +
        toggleRow('pref-notify-app',   'In-app notifications',    'Bell-icon alerts when something changes',                   prefs.notify_in_app) +
        toggleRow('pref-weekly',       'Weekly digest',           'Trip suggestions and points summary every Monday',          prefs.weekly_digest) +
        toggleRow('pref-geo',          'Auto-detect my location', 'Show distance on Places cards without a permission prompt', prefs.auto_geo) +
      '</div>' +
      '<div style="display:flex;gap:.75rem;margin-top:1.5rem">' +
        '<button class="btn btn-outline" id="prefs-reset">Reset to defaults</button>' +
      '</div>';
    bindPreferenceInputs();
  }

  function prefRow(label, control) {
    return '<div class="pref-row"><label class="pref-label">' + escapeHtml(label) + '</label>' + control + '</div>';
  }
  function select(id, value, options) {
    return '<select id="' + id + '" class="field-select pref-control">' +
      options.map(([v, l]) => '<option value="' + escapeHtml(v) + '"' + (v === value ? ' selected' : '') + '>' + escapeHtml(l) + '</option>').join('') +
    '</select>';
  }
  function numberField(id, value, min, max) {
    return '<input id="' + id + '" type="number" class="field-input pref-control" min="' + min + '" max="' + max + '" value="' + (value || '') + '">';
  }
  function textField(id, value, placeholder) {
    return '<input id="' + id + '" type="text" class="field-input pref-control" value="' + escapeHtml(value || '') + '" placeholder="' + escapeHtml(placeholder || '') + '">';
  }
  function toggleRow(id, title, desc, checked) {
    return '<label class="pref-toggle-row" for="' + id + '">' +
      '<div><div class="pref-toggle-title">' + escapeHtml(title) + '</div>' +
        '<div class="pref-toggle-desc">' + escapeHtml(desc) + '</div></div>' +
      '<span class="pref-switch"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '><span class="pref-switch-bg"></span></span>' +
    '</label>';
  }

  function bindPreferenceInputs() {
    const map = {
      'pref-theme':           v => prefs.theme = v,
      'pref-distance':        v => prefs.distance_unit = v,
      'pref-currency':        v => prefs.currency_display = v,
      'pref-language':        v => prefs.language = v,
      'pref-travelers':       v => prefs.default_travelers = +v || 1,
      'pref-duration':        v => prefs.default_trip_duration_days = +v || 1,
      'pref-budget':          v => prefs.default_budget_tier = v,
      'pref-home-currency':   v => prefs.home_currency = (v || 'AED').toUpperCase().slice(0, 6),
      'pref-notify-email':    v => prefs.notify_email = !!v,
      'pref-notify-app':      v => prefs.notify_in_app = !!v,
      'pref-weekly':          v => prefs.weekly_digest = !!v,
      'pref-geo':             v => prefs.auto_geo = !!v,
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const v = el.type === 'checkbox' ? el.checked : el.value;
        map[id](v);
        if (id === 'pref-theme' && window.applyPreferences) window.applyPreferences(prefs);
        schedulePrefSave();
      });
      // Number/text fields: also save on blur for snappier UX
      if (el.type === 'number' || el.type === 'text') {
        el.addEventListener('blur', () => {
          const v = el.value; map[id](v); schedulePrefSave();
        });
      }
    });

    const resetBtn = document.getElementById('prefs-reset');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      const ok = await window.confirmModal({ title: 'Reset preferences?', message: 'All preferences will return to their defaults.', danger: false, confirm: 'Reset' });
      if (!ok) return;
      prefs = Object.assign({}, PREF_DEFAULTS);
      renderPreferences();
      if (window.applyPreferences) window.applyPreferences(prefs);
      try {
        await window.db.auth.updatePreferences(prefs);
        toast.success('Defaults restored.', { title: 'Preferences reset' });
      } catch (e) { toast.error(e.message, { title: 'Could not reset' }); }
    });
  }

  function schedulePrefSave() {
    // Debounce so rapid changes (e.g. typing in a number field) don't spam the API.
    document.getElementById('prefs-status').textContent = 'Saving…';
    if (prefSaveTimer) clearTimeout(prefSaveTimer);
    prefSaveTimer = setTimeout(async () => {
      try {
        await window.db.auth.updatePreferences(prefs);
        document.getElementById('prefs-status').textContent = 'Saved ✓';
        if (window.applyPreferences) window.applyPreferences(prefs);
      } catch (e) {
        document.getElementById('prefs-status').textContent = 'Save failed';
        toast.error(e.message, { title: 'Could not save preferences' });
      }
    }, 600);
  }
})();

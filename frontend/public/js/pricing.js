

(function () {
  'use strict';

  let me = null;

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;

    
    
    const params = new URLSearchParams(location.search);
    if (params.get('status') === 'success' && params.get('session_id')) {
      try {
        const result = await window.db.billing.verify(params.get('session_id'));
        if (result && result.ok) {
          toast.success(result.message || 'Plan upgraded!');
          
          try { me = await window.db.auth.me(); window.currentUser = me; } catch (_) {}
        }
      } catch (err) {
        toast.error('Could not verify payment: ' + err.message);
      }
      
      history.replaceState({}, '', '/pricing');
    } else if (params.get('status') === 'cancelled') {
      toast.info('Checkout cancelled — you can subscribe anytime.');
      history.replaceState({}, '', '/pricing');
    }

    renderTrialArea();
    await Promise.all([renderPlans(), renderRewardsTiers()]);
  });

  function renderTrialArea() {
    const out = document.getElementById('trial-area');
    if (!me) return;
    if (me.trial_active) {
      out.innerHTML = '<div class="card" style="background:linear-gradient(135deg,var(--teal-10),hsl(40 95% 95%));border-color:var(--primary);margin-bottom:1.5rem">' +
        '<strong>Your free trial is active</strong> &middot; You have access to all Max plan features.' +
      '</div>';
    } else if (me.trial_used) {
      out.innerHTML = '<p class="text-muted text-sm" style="margin-bottom:1.5rem">You have already used your free trial. Subscribe below to keep using premium features.</p>';
    } else {
      out.innerHTML = '<div class="card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:240px"><strong>Try Max plan free for 24 hours</strong><div class="text-xs text-muted">No payment required.</div></div>' +
        '<button class="btn btn-primary" id="start-trial-btn">Start free trial</button>' +
      '</div>';
      const b = document.getElementById('start-trial-btn');
      if (b) b.addEventListener('click', async () => {
        try { await window.db.auth.startTrial(); toast.success('Trial started — enjoy!'); setTimeout(() => location.reload(), 700); }
        catch (e) { toast.error(e.message); }
      });
    }
  }

  async function renderPlans() {
    const out = document.getElementById('plans-out');
    let offers, cfg = {};
    try { offers = await window.db.billing.offers(); }
    catch (e) { out.innerHTML = '<p class="text-muted">Could not load plans.</p>'; return; }
    try { cfg = await window.db.integrations.publicConfig(); } catch (e) {}

    const PLANS = [
      {
        id: 'free', label: 'Free',
        price: 0, originalPrice: 0,
        bullets: ['Globe explorer with real Earth texture', 'Browse and book Places worldwide', 'Weather forecast', 'Basic recommendations', 'Earn travel points'],
      },
      {
        id: 'medium', label: 'Pro',
        price: offers.medium && offers.medium.price ? offers.medium.price : 30,
        originalPrice: offers.medium && offers.medium.originalPrice ? offers.medium.originalPrice : 0,
        bullets: ['Everything in Free', 'AI travel chatbot', 'Priority support'],
        featured: true,
      },
      {
        id: 'high', label: 'Max',
        price: offers.high && offers.high.price ? offers.high.price : 65,
        originalPrice: offers.high && offers.high.originalPrice ? offers.high.originalPrice : 0,
        bullets: ['Everything in Pro', 'AI Trip Planner with REAL named places', 'Unlimited itineraries', 'Priority AI processing'],
      },
    ];

    out.innerHTML = PLANS.map(plan => {
      const isCurrent = me && me.membership === plan.id;
      const cta = (() => {
        if (plan.id === 'free') return '<button class="btn btn-outline" disabled>You have this</button>';
        if (isCurrent) return '<button class="btn btn-outline" disabled>Current plan</button>';
        if (cfg && cfg.has_stripe === false) {
          return '<a class="btn btn-primary" href="mailto:hello@explorex.app?subject=Subscribe%20to%20' + plan.label + '%20plan">Contact us to subscribe</a>';
        }
        return '<button class="btn ' + (plan.featured ? 'btn-primary' : 'btn-outline') + '" data-plan="' + plan.id + '">Choose ' + plan.label + '</button>';
      })();
      const priceDisplay = plan.price === 0
        ? '<span style="font-size:1rem;color:var(--muted-foreground);margin-right:.25rem;font-family:\'DM Sans\',sans-serif">AED</span>' +
          '<span style="font-family:\'DM Sans\',sans-serif">0</span>'
        : (plan.originalPrice && plan.originalPrice > plan.price ? '<span class="price-orig">AED ' + plan.originalPrice + '</span>' : '') +
          '<span style="font-size:1rem;color:var(--muted-foreground);margin-right:.25rem;font-family:\'DM Sans\',sans-serif">AED</span>' +
          plan.price + '<small>/mo</small>';
      return '<div class="plan-card ' + (plan.featured ? 'featured' : '') + '">' +
        '<div class="head">' +
          (plan.featured ? '<span class="save-pill">Most popular</span>' : '') +
          '<h2 style="margin-top:.5rem">' + plan.label + '</h2>' +
          '<div class="price" style="margin-top:.5rem">' + priceDisplay + '</div>' +
        '</div>' +
        '<ul>' + plan.bullets.map(b => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul>' +
        cta +
      '</div>';
    }).join('');

    out.querySelectorAll('[data-plan]').forEach(btn => btn.addEventListener('click', () => choosePlan(btn.dataset.plan)));
  }

  async function choosePlan(plan) {
    try {
      const data = await window.db.billing.checkout(plan);
      if (data && data.url) window.location.href = data.url;
      else toast.success(data.message || 'Subscribed');
    } catch (e) {
      if (e.data && e.data.contact) {
        window.location.href = 'mailto:hello@explorex.app?subject=Subscribe%20to%20' + plan;
      } else {
        toast.error(e.message);
      }
    }
  }

  async function renderRewardsTiers() {
    try {
      const data = await window.db.rewards.tiers();
      const tiers = data.tiers || [];
      const out = document.getElementById('rewards-tiers');
      if (!tiers.length) { out.innerHTML = '<p class="text-muted text-sm">No rewards available.</p>'; return; }
      const have = (me && me.points) || 0;
      out.innerHTML = tiers.map(t =>
        '<div class="reward-tier">' +
          '<div class="left">' +
            '<div class="lab">' + escapeHtml(t.label) + '</div>' +
            '<div class="cost">Costs ' + t.cost.toLocaleString() + ' pts &middot; you have ' + have.toLocaleString() + '</div>' +
          '</div>' +
          '<a href="/profile" class="btn btn-outline">' + (have >= t.cost ? 'Redeem' : 'View') + '</a>' +
        '</div>'
      ).join('');
    } catch (e) {  }
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
})();

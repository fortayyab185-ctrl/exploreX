/* ═══════════════════════════════════════════════════════════════════════════
   ExploreX SDK — vanilla JS API wrapper
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const API_BASE  = '';
  const TOKEN_KEY = 'explorex_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

  async function apiFetch(path, options) {
    options = options || {};
    const token = getToken();
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {},
      options.headers || {}
    );
    const body = options.body !== undefined && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body;
    const res = await fetch(API_BASE + path, { method: options.method || 'GET', headers, body });
    if (!res.ok) {
      let err = {};
      try { err = await res.json(); } catch (_) {}
      const e = new Error(err.error || res.statusText || 'API Error');
      e.status = res.status;
      e.data   = err;
      throw e;
    }
    return res.json();
  }

  const auth = {
    async signup(email, password, full_name) {
      const data = await apiFetch('/api/auth/signup', { method: 'POST', body: { email, password, full_name } });
      setToken(data.token); return data.user;
    },
    async signin(email, password) {
      const data = await apiFetch('/api/auth/signin', { method: 'POST', body: { email, password } });
      setToken(data.token); return data.user;
    },
    async google(credential) {
      const data = await apiFetch('/api/auth/google', { method: 'POST', body: { credential } });
      setToken(data.token); return data.user;
    },
    async me()        { return apiFetch('/api/auth/me'); },
    async updateMe(u) { return apiFetch('/api/auth/me', { method: 'PATCH', body: u }); },
    async startTrial(){ return apiFetch('/api/auth/start-trial', { method: 'POST' }); },
    async getPreferences()       { return apiFetch('/api/me/preferences'); },
    async updatePreferences(p)   { return apiFetch('/api/me/preferences', { method: 'PATCH', body: p }); },
    logout(redirect)  { setToken(null); window.location.href = redirect || '/'; },
    getToken,
    isLoggedIn() { return !!getToken(); },
  };

  const billing = {
    offers()           { return apiFetch('/api/billing/offers'); },
    checkout(plan, coupon) { return apiFetch('/api/billing/checkout', { method: 'POST', body: { plan, coupon } }); },
    verify(session_id) { return apiFetch('/api/billing/verify', { method: 'POST', body: { session_id } }); },
    portal()           { return apiFetch('/api/billing/portal', { method: 'POST' }); },
    bookingCheckout(booking_id) { return apiFetch('/api/booking/checkout', { method: 'POST', body: { booking_id } }); },
    bookingVerify(session_id, booking_id) { return apiFetch('/api/booking/verify', { method: 'POST', body: { session_id, booking_id } }); },
  };

  const rewards = {
    tiers()        { return apiFetch('/api/rewards/tiers'); },
    history()      { return apiFetch('/api/rewards/history'); },
    redeem(tier_id){ return apiFetch('/api/rewards/redeem', { method: 'POST', body: { tier_id } }); },
  };

  const trips = {
    list()        { return apiFetch('/api/trips'); },
    get(id)       { return apiFetch('/api/trips/' + id); },
    create(data)  { return apiFetch('/api/trips', { method: 'POST', body: data }); },
    update(id, d) { return apiFetch('/api/trips/' + id, { method: 'PATCH', body: d }); },
    cancel(id)    { return apiFetch('/api/trips/' + id, { method: 'DELETE' }); },
    remove(id)    { return apiFetch('/api/trips/' + id + '?hard=1', { method: 'DELETE' }); },
  };

  const PLAN_RANK = { free: 0, medium: 1, pro: 1, high: 2, max: 2 };
  const PLAN_DISPLAY = { free: 'Free', medium: 'Pro', pro: 'Pro', high: 'Max', max: 'Max' };
  function planDisplayName(plan) { return PLAN_DISPLAY[plan] || plan; }
  function hasPlan(user, minLevel) {
    return PLAN_RANK[(user && user.effective_plan) || 'free'] >= PLAN_RANK[minLevel];
  }

  function makeEntity(name) {
    const base = '/api/entities/' + name;
    return {
      async list(sort, limit) {
        const q = new URLSearchParams();
        if (sort)  q.set('sort', sort);
        if (limit) q.set('limit', String(limit));
        return apiFetch(base + '?' + q.toString());
      },
      async filter(filters, sort, limit) {
        const q = new URLSearchParams();
        q.set('sort', sort || '-created_date');
        if (limit) q.set('limit', String(limit));
        Object.entries(filters || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
        return apiFetch(base + '?' + q.toString());
      },
      get(id)         { return apiFetch(base + '/' + id); },
      create(data)    { return apiFetch(base, { method: 'POST',  body: data }); },
      update(id, data){ return apiFetch(base + '/' + id, { method: 'PATCH', body: data }); },
      remove(id)      { return apiFetch(base + '/' + id, { method: 'DELETE' }); },
    };
  }

  const integrations = {
    weather(city)        { return apiFetch('/api/weather?city=' + encodeURIComponent(city)); },
    photos(query, count) { return apiFetch('/api/photos?query=' + encodeURIComponent(query || 'travel') + '&count=' + (count || 8)); },
    photo(query)         { return apiFetch('/api/photo?query=' + encodeURIComponent(query || 'travel')); },
    country(name)        { return apiFetch('/api/country?name='  + encodeURIComponent(name)); },
    countryPlaces(name)  { return apiFetch('/api/country-places?country=' + encodeURIComponent(name)); },
    placesSearch(q, type, limit) {
      const sp = new URLSearchParams();
      if (q)    sp.set('q', q);
      if (type) sp.set('type', type);
      if (limit) sp.set('limit', String(limit));
      return apiFetch('/api/places/search?' + sp.toString());
    },
    availability(place_id, date, time) {
      const q = new URLSearchParams({ place_id, date });
      if (time) q.set('time', time);
      return apiFetch('/api/bookings/availability?' + q.toString());
    },
    async ai(prompt, schema, history) {
      const data = await apiFetch('/api/ai/invoke', { method: 'POST', body: { prompt, response_json_schema: schema, messages: history } });
      return data.result;
    },
    async chat(messages, system) {
      const data = await apiFetch('/api/ai/chat', { method: 'POST', body: { messages, system } });
      return data.reply;
    },
    recommendations(limit) { return apiFetch('/api/recommendations?limit=' + (limit || 12)); },
    publicConfig()         { return apiFetch('/api/config/public'); },
  };

  const Users = { list() { return apiFetch('/api/users'); } };

  // ── Geolocation helper (cached for 30 minutes) ─────────────────────────────
  const GEO_KEY = 'explorex_geo';
  const geo = {
    cached() {
      try {
        const raw = localStorage.getItem(GEO_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.ts) return null;
        if (Date.now() - obj.ts > 30 * 60 * 1000) return null;  // 30 min
        return obj;
      } catch (e) { return null; }
    },
    request() {
      return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) return reject(new Error('Geolocation not supported'));
        const c = geo.cached();
        if (c) return resolve(c);
        navigator.geolocation.getCurrentPosition(
          pos => {
            const obj = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
            localStorage.setItem(GEO_KEY, JSON.stringify(obj));
            resolve(obj);
          },
          err => reject(err),
          { timeout: 8000, maximumAge: 30 * 60 * 1000 }
        );
      });
    },
    clear() { localStorage.removeItem(GEO_KEY); },
    haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371, toRad = d => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1), dLng = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
  };

  global.db = {
    auth, billing, rewards, trips, hasPlan, planDisplayName,
    entities: {
      Trip:         { list: trips.list, get: trips.get, create: trips.create, update: trips.update, remove: trips.cancel },
      Booking:      makeEntity('Booking'),
      Connection:   makeEntity('Connection'),
      Itinerary:    makeEntity('Itinerary'),
      Message:      makeEntity('Message'),
      Notification: makeEntity('Notification'),
      Place:        makeEntity('Place'),
      Subscription: makeEntity('Subscription'),
      TripInvite:   makeEntity('TripInvite'),
      Favorite:     makeEntity('Favorite'),
      User:         Users,
    },
    integrations,
    geo,
    apiFetch,
  };
})(window);

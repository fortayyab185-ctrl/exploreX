

(function () {
  'use strict';

  let me, lastResult = null, lastInputs = null;

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;
    if (!db.hasPlan(me, 'high')) { renderGate(); return; }
    renderForm();
    await renderSaved();
  });

  function renderGate() {
    document.getElementById('planner-content').innerHTML =
      '<div class="gate-card">' +
        '<div class="gate-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">' +
            '<path d="M12 3v18M3 12h18"/>' +
          '</svg>' +
        '</div>' +
        '<h3>AI Trip Planner is a Max plan feature</h3>' +
        '<p>Get personalized, full-day itineraries built from REAL named places — Eiffel Tower, Louvre, not "local museum". Free 24-hour trial available.</p>' +
        '<div class="row gap-3" style="justify-content:center">' +
          '<a class="btn btn-primary" href="/pricing">View plans</a>' +
          (me.trial_used ? '' : '<button class="btn btn-outline" id="start-trial-from-planner">Start free trial</button>') +
        '</div>' +
      '</div>';
    const t = document.getElementById('start-trial-from-planner');
    if (t) t.addEventListener('click', async () => {
      try { await db.auth.startTrial(); toast.success('You now have 24 hours of Max plan access.', { title: 'Trial started' }); setTimeout(() => location.reload(), 600); }
      catch (e) { toast.error(e.message); }
    });
  }

  function renderForm() {
    const params = new URLSearchParams(location.search);
    document.getElementById('planner-content').innerHTML =
      '<div class="planner-form">' +
        '<div class="grid grid-2">' +
          '<div class="field">' +
            '<label class="field-label">Destination (city or country)</label>' +
            '<input id="city-input" class="field-input" placeholder="e.g. Lisbon, Tokyo, Paris" value="' + escapeHtml(params.get('city') || '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Date</label>' +
            '<input id="date-input" type="date" class="field-input">' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-2">' +
          '<div class="field">' +
            '<label class="field-label">Trip duration (days)</label>' +
            '<input id="days-input" type="number" min="1" max="14" value="1" class="field-input">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Budget</label>' +
            '<select id="budget-input" class="field-select">' +
              '<option value="budget">Budget</option>' +
              '<option value="moderate" selected>Moderate</option>' +
              '<option value="premium">Premium</option>' +
              '<option value="luxury">Luxury</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label">Interests (optional)</label>' +
          '<input id="prefs-input" class="field-input" placeholder="vegetarian, museums, low walking, photography…">' +
        '</div>' +
        '<button class="btn btn-primary" id="generate-btn">Generate itinerary</button>' +
      '</div>' +
      '<div id="results"></div>' +
      '<div style="margin-top:2rem">' +
        '<h2 class="page-title" style="font-size:1.5rem;margin-bottom:1rem">My Saved Plans</h2>' +
        '<div id="saved-list" class="grid grid-2"></div>' +
      '</div>';
    document.getElementById('date-input').valueAsDate = new Date();
    document.getElementById('generate-btn').addEventListener('click', generate);
  }

  async function renderSaved() {
    try {
      const items = await db.entities.Itinerary.filter({ created_by: me.email }, '-created_date', 20);
      const list = document.getElementById('saved-list');
      if (!list) return;
      if (!items.length) { list.innerHTML = '<p class="text-muted text-sm">No saved itineraries yet.</p>'; return; }
      list.innerHTML = items.map(it =>
        '<div class="saved-card" data-id="' + escapeHtml(it.id) + '">' +
          '<h3>' + escapeHtml(it.title) + '</h3>' +
          '<p class="text-xs text-muted" style="margin-top:.25rem">' + escapeHtml(it.city) + ' &middot; ' + escapeHtml(it.date) + '</p>' +
          '<p class="text-sm" style="margin-top:.5rem;color:var(--muted-foreground)">' + (it.activities || []).length + ' activities &middot; ' + escapeHtml(it.budget || 'moderate') + '</p>' +
          '<div class="actions">' +
            '<button class="btn btn-outline" data-act="view">View</button>' +
            '<button class="btn btn-outline" data-act="book">Add to bookings</button>' +
            '<button class="btn btn-ghost" data-act="delete" style="color:var(--destructive)">Delete</button>' +
          '</div>' +
        '</div>'
      ).join('');
      list.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        const card = b.closest('[data-id]');
        const id = card.dataset.id;
        const it = items.find(x => x.id === id);
        if (b.dataset.act === 'view')   { lastResult = it; lastInputs = { city: it.city, date: it.date, budget: it.budget }; renderResult(it); }
        if (b.dataset.act === 'book')   addAllToBookings(it);
        if (b.dataset.act === 'delete') deletePlan(id);
      }));
    } catch (e) {}
  }

  async function deletePlan(id) {
    const ok = await window.confirmModal({ title: 'Delete plan?', message: 'This itinerary will be removed permanently.', danger: true, confirm: 'Delete' });
    if (!ok) return;
    try { await db.entities.Itinerary.remove(id); toast.success('Itinerary removed.', { title: 'Plan deleted' }); await renderSaved(); }
    catch (e) { toast.error(e.message); }
  }

  async function generate() {
    const city = document.getElementById('city-input').value.trim();
    const date = document.getElementById('date-input').value;
    const days = +document.getElementById('days-input').value;
    const budget = document.getElementById('budget-input').value;
    const prefs = document.getElementById('prefs-input').value;
    if (!city || !date) return toast.error('Destination and date are required.', { title: 'Missing info' });

    lastInputs = { city, date, days, budget, prefs };

    const btn = document.getElementById('generate-btn');
    btn.disabled = true; btn.textContent = 'Crafting your plan…';
    const out = document.getElementById('results');
    out.innerHTML = '<div class="text-center" style="padding:3rem"><div class="spinner spinner-lg" style="margin:0 auto"></div><p class="text-muted text-sm" style="margin-top:1rem">Asking the AI…</p></div>';

    try {
      
      const prompt =
        'You are a professional travel planner. Generate a real itinerary for ' + city + ' starting ' + date + '.\n' +
        'Trip duration: ' + days + ' day(s). Budget: ' + budget + '. Interests: ' + (prefs || 'general sightseeing') + '.\n\n' +
        'Hard requirements:\n' +
        '- Use ONLY real, well-known, NAMED places that actually exist in or near ' + city + ' (e.g. "Visit the Louvre Museum at Rue de Rivoli, Paris", NOT "visit a local museum").\n' +
        '- Every activity\'s "location" must be a real street, neighborhood, or landmark name.\n' +
        '- Every activity\'s "activity" name must include the real venue/place name.\n' +
        '- Use real food names ("Sushi at Tsukiji Outer Market"), real shop names ("Browse Galeries Lafayette"), real venues.\n' +
        '- Do not say "the local museum", "a popular café", "a typical restaurant" — always name them.\n\n' +
        'Return 5–7 activities for ' + days + '-day plan covering breakfast through dinner.';

      const result = await db.integrations.ai(prompt, {
        type: 'object',
        properties: {
          title: { type: 'string' },
          weather_summary: { type: 'string' },
          activities: { type: 'array', items: { type: 'object', properties: {
            time: { type: 'string' }, activity: { type: 'string' }, location: { type: 'string' },
            description: { type: 'string' }, type: { type: 'string' }, price_per_person: { type: 'number' },
            unsplash_query: { type: 'string' },
          } } },
        },
      });
      lastResult = Object.assign({}, result, { city, date, budget });
      renderResult(lastResult);

      
      try {
        await db.entities.Itinerary.create({
          title: result.title || ('Trip to ' + city),
          city, date, budget, preferences: prefs,
          weather_summary: result.weather_summary,
          activities: result.activities || [],
        });
        toast.success('+25 points · find it under "My Saved Plans".', { title: 'Plan saved!' });
        await renderSaved();
      } catch (e) {}
    } catch (e) {
      out.innerHTML = '<p class="text-muted">' + escapeHtml(e.message) + '</p>';
    } finally {
      btn.disabled = false; btn.textContent = 'Generate itinerary';
    }
  }

  function renderResult(it) {
    const total = (it.activities || []).reduce((s, a) => s + (a.price_per_person || 0), 0);
    const out = document.getElementById('results');
    out.innerHTML =
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:1rem">' +
          '<div>' +
            '<h2 style="font-size:1.5rem;font-family:\'Sora\',sans-serif">' + escapeHtml(it.title || 'Trip plan') + '</h2>' +
            '<p class="text-xs text-muted" style="margin-top:.25rem">' + escapeHtml(it.city) + ' &middot; ' + escapeHtml(it.date) + '</p>' +
          '</div>' +
          '<span class="pill pill-primary">~AED ' + total + ' pp</span>' +
        '</div>' +
        (it.weather_summary ? '<p class="text-sm text-muted" style="margin-bottom:1rem">' + escapeHtml(it.weather_summary) + '</p>' : '') +
        '<div>' + (it.activities || []).map((a, i) => activityRowHTML(a, i, it.city)).join('') + '</div>' +
        '<div class="row gap-3" style="margin-top:1.5rem;justify-content:flex-end">' +
          '<button class="btn btn-outline" id="re-roll">Generate again</button>' +
          '<button class="btn btn-primary" id="add-bookings">Add all to bookings</button>' +
        '</div>' +
      '</div>';
    document.getElementById('re-roll').addEventListener('click', () => generate());
    document.getElementById('add-bookings').addEventListener('click', () => addAllToBookings(it));

    
    (it.activities || []).forEach(async (a, i) => {
      const img = document.querySelector('[data-act-img="' + i + '"]');
      if (!img) return;
      const q = (a.unsplash_query || a.activity || '').trim() + ' ' + (it.city || '');
      try {
        const r = await window.db.integrations.photo(q);
        if (r && (r.thumb || r.url)) {
          img.src = r.thumb || r.url;
          img.style.display = 'block';
          const skel = img.parentElement.querySelector('.img-skel');
          if (skel) skel.remove();
        }
      } catch (e) {}
    });
  }

  function activityRowHTML(a, i, city) {
    return '<div class="activity-row" style="align-items:flex-start">' +
      '<div class="time">' + escapeHtml(a.time || '') + '</div>' +
      '<div style="flex-shrink:0;width:80px;height:60px;border-radius:10px;overflow:hidden;background:var(--muted);position:relative">' +
        '<img data-act-img="' + i + '" alt="" style="width:100%;height:100%;object-fit:cover;display:none">' +
        '<div class="img-skel" style="position:absolute;inset:0;background:linear-gradient(110deg, hsl(0 0% 92%) 8%, hsl(0 0% 96%) 18%, hsl(0 0% 92%) 33%);background-size:200% 100%;animation:skeleton 1.4s linear infinite"></div>' +
      '</div>' +
      '<div class="info">' +
        '<div class="a-name">' + escapeHtml(a.activity || '') + '</div>' +
        '<div class="a-loc">' + escapeHtml(a.location || '') + '</div>' +
        '<div class="a-desc">' + escapeHtml(a.description || '') + '</div>' +
        '<div class="a-meta">' +
          (a.type ? '<span class="pill">' + escapeHtml(a.type) + '</span>' : '') +
          (a.price_per_person ? '<span class="pill pill-primary">AED ' + a.price_per_person + '</span>' : '<span class="pill pill-success">Free</span>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  async function addAllToBookings(it) {
    const acts = (it.activities || []).filter(a => a.activity && a.location);
    if (!acts.length) return toast.error('Nothing to book', { title: 'Empty plan' });

    
    const tripStart = it.date;
    const days = +(it.days || 1) || 1;
    const endDate = new Date(it.date); endDate.setDate(endDate.getDate() + Math.max(0, days - 1));
    const tripEnd = endDate.toISOString().slice(0, 10);

    
    const cityRaw = (it.city || '').trim();
    let destCity = cityRaw, destCountry = cityRaw;
    if (cityRaw.indexOf(',') !== -1) {
      const parts = cityRaw.split(',').map(s => s.trim());
      destCity = parts[0]; destCountry = parts.slice(1).join(', ') || parts[0];
    }
    const totalCost = acts.reduce((s, a) => s + (+a.price_per_person || 0), 0);

    
    const confirmed = await window.confirmModal({
      title: 'Turn this plan into a trip?',
      message: 'A new trip to ' + destCity + ' on ' + tripStart + ' will be created with ' + acts.length + ' booking(s)' + (totalCost > 0 ? ', total AED ' + totalCost + '.' : '.'),
      confirm: totalCost > 0 ? 'Continue to payment' : 'Create trip',
    });
    if (!confirmed) return;

    const loading = toast.loading('Setting up your trip…', { title: 'One moment' });

    
    let trip_id = '', tripName = '';
    let createdTripId = '';
    try {
      const trips = await window.db.trips.list();
      const today = new Date().toISOString().slice(0, 10);
      const eligible = (trips || []).filter(t => t.status !== 'cancelled' && t.end_date >= today &&
        (it.date >= t.start_date && it.date <= t.end_date));
      if (eligible.length) {
        trip_id  = eligible[0].id;
        tripName = (eligible[0].destination_city ? eligible[0].destination_city + ', ' : '') + eligible[0].destination_country;
      }
    } catch (e) {}

    
    if (!trip_id) {
      try {
        
        let cover_image = '';
        try {
          const ph = await window.db.integrations.photo(destCity + ' ' + destCountry);
          if (ph && (ph.url || ph.thumb)) cover_image = ph.url || ph.thumb;
        } catch (e) {}

        const newTrip = await window.db.trips.create({
          destination_country: destCountry,
          destination_city:    destCity,
          start_date:          tripStart,
          end_date:            tripEnd,
          travelers:           1,
          budget:              totalCost,
          notes:               'Created from AI plan: ' + (it.title || ''),
          cover_image,
        });
        trip_id = newTrip.id || newTrip._id;
        createdTripId = trip_id;
        tripName = destCity || destCountry;
      } catch (e) {
        loading.dismiss();
        if (e.status === 409) toast.error(e.message, { title: 'Date conflict' });
        else if (e.status === 429) toast.error(e.message, { title: 'Cooldown active' });
        else toast.error(e.message || 'Could not create trip', { title: 'Trip creation failed' });
        return;
      }
    }

    
    let ok = 0, dup = 0, err = 0;
    const created = [];
    for (const a of acts) {
      try {
        const price = +a.price_per_person || 0;
        const body = {
          place_name:   a.activity,
          place_type:   a.type || 'attraction',
          booking_date: it.date,
          booking_time: a.time,
          guests: 1,
          notes:  a.description,
          
          
          status: 'confirmed',
          payment_status: price > 0 ? 'unpaid' : 'free',
          total_price: price,
          confirmation_code: 'PL-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
          trip_id,
        };
        const doc = await db.entities.Booking.create(body);
        created.push(doc);
        ok++;
      } catch (e) {
        if ((e.status === 409) || /already/i.test(e.message)) dup++;
        else err++;
      }
    }

    loading.dismiss();

    
    if (ok === 0 && createdTripId) {
      try { await window.db.trips.cancel(createdTripId); } catch (e) {}
      toast.error(err + ' could not be added' + (dup ? ', ' + dup + ' already booked' : ''), { title: 'No activities saved' });
      return;
    }

    
    let cfg = {};
    try { cfg = await window.db.integrations.publicConfig(); } catch (e) {}
    const stripeEnabled = !!(cfg && cfg.has_stripe);

    if (totalCost > 0 && stripeEnabled) {
      
      
      
      
      
      const firstPayable = created.find(b => (b.total_price || 0) > 0);
      if (firstPayable) {
        toast.show({
          type: 'info',
          title: 'Trip created — payment next',
          message: 'Redirecting to secure checkout for AED ' + totalCost + '…',
          duration: 2500,
        });
        try {
          
          
          await db.entities.Booking.update(firstPayable.id, {
            total_price: totalCost,
            place_name:  (it.title || tripName) + ' — full plan',
          });
          const out = await window.db.billing.bookingCheckout(firstPayable.id);
          if (out && out.url) {
            setTimeout(() => { window.location.href = out.url; }, 600);
            return;
          }
          toast.error('Could not start payment — your trip is saved, you can pay from /bookings.', { title: 'Payment unavailable' });
        } catch (e) {
          toast.error(e.message || 'Could not start payment — your trip is saved, you can pay from /bookings.', { title: 'Payment unavailable' });
        }
      }
    }

    
    if (ok) {
      toast.success(
        ok + ' activit' + (ok === 1 ? 'y' : 'ies') + ' saved to ' + (tripName || 'your trip') +
        (dup ? ' · ' + dup + ' duplicate(s) skipped' : '') +
        ' · +' + (ok * 25) + ' points',
        { title: 'Trip ready!', duration: 5000 }
      );
      setTimeout(() => { window.location.href = '/bookings'; }, 2000);
    }
    if (err && !ok) toast.error(err + ' could not be added', { title: 'Some activities failed' });
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
})();

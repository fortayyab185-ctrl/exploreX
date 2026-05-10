

(function () {
  'use strict';

  let me, allPlaces = [], typeFilter = 'all', searchQ = '', sortBy = 'featured';
  let userLoc = null;

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;
    const params = new URLSearchParams(location.search);
    if (params.get('q'))    { searchQ    = params.get('q'); document.getElementById('places-search-input').value = searchQ; }
    if (params.get('type')) { typeFilter = params.get('type'); }

    bindControls();
    setupGeo();
    await loadPlaces();
  });

  function bindControls() {
    document.getElementById('places-search-btn').addEventListener('click', onSearch);
    document.getElementById('places-clear-btn').addEventListener('click', () => {
      searchQ = '';
      document.getElementById('places-search-input').value = '';
      typeFilter = 'all';
      activateTab('all');
      loadPlaces();
    });
    document.getElementById('places-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSearch();
    });
    document.querySelectorAll('.places-tab').forEach(t => t.addEventListener('click', () => {
      activateTab(t.dataset.tab);
      typeFilter = t.dataset.tab;
      loadPlaces();
    }));
    if (typeFilter !== 'all') activateTab(typeFilter);
    document.getElementById('places-sort').addEventListener('change', (e) => {
      sortBy = e.target.value;
      render();
    });
    document.getElementById('places-geo-btn').addEventListener('click', () => requestGeo(true));
  }

  function activateTab(name) {
    document.querySelectorAll('.places-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  }

  function setupGeo() {
    const cached = window.db.geo.cached();
    if (cached) {
      userLoc = cached;
      document.getElementById('places-geo-banner').classList.add('hidden');
      return;
    }
    
    
    const prefs = window.userPreferences || {};
    if (prefs.auto_geo) {
      
      window.db.geo.request().then(loc => {
        userLoc = loc;
        document.getElementById('places-geo-banner').classList.add('hidden');
        render();
      }).catch(() => {
        
        if (sessionStorage.getItem('places_geo_dismissed') !== '1') {
          document.getElementById('places-geo-banner').classList.remove('hidden');
        }
      });
    } else if (sessionStorage.getItem('places_geo_dismissed') !== '1') {
      document.getElementById('places-geo-banner').classList.remove('hidden');
    }
  }

  async function requestGeo(force) {
    try {
      const loc = await window.db.geo.request();
      userLoc = loc;
      document.getElementById('places-geo-banner').classList.add('hidden');
      sessionStorage.setItem('places_geo_dismissed', '1');
      toast.success('Distances now show on cards.', { title: 'Location enabled' });
      render();
    } catch (e) {
      sessionStorage.setItem('places_geo_dismissed', '1');
      document.getElementById('places-geo-banner').classList.add('hidden');
      if (force) toast.error('Could not get your location.', { title: 'Location unavailable' });
    }
  }

  function onSearch() {
    searchQ = document.getElementById('places-search-input').value.trim();
    loadPlaces();
  }

  async function loadPlaces() {
    const out = document.getElementById('places-out');
    out.innerHTML = '<div class="text-center" style="padding:3rem"><div class="spinner spinner-lg" style="margin:0 auto"></div></div>';
    try {
      const res = await window.db.integrations.placesSearch(searchQ, typeFilter, 60);
      allPlaces = res.items || [];
      
      render(res.source);
    } catch (e) {
      out.innerHTML = '<p class="text-muted text-center" style="padding:2rem">' + escapeHtml(e.message) + '</p>';
    }
  }

  function render(source) {
    const out = document.getElementById('places-out');
    let list = allPlaces.slice();

    
    if (userLoc) {
      list = list.map(p => p.latitude && p.longitude
        ? Object.assign({}, p, { _dist: window.db.geo.haversineKm(userLoc.lat, userLoc.lng, p.latitude, p.longitude) })
        : p);
    }

    
    list.sort((a, b) => {
      if (sortBy === 'rating')      return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'distance')    return (a._dist == null ? 1e9 : a._dist) - (b._dist == null ? 1e9 : b._dist);
      if (sortBy === 'price-asc')   return (a.avg_price || 0) - (b.avg_price || 0);
      if (sortBy === 'price-desc')  return (b.avg_price || 0) - (a.avg_price || 0);
      
      const fa = a.featured ? 1 : 0, fb = b.featured ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return (b.rating || 0) - (a.rating || 0);
    });

    if (!list.length) {
      out.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon"></div>' +
          '<h3 class="empty-title">No places found</h3>' +
          '<p class="empty-sub">Try a different city, or clear filters.</p>' +
          '<button class="btn btn-outline" onclick="document.getElementById(\'places-clear-btn\').click()" style="margin-top:1rem">Clear filters</button>' +
        '</div>';
      return;
    }

    let html = '';
    if (source === 'ai') {
      html += '<p class="text-tiny text-muted" style="margin-bottom:1rem;display:flex;align-items:center;gap:.4rem">' +
        '<i data-lucide="sparkles" style="width:12px;height:12px;color:var(--primary)"></i> AI-suggested places for your search — book button creates a draft entry' +
      '</p>';
    } else if (source === 'mixed') {
      html += '<p class="text-tiny text-muted" style="margin-bottom:1rem;display:flex;align-items:center;gap:.4rem">' +
        '<i data-lucide="sparkles" style="width:12px;height:12px;color:var(--primary)"></i> Showing your search results, with extra AI-suggested places to round things out' +
      '</p>';
    }
    html += '<div class="places-grid-v6">' + list.map(p => placeCardHTML(p)).join('') + '</div>';
    out.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    out.querySelectorAll('.pcard').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button[data-act="book"]')) return;   
        const id = card.dataset.pid;
        const p = list.find(x => x.id === id);
        if (p) openDetail(p);
      });
    });
    out.querySelectorAll('button[data-act="book"]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.closest('.pcard').dataset.pid;
      const p = list.find(x => x.id === id);
      if (p) openBooking(p);
    }));

    
    list.forEach(p => {
      if (!p.image_url && p._aiUnsplashQuery) {
        const card = out.querySelector('.pcard[data-pid="' + p.id + '"] img.lazy-img');
        if (!card) return;
        window.db.integrations.photo(p._aiUnsplashQuery).then(r => {
          if (r && (r.thumb || r.url)) {
            card.src = r.url || r.thumb;
            card.style.display = 'block';
            const skel = card.parentElement.querySelector('.img-skel');
            if (skel) skel.remove();
            
            p.image_url = r.url || r.thumb;
          }
        }).catch(() => {});
      }
    });
  }

  function placeCardHTML(p) {
    const unit = (window.userPreferences && window.userPreferences.distance_unit) === 'mi' ? 'mi' : 'km';
    const distVal = p._dist != null
      ? (unit === 'mi' ? p._dist * 0.621371 : p._dist)
      : null;
    const dist = distVal != null ? (Math.round(distVal * 10) / 10) + ' ' + unit + ' away' : '';
    const stars = p.rating
      ? '<span class="stars">★</span> ' + p.rating
      : '';
    const img = p.image_url
      ? '<img class="lazy-img" src="' + escapeHtml(p.image_url) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">'
      : '<img class="lazy-img" alt="' + escapeHtml(p.name) + '" style="display:none"><div class="img-skel"></div>';
    return '<div class="pcard" data-pid="' + escapeHtml(p.id) + '">' +
      '<div class="img">' +
        img +
        (dist ? '<span class="dist-badge">' + dist + '</span>' : '') +
        (p.avg_price ? '<span class="price-badge">AED ' + p.avg_price + '</span>' : '') +
      '</div>' +
      '<div class="body">' +
        '<h3>' + escapeHtml(p.name) + '</h3>' +
        '<div class="meta">' +
          '<span>' + escapeHtml((p.city || '') + (p.country ? ', ' + p.country : '')) + '</span>' +
          (stars ? '<span style="margin-left:auto">' + stars + '</span>' : '') +
        '</div>' +
        '<p class="desc">' + escapeHtml(p.short_description || p.description || '') + '</p>' +
        '<div class="pillrow">' +
          '<span class="pill">' + escapeHtml(p.type) + '</span>' +
          (p.price_level ? '<span class="pill pill-primary">' + escapeHtml(p.price_level) + '</span>' : '') +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-primary" data-act="book" style="flex:1">Book</button>' +
          '<button class="btn btn-outline" data-act="view">Details</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  
  async function openDetail(p) {
    const html =
      '<div class="modal-head"><h2 class="modal-title">' + escapeHtml(p.name) + '</h2><button class="modal-close" data-close>&times;</button></div>' +
      '<div class="place-detail-modal">' +
        '<div class="place-photo-strip" id="pd-photos">' +
          '<div><div class="img-skel"></div></div><div><div class="img-skel"></div></div><div><div class="img-skel"></div></div>' +
        '</div>' +
        '<div>' +
          '<div class="meta-row" style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;font-size:.85rem;color:var(--muted-foreground);margin-bottom:.75rem">' +
            '<span><strong>Where:</strong> ' + escapeHtml((p.city || '') + (p.country ? ', ' + p.country : '')) + '</span>' +
            (p.rating       ? '<span><strong>Rating:</strong> ★ ' + p.rating + '</span>' : '') +
            (p.price_level  ? '<span><strong>Price:</strong> ' + escapeHtml(p.price_level) + '</span>' : '') +
            (p.opening_hours? '<span><strong>Hours:</strong> ' + escapeHtml(p.opening_hours) + '</span>' : '') +
            (p.avg_price    ? '<span><strong>Avg cost:</strong> AED ' + p.avg_price + '</span>' : '') +
            ((p.latitude != null && p.longitude != null) ? '<span><strong>Coords:</strong> ' + p.latitude.toFixed(3) + ', ' + p.longitude.toFixed(3) + '</span>' : '') +
          '</div>' +
          '<p style="font-size:.9rem;line-height:1.55">' + escapeHtml(p.description || p.short_description || '') + '</p>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" data-close>Close</button>' +
          '<button class="btn btn-primary" id="pd-book">Book now</button>' +
        '</div>' +
      '</div>';
    const m = openModal(html);
    m.root.querySelector('.modal').classList.add('modal-wide-trip');
    m.root.querySelector('#pd-book').addEventListener('click', () => { m.close(); openBooking(p); });

    
    try {
      const res = await window.db.integrations.photos((p.name + ' ' + (p.city || '')).trim(), 3);
      const strip = m.root.querySelector('#pd-photos');
      if (strip && res.photos && res.photos.length) {
        strip.innerHTML = res.photos.slice(0, 3).map(ph => '<div><img src="' + ph.url + '" alt=""></div>').join('');
      }
    } catch (e) {  }
  }

  

  async function openBooking(p) {
    let trips = [], cfg = {};
    try { trips = await window.db.trips.list(); } catch (e) { trips = []; }
    try { cfg = await window.db.integrations.publicConfig(); } catch (e) {}
    const stripeEnabled = !!(cfg && cfg.has_stripe);
    const today = new Date().toISOString().slice(0, 10);
    const eligible = trips.filter(t => t.status !== 'cancelled' && t.end_date >= today);

    const unitPrice = +p.avg_price || 0;
    const tripOptions = eligible.length
      ? '<select id="bk-trip" class="field-select">' +
          '<option value="">— No trip / standalone booking —</option>' +
          eligible.map(t => '<option value="' + t.id + '">' + escapeHtml((t.destination_city ? t.destination_city + ', ' : '') + t.destination_country) + ' · ' + t.start_date + ' → ' + t.end_date + '</option>').join('') +
        '</select>'
      : '<p class="text-xs text-muted">No active trips. This will create a standalone booking. To group bookings into a trip, create one on the Bookings page first.</p>';

    const isPaid = unitPrice > 0;
    const ctaLabel = isPaid && stripeEnabled
      ? 'Pay & confirm'
      : 'Confirm booking';

    const html =
      '<div class="modal-head"><h2 class="modal-title">Book — ' + escapeHtml(p.name) + '</h2><button class="modal-close" data-close>&times;</button></div>' +
      '<div class="field"><label class="field-label">Add to a trip</label>' + tripOptions + '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label class="field-label">Date</label><input id="bk-date" type="date" class="field-input"></div>' +
        '<div class="field"><label class="field-label">Time (optional)</label><input id="bk-time" type="time" class="field-input"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label class="field-label">Guests</label><input id="bk-guests" type="number" min="1" max="20" value="2" class="field-input"></div>' +
        '<div class="field"><label class="field-label">Notes (optional)</label><input id="bk-notes" class="field-input" placeholder="Allergies, preferences…"></div>' +
      '</div>' +
      
      (isPaid
        ? '<div id="bk-price-summary" style="display:flex;align-items:center;justify-content:space-between;padding:.85rem 1rem;border-radius:12px;background:hsla(180,24%,53%,.08);border:1px solid hsla(180,24%,53%,.2);margin-bottom:1rem">' +
            '<div>' +
              '<div style="font-size:.7rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted-foreground)">Total</div>' +
              '<div id="bk-total-text" style="font-size:1.4rem;font-family:\'Sora\',sans-serif;color:var(--primary);font-weight:500;margin-top:.15rem">AED ' + (unitPrice * 2) + '</div>' +
            '</div>' +
            '<div style="font-size:.75rem;color:var(--muted-foreground);text-align:right">' +
              'AED ' + unitPrice + ' × <span id="bk-guests-label">2</span> guest(s)<br>' +
              (stripeEnabled
                ? '<span style="font-size:.7rem">Secure payment via Stripe</span>'
                : '<span style="font-size:.7rem;color:var(--destructive)">Payment unavailable — Stripe not configured</span>') +
            '</div>' +
          '</div>'
        : '<p class="text-xs text-muted" style="margin-bottom:1rem">No charge — this venue has no listed price.</p>'
      ) +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close>Cancel</button>' +
        '<button class="btn btn-primary" id="bk-confirm">' + ctaLabel + '</button>' +
      '</div>';
    const m = openModal(html);
    const dateInput = m.root.querySelector('#bk-date');
    dateInput.min = today;
    const tripSel = m.root.querySelector('#bk-trip');
    function syncDateBoundsFromTrip() {
      if (tripSel && tripSel.value) {
        const t = eligible.find(x => x.id === tripSel.value);
        if (t) {
          dateInput.min = t.start_date;
          dateInput.max = t.end_date;
          dateInput.value = t.start_date;
          return;
        }
      }
      dateInput.removeAttribute('max');
      const d = new Date(); d.setDate(d.getDate() + 1);
      dateInput.value = d.toISOString().slice(0, 10);
    }
    if (tripSel) tripSel.addEventListener('change', syncDateBoundsFromTrip);
    syncDateBoundsFromTrip();

    
    const guestsInput = m.root.querySelector('#bk-guests');
    if (isPaid) {
      const totalText = m.root.querySelector('#bk-total-text');
      const guestsLabel = m.root.querySelector('#bk-guests-label');
      const updateTotal = () => {
        const g = +guestsInput.value || 1;
        if (totalText) totalText.textContent = 'AED ' + (unitPrice * g);
        if (guestsLabel) guestsLabel.textContent = g;
      };
      guestsInput.addEventListener('input', updateTotal);
      updateTotal();
    }

    m.root.querySelector('#bk-confirm').addEventListener('click', async () => {
      const date = m.root.querySelector('#bk-date').value;
      const time = m.root.querySelector('#bk-time').value;
      const guests = +guestsInput.value || 1;
      const notes  = m.root.querySelector('#bk-notes').value;
      const trip_id = tripSel ? tripSel.value : '';
      if (!date) return toast.error('Please pick a date', { title: 'Date required' });

      const totalPrice = unitPrice * guests;
      const willCharge = totalPrice > 0 && stripeEnabled;
      const btn = m.root.querySelector('#bk-confirm');

      
      if (!p._ai && p.id) {
        btn.disabled = true; btn.textContent = 'Checking availability…';
        const checkToast = toast.loading('Checking availability…', { title: 'One sec' });
        try {
          const avail = await window.db.integrations.availability(p.id, date, time);
          checkToast.dismiss();
          if (avail && avail.available === false) {
            toast.error(avail.message || 'This date/time is fully booked. Try another.', {
              title: 'Not available',
              duration: 5000,
            });
            btn.disabled = false; btn.textContent = ctaLabel;
            return;
          }
          if (avail && typeof avail.remaining === 'number' && avail.remaining < guests) {
            toast.error('Only ' + avail.remaining + ' spot(s) left — please reduce guests or pick another time.', {
              title: 'Not enough spots',
              duration: 6000,
            });
            btn.disabled = false; btn.textContent = ctaLabel;
            return;
          }
        } catch (e) {
          
          checkToast.dismiss();
          console.warn('Availability check failed:', e.message);
        }
      }

      const body = {
        place_id:    p._ai ? '' : p.id,
        place_name:  p.name,
        place_type:  p.type,
        place_image: p.image_url,
        booking_date: date,
        booking_time: time || undefined,
        guests, notes: notes || undefined,
        
        
        status: willCharge ? 'pending' : 'confirmed',
        payment_status: willCharge ? 'unpaid' : 'free',
        total_price: totalPrice,
        confirmation_code: 'EX-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      };
      if (trip_id) body.trip_id = trip_id;

      btn.disabled = true; btn.textContent = willCharge ? 'Redirecting to payment…' : 'Booking…';

      const savingToast = toast.loading(willCharge ? 'Saving booking, then taking you to payment…' : 'Saving your booking…', {
        title: willCharge ? 'Securing your spot' : 'Booking',
      });

      try {
        const created = await window.db.entities.Booking.create(body);

        if (willCharge) {
          
          try {
            const out = await window.db.billing.bookingCheckout(created.id || created._id);
            if (out && out.url) {
              savingToast.update({
                type: 'info', title: 'Redirecting to checkout',
                message: 'Opening secure Stripe payment page…', duration: 1500,
              });
              setTimeout(() => { window.location.href = out.url; }, 600);
              return;
            }
            savingToast.dismiss();
            toast.error('Could not start payment session', { title: 'Payment unavailable' });
            btn.disabled = false; btn.textContent = ctaLabel;
          } catch (err) {
            savingToast.dismiss();
            toast.error(err.message || 'Could not start payment', { title: 'Payment failed' });
            
            try { await window.db.entities.Booking.remove(created.id || created._id); } catch (_) {}
            btn.disabled = false; btn.textContent = ctaLabel;
          }
          return;
        }

        savingToast.update({
          type: 'success', title: 'Booking confirmed!',
          message: p.name + ' · ' + date + ' · +25 points',
          duration: 5000,
        });
        try {
          await window.db.entities.Notification.create({
            title: 'Booking confirmed', message: p.name + ' on ' + date, type: 'booking', link: '/bookings',
          });
        } catch (e) {}
        m.close();
      } catch (e) {
        savingToast.dismiss();
        if (e.status === 409 || /already booked/i.test(e.message)) {
          toast.error('You already have a booking for this place on that date.', { title: 'Duplicate booking' });
        } else if (e.status === 400 && /trip window/i.test(e.message || '')) {
          toast.error('Date is outside the selected trip\'s window.', { title: 'Invalid date' });
        } else {
          toast.error(e.message, { title: 'Booking failed' });
        }
        btn.disabled = false; btn.textContent = ctaLabel;
      }
    });
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
})();

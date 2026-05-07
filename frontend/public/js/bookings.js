/* ═══════════════════════════════════════════════════════════════════════════
   /bookings — Trip-based booking system
   Tabs: Upcoming Trips | Past Trips | All Bookings
   - Create trip (destination, dates, travelers, budget) with date-conflict check
   - View trip details (expand list of bookings within that trip)
   - Cancel trip (confirmation modal, soft-cancels child bookings)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let me, allTrips = [], allBookings = [], bucket = 'upcoming';

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;

    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      bucket = t.dataset.bucket;
      render();
    }));
    document.getElementById('new-trip-btn').addEventListener('click', () => openNewTripModal());

    // Handle redirect from Stripe Checkout (booking payment).
    // ?payment=success&booking_id=…&session_id=… → verify server-side and confirm.
    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'success' && params.get('session_id')) {
      const verifyToast = toast.loading('Verifying your payment…', { title: 'Almost done' });
      try {
        const result = await window.db.billing.bookingVerify(params.get('session_id'), params.get('booking_id'));
        if (result && result.ok) {
          verifyToast.update({
            type: 'success', title: 'Payment confirmed!',
            message: result.message || 'Your booking is confirmed and added to your trip.',
            duration: 5500,
          });
          try {
            await window.db.entities.Notification.create({
              title: 'Booking confirmed', message: 'Payment received', type: 'booking', link: '/bookings',
            });
          } catch (_) {}
        }
      } catch (err) {
        verifyToast.dismiss();
        toast.error('Could not verify payment: ' + err.message, {
          title: 'Verification failed', duration: 6000,
        });
      }
      history.replaceState({}, '', '/bookings');
      // After verify, switch to "All Bookings" so the user actually sees the new booking,
      // even if it has no trip attached.
      bucket = 'all-bookings';
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.bucket === 'all-bookings'));
    } else if (params.get('payment') === 'cancelled') {
      toast.info('Your booking is on hold — pay or cancel it from the list below.', {
        title: 'Payment cancelled', duration: 5000,
      });
      history.replaceState({}, '', '/bookings');
      bucket = 'all-bookings';
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.bucket === 'all-bookings'));
    }

    await reload();

    // If launched with ?new=1 (e.g. from globe), open the New Trip modal
    if (params.get('new') === '1') {
      openNewTripModal({ destination_country: params.get('country') || '' });
    }
  });

  async function reload() {
    try {
      const [trips, bookings] = await Promise.all([
        window.db.trips.list().catch(() => []),
        window.db.entities.Booking.filter({ created_by: me.email }, '-booking_date', 500).catch(() => []),
      ]);
      allTrips    = trips || [];
      allBookings = bookings || [];
      render();
    } catch (e) { toast.error(e.message); }
  }

  function isPastTrip(t) {
    const today = new Date().toISOString().slice(0, 10);
    return t.status === 'cancelled' || t.status === 'completed' || (t.end_date && t.end_date < today);
  }

  function render() {
    const out = document.getElementById('content-out');
    if (bucket === 'all-bookings') return renderAllBookings(out);

    let trips = allTrips.slice();
    if (bucket === 'upcoming') trips = trips.filter(t => !isPastTrip(t));
    else                       trips = trips.filter(t =>  isPastTrip(t));
    trips.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') * (bucket === 'upcoming' ? 1 : -1));

    // Standalone bookings = bookings without a trip. Show them on the Upcoming
    // tab so the user can see what they booked from /places without first
    // creating a trip — otherwise they'd appear nowhere on this default tab.
    const today = new Date().toISOString().slice(0, 10);
    const standaloneFilter = bucket === 'upcoming'
      ? (b => !b.trip_id && b.status !== 'cancelled' && (b.booking_date || '') >= today)
      : (b => !b.trip_id && (b.status === 'cancelled' || (b.booking_date || '') < today));
    const standalone = allBookings.filter(standaloneFilter)
      .sort((a, b) => (a.booking_date || '').localeCompare(b.booking_date || '') * (bucket === 'upcoming' ? 1 : -1));

    if (!trips.length && !standalone.length) {
      const msg = bucket === 'upcoming'
        ? { title: 'No upcoming trips', body: 'Create one to start planning bookings within its dates, or book a place from the Places page.', cta: 'Create a trip' }
        : { title: 'No past trips yet',  body: 'Completed and cancelled trips will appear here.',         cta: 'Create a trip' };
      out.innerHTML = '<div class="empty"><div class="empty-icon"></div>' +
        '<h3 class="empty-title">' + msg.title + '</h3>' +
        '<p class="empty-sub">' + msg.body + '</p>' +
        '<button class="btn btn-primary" id="empty-new-trip" style="margin-top:1rem">' + msg.cta + '</button>' +
        '<a class="btn btn-outline" href="/places" style="margin-top:1rem;margin-left:.5rem">Browse Places</a></div>';
      const btn = document.getElementById('empty-new-trip');
      if (btn) btn.addEventListener('click', () => openNewTripModal());
      return;
    }

    let html = '<div class="col gap-4">' + trips.map(t => tripCardHTML(t)).join('') + '</div>';
    if (standalone.length) {
      html +=
        '<div style="margin-top:2rem;padding-top:1.25rem;border-top:1px dashed hsla(0,0%,75%,.6)">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">' +
            '<h3 style="font-size:1.1rem;font-family:\'Sora\',sans-serif;color:var(--muted-foreground)">Standalone bookings</h3>' +
            '<span class="text-xs text-muted">Not linked to any trip</span>' +
          '</div>' +
          '<div class="col gap-3">' +
            standalone.map(b => standaloneBookingHTML(b)).join('') +
          '</div>' +
        '</div>';
    }

    out.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    out.querySelectorAll('[data-trip-id]').forEach(card => {
      const id = card.dataset.tripId;
      const t = allTrips.find(x => x.id === id);
      if (!t) return;
      const detailsBtn = card.querySelector('[data-act="details"]');
      const cancelBtn  = card.querySelector('[data-act="cancel"]');
      const deleteBtn  = card.querySelector('[data-act="delete"]');
      if (detailsBtn) detailsBtn.addEventListener('click', () => toggleDetails(card, t));
      if (cancelBtn)  cancelBtn.addEventListener('click', () => cancelTrip(t));
      if (deleteBtn)  deleteBtn.addEventListener('click', () => deleteTrip(t));
    });
    bindStandaloneActions(out);
  }

  // Standalone booking row (rendered both on the trips tabs and the All Bookings tab).
  function standaloneBookingHTML(b) {
    const isUnpaidPending = b.status === 'pending' && b.payment_status !== 'paid' && (b.total_price || 0) > 0;
    const isFinished = b.status === 'cancelled' || b.status === 'completed';
    return '<div class="booking-row-flat">' +
      '<div class="img">' + bookingImageHtml(b) + '</div>' +
      '<div>' +
        '<h3>' + escapeHtml(b.place_name) + '</h3>' +
        '<div class="meta">' + escapeHtml(b.booking_date) + (b.booking_time ? ' &middot; ' + escapeHtml(b.booking_time) : '') + (b.guests ? ' &middot; ' + b.guests + ' guest' + (b.guests > 1 ? 's' : '') : '') + '</div>' +
        '<div class="row gap-2" style="margin-top:.4rem;flex-wrap:wrap">' +
          '<span class="pill ' + pillClass(b.status) + '">' + escapeHtml(b.status) + '</span>' +
          (b.payment_status === 'paid' ? '<span class="pill pill-success">Paid</span>' : '') +
          (isUnpaidPending ? '<span class="pill pill-warning">Awaiting payment</span>' : '') +
          (b.total_price ? '<span class="pill">AED ' + b.total_price + '</span>' : '') +
          (b.confirmation_code ? '<span class="pill">' + escapeHtml(b.confirmation_code) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="actions">' +
        (isUnpaidPending ? '<button class="btn btn-primary" data-pay="' + escapeHtml(b.id) + '">Pay AED ' + b.total_price + '</button>' : '') +
        (isFinished
          ? '<button class="btn btn-ghost" data-delete-booking="' + escapeHtml(b.id) + '" style="color:var(--destructive)">Delete</button>'
          : '<button class="btn btn-ghost" data-cancel="' + escapeHtml(b.id) + '" style="color:var(--destructive)">Cancel</button>') +
      '</div>' +
    '</div>';
  }

  // Render a booking image with a graceful fallback to the ExploreX logo.
  function bookingImageHtml(b) {
    const fallback = '/logo.png';
    if (b.place_image) {
      return '<img src="' + escapeHtml(b.place_image) + '" alt="' + escapeHtml(b.place_name || '') + '" data-fallback="logo">';
    }
    return '<img src="' + fallback + '" alt="' + escapeHtml(b.place_name || '') + '" class="img-logo-fallback">';
  }

  // Wire pay/cancel/delete buttons on booking rows + apply image fallback.
  function bindStandaloneActions(out) {
    // Image error fallback — swap to logo if Unsplash etc. fails to load.
    out.querySelectorAll('img[data-fallback="logo"]').forEach(img => {
      img.addEventListener('error', () => {
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = '1';
        img.src = '/logo.png';
        img.classList.add('img-logo-fallback');
      });
    });

    out.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', async () => {
      const ok = await window.confirmModal({ title: 'Cancel booking?', message: 'This booking will be marked cancelled. You can still see it in your history.', danger: true, confirm: 'Cancel booking' });
      if (!ok) return;
      try {
        await window.db.entities.Booking.update(btn.dataset.cancel, { status: 'cancelled' });
        toast.success('It has been removed from your trip.', { title: 'Booking cancelled' });
        await reload();
      } catch (e) { toast.error(e.message, { title: 'Could not cancel' }); }
    }));
    out.querySelectorAll('[data-delete-booking]').forEach(btn => btn.addEventListener('click', async () => {
      const ok = await window.confirmModal({ title: 'Delete booking permanently?', message: 'This booking will be removed from your history. This cannot be undone.', danger: true, confirm: 'Delete forever' });
      if (!ok) return;
      try {
        await window.db.entities.Booking.remove(btn.dataset.deleteBooking);
        toast.success('Removed from your history.', { title: 'Deleted' });
        await reload();
      } catch (e) { toast.error(e.message, { title: 'Could not delete' }); }
    }));
    out.querySelectorAll('[data-pay]').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Redirecting…';
      try {
        const res = await window.db.billing.bookingCheckout(btn.dataset.pay);
        if (res && res.url) { window.location.href = res.url; return; }
        toast.error('Could not start payment', { title: 'Stripe unavailable' });
        btn.disabled = false;
      } catch (e) { toast.error(e.message, { title: 'Payment failed' }); btn.disabled = false; }
    }));
  }

  function tripCardHTML(t) {
    const past = isPastTrip(t);
    const bookings = allBookings.filter(b => b.trip_id === t.id);
    const totalCost = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (b.total_price || 0), 0);
    const cover = t.cover_image
      ? '<img src="' + escapeHtml(t.cover_image) + '" alt="" data-cover data-fallback="logo">'
      : '<img alt="" data-cover data-fallback="logo">';

    let statusPillClass = 'planned';
    if (t.status === 'active')    statusPillClass = 'active';
    if (t.status === 'completed') statusPillClass = 'completed';
    if (t.status === 'cancelled') statusPillClass = 'cancelled';

    const dest = (t.destination_city ? t.destination_city + ', ' : '') + t.destination_country;

    return '<div class="trip-card ' + (past ? 'past' : '') + '" data-trip-id="' + escapeHtml(t.id) + '">' +
      '<div class="cover">' +
        cover +
        '<div class="grad"></div>' +
        '<span class="status-pill ' + statusPillClass + '">' + escapeHtml(t.status) + '</span>' +
      '</div>' +
      '<div class="body">' +
        '<h3>' + escapeHtml(dest) + '</h3>' +
        '<div class="dates"><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ' + escapeHtml(t.start_date) + '  →  ' + escapeHtml(t.end_date) + '</div>' +
        '<div class="stats">' +
          '<span><span class="v">' + (t.travelers || 1) + '</span><span class="l">traveler' + ((t.travelers || 1) > 1 ? 's' : '') + '</span></span>' +
          '<span><span class="v">' + bookings.length + '</span><span class="l">booking' + (bookings.length === 1 ? '' : 's') + '</span></span>' +
          (totalCost ? '<span><span class="v">AED ' + totalCost + '</span><span class="l">est. cost</span></span>' : '') +
          (t.budget   ? '<span><span class="v">AED ' + t.budget + '</span><span class="l">budget</span></span>' : '') +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-outline" data-act="details">View details</button>' +
          (t.status !== 'cancelled' ? '<a class="btn btn-outline" href="/places?q=' + encodeURIComponent(t.destination_city || t.destination_country) + '">Add bookings</a>' : '') +
          // For active/upcoming trips: soft-cancel.
          // For already-cancelled / completed / past trips: permanently delete.
          (t.status === 'cancelled' || past
            ? '<button class="btn btn-ghost" data-act="delete" style="color:var(--destructive)">Delete</button>'
            : '<button class="btn btn-ghost" data-act="cancel" style="color:var(--destructive)">Cancel trip</button>') +
        '</div>' +
        '<div class="trip-details-slot"></div>' +
      '</div>' +
    '</div>';
  }

  // Lazily load a cover photo for trips that lack one
  function ensureCoverPhotos() {
    document.querySelectorAll('[data-cover]').forEach(async img => {
      if (img.src) return;
      const card = img.closest('[data-trip-id]');
      const t = allTrips.find(x => x.id === card.dataset.tripId);
      if (!t) return;
      try {
        const res = await window.db.integrations.photo((t.destination_city || '') + ' ' + t.destination_country);
        if (res && (res.url || res.thumb)) img.src = res.url || res.thumb;
      } catch (e) { /* ignore */ }
    });
  }
  // Run after each render
  const _origRender = render;
  // (Hook into the real render by overriding the var name, simpler: just call after innerHTML set)

  function toggleDetails(cardEl, trip) {
    const slot = cardEl.querySelector('.trip-details-slot');
    if (!slot) return;
    if (slot.dataset.open === '1') {
      slot.innerHTML = '';
      slot.dataset.open = '0';
      return;
    }
    const bookings = allBookings.filter(b => b.trip_id === trip.id).sort((a, b) => (a.booking_date || '').localeCompare(b.booking_date || ''));
    if (!bookings.length) {
      slot.innerHTML = '<div class="trip-bookings-list"><p class="text-muted text-sm">No bookings yet for this trip. Browse <a href="/places?q=' + encodeURIComponent(trip.destination_city || trip.destination_country) + '" style="color:var(--primary);text-decoration:underline">Places</a> to add some.</p></div>';
    } else {
      slot.innerHTML = '<div class="trip-bookings-list">' +
        bookings.map(b => {
          const isFinished = b.status === 'cancelled' || b.status === 'completed';
          return '<div class="trip-booking-row">' +
            '<span class="when">' + escapeHtml(b.booking_date) + (b.booking_time ? ' ' + b.booking_time : '') + '</span>' +
            '<span class="name">' + escapeHtml(b.place_name) + '</span>' +
            '<span class="pill ' + pillClass(b.status) + '">' + escapeHtml(b.status) + '</span>' +
            (b.total_price ? '<span class="price">AED ' + b.total_price + '</span>' : '') +
            (isFinished
              ? '<button class="btn btn-ghost" data-delete-trip-booking="' + escapeHtml(b.id) + '" style="color:var(--destructive);padding:.4rem .75rem" title="Delete permanently">×</button>'
              : '<button class="btn btn-ghost" data-cancel-booking="' + escapeHtml(b.id) + '" style="color:var(--destructive);padding:.4rem .75rem" title="Cancel">×</button>') +
          '</div>';
        }).join('') +
      '</div>';
      slot.querySelectorAll('[data-cancel-booking]').forEach(btn => btn.addEventListener('click', async () => {
        const ok = await window.confirmModal({ title: 'Cancel booking?', message: 'This booking will be marked cancelled.', danger: true, confirm: 'Cancel booking' });
        if (!ok) return;
        try {
          await window.db.entities.Booking.update(btn.dataset.cancelBooking, { status: 'cancelled' });
          toast.success('It has been removed from your trip.', { title: 'Booking cancelled' });
          await reload();
        } catch (e) { toast.error(e.message, { title: 'Could not cancel' }); }
      }));
      slot.querySelectorAll('[data-delete-trip-booking]').forEach(btn => btn.addEventListener('click', async () => {
        const ok = await window.confirmModal({ title: 'Delete booking permanently?', message: 'This booking will be removed from your history. This cannot be undone.', danger: true, confirm: 'Delete forever' });
        if (!ok) return;
        try {
          await window.db.entities.Booking.remove(btn.dataset.deleteTripBooking);
          toast.success('Removed from your history.', { title: 'Deleted' });
          await reload();
        } catch (e) { toast.error(e.message, { title: 'Could not delete' }); }
      }));
    }
    slot.dataset.open = '1';
  }

  async function cancelTrip(trip) {
    const ok = await window.confirmModal({
      title: 'Cancel trip to ' + trip.destination_country + '?',
      message: 'This will cancel the trip AND mark its bookings as cancelled. You will not be able to re-create the same trip dates for 24 hours.',
      danger: true, confirm: 'Cancel trip',
    });
    if (!ok) return;
    try {
      await window.db.trips.cancel(trip.id);
      toast.success('Bookings inside it are also cancelled.', { title: 'Trip cancelled' });
      await reload();
    } catch (e) { toast.error(e.message, { title: 'Could not cancel' }); }
  }

  // Permanent delete — used for past or already-cancelled trips. Removes the
  // trip and ALL of its child bookings from the database. Cannot be undone.
  async function deleteTrip(trip) {
    const ok = await window.confirmModal({
      title: 'Delete this trip permanently?',
      message: 'The trip and all of its bookings will be deleted forever. This cannot be undone.',
      danger: true, confirm: 'Delete forever',
    });
    if (!ok) return;
    try {
      await window.db.trips.remove(trip.id);
      toast.success('Trip and bookings removed from your history.', { title: 'Deleted' });
      await reload();
    } catch (e) { toast.error(e.message, { title: 'Could not delete' }); }
  }

  function renderAllBookings(out) {
    if (!allBookings.length) {
      out.innerHTML = '<div class="empty"><div class="empty-icon"></div><h3 class="empty-title">No bookings yet</h3><p class="empty-sub">Add some from the Places page.</p><a class="btn btn-primary" href="/places" style="margin-top:1rem">Browse Places</a></div>';
      return;
    }
    out.innerHTML = '<div class="col gap-3">' + allBookings.map(b => {
      const trip = allTrips.find(t => t.id === b.trip_id);
      const isUnpaidPending = b.status === 'pending' && b.payment_status !== 'paid' && (b.total_price || 0) > 0;
      const isFinished = b.status === 'cancelled' || b.status === 'completed';
      return '<div class="booking-row-flat">' +
        '<div class="img">' + bookingImageHtml(b) + '</div>' +
        '<div>' +
          '<h3>' + escapeHtml(b.place_name) + '</h3>' +
          '<div class="meta">' + escapeHtml(b.booking_date) + (b.booking_time ? ' &middot; ' + escapeHtml(b.booking_time) : '') + (b.guests ? ' &middot; ' + b.guests + ' guest' + (b.guests > 1 ? 's' : '') : '') + (trip ? ' &middot; Trip: ' + escapeHtml(trip.destination_country) : '') + '</div>' +
          '<div class="row gap-2" style="margin-top:.4rem;flex-wrap:wrap">' +
            '<span class="pill ' + pillClass(b.status) + '">' + escapeHtml(b.status) + '</span>' +
            (b.payment_status === 'paid' ? '<span class="pill pill-success">Paid</span>' : '') +
            (isUnpaidPending ? '<span class="pill pill-warning">Awaiting payment</span>' : '') +
            (b.total_price ? '<span class="pill">AED ' + b.total_price + '</span>' : '') +
            (b.confirmation_code ? '<span class="pill">' + escapeHtml(b.confirmation_code) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          (isUnpaidPending ? '<button class="btn btn-primary" data-pay="' + escapeHtml(b.id) + '">Pay AED ' + b.total_price + '</button>' : '') +
          (isFinished
            ? '<button class="btn btn-ghost" data-delete-booking="' + escapeHtml(b.id) + '" style="color:var(--destructive)">Delete</button>'
            : '<button class="btn btn-ghost" data-cancel="' + escapeHtml(b.id) + '" style="color:var(--destructive)">Cancel</button>') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
    bindStandaloneActions(out);
  }

  /* ── New Trip modal ─────────────────────────────────────────────────────── */
  function openNewTripModal(prefill) {
    prefill = prefill || {};
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const prefs = window.userPreferences || {};
    const defaultTravelers = prefs.default_travelers || 1;
    const defaultDays = prefs.default_trip_duration_days || 1;
    const defaultEnd = new Date(Date.now() + 86400000 * Math.max(1, defaultDays)).toISOString().slice(0, 10);
    const currency = prefs.currency_display || 'AED';
    const html =
      '<div class="modal-head"><h2 class="modal-title">Plan a new trip</h2><button class="modal-close" data-close>&times;</button></div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label class="field-label">Country</label><input id="t-country" class="field-input" placeholder="e.g. France" value="' + escapeHtml(prefill.destination_country || '') + '"></div>' +
        '<div class="field"><label class="field-label">City (optional)</label><input id="t-city" class="field-input" placeholder="e.g. Paris"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label class="field-label">Start date</label><input id="t-start" type="date" class="field-input" min="' + today + '" value="' + tomorrow + '"></div>' +
        '<div class="field"><label class="field-label">End date</label><input id="t-end" type="date" class="field-input" min="' + today + '" value="' + defaultEnd + '"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label class="field-label">Travelers</label><input id="t-travelers" type="number" min="1" max="20" value="' + defaultTravelers + '" class="field-input"></div>' +
        '<div class="field"><label class="field-label">Budget ' + escapeHtml(currency) + ' (optional)</label><input id="t-budget" type="number" min="0" placeholder="0" class="field-input"></div>' +
      '</div>' +
      '<div class="field"><label class="field-label">Notes (optional)</label><input id="t-notes" class="field-input" placeholder="Anniversary trip, work conference, etc."></div>' +
      '<div id="t-error" class="hidden" style="padding:.7rem 1rem;border-radius:10px;background:hsla(0,84%,60%,.1);color:var(--destructive);font-size:.85rem;margin-bottom:1rem"></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close>Cancel</button>' +
        '<button class="btn btn-primary" id="t-create">Create trip</button>' +
      '</div>';
    const m = openModal(html);
    m.root.querySelector('.modal').classList.add('modal-wide-trip');

    const startEl = m.root.querySelector('#t-start');
    const endEl   = m.root.querySelector('#t-end');
    startEl.addEventListener('change', () => {
      if (startEl.value && endEl.value && endEl.value < startEl.value) endEl.value = startEl.value;
      endEl.min = startEl.value || today;
    });

    m.root.querySelector('#t-create').addEventListener('click', async () => {
      const country = m.root.querySelector('#t-country').value.trim();
      const city    = m.root.querySelector('#t-city').value.trim();
      const start   = startEl.value;
      const end     = endEl.value;
      const trav    = +m.root.querySelector('#t-travelers').value || 1;
      const budget  = +m.root.querySelector('#t-budget').value || 0;
      const notes   = m.root.querySelector('#t-notes').value.trim();
      const errEl   = m.root.querySelector('#t-error');
      errEl.classList.add('hidden');
      if (!country) { errEl.textContent = 'Country is required'; errEl.classList.remove('hidden'); return; }
      if (!start || !end) { errEl.textContent = 'Both dates are required'; errEl.classList.remove('hidden'); return; }
      if (end < start)   { errEl.textContent = 'End date must be on or after the start date'; errEl.classList.remove('hidden'); return; }
      const btn = m.root.querySelector('#t-create');
      btn.disabled = true; btn.textContent = 'Creating…';

      // Try to fetch a cover photo asynchronously (don't block creation if it fails)
      let cover_image = '';
      try {
        const ph = await window.db.integrations.photo((city || '') + ' ' + country);
        if (ph && (ph.url || ph.thumb)) cover_image = ph.url || ph.thumb;
      } catch (e) { /* ignore */ }

      try {
        await window.db.trips.create({
          destination_country: country,
          destination_city:    city,
          start_date:          start,
          end_date:            end,
          travelers:           trav,
          budget,
          notes,
          cover_image,
        });
        toast.success('+50 points earned for planning a trip.', { title: 'Trip created!', duration: 5000 });
        m.close();
        await reload();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Create trip';
        if (e.status === 409) {
          errEl.textContent = e.message;
          errEl.classList.remove('hidden');
        } else if (e.status === 429) {
          errEl.textContent = e.message;
          errEl.classList.remove('hidden');
        } else {
          toast.error(e.message);
        }
      }
    });
  }

  function pillClass(s) {
    return s === 'confirmed' ? 'pill-success'
      : s === 'pending'      ? 'pill-warning'
      : s === 'cancelled'    ? 'pill-danger'
      : s === 'completed'    ? 'pill-primary'
      : '';
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }
})();

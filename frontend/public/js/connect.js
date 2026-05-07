/* ═══════════════════════════════════════════════════════════════════════════
   Connect page — discover, requests, connections, trip invites
   Bug fixes:
   - Use list() (no filter) to fetch all connections so receiver sees them
   - Accept/Reject correctly mutate status and refresh both inboxes
   - Invite-to-Trip only available for accepted connections
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let me, allUsers = [], allConnections = [], allInvites = [], myBookings = [];
  let activeTab = 'discover';

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;
    await reload();
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeTab = t.dataset.tab;
      renderTab();
    }));
  });

  async function reload() {
    try {
      const [users, connections, invites, bookings] = await Promise.all([
        db.entities.User.list(),
        db.entities.Connection.list('-created_date', 500),
        db.entities.TripInvite.list('-created_date', 500),
        db.entities.Booking.filter({ created_by: me.email }, '-booking_date', 100),
      ]);
      allUsers = users;
      allConnections = connections;
      allInvites = invites;
      myBookings = bookings;
      updateBadges();
      renderTab();
    } catch (e) { toast.error(e.message); }
  }

  function updateBadges() {
    const reqs = allConnections.filter(c => c.to_user === me.email && c.status === 'pending').length;
    const inv  = allInvites.filter(i => i.invitee_email === me.email && i.status === 'pending').length;
    const r = document.getElementById('cnt-requests');
    const v = document.getElementById('cnt-invites');
    if (reqs) { r.textContent = reqs; r.classList.remove('hidden'); } else r.classList.add('hidden');
    if (inv)  { v.textContent = inv;  v.classList.remove('hidden'); } else v.classList.add('hidden');
  }

  function initials(n) { return (n || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(); }

  function getRelation(otherEmail) {
    const c = allConnections.find(c =>
      (c.from_user === me.email && c.to_user === otherEmail) ||
      (c.to_user === me.email && c.from_user === otherEmail)
    );
    return c ? { id: c.id, status: c.status, sent: c.from_user === me.email } : null;
  }

  function renderTab() {
    const c = document.getElementById('tab-content');
    if (activeTab === 'discover') {
      const others = allUsers.filter(u => u.email !== me.email);
      if (!others.length) { c.innerHTML = empty('No other users yet', 'Invite people to join ExploreX.'); return; }
      c.innerHTML = '<div class="user-grid">' + others.map(u => {
        const rel = getRelation(u.email);
        let action;
        if (!rel) action = '<button class="btn btn-primary" data-act="connect" data-email="' + u.email + '" data-name="' + (u.full_name || '') + '">Connect</button>';
        else if (rel.status === 'pending' && rel.sent) action = '<button class="btn btn-outline" disabled>Request sent</button>';
        else if (rel.status === 'pending') action = '<button class="btn btn-primary" data-act="accept" data-id="' + rel.id + '">Accept request</button>';
        else if (rel.status === 'accepted') action = '<a class="btn btn-outline" href="/chat?with=' + encodeURIComponent(u.email) + '">Chat</a>';
        else action = '<button class="btn btn-ghost" disabled>Declined</button>';
        const tripBadge = travelBadgeFor(u);
        return `
          <div class="user-card">
            <div class="user-avatar">${initials(u.full_name || u.email)}</div>
            <div class="user-info">
              <div class="nm">${u.full_name || 'Explorer'}</div>
              <div class="em">${u.email}</div>
              ${tripBadge}
              <div class="bio">${u.bio || u.home_city || 'No bio yet.'}</div>
            </div>
            <div class="user-actions">${action}</div>
          </div>`;
      }).join('') + '</div>';
    }
    else if (activeTab === 'requests') {
      const incoming = allConnections.filter(c => c.to_user === me.email && c.status === 'pending');
      if (!incoming.length) { c.innerHTML = empty('No pending requests', 'You will see incoming connection requests here.'); return; }
      c.innerHTML = '<div class="col gap-3">' + incoming.map(r => `
        <div class="user-card">
          <div class="user-avatar">${initials(r.from_name || r.from_user)}</div>
          <div class="user-info">
            <div class="nm">${r.from_name || 'Explorer'}</div>
            <div class="em">${r.from_user}</div>
            ${r.message ? '<div class="bio">"' + r.message + '"</div>' : ''}
          </div>
          <div class="user-actions">
            <button class="btn btn-primary" data-act="respond" data-id="${r.id}" data-status="accepted">Accept</button>
            <button class="btn btn-ghost" data-act="respond" data-id="${r.id}" data-status="declined">Decline</button>
          </div>
        </div>`).join('') + '</div>';
    }
    else if (activeTab === 'connections') {
      const accepted = allConnections.filter(c => c.status === 'accepted' && (c.from_user === me.email || c.to_user === me.email));
      if (!accepted.length) { c.innerHTML = empty('No connections yet', 'Send a request from the Discover tab.'); return; }
      c.innerHTML = '<div class="user-grid">' + accepted.map(con => {
        const other = con.from_user === me.email ? { email: con.to_user, name: con.to_name } : { email: con.from_user, name: con.from_name };
        const otherFull = allUsers.find(u => u.email === other.email);
        const tripBadge = otherFull ? travelBadgeFor(otherFull) : '';
        return `
          <div class="user-card">
            <div class="user-avatar">${initials(other.name || other.email)}</div>
            <div class="user-info">
              <div class="nm">${other.name || 'Explorer'}</div>
              <div class="em">${other.email}</div>
              ${tripBadge}
            </div>
            <div class="user-actions">
              <a class="btn btn-outline" href="/chat?with=${encodeURIComponent(other.email)}">Chat</a>
              <button class="btn btn-primary" data-act="invite" data-email="${other.email}" data-name="${other.name || ''}">Invite to trip</button>
            </div>
          </div>`;
      }).join('') + '</div>';
    }
    else if (activeTab === 'invites') {
      const myInv = allInvites.filter(i => i.invitee_email === me.email && i.status === 'pending');
      if (!myInv.length) { c.innerHTML = empty('No trip invites', 'Friends can invite you to join their trips here.'); return; }
      c.innerHTML = '<div class="col gap-3">' + myInv.map(i => `
        <div class="user-card">
          <div class="user-avatar">TR</div>
          <div class="user-info">
            <div class="nm">${i.trip_name}</div>
            <div class="em">${i.inviter_name || i.inviter_email}${i.trip_dates ? ' &middot; ' + i.trip_dates : ''}</div>
            ${i.message ? '<div class="bio">"' + i.message + '"</div>' : ''}
          </div>
          <div class="user-actions">
            <button class="btn btn-primary" data-act="invite-respond" data-id="${i.id}" data-status="accepted">Accept</button>
            <button class="btn btn-ghost" data-act="invite-respond" data-id="${i.id}" data-status="declined">Decline</button>
          </div>
        </div>`).join('') + '</div>';
    }

    // Wire all action buttons in the rendered content
    document.querySelectorAll('#tab-content [data-act]').forEach(btn => btn.addEventListener('click', handleAction));
  }

  function empty(title, sub) {
    return '<div class="empty"><div class="empty-icon"></div><h3 class="empty-title">' + title + '</h3><p class="empty-sub">' + sub + '</p></div>';
  }

  function travelBadgeFor(u) {
    const t = u.active_trip || u.upcoming_trip;
    if (!t) return '';
    const dest = (t.destination_city ? t.destination_city + ', ' : '') + t.destination_country;
    const label = u.active_trip ? 'Traveling to' : 'Planning trip to';
    return '<div style="margin-top:.35rem;display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border-radius:9999px;background:hsla(180,24%,53%,.12);color:var(--primary);font-size:.7rem;font-weight:500"><span>✈</span> ' + label + ': <strong>' + escapeHtml(dest) + '</strong></div>';
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  async function handleAction(e) {
    const btn = e.currentTarget;
    const act = btn.dataset.act;
    btn.disabled = true;
    try {
      if (act === 'connect') {
        const message = prompt('Add a message (optional):', 'Hi! Let\'s connect on ExploreX.');
        if (message === null) { btn.disabled = false; return; }
        await db.entities.Connection.create({
          from_user: me.email, from_name: me.full_name,
          to_user:   btn.dataset.email, to_name: btn.dataset.name,
          message: message || '',
          status: 'pending',
        });
        toast.success('Request sent');
        await reload();
      }
      else if (act === 'respond') {
        await db.entities.Connection.update(btn.dataset.id, { status: btn.dataset.status });
        toast.success(btn.dataset.status === 'accepted' ? 'Connected!' : 'Declined');
        await reload();
      }
      else if (act === 'accept') {
        await db.entities.Connection.update(btn.dataset.id, { status: 'accepted' });
        toast.success('Connected!');
        await reload();
      }
      else if (act === 'invite') {
        openInviteModal(btn.dataset.email, btn.dataset.name);
        btn.disabled = false;
      }
      else if (act === 'invite-respond') {
        await db.entities.TripInvite.update(btn.dataset.id, { status: btn.dataset.status });
        toast.success(btn.dataset.status === 'accepted' ? 'Invite accepted' : 'Invite declined');
        await reload();
      }
    } catch (err) {
      toast.error(err.message);
      btn.disabled = false;
    }
  }

  function openInviteModal(email, name) {
    const upcoming = myBookings.filter(b => b.status !== 'cancelled' && new Date(b.booking_date) >= new Date(new Date().toDateString()));
    const html = `
      <div class="modal-head">
        <h2 class="modal-title">Invite ${name || email} to a trip</h2>
        <button class="modal-close" data-close>&times;</button>
      </div>
      <div class="field">
        <label class="field-label">Trip name</label>
        <input id="iv-name" class="field-input" placeholder="e.g. Weekend in Paris" required>
      </div>
      <div class="field">
        <label class="field-label">Trip dates (optional)</label>
        <input id="iv-dates" class="field-input" placeholder="e.g. May 12 - May 15">
      </div>
      ${upcoming.length ? `
        <div class="field">
          <label class="field-label">Link an existing booking (optional)</label>
          <select id="iv-booking" class="field-select">
            <option value="">No booking</option>
            ${upcoming.map(b => '<option value="' + b.id + '">' + b.place_name + ' &middot; ' + b.booking_date + '</option>').join('')}
          </select>
        </div>` : ''}
      <div class="field">
        <label class="field-label">Message</label>
        <textarea id="iv-msg" class="field-textarea" placeholder="Want to join?"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="iv-send">Send invite</button>
      </div>`;
    const m = openModal(html);
    document.getElementById('iv-send').addEventListener('click', async () => {
      const tripName = document.getElementById('iv-name').value.trim();
      if (!tripName) return toast.error('Trip name required');
      try {
        const bookingSel = document.getElementById('iv-booking');
        await db.entities.TripInvite.create({
          trip_name: tripName,
          trip_id: bookingSel ? bookingSel.value : '',
          inviter_email: me.email,
          inviter_name:  me.full_name,
          invitee_email: email,
          status: 'pending',
          booking_ids: bookingSel && bookingSel.value ? [bookingSel.value] : [],
          trip_dates: document.getElementById('iv-dates').value,
          message: document.getElementById('iv-msg').value,
        });
        toast.success('Invite sent');
        m.close();
        await reload();
      } catch (e) { toast.error(e.message); }
    });
  }
})();

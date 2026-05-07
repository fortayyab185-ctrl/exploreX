/* ═══════════════════════════════════════════════════════════════════════════
   Favorites page — list saved places + personalized recommendations
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  let me;

  document.addEventListener('app:ready', async (e) => {
    me = e.detail.user;
    await Promise.all([loadFavorites(), loadRecs()]);
  });

  async function loadFavorites() {
    const out = document.getElementById('favs-out');
    try {
      const items = await db.entities.Favorite.filter({ created_by: me.email }, '-created_date', 100);
      if (!items.length) {
        out.innerHTML = `
          <div class="empty">
            <div class="empty-icon"></div>
            <h3 class="empty-title">No favorites yet</h3>
            <p class="empty-sub">Tap the heart icon on any place to save it here.</p>
            <a class="btn btn-primary" href="/place" style="margin-top:1rem">Browse places</a>
          </div>`;
        return;
      }
      out.innerHTML = '<div class="fav-grid">' + items.map(f => `
        <div class="fav-card" data-id="${f.id}" data-pid="${f.place_id}">
          <button class="heart" data-act="unfav" title="Remove">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" width="18" height="18">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          <div class="img">${f.place_image ? '<img src="' + f.place_image + '" alt="">' : ''}</div>
          <div class="body">
            <h3>${escapeHtml(f.place_name)}</h3>
            <div class="meta">${f.city || ''}${f.country ? ', ' + f.country : ''} &middot; ${f.place_type || ''}</div>
            <div class="actions">
              <a class="btn btn-primary" href="/place?city=${encodeURIComponent(f.city || '')}" style="flex:1">Book</a>
              <a class="btn btn-outline" href="/weather?city=${encodeURIComponent(f.city || '')}">Weather</a>
            </div>
          </div>
        </div>`).join('') + '</div>';
      out.querySelectorAll('[data-act="unfav"]').forEach(b => b.addEventListener('click', async () => {
        const id = b.closest('[data-id]').dataset.id;
        try { await db.entities.Favorite.remove(id); toast.success('Removed'); loadFavorites(); loadRecs(); }
        catch (e) { toast.error(e.message); }
      }));
    } catch (e) { out.innerHTML = '<p class="text-muted">' + e.message + '</p>'; }
  }

  async function loadRecs() {
    const out = document.getElementById('recs-out');
    try {
      const { items, based_on } = await db.integrations.recommendations(6);
      if (!items.length) { out.innerHTML = '<p class="text-muted text-sm">No recommendations yet. Save some favorites or set interests in your profile.</p>'; return; }
      const subline = based_on.interests && based_on.interests.length
        ? 'Matched to your interests: ' + based_on.interests.slice(0, 4).join(', ')
        : '';
      out.innerHTML = (subline ? '<p class="text-tiny text-muted" style="margin-bottom:1rem">' + subline + '</p>' : '') +
        '<div class="fav-grid">' + items.map(p => `
          <div class="fav-card">
            <div class="img">${p.image_url ? '<img src="' + p.image_url + '" alt="">' : ''}</div>
            <div class="body">
              <h3>${escapeHtml(p.name)}</h3>
              <div class="meta">${p.city || ''}${p.country ? ', ' + p.country : ''} &middot; ${p.type}${p.rating ? ' &middot; * ' + p.rating : ''}</div>
              <div class="actions"><a class="btn btn-primary" href="/place?city=${encodeURIComponent(p.city || '')}" style="flex:1">View</a></div>
            </div>
          </div>`).join('') + '</div>';
    } catch (e) { out.innerHTML = '<p class="text-muted text-sm">' + e.message + '</p>'; }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"\']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
})();

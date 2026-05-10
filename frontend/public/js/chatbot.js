

(function () {
  'use strict';

  function init(user) {
    if (!user) return;
    if (document.getElementById('travel-bot-fab')) return; 

    const isMember = window.db.hasPlan(user, 'medium');

    const fab = document.createElement('button');
    fab.id = 'travel-bot-fab';
    fab.className = 'tb-fab';
    fab.title = isMember ? 'Travel assistant' : 'Travel assistant (Pro plan)';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="22" height="22"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'travel-bot-panel';
    panel.className = 'tb-panel hidden';
    panel.innerHTML = renderPanel(user, isMember);
    document.body.appendChild(panel);

    fab.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) scrollChatToBottom();
    });

    if (isMember) wireChat(user);
  }

  function renderPanel(user, isMember) {
    const head = `
      <div class="tb-head">
        <div>
          <div class="tb-name">Travel Assistant</div>
          <div class="tb-sub">${isMember ? 'Powered by AI - ask me anything' : 'Available on Pro and Max plans'}</div>
        </div>
        <button class="tb-close" id="tb-close" aria-label="Close">&times;</button>
      </div>`;

    if (!isMember) {
      return head + `
        <div class="tb-gate">
          <div class="tb-gate-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <h3>Unlock the AI travel assistant</h3>
          <p>Get instant, personalized answers about destinations, weather, food, and your trip - 24/7.</p>
          <a class="btn btn-primary" href="/pricing">View plans</a>
          ${user.trial_used ? '' : '<button class="btn btn-outline" id="tb-trial">Start free trial</button>'}
        </div>`;
    }

    return head + `
      <div class="tb-msgs" id="tb-msgs"></div>
      <form class="tb-input" id="tb-input">
        <input id="tb-text" placeholder="Ask about destinations, weather, food..." autocomplete="off">
        <button class="tb-send" type="submit" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>`;
  }

  function storageKey(user) { return 'tb_history_' + (user && user.email || 'guest'); }

  function loadHistory(user) {
    try { return JSON.parse(localStorage.getItem(storageKey(user)) || '[]'); }
    catch (_) { return []; }
  }
  function saveHistory(user, msgs) {
    try { localStorage.setItem(storageKey(user), JSON.stringify(msgs.slice(-30))); } catch (_) {}
  }

  function wireChat(user) {
    const msgsEl = document.getElementById('tb-msgs');
    const form   = document.getElementById('tb-input');
    const input  = document.getElementById('tb-text');
    const close  = document.getElementById('tb-close');

    let history = loadHistory(user);
    if (!history.length) {
      history.push({ role: 'ai', text: 'Hi ' + ((user.full_name || '').split(' ')[0] || 'there') + '! I am your travel assistant. Ask me about places, weather, what to pack, or tips for any city.' });
    }
    renderMsgs();

    close.addEventListener('click', () => document.getElementById('travel-bot-panel').classList.add('hidden'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      history.push({ role: 'user', text });
      renderMsgs(); saveHistory(user, history);
      pushTyping();
      try {
        const reply = await window.db.integrations.chat(history.slice(-10));
        popTyping();
        history.push({ role: 'ai', text: reply });
        renderMsgs(); saveHistory(user, history);
      } catch (err) {
        popTyping();
        history.push({ role: 'ai', text: 'Sorry, I had trouble: ' + err.message });
        renderMsgs();
      }
    });

    function renderMsgs() {
      msgsEl.innerHTML = history.map(m => '<div class="tb-msg tb-msg-' + m.role + '">' + escape(m.text).replace(/\n/g, '<br>') + '</div>').join('');
      scrollChatToBottom();
    }
    function pushTyping() {
      const d = document.createElement('div');
      d.className = 'tb-msg tb-msg-ai tb-typing';
      d.id = 'tb-typing';
      d.innerHTML = '<span></span><span></span><span></span>';
      msgsEl.appendChild(d);
      scrollChatToBottom();
    }
    function popTyping() {
      const d = document.getElementById('tb-typing');
      if (d) d.remove();
    }
  }

  function scrollChatToBottom() {
    const m = document.getElementById('tb-msgs');
    if (m) m.scrollTop = m.scrollHeight;
  }
  function escape(s) {
    return (s || '').replace(/[&<>"\']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'tb-trial') {
      try {
        await window.db.auth.startTrial();
        window.toast && toast.success('Trial started');
        setTimeout(() => location.reload(), 700);
      } catch (err) { window.toast && toast.error(err.message); }
    }
  });

  
  document.addEventListener('app:ready', (e) => init(e.detail.user));
})();

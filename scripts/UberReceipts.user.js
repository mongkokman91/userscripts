// ==UserScript==
// @name         UberReceipts
// @namespace    http://tampermonkey.net/
// @version      4.1
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/UberReceipts.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/UberReceipts.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/UberReceipts.user.js
// @description  Downloads all Uber receipts — fast polling + authenticated fetch for valid PDFs
// @author       You
// @match        https://riders.uber.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  // ── Timeouts (ms) — how long to wait before giving up ──────────
  const TO_PAGE   = 8000;  // max wait for trip page elements to appear
  const TO_MODAL  = 6000;  // max wait for modal + Download PDF anchor
  const T_DL      = 800;   // pause between triggering downloads (much shorter)
  const POLL      = 150;   // polling interval

  const Q = 'ur_queue';
  const R = 'ur_results';
  const D = 'ur_done';

  const log  = (...a) => console.log('[UR]', ...a);
  const path = location.pathname;
  log('Loaded:', path);

  if (/^\/trips\/?$/.test(path))             listPage();
  else if (/^\/trips\/[\w-]{10,}/.test(path)) tripPage();

  // ══════════════════════════════════════════════════════════════
  // POLL HELPERS
  // ══════════════════════════════════════════════════════════════

  // Resolve with el as soon as predicate(el) is truthy, or reject after timeout
  function waitFor(predicate, timeout = TO_PAGE) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      (function check() {
        const el = predicate();
        if (el) return resolve(el);
        if (Date.now() > deadline) return reject(new Error('waitFor timeout'));
        setTimeout(check, POLL);
      })();
    });
  }

  function findBtn(phrases) {
    const all = [...document.querySelectorAll('button,a,[role=button],span[role=button]')];
    for (const e of all) {
      const t = e.innerText?.trim().toLowerCase();
      if (phrases.includes(t)) return e;
    }
    for (const e of all) {
      const t = e.innerText?.trim().toLowerCase();
      if (phrases.some(p => t?.startsWith(p))) return e;
    }
    for (const e of all) {
      const t = e.innerText?.trim().toLowerCase();
      if (phrases.some(p => t?.includes(p))) return e;
    }
    return null;
  }

  // Intercept fetch/XHR to catch the PDF URL Uber constructs at click-time.
  // Resolves with the absolute PDF URL, or rejects after timeout ms.
  function interceptPdfUrl(timeout = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { restore(); reject(new Error('PDF URL intercept timeout')); }, timeout);
      const origFetch = window.fetch;
      const origOpen  = XMLHttpRequest.prototype.open;

      function restore() {
        window.fetch = origFetch;
        XMLHttpRequest.prototype.open = origOpen;
      }

      function capture(url) {
        const s = typeof url === 'string' ? url : (url?.toString?.() ?? '');
        if (/receipt.*contentType=PDF|receipt.*pdf/i.test(s) || /\.pdf(\?|$)/i.test(s)) {
          clearTimeout(timer);
          restore();
          const abs = s.startsWith('http') ? s : `https://riders.uber.com${s}`;
          log('Intercepted PDF URL:', abs);
          resolve(abs);
          return true;
        }
        return false;
      }

      window.fetch = function (input, init) {
        if (!capture(input)) return origFetch.apply(this, arguments);
        origFetch.apply(this, arguments); // let Uber's request run too
        return Promise.resolve(new Response('', { status: 200 }));
      };

      XMLHttpRequest.prototype.open = function (method, url) {
        capture(url);
        return origOpen.apply(this, arguments);
      };
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ══════════════════════════════════════════════════════════════
  // LIST PAGE
  // ══════════════════════════════════════════════════════════════
  function listPage() {
    GM_setValue(Q, '[]');
    GM_setValue(R, '{}');
    GM_setValue(D, '');

    const s = document.createElement('style');
    s.textContent = `
      #ur-btn{position:fixed;bottom:28px;right:28px;z-index:99999;background:#06C167;
        color:#000;font-weight:700;font-size:14px;font-family:system-ui,sans-serif;
        padding:12px 22px;border-radius:50px;border:none;cursor:pointer;
        box-shadow:0 4px 20px rgba(0,0,0,.4);display:flex;align-items:center;
        gap:8px;user-select:none;transition:background .15s,transform .1s;}
      #ur-btn:hover{background:#05a857;transform:scale(1.03)}
      #ur-btn:active{transform:scale(.97)}
      #ur-btn:disabled{background:#444;color:#888;cursor:not-allowed;transform:none}
      #ur-status{position:fixed;bottom:86px;right:28px;z-index:99999;background:#1a1a1a;
        color:#e5e5e5;font-size:13px;font-family:system-ui,sans-serif;padding:10px 16px;
        border-radius:10px;border:1px solid #333;max-width:300px;display:none;
        line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,.5);}
    `;
    document.head.appendChild(s);

    const btn = document.createElement('button');
    btn.id = 'ur-btn';
    btn.textContent = '📥 Download All Receipts';
    document.body.appendChild(btn);

    const box = document.createElement('div');
    box.id = 'ur-status';
    document.body.appendChild(box);

    const say = (h, show = true) => { box.innerHTML = h; box.style.display = show ? 'block' : 'none'; };

    if (GM_getValue(D, '') === 'yes') {
      const prev = JSON.parse(GM_getValue(R, '{}'));
      const ok   = Object.values(prev).filter(v => v === 'ok').length;
      const fail = Object.values(prev).filter(v => v === 'fail').length;
      say(`🎉 <b>Last run:</b> ${ok} downloaded${fail ? `, ${fail} failed` : ''}`);
      GM_setValue(D, '');
    }

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Working…';
      say('🔍 Scanning trips…');

      // Click "Load More" until it disappears, using polling instead of fixed sleep
      for (let i = 0; i < 30; i++) {
        const more = [...document.querySelectorAll('button,a,[role=button]')]
          .find(e => /load more|show more|see more trips/i.test(e.innerText?.trim()));
        if (!more) break;
        say(`⏳ Loading more… (${i + 1})`);
        const prevCount = document.querySelectorAll('[href*="/trips/"]').length;
        more.click();
        // Poll until new trips appear (or 3s timeout)
        await waitFor(() => document.querySelectorAll('[href*="/trips/"]').length > prevCount, 3000)
          .catch(() => null);
      }

      const ids = new Set();
      document.querySelectorAll('[href*="/trips/"]').forEach(el => {
        const m = (el.href || el.getAttribute('href') || '').match(/\/trips\/([\w-]{10,})/);
        if (m) ids.add(m[1]);
      });

      if (!ids.size) {
        say('❌ No trips found.');
        btn.disabled = false;
        btn.textContent = '📥 Download All Receipts';
        return;
      }

      const list = [...ids];
      say(`✅ Found <b>${list.length}</b> trips — downloading…`);
      GM_setValue(Q, JSON.stringify(list));
      GM_setValue(R, '{}');
      GM_setValue(D, '');

      await sleep(300);
      location.href = `https://riders.uber.com/trips/${list[0]}`;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // TRIP PAGE
  // ══════════════════════════════════════════════════════════════
  async function tripPage() {
    const m  = location.pathname.match(/\/trips\/([\w-]{10,})/);
    const id = m ? m[1] : null;
    if (!id) return;

    const queue = JSON.parse(GM_getValue(Q, '[]'));
    if (!queue.includes(id)) { log('Not in queue:', id); return; }
    log('Processing:', id);

    // Wait for "View Receipt" button to appear (polls instead of sleeping)
    let viewBtn;
    try {
      viewBtn = await waitFor(() => findBtn(['view receipt']), TO_PAGE);
    } catch {
      log('No View Receipt button appeared');
      return advance(queue, id, 'fail');
    }

    log('Clicking View Receipt');
    viewBtn.click();

    // Wait for the Download PDF anchor to appear in the modal
    let dlAnchor;
    try {
      dlAnchor = await waitFor(() => findDlAnchor(), TO_MODAL);
    } catch {
      log('No Download PDF anchor found');
      return advance(queue, id, 'fail');
    }

    const pdfPath = dlAnchor.getAttribute('href');
    const pdfUrl  = `https://riders.uber.com${pdfPath}`;
    log('PDF URL:', pdfUrl);

    // Use the trip's own timestamp from the URL for a stable filename
    const tsMatch = pdfPath.match(/timestamp=(\d+)/);
    const date    = tsMatch
      ? new Date(parseInt(tsMatch[1])).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const filename = `Uber_${date}_${id.slice(0, 8)}.pdf`;

    log('Downloading:', filename, pdfUrl);
    // fetch() runs in page context so it automatically carries session cookies.
    // GM_download skips cookies → Uber returns an HTML redirect → corrupted PDF.
    let ok = false;
    try {
      const resp = await fetch(pdfUrl, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // revoke after a short delay so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      log('✅ Downloaded:', filename);
      ok = true;
    } catch (e) {
      log('❌ fetch/download error:', e.message);
    }

    await sleep(T_DL);
    advance(queue, id, ok ? 'ok' : 'fail');
  }

  // ══════════════════════════════════════════════════════════════
  // ADVANCE
  // ══════════════════════════════════════════════════════════════
  function advance(queue, id, outcome) {
    const results = JSON.parse(GM_getValue(R, '{}'));
    results[id] = outcome;
    GM_setValue(R, JSON.stringify(results));
    log('Recorded', outcome, 'for', id);

    const next = queue[queue.indexOf(id) + 1];
    if (next) {
      log('→', next);
      location.href = `https://riders.uber.com/trips/${next}`;
    } else {
      log('✅ All done!');
      GM_setValue(D, 'yes');
      location.href = 'https://riders.uber.com/trips';
    }
  }

})();

// ==UserScript==
// @name         Target Circle Auto Coupon Clipper
// @namespace    https://greasyfork.org/
// @version      3.5.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @description  Automatically saves visible Target Circle offers, including lazy-loaded offers.
// @author       You
// @supportURL   https://github.com/mongkokman91/userscripts/issues
// @match        https://www.target.com/*
// @run-at       document-idle
// @inject-into  content
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  const ID = 'tc-clipper-v34';
  if (window.top !== window.self || document.getElementById(ID)) return;
  const panel = document.createElement('aside');
  panel.id = ID;
  panel.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#c00;color:white;padding:14px;border-radius:10px;font:14px system-ui;max-width:340px';
  const status = document.createElement('div');
  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  const start = document.createElement('button');
  start.textContent = 'Clip all';
  for (const button of [start, stop]) {
    button.type = 'button';
    button.style.cssText = 'margin:10px 8px 0 0;padding:8px 14px;background:white;color:#a00;border:0;border-radius:6px;font:bold 14px system-ui;cursor:pointer';
  }
  stop.disabled = true;
  panel.append(status, start, stop);
  document.body.append(panel);
  let stopped = false, running = false, saved = 0, loads = 0;
  let attempted = new WeakSet();
  let unconfirmed = 0;
  const BATCH_SIZE = 5, CLICK_GAP_MS = 200;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const say = message => { status.textContent = 'TC Clipper v3.5.0: ' + message; };
  const labels = el => [el.innerText || el.textContent || el.value || '', el.getAttribute('aria-label') || '', el.title || '']
    .map(s => s.replace(/\s+/g, ' ').trim());
  const matches = (el, re) => labels(el).some(s => re.test(s));
  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const controls = () => [...document.querySelectorAll('button, [role="button"], a, input[type="button"]')]
    .filter(el => !panel.contains(el) && visible(el));
  const applyRE = /^apply(?:\s+(?:offer|coupon|deal))?$/i;
  const moreRE = /^load more(?:\s+(?:offers|coupons|deals))?$/i;
  const doneRE = /^(?:[✓✔]\s*)?applied\b/i;
  const findApply = () => controls().find(el => enabled(el) && !attempted.has(el) &&
    matches(el, applyRE) && !matches(el, doneRE));
  const findMore = () => controls().find(el => matches(el, moreRE));
  const onDeals = () => /^\/(?:deals|circle)(?:\/|$)/.test(location.pathname);
  const fingerprint = () => controls().filter(el => matches(el, applyRE) || matches(el, doneRE))
    .map(el => (el.parentElement?.textContent || labels(el)[0]).replace(/\s+/g, ' ')).join('|');

  stop.onclick = () => { stopped = true; say('Stopping — finishing confirmation…'); };
  start.onclick = () => { if (!running) void run(); };
  async function run() {
    if (running) return;
    if (!onDeals()) { say('Open Target Deals, then click Clip all.'); return; }
    stopped = false;
    attempted = new WeakSet();
    saved = 0; loads = 0; unconfirmed = 0;
    running = true;
    start.disabled = true; stop.disabled = false;
    let idle = 0;
    try {
      for (let actions = 0; actions < 1000 && !stopped && onDeals(); actions++) {
        if (findApply()) {
          idle = 0;
          const pending = [];
          for (let n = 0; n < BATCH_SIZE && !stopped && onDeals(); n++) {
            const button = findApply(); // Re-query after every click: React may replace nodes.
            if (!button) break;
            attempted.add(button);
            button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            if (!enabled(button) || !button.isConnected || matches(button, doneRE)) continue;
            button.click();
            pending.push(button);
            say('Applying batch… ' + saved + ' confirmed');
            await sleep(CLICK_GAP_MS);
          }
          const confirmed = new Set();
          for (let n = 0; n < 24; n++) {
            for (const button of pending) {
              if (button.isConnected && matches(button, doneRE)) confirmed.add(button);
            }
            if (confirmed.size === pending.length || stopped || !onDeals()) break;
            await sleep(250);
          }
          saved += confirmed.size;
          unconfirmed += pending.length - confirmed.size;
          if (confirmed.size < pending.length) {
            say(saved + ' confirmed; ' + unconfirmed + ' unconfirmed. Paused to avoid repeating uncertain saves. Click Clip all to rescan.');
            return;
          }
          continue;
        }
        const more = findMore();
        if (!more) {
          if (++idle < 5) { say('Waiting for any remaining offers…'); await sleep(1000); continue; }
          say('Finished — ' + saved + ' confirmed applied; ' + loads + ' batches loaded.');
          return;
        }
        if (!enabled(more)) {
          if (++idle >= 15) { say('Load more stayed disabled. Click Clip all to retry.'); return; }
          say('Waiting for Load more…'); await sleep(1000); continue;
        }
        idle = 0;
        more.scrollIntoView({ block: 'center', behavior: 'instant' });
        await sleep(250);
        if (stopped || !onDeals()) break;
        const before = fingerprint();
        say('Loading next batch… ' + saved + ' confirmed applied');
        more.click();
        let changed = false;
        for (let n = 0; n < 60 && !stopped; n++) {
          await sleep(250);
          if (fingerprint() !== before) { changed = true; break; }
        }
        if (stopped) break;
        if (!changed) {
          stopped = true;
          say('Load more produced no new coupons after 15 seconds. Refresh to retry; ' + saved + ' confirmed applied.');
          break;
        }
        loads++;
        await sleep(500);
      }
    } catch (error) {
      stopped = true;
      say('Error: ' + error.message);
      console.error('[TC Clipper]', error);
      say((stopped ? 'Stopped' : !onDeals() ? 'Page changed' : 'Run limit reached') + ' — ' + saved + ' confirmed; ' + unconfirmed + ' unconfirmed.');
    } finally { running = false; start.disabled = false; stop.disabled = true; }
  }
  say('Ready — click Clip all to apply coupons and load more.');
})();

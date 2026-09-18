// ==UserScript==
// @name         Target Circle Auto Coupon Clipper
// @namespace    https://greasyfork.org/
// @version      3.4.0
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
  panel.append(status, stop);
  document.body.append(panel);
  let stopped = false, running = false, saved = 0, loads = 0;
  const attempted = new WeakSet();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const say = message => { status.textContent = 'TC Clipper v3.4.0: ' + message; };
  const labels = el => [el.innerText || el.textContent || el.value || '', el.getAttribute('aria-label') || '', el.title || '']
    .map(s => s.replace(/\s+/g, ' ').trim());
  const matches = (el, re) => labels(el).some(s => re.test(s));
  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const controls = () => [...document.querySelectorAll('main button, main [role="button"], main a, main input[type="button"]')]
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

  stop.onclick = () => { stopped = true; observer.disconnect(); clearInterval(timer); say('Stopped — ' + saved + ' confirmed applied'); };
  async function run() {
    if (running || stopped || !onDeals()) return;
    running = true;
    try {
      for (let actions = 0; actions < 1000 && !stopped && onDeals(); actions++) {
        const button = findApply();
        if (button) {
          attempted.add(button);
          button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          await sleep(200);
          if (stopped || !onDeals()) break;
          if (!button.isConnected || !enabled(button) || !matches(button, applyRE)) continue;
          say('Applying coupon… ' + saved + ' confirmed');
          button.click(); // Exactly one click; never click an Applied toggle.
          for (let n = 0; n < 24 && !stopped; n++) {
            await sleep(250);
            if (button.isConnected && matches(button, doneRE)) { saved++; break; }
          }
          continue;
        }
        const more = findMore();
        if (!more) {
          say(saved + ' confirmed applied; ' + loads + ' batches loaded. Watching for more offers…');
          break; // Observer/timer resume on delayed rendering and SPA navigation.
        }
        if (!enabled(more)) { say('Waiting for Load more to become ready…'); break; }
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
    } finally { running = false; }
  }
  // Ignore our own status updates so they cannot trigger a busy observer loop.
  const observer = new MutationObserver(records => {
    if (records.some(record => !panel.contains(record.target))) void run();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
  const timer = setInterval(() => void run(), 2000);
  say('Ready — waiting for Target offers…');
  void run();
})();

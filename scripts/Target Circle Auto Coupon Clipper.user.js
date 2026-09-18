// ==UserScript==
// @name         Target Circle Auto Coupon Clipper
// @namespace    https://greasyfork.org/
// @version      3.3.0
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

  if (window.top !== window.self || window.__targetCircleClipperRunning) return;
  window.__targetCircleClipperRunning = true;

  const CONFIG = Object.freeze({
    clickDelayMs: 900,
    settleDelayMs: 700,
    scanDelayMs: 900,
    maxScanRounds: 120,
    stableRoundsToStop: 4,
    maxClickAttempts: 500,
  });

  const actionableText = /^(?:apply|save|clip|activate|add)(?:\s+(?:offer|deal|coupon))?\b/i;
  const completedText = /\b(?:applied|already saved|saved)\b/i;
  const attempted = new WeakSet();
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  let stopped = false;
  let paused = false;
  let clipped = 0;
  let failed = 0;

  const panel = document.createElement('aside');
  panel.setAttribute('aria-live', 'polite');
  panel.style.cssText = [
    'position:fixed',
    'right:24px',
    'bottom:24px',
    'z-index:2147483647',
    'min-width:250px',
    'max-width:340px',
    'padding:12px 14px',
    'border-radius:10px',
    'background:#cc0000',
    'color:#fff',
    'box-shadow:0 4px 16px rgba(0,0,0,.28)',
    'font:600 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
  ].join(';');

  const status = document.createElement('div');
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;margin-top:9px';

  function makeButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'border:1px solid rgba(255,255,255,.8)',
      'border-radius:6px',
      'padding:5px 9px',
      'background:#fff',
      'color:#8b0000',
      'font:600 12px system-ui,-apple-system,Segoe UI,sans-serif',
      'cursor:pointer',
    ].join(';');
    return button;
  }

  const pauseButton = makeButton('Pause');
  const stopButton = makeButton('Stop');
  controls.append(pauseButton, stopButton);
  panel.append(status, controls);
  document.body.appendChild(panel);

  function setStatus(message) {
    status.textContent = `🎯 TC Clipper: ${message}`;
  }

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    setStatus(paused ? `Paused (${clipped} saved)` : `Resuming (${clipped} saved)`);
  });

  stopButton.addEventListener('click', () => {
    stopped = true;
    setStatus(`Stopped — ${clipped} saved${failed ? `, ${failed} unconfirmed` : ''}`);
    controls.remove();
    panel.style.cursor = 'pointer';
    panel.title = 'Click to dismiss';
    panel.addEventListener('click', () => panel.remove(), { once: true });
  });

  async function waitWhilePaused() {
    while (paused && !stopped) await sleep(250);
  }

  function elementText(element) {
    return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function elementLabel(element) {
    return [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      elementText(element),
    ].filter(Boolean).join(' ').trim();
  }

  function hasOfferContext(element) {
    let container = element;
    for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
      const context = elementText(container).slice(0, 1500);
      if (/target circle|circle offer|offer details|deal details|expires?|coupon/i.test(context)) return true;
    }
    return false;
  }

  function isVisible(element) {
    if (!element.isConnected || element.hidden) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function findButtons() {
    return [...document.querySelectorAll('button, [role="button"], input[type="button"], a')].filter((element) => {
      if (attempted.has(element) || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
      const label = elementLabel(element);
      if (!isVisible(element) || !actionableText.test(label) || completedText.test(label)) return false;

      // Target uses a bare “Add” label in some Circle cards. Never treat a
      // normal product/cart Add button as a coupon unless its card says it is
      // a Circle offer.
      return !/^add\s*$/i.test(label) || hasOfferContext(element);
    });
  }

  async function clickAndConfirm(button) {
    attempted.add(button);
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(150);

    const before = elementText(button);
    button.click();
    await sleep(CONFIG.clickDelayMs);

    const after = elementText(button);
    const confirmed = !button.isConnected || button.disabled || completedText.test(after) || after !== before;
    if (confirmed) clipped += 1;
    else failed += 1;
  }

  function scrollPosition(root) {
    return {
      root,
      top: root.scrollTop,
      height: root.scrollHeight,
      viewport: root.clientHeight || window.innerHeight,
    };
  }

  function forceScrollTo(root, top) {
    root.scrollTop = top;
    if (root === document.scrollingElement || root === document.documentElement || root === document.body) {
      window.scrollTo(0, top);
    }
    root.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  function findScrollRoots() {
    const documentRoot = document.scrollingElement || document.documentElement;
    const nested = [...document.querySelectorAll('main, section, div, ul')].filter((element) => {
      const style = window.getComputedStyle(element);
      return element.scrollHeight > element.clientHeight + 100 &&
        element.clientHeight > 250 &&
        /auto|scroll/.test(style.overflowY);
    });
    return [...new Set([documentRoot, ...nested])]
      .sort((a, b) => b.scrollHeight - a.scrollHeight)
      .slice(0, 8);
  }

  async function clickLoadMore() {
    const controls = [...document.querySelectorAll('button, [role="button"], a')].filter((element) => {
      const label = elementLabel(element);
      return isVisible(element) && /^(?:show|load|view)\s+more(?:\s+(?:offers|deals|coupons))?\b/i.test(label);
    });
    for (const control of controls) {
      control.scrollIntoView({ block: 'center' });
      await sleep(150);
      control.click();
      await sleep(CONFIG.scanDelayMs);
    }
    return controls.length;
  }

  async function clipCurrentBatch() {
    const buttons = findButtons();
    for (const button of buttons) {
      if (stopped || clipped + failed >= CONFIG.maxClickAttempts) break;
      await waitWhilePaused();
      setStatus(`Applying offer ${clipped + failed + 1}…`);
      await clickAndConfirm(button);
    }
    return buttons.length;
  }

  async function crawlRoot(root, rootNumber, rootCount) {
    forceScrollTo(root, 0);
    await sleep(CONFIG.scanDelayMs);
    let stableBottomRounds = 0;
    let previousHeight = 0;

    for (let round = 0; round < CONFIG.maxScanRounds; round += 1) {
      if (stopped || clipped + failed >= CONFIG.maxClickAttempts) return;
      await waitWhilePaused();

      await clipCurrentBatch();
      await clickLoadMore();

      const before = scrollPosition(root);
      const nextTop = Math.min(
        before.top + Math.max(Math.floor(before.viewport * 0.8), 600),
        Math.max(before.height - before.viewport, 0),
      );
      forceScrollTo(root, nextTop);
      await sleep(CONFIG.scanDelayMs);

      const after = scrollPosition(root);
      const atBottom = after.top + after.viewport >= after.height - 30;
      const heightStable = after.height === previousHeight;
      stableBottomRounds = atBottom && heightStable ? stableBottomRounds + 1 : 0;
      previousHeight = after.height;

      setStatus(`Scroller ${rootNumber}/${rootCount}, pass ${round + 1}… ${clipped} saved`);
      if (stableBottomRounds >= CONFIG.stableRoundsToStop) break;
    }

    forceScrollTo(root, 0);
  }

  async function crawlOffers() {
    // Target has alternated between document scrolling and nested results
    // panes. Drive every substantial vertical scroller rather than assuming.
    const roots = findScrollRoots();
    for (let index = 0; index < roots.length; index += 1) {
      if (stopped || clipped + failed >= CONFIG.maxClickAttempts) break;
      await crawlRoot(roots[index], index + 1, roots.length);
    }

    // A second top-to-bottom pass catches virtualized cards that Target may
    // have removed from the DOM during the first pass.
    const root = document.scrollingElement || document.documentElement;
    forceScrollTo(root, 0);
    await sleep(CONFIG.scanDelayMs);
    await clipCurrentBatch();
  }

  async function run() {
    const originalX = window.scrollX;
    const originalY = window.scrollY;

    try {
      setStatus('Waiting for offers…');
      await sleep(CONFIG.settleDelayMs);

      await crawlOffers();

      window.scrollTo({ left: originalX, top: originalY, behavior: 'auto' });
      setStatus(`Done — ${clipped} saved${failed ? `, ${failed} unconfirmed` : ''}`);
      controls.remove();
      panel.style.cursor = 'pointer';
      panel.title = 'Click to dismiss';
      panel.addEventListener('click', () => panel.remove(), { once: true });
    } catch (error) {
      console.error('[Target Circle Clipper]', error);
      setStatus(`Stopped after an error — ${clipped} saved`);
    } finally {
      window.__targetCircleClipperRunning = false;
    }
  }

  run();
})();

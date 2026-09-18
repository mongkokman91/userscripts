// ==UserScript==
// @name         Target Circle Auto Coupon Clipper
// @namespace    https://greasyfork.org/
// @version      3.1.0
// @description  Automatically saves visible Target Circle offers, including lazy-loaded offers.
// @author       You
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @supportURL   https://github.com/mongkokman91/userscripts/issues
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
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
    maxScanRounds: 50,
    stableRoundsToStop: 3,
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
    return [...document.querySelectorAll('button, [role="button"], input[type="button"]')].filter((element) => {
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

  async function revealLazyContent() {
    let stableRounds = 0;
    let previousHeight = 0;

    for (let round = 0; round < CONFIG.maxScanRounds && stableRounds < CONFIG.stableRoundsToStop; round += 1) {
      if (stopped) return;
      await waitWhilePaused();
      window.scrollBy({ top: Math.max(window.innerHeight * 0.85, 600), behavior: 'auto' });
      await sleep(CONFIG.scanDelayMs);

      const currentHeight = document.documentElement.scrollHeight;
      const atBottom = window.scrollY + window.innerHeight >= currentHeight - 20;
      stableRounds = atBottom && currentHeight === previousHeight ? stableRounds + 1 : 0;
      previousHeight = currentHeight;
      setStatus(`Scanning offers… ${clipped} saved, ${findButtons().length} ready`);
    }
  }

  async function run() {
    const originalX = window.scrollX;
    const originalY = window.scrollY;

    try {
      setStatus('Waiting for offers…');
      await sleep(CONFIG.settleDelayMs);

      for (let pass = 1; pass <= CONFIG.maxScanRounds && clipped + failed < CONFIG.maxClickAttempts; pass += 1) {
        if (stopped) return;
        await waitWhilePaused();

        const buttons = findButtons();
        if (!buttons.length) {
          await revealLazyContent();
          if (!findButtons().length) break;
          continue;
        }

        for (const button of buttons) {
          if (stopped || clipped + failed >= CONFIG.maxClickAttempts) break;
          await waitWhilePaused();
          setStatus(`Saving offer ${clipped + failed + 1}…`);
          await clickAndConfirm(button);
        }
      }

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

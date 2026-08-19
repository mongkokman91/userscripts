// ==UserScript==
// @name         Target Circle Auto Coupon Clipper
// @namespace    https://greasyfork.org/
// @version      2.3
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Target%20Circle%20Auto%20Coupon%20Clipper.user.js
// @description  Automatically clicks all coupon buttons on Target Circle pages
// @author       You
// @match        https://www.target.com/*
// @run-at       document-idle
// @inject-into  content
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  const DELAY_MS = 800;
  const SCROLL_DELAY_MS = 1200;
  const MAX_SCROLLS = 80;

  function findButtons() {
    return [...document.querySelectorAll('button, [role="button"], a')].filter(function (el) {
      if (el.disabled) return false;
      var t = (el.innerText || el.textContent || '').trim();
      return (
        /^Apply\b/i.test(t) ||
        /^Save offer/i.test(t) ||
        /^Clip\b/i.test(t) ||
        /^Add offer/i.test(t)
      ) && !/applied in cart/i.test(t)
        && !/already saved/i.test(t)
        && !/applied/i.test(t);
    });
  }

  // Also scroll all horizontally scrollable containers
  async function scrollAllCarousels() {
    const scrollables = [...document.querySelectorAll('*')].filter(el => {
      const s = window.getComputedStyle(el);
      return (
        el.scrollWidth > el.clientWidth + 10 &&
        (s.overflowX === 'auto' || s.overflowX === 'scroll')
      );
    });
    for (const el of scrollables) {
      let lastW = 0;
      for (let i = 0; i < 30; i++) {
        el.scrollLeft += 400;
        await sleep(300);
        if (el.scrollLeft === lastW) break;
        lastW = el.scrollLeft;
      }
      el.scrollLeft = 0;
    }
  }

  var overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:999999',
    'background:#cc0000',
    'color:#fff',
    'font-family:sans-serif',
    'font-size:14px',
    'font-weight:600',
    'padding:12px 18px',
    'border-radius:10px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'min-width:230px',
    'line-height:1.6'
  ].join(';');
  overlay.innerHTML = '&#127919; TC Clipper: <b>Starting...</b>';
  document.body.appendChild(overlay);

  function setStatus(msg) {
    overlay.innerHTML = '&#127919; TC Clipper: ' + msg;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function simulateClick(el) {
    // Try multiple click methods for mobile compatibility
    ['mousedown', 'mouseup', 'click'].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    });
    el.click();
  }

  async function clipAll() {
    setStatus('Waiting for page to load...');
    await sleep(2500);

    // Wait for buttons to appear
    for (var w = 0; w < 30; w++) {
      if (findButtons().length > 0) break;
      await sleep(500);
    }

    setStatus('Scrolling to load all deals...');

    // Vertical scroll pass
    var lastH = 0;
    for (var i = 0; i < MAX_SCROLLS; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_DELAY_MS);
      var h = document.body.scrollHeight;
      if (h === lastH) break;
      lastH = h;
    }

    // Horizontal carousel scroll pass
    setStatus('Scanning carousels...');
    await scrollAllCarousels();

    window.scrollTo(0, 0);
    await sleep(800);

    var total = findButtons().length;
    setStatus('Found <b>' + total + '</b> coupons. Clipping...');
    await sleep(600);

    var clipped = 0;

    // Multi-pass: keep going until no buttons remain
    for (var pass = 0; pass < 10; pass++) {
      var btns = findButtons();
      if (btns.length === 0) break;

      for (var j = 0; j < btns.length; j++) {
        var btn = btns[j];
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(400);
        simulateClick(btn);
        clipped++;
        setStatus('Clipped <b>' + clipped + '</b> / ' + total + '...');
        await sleep(DELAY_MS);
      }

      // After each pass, scroll again to reveal lazy-loaded buttons
      window.scrollTo(0, 0);
      await sleep(500);
      for (var k = 0; k < MAX_SCROLLS; k++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(SCROLL_DELAY_MS);
        var newH = document.body.scrollHeight;
        if (newH === lastH) break;
        lastH = newH;
      }
      await scrollAllCarousels();
      window.scrollTo(0, 0);
      await sleep(800);
    }

    setStatus(
      '&#x2705; Done! Clipped <b>' + clipped + '</b> coupons. ' +
      '<span style="font-weight:normal;font-size:12px">(click to dismiss)</span>'
    );
    overlay.style.cursor = 'pointer';
    overlay.addEventListener('click', function () { overlay.remove(); });
  }

  function waitForBody() {
    if (document.body) {
      setTimeout(clipAll, 3000);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(clipAll, 3000);
      });
    }
  }

  waitForBody();
})();

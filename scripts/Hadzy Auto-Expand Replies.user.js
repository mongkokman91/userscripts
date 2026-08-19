// ==UserScript==
// @name         Hadzy Auto-Expand Replies
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://next.hadzy.com/*
// @grant        none
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Hadzy%20Auto-Expand%20Replies.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Hadzy%20Auto-Expand%20Replies.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Hadzy%20Auto-Expand%20Replies.user.js
// ==/UserScript==
(function() {
    'use strict';
    function clickShowReplies() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.textContent.trim().startsWith('Show') &&
                btn.textContent.includes('repl')) {
                btn.click();
            }
        });
    }
    // Run on page load and watch for new comments loaded dynamically
    const observer = new MutationObserver(() => {
        clickShowReplies();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Initial run after short delay for page to render
    setTimeout(clickShowReplies, 2000);
})();
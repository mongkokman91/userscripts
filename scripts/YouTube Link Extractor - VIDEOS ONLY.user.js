// ==UserScript==
// @name         YouTube Link Extractor - VIDEOS ONLY
// @namespace    http://tampermonkey.net/
// @version      3.2
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/YouTube%20Link%20Extractor%20-%20VIDEOS%20ONLY.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/YouTube%20Link%20Extractor%20-%20VIDEOS%20ONLY.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/YouTube%20Link%20Extractor%20-%20VIDEOS%20ONLY.user.js
// @match        *://*.youtube.com/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Create button immediately
    function makeButton() {
        const btn = document.createElement('div');
        btn.id = 'yt-extractor-btn-videos';
        btn.textContent = '📹 VIDEOS ONLY';

        // Positioned ABOVE the original button (100px from bottom instead of 30px)
        btn.setAttribute('style', `
            position: fixed !important;
            bottom: 110px !important;
            right: 30px !important;
            z-index: 999999999 !important;
            background: #1E90FF !important;
            color: white !important;
            padding: 20px !important;
            border-radius: 10px !important;
            font-size: 16px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            box-shadow: 0 8px 20px rgba(0,0,0,0.8) !important;
            font-family: Arial !important;
            user-select: none !important;
            animation: pulse 2s infinite !important;
        `.trim());

        btn.onclick = function() {
            // Get all links
            const allLinks = Array.from(document.getElementsByTagName('a'));
            const urls = new Set();

            allLinks.forEach(link => {
                const href = link.href;
                if (!href) return;

                // ONLY check for regular video links (watch?v=)
                // Explicitly EXCLUDE shorts and playlists
                if (href.includes('/watch?v=') && !href.includes('/shorts/')) {
                    const match = href.match(/watch\?v=([^&]+)/);
                    if (match) {
                        urls.add(`https://www.youtube.com/watch?v=${match[1]}`);
                    }
                }
            });

            if (urls.size > 0) {
                GM_setClipboard(Array.from(urls).join('\n'));
                btn.textContent = `✅ ${urls.size} VIDEOS`;
                btn.style.background = '#00AA00 !important';
                setTimeout(() => {
                    btn.textContent = '📹 VIDEOS ONLY';
                    btn.style.background = '#1E90FF !important';
                }, 2000);
            } else {
                btn.textContent = '❌ NO VIDEOS';
                setTimeout(() => {
                    btn.textContent = '📹 VIDEOS ONLY';
                }, 2000);
            }
        };

        return btn;
    }

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    `;
    document.head.appendChild(style);

    // Wait for page to be ready, then inject
    function inject() {
        // Remove old button if exists
        const old = document.getElementById('yt-extractor-btn-videos');
        if (old) old.remove();

        // Add new button
        const btn = makeButton();
        document.body.appendChild(btn);
    }

    // Inject after delay
    setTimeout(inject, 2000);

    // Keep checking and re-injecting if needed
    setInterval(() => {
        if (!document.getElementById('yt-extractor-btn-videos')) {
            inject();
        }
    }, 5000);

})();

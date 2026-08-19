// ==UserScript==
// @name         Reddit URL Extractor (Bottom-Right)
// @version      1.0.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Reddit%20URL%20Extractor%20%28Bottom-Right%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Reddit%20URL%20Extractor%20%28Bottom-Right%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Reddit%20URL%20Extractor%20%28Bottom-Right%29.user.js
// @match        *://*.reddit.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    var b = document.createElement('button');
    b.innerHTML = '📋 COPY URLS';

    // POSITIONED: Bottom Right (25px from bottom, 20px from right)
    // Increased z-index to stay above Reddit's mobile overlays
    b.style.cssText = 'position:fixed!important; bottom:25px!important; right:20px!important; z-index:2147483647!important; background:#FF4500!important; color:white!important; padding:15px!important; border:2px solid white!important; border-radius:12px!important; font-weight:bold!important; font-size:14px!important; box-shadow:0 4px 15px rgba(0,0,0,0.5)!important; cursor:pointer!important;';

    b.onclick = function() {
        var links = document.querySelectorAll('a[href*="/comments/"]');
        var urls = [];
        for (var i = 0; i < links.length; i++) {
            var h = links[i].href;
            // Deduplicate and ensure it's a full URL
            if (urls.indexOf(h) === -1) {
                urls.push(h);
            }
        }

        if (urls.length > 0) {
            GM_setClipboard(urls.join('\n'));
            b.innerHTML = '✅ ' + urls.length + ' URLS';
            b.style.backgroundColor = '#28a745'; // Green for success
            setTimeout(function() {
                b.innerHTML = '📋 COPY URLS';
                b.style.backgroundColor = '#FF4500'; // Back to Reddit Orange
            }, 2000);
        } else {
            alert('No links found yet! Try scrolling down first.');
        }
    };

    document.body.appendChild(b);
})();

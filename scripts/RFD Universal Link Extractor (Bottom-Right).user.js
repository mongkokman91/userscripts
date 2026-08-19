// ==UserScript==
// @name         RFD Universal Link Extractor (Bottom-Right)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/RFD%20Universal%20Link%20Extractor%20%28Bottom-Right%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/RFD%20Universal%20Link%20Extractor%20%28Bottom-Right%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/RFD%20Universal%20Link%20Extractor%20%28Bottom-Right%29.user.js
// @match        *://forums.redflagdeals.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    var b = document.createElement('button');
    b.innerHTML = '📋 COPY RFD THREADS';

    // POSITIONED: Bottom Right (25px from bottom, 20px from right)
    b.style.cssText = 'position:fixed!important; bottom:25px!important; right:20px!important; z-index:999999!important; background:#0056b3!important; color:white!important; padding:15px!important; border:2px solid white!important; border-radius:12px!important; font-weight:bold!important; font-size:14px!important; box-shadow:0 4px 15px rgba(0,0,0,0.5)!important; cursor:pointer!important;';

    b.onclick = function() {
        var links = document.getElementsByTagName('a');
        var urls = [];

        for (var i = 0; i < links.length; i++) {
            var h = links[i].href;

            if (h) {
                // Clean the URL of tracking junk
                h = h.split('?')[0].split('#')[0];

                // VALIDATION LOGIC:
                // 1. Must contain 'redflagdeals.com'
                // 2. Must end in a dash followed by 6-8 numbers (the Thread ID)
                // 3. Must NOT be a user profile or a 'jump to page' link
                var isThread = h.match(/-[0-9]{6,8}\/?$/);
                var isNotJunk = h.indexOf('/user/') === -1 && h.indexOf('/m/') === -1;

                if (isThread && isNotJunk) {
                    if (urls.indexOf(h) === -1) {
                        urls.push(h);
                    }
                }
            }
        }

        if (urls.length > 0) {
            GM_setClipboard(urls.join('\n'));
            b.innerHTML = '✅ ' + urls.length + ' THREADS';
            b.style.backgroundColor = '#28a745';
            setTimeout(function() {
                b.innerHTML = '📋 COPY RFD THREADS';
                b.style.backgroundColor = '#0056b3';
            }, 2000);
        } else {
            alert('No thread links found. Try scrolling down to load the deals first!');
        }
    };

    document.body.appendChild(b);
})();

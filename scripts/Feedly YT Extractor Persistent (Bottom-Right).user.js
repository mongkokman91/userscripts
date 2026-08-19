// ==UserScript==
// @name         Feedly YT Extractor Persistent (Bottom-Right)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @match        *://feedly.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Feedly%20YT%20Extractor%20Persistent%20%28Bottom-Right%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Feedly%20YT%20Extractor%20Persistent%20%28Bottom-Right%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Feedly%20YT%20Extractor%20Persistent%20%28Bottom-Right%29.user.js
// ==/UserScript==

(function() {
    'use strict';

    function injectButton() {
        // If button already exists, don't add it again
        if (document.getElementById('feedly-yt-extractor')) return;

        var btn = document.createElement('button');
        btn.id = 'feedly-yt-extractor';
        btn.innerHTML = '📋 COPY YT LINKS';

        // STYLE: Positioned Bottom-Right for thumb accessibility
        btn.style.cssText = `
            position: fixed !important;
            bottom: 25px !important;
            right: 20px !important;
            z-index: 2147483647 !important;
            background: #FF0000 !important;
            color: white !important;
            padding: 15px 20px !important;
            border: 2px solid white !important;
            border-radius: 50px !important;
            font-weight: bold !important;
            font-size: 14px !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
            display: block !important;
            cursor: pointer !important;
        `;

        btn.onclick = function() {
            var links = document.getElementsByTagName('a');
            var ytList = [];

            for (var i = 0; i < links.length; i++) {
                var h = links[i].href;
                if (h) {
                    // Only grab actual videos/shorts, skip channels and homepages
                    var isVideo = (h.indexOf('watch?v=') > -1 || h.indexOf('youtu.be/') > -1 || h.indexOf('/shorts/') > -1);

                    if (isVideo) {
                        var cleanUrl = h.split('?')[0];
                        // Fix: Correctly reconstruct the watch URL if an ID is found
                        if (h.indexOf('v=') > -1) {
                            var id = h.match(/v=([^&]+)/);
                            if (id) cleanUrl = 'https://www.youtube.com/watch?v=' + id[1];
                        }

                        if (ytList.indexOf(cleanUrl) === -1) {
                            ytList.push(cleanUrl);
                        }
                    }
                }
            }

            if (ytList.length > 0) {
                GM_setClipboard(ytList.join('\n'));
                btn.innerHTML = '✅ COPIED ' + ytList.length;
                btn.style.background = '#1a73e8'; // Blue for success
                setTimeout(function() {
                    btn.innerHTML = '📋 COPY YT LINKS';
                    btn.style.background = '#FF0000'; // Back to Red
                }, 2000);
            } else {
                alert('No YouTube links found. Make sure you have scrolled down to load the articles!');
            }
        };

        (document.body || document.documentElement).appendChild(btn);
    }

    // Check every 2 seconds to ensure the button stays visible during Feedly navigation
    setInterval(injectButton, 2000);
})();

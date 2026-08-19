// ==UserScript==
// @name         Google Search Link Grabber (Fixed v4)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Google%20Search%20Link%20Grabber%20%28Fixed%20v4%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20Search%20Link%20Grabber%20%28Fixed%20v4%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20Search%20Link%20Grabber%20%28Fixed%20v4%29.user.js
// @description  Ultra-aggressive link extraction with YouTube video ID preservation
// @author       You
// @match        *://*.google.com/search*
// @match        *://*.google.ca/search*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function injectButton() {
        if (document.getElementById('google-grabber-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'google-grabber-btn';
        btn.innerHTML = '📋 COPY SEARCH LINKS';

        btn.style.cssText = `
            position: fixed !important;
            bottom: 25px !important;
            right: 20px !important;
            z-index: 2147483647 !important;
            background: #4285f4 !important;
            color: white !important;
            padding: 15px 20px !important;
            border: 2px solid white !important;
            border-radius: 50px !important;
            font-weight: bold !important;
            font-size: 14px !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
            cursor: pointer !important;
            display: block !important;
        `;

        btn.onclick = function() {
            var urls = new Set();

            // Get EVERY anchor tag on the page
            var allLinks = document.querySelectorAll('a[href]');

            console.log('Total <a> tags found:', allLinks.length);

            allLinks.forEach(function(anchor) {
                var rawHref = anchor.href;

                if (!rawHref || !rawHref.startsWith('http')) {
                    return;
                }

                var cleanLink = rawHref;

                // STEP 1: Decode Google's redirect tracking
                if (cleanLink.includes('/url?') || cleanLink.includes('google.com/url')) {
                    var match = cleanLink.match(/[?&](?:url|q)=([^&]+)/);
                    if (match) {
                        try {
                            cleanLink = decodeURIComponent(match[1]);
                        } catch(e) {
                            // Keep original if decode fails
                        }
                    }
                }

                // STEP 2: Smart URL cleaning
                try {
                    var urlObj = new URL(cleanLink);

                    // For YouTube watch links: Keep the video ID parameter
                    if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
                        var videoId = urlObj.searchParams.get('v');
                        if (videoId) {
                            cleanLink = urlObj.origin + urlObj.pathname + '?v=' + videoId;
                        } else {
                            cleanLink = urlObj.origin + urlObj.pathname;
                        }
                    }
                    // For other video sites (Vimeo, etc.), keep first query param
                    else if (urlObj.hostname.includes('vimeo.com') ||
                             urlObj.hostname.includes('dailymotion.com') ||
                             urlObj.hostname.includes('twitch.tv')) {
                        // Keep full URL with query params for video sites
                        cleanLink = cleanLink.split('#')[0]; // Just remove fragments
                    }
                    // For all other sites: Remove query params and fragments
                    else {
                        cleanLink = urlObj.origin + urlObj.pathname;
                    }
                } catch(e) {
                    // If URL parsing fails, use string manipulation
                    cleanLink = cleanLink.split('#')[0];
                }

                // STEP 3: Apply minimal filters
                var shouldExclude =
                    // Google's own domains (except YouTube watch links)
                    (cleanLink.includes('google.com/search')) ||
                    (cleanLink.includes('google.com/imgres')) ||
                    (cleanLink.includes('accounts.google.com')) ||
                    (cleanLink.includes('policies.google.com')) ||
                    (cleanLink.includes('support.google.com')) ||
                    (cleanLink.includes('maps.google.com')) ||
                    (cleanLink.includes('news.google.com')) ||
                    (cleanLink.includes('webcache.googleusercontent.com')) ||

                    // YouTube channels/users/playlists (but keep /watch)
                    (/youtube\.com\/(channel|c|user|@|playlist)/.test(cleanLink)) ||

                    // Short video links that got truncated
                    (cleanLink.includes('youtube.com/watch') && cleanLink.length < 40) ||

                    // Too short to be real URLs
                    cleanLink.length < 15;

                if (!shouldExclude) {
                    urls.add(cleanLink);
                }
            });

            var urlArray = Array.from(urls);

            console.log('Clean URLs extracted:', urlArray.length);
            console.log('URLs:', urlArray);

            if (urlArray.length > 0) {
                GM_setClipboard(urlArray.join('\n'));
                btn.innerHTML = '✅ ' + urlArray.length + ' LINKS COPIED';
                btn.style.background = '#34a853';
                setTimeout(function() {
                    btn.innerHTML = '📋 COPY SEARCH LINKS';
                    btn.style.background = '#4285f4';
                }, 2500);
            } else {
                btn.innerHTML = '❌ NO LINKS FOUND';
                btn.style.background = '#ea4335';
                setTimeout(function() {
                    btn.innerHTML = '📋 COPY SEARCH LINKS';
                    btn.style.background = '#4285f4';
                }, 2500);
            }
        };

        (document.body || document.documentElement).appendChild(btn);
    }

    setInterval(injectButton, 2000);
})();

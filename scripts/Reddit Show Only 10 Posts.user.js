// ==UserScript==
// @name         Reddit Show Only 10 Posts
// @version      1.0.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Reddit%20Show%20Only%2010%20Posts.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Reddit%20Show%20Only%2010%20Posts.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Reddit%20Show%20Only%2010%20Posts.user.js
// @match        https://www.reddit.com/r/*
// @match        https://www.reddit.com/r/*/*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MAX_POSTS = 10;

    function limitPosts() {
        const posts = [...document.querySelectorAll('shreddit-post')];

        posts.forEach((post, index) => {
            post.style.display = index < MAX_POSTS ? '' : 'none';
        });

        if (posts.length >= MAX_POSTS) {
            window.stop();
        }
    }

    const observer = new MutationObserver(limitPosts);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    limitPosts();
})();

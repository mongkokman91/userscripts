// ==UserScript==
// @name         RFD Auto Thread Extractor (v4.8 - Multi-Thread Picker)
// @namespace    http://tampermonkey.net/
// @version      4.8
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/RFD%20Auto%20Thread%20Extractor%20%28v4.8%20-%20Multi-Thread%20Picker%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/RFD%20Auto%20Thread%20Extractor%20%28v4.8%20-%20Multi-Thread%20Picker%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/RFD%20Auto%20Thread%20Extractor%20%28v4.8%20-%20Multi-Thread%20Picker%29.user.js
// @description  On thread pages: extract all pages. On forum index/search/www pages: pick multiple threads to extract one by one.
// @author       You
// @match        https://forums.redflagdeals.com/*
// @match        https://www.redflagdeals.com/*
// @match        https://redflagdeals.com/*
// @include      https://forums.redflagdeals.com/*
// @include      https://www.redflagdeals.com/*
// @include      https://redflagdeals.com/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      forums.redflagdeals.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ─────────────────────────────────────────────
    // PAGE TYPE DETECTION
    // ─────────────────────────────────────────────

    const url = window.location.href;
    // Thread page = on forums subdomain AND URL has a slug-numeric pattern (not just a category)
    const isThreadPage = url.includes('forums.redflagdeals.com') &&
                         url.match(/forums\.redflagdeals\.com\/.+[-_]\d+/) &&
                         !url.match(/forums\.redflagdeals\.com\/(deals|computers|financial|automotive|shopping|food-drink|beauty|home-garden|entertainment|travel|cell-phones|expired|hot-deals)\/?$/i);
    const isIndexOrSearchPage = !isThreadPage;

    function waitForBody() {
        return new Promise((resolve) => {
            if (document.body) return resolve();
            const obs = new MutationObserver(() => {
                if (document.body) { obs.disconnect(); resolve(); }
            });
            obs.observe(document.documentElement, { childList: true });
        });
    }

    // ─────────────────────────────────────────────
    // SHARED UTILITIES
    // ─────────────────────────────────────────────

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function convertToMarkdown(title, allPagesData, totalPosts, lastPage, currentDelay, failedPages) {
        let markdown = '';
        if (title) markdown += `# ${title}\n\n`;
        markdown += `---\n`;
        markdown += `**Extracted:** ${new Date().toLocaleString()}\n\n`;
        markdown += `**Total Posts:** ${totalPosts}\n\n`;
        markdown += `**Total Pages:** ${lastPage}\n\n`;
        const speedInfo = currentDelay === 0 ? 'Max speed (0ms delay)' : `${currentDelay}ms delay`;
        markdown += `**Extraction Speed:** ${speedInfo}\n`;
        if (failedPages.length > 0) markdown += `\n**⚠️ Failed Pages:** ${failedPages.join(', ')}\n`;
        markdown += `\n---\n\n`;

        allPagesData.forEach(pageData => {
            if (pageData.posts && pageData.posts.length > 0) {
                markdown += `## Page ${pageData.pageNum}\n\n`;
                markdown += `*${pageData.posts.length} posts*\n\n`;
                pageData.posts.forEach((post, index) => {
                    markdown += `### Post ${index + 1}\n\n`;
                    markdown += `**Author:** ${post.username}`;
                    if (post.timestamp) markdown += ` | **Time:** ${post.timestamp}`;
                    markdown += `\n\n${post.content}\n\n---\n\n`;
                });
            }
        });
        return markdown;
    }

    function showVerificationSummary(allPagesData, totalPosts, failedPages) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);font-family:Arial,sans-serif;`;
            const modal = document.createElement('div');
            modal.style.cssText = `background:white;border-radius:12px;padding:24px;max-width:90%;max-height:80%;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;

            let html = `<h2 style="margin-top:0;color:#333;font-size:20px;">📊 Extraction Summary</h2>
                <div style="margin:16px 0;font-size:16px;color:#555;">
                    <strong>Total Posts:</strong> ${totalPosts}<br>
                    <strong>Total Pages:</strong> ${allPagesData.length}`;
            if (failedPages.length > 0) html += `<br><span style="color:#d32f2f;"><strong>⚠️ Failed Pages:</strong> ${failedPages.join(', ')}</span>`;
            html += `</div><div style="max-height:250px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;padding:12px;margin:16px 0;background:#f9f9f9;">
                <strong style="color:#333;">Page Breakdown:</strong><br><br>`;

            allPagesData.forEach(page => {
                const style = page.postCount === 0 ? 'color:#d32f2f;' : 'color:#333;';
                html += `<div style="${style}margin:8px 0;padding:8px;background:white;border-radius:4px;">
                    <strong>Page ${page.pageNum}:</strong> ${page.postCount} posts`;
                if (page.users.length > 0) {
                    html += `<br><small style="color:#666;">Contributors: ${page.users.slice(0, 3).join(', ')}${page.users.length > 3 ? '...' : ''}</small>`;
                }
                html += `</div>`;
            });

            html += `</div><div style="display:flex;gap:12px;margin-top:20px;">
                <button id="confirmBtn" style="flex:1;padding:12px;background:#4CAF50;color:white;border:none;border-radius:6px;font-size:16px;font-weight:bold;cursor:pointer;">✅ Continue</button>
                <button id="cancelBtn" style="flex:1;padding:12px;background:#f44336;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">❌ Cancel</button>
            </div>`;

            modal.innerHTML = html;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            modal.querySelector('#confirmBtn').onclick = () => { document.body.removeChild(overlay); resolve(true); };
            modal.querySelector('#cancelBtn').onclick = () => { document.body.removeChild(overlay); resolve(false); };
        });
    }

    function showCopyOrShareChoice(text, markdownText, totalPosts, lastPage, threadTitle) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);font-family:Arial,sans-serif;`;
            const modal = document.createElement('div');
            modal.style.cssText = `background:white;border-radius:12px;padding:24px;max-width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;

            const hasShareAPI = navigator.share !== undefined;
            let html = `<h2 style="margin-top:0;color:#333;font-size:20px;">📤 Choose Action</h2>
                <div style="margin:16px 0;font-size:15px;color:#555;">
                    <p style="margin:0 0 6px;">✅ Extracted <strong>${totalPosts} posts</strong> from <strong>${lastPage} page${lastPage>1?'s':''}.</strong></p>
                    <p style="margin:0;font-size:13px;color:#888;word-break:break-all;">${threadTitle || ''}</p>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">`;

            if (hasShareAPI) html += `<button id="shareBtn" style="padding:16px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">📤 Share to App</button>`;
            html += `<button id="downloadBtn" style="padding:16px;background:#2196F3;color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">📥 Download as Markdown</button>
                <button id="copyBtn" style="padding:16px;background:#4CAF50;color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">📋 Copy to Clipboard</button>
                <button id="cancelBtn" style="padding:12px;background:#666;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">❌ Cancel</button>
            </div>`;

            modal.innerHTML = html;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            if (hasShareAPI) modal.querySelector('#shareBtn').onclick = () => { document.body.removeChild(overlay); resolve({ action: 'share', text }); };
            modal.querySelector('#downloadBtn').onclick = () => { document.body.removeChild(overlay); resolve({ action: 'download', text: markdownText, title: threadTitle }); };
            modal.querySelector('#copyBtn').onclick = () => { document.body.removeChild(overlay); resolve({ action: 'copy', text }); };
            modal.querySelector('#cancelBtn').onclick = () => { document.body.removeChild(overlay); resolve({ action: 'cancel' }); };
        });
    }

    // ─────────────────────────────────────────────
    // THREAD EXTRACTION CORE
    // (works on any URL passed in, not just current page)
    // ─────────────────────────────────────────────

    async function extractThread(threadUrl, onStatus) {
        function status(msg) { if (onStatus) onStatus(msg); }

        function getLastPageNumberFromDoc(doc) {
            let maxPage = 1;
            const allLinks = doc.querySelectorAll('a[href]');
            for (const elem of allLinks) {
                const href = elem.href || '';
                let m = href.match(/\/(\d+)\/?(?:\?|#|$)/);
                if (m) { const n = parseInt(m[1]); if (!isNaN(n) && n > maxPage) maxPage = n; }
                m = href.match(/[?&]page=(\d+)/);
                if (m) { const n = parseInt(m[1]); if (!isNaN(n) && n > maxPage) maxPage = n; }
                const textMatch = elem.textContent.match(/^\d+$/);
                if (textMatch) { const n = parseInt(elem.textContent); if (!isNaN(n) && n > maxPage) maxPage = n; }
            }
            // Check "last" links
            for (const link of allLinks) {
                const t = link.textContent.toLowerCase().trim();
                if (t === 'last' || t === '»' || t === '>>') {
                    let m = link.href.match(/\/(\d+)\/?(?:\?|#|$)/);
                    if (m) { const n = parseInt(m[1]); if (!isNaN(n) && n > maxPage) maxPage = n; }
                    m = link.href.match(/[?&]page=(\d+)/);
                    if (m) { const n = parseInt(m[1]); if (!isNaN(n) && n > maxPage) maxPage = n; }
                }
            }
            return maxPage;
        }

        function getBaseUrl(url) {
            let base = url.split('?')[0].split('#')[0];
            base = base.replace(/\/\d+\/?$/, '');
            return base;
        }

        function buildPageUrl(url, pageNum) {
            const baseUrl = getBaseUrl(url);
            if (url.includes('showthread.php')) {
                const m = url.match(/[?&]t=(\d+)/);
                if (!m) throw new Error('Could not extract thread ID');
                return `${new URL(url).origin}${new URL(url).pathname}?t=${m[1]}&page=${pageNum}`;
            } else {
                return `${baseUrl}/${pageNum}/`;
            }
        }

        function gmFetch(pageUrl) {
            // Use GM_xmlhttpRequest to bypass CORS when fetching cross-origin forum pages
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    timeout: 30000,
                    onload: (resp) => {
                        if (resp.status >= 200 && resp.status < 300) {
                            resolve(new DOMParser().parseFromString(resp.responseText, 'text/html'));
                        } else {
                            reject(new Error(`HTTP ${resp.status}`));
                        }
                    },
                    onerror: () => reject(new Error(`Network error fetching ${pageUrl}`)),
                    ontimeout: () => reject(new Error(`Timeout fetching ${pageUrl}`))
                });
            });
        }

        async function fetchPage(url, pageNum) {
            const pageUrl = buildPageUrl(url, pageNum);
            return gmFetch(pageUrl);
        }

        async function adaptiveFetch(url, pageNum, delay, retry = 0) {
            try {
                const doc = await fetchPage(url, pageNum);
                return { success: true, doc, newDelay: delay };
            } catch (e) {
                if (retry < 3) {
                    const nd = delay === 0 ? 200 : Math.min(delay + 200, 1000);
                    await new Promise(r => setTimeout(r, nd));
                    return adaptiveFetch(url, pageNum, nd, retry + 1);
                }
                return { success: false, doc: null, newDelay: delay, error: e.message };
            }
        }

        function extractPostsFromDoc(doc, pageNum) {
            const posts = [];
            doc.querySelectorAll('article').forEach((article, i) => {
                try {
                    const usernameElem = article.querySelector('.user_name, .username, [class*="username"]');
                    const username = usernameElem ? usernameElem.textContent.trim() : 'Unknown User';
                    const timestampElem = article.querySelector('.post_date, time, [class*="post-date"]');
                    const timestamp = timestampElem ? timestampElem.textContent.trim() : '';
                    const postId = article.id || article.getAttribute('data-post-id') || null;
                    const contentElem = article.querySelector('.post_content, .post-content, [class*="post_content"]');
                    if (contentElem) {
                        const clone = contentElem.cloneNode(true);
                        clone.querySelectorAll('.bbcode_quote, .signature, .quote, [class*="signature"]').forEach(el => el.remove());
                        const content = clone.textContent.replace(/\s+/g, ' ').trim();
                        if (content) posts.push({ username, timestamp, content, postId, contentHash: hashString(content.substring(0, 100)) });
                    }
                } catch(e) {}
            });
            return posts;
        }

        // === MAIN EXTRACTION ===

        // Fetch page 1 first to get total pages + title
        status('🔍 Scanning thread...');
        const firstDoc = await fetchPage(threadUrl, 1);
        const lastPage = getLastPageNumberFromDoc(firstDoc);

        const titleSelectors = ['.thread_title', 'h1', '.topictitle', '[class*="thread-title"]'];
        let title = '';
        for (const sel of titleSelectors) {
            const el = firstDoc.querySelector(sel);
            if (el && el.textContent.trim()) { title = el.textContent.trim(); break; }
        }

        status(`📚 Found ${lastPage} page${lastPage > 1 ? 's' : ''}`);
        await new Promise(r => setTimeout(r, 500));

        const allPagesData = [];
        const failedPages = [];
        const seenHashes = new Set();
        let currentDelay = 0;
        let consecutiveSuccesses = 0;
        let allText = title ? `${title}\n${'='.repeat(70)}\n\n` : '';

        for (let page = 1; page <= lastPage; page++) {
            status(`📥 Page ${page}/${lastPage}${currentDelay > 0 ? ` (${currentDelay}ms)` : ''}...`);

            let doc;
            if (page === 1) {
                doc = firstDoc; // Reuse already-fetched page 1
            } else {
                const result = await adaptiveFetch(threadUrl, page, currentDelay);
                if (!result.success) {
                    failedPages.push(page);
                    allPagesData.push({ pageNum: page, postCount: 0, users: [], posts: [] });
                    consecutiveSuccesses = 0;
                    continue;
                }
                doc = result.doc;
                if (result.newDelay > currentDelay) currentDelay = result.newDelay;
            }

            consecutiveSuccesses++;
            if (consecutiveSuccesses >= 10 && currentDelay > 0) {
                currentDelay = Math.max(0, currentDelay - 50);
            }

            const posts = extractPostsFromDoc(doc, page);

            // Duplicate detection
            let dupCount = 0;
            const pageHashes = new Set();
            posts.forEach(p => {
                pageHashes.add(p.contentHash);
                if (seenHashes.has(p.contentHash)) dupCount++;
            });
            if (posts.length > 0 && dupCount / posts.length > 0.8) {
                status(`⚠️ Stopped at page ${page - 1} (duplicates)`);
                await new Promise(r => setTimeout(r, 1500));
                break;
            }
            pageHashes.forEach(h => seenHashes.add(h));

            allText += `\n${'─'.repeat(70)}\nPAGE ${page} (${posts.length} posts)\n${'─'.repeat(70)}\n\n`;
            posts.forEach(post => {
                allText += `👤 ${post.username}`;
                if (post.timestamp) allText += ` • ${post.timestamp}`;
                allText += `\n${post.content}\n\n`;
            });

            allPagesData.push({ pageNum: page, postCount: posts.length, users: posts.map(p => p.username).filter(u => u !== 'Unknown User'), posts });

            if (page < lastPage && currentDelay > 0) await new Promise(r => setTimeout(r, currentDelay));
        }

        const totalPosts = allPagesData.reduce((s, p) => s + p.postCount, 0);
        const speedInfo = currentDelay === 0 ? 'Max speed' : `${currentDelay}ms delay`;
        const failedInfo = failedPages.length > 0 ? `\nFailed pages: ${failedPages.join(', ')}` : '';
        const header = `RFD THREAD EXPORT\nExtracted: ${new Date().toLocaleString()}\nTotal: ${totalPosts} posts across ${lastPage} pages\nSpeed: ${speedInfo}${failedInfo}\n\n`;
        allText = header + allText;

        const markdownText = convertToMarkdown(title, allPagesData, totalPosts, lastPage, currentDelay, failedPages);

        return { allText, markdownText, allPagesData, totalPosts, lastPage, failedPages, title, threadUrl };
    }

    // ─────────────────────────────────────────────
    // MODE A: THREAD PAGE (existing behaviour)
    // ─────────────────────────────────────────────

    async function initThreadPage() {
        await waitForBody();

        const button = document.createElement('button');
        button.innerHTML = '📋';
        button.style.cssText = `position:fixed;top:10px;right:10px;z-index:999999999;padding:10px 14px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:2px solid #fff;border-radius:8px;font-size:20px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.5);cursor:pointer;font-family:Arial,sans-serif;touch-action:manipulation;`;
        document.body.appendChild(button);

        const statusEl = document.createElement('div');
        statusEl.style.cssText = `position:fixed;top:55px;right:10px;z-index:999999999;padding:8px 12px;background:rgba(0,0,0,0.9);color:white;border-radius:6px;font-size:12px;display:none;max-width:200px;backdrop-filter:blur(10px);font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);text-align:center;border:1px solid rgba(255,255,255,0.3);`;
        document.body.appendChild(statusEl);

        const showStatus = (msg) => { statusEl.textContent = msg; statusEl.style.display = 'block'; };
        const hideStatus = () => { statusEl.style.display = 'none'; };

        async function go() {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.textContent = '⏳';

            try {
                const result = await extractThread(window.location.href, showStatus);
                const { allText, markdownText, allPagesData, totalPosts, lastPage, failedPages, title } = result;

                const statusMsg = failedPages.length > 0 ? `⚠️ Done (${failedPages.length} failed)` : `✅ Done!`;
                showStatus(statusMsg);
                await new Promise(r => setTimeout(r, 800));
                hideStatus();

                const confirmed = await showVerificationSummary(allPagesData, totalPosts, failedPages);
                if (!confirmed) { showStatus('❌ Cancelled'); setTimeout(hideStatus, 2000); return; }

                const choice = await showCopyOrShareChoice(allText, markdownText, totalPosts, lastPage, title);
                await handleChoice(choice, totalPosts, lastPage, showStatus, hideStatus);

            } catch (e) {
                console.error(e);
                showStatus(`❌ ${e.message}`);
                alert(`Failed: ${e.message}`);
                setTimeout(hideStatus, 5000);
            } finally {
                button.disabled = false;
                button.style.opacity = '1';
                button.textContent = '📋';
            }
        }

        button.addEventListener('click', go);
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'C') { e.preventDefault(); go(); }
        });

        console.log('🚀 RFD Thread Extractor v4.8 (thread mode) loaded');
    }

    // ─────────────────────────────────────────────
    // MODE B: INDEX / SEARCH PAGE — THREAD PICKER
    // ─────────────────────────────────────────────

    async function initIndexPage() {
        await waitForBody();

        // Floating picker button
        const button = document.createElement('button');
        button.innerHTML = '🗂️';
        button.title = 'Pick threads to extract';
        button.style.cssText = `position:fixed;top:10px;right:10px;z-index:999999999;padding:10px 14px;background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:white;border:2px solid #fff;border-radius:8px;font-size:20px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.5);cursor:pointer;font-family:Arial,sans-serif;touch-action:manipulation;`;
        document.body.appendChild(button);

        const statusEl = document.createElement('div');
        statusEl.style.cssText = `position:fixed;top:55px;right:10px;z-index:999999999;padding:8px 12px;background:rgba(0,0,0,0.9);color:white;border-radius:6px;font-size:12px;display:none;max-width:220px;backdrop-filter:blur(10px);font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);text-align:center;border:1px solid rgba(255,255,255,0.3);`;
        document.body.appendChild(statusEl);

        const showStatus = (msg) => { statusEl.textContent = msg; statusEl.style.display = 'block'; };
        const hideStatus = () => { statusEl.style.display = 'none'; };

        // Wait for thread links to appear in DOM (needed for hash-bang / SPA pages like www.redflagdeals.com/search/)
        function waitForThreadLinks(timeoutMs) {
            timeoutMs = timeoutMs || 8000;
            return new Promise(function(resolve) {
                var found = extractThreadLinks();
                if (found.length > 0) { resolve(found); return; }

                var start = Date.now();
                var obs = new MutationObserver(function() {
                    var links = extractThreadLinks();
                    if (links.length > 0) {
                        obs.disconnect();
                        resolve(links);
                    } else if (Date.now() - start > timeoutMs) {
                        obs.disconnect();
                        resolve([]);
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true });
                setTimeout(function() { obs.disconnect(); resolve(extractThreadLinks()); }, timeoutMs);
            });
        }

        function extractThreadLinks() {
            const threads = [];
            const seen = new Set();
            const allLinks = [...document.querySelectorAll('a[href]')];

            for (const link of allLinks) {
                const href = link.href || '';

                // Hard requirement: must be on forums subdomain only
                if (!href.startsWith('https://forums.redflagdeals.com/')) continue;

                // Exclude non-thread pages immediately
                if (/\/(?:memberlist|ucp|posting|search|feed|viewforum)\.php/.test(href)) continue;
                if (/\/hot-deals-|\/expired-offers-|\/computers-|\/shopping-|\/automotive-|\/home-garden-|\/personal-finance-|\/cell-phones-|\/entertainment-|\/careers-|\/request-deal-|\/pc-video-games-|\/ongoing-deal-|\/search\.php/.test(href)) continue;

                // Pattern 1: /showthread.php?t=12345
                const showThreadMatch = href.match(/^https:\/\/forums\.redflagdeals\.com\/showthread\.php\?(?:.*&)?t=(\d+)/);

                // Pattern 2: /slug-name-XXXXXXX/ — thread IDs are 6-8 digits
                // Exclude pagination (/slug-2803180/2/) and non-thread slugs
                const slugMatch = href.match(/^https:\/\/forums\.redflagdeals\.com\/[^/?#]+-(\d{6,8})\/?$/);

                if (!showThreadMatch && !slugMatch) continue;

                // Dedup key
                const dedupKey = showThreadMatch
                    ? 'st_' + showThreadMatch[1]
                    : 'sl_' + (slugMatch ? slugMatch[1] : href.split('?')[0].split('#')[0].replace(/\/$/, ''));
                if (seen.has(dedupKey)) continue;
                seen.add(dedupKey);

                const forumHref = href.split('#')[0]; // preserve ?t=12345 query params

                // Title
                let title = link.textContent.trim();
                if (!title || title.length < 5) {
                    const parent = link.closest('[class*="thread"], [class*="topic"], [class*="result"], [class*="item"], [class*="deal"], [class*="card"], tr, li, article');
                    if (parent) {
                        const heading = parent.querySelector('h2, h3, h4, [class*="title"], [class*="heading"]');
                        if (heading) title = heading.textContent.trim();
                        if (!title || title.length < 5) {
                            const anyLink = parent.querySelector('a');
                            if (anyLink) title = anyLink.textContent.trim();
                        }
                    }
                }
                if (!title || title.length < 8) continue;
                if (/rules|read.before.posting/i.test(forumHref)) continue;

                // Reply count + last activity
                let replies = '';
                let lastActivity = '';
                const row = link.closest('[class*="thread"], [class*="topic"], [class*="result"], [class*="item"], [class*="deal"], [class*="card"], tr, li, article, div');
                if (row) {
                    const replyEl = row.querySelector('[class*="reply"], [class*="replies"], [class*="comment"], [class*="posts"], [class*="count"], [class*="response"]');
                    if (replyEl) {
                        const m = replyEl.textContent.match(/\d[\d,]*/);
                        if (m) replies = m[0].replace(/,/g, '');
                    }
                    if (!replies) {
                        const commentMatch = row.textContent.match(/(\d+)\s*(comment|reply|replies|response)/i) ||
                                             row.textContent.match(/\+\s*(\d+)/);
                        if (commentMatch) replies = commentMatch[1];
                    }
                    const timeEl = row.querySelector('time, [class*="date"], [class*="time"], [class*="ago"], [class*="last"], [class*="posted"], [datetime]');
                    if (timeEl) {
                        lastActivity = (timeEl.getAttribute('datetime') || timeEl.textContent).trim().replace(/\s+/g, ' ').substring(0, 30);
                    }
                }

                threads.push({ title, href: forumHref, replies, lastActivity });
            }
            return threads;
        }

        function scrapeThreadList() { return extractThreadLinks(); }

        function showThreadPicker(threads) {
            return new Promise((resolve) => {
                if (threads.length === 0) {
                    alert('No extractable thread links found on this page.');
                    resolve([]);
                    return;
                }

                const overlay = document.createElement('div');
                overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:999999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);font-family:Arial,sans-serif;padding:16px;box-sizing:border-box;`;

                const modal = document.createElement('div');
                modal.style.cssText = `background:white;border-radius:14px;padding:0;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6);overflow:hidden;`;

                // Header
                const header = document.createElement('div');
                header.style.cssText = `padding:18px 20px 14px;border-bottom:1px solid #eee;background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:white;flex-shrink:0;`;
                header.innerHTML = `
                    <h2 style="margin:0 0 6px;font-size:18px;">🗂️ Select Threads to Extract</h2>
                    <p style="margin:0;font-size:13px;opacity:0.9;">${threads.length} thread${threads.length !== 1 ? 's' : ''} found on this page</p>
                `;

                // Controls bar
                const controls = document.createElement('div');
                controls.style.cssText = `padding:10px 16px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center;background:#fafafa;flex-shrink:0;flex-wrap:wrap;`;
                controls.innerHTML = `
                    <button id="selectAll" style="padding:6px 12px;background:#667eea;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;">☑ Select All</button>
                    <button id="deselectAll" style="padding:6px 12px;background:#999;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">☐ Deselect All</button>
                    <span id="selCount" style="font-size:13px;color:#555;margin-left:4px;">0 selected</span>
                `;

                // Thread list
                const listWrapper = document.createElement('div');
                listWrapper.style.cssText = `overflow-y:auto;flex:1;padding:8px 0;`;

                threads.forEach((thread, i) => {
                    const item = document.createElement('div');
                    item.style.cssText = `display:flex;align-items:flex-start;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background 0.1s;gap:10px;`;
                    item.innerHTML = `
                        <input type="checkbox" data-idx="${i}" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;cursor:pointer;accent-color:#667eea;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:14px;font-weight:600;color:#222;line-height:1.3;margin-bottom:4px;word-break:break-word;">${thread.title}</div>
                            <div style="font-size:12px;color:#888;display:flex;gap:12px;flex-wrap:wrap;">
                                ${thread.replies ? `<span>💬 ${thread.replies} replies</span>` : ''}
                                ${thread.lastActivity ? `<span>🕐 ${thread.lastActivity}</span>` : ''}
                            </div>
                        </div>
                    `;

                    // Click anywhere on row to toggle
                    item.addEventListener('click', (e) => {
                        if (e.target.tagName !== 'INPUT') {
                            const cb = item.querySelector('input[type="checkbox"]');
                            cb.checked = !cb.checked;
                        }
                        updateCount();
                        item.style.background = item.querySelector('input').checked ? '#f0f4ff' : '';
                    });
                    item.querySelector('input').addEventListener('change', () => {
                        updateCount();
                        item.style.background = item.querySelector('input').checked ? '#f0f4ff' : '';
                    });

                    listWrapper.appendChild(item);
                });

                // Footer
                const footer = document.createElement('div');
                footer.style.cssText = `padding:14px 16px;border-top:1px solid #eee;display:flex;gap:10px;flex-shrink:0;background:#fafafa;`;
                footer.innerHTML = `
                    <button id="extractBtn" style="flex:1;padding:13px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer;opacity:0.4;" disabled>🚀 Extract Selected</button>
                    <button id="closeBtn" style="padding:13px 16px;background:#eee;color:#555;border:none;border-radius:8px;font-size:15px;cursor:pointer;">✕</button>
                `;

                function updateCount() {
                    const checked = listWrapper.querySelectorAll('input:checked').length;
                    controls.querySelector('#selCount').textContent = `${checked} selected`;
                    const btn = footer.querySelector('#extractBtn');
                    btn.disabled = checked === 0;
                    btn.style.opacity = checked > 0 ? '1' : '0.4';
                }

                modal.appendChild(header);
                modal.appendChild(controls);
                modal.appendChild(listWrapper);
                modal.appendChild(footer);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                controls.querySelector('#selectAll').onclick = () => {
                    listWrapper.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; cb.closest('div').style.background = '#f0f4ff'; });
                    updateCount();
                };
                controls.querySelector('#deselectAll').onclick = () => {
                    listWrapper.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.closest('div').style.background = ''; });
                    updateCount();
                };
                footer.querySelector('#closeBtn').onclick = () => { document.body.removeChild(overlay); resolve([]); };
                footer.querySelector('#extractBtn').onclick = () => {
                    const selected = [];
                    listWrapper.querySelectorAll('input:checked').forEach(cb => {
                        selected.push(threads[parseInt(cb.dataset.idx)]);
                    });
                    document.body.removeChild(overlay);
                    resolve(selected);
                };
            });
        }

        async function runBatchExtraction(selectedThreads) {
            button.disabled = true;
            button.style.opacity = '0.6';

            const results = [];   // collect all successful extractions
            const failed = [];    // track failed thread titles

            // ── Phase 1: extract all threads silently ──
            for (let i = 0; i < selectedThreads.length; i++) {
                const thread = selectedThreads[i];
                const progress = `[${i + 1}/${selectedThreads.length}]`;
                showStatus(`${progress} Fetching...`);

                try {
                    const result = await extractThread(thread.href, (msg) => showStatus(`${progress} ${msg}`));
                    results.push(result);
                    showStatus(`${progress} ✅ Done`);
                    await new Promise(r => setTimeout(r, 400));
                } catch (e) {
                    console.error(`Failed: ${thread.href}`, e);
                    failed.push(thread.title);
                    showStatus(`${progress} ❌ ${e.message}`);
                    await new Promise(r => setTimeout(r, 1500));
                }

                if (i < selectedThreads.length - 1) {
                    showStatus(`⏸ Next thread in 1s...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (results.length === 0) {
                showStatus('❌ All threads failed');
                setTimeout(hideStatus, 3000);
                button.disabled = false;
                button.style.opacity = '1';
                return;
            }

            hideStatus();

            // ── Phase 2: combine all results into one payload ──
            const totalPosts = results.reduce((s, r) => s + r.totalPosts, 0);
            const totalPages = results.reduce((s, r) => s + r.lastPage, 0);

            // Combined plain text
            let combinedText = `RFD BATCH EXPORT
Extracted: ${new Date().toLocaleString()}
`;
            combinedText += `Threads: ${results.length} | Total posts: ${totalPosts} | Total pages: ${totalPages}
`;
            if (failed.length > 0) combinedText += `Failed: ${failed.join(', ')}
`;
            combinedText += `
${'='.repeat(70)}

`;
            results.forEach(r => { combinedText += r.allText + `
${'='.repeat(70)}

`; });

            // Combined markdown
            let combinedMd = `# RFD Batch Export

`;
            combinedMd += `**Extracted:** ${new Date().toLocaleString()}
`;
            combinedMd += `**Threads:** ${results.length} | **Total posts:** ${totalPosts} | **Total pages:** ${totalPages}
`;
            if (failed.length > 0) combinedMd += `
**⚠️ Failed:** ${failed.join(', ')}
`;
            combinedMd += `
---

`;
            results.forEach(r => { combinedMd += r.markdownText + `
---

`; });

            // Combined summary for verification modal
            const combinedPagesData = results.flatMap(r => r.allPagesData.map(p => ({
                ...p,
                pageNum: `${r.title.substring(0, 25)}… p${p.pageNum}`
            })));
            const combinedFailed = results.flatMap(r => r.failedPages.map(p => `${r.title.substring(0,20)}…p${p}`));

            // ── Phase 3: show summary once, then ask once ──
            const confirmed = await showVerificationSummary(combinedPagesData, totalPosts, combinedFailed);
            if (!confirmed) {
                showStatus('❌ Cancelled');
                setTimeout(hideStatus, 2000);
                button.disabled = false;
                button.style.opacity = '1';
                return;
            }

            const batchTitle = results.length === 1 ? results[0].title : `rfd-batch-${results.length}-threads`;
            const choice = await showCopyOrShareChoice(combinedText, combinedMd, totalPosts, totalPages, batchTitle);
            await handleChoice(choice, totalPosts, totalPages, showStatus, hideStatus);

            showStatus('🎉 All done!');
            setTimeout(hideStatus, 3000);
            button.disabled = false;
            button.style.opacity = '1';
        }

        button.addEventListener('click', async () => {
            button.disabled = true;
            button.style.opacity = '0.6';
            showStatus('🔍 Finding threads...');

            // waitForThreadLinks handles both static pages (instant) and
            // SPA/hash-bang pages like www.redflagdeals.com/search/#!/... (waits for DOM)
            const threads = await waitForThreadLinks(8000);

            hideStatus();
            button.disabled = false;
            button.style.opacity = '1';

            if (threads.length === 0) {
                alert('No forum thread links found on this page.\n\nIf you are on a search results page, wait for results to fully load then try again.');
                return;
            }

            const selected = await showThreadPicker(threads);
            if (selected.length > 0) await runBatchExtraction(selected);
        });

        console.log('🚀 RFD Thread Extractor v4.8 (picker mode) loaded —', url);
    }

    // ─────────────────────────────────────────────
    // SHARED: Handle copy/share/download choice
    // ─────────────────────────────────────────────

    async function handleChoice(choice, totalPosts, lastPage, showStatus, hideStatus) {
        if (choice.action === 'cancel') {
            showStatus('❌ Cancelled');
            setTimeout(hideStatus, 2000);
            return;
        }

        if (choice.action === 'download') {
            showStatus('📥 Downloading...');
            let filename = 'rfd-thread';
            if (choice.title) {
                filename = choice.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
            }
            filename += `-${new Date().toISOString().split('T')[0]}.md`;
            downloadFile(choice.text, filename);
            showStatus('✅ Downloaded!');
            if (typeof GM_notification !== 'undefined') GM_notification({ text: `Downloaded ${totalPosts} posts from ${lastPage} pages as ${filename}`, title: '✅ RFD Downloaded', timeout: 4000 });
            setTimeout(hideStatus, 3000);

        } else if (choice.action === 'share') {
            showStatus('📤 Sharing...');
            try {
                await navigator.share({ title: 'RFD Thread Export', text: choice.text });
                showStatus('✅ Shared!');
            } catch (e) {
                showStatus(e.name === 'AbortError' ? '❌ Share cancelled' : `❌ Share failed`);
            }
            setTimeout(hideStatus, 3000);

        } else if (choice.action === 'copy') {
            showStatus('📋 Copying...');
            let copied = false;
            if (typeof GM_setClipboard !== 'undefined') { GM_setClipboard(choice.text); copied = true; }
            else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(choice.text); copied = true; }
            else {
                const ta = document.createElement('textarea');
                ta.value = choice.text;
                ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
                document.body.appendChild(ta);
                ta.focus(); ta.select();
                try { copied = document.execCommand('copy'); } catch(e) {}
                document.body.removeChild(ta);
            }
            if (copied) {
                showStatus(`✅ Copied ${totalPosts} posts!`);
                if (typeof GM_notification !== 'undefined') GM_notification({ text: `Copied ${totalPosts} posts from ${lastPage} pages`, title: '✅ RFD Copied', timeout: 4000 });
            } else {
                showStatus('❌ Copy failed');
            }
            setTimeout(hideStatus, 3000);
        }
    }

    // ─────────────────────────────────────────────
    // BOOT
    // ─────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => isThreadPage ? initThreadPage() : initIndexPage());
    } else {
        isThreadPage ? initThreadPage() : initIndexPage();
    }

})();

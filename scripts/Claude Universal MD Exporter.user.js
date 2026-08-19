// ==UserScript==
// @name         Claude Universal MD Exporter
// @namespace    claude-universal-exporter
// @version      9.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Claude%20Universal%20MD%20Exporter.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Claude%20Universal%20MD%20Exporter.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Claude%20Universal%20MD%20Exporter.user.js
// @description  Works on both mobile and desktop Claude - improved positioning and filtering
// @author       AI
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
'use strict';

const CONFIG = {
  maxScrollAttempts: 80,
  scrollDelay: 250,
  messageMinLength: 15,
  debug: false  // Set to true to see debug logs
};

function log(...args) {
  if (CONFIG.debug) console.log('[Claude Exporter]', ...args);
}

function notify(msg, color = '#10b981', duration = 3000) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    background: ${color}; color: white; padding: 12px 20px;
    border-radius: 8px; font-family: system-ui; font-size: 14px;
    font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
         window.innerWidth < 768;
}

// Get conversation title from page
function getConversationTitle() {
  // Try multiple selectors for title
  const titleSelectors = [
    'h1',
    '[data-testid*="title"]',
    'title',
    '.font-title',
    'header h1',
    'header h2'
  ];

  for (const selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent?.trim()) {
      let title = el.textContent.trim();
      // Clean up title
      title = title.replace(/[^a-zA-Z0-9\s-]/g, '');
      title = title.substring(0, 50); // Max 50 chars
      if (title.length > 5) {
        log('Found title:', title);
        return title;
      }
    }
  }

  // Fallback: try to get from URL
  const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
  if (match) {
    return match[1].substring(0, 20);
  }

  return 'conversation';
}

async function autoScroll() {
  notify('Loading conversation...', '#3b82f6');

  let lastHeight = 0;
  let attempts = 0;

  while (attempts < CONFIG.maxScrollAttempts) {
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, CONFIG.scrollDelay));

    const currentHeight = document.documentElement.scrollHeight;
    if (currentHeight === lastHeight) break;

    lastHeight = currentHeight;
    attempts++;

    if (attempts % 20 === 0) {
      log(`Scroll progress: ${attempts}/${CONFIG.maxScrollAttempts}`);
    }
  }

  log(`Scrolling complete after ${attempts} attempts`);
}

function extractMessages() {
  const strategies = [
    extractFromMain,
    extractFromAllDivs,
    extractFromTextContent
  ];

  for (const strategy of strategies) {
    try {
      const messages = strategy();
      if (messages && messages.length > 0) {
        log(`Strategy '${strategy.name}' found ${messages.length} messages`);
        return messages;
      }
    } catch (err) {
      log(`Strategy '${strategy.name}' failed:`, err.message);
    }
  }

  throw new Error('All extraction strategies failed');
}

function extractFromMain() {
  const main = document.querySelector('main');
  if (!main) throw new Error('No main element');

  const allDivs = Array.from(main.querySelectorAll('div'));
  return filterAndDeduplicateDivs(allDivs);
}

function extractFromAllDivs() {
  // Get main conversation area only, exclude sidebar
  let conversationContainer = document.querySelector('main');
  if (!conversationContainer) {
    // Fallback: exclude obvious sidebar elements
    conversationContainer = document.body;
  }

  const allDivs = Array.from(conversationContainer.querySelectorAll('div'));
  log(`Total divs in conversation area: ${allDivs.length}`);
  return filterAndDeduplicateDivs(allDivs);
}

function extractFromTextContent() {
  const main = document.querySelector('main');
  const container = main || document.body;
  const allDivs = Array.from(container.querySelectorAll('div'));
  return filterAndDeduplicateDivs(allDivs);
}

function isInSidebar(element) {
  // Check if element is in sidebar by looking at parent structure
  let current = element;
  while (current && current !== document.body) {
    const classes = current.className || '';
    const ariaLabel = current.getAttribute('aria-label') || '';

    // Common sidebar indicators
    if (classes.includes('sidebar') ||
        classes.includes('nav') ||
        ariaLabel.includes('navigation') ||
        ariaLabel.includes('sidebar')) {
      return true;
    }

    current = current.parentElement;
  }

  // Also check if it's to the far left (likely sidebar)
  const rect = element.getBoundingClientRect();
  if (rect.right < 300) { // Sidebar is usually < 300px from left
    return true;
  }

  return false;
}

function filterAndDeduplicateDivs(divs) {
  // Filter out sidebar elements first
  const nonSidebarDivs = divs.filter(div => !isInSidebar(div));
  log(`After sidebar filter: ${nonSidebarDivs.length} divs`);

  const candidates = nonSidebarDivs.filter(div => {
    const text = div.innerText?.trim();
    if (!text || text.length < CONFIG.messageMinLength) return false;

    // Skip if it has many child divs with text (likely a container)
    const textChildren = Array.from(div.children).filter(c =>
      c.innerText?.trim().length > 50
    );

    return textChildren.length <= 3 &&
           text.length >= CONFIG.messageMinLength &&
           text.length < 100000;
  });

  log(`Candidate divs: ${candidates.length}`);

  const messages = [];
  const seen = new Set();

  for (const div of candidates) {
    const text = div.innerText.trim();

    // Create signature from first 80 chars
    const signature = text.substring(0, 80).toLowerCase().replace(/\s+/g, ' ');

    if (seen.has(signature)) continue;

    // Skip very short messages or UI elements
    if (text.length < 20) continue;
    if (/^(Copy|Edit|Export|Reply|Share|Retry|Continue)$/i.test(text)) continue;

    // Skip common sidebar text patterns
    if (text.match(/^(New chat|Chat history|Settings|Recent|Today|Yesterday|Last 7 days)$/i)) continue;

    seen.add(signature);
    messages.push({
      text,
      position: div.getBoundingClientRect().top + window.scrollY
    });
  }

  messages.sort((a, b) => a.position - b.position);

  log(`Unique messages extracted: ${messages.length}`);
  return messages.map(m => m.text);
}

function buildMarkdown(messages) {
  let md = '# Claude Conversation Export\n\n';
  md += `*Exported: ${new Date().toLocaleString()}*\n`;
  md += `*Messages: ${messages.length}*\n`;
  md += `*Platform: ${isMobile() ? 'Mobile' : 'Desktop'}*\n\n`;
  md += '---\n\n';

  messages.forEach((text, i) => {
    const role = i % 2 === 0 ? 'User' : 'Assistant';
    md += `## ${role}\n\n${text}\n\n---\n\n`;
  });

  return md;
}

function downloadMarkdown(content) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const title = getConversationTitle();
  const titleSlug = title.replace(/\s+/g, '-').toLowerCase();
  const filename = `${titleSlug}-${timestamp}.md`;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  log('Download triggered:', filename);
}

async function exportConversation() {
  notify('Starting export...', '#3b82f6');

  try {
    await autoScroll();
    const messages = extractMessages();

    if (!messages || messages.length === 0) {
      throw new Error('No messages found in conversation');
    }

    const markdown = buildMarkdown(messages);
    downloadMarkdown(markdown);

    notify(`✅ Exported ${messages.length} messages!`, '#10b981');

  } catch (error) {
    log('Export error:', error);
    notify(`❌ ${error.message}`, '#ef4444', 5000);
  }
}

function createButton() {
  const btn = document.createElement('button');
  btn.innerHTML = '📥';
  btn.title = 'Export conversation to Markdown';

  const mobile = isMobile();

  // Mobile: top-right to avoid keyboard, Desktop: bottom-right
  btn.style.cssText = mobile ? `
    position: fixed; top: 70px; right: 16px;
    z-index: 999999; width: 44px; height: 44px;
    border-radius: 50%; border: none;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white; font-size: 18px; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transition: all 0.2s ease; touch-action: manipulation;
  ` : `
    position: fixed; bottom: 24px; right: 24px;
    z-index: 999999; padding: 12px 20px; border-radius: 24px;
    border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white; font-size: 14px; font-weight: 600;
    font-family: system-ui; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transition: all 0.2s ease;
  `;

  if (!mobile) {
    btn.innerHTML = '📥 Export';
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.05)';
    btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
  });

  btn.addEventListener('click', exportConversation);

  return btn;
}

function init() {
  if (document.body) {
    const btn = createButton();
    document.body.appendChild(btn);
    log('Universal exporter initialized');
    log('Platform:', isMobile() ? 'Mobile' : 'Desktop');
    console.log('🟣 Claude Universal MD Exporter loaded. Click export button when ready.');
  } else {
    setTimeout(init, 500);
  }
}

init();

})();

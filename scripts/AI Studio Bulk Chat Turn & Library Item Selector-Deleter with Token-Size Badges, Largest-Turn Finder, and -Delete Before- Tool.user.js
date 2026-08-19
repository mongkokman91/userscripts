// ==UserScript==
// @name         AI Studio Bulk Chat Turn & Library Item Selector/Deleter with Token-Size Badges, Largest-Turn Finder, and "Delete Before" Tool
// @namespace    http://tampermonkey.net/
// @version      0.7.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/AI%20Studio%20Bulk%20Chat%20Turn%20%26%20Library%20Item%20Selector-Deleter%20with%20Token-Size%20Badges%2C%20Largest-Turn%20Finder%2C%20and%20-Delete%20Before-%20Tool.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/AI%20Studio%20Bulk%20Chat%20Turn%20%26%20Library%20Item%20Selector-Deleter%20with%20Token-Size%20Badges%2C%20Largest-Turn%20Finder%2C%20and%20-Delete%20Before-%20Tool.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/AI%20Studio%20Bulk%20Chat%20Turn%20%26%20Library%20Item%20Selector-Deleter%20with%20Token-Size%20Badges%2C%20Largest-Turn%20Finder%2C%20and%20-Delete%20Before-%20Tool.user.js
// @description  In chat view: shows an estimated token-size badge on every turn (self-calibrated against AI Studio's real token count), lets you multi-select and bulk delete turns, select the largest N or all turns above a token threshold, jump directly to the largest turns via a clickable list, and delete everything before a chosen turn. In library view: adds checkboxes and bulk delete (with auto-confirm) for saved prompts.
// @author       Your Name Here
// @match        https://aistudio.google.com/prompts/*
// @match        https://aistudio.google.com/library
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log("AI Studio Bulk Chat Turn & Library Item Selector/Deleter (v0.7.0): Script loading...");

    // --- Configuration ---
    // Chat View
    const CHAT_CHECKBOX_CLASS = 'gm-chat-select-checkbox';
    const CHAT_SELECTED_CLASS = 'gm-chat-selected';
    const CHAT_MULTI_DELETE_BUTTON_ID = 'gm-chat-multi-delete-button';
    const CHAT_DELETE_BEFORE_CLASS = 'gm-chat-delete-before-item';
    const CHAT_TOKEN_BADGE_CLASS = 'gm-chat-token-badge';
    const CHAT_SIZE_PANEL_ID = 'gm-chat-size-panel';

    // Library View
    const LIB_CHECKBOX_CLASS = 'gm-lib-select-checkbox';
    const LIB_HEADER_CHECKBOX_CLASS = 'gm-lib-header-select-checkbox';
    const LIB_SELECTED_CLASS = 'gm-lib-selected';
    const LIB_MULTI_DELETE_BUTTON_ID = 'gm-lib-multi-delete-button';
    const LIB_CHECKBOX_CELL_CLASS = 'gm-lib-checkbox-cell';
    const LIB_CHECKBOX_HEADER_CLASS = 'gm-lib-checkbox-header';

    // General
    const DELAY_BETWEEN_DELETES_MS = 100; // Increased slightly for confirm dialog stability
    const MENU_APPEAR_DELAY_MS = 0;
    const CONFIRM_DIALOG_WAIT_MS = 100; // Time to wait for the confirmation dialog after clicking menu delete
    const CHARS_PER_TOKEN = 4; // rough heuristic for estimating token count from character count

    // --- State ---
    let selectedChatTurns = new Set();
    let selectedLibraryItems = new Set();
    let isDeleting = false;
    let turnTokenEstimates = new Map(); // ms-chat-turn element -> estimated token count
    let calibratedCharsPerToken = CHARS_PER_TOKEN; // refined using AI Studio's own displayed total token count
    let lastActualTotalTokens = null;

    // --- Styles ---
    GM_addStyle(`
        /* --- Chat View Styles --- */
        ms-chat-turn .chat-turn-container {
            position: relative;
            padding-left: 35px !important;
            padding-right: 70px !important;
        }
        .${CHAT_CHECKBOX_CLASS} {
            position: absolute;
            left: 8px;
            top: 12px;
            z-index: 10;
            cursor: pointer;
            transform: scale(1.2);
        }
        .${CHAT_TOKEN_BADGE_CLASS} {
            position: absolute;
            right: 8px;
            top: 10px;
            z-index: 10;
            font-size: 11px;
            font-family: monospace;
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
            pointer-events: none;
            white-space: nowrap;
        }
        ms-chat-turn.${CHAT_SELECTED_CLASS} > div {
            background-color: rgba(0, 100, 255, 0.1);
            border-radius: 8px;
        }
        #${CHAT_MULTI_DELETE_BUTTON_ID} {
            margin-left: 10px;
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            opacity: 0.5;
            pointer-events: none;
            transition: opacity 0.2s;
        }
        #${CHAT_MULTI_DELETE_BUTTON_ID}.enabled {
            opacity: 1;
            pointer-events: auto;
        }
        #${CHAT_MULTI_DELETE_BUTTON_ID}:hover.enabled {
            background-color: #c82333;
        }
        #${CHAT_MULTI_DELETE_BUTTON_ID}:disabled {
            background-color: #a0a0a0;
            cursor: not-allowed;
        }
        .${CHAT_DELETE_BEFORE_CLASS} .delete-before-marker {
            margin-right: 8px;
            display: inline-block;
        }

        /* --- Chat Size Panel (token badges + select-largest tools) --- */
        #${CHAT_SIZE_PANEL_ID} {
            position: fixed;
            bottom: 16px;
            right: 16px;
            background: #1e1e1e;
            color: #fff;
            padding: 12px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 13px;
            z-index: 100000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            width: 230px;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-panel-title {
            font-weight: bold;
            margin-bottom: 8px;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-panel-status {
            margin-bottom: 8px;
            opacity: 0.85;
            line-height: 1.4;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-panel-row {
            display: flex;
            gap: 6px;
            margin-bottom: 6px;
        }
        #${CHAT_SIZE_PANEL_ID} input[type=number] {
            width: 50px;
        }
        #${CHAT_SIZE_PANEL_ID} button {
            flex: 1;
            cursor: pointer;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-panel-delete-btn {
            width: 100%;
            background: #c0392b;
            color: #fff;
            border: none;
            padding: 6px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 4px;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-panel-section-title {
            font-weight: bold;
            margin-top: 8px;
            margin-bottom: 4px;
            border-top: 1px solid #444;
            padding-top: 8px;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-jumplist {
            max-height: 160px;
            overflow-y: auto;
            margin-bottom: 8px;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-jump-item {
            padding: 4px 2px;
            font-size: 11px;
            cursor: pointer;
            border-bottom: 1px solid #333;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #${CHAT_SIZE_PANEL_ID} .gm-jump-item:hover {
            background: rgba(255,255,255,0.1);
        }

        /* --- Library View Styles --- */
        th.${LIB_CHECKBOX_HEADER_CLASS}, td.${LIB_CHECKBOX_CELL_CLASS} {
            width: 40px !important;
            padding: 0 8px 0 16px !important;
            box-sizing: border-box;
        }
        th.${LIB_CHECKBOX_HEADER_CLASS} input[type=checkbox],
        td.${LIB_CHECKBOX_CELL_CLASS} input[type=checkbox] {
            cursor: pointer;
            transform: scale(1.2);
            vertical-align: middle;
        }
        tr.${LIB_SELECTED_CLASS} {
            background-color: rgba(0, 100, 255, 0.08) !important;
        }
        #${LIB_MULTI_DELETE_BUTTON_ID} {
            margin-left: 8px;
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 0 12px;
            height: 36px;
            line-height: 36px;
            border-radius: 18px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            opacity: 0.5;
            pointer-events: none;
            transition: opacity 0.2s;
            display: inline-flex;
            align-items: center;
        }
        #${LIB_MULTI_DELETE_BUTTON_ID} .material-symbols-outlined {
            font-size: 18px;
            margin-right: 6px;
        }
        #${LIB_MULTI_DELETE_BUTTON_ID}.enabled {
            opacity: 1;
            pointer-events: auto;
        }
        #${LIB_MULTI_DELETE_BUTTON_ID}:hover.enabled {
            background-color: #c82333;
        }
        #${LIB_MULTI_DELETE_BUTTON_ID}:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
            opacity: 0.6;
        }

        /* --- General Menu Style --- */
        .mat-mdc-menu-panel { z-index: 1001 !important; }
        .cdk-overlay-container { z-index: 1002 !important; } /* Ensure dialog overlay is high */
    `);

    // ========================================================================
    // TOKEN ESTIMATION HELPERS (new)
    // ========================================================================

    // Strips out anything that isn't actual message content before measuring
    // text: icon-font buttons (copy/edit/more_vert/thumb_up render as literal
    // text like "more_vert" via Material Symbols ligatures) and our own
    // injected checkbox/badge, which would otherwise get counted too and
    // compound on every refresh.
    function getTurnCleanText(turnElement) {
        const clone = turnElement.cloneNode(true);
        clone.querySelectorAll(
            `button, .material-symbols-outlined, ms-chat-turn-options, .${CHAT_TOKEN_BADGE_CLASS}, input.${CHAT_CHECKBOX_CLASS}`
        ).forEach(n => n.remove());
        return clone.textContent || '';
    }

    function estimateTokens(turnElement) {
        // textContent (not innerText) deliberately — innerText forces a layout
        // reflow on every read, which froze the page on large conversations.
        const text = getTurnCleanText(turnElement);
        return Math.round(text.length / calibratedCharsPerToken);
    }

    let cachedTokenCountEl = null; // cached reference to AI Studio's own token-count element

    // AI Studio shows the conversation's real token count near the title
    // (e.g. "226,651 tokens"). We use that as ground truth to refine our
    // per-turn char-per-token ratio instead of relying on a fixed guess.
    function getActualTotalTokens() {
        if (cachedTokenCountEl && document.body.contains(cachedTokenCountEl)) {
            const text = cachedTokenCountEl.textContent.trim();
            const match = text.match(/^([\d,]+)\s+tokens?$/i);
            if (match) return parseInt(match[1].replace(/,/g, ''), 10);
            cachedTokenCountEl = null; // stale, fall through to rescan
        }
        // Full-page scan only happens once (or when the cached node is lost) —
        // scanning all elements every cycle was the other source of the freeze.
        const candidates = document.querySelectorAll('body *');
        for (const el of candidates) {
            if (el.children.length > 0) continue; // leaf nodes only
            const text = el.textContent.trim();
            if (/^[\d,]+\s+tokens?$/i.test(text)) {
                cachedTokenCountEl = el;
                return parseInt(text.replace(/[^\d]/g, ''), 10);
            }
        }
        return null;
    }

    function recalibrateTokenRatio() {
        const actualTotal = getActualTotalTokens();
        if (!actualTotal) return;
        const turns = document.querySelectorAll('ms-chat-session ms-chat-turn');
        let totalChars = 0;
        turns.forEach(t => { totalChars += getTurnCleanText(t).length; });
        if (totalChars > 0) {
            calibratedCharsPerToken = totalChars / actualTotal;
            lastActualTotalTokens = actualTotal;
            // Re-stamp existing badges with the refined ratio
            turns.forEach(t => upsertTokenBadge(t));
        }
    }

    function tokenBadgeColor(tokens) {
        if (tokens > 2000) return '#c0392b';
        if (tokens > 800) return '#e67e22';
        if (tokens > 300) return '#b8860b';
        return '#27ae60';
    }

    let badgeRefreshTimer = null;
    function scheduleBadgeRefresh() {
        clearTimeout(badgeRefreshTimer);
        badgeRefreshTimer = setTimeout(() => {
            document.querySelectorAll('ms-chat-session ms-chat-turn').forEach(t => upsertTokenBadge(t));
            updateChatSizePanelStatus();
        }, 1000);
    }

    function upsertTokenBadge(turnElement) {
        const tokens = estimateTokens(turnElement);
        turnTokenEstimates.set(turnElement, tokens);

        let badge = turnElement.querySelector(`.${CHAT_TOKEN_BADGE_CLASS}`);
        const container = turnElement.querySelector('.chat-turn-container') || turnElement;

        if (!badge) {
            badge = document.createElement('div');
            badge.className = CHAT_TOKEN_BADGE_CLASS;
            container.style.position = 'relative';
            container.appendChild(badge);
        }
        badge.textContent = `~${tokens} tok`;
        badge.style.background = tokenBadgeColor(tokens);
        return tokens;
    }

    // Central place that both the manual checkbox handler and the
    // "select largest" tools use, so selection state never gets out of sync.
    function setTurnSelected(turnElement, selected) {
        const checkbox = turnElement.querySelector(`input.${CHAT_CHECKBOX_CLASS}`);
        if (!checkbox || checkbox.disabled) return;
        checkbox.checked = selected;
        if (selected) {
            selectedChatTurns.add(turnElement);
            turnElement.classList.add(CHAT_SELECTED_CLASS);
        } else {
            selectedChatTurns.delete(turnElement);
            turnElement.classList.remove(CHAT_SELECTED_CLASS);
        }
        updateChatMultiDeleteButtonState();
        updateChatSizePanelStatus();
    }

    function clearChatSelection() {
        Array.from(selectedChatTurns).forEach(t => setTurnSelected(t, false));
    }

    function selectTopNByTokens(n) {
        clearChatSelection();
        const sorted = Array.from(turnTokenEstimates.entries())
            .filter(([el]) => document.body.contains(el))
            .sort((a, b) => b[1] - a[1]);
        sorted.slice(0, n).forEach(([el]) => setTurnSelected(el, true));
    }

    function selectAboveThreshold(threshold) {
        clearChatSelection();
        turnTokenEstimates.forEach((tokens, el) => {
            if (document.body.contains(el) && tokens >= threshold) {
                setTurnSelected(el, true);
            }
        });
    }

    function addChatSizePanel() {
        if (document.getElementById(CHAT_SIZE_PANEL_ID)) return;

        // Built with createElement/textContent throughout instead of innerHTML,
        // because AI Studio enforces a Trusted Types CSP that silently blocks
        // any raw innerHTML string assignment.
        const panel = document.createElement('div');
        panel.id = CHAT_SIZE_PANEL_ID;

        const title = document.createElement('div');
        title.className = 'gm-panel-title';
        title.textContent = 'Select by Size';
        panel.appendChild(title);

        const status = document.createElement('div');
        status.className = 'gm-panel-status';
        status.id = 'gm-panel-status';
        panel.appendChild(status);

        // Row: Top N selector
        const rowTopN = document.createElement('div');
        rowTopN.className = 'gm-panel-row';
        const inputTopN = document.createElement('input');
        inputTopN.type = 'number';
        inputTopN.id = 'gm-panel-topn';
        inputTopN.value = '5';
        inputTopN.min = '1';
        const btnTopN = document.createElement('button');
        btnTopN.id = 'gm-panel-select-topn';
        btnTopN.textContent = 'Select Top N';
        rowTopN.appendChild(inputTopN);
        rowTopN.appendChild(btnTopN);
        panel.appendChild(rowTopN);

        // Row: threshold selector
        const rowThreshold = document.createElement('div');
        rowThreshold.className = 'gm-panel-row';
        const inputThreshold = document.createElement('input');
        inputThreshold.type = 'number';
        inputThreshold.id = 'gm-panel-threshold';
        inputThreshold.value = '500';
        inputThreshold.min = '0';
        const btnThreshold = document.createElement('button');
        btnThreshold.id = 'gm-panel-select-threshold';
        btnThreshold.textContent = 'Select \u2265 tokens';
        rowThreshold.appendChild(inputThreshold);
        rowThreshold.appendChild(btnThreshold);
        panel.appendChild(rowThreshold);

        // Row: clear selection
        const rowClear = document.createElement('div');
        rowClear.className = 'gm-panel-row';
        const btnClear = document.createElement('button');
        btnClear.id = 'gm-panel-clear';
        btnClear.textContent = 'Clear Selection';
        rowClear.appendChild(btnClear);
        panel.appendChild(rowClear);

        // Delete button
        const btnDelete = document.createElement('button');
        btnDelete.className = 'gm-panel-delete-btn';
        btnDelete.id = 'gm-panel-delete';
        btnDelete.textContent = 'Delete Selected';
        panel.appendChild(btnDelete);

        // Jump list section
        const jumpTitle = document.createElement('div');
        jumpTitle.className = 'gm-panel-section-title';
        jumpTitle.textContent = 'Largest Turns (click to jump)';
        panel.appendChild(jumpTitle);

        const jumpList = document.createElement('div');
        jumpList.className = 'gm-jumplist';
        jumpList.id = 'gm-panel-jumplist';
        panel.appendChild(jumpList);

        document.body.appendChild(panel);

        btnTopN.addEventListener('click', () => {
            const n = parseInt(inputTopN.value, 10) || 5;
            selectTopNByTokens(n);
        });
        inputTopN.addEventListener('input', renderJumpList);
        btnThreshold.addEventListener('click', () => {
            const t = parseInt(inputThreshold.value, 10) || 0;
            selectAboveThreshold(t);
        });
        btnClear.addEventListener('click', clearChatSelection);
        btnDelete.addEventListener('click', handleChatDeleteSelected);

        updateChatSizePanelStatus();
    }

    function renderJumpList() {
        const listEl = document.getElementById('gm-panel-jumplist');
        if (!listEl) return;
        const topNInput = document.getElementById('gm-panel-topn');
        const n = parseInt(topNInput && topNInput.value, 10) || 5;

        const sorted = Array.from(turnTokenEstimates.entries())
            .filter(([el]) => document.body.contains(el))
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(n, 5)); // always show at least 5 for visibility

        listEl.textContent = '';
        sorted.forEach(([el, tokens], idx) => {
            const item = document.createElement('div');
            item.className = 'gm-jump-item';
            const snippet = getTurnCleanText(el).replace(/\s+/g, ' ').trim().slice(0, 45);
            item.textContent = `${idx + 1}. ~${tokens} tok — ${snippet}`;
            item.title = 'Click to jump to this turn';
            item.addEventListener('click', () => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const originalOutline = el.style.outline;
                el.style.outline = '2px solid #f1c40f';
                setTimeout(() => { el.style.outline = originalOutline; }, 1500);
            });
            listEl.appendChild(item);
        });
    }

    function updateChatSizePanelStatus() {
        const statusEl = document.getElementById('gm-panel-status');
        if (statusEl) {
            const allTokens = Array.from(turnTokenEstimates.values());
            const totalTokens = allTokens.reduce((sum, t) => sum + t, 0);
            const selectedTokens = Array.from(selectedChatTurns)
                .map(el => turnTokenEstimates.get(el) || 0)
                .reduce((sum, t) => sum + t, 0);
            const actualStr = lastActualTotalTokens ? `${lastActualTotalTokens.toLocaleString()}` : '?';
            statusEl.textContent = `${turnTokenEstimates.size} turns | est ~${totalTokens} tok (actual ${actualStr}) | ${selectedChatTurns.size} selected (~${selectedTokens} tok)`;
        }
        renderJumpList();
    }

    // ========================================================================
    // CHAT VIEW FUNCTIONS
    // ========================================================================

    function addChatCheckbox(turnElement) {
        if (!turnElement || turnElement.querySelector(`input.${CHAT_CHECKBOX_CLASS}`)) return true;
        let checkboxAppended = false;
        try {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = CHAT_CHECKBOX_CLASS;
            checkbox.title = 'Select this turn for bulk actions';
            checkbox.checked = selectedChatTurns.has(turnElement);
            checkbox.disabled = isDeleting;

            checkbox.addEventListener('change', (event) => {
                if (isDeleting) {
                    event.target.checked = !event.target.checked;
                    return;
                }
                setTurnSelected(turnElement, event.target.checked);
            });

            const container = turnElement.querySelector('.chat-turn-container');
            if (container) {
                container.style.position = 'relative';
                container.style.paddingLeft = '35px';
                container.insertBefore(checkbox, container.firstChild);
                checkboxAppended = true;
            } else {
                console.warn("GM Chat: .chat-turn-container not found, using fallback for:", turnElement);
                turnElement.style.position = 'relative';
                turnElement.style.paddingLeft = '35px';
                turnElement.insertBefore(checkbox, turnElement.firstChild);
                checkboxAppended = true;
            }
            return checkboxAppended;
        } catch (error) {
            console.error("GM Chat: Error adding checkbox for turn:", turnElement, error);
            return false;
        }
    }

    function setupChatMoreOptionsListener(turnElement) {
        if (!turnElement) return;
        const optionsComponent = turnElement.querySelector('ms-chat-turn-options');
        const moreOptionsButton = optionsComponent ? optionsComponent.querySelector('button.mat-mdc-menu-trigger') : null;
        if (!moreOptionsButton || moreOptionsButton.dataset.hasDeleteBeforeListener === 'true') return;

        moreOptionsButton.dataset.hasDeleteBeforeListener = 'true';
        moreOptionsButton.addEventListener('click', () => {
            if (isDeleting) return;
            setTimeout(() => {
                const menuPanels = document.querySelectorAll('div.cdk-overlay-container div.mat-mdc-menu-panel, body > div.mat-mdc-menu-panel');
                const currentMenu = menuPanels.length > 0 ? menuPanels[menuPanels.length - 1] : null;
                if (currentMenu) {
                    addChatDeleteBeforeMenuItem(currentMenu, turnElement);
                }
            }, MENU_APPEAR_DELAY_MS / 2);
        });
    }

    function addChatDeleteBeforeMenuItem(menuPanel, targetTurnElement) {
        const menuContent = menuPanel.querySelector('.mat-mdc-menu-content');
        if (!menuContent || menuPanel.querySelector(`.${CHAT_DELETE_BEFORE_CLASS}`)) return;
        try {
            const btn = document.createElement('button');
            btn.className = `mat-mdc-menu-item mat-focus-indicator ${CHAT_DELETE_BEFORE_CLASS}`;
            btn.setAttribute('role', 'menuitem');
            btn.setAttribute('tabindex', '0');

            const textSpan = document.createElement('span');
            textSpan.className = 'mat-mdc-menu-item-text';
            const marker = document.createElement('span');
            marker.className = 'delete-before-marker';
            marker.textContent = '[X]';
            const label = document.createElement('span');
            label.textContent = 'Delete Before';
            textSpan.appendChild(marker);
            textSpan.appendChild(label);

            const ripple = document.createElement('div');
            ripple.setAttribute('matripple', '');
            ripple.className = 'mat-ripple mat-mdc-menu-ripple';

            btn.appendChild(textSpan);
            btn.appendChild(ripple);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleChatDeleteBefore(targetTurnElement);
            });
            const deleteItem = findChatDeleteButtonInMenu(menuPanel);
            if (deleteItem) menuContent.insertBefore(btn, deleteItem);
            else menuContent.appendChild(btn);
        } catch (error) {
            console.error("GM Chat: Error adding 'Delete Before' menu item:", error);
        }
    }

    function findChatDeleteButtonInMenu(menuPanel) {
        if (!menuPanel) return null;
        const items = menuPanel.querySelectorAll('button.mat-mdc-menu-item');
        for (const item of items) {
            const text = item.querySelector('.mat-mdc-menu-item-text span:not([aria-hidden="true"])');
            if (text && text.textContent.trim().toLowerCase() === 'delete') return item;
            const icon = item.querySelector('.mat-mdc-menu-item-text span.material-symbols-outlined');
            if (icon && icon.textContent.trim() === 'delete') return item;
        }
        return null;
    }

    async function deleteSingleChatTurn(turnElement) {
        const optionsComponent = turnElement.querySelector('ms-chat-turn-options');
        const btn = optionsComponent ? optionsComponent.querySelector('button.mat-mdc-menu-trigger') : null;
        if (!btn) {
            console.error("GM Chat: Could not find 'more options' button:", turnElement);
            return false;
        }
        btn.click();
        await new Promise(resolve => setTimeout(resolve, MENU_APPEAR_DELAY_MS));

        const panels = document.querySelectorAll('div.cdk-overlay-container div.mat-mdc-menu-panel, body > div.mat-mdc-menu-panel');
        const menu = panels.length > 0 ? panels[panels.length - 1] : null;
        if (!menu) {
            console.error("GM Chat: Could not find menu panel.");
            try { btn.click(); } catch (e) {}
            return false;
        }

        const delBtn = findChatDeleteButtonInMenu(menu);
        if (!delBtn) {
            console.error("GM Chat: Could not find 'Delete' button in menu:", menu);
            try { btn.click(); } catch (e) {}
            return false;
        }

        delBtn.click();
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_DELETES_MS));
        return true;
    }

    async function handleChatDeleteSelected() {
        if (isDeleting || selectedChatTurns.size === 0) return;
        if (!confirm(`Delete ${selectedChatTurns.size} selected turn(s)?`)) return;

        isDeleting = true;
        const btn = document.getElementById(CHAT_MULTI_DELETE_BUTTON_ID);
        if (btn) btn.textContent = 'Deleting...';
        updateChatMultiDeleteButtonState();

        const turns = Array.from(selectedChatTurns);
        selectedChatTurns.clear();
        turns.forEach(t => {
            t.classList.remove(CHAT_SELECTED_CLASS);
            const cb = t.querySelector(`.${CHAT_CHECKBOX_CLASS}`);
            if (cb) cb.checked = false;
        });
        updateChatSizePanelStatus();

        let failed = 0;
        for (const t of turns) {
            if (!document.body.contains(t)) continue;
            const success = await deleteSingleChatTurn(t);
            if (!success) failed++;
            turnTokenEstimates.delete(t);
        }

        console.log(`GM Chat: Multi-delete finished. ${turns.length - failed} initiated, ${failed} failed.`);
        isDeleting = false;
        updateChatMultiDeleteButtonState();
        updateChatSizePanelStatus();
        if (failed > 0) alert(`Finished deleting, but ${failed} turn(s) failed. Check console.`);
    }

    async function handleChatDeleteBefore(targetTurnElement) {
        if (isDeleting || !targetTurnElement || !document.body.contains(targetTurnElement)) return;
        const allTurns = Array.from(document.querySelectorAll('ms-chat-session ms-chat-turn'));
        const idx = allTurns.findIndex(t => t === targetTurnElement);
        if (idx <= 0) {
            alert("No turns before this one.");
            return;
        }
        const turns = allTurns.slice(0, idx);
        if (!confirm(`Delete ${turns.length} turn(s) before this one?`)) return;

        isDeleting = true;
        if (selectedChatTurns.size > 0) {
            selectedChatTurns.forEach(t => {
                t.classList.remove(CHAT_SELECTED_CLASS);
                const cb = t.querySelector(`.${CHAT_CHECKBOX_CLASS}`);
                if (cb) cb.checked = false;
            });
            selectedChatTurns.clear();
        }
        updateChatMultiDeleteButtonState();
        updateChatSizePanelStatus();

        let failed = 0;
        for (const t of turns) {
            if (!document.body.contains(t)) continue;
            const success = await deleteSingleChatTurn(t);
            if (!success) failed++;
            turnTokenEstimates.delete(t);
        }

        console.log(`GM Chat: "Delete Before" finished. ${turns.length - failed} initiated, ${failed} failed.`);
        isDeleting = false;
        updateChatMultiDeleteButtonState();
        updateChatSizePanelStatus();
        if (failed > 0) alert(`Finished deleting, but ${failed} turn(s) failed. Check console.`);
    }

    function addChatMultiDeleteButton() {
        if (document.getElementById(CHAT_MULTI_DELETE_BUTTON_ID)) return;
        const toolbar = document.querySelector('ms-toolbar .toolbar-container');
        if (!toolbar) return;
        const btn = document.createElement('button');
        btn.id = CHAT_MULTI_DELETE_BUTTON_ID;
        btn.textContent = 'Delete Selected (0)';
        btn.title = 'Delete all selected chat turns';
        btn.addEventListener('click', handleChatDeleteSelected);
        const more = toolbar.querySelector('button[aria-label="View more actions"]');
        if (more) toolbar.insertBefore(btn, more);
        else toolbar.appendChild(btn);
        updateChatMultiDeleteButtonState();
    }

    function updateChatMultiDeleteButtonState() {
        const btn = document.getElementById(CHAT_MULTI_DELETE_BUTTON_ID);
        if (!btn) return;
        const count = selectedChatTurns.size;
        btn.textContent = `Delete Selected (${count})`;
        const enabled = count > 0 && !isDeleting;
        btn.classList.toggle('enabled', enabled);
        btn.disabled = !enabled;
        document.querySelectorAll(`.${CHAT_CHECKBOX_CLASS}`).forEach(cb => cb.disabled = isDeleting);

        const panelDeleteBtn = document.querySelector(`#${CHAT_SIZE_PANEL_ID} .gm-panel-delete-btn`);
        if (panelDeleteBtn) panelDeleteBtn.disabled = !enabled;
    }

    function scanAndSetupChatTurns() {
        const container = document.querySelector('ms-chat-session');
        if (!container) return;
        const turns = container.querySelectorAll('ms-chat-turn');
        turns.forEach((turn) => {
            try {
                const ok = addChatCheckbox(turn);
                if (ok) setupChatMoreOptionsListener(turn);
                upsertTokenBadge(turn); // recompute every scan in case content streamed in/changed
            } catch (e) {
                console.error(`GM Chat: Error processing turn`, turn, e);
            }
        });
        addChatMultiDeleteButton();
        addChatSizePanel();
        updateChatMultiDeleteButtonState();
        updateChatSizePanelStatus();
    }

    function observeChatArea() {
        const container = document.querySelector('ms-chat-session');
        if (!container) {
            setTimeout(observeChatArea, 750);
            return;
        }
        console.log("GM Chat: Container found. Initializing & observing.");
        scanAndSetupChatTurns();
        recalibrateTokenRatio();
        setInterval(recalibrateTokenRatio, 10000); // refine the chars-per-token ratio periodically against AI Studio's real count

        const observer = new MutationObserver((mutations) => {
            try {
                let needsToolbarCheck = false;
                let selectionNeedsUpdate = false;
                let addedTurns = [];

                mutations.forEach(m => {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType === 1) {
                            if (n.matches('ms-chat-turn')) {
                                addedTurns.push(n);
                                needsToolbarCheck = true;
                            } else {
                                n.querySelectorAll('ms-chat-turn').forEach(t => {
                                    addedTurns.push(t);
                                    needsToolbarCheck = true;
                                });
                            }
                            if (n.matches('ms-toolbar') || n.querySelector('ms-toolbar')) needsToolbarCheck = true;
                        }
                    });
                    m.removedNodes.forEach(n => {
                        if (n.nodeType === 1) {
                            const checkRemoved = (el) => {
                                if (selectedChatTurns.has(el)) {
                                    selectedChatTurns.delete(el);
                                    selectionNeedsUpdate = true;
                                }
                                turnTokenEstimates.delete(el);
                            };
                            if (n.matches('ms-chat-turn')) checkRemoved(n);
                            else n.querySelectorAll('ms-chat-turn').forEach(checkRemoved);
                        }
                    });
                });

                if (addedTurns.length > 0) {
                    addedTurns.forEach(t => {
                        if (document.body.contains(t) && !t.querySelector(`input.${CHAT_CHECKBOX_CLASS}`)) {
                            try {
                                const ok = addChatCheckbox(t);
                                if (ok) setupChatMoreOptionsListener(t);
                            } catch (e) {
                                console.error("GM Chat Observer: Error processing added turn:", t, e);
                            }
                        }
                    });
                }

                // Refresh token badges, but debounced — mutations can fire dozens of
                // times per second during streaming, and re-scanning every turn on
                // every single batch was what froze the page. Wait for things to
                // settle instead of running on every event.
                scheduleBadgeRefresh();

                if (needsToolbarCheck) {
                    addChatMultiDeleteButton();
                    addChatSizePanel();
                }
                if (selectionNeedsUpdate) updateChatMultiDeleteButtonState();
                updateChatSizePanelStatus();
            } catch (e) {
                console.error("GM Chat: Error in MutationObserver callback:", e);
            }
        });
        observer.observe(container, { childList: true, subtree: true });
        console.log("GM Chat: MutationObserver started.");
    }

    // ========================================================================
    // LIBRARY VIEW FUNCTIONS (unchanged from v0.5.1)
    // ========================================================================

    function addLibraryCheckbox(rowElement) {
        if (!rowElement || rowElement.querySelector(`.${LIB_CHECKBOX_CELL_CLASS}`)) return;
        try {
            const cell = document.createElement('td');
            cell.className = `mat-mdc-cell mdc-data-table__cell cdk-cell ${LIB_CHECKBOX_CELL_CLASS}`;
            cell.setAttribute('role', 'cell');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = LIB_CHECKBOX_CLASS;
            checkbox.title = 'Select this item';
            checkbox.checked = selectedLibraryItems.has(rowElement);
            checkbox.disabled = isDeleting;
            checkbox.addEventListener('change', (event) => {
                if (isDeleting) {
                    event.target.checked = !event.target.checked;
                    return;
                }
                if (event.target.checked) {
                    selectedLibraryItems.add(rowElement);
                    rowElement.classList.add(LIB_SELECTED_CLASS);
                } else {
                    selectedLibraryItems.delete(rowElement);
                    rowElement.classList.remove(LIB_SELECTED_CLASS);
                }
                updateLibraryMultiDeleteButtonState();
            });
            cell.appendChild(checkbox);
            rowElement.insertBefore(cell, rowElement.firstChild);
        } catch (error) {
            console.error("GM Library: Error adding checkbox cell:", rowElement, error);
        }
    }

    function addLibraryHeaderCheckbox(headerRow) {
        if (!headerRow || headerRow.querySelector(`.${LIB_CHECKBOX_HEADER_CLASS}`)) return;
        try {
            const headerCell = document.createElement('th');
            headerCell.className = `mat-mdc-header-cell mdc-data-table__header-cell cdk-header-cell ${LIB_CHECKBOX_HEADER_CLASS}`;
            headerCell.setAttribute('role', 'columnheader');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = LIB_HEADER_CHECKBOX_CLASS;
            checkbox.title = 'Select/Deselect All Visible';
            checkbox.disabled = isDeleting;
            checkbox.addEventListener('change', (event) => {
                if (isDeleting) {
                    event.target.checked = !event.target.checked;
                    return;
                }
                const isChecked = event.target.checked;
                const rows = document.querySelectorAll(`tbody tr.mat-mdc-row`);
                rows.forEach(row => {
                    const rowCheckbox = row.querySelector(`input.${LIB_CHECKBOX_CLASS}`);
                    if (rowCheckbox && !rowCheckbox.disabled) {
                        rowCheckbox.checked = isChecked;
                        if (isChecked) {
                            selectedLibraryItems.add(row);
                            row.classList.add(LIB_SELECTED_CLASS);
                        } else {
                            selectedLibraryItems.delete(row);
                            row.classList.remove(LIB_SELECTED_CLASS);
                        }
                    }
                });
                updateLibraryMultiDeleteButtonState();
            });
            headerCell.appendChild(checkbox);
            headerRow.insertBefore(headerCell, headerRow.firstChild);
        } catch (error) {
            console.error("GM Library: Error adding header checkbox:", headerRow, error);
        }
    }

    function addLibraryMultiDeleteButton() {
        if (document.getElementById(LIB_MULTI_DELETE_BUTTON_ID)) return;
        const actionsWrapper = document.querySelector('div.lib-header div.actions-wrapper');
        if (!actionsWrapper) {
            console.warn("GM Library: Actions wrapper not found for delete button.");
            return;
        }
        try {
            const button = document.createElement('button');
            button.id = LIB_MULTI_DELETE_BUTTON_ID;
            button.title = 'Delete selected library items';

            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = 'delete';
            const textSpan = document.createElement('span');
            textSpan.className = 'button-text';
            textSpan.textContent = 'Delete Selected (0)';

            button.appendChild(icon);
            button.appendChild(textSpan);
            button.addEventListener('click', handleLibraryDeleteSelected);
            actionsWrapper.appendChild(button);
            updateLibraryMultiDeleteButtonState();
        } catch (error) {
            console.error("GM Library: Error adding multi-delete button:", error);
        }
    }

    function updateLibraryMultiDeleteButtonState() {
        const button = document.getElementById(LIB_MULTI_DELETE_BUTTON_ID);
        const headerCheckbox = document.querySelector(`input.${LIB_HEADER_CHECKBOX_CLASS}`);
        if (!button) return;
        const count = selectedLibraryItems.size;
        const buttonTextSpan = button.querySelector('.button-text');
        if (buttonTextSpan) buttonTextSpan.textContent = `Delete Selected (${count})`;
        const enabled = count > 0 && !isDeleting;
        button.classList.toggle('enabled', enabled);
        button.disabled = !enabled;
        document.querySelectorAll(`input.${LIB_CHECKBOX_CLASS}`).forEach(cb => cb.disabled = isDeleting);

        if (headerCheckbox) {
            headerCheckbox.disabled = isDeleting;
            const totalVisibleRows = document.querySelectorAll('tbody tr.mat-mdc-row').length;
            if (count === 0) {
                headerCheckbox.checked = false;
                headerCheckbox.indeterminate = false;
            } else if (count === totalVisibleRows && totalVisibleRows > 0) {
                headerCheckbox.checked = true;
                headerCheckbox.indeterminate = false;
            } else {
                headerCheckbox.checked = false;
                headerCheckbox.indeterminate = true;
            }
        }
    }

    function findLibraryDeleteButtonInMenu(menuPanel) {
        if (!menuPanel) return null;
        const items = menuPanel.querySelectorAll('button.mat-mdc-menu-item');
        for (const item of items) {
            const text = item.querySelector('.mat-mdc-menu-item-text');
            if (text && text.textContent.trim().toLowerCase().includes('delete prompt')) return item;
            const icon = item.querySelector('.mat-mdc-menu-item-text span.material-symbols-outlined');
            if (icon && icon.textContent.trim() === 'delete' && text && text.textContent.trim().toLowerCase() === 'delete') return item;
        }
        return null;
    }

    async function deleteSingleLibraryItem(rowElement) {
        if (!rowElement || !document.body.contains(rowElement)) return false;
        const moreOptionsButton = rowElement.querySelector('td.cdk-column-overflow button[aria-label="Show overflow"]');
        if (!moreOptionsButton) {
            console.error("GM Library: Could not find 'more options' button for row:", rowElement);
            return false;
        }

        // --- Step 1: Click "more options" and find "Delete prompt" in menu ---
        moreOptionsButton.click();
        await new Promise(resolve => setTimeout(resolve, MENU_APPEAR_DELAY_MS));

        const menuPanels = document.querySelectorAll('div.cdk-overlay-container div.mat-mdc-menu-panel, body > div.mat-mdc-menu-panel');
        const currentMenu = menuPanels.length > 0 ? menuPanels[menuPanels.length - 1] : null;
        if (!currentMenu) {
            console.error("GM Library: Could not find active menu panel.");
            try { moreOptionsButton.click(); } catch (e) {}
            return false;
        }

        const deletePromptButton = findLibraryDeleteButtonInMenu(currentMenu);
        if (!deletePromptButton) {
            console.error("GM Library: Could not find 'Delete prompt' button in menu:", currentMenu);
            try { moreOptionsButton.click(); } catch (e) {}
            return false;
        }

        // --- Step 2: Click "Delete prompt" and wait for confirmation dialog ---
        deletePromptButton.click();
        console.log("GM Library: Clicked 'Delete prompt' in menu, waiting for confirmation dialog...");
        await new Promise(resolve => setTimeout(resolve, CONFIRM_DIALOG_WAIT_MS));

        // --- Step 3: Find and click the final "Delete" button in the dialog ---
        let confirmationClicked = false;
        try {
            const dialogContainers = document.querySelectorAll('div.cdk-overlay-container mat-dialog-container');
            if (dialogContainers.length === 0) {
                console.warn("GM Library: No dialog container found in overlay.");
            }
            const currentDialog = dialogContainers.length > 0 ? dialogContainers[dialogContainers.length - 1] : null;
            if (currentDialog) {
                console.log("GM Library: Found potential dialog container:", currentDialog);
                const dialogActions = currentDialog.querySelector('mat-dialog-actions');
                if (dialogActions) {
                    const buttons = dialogActions.querySelectorAll('button');
                    for (const button of buttons) {
                        const label = button.querySelector('.mdc-button__label');
                        if (label && label.textContent.trim() === 'Delete') {
                            console.log("GM Library: Found final 'Delete' button in dialog:", button);
                            button.click();
                            confirmationClicked = true;
                            console.log("GM Library: Clicked final 'Delete' button.");
                            break;
                        }
                    }
                } else {
                    console.warn("GM Library: Could not find mat-dialog-actions in dialog container.");
                }
            }
            if (!confirmationClicked) {
                console.error("GM Library: Failed to find or click the final 'Delete' button in the confirmation dialog.");
                return false;
            }
        } catch (error) {
            console.error("GM Library: Error during confirmation dialog handling:", error);
            return false;
        }

        console.log("GM Library: Confirmed delete initiated for row:", rowElement);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_DELETES_MS));
        return true;
    }

    async function handleLibraryDeleteSelected() {
        if (isDeleting || selectedLibraryItems.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedLibraryItems.size} selected library item(s)? This cannot be undone.`)) return;

        isDeleting = true;
        const button = document.getElementById(LIB_MULTI_DELETE_BUTTON_ID);
        if (button) {
            const textSpan = button.querySelector('.button-text');
            if (textSpan) textSpan.textContent = 'Deleting...';
        }
        updateLibraryMultiDeleteButtonState();

        const itemsToDelete = Array.from(selectedLibraryItems);
        selectedLibraryItems.clear();
        itemsToDelete.forEach(row => {
            row.classList.remove(LIB_SELECTED_CLASS);
            const checkbox = row.querySelector(`input.${LIB_CHECKBOX_CLASS}`);
            if (checkbox) checkbox.checked = false;
        });

        let failedDeletions = 0;
        for (const rowElement of itemsToDelete) {
            if (!document.body.contains(rowElement)) continue;
            const success = await deleteSingleLibraryItem(rowElement);
            if (!success) failedDeletions++;
        }

        console.log(`GM Library: Multi-delete finished. ${itemsToDelete.length - failedDeletions} initiated, ${failedDeletions} failed.`);
        isDeleting = false;
        updateLibraryMultiDeleteButtonState();
        if (failedDeletions > 0) {
            alert(`Finished deleting library items, but ${failedDeletions} item(s) failed. Please check the console (F12) and refresh the page.`);
        }
    }

    function scanAndSetupLibrary() {
        const tableBody = document.querySelector('ms-library-table table.mat-mdc-table tbody');
        const headerRow = document.querySelector('ms-library-table table.mat-mdc-table thead tr.mat-mdc-header-row');
        if (!tableBody || !headerRow) {
            console.log("GM Library: Table body or header row not found.");
            return;
        }
        console.log("GM Library: Scanning table rows...");
        addLibraryHeaderCheckbox(headerRow);
        const rows = tableBody.querySelectorAll('tr.mat-mdc-row');
        rows.forEach(row => {
            addLibraryCheckbox(row);
        });
        console.log(`GM Library: Processed ${rows.length} rows.`);
        addLibraryMultiDeleteButton();
        updateLibraryMultiDeleteButtonState();
    }

    function observeLibraryTable() {
        const tableBody = document.querySelector('ms-library-table table.mat-mdc-table tbody');
        if (!tableBody) {
            setTimeout(observeLibraryTable, 750);
            return;
        }
        console.log("GM Library: Table body found. Initializing & observing.");
        scanAndSetupLibrary();

        const observer = new MutationObserver((mutations) => {
            try {
                let selectionNeedsUpdate = false;
                let addedRows = [];
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches('tr.mat-mdc-row')) {
                            addedRows.push(node);
                        }
                    });
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches('tr.mat-mdc-row')) {
                            if (selectedLibraryItems.has(node)) {
                                selectedLibraryItems.delete(node);
                                selectionNeedsUpdate = true;
                                console.log("GM Library Observer: Removed selected row:", node);
                            }
                        }
                    });
                });
                if (addedRows.length > 0) {
                    console.log(`GM Library Observer: Processing ${addedRows.length} added rows...`);
                    addedRows.forEach(row => {
                        if (document.body.contains(row) && !row.querySelector(`.${LIB_CHECKBOX_CELL_CLASS}`)) {
                            addLibraryCheckbox(row);
                        }
                    });
                    selectionNeedsUpdate = true;
                }
                if (selectionNeedsUpdate) {
                    updateLibraryMultiDeleteButtonState();
                }
            } catch (error) {
                console.error("GM Library: Error in MutationObserver callback:", error);
            }
        });
        observer.observe(tableBody, { childList: true });
        console.log("GM Library: MutationObserver started.");
    }

    // ========================================================================
    // SCRIPT INITIALIZATION
    // ========================================================================

    function initialize() {
        const currentPath = window.location.pathname;
        console.log("GM Initializing for path:", currentPath);
        if (currentPath.startsWith('/prompts/')) {
            console.log("GM Running Chat View Enhancements");
            observeChatArea();
        } else if (currentPath === '/library') {
            console.log("GM Running Library View Enhancements");
            observeLibraryTable();
        } else {
            console.log("GM No enhancements for this page.");
        }
    }

    console.log("AI Studio Bulk Chat Turn & Library Item Selector/Deleter (v0.7.0): Waiting for document ready state...");
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log("GM Document ready, starting initialization soon...");
        setTimeout(initialize, 1300);
    } else {
        console.log("GM Adding DOMContentLoaded listener...");
        document.addEventListener('DOMContentLoaded', () => {
            console.log("GM DOMContentLoaded fired, starting initialization soon...");
            setTimeout(initialize, 1300);
        });
    }
})();

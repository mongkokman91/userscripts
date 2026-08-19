// ==UserScript==
// @name         Google AI Studio Rapid Fixed Batch Keep Last 100
// @namespace    http://tampermonkey.net/
// @version      7.1
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Google%20AI%20Studio%20Rapid%20Fixed%20Batch%20Keep%20Last%20100.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20AI%20Studio%20Rapid%20Fixed%20Batch%20Keep%20Last%20100.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20AI%20Studio%20Rapid%20Fixed%20Batch%20Keep%20Last%20100.user.js
// @description  Deletes fixed batches of 10 old AI Studio turns, verifies persistence after reload, and keeps the newest 100.
// @match        https://aistudio.google.com/prompts/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEEP_LAST_TURNS = 100;
    const FIXED_BATCH_SIZE = 10;

    const FIRST_TURN_TIMEOUT_MS = 15000;
    const COUNT_SAMPLE_INTERVAL_MS = 100;
    const REQUIRED_STABLE_READINGS = 2;
    const MAX_COUNT_DETECTION_MS = 1500;

    const SCROLL_SETTLE_MS = 80;
    const OVERLAY_SETTLE_MS = 60;

    const MENU_TIMEOUT_MS = 3000;
    const CONFIRMATION_TIMEOUT_MS = 700;
    const TURN_REMOVAL_TIMEOUT_MS = 5000;

    const BETWEEN_DELETIONS_MS = 200;
    const SAVE_WAIT_AFTER_BATCH_MS = 3500;

    const MAX_ZERO_PROGRESS_BATCHES = 3;

    const START_BUTTON_ID =
        'rapid-fixed-batch-start';

    const STOP_BUTTON_ID =
        'rapid-fixed-batch-stop';

    const RESET_BUTTON_ID =
        'rapid-fixed-batch-reset';

    const STATUS_PANEL_ID =
        'rapid-fixed-batch-status';

    const STORAGE_PREFIX =
        `rapidFixedBatchKeep100:${location.pathname}:`;

    const ACTIVE_KEY =
        `${STORAGE_PREFIX}active`;

    const PENDING_BATCH_KEY =
        `${STORAGE_PREFIX}pendingBatch`;

    const COUNT_BEFORE_BATCH_KEY =
        `${STORAGE_PREFIX}countBeforeBatch`;

    const LOCALLY_DELETED_KEY =
        `${STORAGE_PREFIX}locallyDeleted`;

    const STARTING_COUNT_KEY =
        `${STORAGE_PREFIX}startingCount`;

    const VERIFIED_DELETIONS_KEY =
        `${STORAGE_PREFIX}verifiedDeletions`;

    const ZERO_PROGRESS_BATCHES_KEY =
        `${STORAGE_PREFIX}zeroProgressBatches`;

    let processing = false;
    let stopRequested = false;

    GM_addStyle(`
        #${START_BUTTON_ID},
        #${STOP_BUTTON_ID},
        #${RESET_BUTTON_ID} {
            position: fixed !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            min-width: 195px !important;
            padding: 12px 16px !important;
            border: none !important;
            border-radius: 8px !important;
            color: #ffffff !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            cursor: pointer !important;
            white-space: nowrap !important;
            box-shadow: 0 3px 12px rgba(0, 0, 0, 0.45) !important;
            pointer-events: auto !important;
        }

        #${START_BUTTON_ID} {
            bottom: 90px !important;
            background: #1769aa !important;
        }

        #${STOP_BUTTON_ID} {
            bottom: 143px !important;
            background: #a13d00 !important;
        }

        #${RESET_BUTTON_ID} {
            bottom: 196px !important;
            background: #555555 !important;
        }

        #${STATUS_PANEL_ID} {
            position: fixed !important;
            right: 24px !important;
            bottom: 249px !important;
            z-index: 2147483647 !important;
            width: 340px !important;
            max-height: 275px !important;
            overflow: auto !important;
            padding: 12px 14px !important;
            border-radius: 8px !important;
            background: rgba(20, 20, 20, 0.97) !important;
            color: #ffffff !important;
            font-size: 12px !important;
            line-height: 1.45 !important;
            white-space: pre-wrap !important;
            box-shadow: 0 3px 12px rgba(0, 0, 0, 0.5) !important;
            pointer-events: none !important;
        }

        .cdk-overlay-container {
            z-index: 2147483646 !important;
        }
    `);

    function sleep(milliseconds) {
        return new Promise(resolve => {
            window.setTimeout(resolve, milliseconds);
        });
    }

    function getBoolean(key) {
        return localStorage.getItem(key) === 'true';
    }

    function setBoolean(key, value) {
        localStorage.setItem(
            key,
            value ? 'true' : 'false'
        );
    }

    function getNumber(key, fallback = 0) {
        const value =
            Number(localStorage.getItem(key));

        return Number.isFinite(value)
            ? value
            : fallback;
    }

    function setNumber(key, value) {
        localStorage.setItem(
            key,
            String(value)
        );
    }

    function clearAllRelatedStates() {
        for (const key of Object.keys(localStorage)) {
            if (
                key.includes('aiStudioFastBatchedKeep100') ||
                key.includes('aiStudioBatchedKeep100') ||
                key.includes('rapidFixedBatchKeep100') ||
                key.includes('aiStudioNuclearKeep100')
            ) {
                localStorage.removeItem(key);
            }
        }
    }

    function clearCurrentState() {
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(PENDING_BATCH_KEY);
        localStorage.removeItem(COUNT_BEFORE_BATCH_KEY);
        localStorage.removeItem(LOCALLY_DELETED_KEY);
        localStorage.removeItem(STARTING_COUNT_KEY);
        localStorage.removeItem(VERIFIED_DELETIONS_KEY);
        localStorage.removeItem(ZERO_PROGRESS_BATCHES_KEY);
    }

    function isActive() {
        return getBoolean(ACTIVE_KEY);
    }

    function getAllTurns() {
        return Array.from(
            document.querySelectorAll(
                'ms-chat-session ms-chat-turn'
            )
        );
    }

    function getTurnCount() {
        return document.querySelectorAll(
            'ms-chat-session ms-chat-turn'
        ).length;
    }

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const rectangle =
            element.getBoundingClientRect();

        const style =
            window.getComputedStyle(element);

        return (
            rectangle.width > 0 &&
            rectangle.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
        );
    }

    function setStatus(message) {
        const panel =
            document.getElementById(
                STATUS_PANEL_ID
            );

        if (panel) {
            panel.textContent = message;
        }

        console.log(
            'Rapid Fixed Batch Keep 100:',
            message
        );
    }

    function updateControls() {
        const startButton =
            document.getElementById(
                START_BUTTON_ID
            );

        const stopButton =
            document.getElementById(
                STOP_BUTTON_ID
            );

        const active = isActive();

        if (startButton) {
            startButton.textContent =
                active
                    ? 'Stop Rapid Deletion'
                    : `Keep Last ${KEEP_LAST_TURNS}`;

            startButton.style.background =
                active
                    ? '#a13d00'
                    : '#1769aa';

            startButton.disabled = false;
        }

        if (stopButton) {
            stopButton.textContent =
                active
                    ? 'Stop Now'
                    : 'Not Running';

            stopButton.style.display =
                active ? 'block' : 'none';

            stopButton.disabled = false;
        }

        const resetButton =
            document.getElementById(
                RESET_BUTTON_ID
            );

        if (resetButton) {
            resetButton.disabled = false;
        }
    }

    function addControls() {
        if (
            !document.getElementById(
                START_BUTTON_ID
            )
        ) {
            const button =
                document.createElement('button');

            button.id = START_BUTTON_ID;

            button.addEventListener(
                'click',
                async () => {
                    if (isActive()) {
                        stopDeletion();
                    } else {
                        await startDeletion();
                    }
                }
            );

            document.body.appendChild(button);
        }

        if (
            !document.getElementById(
                STOP_BUTTON_ID
            )
        ) {
            const button =
                document.createElement('button');

            button.id = STOP_BUTTON_ID;
            button.textContent = 'Stop Now';

            button.addEventListener(
                'click',
                stopDeletion
            );

            document.body.appendChild(button);
        }

        if (
            !document.getElementById(
                RESET_BUTTON_ID
            )
        ) {
            const button =
                document.createElement('button');

            button.id = RESET_BUTTON_ID;
            button.textContent =
                'Reset Batch State';

            button.addEventListener(
                'click',
                resetState
            );

            document.body.appendChild(button);
        }

        if (
            !document.getElementById(
                STATUS_PANEL_ID
            )
        ) {
            const panel =
                document.createElement('div');

            panel.id = STATUS_PANEL_ID;
            panel.textContent =
                'Detecting conversation...';

            document.body.appendChild(panel);
        }

        updateControls();
    }

    async function waitForCondition(
        conditionFunction,
        timeoutMilliseconds,
        intervalMilliseconds = 40
    ) {
        const startedAt = Date.now();

        while (
            Date.now() - startedAt <
            timeoutMilliseconds
        ) {
            try {
                const result =
                    conditionFunction();

                if (result) {
                    return result;
                }
            } catch (error) {
                console.debug(
                    'Condition check error:',
                    error
                );
            }

            await sleep(intervalMilliseconds);
        }

        return false;
    }

    async function waitForChatSession() {
        return waitForCondition(
            () =>
                document.querySelector(
                    'ms-chat-session'
                ),
            30000,
            100
        );
    }

    async function detectTurnCountFast() {
        const firstPositiveCount =
            await waitForCondition(
                () => {
                    const count =
                        getTurnCount();

                    return count > 0
                        ? count
                        : false;
                },
                FIRST_TURN_TIMEOUT_MS,
                100
            );

        if (!firstPositiveCount) {
            throw new Error(
                'No conversation turns were detected.'
            );
        }

        const startedAt = Date.now();

        let previousCount =
            getTurnCount();

        let stableReadings = 0;

        while (
            Date.now() - startedAt <
            MAX_COUNT_DETECTION_MS
        ) {
            await sleep(
                COUNT_SAMPLE_INTERVAL_MS
            );

            const currentCount =
                getTurnCount();

            setStatus(
                `Rapid detection\n\n` +
                `Detected turns: ${currentCount}\n` +
                `Stable readings: ${stableReadings} of ` +
                `${REQUIRED_STABLE_READINGS}`
            );

            if (
                currentCount === previousCount &&
                currentCount > 0
            ) {
                stableReadings++;

                if (
                    stableReadings >=
                    REQUIRED_STABLE_READINGS
                ) {
                    return currentCount;
                }
            } else {
                previousCount =
                    currentCount;

                stableReadings = 0;
            }
        }

        const finalCount =
            getTurnCount();

        if (finalCount <= 0) {
            throw new Error(
                'The conversation count could not be detected.'
            );
        }

        return finalCount;
    }

    function getMoreOptionsButton(
        turnElement
    ) {
        if (!turnElement) {
            return null;
        }

        const optionsComponent =
            turnElement.querySelector(
                'ms-chat-turn-options'
            );

        const root =
            optionsComponent || turnElement;

        const buttons =
            Array.from(
                root.querySelectorAll('button')
            );

        return (
            buttons.find(button => {
                const ariaLabel =
                    (
                        button.getAttribute(
                            'aria-label'
                        ) || ''
                    ).toLowerCase();

                return (
                    button.matches(
                        '.mat-mdc-menu-trigger'
                    ) ||
                    button.getAttribute(
                        'aria-haspopup'
                    ) === 'menu' ||
                    ariaLabel.includes('more') ||
                    ariaLabel.includes('option')
                );
            }) ||
            null
        );
    }

    function getOpenMenu() {
        const candidates =
            Array.from(
                document.querySelectorAll(
                    '.cdk-overlay-container [role="menu"],' +
                    '.cdk-overlay-container .mat-mdc-menu-panel,' +
                    '.cdk-overlay-container .mat-mdc-menu-content'
                )
            );

        return (
            candidates.find(isVisible) ||
            null
        );
    }

    function findDeleteButton(
        menuElement
    ) {
        if (!menuElement) {
            return null;
        }

        const candidates =
            Array.from(
                menuElement.querySelectorAll(
                    'button, [role="menuitem"]'
                )
            );

        return (
            candidates.find(element => {
                const text =
                    (
                        element.textContent || ''
                    )
                        .replace(/\s+/g, ' ')
                        .trim()
                        .toLowerCase();

                if (
                    text === 'delete' ||
                    text.includes('delete turn') ||
                    text.includes('delete message')
                ) {
                    return true;
                }

                const icon =
                    element.querySelector(
                        '.material-symbols-outlined, mat-icon'
                    );

                return (
                    icon &&
                    icon.textContent
                        .trim()
                        .toLowerCase() ===
                        'delete'
                );
            }) ||
            null
        );
    }

    function findConfirmationButton() {
        const dialogs =
            Array.from(
                document.querySelectorAll(
                    'mat-dialog-container,' +
                    '.mat-mdc-dialog-container,' +
                    '[role="dialog"]'
                )
            );

        const dialog =
            dialogs.find(isVisible);

        if (!dialog) {
            return null;
        }

        const buttons =
            Array.from(
                dialog.querySelectorAll('button')
            );

        return (
            buttons.find(button => {
                const text =
                    (
                        button.textContent || ''
                    )
                        .replace(/\s+/g, ' ')
                        .trim()
                        .toLowerCase();

                return (
                    text === 'delete' ||
                    text === 'confirm' ||
                    (
                        button.type === 'submit' &&
                        text !== 'cancel'
                    )
                );
            }) ||
            null
        );
    }

    async function closeOpenOverlays() {
        document.dispatchEvent(
            new KeyboardEvent(
                'keydown',
                {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }
            )
        );

        await sleep(
            OVERLAY_SETTLE_MS
        );
    }

    async function deleteCurrentOldestTurn() {
        const oldestTurn =
            document.querySelector(
                'ms-chat-session ms-chat-turn'
            );

        if (!oldestTurn) {
            return {
                success: false,
                reason:
                    'No oldest turn was found.'
            };
        }

        const beforeCount =
            getTurnCount();

        oldestTurn.scrollIntoView({
            block: 'center',
            behavior: 'auto'
        });

        await sleep(
            SCROLL_SETTLE_MS
        );

        await closeOpenOverlays();

        const optionsButton =
            getMoreOptionsButton(
                oldestTurn
            );

        if (!optionsButton) {
            return {
                success: false,
                reason:
                    'The oldest turn options button was not found.'
            };
        }

        optionsButton.click();

        const menu =
            await waitForCondition(
                () => getOpenMenu(),
                MENU_TIMEOUT_MS,
                30
            );

        if (!menu) {
            return {
                success: false,
                reason:
                    'The turn menu did not open.'
            };
        }

        const deleteButton =
            findDeleteButton(menu);

        if (!deleteButton) {
            await closeOpenOverlays();

            return {
                success: false,
                reason:
                    'The Delete command was not found.'
            };
        }

        deleteButton.click();

        const confirmationButton =
            await waitForCondition(
                () =>
                    findConfirmationButton(),
                CONFIRMATION_TIMEOUT_MS,
                25
            );

        if (confirmationButton) {
            confirmationButton.click();
        }

        const countDecreased =
            await waitForCondition(
                () =>
                    getTurnCount() <
                    beforeCount,
                TURN_REMOVAL_TIMEOUT_MS,
                50
            );

        if (!countDecreased) {
            return {
                success: false,
                reason:
                    `Turn count stayed at ${beforeCount}.`
            };
        }

        return {
            success: true,
            beforeCount,
            afterCount:
                getTurnCount()
        };
    }

    async function verifyPendingBatch(
        currentCount
    ) {
        if (
            !getBoolean(
                PENDING_BATCH_KEY
            )
        ) {
            return;
        }

        const beforeCount =
            getNumber(
                COUNT_BEFORE_BATCH_KEY,
                currentCount
            );

        const locallyDeleted =
            getNumber(
                LOCALLY_DELETED_KEY,
                0
            );

        const persistedDecrease =
            Math.max(
                0,
                beforeCount -
                currentCount
            );

        setBoolean(
            PENDING_BATCH_KEY,
            false
        );

        if (persistedDecrease > 0) {
            const priorVerified =
                getNumber(
                    VERIFIED_DELETIONS_KEY,
                    0
                );

            setNumber(
                VERIFIED_DELETIONS_KEY,
                priorVerified +
                persistedDecrease
            );

            setNumber(
                ZERO_PROGRESS_BATCHES_KEY,
                0
            );

            setStatus(
                `Previous batch verified\n\n` +
                `Before: ${beforeCount}\n` +
                `Saved count now: ${currentCount}\n` +
                `Locally attempted: ${locallyDeleted}\n` +
                `Actually persisted: ${persistedDecrease}\n\n` +
                `Next batch remains ${FIXED_BATCH_SIZE}.`
            );

            return;
        }

        const zeroProgressBatches =
            getNumber(
                ZERO_PROGRESS_BATCHES_KEY,
                0
            ) + 1;

        setNumber(
            ZERO_PROGRESS_BATCHES_KEY,
            zeroProgressBatches
        );

        setStatus(
            `Previous batch saved zero deletions\n\n` +
            `Saved count: ${currentCount}\n` +
            `Failure: ${zeroProgressBatches} of ` +
            `${MAX_ZERO_PROGRESS_BATCHES}`
        );

        if (
            zeroProgressBatches >=
            MAX_ZERO_PROGRESS_BATCHES
        ) {
            setBoolean(
                ACTIVE_KEY,
                false
            );

            throw new Error(
                'Three consecutive batches produced zero saved deletions.'
            );
        }
    }

    async function runFixedBatch() {
        const currentCount =
            getTurnCount();

        const remainingToDelete =
            currentCount -
            KEEP_LAST_TURNS;

        const intendedBatchSize =
            Math.min(
                FIXED_BATCH_SIZE,
                remainingToDelete
            );

        let locallyDeleted = 0;

        for (
            let index = 0;
            index < intendedBatchSize;
            index++
        ) {
            if (
                stopRequested ||
                !isActive()
            ) {
                break;
            }

            setStatus(
                `Deleting fixed batch\n\n` +
                `Deletion: ${index + 1} of ` +
                `${intendedBatchSize}\n` +
                `Visible turns: ${getTurnCount()}\n` +
                `Keep target: ${KEEP_LAST_TURNS}`
            );

            const result =
                await deleteCurrentOldestTurn();

            if (!result.success) {
                setStatus(
                    `Deletion ${index + 1} failed\n\n` +
                    `${result.reason}\n\n` +
                    `Reloading to verify completed deletions.`
                );

                break;
            }

            locallyDeleted++;

            await sleep(
                BETWEEN_DELETIONS_MS
            );
        }

        return {
            intendedBatchSize,
            locallyDeleted
        };
    }

    async function processNextBatch() {
        if (
            processing ||
            !isActive()
        ) {
            return;
        }

        processing = true;
        updateControls();

        try {
            const session =
                await waitForChatSession();

            if (!session) {
                throw new Error(
                    'The AI Studio conversation did not load.'
                );
            }

            const detectedCount =
                await detectTurnCountFast();

            await verifyPendingBatch(
                detectedCount
            );

            if (!isActive()) {
                return;
            }

            const savedCount =
                getTurnCount();

            if (
                savedCount <=
                KEEP_LAST_TURNS
            ) {
                const verifiedDeletions =
                    getNumber(
                        VERIFIED_DELETIONS_KEY,
                        0
                    );

                setBoolean(
                    ACTIVE_KEY,
                    false
                );

                setBoolean(
                    PENDING_BATCH_KEY,
                    false
                );

                updateControls();

                setStatus(
                    `Deletion complete\n\n` +
                    `Current saved turns: ${savedCount}\n` +
                    `Verified deletions: ${verifiedDeletions}`
                );

                alert(
                    `Deletion complete.\n\n` +
                    `Current saved turns: ${savedCount}\n` +
                    `Verified deletions: ${verifiedDeletions}`
                );

                return;
            }

            setNumber(
                COUNT_BEFORE_BATCH_KEY,
                savedCount
            );

            const result =
                await runFixedBatch();

            if (
                stopRequested ||
                !isActive()
            ) {
                return;
            }

            if (
                result.locallyDeleted <= 0
            ) {
                throw new Error(
                    'No visible turns were deleted in this batch.'
                );
            }

            setNumber(
                LOCALLY_DELETED_KEY,
                result.locallyDeleted
            );

            setBoolean(
                PENDING_BATCH_KEY,
                true
            );

            setStatus(
                `Batch completed locally\n\n` +
                `Deleted locally: ${result.locallyDeleted}\n` +
                `Visible turns now: ${getTurnCount()}\n\n` +
                `Waiting for saving, then reloading once.`
            );

            await sleep(
                SAVE_WAIT_AFTER_BATCH_MS
            );

            if (
                stopRequested ||
                !isActive()
            ) {
                return;
            }

            location.reload();
        } catch (error) {
            console.error(error);

            setBoolean(
                ACTIVE_KEY,
                false
            );

            setBoolean(
                PENDING_BATCH_KEY,
                false
            );

            updateControls();

            setStatus(
                `Deletion stopped\n\n${error.message}`
            );

            alert(
                `Deletion stopped.\n\n${error.message}`
            );
        } finally {
            processing = false;
            updateControls();
        }
    }

    async function startDeletion() {
        if (processing) {
            return;
        }

        processing = true;
        updateControls();

        try {
            const session =
                await waitForChatSession();

            if (!session) {
                throw new Error(
                    'AI Studio has not loaded the conversation.'
                );
            }

            const currentCount =
                await detectTurnCountFast();

            if (
                currentCount <=
                KEEP_LAST_TURNS
            ) {
                alert(
                    `Detected ${currentCount} turns.\n\n` +
                    `Nothing needs to be deleted.`
                );

                return;
            }

            const approved =
                confirm(
                    `Detected turns: ${currentCount}\n\n` +
                    `Delete permanently: ` +
                    `${currentCount - KEEP_LAST_TURNS}\n` +
                    `Keep newest: ${KEEP_LAST_TURNS}\n` +
                    `Fixed batch size: ${FIXED_BATCH_SIZE}\n\n` +
                    `Proceed?`
                );

            if (!approved) {
                return;
            }

            clearAllRelatedStates();

            setBoolean(
                ACTIVE_KEY,
                true
            );

            setBoolean(
                PENDING_BATCH_KEY,
                false
            );

            setNumber(
                STARTING_COUNT_KEY,
                currentCount
            );

            setNumber(
                VERIFIED_DELETIONS_KEY,
                0
            );

            setNumber(
                ZERO_PROGRESS_BATCHES_KEY,
                0
            );

            stopRequested = false;
            processing = false;

            updateControls();

            await processNextBatch();
        } catch (error) {
            alert(
                `Could not start deletion.\n\n` +
                `${error.message}`
            );
        } finally {
            processing = false;
            updateControls();
        }
    }

    function stopDeletion() {
        stopRequested = true;

        setBoolean(
            ACTIVE_KEY,
            false
        );

        setBoolean(
            PENDING_BATCH_KEY,
            false
        );

        processing = false;

        updateControls();

        setStatus(
            `Deletion stopped by user\n\n` +
            `Current turns: ${getTurnCount()}\n` +
            `Verified deletions: ` +
            `${getNumber(VERIFIED_DELETIONS_KEY, 0)}`
        );
    }

    function resetState() {
        clearAllRelatedStates();

        processing = false;
        stopRequested = false;

        updateControls();

        setStatus(
            `All saved batch states reset\n\n` +
            `Detected turns: ${getTurnCount()}\n` +
            `Target retained: ${KEEP_LAST_TURNS}`
        );
    }

    async function initialize() {
        if (
            !location.pathname.startsWith(
                '/prompts/'
            )
        ) {
            return;
        }

        addControls();

        const session =
            await waitForChatSession();

        if (!session) {
            setStatus(
                'The AI Studio conversation could not be found.'
            );

            return;
        }

        if (isActive()) {
            setStatus(
                `Resuming fixed batches of ${FIXED_BATCH_SIZE}...`
            );

            await processNextBatch();
        } else {
            setStatus(
                `Ready\n\n` +
                `Currently detected turns: ${getTurnCount()}\n` +
                `Target retained: ${KEEP_LAST_TURNS}\n` +
                `Fixed batch size: ${FIXED_BATCH_SIZE}`
            );
        }

        updateControls();
    }

    if (
        document.readyState === 'complete' ||
        document.readyState === 'interactive'
    ) {
        window.setTimeout(
            initialize,
            100
        );
    } else {
        document.addEventListener(
            'DOMContentLoaded',
            () => {
                window.setTimeout(
                    initialize,
                    100
                );
            }
        );
    }
})();

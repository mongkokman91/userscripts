// ==UserScript==
// @name         Google AI Studio - Ultimate Auto-Config (v7.7)
// @namespace    http://tampermonkey.net/
// @version      7.7
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/Google%20AI%20Studio%20-%20Ultimate%20Auto-Config%20%28v7.7%29.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20AI%20Studio%20-%20Ultimate%20Auto-Config%20%28v7.7%29.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/Google%20AI%20Studio%20-%20Ultimate%20Auto-Config%20%28v7.7%29.user.js
// @description  Aggressive auto-config: Fixed System Instructions, 8888 Output Length, and URL Context.
// @author       User
// @match        https://aistudio.google.com/prompts/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        temperature: "1",
        outputLength: "8888",
        thinkingLevel: "Low",
        mediaResolution: "Default",
        toggles: {
            codeExecution: false,
            googleSearch: true,
            urlContext: true,
        },
        systemInstructions: `You are a very strong reasoner and planner. Use these critical instructions to structure your plans, thoughts, and responses.

Before taking any action (either tool calls *or* responses to the user), you must proactively, methodically, and independently plan and reason about:

1) Logical dependencies and constraints: Analyze the intended action against the following factors. Resolve conflicts in order of importance:
    1.1) Policy-based rules, mandatory prerequisites, and constraints.
    1.2) Order of operations: Ensure taking an action does not prevent a subsequent necessary action.
        1.2.1) The user may request actions in a random order, but you may need to reorder operations to maximize successful completion of the task.
    1.3) Other prerequisites (information and/or actions needed).
    1.4) Explicit user constraints or preferences.

2) Risk assessment: What are the consequences of taking the action? Will the new state cause any future issues?
    2.1) For exploratory tasks (like searches), missing *optional* parameters is a LOW risk. **Prefer calling the tool with the available information over asking the user, unless** your \`Rule 1\` (Logical Dependencies) reasoning determines that optional information is required for a later step in your plan.

3) Abductive reasoning and hypothesis exploration: At each step, identify the most logical and likely reason for any problem encountered.
    3.1) Look beyond immediate or obvious causes. The most likely reason may not be the simplest and may require deeper inference.
    3.2) Hypotheses may require additional research. Each hypothesis may take multiple steps to test.
    3.3) Prioritize hypotheses based on likelihood, but do not discard less likely ones prematurely. A low-probability event may still be the root cause.

4) Outcome evaluation and adaptability: Does the previous observation require any changes to your plan?
    4.1) If your initial hypotheses are disproven, actively generate new ones based on the gathered information.

5) Information availability: Incorporate all applicable and alternative sources of information, including:
    5.1) Using available tools and their capabilities
    5.2) All policies, rules, checklists, and constraints
    5.3) Previous observations and conversation history
    5.4) Information only available by asking the user

6) Precision and Grounding: Ensure your reasoning is extremely precise and relevant to each exact ongoing situation.
    6.1) Verify your claims by quoting the exact applicable information (including policies) when referring to them.

7) Completeness: Ensure that all requirements, constraints, options, and preferences are exhaustively incorporated into your plan.
    7.1) Resolve conflicts using the order of importance in #1.
    7.2) Avoid premature conclusions: There may be multiple relevant options for a given situation.
        7.2.1) To check for whether an option is relevant, reason about all information sources from #5.
        7.2.2) You may need to consult the user to even know whether something is applicable. Do not assume it is not applicable without checking.
    7.3) Review applicable sources of information from #5 to confirm which are relevant to the current state.

8) Persistence and patience: Do not give up unless all the reasoning above is exhausted.
    8.1) Don't be dissuaded by time taken or user frustration.
    8.2) This persistence must be intelligent: On *transient* errors (e.g. please try again), you *must* retry **unless an explicit retry limit (e.g., max x tries) has been reached**. If such a limit is hit, you *must* stop. On *other* errors, you must change your strategy or arguments, not repeat the same failed call.

9) Inhibit your response: only take an action after all the above reasoning is completed. Once you've taken an action, you cannot take it back.`
    };

    const SLEEP = (ms) => new Promise(res => setTimeout(res, ms));

    async function setNumericInput(labelPart, value) {
        const containers = document.querySelectorAll('.run-settings-row, ms-slider-setting');
        for (const container of containers) {
            if (container.textContent.toLowerCase().includes(labelPart.toLowerCase())) {
                const input = container.querySelector('input.slider-number-input, input[type="number"]');
                if (input) {
                    const maxVal = input.getAttribute('max');
                    let finalValue = (maxVal && parseInt(value) > parseInt(maxVal)) ? maxVal : value;

                    if (input.value !== String(finalValue)) {
                        input.value = finalValue;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('blur', { bubbles: true }));
                        console.log(`[AutoConfig] ${labelPart} set to ${finalValue}`);
                    }
                    return;
                }
            }
        }
    }

    async function setToggle(labelPart, state) {
        const buttons = Array.from(document.querySelectorAll('button[role="switch"]'));
        const btn = buttons.find(b => b.getAttribute('aria-label')?.toLowerCase().includes(labelPart.toLowerCase()));
        if (btn && (btn.getAttribute('aria-checked') === 'true') !== state) {
            btn.click();
            await SLEEP(300);
        }
    }

    async function setMatSelect(labelPart, text) {
        const select = Array.from(document.querySelectorAll('mat-select'))
            .find(s => s.getAttribute('aria-label')?.toLowerCase().includes(labelPart.toLowerCase()));
        if (select && !select.textContent.includes(text)) {
            select.click();
            await SLEEP(500);
            const opt = Array.from(document.querySelectorAll('mat-option')).find(o => o.textContent.trim() === text);
            if (opt) opt.click();
            else document.body.click();
            await SLEEP(300);
        }
    }

    async function applySystemInstructions() {
        const sysBtn = document.querySelector('button[data-test-system-instructions-card]');
        if (!sysBtn) return;

        // Force click to open modal
        sysBtn.click();
        await SLEEP(600);

        const textarea = document.querySelector('textarea[aria-label*="instructions" i]');
        if (textarea) {
            if (textarea.value.trim() !== CONFIG.systemInstructions.trim()) {
                textarea.value = CONFIG.systemInstructions;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                textarea.dispatchEvent(new Event('blur', { bubbles: true }));
                await SLEEP(500);

                // Click "Done"
                const doneBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Done'));
                if (doneBtn) {
                    doneBtn.click();
                    console.log("[AutoConfig] System Instructions Saved.");
                }
            } else {
                // Already set, just close
                const closeBtn = document.querySelector('button[aria-label*="Close" i]');
                if (closeBtn) closeBtn.click();
            }
        }
    }

    async function runConfiguration() {
        console.log("[AutoConfig] Starting...");

        // Ensure sidebar is open
        const sidebar = document.querySelector('ms-run-settings');
        if (!sidebar || sidebar.offsetParent === null) {
            const settingsBtn = document.querySelector('button[aria-label*="settings" i]');
            if (settingsBtn) settingsBtn.click();
            await SLEEP(800);
        }

        await setNumericInput("Temperature", CONFIG.temperature);
        await setNumericInput("Output length", CONFIG.outputLength);
        await setMatSelect("Thinking Level", CONFIG.thinkingLevel);
        await setToggle("Code execution", CONFIG.toggles.codeExecution);
        await setToggle("Google Search", CONFIG.toggles.googleSearch);
        await setToggle("Browse", CONFIG.toggles.urlContext);

        await applySystemInstructions();
        console.log("[AutoConfig] Sequence Complete.");
    }

    // Handle SPA navigation & Init
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (lastUrl.includes('/prompts/')) setTimeout(runConfiguration, 2000);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'complete') setTimeout(runConfiguration, 1500);
    else window.addEventListener('load', () => setTimeout(runConfiguration, 1500));

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.key === 's') runConfiguration();
    });
})();

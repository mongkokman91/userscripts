// ==UserScript==
// @name         PC Optimum Auto-Select All Offers
// @namespace    http://tampermonkey.net/
// @version      1.0
// @homepageURL  https://github.com/mongkokman91/userscripts/blob/main/scripts/PC%20Optimum%20Auto-Select%20All%20Offers.user.js
// @updateURL    https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/PC%20Optimum%20Auto-Select%20All%20Offers.user.js
// @downloadURL  https://raw.githubusercontent.com/mongkokman91/userscripts/main/scripts/PC%20Optimum%20Auto-Select%20All%20Offers.user.js
// @description  Automatically checks all "Select offer" checkboxes on PC Optimum offer pages
// @author       You
// @match        https://www.pcoptimum.ca/load?page=*
// @match        https://www.pcoptimum.ca/offers*
// @match        https://www.pcoptimum.ca/load*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Function to check all unchecked offer checkboxes
    function selectAllOffers() {
        // Find all checkboxes that are not already checked
        const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');

        let checkedCount = 0;
        checkboxes.forEach(checkbox => {
            // Only click if it's not already checked (extra safety)
            if (!checkbox.checked) {
                checkbox.click();
                checkedCount++;
            }
        });

        console.log(`PC Optimum Auto-Select: Checked ${checkedCount} offers`);
        return checkedCount;
    }

    // Add a manual button to the page for re-checking
    function addControlButton() {
        const button = document.createElement('button');
        button.textContent = '✓ Select All Offers';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            padding: 12px 20px;
            background: #D81E05;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        `;

        button.onmouseover = () => {
            button.style.background = '#B01804';
            button.style.transform = 'scale(1.05)';
        };

        button.onmouseout = () => {
            button.style.background = '#D81E05';
            button.style.transform = 'scale(1)';
        };

        button.onclick = () => {
            const count = selectAllOffers();
            button.textContent = count > 0 ? `✓ Selected ${count} offers!` : '✓ All offers selected!';
            setTimeout(() => {
                button.textContent = '✓ Select All Offers';
            }, 2000);
        };

        document.body.appendChild(button);
    }

    // Wait for page to be fully loaded with dynamic content
    function init() {
        // Wait a bit for dynamic content to load
        setTimeout(() => {
            // Auto-select all offers on page load
            const initialCount = selectAllOffers();

            // Add the manual control button
            addControlButton();

            // Show a subtle notification
            if (initialCount > 0) {
                console.log(`PC Optimum: Automatically selected ${initialCount} offers on page load`);
            }
        }, 2000); // 2 second delay to ensure offers are loaded
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

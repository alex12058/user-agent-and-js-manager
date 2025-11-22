// Content script to clean up pages when user has configured settings
(function () {
    'use strict';

    let shouldCleanup = false;

    // Check if this domain has custom settings
    function checkIfShouldCleanup() {
        chrome.runtime.sendMessage(
            { action: 'getSettings', url: window.location.href },
            (response) => {
                if (!response || !response.siteSettings) {
                    return;
                }

                const settings = response.siteSettings;
                // Only cleanup if user has enabled any custom settings for this domain
                shouldCleanup = settings.agent !== 'chrome' || settings.disableJs || settings.disableCookies;

                if (shouldCleanup) {
                    initCleanup();
                }
            }
        );
    }

    // Remove loading indicators and overlays
    function cleanupPage() {
        if (!shouldCleanup) return;

        // Remove common loading/spinner elements
        const loadingSelectors = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="skeleton"]',
            '[id*="loading"]',
            '[id*="spinner"]',
            '.loader',
            '.preloader',
            '[data-testid*="loading"]',
            '[data-testid*="spinner"]',
            '.css-loading',
            '[data-testid="photoviewer-modal"]',
            '[data-testid="modal-overlay"]'
        ];

        loadingSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                // Only remove if it looks like a loading indicator
                if (el.offsetHeight < 200 || el.textContent.trim().length < 50) {
                    el.remove();
                }
            });
        });

        // Remove overlays and modals
        const overlaySelectors = [
            '[class*="overlay"]',
            '[class*="modal"]',
            '[class*="popup"]',
            '[style*="position: fixed"]',
            '[style*="position:fixed"]'
        ];

        overlaySelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' &&
                    (style.zIndex > 100 || el.classList.toString().match(/overlay|modal|popup/i))) {
                    el.remove();
                }
            });
        });

        // Ensure body is scrollable
        if (document.body) {
            document.body.style.overflow = 'auto';
        }
        document.documentElement.style.overflow = 'auto';

        // Remove any inline styles that might hide content
        document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => {
            // Only show if it looks like article content
            if (el.textContent.length > 100) {
                el.style.display = '';
            }
        });
    }

    // Initialize cleanup process
    function initCleanup() {
        // Run cleanup multiple times to catch dynamically loaded content
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cleanupPage);
        } else {
            cleanupPage();
        }

        setTimeout(cleanupPage, 500);
        setTimeout(cleanupPage, 1000);
        setTimeout(cleanupPage, 2000);

        // Initialize observer
        initObserver();
    }

    // Observe for new loading indicators
    function initObserver() {
        if (!document.body) {
            // If body doesn't exist yet, wait for it
            const docObserver = new MutationObserver((mutations, obs) => {
                if (document.body) {
                    obs.disconnect();
                    initObserver();
                }
            });
            docObserver.observe(document.documentElement, { childList: true });
            return;
        }

        const observer = new MutationObserver(() => {
            cleanupPage();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop observing after 5 seconds to avoid performance issues
        setTimeout(() => observer.disconnect(), 5000);
    }

    // Check settings when script loads
    checkIfShouldCleanup();
})();

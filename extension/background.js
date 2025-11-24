// Available User-Agent presets
// Default User-Agent presets
const DEFAULT_USER_AGENTS = {
    googlebot: {
        name: "Googlebot",
        ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        referer: "https://www.google.com/"
    },
    bingbot: {
        name: "Bingbot",
        ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        referer: "https://www.bing.com/"
    },
    twitterbot: {
        name: "Twitterbot",
        ua: "Twitterbot/1.0",
        referer: "https://t.co/"
    },
    facebookbot: {
        name: "Facebook Bot",
        ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        referer: "https://www.facebook.com/"
    },
    chrome: {
        name: "Chrome (Default)",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        referer: ""
    }
};

// Default settings
const DEFAULT_SETTINGS = {
    userAgents: { ...DEFAULT_USER_AGENTS },
    siteSettings: {} // { "example.com": { agent: "chrome", disableJs: false, disableCookies: false } }
};

let settings = { ...DEFAULT_SETTINGS };

// Load settings
chrome.storage.local.get(['settings'], (result) => {
    if (result.settings) {
        settings = { ...DEFAULT_SETTINGS, ...result.settings };
    }
    updateRules();
    updateIcon();
});

// Save settings
function saveSettings() {
    // Before persisting, prune orphaned site entries (disabled with no custom settings)
    pruneSiteSettings();
    chrome.storage.local.set({ settings });
    updateRules();
    updateIcon();
}

// Remove site entries that are default
function pruneSiteSettings() {
    for (const [domain, cfg] of Object.entries(settings.siteSettings)) {
        // Check if agent exists, fallback to chrome if not
        if (!settings.userAgents[cfg.agent]) {
            cfg.agent = 'chrome';
        }
        if (cfg.agent === 'chrome' && !cfg.disableJs && !cfg.disableCookies) {
            delete settings.siteSettings[domain];
        }
    }
}

// Get domain from URL
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return null;
    }
}

// Get settings for a specific domain
function getSettingsForDomain(domain) {
    if (settings.siteSettings[domain]) {
        return settings.siteSettings[domain];
    }
    return {
        agent: 'chrome',
        disableJs: false,
        disableCookies: false
    };
}

// Update icon based on current tab
async function updateIcon() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;

        const domain = getDomain(tab.url);
        if (!domain) return;

        const siteSettings = getSettingsForDomain(domain);
        const iconPath = 'icons/icon48.png';
        chrome.action.setIcon({ path: iconPath, tabId: tab.id });

        // Visual badge: show "ON" when any setting is non-default
        const isModified = siteSettings.agent !== 'chrome' || siteSettings.disableJs || siteSettings.disableCookies;

        if (isModified) {
            chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tab.id });
        } else {
            chrome.action.setBadgeText({ text: '', tabId: tab.id });
        }
    } catch (e) {
        console.error('Error updating icon:', e);
    }
}

// Listen for tab changes
chrome.tabs.onActivated.addListener(updateIcon);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        updateIcon();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getSettings') {
        const domain = getDomain(request.url);
        const siteSettings = domain ? getSettingsForDomain(domain) : null;

        sendResponse({
            settings,
            domain,
            siteSettings,
            userAgents: settings.userAgents
        });
    } else if (request.action === 'updateUserAgents') {
        if (request.userAgents) {
            settings.userAgents = request.userAgents;
            // Ensure chrome default always exists
            if (!settings.userAgents.chrome) {
                settings.userAgents.chrome = DEFAULT_USER_AGENTS.chrome;
            }
            saveSettings();
            sendResponse({ success: true });
        }
    } else if (request.action === 'updateSiteSettings') {
        const domain = getDomain(request.url);
        if (domain) {
            if (!settings.siteSettings[domain]) {
                settings.siteSettings[domain] = {
                    agent: 'chrome',
                    disableJs: false,
                    disableCookies: false
                };
            }

            if (request.agent !== undefined) {
                if (settings.userAgents[request.agent]) {
                    settings.siteSettings[domain].agent = request.agent;
                }
            }
            if (request.disableJs !== undefined) {
                settings.siteSettings[domain].disableJs = request.disableJs;
            }
            if (request.disableCookies !== undefined) {
                settings.siteSettings[domain].disableCookies = request.disableCookies;
            }

            // Prune if all settings are default
            const s = settings.siteSettings[domain];
            if (s.agent === 'chrome' && !s.disableJs && !s.disableCookies) {
                delete settings.siteSettings[domain];
            }

            updateJavaScriptSettings();
            saveSettings();
            sendResponse({ success: true });
        }
    }
    return true;
});
// Update JavaScript settings for all configured sites
function updateJavaScriptSettings() {
    if (!chrome.contentSettings || !chrome.contentSettings.javascript) return;
    // Clear all previous JavaScript settings
    chrome.contentSettings.javascript.clear({}, () => {
        // Set JavaScript for each site with custom settings
        for (const [domain, siteSettings] of Object.entries(settings.siteSettings)) {
            if (siteSettings.disableJs) {
                const pattern = `*://${domain}/*`;
                chrome.contentSettings.javascript.set({
                    primaryPattern: pattern,
                    setting: 'block'
                });
                const wwwPattern = `*://www.${domain}/*`;
                chrome.contentSettings.javascript.set({
                    primaryPattern: wwwPattern,
                    setting: 'block'
                });
            }
        }
    });
}



// Clear cookies for a specific domain
async function clearCookiesForDomain(domain) {
    try {
        // Get all cookies for the domain
        const cookies = await chrome.cookies.getAll({ domain: domain });

        // Remove each cookie
        for (const cookie of cookies) {
            const protocol = cookie.secure ? 'https:' : 'http:';
            const url = `${protocol}//${cookie.domain}${cookie.path}`;
            await chrome.cookies.remove({
                url: url,
                name: cookie.name,
                storeId: cookie.storeId
            });
        }

        // Also try with www prefix
        const wwwCookies = await chrome.cookies.getAll({ domain: `www.${domain}` });
        for (const cookie of wwwCookies) {
            const protocol = cookie.secure ? 'https:' : 'http:';
            const url = `${protocol}//${cookie.domain}${cookie.path}`;
            await chrome.cookies.remove({
                url: url,
                name: cookie.name,
                storeId: cookie.storeId
            });
        }

        console.log(`Cleared ${cookies.length + wwwCookies.length} cookies for ${domain}`);
    } catch (e) {
        console.error('Error clearing cookies:', e);
    }
}

// Update declarativeNetRequest rules
async function updateRules() {
    try {
        // Remove all existing dynamic rules and all IDs we will use
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules.map(rule => rule.id);

        // We'll assign rule IDs starting from 1000, two per domain (domain and www.domain)
        const baseId = 1000;
        let nextId = baseId;
        const rules = [];
        const idsToUse = [];

        // Add rules for each site with custom settings
        for (const [domain, siteSettings] of Object.entries(settings.siteSettings)) {
            // Skip if using default chrome agent and cookies are enabled (no headers to modify)
            if (siteSettings.agent === 'chrome' && !siteSettings.disableCookies) continue;

            const requestHeaders = [];

            // Add User-Agent header if not default
            if (siteSettings.agent !== 'chrome' && settings.userAgents[siteSettings.agent]) {
                const agent = settings.userAgents[siteSettings.agent];
                requestHeaders.push({
                    header: 'User-Agent',
                    operation: 'set',
                    value: agent.ua
                });
                if (agent.referer) {
                    requestHeaders.push({
                        header: 'Referer',
                        operation: 'set',
                        value: agent.referer
                    });
                }
            }

            // Remove Cookie header if cookies disabled
            if (siteSettings.disableCookies) {
                requestHeaders.push({
                    header: 'Cookie',
                    operation: 'remove'
                });
            }

            const responseHeaders = [];
            if (siteSettings.disableCookies) {
                responseHeaders.push({
                    header: 'Set-Cookie',
                    operation: 'remove'
                });
            }

            if (requestHeaders.length > 0 || responseHeaders.length > 0) {
                const ruleAction = {
                    type: 'modifyHeaders'
                };
                if (requestHeaders.length > 0) ruleAction.requestHeaders = requestHeaders;
                if (responseHeaders.length > 0) ruleAction.responseHeaders = responseHeaders;

                // Assign two IDs per domain (domain and www.domain)
                const id1 = nextId++;
                const id2 = nextId++;
                idsToUse.push(id1, id2);

                rules.push({
                    id: id1,
                    priority: 1,
                    action: ruleAction,
                    condition: {
                        urlFilter: `*://${domain}/*`,
                        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
                    }
                });

                rules.push({
                    id: id2,
                    priority: 1,
                    action: ruleAction,
                    condition: {
                        urlFilter: `*://www.${domain}/*`,
                        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
                    }
                });
            }
        }

        // Remove all IDs we will use (and any existing ones)
        const allIdsToRemove = Array.from(new Set([...ruleIdsToRemove, ...idsToUse]));


        // Add the rules
        if (rules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: allIdsToRemove,
                addRules: rules
            });
            console.log(`Added ${rules.length} User-Agent rules`);
        }
    } catch (e) {
        console.error('Error updating rules:', e);
    }
}

// Initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
    updateRules();
});

// Initialize on startup
updateRules();

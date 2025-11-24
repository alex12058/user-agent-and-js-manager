let currentUrl = '';
let currentSettings = null;

// Simple debounce utility (wait ms before invoking)
function debounce(fn, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Get current tab and settings
async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
        document.getElementById('siteDomain').textContent = 'No active tab';
        return;
    }

    currentUrl = tab.url;

    chrome.runtime.sendMessage(
        { action: 'getSettings', url: currentUrl, tabId: tab.id },
        (response) => {
            currentSettings = response;
            updateUI();
        }
    );
}

function updateSiteSettings(changes) {
    if (!currentSettings || !currentSettings.siteSettings) return;

    chrome.runtime.sendMessage(
        {
            action: 'updateSiteSettings',
            url: currentUrl,
            agent: changes.agent,
            disableJs: changes.disableJs,
            disableCookies: changes.disableCookies
        },
        () => {
            // No auto-reload, just re-init to sync state if needed
            init();
        }
    );
}

// Debounced version to avoid rapid fire
const debouncedUpdateSiteSettings = debounce(updateSiteSettings, 300);

function updateUI() {
    if (!currentSettings) return;

    const { domain, siteSettings, userAgents } = currentSettings;

    // Update domain display
    const domainDisplay = document.getElementById('siteDomain');
    if (domain) {
        domainDisplay.textContent = domain;
        domainDisplay.title = domain; // Add tooltip for long domains
    } else {
        domainDisplay.textContent = 'No Active Tab';
    }

    // Populate agent select
    const siteAgentSelect = document.getElementById('siteAgentSelect');
    siteAgentSelect.innerHTML = '';

    if (userAgents) {
        for (const [key, agent] of Object.entries(userAgents)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = agent.name;
            if (key === siteSettings.agent) {
                option.selected = true;
            }
            siteAgentSelect.appendChild(option);
        }
    }

    // Update checkboxes
    document.getElementById('siteDisableJsCheckbox').checked = !!siteSettings.disableJs;
    document.getElementById('siteDisableCookiesCheckbox').checked = !!siteSettings.disableCookies;
}

// Event Listeners
document.getElementById('siteAgentSelect').addEventListener('change', (e) => {
    debouncedUpdateSiteSettings({ agent: e.target.value });
});

document.getElementById('siteDisableJsCheckbox').addEventListener('change', (e) => {
    debouncedUpdateSiteSettings({ disableJs: e.target.checked });
});

document.getElementById('siteDisableCookiesCheckbox').addEventListener('change', (e) => {
    debouncedUpdateSiteSettings({ disableCookies: e.target.checked });
});

document.getElementById('reloadBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.tabs.reload(tab.id);
        window.close();
    }
});

document.getElementById('openOptionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', init);
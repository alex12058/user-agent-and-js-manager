// Load and display settings
function loadSettings() {
    chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || { siteSettings: {}, userAgents: {} };

        loadAgents(settings.userAgents);
        loadSites(settings.siteSettings);
    });
}

function loadAgents(userAgents) {
    const agentList = document.getElementById('agentList');
    agentList.innerHTML = '';

    if (!userAgents || Object.keys(userAgents).length === 0) {
        agentList.innerHTML = '<div class="empty-state">No user agents found.</div>';
        return;
    }

    for (const [key, agent] of Object.entries(userAgents)) {
        const div = document.createElement('div');
        div.className = 'agent-item';

        const isDefault = ['googlebot', 'bingbot', 'twitterbot', 'facebookbot', 'chrome'].includes(key);
        const deleteBtn = isDefault ? '' : `<button class="delete-btn delete-agent-btn" data-key="${key}">Remove</button>`;

        div.innerHTML = `
            <div class="agent-info">
                <div class="agent-name">${agent.name}</div>
                <div class="agent-ua">${agent.ua}</div>
                ${agent.referer ? `<div class="agent-ua">Referer: ${agent.referer}</div>` : ''}
            </div>
            ${deleteBtn}
        `;
        agentList.appendChild(div);
    }

    // Add delete listeners
    document.querySelectorAll('.delete-agent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.dataset.key;
            deleteAgent(key);
        });
    });
}

function loadSites(siteSettings) {
    const siteList = document.getElementById('siteList');

    if (!siteSettings || Object.keys(siteSettings).length === 0) {
        siteList.innerHTML = '<div class="empty-state">No sites configured yet. Visit a site and use the popup to configure it.</div>';
        return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Domain</th>
                <th>User Agent</th>
                <th>JS Disabled</th>
                <th>Cookies Disabled</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `;

    const tbody = table.querySelector('tbody');

    for (const [domain, config] of Object.entries(siteSettings)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${domain}</td>
            <td>${config.agent}</td>
            <td>${config.disableJs ? 'Yes' : 'No'}</td>
            <td>${config.disableCookies ? 'Yes' : 'No'}</td>
            <td>
                <button class="delete-btn delete-site-btn" data-domain="${domain}">Remove</button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    siteList.innerHTML = '';
    siteList.appendChild(table);

    // Add delete listeners
    document.querySelectorAll('.delete-site-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const domain = e.target.dataset.domain;
            deleteSite(domain);
        });
    });
}

function deleteAgent(key) {
    if (confirm(`Are you sure you want to delete this User Agent?`)) {
        chrome.storage.local.get(['settings'], (result) => {
            const settings = result.settings;
            if (settings.userAgents[key]) {
                delete settings.userAgents[key];
                chrome.runtime.sendMessage({
                    action: 'updateUserAgents',
                    userAgents: settings.userAgents
                }, () => {
                    loadSettings();
                });
            }
        });
    }
}

function addAgent() {
    const name = document.getElementById('newAgentName').value.trim();
    const ua = document.getElementById('newAgentUa').value.trim();
    const referer = document.getElementById('newAgentReferer').value.trim();

    if (!name || !ua) {
        alert('Name and User-Agent string are required.');
        return;
    }

    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings;
        if (settings.userAgents[key]) {
            alert('An agent with this name already exists.');
            return;
        }

        settings.userAgents[key] = {
            name,
            ua,
            referer
        };

        chrome.runtime.sendMessage({
            action: 'updateUserAgents',
            userAgents: settings.userAgents
        }, () => {
            document.getElementById('newAgentName').value = '';
            document.getElementById('newAgentUa').value = '';
            document.getElementById('newAgentReferer').value = '';
            loadSettings();
        });
    });
}

function deleteSite(domain) {
    if (confirm(`Are you sure you want to remove settings for ${domain}?`)) {
        chrome.runtime.sendMessage({
            action: 'updateSiteSettings',
            url: `https://${domain}`, // Mock URL for the handler
            agent: 'chrome',
            disableJs: false,
            disableCookies: false
        }, () => {
            loadSettings();
        });
    }
}

document.getElementById('addAgentBtn').addEventListener('click', addAgent);
document.addEventListener('DOMContentLoaded', loadSettings);


// --- State ---
let token = localStorage.getItem('fp_token');
let theme = localStorage.getItem('fp_theme') || 'dark';
let ws = null;
let statsInterval = null;
let activeTab = 'dashboard';
let currentMonitoredSession = 'admin_session'; 
let currentMonitoredPass = null; // Will set if viewing specific session

const ADMIN_SESSION = 'admin_session';

// --- Elements ---
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logsContainer = document.getElementById('logs-container');
const themeBtn = document.getElementById('theme-toggle');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Elements might be null if script runs before DOM, but defer/bottom placement handles it
    applyTheme(theme);
    if (token) {
        showDashboard();
    }
});

// --- Auth & Logout ---
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (data.success) {
            token = `Basic ${btoa(u + ':' + p)}`;
            localStorage.setItem('fp_token', token);
            showDashboard();
        } else {
            document.getElementById('login-error').innerText = data.error;
        }
    } catch (error) {
        document.getElementById('login-error').innerText = 'Connection Failed';
    }
});

const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) logoutBtn.addEventListener('click', logout);

function logout() {
    localStorage.removeItem('fp_token');
    location.reload();
}

// --- Tabs ---
window.switchTab = function(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-sessions').classList.add('hidden');
    document.getElementById(`view-${tab}`).classList.remove('hidden');

    if (tab === 'sessions') {
        loadSessions();
    }
}

// --- Sessions Management ---
async function loadSessions() {
    try {
        const res = await fetch('/api/admin/sessions', { headers: { 'Authorization': token } });
        if (res.status === 401) return logout();
        const data = await res.json();
        
        if (data.success) {
            renderSessions(data.sessions);
        }
    } catch (e) { console.error(e); }
}

function renderSessions(sessions) {
    const tbody = document.getElementById('sessions-table-body');
    tbody.innerHTML = '';
    
    sessions.forEach(s => {
        if(s.sessionName === 'admin_session') return; // Skip internal

        const tr = document.createElement('tr');
        const expiry = s.sessionExpiry ? new Date(s.sessionExpiry).toLocaleString() : 'Never';
        const statusClass = s.suspended ? 'status-suspended' : 'status-active';
        const statusText = s.suspended ? 'Suspended' : 'Active';
        
        // Escape Values
        const sName = escapeHtml(s.sessionName);
        const sPass = escapeHtml(s.password); // In prod, don't expose pass, but requirement implies full control

        tr.innerHTML = `
            <td>${sName}</td>
            <td>${expiry}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="action-group">
                    <button class="btn-sm" onclick="viewSessionLogs('${sName}', '${sPass}')" title="View Logs">👁️</button>
                    <button class="btn-sm" onclick="toggleSuspend('${sName}', '${sPass}', '${s.secretKey}', ${!s.suspended})">
                        ${s.suspended ? 'Resume' : 'Suspend'}
                    </button>
                    <button class="btn-sm btn-danger" onclick="deleteSession('${sName}', '${sPass}', '${s.secretKey}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

const fcmFields = document.getElementById('fcm-fields');

window.toggleFcmFields = function() {
    const enabled = document.getElementById('fcm-enabled').checked;
    if(fcmFields) {
        if(enabled) fcmFields.classList.remove('hidden');
        else fcmFields.classList.add('hidden');
    }
}

async function createSession(e) {
    e.preventDefault();
    const name = document.getElementById('new-session-name').value;
    const pass = document.getElementById('new-session-pass').value;
    const retry = document.getElementById('new-retry-interval').value;
    const maxRetry = document.getElementById('new-max-retry').value;
    const msgExpiry = document.getElementById('new-msg-expiry').value;
    const expirySec = document.getElementById('new-expiry').value;

    const payload = { sessionName: name, password: pass };
    
    // Optional Config
    if (retry) payload.retryInterval = parseInt(retry);
    if (maxRetry) payload.maxRetryLimit = parseInt(maxRetry);
    if (msgExpiry) payload.messageExpiryTime = parseInt(msgExpiry);
    if (expirySec) payload.sessionExpiry = Date.now() + (parseInt(expirySec) * 1000);

    // FCM Config
    const fcmEnabled = document.getElementById('fcm-enabled').checked;
    if (fcmEnabled) {
        payload.fcmConfig = {
            enabled: true,
            projectId: document.getElementById('fcm-project-id').value,
            clientEmail: document.getElementById('fcm-client-email').value,
            privateKey: document.getElementById('fcm-private-key').value
        };
    }

    try {
        const res = await fetch('/api/createSession', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token 
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeCreateModal();
            loadSessions();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) { alert('Failed'); }
}

// Make functions global for inline onclick handlers
window.createSession = createSession;

window.deleteSession = async function(sessionName, password, secretKey) {
    if (!confirm(`Delete session ${sessionName}? This cannot be undone.`)) return;
    try {
        await fetch('/api/dropSession', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token 
            },
            body: JSON.stringify({ sessionName, password, secretKey })
        });
        loadSessions();
    } catch(e) { alert('Failed'); }
}

window.toggleSuspend = async function(sessionName, password, secretKey, suspend) {
    try {
        await fetch('/api/suspendSession', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token 
            },
            body: JSON.stringify({ sessionName, password, secretKey, suspend })
        });
        loadSessions();
    } catch(e) { alert('Failed'); }
}

const createForm = document.getElementById('create-session-form');
if(createForm) createForm.addEventListener('submit', createSession);

// --- Modals ---
window.openCreateModal = function() { document.getElementById('create-modal').classList.remove('hidden'); }
window.closeCreateModal = function() { document.getElementById('create-modal').classList.add('hidden'); }

// --- Logs & WS ---

window.viewSessionLogs = function(sessionName, password) {
    // Switch to Dashboard
    switchTab('dashboard');
    
    // Connect as this session
    currentMonitoredSession = sessionName;
    currentMonitoredPass = password;
    
    // Reconnect logic
    reconnectWs();
    
    // Update UI
    document.getElementById('current-session-label').innerText = `SESSION: ${sessionName}`;
    document.getElementById('console-title').innerHTML = `
        SESSION LOGS 
        <button class="btn-sm btn-ghost" style="font-size:0.6em; margin-left:10px;" onclick="restoreGlobalLogs()">Switch to Global</button>
    `;
    
    // Clear current logs
    logsContainer.innerHTML = '<div class="log-entry" style="color:var(--accent)">--- Switching to Session Context ---</div>';
}

window.restoreGlobalLogs = function() {
    currentMonitoredSession = ADMIN_SESSION;
    currentMonitoredPass = null;
    reconnectWs();
    document.getElementById('current-session-label').innerText = `GLOBAL`;
    document.getElementById('console-title').innerHTML = `SYSTEM LOGS`;
    logsContainer.innerHTML = '<div class="log-entry" style="color:var(--accent)">--- Switching to Global Context ---</div>';
}

// --- Theme ---
if(themeBtn) {
    themeBtn.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('fp_theme', theme);
        applyTheme(theme);
    });
}

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if(themeBtn) themeBtn.innerText = t === 'dark' ? '🌙' : '☀️';
}

// --- Dashboard Logic ---
function showDashboard() {
    if(loginScreen) loginScreen.classList.add('hidden');
    if(dashboard) dashboard.style.display = 'flex';
    startStats();
    connectWs();
}

async function startStats() {
    const fetchStats = async () => {
        if (activeTab !== 'dashboard') return;
        try {
            const res = await fetch('/api/admin/stats', { headers: { 'Authorization': token } });
            if (res.status === 401) return logout();
            const data = await res.json();
            
            const elConn = document.getElementById('stat-conn');
            if(elConn) elConn.innerText = data.connections;
            
            const elUp = document.getElementById('stat-uptime');
            if(elUp) elUp.innerText = formatUptime(data.uptime);
            
            const elMem = document.getElementById('stat-mem');
            if(elMem) elMem.innerText = Math.round(data.memory.heapUsed / 1024 / 1024);
        } catch (e) { }
    };
    fetchStats();
    statsInterval = setInterval(fetchStats, 2000);
}

function formatUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
}

// --- WebSocket Logs ---
function reconnectWs() {
    if (ws) {
        ws.onclose = null; // Prevent reconnect loop trigger
        ws.close();
    }
    connectWs();
}

function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
        // Determine creds
        let sessionToAuth = ADMIN_SESSION;
        let passToAuth = '';
        
        if (currentMonitoredSession === ADMIN_SESSION) {
                // Get admin pass from basic token
                const decoded = atob(token.split(' ')[1]);
                passToAuth = decoded.split(':')[1];
        } else {
                sessionToAuth = currentMonitoredSession;
                passToAuth = currentMonitoredPass;
        }

        ws.send(JSON.stringify({
            type: 'init',
            sessionName: sessionToAuth,
            password: passToAuth
        }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'init_response') {
            const statusEl = document.getElementById('connection-status');
            if (msg.success) {
                if(statusEl) {
                    statusEl.innerText = '● Live';
                    statusEl.style.color = 'var(--success)';
                }
                ws.send(JSON.stringify({ type: 'subscribe', topic: 'sys/logs' }));
                addLog(`[System] Connected to ${currentMonitoredSession}`);
            } else {
                if(statusEl) {
                    statusEl.innerText = '● Error';
                    statusEl.style.color = 'var(--danger)';
                }
                addLog(`[System] Connection Error: ${msg.error}`);
            }
        }

        if (msg.type === 'log') {
            addLog(msg.data);
        }
    };

    ws.onclose = () => {
        const statusEl = document.getElementById('connection-status');
        if(statusEl) {
            statusEl.innerText = '○ Offline';
            statusEl.style.color = 'var(--text-secondary)';
        }
        // Only reconnect if we didn't intentionally close
        setTimeout(connectWs, 3000); 
    };
}

function addLog(text) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-data">${text}</span>`;
    
    if(logsContainer) {
        logsContainer.appendChild(div);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        if (logsContainer.children.length > 500) {
            logsContainer.removeChild(logsContainer.firstChild);
        }
    }
}

function escapeHtml(text) {
    if (!text) return text;
    return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

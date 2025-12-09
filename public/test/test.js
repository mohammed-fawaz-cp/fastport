
// --- Connection Instance Class ---
class ConnectionInstance {
    constructor(id, name, config) {
        this.id = id;
        this.name = name; // UI Display Name
        this.config = config; // { host, session, password }
        this.ws = null;
        this.isConnected = false;
        this.messages = [];
        this.subscriptions = new Set();
        this.logs = []; // Local system logs
    }

    connect() {
        if (this.isConnected) return;
        try {
            this.addLog('Connecting...');
            this.ws = new WebSocket(this.config.host);

            this.ws.onopen = () => {
                this.addLog('Socket Open, Authenticating...');
                this.ws.send(JSON.stringify({
                    type: 'init',
                    sessionName: this.config.session,
                    password: this.config.password
                }));
            };

            this.ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                this.handleMessage(msg);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.ws = null;
                this.addLog('Disconnected');
                app.render();
            };

            this.ws.onerror = (e) => {
                this.addLog('Socket Error');
                console.error(e);
            };

        } catch (e) {
            this.addLog('Connection Failed: ' + e.message);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.addLog('Manually Disconnected');
        app.render();
    }

    handleMessage(msg) {
        if (msg.type === 'init_response') {
            if (msg.success) {
                this.isConnected = true;
                this.addLog('Connected & Authenticated');
            } else {
                this.addLog('Auth Failed: ' + msg.error);
                this.disconnect();
            }
            app.render();
            return;
        }

        if (msg.type === 'subscribe_response') {
            if (msg.success) {
                this.subscriptions.add(msg.topic);
                this.addLog(`Subscribed: ${msg.topic}`);
            }
            app.render();
            return;
        }

        if (msg.type === 'unsubscribe_response') {
            if (msg.success) {
                this.subscriptions.delete(msg.topic);
                this.addLog(`Unsubscribed: ${msg.topic}`);
            }
            app.render();
            return;
        }

        // Standard Message
        this.messages.unshift({
            timestamp: new Date().toLocaleTimeString(),
            payload: JSON.stringify(msg, null, 2),
            raw: msg
        });
        
        // Cap messages
        if(this.messages.length > 50) this.messages.pop();
        
        app.renderMessages(); // Only update msg list if active
    }

    subscribe(topic) {
        if (!this.ws || !this.isConnected) return;
        this.ws.send(JSON.stringify({ type: 'subscribe', topic }));
    }

    unsubscribe(topic) {
        if (!this.ws || !this.isConnected) return;
        this.ws.send(JSON.stringify({ type: 'unsubscribe', topic }));
    }

    publish(topic, payload, type) {
        if (!this.ws || !this.isConnected) throw new Error('Not connected');
        
        let data = payload;
        if (type === 'json') {
            try { data = JSON.parse(payload); } 
            catch (e) { throw new Error('Invalid JSON'); }
        }

        this.ws.send(JSON.stringify({
            type: 'publish',
            topic: topic,
            data: data,
            timestamp: Date.now(),
            messageId: 'msg_' + Date.now()
        }));
        
        this.addLog(`Published to ${topic}`);
    }

    addLog(text) {
        this.messages.unshift({
            timestamp: new Date().toLocaleTimeString(),
            payload: `[SYSTEM] ${text}`,
            isSystem: true
        });
        app.renderMessages();
    }
}

// --- App Manager ---
class TestApp {
    constructor() {
        this.instances = [];
        this.activeId = null;
        
        // Load from LocalStorage
        this.loadState();
        
        if (this.instances.length === 0) {
            this.createInstance('Default', { host: 'ws://localhost:3000', session: '', password: '' });
        }
    }

    createInstance(name, config) {
        const id = 'inst_' + Date.now();
        const inst = new ConnectionInstance(id, name, config);
        this.instances.push(inst);
        this.activeId = id;
        this.saveState();
        this.render();
        return inst;
    }

    deleteInstance(id) {
        const idx = this.instances.findIndex(i => i.id === id);
        if (idx !== -1) {
            this.instances[idx].disconnect();
            this.instances.splice(idx, 1);
            if (this.instances.length > 0) {
                this.activeId = this.instances[0].id; // Switch to first
            } else {
                this.createInstance('Default', { host: 'ws://localhost:3000', session: '', password: '' });
            }
            this.saveState();
            this.render();
        }
    }

    getActive() {
        return this.instances.find(i => i.id === this.activeId);
    }

    saveState() {
        const data = this.instances.map(i => ({
            id: i.id,
            name: i.name,
            config: i.config
        }));
        localStorage.setItem('fp_instances', JSON.stringify(data));
        localStorage.setItem('fp_active_id', this.activeId);
    }

    loadState() {
        try {
            const raw = localStorage.getItem('fp_instances');
            const active = localStorage.getItem('fp_active_id');
            if (raw) {
                const parsed = JSON.parse(raw);
                this.instances = parsed.map(p => new ConnectionInstance(p.id, p.name, p.config));
                if (active) this.activeId = active;
                else if (this.instances.length > 0) this.activeId = this.instances[0].id;
            }
        } catch (e) {
            console.error('Failed to load state', e);
        }
    }

    // --- Actions ---
    switchInstance(id) {
        this.activeId = id;
        this.saveState();
        this.render();
    }

    updateActiveConfig() {
        const inst = this.getActive();
        if(!inst) return;
        
        inst.config.host = document.getElementById('conn-host').value;
        inst.config.session = document.getElementById('conn-session').value;
        inst.config.password = document.getElementById('conn-pass').value;
        inst.name = inst.config.session || 'Unnamed'; // Auto-name
        
        this.saveState();
        this.renderInputs(); // Refresh name in list
    }

    // --- Rendering ---
    render() {
        this.renderList();
        this.renderInputs();
        this.renderSubs();
        this.renderMessages();
    }

    renderList() {
        const list = document.getElementById('connection-list');
        list.innerHTML = '';
        
        this.instances.forEach(inst => {
            const el = document.createElement('div');
            el.className = `conn-item ${inst.id === this.activeId ? 'active' : ''}`;
            el.onclick = () => this.switchInstance(inst.id);
            
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div>
                        <div style="font-weight:500;">${inst.name || 'Untitled'}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${inst.config.host}</div>
                    </div>
                    <div class="conn-status ${inst.isConnected ? 'connected' : ''}"></div>
                </div>
            `;
            
            // Delete button (don't bubble click)
            if(this.instances.length > 1) {
                const del = document.createElement('button');
                del.innerText = 'x';
                del.className = 'btn-ghost';
                del.style.padding = '0px 6px';
                del.style.marginLeft = '8px';
                del.style.fontSize = '0.7rem';
                del.onclick = (e) => {
                    e.stopPropagation();
                    if(confirm('Delete instance?')) this.deleteInstance(inst.id);
                };
                el.children[0].appendChild(del);
            }
            
            list.appendChild(el);
        });
    }

    renderInputs() {
        const inst = this.getActive();
        if (!inst) return;

        // Populate fields
        // Only update if not currently focused to avoid typing jank (basic check)
        if(document.activeElement !== document.getElementById('conn-host'))
            document.getElementById('conn-host').value = inst.config.host;
        
        if(document.activeElement !== document.getElementById('conn-session'))
            document.getElementById('conn-session').value = inst.config.session;
            
        if(document.activeElement !== document.getElementById('conn-pass'))
            document.getElementById('conn-pass').value = inst.config.password;

        // Button State
        const btn = document.getElementById('btn-connect');
        if (inst.isConnected) {
            btn.innerText = 'Disconnect';
            btn.className = 'btn-danger btn-full';
            btn.onclick = () => inst.disconnect();
            
            // Lock inputs
            document.getElementById('conn-host').disabled = true;
            document.getElementById('conn-session').disabled = true;
            document.getElementById('conn-pass').disabled = true;
        } else {
            btn.innerText = 'Connect';
            btn.className = 'btn-primary btn-full';
            btn.onclick = () => inst.connect();
            
            // Unlock
            document.getElementById('conn-host').disabled = false;
            document.getElementById('conn-session').disabled = false;
            document.getElementById('conn-pass').disabled = false;
        }
    }

    renderSubs() {
        const inst = this.getActive();
        const container = document.getElementById('active-subs');
        container.innerHTML = '';
        
        if (!inst) return;

        inst.subscriptions.forEach(sub => {
            const tag = document.createElement('span');
            tag.className = 'sub-tag';
            tag.innerHTML = `${sub} <b onclick="app.getActive().unsubscribe('${sub}')">×</b>`;
            container.appendChild(tag);
        });
    }

    renderMessages() {
        const inst = this.getActive();
        const container = document.getElementById('message-container');
        container.innerHTML = '';
        
        if (!inst || inst.messages.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:2rem;">No messages yet.</div>';
            return;
        }

        inst.messages.forEach(msg => {
            const div = document.createElement('div');
            
            if (msg.isSystem) {
                div.style = 'padding:0.5rem; color:var(--text-muted); font-size:0.8rem; text-align:center; font-style:italic; border-bottom:1px solid rgba(255,255,255,0.05);';
                div.innerText = `${msg.timestamp} - ${msg.payload}`;
            } else {
                div.className = 'msg-card';
                div.innerHTML = `
                    <div class="msg-meta">
                        <span>▼ RECEIVED</span>
                        <span>${msg.timestamp}</span>
                    </div>
                    <div class="msg-payload">${escapeHtml(msg.payload)}</div>
                `;
            }
            container.appendChild(div);
        });
    }
}

// --- Init & Globals ---
const app = new TestApp();
window.app = app;

// --- Event Handlers (HTML Onclick Proxies) ---

function newInstance() {
    // Check if we have a created session profile waiting
    // (Optional enhancement: Copy current)
    app.createInstance('New Instance', { host: 'ws://localhost:3000', session: '', password: '' });
}

// Input Listeners to auto-save config
['conn-host', 'conn-session', 'conn-pass'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => app.updateActiveConfig());
});

// Publish
window.publishMessage = function() {
    const inst = app.getActive();
    if (!inst) return;
    
    const topic = document.getElementById('pub-topic').value;
    const type = document.getElementById('pub-type').value;
    const payload = document.getElementById('pub-payload').value;
    
    try {
        inst.publish(topic, payload, type);
        // Visual Feedback
        const stat = document.getElementById('pub-status');
        stat.innerText = 'Sent!';
        setTimeout(() => stat.innerText = 'Ready', 1000);
    } catch (e) {
        alert(e.message);
    }
};

window.subscribe = function() {
    const topic = document.getElementById('sub-topic').value;
    if (topic && app.getActive()) {
        app.getActive().subscribe(topic);
        document.getElementById('sub-topic').value = '';
    }
};

window.clearMessages = function() {
    const inst = app.getActive();
    if(inst) {
        inst.messages = [];
        app.renderMessages();
    }
};

window.escapeHtml = function(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

// Session Modal Helpers (Legacy support for create modal)
const modalOverlay = document.getElementById('modal-overlay');
window.showCreateSessionModal = () => modalOverlay.style.display = 'flex';
window.closeModal = () => modalOverlay.style.display = 'none';

window.createSession = async function() {
    const adminUser = document.getElementById('admin-user').value;
    const adminPass = document.getElementById('admin-pass').value;
    const name = document.getElementById('new-session-name').value;
    const pass = document.getElementById('new-session-pass').value;

    if(!name || !pass) return alert('Fields required');

    try {
        const res = await fetch('/api/createSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa(adminUser + ':' + adminPass) },
            body: JSON.stringify({ sessionName: name, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            alert('Session Created!');
            closeModal();
            // Create a new instance for this session
            app.createInstance(name, { 
                host: document.getElementById('conn-host').value, 
                session: name, 
                password: pass 
            });
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) { alert(e.message); }
};

// Initial Render
app.render();

import { expect } from 'chai';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';

const PORT = 3999;
const SERVER_URL = `ws://localhost:${PORT}`;
const ADMIN_PASS = 'secure_test_pass';

describe('System Integration Tests', function() {
    this.timeout(10000);
    let serverProcess;
    let wsClient;

    before((done) => {
        // Start Server in Child Process
        serverProcess = spawn('node', ['src/server.js'], {
            env: { 
                ...process.env, 
                PORT: PORT,
                ADMIN_PASS: ADMIN_PASS,
                DB_TYPE: 'memory',
                ENABLE_WEB_PORTAL: 'true'
            },
            stdio: 'ignore' // Silence server logs
        });
        // Give it time to boot
        setTimeout(done, 3000);
    });

    after(() => {
        if (serverProcess) serverProcess.kill();
    });

    afterEach(() => {
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.close();
        }
    });

    it('should connect and authenticate to default admin session', (done) => {
        wsClient = new WebSocket(SERVER_URL);
        
        wsClient.on('open', () => {
            wsClient.send(JSON.stringify({
                type: 'init',
                sessionName: 'admin_session',
                password: ADMIN_PASS
            }));
        });

        wsClient.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'init_response') {
                expect(msg.success).to.be.true;
                done();
            }
        });
    });

    it('should fail authentication with wrong password', (done) => {
        wsClient = new WebSocket(SERVER_URL);
        
        wsClient.on('open', () => {
            wsClient.send(JSON.stringify({
                type: 'init',
                sessionName: 'admin_session',
                password: 'wrong_password'
            }));
        });

        wsClient.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'init_response') {
                expect(msg.success).to.be.false;
                expect(msg.error).to.exist;
                done();
            }
        });
    });

    it('should handle pub/sub flow', (done) => {
        // We need two clients
        const receiver = new WebSocket(SERVER_URL);
        const sender = new WebSocket(SERVER_URL);
        const TOPIC = 'chat/general';
        const MESSAGE = 'Hello World';

        let senderReady = false;
        let receiverReady = false;

        const checkReady = () => {
            if (senderReady && receiverReady) {
                // Sender publishes
                sender.send(JSON.stringify({
                    type: 'publish',
                    topic: TOPIC,
                    data: MESSAGE,
                    messageId: '1',
                    timestamp: Date.now()
                }));
            }
        };

        // SETUP RECEIVER
        receiver.on('open', () => {
            receiver.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: ADMIN_PASS }));
        });
        receiver.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'init_response') {
                receiver.send(JSON.stringify({ type: 'subscribe', topic: TOPIC }));
            }
            if (msg.type === 'subscribe_response') {
                receiverReady = true;
                checkReady();
            }
            if (msg.type === 'message') {
                expect(msg.data).to.equal(MESSAGE);
                expect(msg.topic).to.equal(TOPIC);
                receiver.close();
                sender.close();
                done();
            }
        });

        // SETUP SENDER
        sender.on('open', () => {
            sender.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: ADMIN_PASS }));
        });
        sender.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.type === 'init_response') {
                senderReady = true;
                checkReady();
            }
        });
    });
});

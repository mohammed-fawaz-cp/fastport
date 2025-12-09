import { expect } from 'chai';
import WebSocket from 'ws';
import { spawn } from 'child_process';

const PORT = 4001;
const SERVER_URL = `ws://localhost:${PORT}`;
const ADMIN_PASS = 'load_test_pass';
const CLIENT_COUNT = 50;

describe('Stress / Load Tests', function() {
    this.timeout(20000); // 20s timeout for load test
    let serverProcess;

    before((done) => {
        serverProcess = spawn('node', ['src/server.js'], {
            env: { 
                ...process.env, 
                PORT: PORT,
                ADMIN_PASS: ADMIN_PASS,
                DB_TYPE: 'memory',
                ENABLE_WEB_PORTAL: 'true'
            },
            stdio: 'ignore'
        });
        setTimeout(done, 2500);
    });

    after(() => {
        if (serverProcess) serverProcess.kill();
    });

    it(`should handle ${CLIENT_COUNT} concurrent clients connecting and subscribing`, (done) => {
        let connected = 0;
        let authenticated = 0;
        let subscribed = 0;
        const clients = [];

        for (let i = 0; i < CLIENT_COUNT; i++) {
            const client = new WebSocket(SERVER_URL);
            clients.push(client);

            client.on('open', () => {
                connected++;
                client.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: ADMIN_PASS }));
            });

            client.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.type === 'init_response' && msg.success) {
                    authenticated++;
                    client.send(JSON.stringify({ type: 'subscribe', topic: 'load/test' }));
                }
                if (msg.type === 'subscribe_response') {
                    subscribed++;
                    if (subscribed === CLIENT_COUNT) {
                        clients.forEach(c => c.close());
                        done(); // Success
                    }
                }
            });
        }
    });

    it('should broadcast message to all 50 clients', (done) => {
        const clients = [];
        let receivedCount = 0;
        let sender;

        // 1 Sender + 50 Receivers
        const receiversReadyPromise = new Promise((resolve) => {
            let readyCount = 0;
            for (let i = 0; i < CLIENT_COUNT; i++) {
                const client = new WebSocket(SERVER_URL);
                clients.push(client);
                
                client.on('open', () => {
                    client.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: ADMIN_PASS }));
                });

                client.on('message', (data) => {
                    const msg = JSON.parse(data);
                    if (msg.type === 'init_response') {
                        client.send(JSON.stringify({ type: 'subscribe', topic: 'broadcast' }));
                    }
                    if (msg.type === 'subscribe_response') {
                        readyCount++;
                        if (readyCount === CLIENT_COUNT) resolve();
                    }
                    if (msg.type === 'message') {
                        receivedCount++;
                        if (receivedCount === CLIENT_COUNT) {
                            sender.close();
                            clients.forEach(c => c.close());
                            done();
                        }
                    }
                });
            }
        });

        receiversReadyPromise.then(() => {
            sender = new WebSocket(SERVER_URL);
            sender.on('open', () => {
                 sender.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: ADMIN_PASS }));
            });
            sender.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.type === 'init_response') {
                    sender.send(JSON.stringify({ 
                        type: 'publish', 
                        topic: 'broadcast', 
                        data: 'Load Test Payload',
                        messageId: 'load_1'
                    }));
                }
            });
        });
    });
});

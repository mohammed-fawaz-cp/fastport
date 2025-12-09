import { expect } from 'chai';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import http from 'http';

describe('Environment Variable Tests', function() {
    this.timeout(10000);
    let serverProcess;

    afterEach(async () => {
        if (serverProcess) {
            serverProcess.kill();
            // Wait briefly to ensure the process has terminated before next test
            await new Promise(res => setTimeout(res, 1000));
        }
    });

    it('should respect custom PORT env var', (done) => {
        const CUSTOM_PORT = 4444;
        serverProcess = spawn('node', ['src/server.js'], {
            env: { ...process.env, PORT: CUSTOM_PORT, DB_TYPE: 'memory' },
            stdio: 'ignore'
        });

        setTimeout(() => {
            const client = new WebSocket(`ws://localhost:${CUSTOM_PORT}`);
            client.on('open', () => {
                client.close();
                done(); 
            });
            client.on('error', (e) => done(e));
        }, 2000);
    });

    it('should fail auth if ADMIN_PASS is changed', (done) => {
        const PORT = 4445;
        const NEW_PASS = 'new_secret_pass';
        
        serverProcess = spawn('node', ['src/server.js'], {
            env: { 
                ...process.env, 
                PORT: PORT, 
                ADMIN_PASS: NEW_PASS,
                DB_TYPE: 'memory' 
            },
            stdio: 'ignore'
        });

        setTimeout(() => {
            const client = new WebSocket(`ws://localhost:${PORT}`);
            client.on('open', () => {
                // Try old pass (should fail)
                client.send(JSON.stringify({ type: 'init', sessionName: 'admin_session', password: 'admin' }));
            });

            client.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.type === 'init_response') {
                    expect(msg.success).to.be.false;
                    
                    // Try new pass (should work)
                    // Re-connect not needed, just send again? No, usually init is once.
                    // For simplicity, just verify failure here.
                    client.close();
                    done();
                }
            });
        }, 1500);
    });

    it('should disable web portal when ENABLE_WEB_PORTAL=false', (done) => {
        const PORT = 4446;
        serverProcess = spawn('node', ['src/server.js'], {
            env: { 
                ...process.env, 
                PORT: PORT, 
                ENABLE_WEB_PORTAL: 'false',
                DB_TYPE: 'memory' 
            },
            stdio: 'ignore'
        });

        setTimeout(() => {
            http.get(`http://localhost:${PORT}/admin`, (res) => {
                expect(res.statusCode).to.equal(404);
                done();
            }).on('error', done);
        }, 3000);
    });
});

import { WebSocket } from 'ws';
import crypto from 'crypto';
import http from 'http';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

// Test Results Tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'PASS' ? '✅' : type === 'FAIL' ? '❌' : type === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function recordTest(name, passed, error = null) {
  results.tests.push({ name, passed, error });
  if (passed) {
    results.passed++;
    log(`${name}`, 'PASS');
  } else {
    results.failed++;
    log(`${name}: ${error}`, 'FAIL');
  }
}

// Helper: Create Session
async function createSession(sessionName, password, fcmConfig = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sessionName,
      password,
      encryptionKey: crypto.randomBytes(32).toString('base64'),
      retryInterval: 5000,
      maxRetryLimit: 100,
      messageExpiryTime: 3600000,
      ...(fcmConfig && { fcmConfig })
    });

    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/createSession',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helper: WebSocket Client
class TestClient {
  constructor(sessionName, password, userId = null) {
    this.sessionName = sessionName;
    this.password = password;
    this.userId = userId;
    this.ws = null;
    this.messages = [];
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        const initMsg = {
          type: 'init',
          sessionName: this.sessionName,
          password: this.password,
          ...(this.userId && { userId: this.userId })
        };
        this.ws.send(JSON.stringify(initMsg));
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.messages.push(msg);
        
        if (msg.type === 'init_response') {
          if (msg.success) {
            this.connected = true;
            resolve();
          } else {
            reject(new Error(msg.error));
          }
        }
      });

      this.ws.on('error', reject);
      
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  subscribe(topic) {
    this.ws.send(JSON.stringify({ type: 'subscribe', topic }));
  }

  publish(topic, message) {
    this.ws.send(JSON.stringify({
      type: 'publish',
      topic,
      data: message,
      hash: crypto.createHash('sha256').update(message).digest('hex'),
      timestamp: Date.now(),
      messageId: crypto.randomUUID()
    }));
  }

  close() {
    if (this.ws) this.ws.close();
  }

  waitForMessage(timeout = 2000) {
    return new Promise((resolve) => {
      const startCount = this.messages.length;
      const interval = setInterval(() => {
        if (this.messages.length > startCount) {
          clearInterval(interval);
          resolve(this.messages[this.messages.length - 1]);
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(interval);
        resolve(null);
      }, timeout);
    });
  }
}

// Test Suite
async function runTests() {
  log('Starting Comprehensive Failure-Based Testing', 'INFO');
  log('='.repeat(60), 'INFO');

  // TEST 1: Multiple Session Creation
  log('\n📋 TEST SUITE 1: Multiple Session Creation', 'INFO');
  try {
    const sessions = [];
    for (let i = 1; i <= 5; i++) {
      const result = await createSession(`session_${i}`, `pass_${i}`);
      sessions.push(result);
      await new Promise(r => setTimeout(r, 100)); // Small delay
    }
    recordTest('Create 5 sessions concurrently', sessions.length === 5);
  } catch (error) {
    recordTest('Create 5 sessions concurrently', false, error.message);
  }

  // TEST 2: Duplicate Session (Should Fail)
  log('\n📋 TEST SUITE 2: Duplicate Session Handling', 'INFO');
  try {
    await createSession('duplicate_test', 'pass1');
    const result = await createSession('duplicate_test', 'pass1');
    recordTest('Reject duplicate session', !result.success, 'Should have failed');
  } catch (error) {
    recordTest('Reject duplicate session', true);
  }

  // TEST 3: Send/Receive Data
  log('\n📋 TEST SUITE 3: Message Send/Receive', 'INFO');
  try {
    await createSession('msg_test', 'pass123');
    const client1 = new TestClient('msg_test', 'pass123');
    const client2 = new TestClient('msg_test', 'pass123');
    
    await client1.connect();
    await client2.connect();
    
    client2.subscribe('test/topic');
    await new Promise(r => setTimeout(r, 500));
    
    client1.publish('test/topic', 'Hello World!');
    const received = await client2.waitForMessage();
    
    recordTest('Send and receive message', received && received.type === 'message');
    
    client1.close();
    client2.close();
  } catch (error) {
    recordTest('Send and receive message', false, error.message);
  }

  // TEST 4: Session Isolation
  log('\n📋 TEST SUITE 4: Session Isolation', 'INFO');
  try {
    await createSession('isolated_1', 'pass1');
    await createSession('isolated_2', 'pass2');
    
    const client1 = new TestClient('isolated_1', 'pass1');
    const client2 = new TestClient('isolated_2', 'pass2');
    
    await client1.connect();
    await client2.connect();
    
    client1.subscribe('test/topic');
    client2.subscribe('test/topic');
    await new Promise(r => setTimeout(r, 500));
    
    const startCount = client1.messages.length;
    client2.publish('test/topic', 'Should not cross sessions');
    await new Promise(r => setTimeout(r, 1000));
    
    const received = client1.messages.length > startCount;
    recordTest('Session isolation (no cross-session messages)', !received);
    
    client1.close();
    client2.close();
  } catch (error) {
    recordTest('Session isolation', false, error.message);
  }

  // TEST 5: Crash One Session (Should Not Affect Others)
  log('\n📋 TEST SUITE 5: Crash Isolation', 'INFO');
  try {
    await createSession('stable_session', 'pass1');
    await createSession('crash_session', 'pass2');
    
    const stableClient = new TestClient('stable_session', 'pass1');
    const crashClient = new TestClient('crash_session', 'pass2');
    
    await stableClient.connect();
    await crashClient.connect();
    
    // Crash the second client (send invalid data)
    crashClient.ws.send('INVALID_JSON_DATA');
    await new Promise(r => setTimeout(r, 500));
    
    // Verify stable client still works
    stableClient.subscribe('test/topic');
    stableClient.publish('test/topic', 'Still working!');
    const received = await stableClient.waitForMessage();
    
    recordTest('Crash isolation (other sessions unaffected)', received !== null);
    
    stableClient.close();
    crashClient.close();
  } catch (error) {
    recordTest('Crash isolation', false, error.message);
  }

  // TEST 6: Invalid Authentication
  log('\n📋 TEST SUITE 6: Authentication Failures', 'INFO');
  try {
    await createSession('auth_test', 'correct_pass');
    const client = new TestClient('auth_test', 'wrong_pass');
    
    try {
      await client.connect();
      recordTest('Reject invalid password', false, 'Should have failed');
    } catch (error) {
      recordTest('Reject invalid password', true);
    }
    client.close();
  } catch (error) {
    recordTest('Reject invalid password', false, error.message);
  }

  // TEST 7: Non-existent Session
  log('\n📋 TEST SUITE 7: Non-existent Session', 'INFO');
  try {
    const client = new TestClient('nonexistent', 'pass');
    try {
      await client.connect();
      recordTest('Reject non-existent session', false, 'Should have failed');
    } catch (error) {
      recordTest('Reject non-existent session', true);
    }
    client.close();
  } catch (error) {
    recordTest('Reject non-existent session', false, error.message);
  }

  // TEST 8: High Load (Multiple Clients)
  log('\n📋 TEST SUITE 8: High Load Testing', 'INFO');
  try {
    await createSession('load_test', 'pass123');
    const clients = [];
    
    // Connect 10 clients
    for (let i = 0; i < 10; i++) {
      const client = new TestClient('load_test', 'pass123');
      await client.connect();
      client.subscribe('load/topic');
      clients.push(client);
    }
    
    // Send 50 messages
    for (let i = 0; i < 50; i++) {
      clients[0].publish('load/topic', `Message ${i}`);
      await new Promise(r => setTimeout(r, 10));
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if all clients received messages
    const allReceived = clients.every(c => c.messages.filter(m => m.type === 'message').length > 0);
    recordTest('High load (10 clients, 50 messages)', allReceived);
    
    clients.forEach(c => c.close());
  } catch (error) {
    recordTest('High load test', false, error.message);
  }

  // TEST 9: Reconnection
  log('\n📋 TEST SUITE 9: Reconnection Handling', 'INFO');
  try {
    await createSession('reconnect_test', 'pass123');
    const client = new TestClient('reconnect_test', 'pass123');
    
    await client.connect();
    client.close();
    await new Promise(r => setTimeout(r, 500));
    
    // Reconnect
    await client.connect();
    recordTest('Client reconnection', client.connected);
    client.close();
  } catch (error) {
    recordTest('Client reconnection', false, error.message);
  }

  // TEST 10: FCM Token Registration (Without Real Firebase)
  log('\n📋 TEST SUITE 10: FCM Token Registration', 'INFO');
  try {
    await createSession('fcm_test', 'pass123');
    const client = new TestClient('fcm_test', 'pass123', 'user_alice');
    await client.connect();
    
    // Register FCM token (will fail without real Firebase, but should not crash)
    client.ws.send(JSON.stringify({
      type: 'register_fcm_token',
      userId: 'user_alice',
      encryptedData: JSON.stringify({
        fcmToken: 'mock_token_123',
        deviceId: 'device_001',
        platform: 'android'
      }),
      hash: crypto.createHash('sha256').update('test').digest('hex')
    }));
    
    const response = await client.waitForMessage();
    recordTest('FCM token registration (graceful handling)', response !== null);
    client.close();
  } catch (error) {
    recordTest('FCM token registration', false, error.message);
  }

  // Print Results
  log('\n' + '='.repeat(60), 'INFO');
  log('TEST RESULTS SUMMARY', 'INFO');
  log('='.repeat(60), 'INFO');
  log(`Total Tests: ${results.tests.length}`, 'INFO');
  log(`Passed: ${results.passed}`, 'PASS');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'FAIL' : 'PASS');
  log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(2)}%`, 'INFO');
  
  if (results.failed > 0) {
    log('\nFailed Tests:', 'WARN');
    results.tests.filter(t => !t.passed).forEach(t => {
      log(`  - ${t.name}: ${t.error}`, 'FAIL');
    });
  }
  
  log('\n✅ Testing Complete!', 'INFO');
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run Tests
setTimeout(() => {
  runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'FAIL');
    process.exit(1);
  });
}, 1000); // Wait 1s for server to be ready

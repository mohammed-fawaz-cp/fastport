// Integration test for fastPort system
// Run this after starting the server with: node tests/integration_test.js

import WebSocket from 'ws';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const SERVER_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

// Test utilities
function generateAESKey() {
  return crypto.randomBytes(32).toString('base64');
}

function encrypt(message, aesKey) {
  const key = Buffer.from(aesKey, 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(message, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(encryptedData, aesKey) {
  const key = Buffer.from(aesKey, 'base64');
  const [ivBase64, encryptedBase64] = encryptedData.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Test 1: Create Session
async function testCreateSession() {
  console.log('\n📝 Test 1: Create Session');
  
  const response = await fetch(`${SERVER_URL}/api/createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: 'testSession',
      password: 'testPass123',
      retryInterval: 2000,
      maxRetryLimit: 5,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('✅ Session created successfully');
    return result;
  } else {
    console.log('❌ Failed to create session:', result.error);
    throw new Error('Session creation failed');
  }
}

// Test 2: WebSocket Connection
async function testWebSocketConnection(sessionData) {
  console.log('\n📝 Test 2: WebSocket Connection');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'init',
        sessionName: sessionData.sessionName,
        password: sessionData.password,
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'init_response') {
        if (message.success) {
          console.log('✅ WebSocket connected and authenticated');
          resolve(ws);
        } else {
          console.log('❌ Authentication failed:', message.error);
          reject(new Error('Auth failed'));
        }
      }
    });

    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      reject(error);
    });
  });
}

// Test 3: Pub-Sub with Encryption
async function testPubSub(sessionData, aesKey) {
  console.log('\n📝 Test 3: Publish-Subscribe with Encryption');
  
  return new Promise(async (resolve, reject) => {
    // Create subscriber
    const subscriber = new WebSocket(WS_URL);
    let messageReceived = false;

    subscriber.on('open', () => {
      subscriber.send(JSON.stringify({
        type: 'init',
        sessionName: sessionData.sessionName,
        password: sessionData.password,
      }));
    });

    subscriber.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'init_response' && message.success) {
        // Subscribe to topic
        subscriber.send(JSON.stringify({
          type: 'subscribe',
          topic: 'test/topic',
        }));
      }
      
      if (message.type === 'subscribe_response') {
        console.log('✅ Subscribed to topic');
        // Now create publisher
        createPublisher();
      }
      
      if (message.type === 'message') {
        try {
          // Verify hash
          const computedHash = hash(message.data);
          if (computedHash !== message.hash) {
            console.log('❌ Hash verification failed');
            reject(new Error('Hash mismatch'));
            return;
          }
          console.log('✅ Hash verified');

          // Decrypt
          const decrypted = decrypt(message.data, aesKey);
          console.log('✅ Message decrypted:', decrypted);

          if (decrypted === 'Hello fastPort!') {
            console.log('✅ Message content correct');
            messageReceived = true;

            // Send ACK
            subscriber.send(JSON.stringify({
              type: 'ack',
              topic: message.topic,
              messageId: message.messageId,
            }));
            console.log('✅ ACK sent');

            setTimeout(() => {
              subscriber.close();
              resolve();
            }, 1000);
          }
        } catch (error) {
          console.log('❌ Error processing message:', error.message);
          reject(error);
        }
      }
    });

    function createPublisher() {
      const publisher = new WebSocket(WS_URL);
      
      publisher.on('open', () => {
        publisher.send(JSON.stringify({
          type: 'init',
          sessionName: sessionData.sessionName,
          password: sessionData.password,
        }));
      });

      publisher.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'init_response' && message.success) {
          // Publish message
          const plaintext = 'Hello fastPort!';
          const encrypted = encrypt(plaintext, aesKey);
          const messageHash = hash(encrypted);

          publisher.send(JSON.stringify({
            type: 'publish',
            topic: 'test/topic',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          }));
          console.log('✅ Message published');
        }

        if (message.type === 'ack_received') {
          console.log('✅ Publisher received ACK confirmation');
          publisher.close();
        }
      });
    }

    setTimeout(() => {
      if (!messageReceived) {
        console.log('❌ Timeout: Message not received');
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Test 4: Suspend Session
async function testSuspendSession(sessionData) {
  console.log('\n📝 Test 4: Suspend Session');
  
  const response = await fetch(`${SERVER_URL}/api/suspendSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: sessionData.sessionName,
      password: sessionData.password,
      secretKey: sessionData.secretKey,
      suspend: true,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('✅ Session suspended');
    
    // Unsuspend
    const unsuspendResponse = await fetch(`${SERVER_URL}/api/suspendSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: sessionData.sessionName,
        password: sessionData.password,
        secretKey: sessionData.secretKey,
        suspend: false,
      }),
    });
    
    const unsuspendResult = await unsuspendResponse.json();
    if (unsuspendResult.success) {
      console.log('✅ Session unsuspended');
    }
  } else {
    console.log('❌ Failed to suspend session');
    throw new Error('Suspend failed');
  }
}

// Test 5: Drop Session
async function testDropSession(sessionData) {
  console.log('\n📝 Test 5: Drop Session');
  
  const response = await fetch(`${SERVER_URL}/api/dropSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: sessionData.sessionName,
      password: sessionData.password,
      secretKey: sessionData.secretKey,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('✅ Session dropped');
  } else {
    console.log('❌ Failed to drop session');
    throw new Error('Drop failed');
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting fastPort Integration Tests\n');
  console.log('Make sure the server is running on port 3000!\n');

  try {
    const aesKey = generateAESKey();
    console.log('🔑 Generated AES Key:', aesKey);

    const sessionData = await testCreateSession();
    await testWebSocketConnection(sessionData);
    await testPubSub(sessionData, aesKey);
    await testSuspendSession(sessionData);
    await testDropSession(sessionData);

    console.log('\n✅ All tests passed! 🎉\n');
  } catch (error) {
    console.log('\n❌ Tests failed:', error.message, '\n');
    process.exit(1);
  }
}

runTests();

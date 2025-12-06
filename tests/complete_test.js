/**
 * Complete fastPort System Test Suite
 * Tests all functionality from top to bottom
 * 
 * Run: node tests/complete_test.js
 * Prerequisites: Server must be running on port 3000
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const PORT = process.env.PORT || 3001;
const SERVER_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const TEST_TIMEOUT = 30000;

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Utility Functions
class TestUtils {
  static generateAESKey() {
    return crypto.randomBytes(32).toString('base64');
  }

  static encrypt(message, aesKey) {
    const key = Buffer.from(aesKey, 'base64');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(message, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
  }

  static decrypt(encryptedData, aesKey) {
    const key = Buffer.from(aesKey, 'base64');
    const [ivBase64, encryptedBase64] = encryptedData.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  static hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


// Test Logger
class TestLogger {
  static log(message, type = 'info') {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      test: '🧪'
    };
    console.log(`${icons[type]} ${message}`);
  }

  static testStart(name) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST: ${name}`);
    console.log('='.repeat(60));
  }

  static testEnd(passed) {
    testResults.total++;
    if (passed) {
      testResults.passed++;
      this.log('TEST PASSED', 'success');
    } else {
      testResults.failed++;
      this.log('TEST FAILED', 'error');
    }
  }
}

// WebSocket Client Helper
class WSClient {
  constructor(sessionName, password) {
    this.sessionName = sessionName;
    this.password = password;
    this.ws = null;
    this.messageHandlers = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          type: 'init',
          sessionName: this.sessionName,
          password: this.password,
        }));
      });

      this.ws.on('message', (data) => {
        const messageStr = data.toString();
        console.log('[TEST CLIENT] Received:', messageStr); 
        const message = JSON.parse(messageStr);
        
        if (message.type === 'init_response') {
          if (message.success) {
            resolve(this);
          } else {
            reject(new Error(message.error));
          }
        }
        
        this.messageHandlers.forEach(handler => handler(message));
      });

      this.ws.on('error', reject);
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  send(data) {
    this.ws.send(JSON.stringify(data));
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}


// Test 1: Server Health Check
async function test01_ServerHealthCheck() {
  TestLogger.testStart('Server Health Check');
  
  try {
    const response = await fetch(SERVER_URL);
    TestLogger.log('Server is reachable', 'success');
    TestLogger.testEnd(true);
    return true;
  } catch (error) {
    TestLogger.log(`Server not reachable: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 2: Create Session
async function test02_CreateSession() {
  TestLogger.testStart('Create Session');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: 'testSession',
        password: 'testPass123',
        retryInterval: 2000,
        maxRetryLimit: 5,
        messageExpiryTime: 30000,
      }),
    });

    const result = await response.json();
    
    if (result.success && result.sessionName && result.secretKey) {
      TestLogger.log(`Session created: ${result.sessionName}`, 'success');
      TestLogger.log(`Secret key: ${result.secretKey}`, 'info');
      TestLogger.testEnd(true);
      return result;
    } else {
      TestLogger.log('Failed to create session', 'error');
      TestLogger.testEnd(false);
      return null;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return null;
  }
}

// Test 3: Create Duplicate Session (Should Fail)
async function test03_CreateDuplicateSession() {
  TestLogger.testStart('Create Duplicate Session (Should Fail)');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: 'testSession',
        password: 'testPass123',
      }),
    });

    const result = await response.json();
    
    if (!result.success && result.error) {
      TestLogger.log('Correctly rejected duplicate session', 'success');
      TestLogger.testEnd(true);
      return true;
    } else {
      TestLogger.log('Should have rejected duplicate session', 'error');
      TestLogger.testEnd(false);
      return false;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 4: WebSocket Connection with Valid Credentials
async function test04_WebSocketConnection(sessionData) {
  TestLogger.testStart('WebSocket Connection with Valid Credentials');
  
  try {
    const client = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    TestLogger.log('WebSocket connected and authenticated', 'success');
    client.close();
    TestLogger.testEnd(true);
    return true;
  } catch (error) {
    TestLogger.log(`Connection failed: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 5: WebSocket Connection with Invalid Credentials
async function test05_InvalidCredentials() {
  TestLogger.testStart('WebSocket Connection with Invalid Credentials (Should Fail)');
  
  try {
    await new WSClient('testSession', 'wrongPassword').connect();
    TestLogger.log('Should have rejected invalid credentials', 'error');
    TestLogger.testEnd(false);
    return false;
  } catch (error) {
    TestLogger.log('Correctly rejected invalid credentials', 'success');
    TestLogger.testEnd(true);
    return true;
  }
}

// Test 6: Subscribe to Topic
async function test06_SubscribeToTopic(sessionData) {
  TestLogger.testStart('Subscribe to Topic');
  
  try {
    const client = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      client.onMessage((message) => {
        if (message.type === 'subscribe_response' && message.success) {
          TestLogger.log(`Subscribed to topic: ${message.topic}`, 'success');
          client.close();
          TestLogger.testEnd(true);
          resolve(true);
        }
      });

      client.send({
        type: 'subscribe',
        topic: 'test/topic1',
      });

      setTimeout(() => {
        TestLogger.log('Subscribe timeout', 'error');
        client.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 7: Unsubscribe from Topic
async function test07_UnsubscribeFromTopic(sessionData) {
  TestLogger.testStart('Unsubscribe from Topic');
  
  try {
    const client = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let subscribed = false;

      client.onMessage((message) => {
        if (message.type === 'subscribe_response' && !subscribed) {
          subscribed = true;
          TestLogger.log('Subscribed, now unsubscribing...', 'info');
          client.send({
            type: 'unsubscribe',
            topic: 'test/topic1',
          });
        }
        
        if (message.type === 'unsubscribe_response' && message.success) {
          TestLogger.log('Successfully unsubscribed', 'success');
          client.close();
          TestLogger.testEnd(true);
          resolve(true);
        }
      });

      client.send({
        type: 'subscribe',
        topic: 'test/topic1',
      });

      setTimeout(() => {
        TestLogger.log('Unsubscribe timeout', 'error');
        client.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 8: Publish and Subscribe (Basic)
async function test08_BasicPubSub(sessionData, aesKey) {
  TestLogger.testStart('Basic Publish-Subscribe');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let subscribed = false;
      const testMessage = 'Hello fastPort!';

      subscriber.onMessage((message) => {
        if (message.type === 'subscribe_response') {
          subscribed = true;
          TestLogger.log('Subscriber ready, publishing message...', 'info');
          
          // Publish message
          const encrypted = TestUtils.encrypt(testMessage, aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/pubsub',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
        
        if (message.type === 'message') {
          TestLogger.log('Message received by subscriber', 'info');
          
          // Verify hash
          const computedHash = TestUtils.hash(message.data);
          if (computedHash !== message.hash) {
            TestLogger.log('Hash verification failed', 'error');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(false);
            resolve(false);
            return;
          }
          TestLogger.log('Hash verified', 'success');
          
          // Decrypt
          const decrypted = TestUtils.decrypt(message.data, aesKey);
          TestLogger.log(`Decrypted message: ${decrypted}`, 'info');
          
          if (decrypted === testMessage) {
            TestLogger.log('Message content matches', 'success');
            
            // Send ACK
            subscriber.send({
              type: 'ack',
              topic: message.topic,
              messageId: message.messageId,
            });
            
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          } else {
            TestLogger.log('Message content mismatch', 'error');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(false);
            resolve(false);
          }
        }
      });

      subscriber.send({
        type: 'subscribe',
        topic: 'test/pubsub',
      });

      setTimeout(() => {
        TestLogger.log('Pub-sub timeout', 'error');
        subscriber.close();
        publisher.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 9: Multiple Subscribers
async function test09_MultipleSubscribers(sessionData, aesKey) {
  TestLogger.testStart('Multiple Subscribers on Same Topic');
  
  try {
    const subscriber1 = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const subscriber2 = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const subscriber3 = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let subscribersReady = 0;
      let messagesReceived = 0;
      const testMessage = 'Broadcast message';

      const handleSubscribe = () => {
        subscribersReady++;
        if (subscribersReady === 3) {
          TestLogger.log('All 3 subscribers ready', 'info');
          
          // Publish message
          const encrypted = TestUtils.encrypt(testMessage, aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/broadcast',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
      };

      const handleMessage = (message, subscriberNum) => {
        if (message.type === 'message') {
          const decrypted = TestUtils.decrypt(message.data, aesKey);
          TestLogger.log(`Subscriber ${subscriberNum} received: ${decrypted}`, 'info');
          
          messagesReceived++;
          
          // Send ACK
          if (subscriberNum === 1) {
            subscriber1.send({
              type: 'ack',
              topic: message.topic,
              messageId: message.messageId,
            });
          } else if (subscriberNum === 2) {
            subscriber2.send({
              type: 'ack',
              topic: message.topic,
              messageId: message.messageId,
            });
          } else {
            subscriber3.send({
              type: 'ack',
              topic: message.topic,
              messageId: message.messageId,
            });
          }
          
          if (messagesReceived === 3) {
            TestLogger.log('All 3 subscribers received the message', 'success');
            subscriber1.close();
            subscriber2.close();
            subscriber3.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          }
        }
      };

      subscriber1.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        handleMessage(msg, 1);
      });

      subscriber2.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        handleMessage(msg, 2);
      });

      subscriber3.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        handleMessage(msg, 3);
      });

      subscriber1.send({ type: 'subscribe', topic: 'test/broadcast' });
      subscriber2.send({ type: 'subscribe', topic: 'test/broadcast' });
      subscriber3.send({ type: 'subscribe', topic: 'test/broadcast' });

      setTimeout(() => {
        TestLogger.log('Multiple subscribers timeout', 'error');
        subscriber1.close();
        subscriber2.close();
        subscriber3.close();
        publisher.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 10: Topic Isolation
async function test10_TopicIsolation(sessionData, aesKey) {
  TestLogger.testStart('Topic Isolation (Messages only to correct topic)');
  
  try {
    const subscriberA = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const subscriberB = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let subscribersReady = 0;
      let subscriberAReceived = false;
      let subscriberBReceived = false;

      const handleSubscribe = () => {
        subscribersReady++;
        if (subscribersReady === 2) {
          TestLogger.log('Both subscribers ready', 'info');
          
          // Publish to topic A only
          const encrypted = TestUtils.encrypt('Message for Topic A', aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/topicA',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
      };

      subscriberA.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        if (msg.type === 'message') {
          subscriberAReceived = true;
          TestLogger.log('Subscriber A received message (correct)', 'success');
          subscriberA.send({
            type: 'ack',
            topic: msg.topic,
            messageId: msg.messageId,
          });
        }
      });

      subscriberB.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        if (msg.type === 'message') {
          subscriberBReceived = true;
          TestLogger.log('Subscriber B received message (incorrect!)', 'error');
        }
      });

      subscriberA.send({ type: 'subscribe', topic: 'test/topicA' });
      subscriberB.send({ type: 'subscribe', topic: 'test/topicB' });

      setTimeout(() => {
        if (subscriberAReceived && !subscriberBReceived) {
          TestLogger.log('Topic isolation working correctly', 'success');
          subscriberA.close();
          subscriberB.close();
          publisher.close();
          TestLogger.testEnd(true);
          resolve(true);
        } else {
          TestLogger.log('Topic isolation failed', 'error');
          subscriberA.close();
          subscriberB.close();
          publisher.close();
          TestLogger.testEnd(false);
          resolve(false);
        }
      }, 5000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 11: ACK Confirmation to Publisher
async function test11_ACKConfirmation(sessionData, aesKey) {
  TestLogger.testStart('ACK Confirmation to Publisher');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let subscribed = false;
      let ackReceived = false;

      subscriber.onMessage((msg) => {
        if (msg.type === 'subscribe_response') {
          subscribed = true;
          TestLogger.log('Subscriber ready', 'info');
          
          const encrypted = TestUtils.encrypt('Test ACK', aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/ack',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
        
        if (msg.type === 'message') {
          TestLogger.log('Subscriber received message, sending ACK', 'info');
          subscriber.send({
            type: 'ack',
            topic: msg.topic,
            messageId: msg.messageId,
          });
        }
      });

      publisher.onMessage((msg) => {
        if (msg.type === 'ack_received') {
          ackReceived = true;
          TestLogger.log('Publisher received ACK confirmation', 'success');
          subscriber.close();
          publisher.close();
          TestLogger.testEnd(true);
          resolve(true);
        }
      });

      subscriber.send({ type: 'subscribe', topic: 'test/ack' });

      setTimeout(() => {
        if (!ackReceived) {
          TestLogger.log('ACK confirmation not received', 'error');
          subscriber.close();
          publisher.close();
          TestLogger.testEnd(false);
          resolve(false);
        }
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 12: Session Isolation
async function test12_SessionIsolation(aesKey) {
  TestLogger.testStart('Session Isolation (No cross-session messages)');
  
  try {
    // Create second session
    const response = await fetch(`${SERVER_URL}/api/createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: 'testSession2',
        password: 'testPass456',
      }),
    });

    const session2 = await response.json();
    
    if (!session2.success) {
      TestLogger.log('Failed to create second session', 'error');
      TestLogger.testEnd(false);
      return false;
    }

    const subscriber1 = await new WSClient('testSession', 'testPass123').connect();
    const subscriber2 = await new WSClient('testSession2', 'testPass456').connect();
    const publisher = await new WSClient('testSession', 'testPass123').connect();
    
    return new Promise((resolve) => {
      let subscribersReady = 0;
      let session1Received = false;
      let session2Received = false;

      const handleSubscribe = () => {
        subscribersReady++;
        if (subscribersReady === 2) {
          TestLogger.log('Both sessions subscribed to same topic name', 'info');
          
          // Publish to session 1
          const encrypted = TestUtils.encrypt('Session 1 message', aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'shared/topic',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
      };

      subscriber1.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        if (msg.type === 'message') {
          session1Received = true;
          TestLogger.log('Session 1 subscriber received message (correct)', 'success');
          subscriber1.send({
            type: 'ack',
            topic: msg.topic,
            messageId: msg.messageId,
          });
        }
      });

      subscriber2.onMessage((msg) => {
        if (msg.type === 'subscribe_response') handleSubscribe();
        if (msg.type === 'message') {
          session2Received = true;
          TestLogger.log('Session 2 subscriber received message (incorrect!)', 'error');
        }
      });

      subscriber1.send({ type: 'subscribe', topic: 'shared/topic' });
      subscriber2.send({ type: 'subscribe', topic: 'shared/topic' });

      setTimeout(async () => {
        if (session1Received && !session2Received) {
          TestLogger.log('Session isolation working correctly', 'success');
          subscriber1.close();
          subscriber2.close();
          publisher.close();
          
          // Cleanup session 2
          await fetch(`${SERVER_URL}/api/dropSession`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionName: 'testSession2',
              password: 'testPass456',
              secretKey: session2.secretKey,
            }),
          });
          
          TestLogger.testEnd(true);
          resolve(true);
        } else {
          TestLogger.log('Session isolation failed', 'error');
          subscriber1.close();
          subscriber2.close();
          publisher.close();
          TestLogger.testEnd(false);
          resolve(false);
        }
      }, 5000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 13: Suspend Session
async function test13_SuspendSession(sessionData) {
  TestLogger.testStart('Suspend Session');
  
  try {
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
    
    if (result.success && result.suspended === true) {
      TestLogger.log('Session suspended successfully', 'success');
      
      // Try to connect (should fail or not receive messages)
      const client = await new WSClient(sessionData.sessionName, sessionData.password).connect();
      TestLogger.log('Connection still possible (expected)', 'info');
      client.close();
      
      TestLogger.testEnd(true);
      return true;
    } else {
      TestLogger.log('Failed to suspend session', 'error');
      TestLogger.testEnd(false);
      return false;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 14: Unsuspend Session
async function test14_UnsuspendSession(sessionData) {
  TestLogger.testStart('Unsuspend Session');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/suspendSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: sessionData.sessionName,
        password: sessionData.password,
        secretKey: sessionData.secretKey,
        suspend: false,
      }),
    });

    const result = await response.json();
    
    if (result.success && result.suspended === false) {
      TestLogger.log('Session unsuspended successfully', 'success');
      TestLogger.testEnd(true);
      return true;
    } else {
      TestLogger.log('Failed to unsuspend session', 'error');
      TestLogger.testEnd(false);
      return false;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 15: Invalid Secret Key
async function test15_InvalidSecretKey(sessionData) {
  TestLogger.testStart('Invalid Secret Key (Should Fail)');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/suspendSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: sessionData.sessionName,
        password: sessionData.password,
        secretKey: 'invalid-secret-key',
        suspend: true,
      }),
    });

    const result = await response.json();
    
    if (!result.success && result.error) {
      TestLogger.log('Correctly rejected invalid secret key', 'success');
      TestLogger.testEnd(true);
      return true;
    } else {
      TestLogger.log('Should have rejected invalid secret key', 'error');
      TestLogger.testEnd(false);
      return false;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 16: Hash Verification Failure
async function test16_HashVerificationFailure(sessionData, aesKey) {
  TestLogger.testStart('Hash Verification Failure (Tampered Message)');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let messageReceived = false;

      subscriber.onMessage((msg) => {
        if (msg.type === 'subscribe_response') {
          TestLogger.log('Subscriber ready', 'info');
          
          // Publish with wrong hash
          const encrypted = TestUtils.encrypt('Test message', aesKey);
          const wrongHash = 'wrong-hash-value';
          
          publisher.send({
            type: 'publish',
            topic: 'test/hash',
            data: encrypted,
            hash: wrongHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
        
        if (msg.type === 'message') {
          // Verify hash
          const computedHash = TestUtils.hash(msg.data);
          if (computedHash !== msg.hash) {
            TestLogger.log('Hash mismatch detected (correct behavior)', 'success');
            messageReceived = true;
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          } else {
            TestLogger.log('Hash should have failed verification', 'error');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(false);
            resolve(false);
          }
        }
      });

      subscriber.send({ type: 'subscribe', topic: 'test/hash' });

      setTimeout(() => {
        if (!messageReceived) {
          TestLogger.log('Message with wrong hash was delivered', 'info');
          subscriber.close();
          publisher.close();
          TestLogger.testEnd(true);
          resolve(true);
        }
      }, 5000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 17: Large Message
async function test17_LargeMessage(sessionData, aesKey) {
  TestLogger.testStart('Large Message Transmission');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      const largeMessage = 'X'.repeat(10000); // 10KB message

      subscriber.onMessage((msg) => {
        if (msg.type === 'subscribe_response') {
          TestLogger.log('Subscriber ready, sending large message...', 'info');
          
          const encrypted = TestUtils.encrypt(largeMessage, aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/large',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
        
        if (msg.type === 'message') {
          const decrypted = TestUtils.decrypt(msg.data, aesKey);
          
          if (decrypted.length === largeMessage.length) {
            TestLogger.log(`Large message received (${decrypted.length} bytes)`, 'success');
            subscriber.send({
              type: 'ack',
              topic: msg.topic,
              messageId: msg.messageId,
            });
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          } else {
            TestLogger.log('Large message size mismatch', 'error');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(false);
            resolve(false);
          }
        }
      });

      subscriber.send({ type: 'subscribe', topic: 'test/large' });

      setTimeout(() => {
        TestLogger.log('Large message timeout', 'error');
        subscriber.close();
        publisher.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 18: Rapid Messages
async function test18_RapidMessages(sessionData, aesKey) {
  TestLogger.testStart('Rapid Message Transmission (10 messages)');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      let messagesReceived = 0;
      const totalMessages = 10;

      subscriber.onMessage((msg) => {
        if (msg.type === 'subscribe_response') {
          TestLogger.log('Subscriber ready, sending rapid messages...', 'info');
          
          // Send 10 messages rapidly
          for (let i = 0; i < totalMessages; i++) {
            const encrypted = TestUtils.encrypt(`Message ${i}`, aesKey);
            const messageHash = TestUtils.hash(encrypted);
            
            publisher.send({
              type: 'publish',
              topic: 'test/rapid',
              data: encrypted,
              hash: messageHash,
              timestamp: Date.now(),
              messageId: uuidv4(),
            });
          }
        }
        
        if (msg.type === 'message') {
          messagesReceived++;
          TestLogger.log(`Received message ${messagesReceived}/${totalMessages}`, 'info');
          
          subscriber.send({
            type: 'ack',
            topic: msg.topic,
            messageId: msg.messageId,
          });
          
          if (messagesReceived === totalMessages) {
            TestLogger.log('All rapid messages received', 'success');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          }
        }
      });

      subscriber.send({ type: 'subscribe', topic: 'test/rapid' });

      setTimeout(() => {
        TestLogger.log(`Only received ${messagesReceived}/${totalMessages} messages`, 'error');
        subscriber.close();
        publisher.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Test 19: JSON Message Payload
async function test19_JSONPayload(sessionData, aesKey) {
  TestLogger.testStart('JSON Message Payload');
  
  try {
    const subscriber = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    const publisher = await new WSClient(sessionData.sessionName, sessionData.password).connect();
    
    return new Promise((resolve) => {
      const jsonPayload = {
        sensor: 'temperature',
        value: 25.5,
        unit: 'celsius',
        timestamp: Date.now(),
        location: { room: 'A1', floor: 2 }
      };

      subscriber.onMessage((msg) => {
        if (msg.type === 'subscribe_response') {
          TestLogger.log('Subscriber ready, sending JSON payload...', 'info');
          
          const jsonString = JSON.stringify(jsonPayload);
          const encrypted = TestUtils.encrypt(jsonString, aesKey);
          const messageHash = TestUtils.hash(encrypted);
          
          publisher.send({
            type: 'publish',
            topic: 'test/json',
            data: encrypted,
            hash: messageHash,
            timestamp: Date.now(),
            messageId: uuidv4(),
          });
        }
        
        if (msg.type === 'message') {
          const decrypted = TestUtils.decrypt(msg.data, aesKey);
          const received = JSON.parse(decrypted);
          
          if (received.sensor === jsonPayload.sensor && 
              received.value === jsonPayload.value &&
              received.location.room === jsonPayload.location.room) {
            TestLogger.log('JSON payload received and parsed correctly', 'success');
            subscriber.send({
              type: 'ack',
              topic: msg.topic,
              messageId: msg.messageId,
            });
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(true);
            resolve(true);
          } else {
            TestLogger.log('JSON payload mismatch', 'error');
            subscriber.close();
            publisher.close();
            TestLogger.testEnd(false);
            resolve(false);
          }
        }
      });

      subscriber.send({ type: 'subscribe', topic: 'test/json' });

      setTimeout(() => {
        TestLogger.log('JSON payload timeout', 'error');
        subscriber.close();
        publisher.close();
        TestLogger.testEnd(false);
        resolve(false);
      }, 10000);
    });
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}


// Test 20: Drop Session
async function test20_DropSession(sessionData) {
  TestLogger.testStart('Drop Session (Final Cleanup)');
  
  try {
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
      TestLogger.log('Session dropped successfully', 'success');
      
      // Try to connect (should fail)
      try {
        await new WSClient(sessionData.sessionName, sessionData.password).connect();
        TestLogger.log('Should not be able to connect to dropped session', 'error');
        TestLogger.testEnd(false);
        return false;
      } catch (error) {
        TestLogger.log('Correctly rejected connection to dropped session', 'success');
        TestLogger.testEnd(true);
        return true;
      }
    } else {
      TestLogger.log('Failed to drop session', 'error');
      TestLogger.testEnd(false);
      return false;
    }
  } catch (error) {
    TestLogger.log(`Error: ${error.message}`, 'error');
    TestLogger.testEnd(false);
    return false;
  }
}

// Main Test Runner
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║        fastPort Complete System Test Suite                ║');
  console.log('║        Testing All Features from Top to Bottom            ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  TestLogger.log('Starting test suite...', 'info');
  TestLogger.log(`Server URL: ${SERVER_URL}`, 'info');
  TestLogger.log(`WebSocket URL: ${WS_URL}`, 'info');
  console.log('\n');

  let sessionData = null;
  let aesKey = null;

  try {
    // Generate AES key for tests
    aesKey = TestUtils.generateAESKey();
    TestLogger.log(`Generated AES Key: ${aesKey.substring(0, 20)}...`, 'info');
    console.log('\n');

    // Run tests sequentially
    const serverOk = await test01_ServerHealthCheck();
    if (!serverOk) {
      TestLogger.log('Server not available. Exiting.', 'error');
      process.exit(1);
    }

    sessionData = await test02_CreateSession();
    if (!sessionData) {
      TestLogger.log('Failed to create session. Exiting.', 'error');
      process.exit(1);
    }

    await test03_CreateDuplicateSession();
    await test04_WebSocketConnection(sessionData);
    await test05_InvalidCredentials();
    await test06_SubscribeToTopic(sessionData);
    await test07_UnsubscribeFromTopic(sessionData);
    await test08_BasicPubSub(sessionData, aesKey);
    await test09_MultipleSubscribers(sessionData, aesKey);
    await test10_TopicIsolation(sessionData, aesKey);
    await test11_ACKConfirmation(sessionData, aesKey);
    await test12_SessionIsolation(aesKey);
    await test13_SuspendSession(sessionData);
    await test14_UnsuspendSession(sessionData);
    await test15_InvalidSecretKey(sessionData);
    await test16_HashVerificationFailure(sessionData, aesKey);
    await test17_LargeMessage(sessionData, aesKey);
    await test18_RapidMessages(sessionData, aesKey);
    await test19_JSONPayload(sessionData, aesKey);
    await test20_DropSession(sessionData);

  } catch (error) {
    TestLogger.log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
  }

  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log(`Total Tests:  ${testResults.total}`);
  console.log(`✅ Passed:     ${testResults.passed}`);
  console.log(`❌ Failed:     ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  console.log('\n');

  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
    console.log('\n');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('\n');
    process.exit(1);
  }
}

// Run the test suite
runAllTests().catch(error => {
  console.error('Test suite crashed:', error);
  process.exit(1);
});

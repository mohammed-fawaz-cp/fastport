import WebSocket from 'ws';
import crypto from 'crypto';

const PORT = process.env.PORT || 3001;
const SERVER_URL = `ws://localhost:${PORT}`;

function generateAESKey() {
  return crypto.randomBytes(32).toString('base64');
}

const SESSION = 'verifySession';
const PASS = 'pass123';
const TOPIC = 'verify/topic';

async function verify() {
  console.log(`Starting Manual Verification on port ${PORT}...`);
  
  // Create Session
  await fetch(`http://localhost:${PORT}/api/createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionName: SESSION, password: PASS })
  }).catch(() => {}); // Maintain idempotency if exists

  const sub = new WebSocket(SERVER_URL);
  const pub = new WebSocket(SERVER_URL);

  let subReady = new Promise(resolve => {
    sub.on('open', () => {
      sub.send(JSON.stringify({ type: 'init', sessionName: SESSION, password: PASS }));
    });
    sub.on('message', msg => {
      const data = JSON.parse(msg.toString());
      if (data.type === 'init_response' && data.success) {
        console.log('Subscriber initialized');
        sub.send(JSON.stringify({ type: 'subscribe', topic: TOPIC }));
      }
      if (data.type === 'subscribe_response') {
        console.log('Subscriber subscribed');
        resolve();
      }
      if (data.type === 'message') {
        console.log('SUCCESS: Subscriber received message:', data);
        process.exit(0);
      }
    });
  });

  await subReady;

  pub.on('open', () => {
    pub.send(JSON.stringify({ type: 'init', sessionName: SESSION, password: PASS }));
  });
  
  pub.on('message', msg => {
    const data = JSON.parse(msg.toString());
    console.log('Publisher received:', data);
    if (data.type === 'init_response' && data.success) {
      console.log('Publisher initialized');
      console.log('Publishing...');
      pub.send(JSON.stringify({
        type: 'publish',
        topic: TOPIC,
        data: 'encrypted_dummy',
        hash: 'dummy_hash',
        timestamp: Date.now(),
        messageId: 'msg_' + Date.now()
      }));
    }
  });

  setTimeout(() => {
    console.error('FAILED: Timeout');
    process.exit(1);
  }, 5000);
}

verify();

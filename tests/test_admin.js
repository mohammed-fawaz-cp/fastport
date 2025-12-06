import WebSocket from 'ws';

const PORT = 3001;
const URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const USER = 'admin';
const PASS = 'secure_admin_pass'; // We will set ADMIN_PASS env var to this

async function testAdmin() {
  console.log('--- Testing Web Admin Portal ---');

  // 1. Login
  console.log('1. Testing Login...');
  const loginRes = await fetch(`${URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });
  
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    console.error('Login Failed:', loginData);
    process.exit(1);
  }
  console.log('Login Success. Token:', loginData.token);
  
  const basicAuth = `Basic ${loginData.token}`;

  // 2. Stats
  console.log('2. Testing Stats API...');
  const statsRes = await fetch(`${URL}/api/admin/stats`, {
    headers: { 'Authorization': basicAuth }
  });
  
  if (statsRes.status !== 200) {
     console.error('Stats Failed:', statsRes.status);
     process.exit(1);
  }
  const stats = await statsRes.json();
  console.log('Stats Received:', stats);

  // 3. Log Streaming
  console.log('3. Testing Log Streaming...');
  await testLogStreaming(loginData.token);
}

function testLogStreaming(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    // Decode pass from token (simulate frontend logic if needed, or just use PASS)
    // Front end sends: { type: 'init', sessionName: 'admin_session', password: ... }
    const decoded = Buffer.from(token, 'base64').toString().split(':')[1];

    ws.on('open', () => {
       // Init as Admin
       ws.send(JSON.stringify({
         type: 'init',
         sessionName: 'admin_session',
         password: decoded
       }));
    });

    ws.on('message', (data) => {
       const msg = JSON.parse(data.toString());
       
       if (msg.type === 'init_response') {
           if (msg.success) {
               console.log('Admin Socket Authenticated. Subscribing...');
               ws.send(JSON.stringify({ type: 'subscribe', topic: 'sys/logs' }));
               
               // Trigger a log on server side?
               // The server logs 'Admin Session initialized' or similar.
               // We can also trigger an API call to generate logs (like stats)
               setTimeout(() => {
                   fetch(`${URL}/api/admin/stats`, { headers: { 'Authorization': `Basic ${token}` } });
               }, 500);
           } else {
               reject('Socket Init Failed: ' + msg.error);
           }
       }
       
       // Log Message?
       // Server logic: payload = { type: 'log', data: ... }
       if (msg.type === 'log') {
           console.log('Log Received:', msg.data);
           ws.close();
           resolve();
       }
    });

    ws.on('error', (e) => reject(e));
    
    setTimeout(() => reject('Timeout waiting for logs'), 5000);
  });
}

testAdmin().then(() => {
    console.log('SUCCESS: Admin Portal Verified');
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});

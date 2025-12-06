import WebSocket from 'ws';
import crypto from 'crypto';

const PORT = 3001;
const SERVER_URL = `ws://localhost:${PORT}`;

const SESSION = 'fileSession';
const PASS = 'pass123';
const TOPIC = 'file/transfer';
const FILE_ID = 'file_' + Date.now();
const FILE_SIZE = 1024 * 100; // 100 KB
const CHUNK_SIZE = 1024 * 10; // 10 KB
const TOTAL_CHUNKS = Math.ceil(FILE_SIZE / CHUNK_SIZE);

// Create valid session first
async function createSession() {
  await fetch(`http://localhost:${PORT}/api/createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionName: SESSION, password: PASS })
  }).catch(e => console.log('Session might exist'));
}

async function testFileTransfer() {
  await createSession();

  console.log(`Starting File Transfer Test (Size: ${FILE_SIZE} bytes, Chunks: ${TOTAL_CHUNKS})...`);

  const sub = new WebSocket(SERVER_URL);
  const pub = new WebSocket(SERVER_URL);

  let chunksReceived = 0;
  let initReceived = false;
  let endReceived = false;

  const subPromise = new Promise((resolve, reject) => {
    sub.on('open', () => {
      sub.send(JSON.stringify({ type: 'init', sessionName: SESSION, password: PASS }));
    });

    sub.on('message', msg => {
      const data = JSON.parse(msg.toString());
      
      if (data.type === 'init_response' && data.success) {
        sub.send(JSON.stringify({ type: 'subscribe', topic: TOPIC }));
      }
      if (data.type === 'subscribe_response') {
        console.log('Subscriber ready.');
        // Publisher can start now? No, we wait for pub to be ready.
      }
      
      if (data.type === 'init_file') {
        console.log(`[Sub] Received Init File: ${data.fileId}`);
        initReceived = true;
      }
      if (data.type === 'file_chunk') {
        chunksReceived++;
        // console.log(`[Sub] Received Chunk ${data.chunkIndex}`);
      }
      if (data.type === 'end_file') {
        console.log('[Sub] Received End File.');
        endReceived = true;
        if (initReceived && chunksReceived === TOTAL_CHUNKS) {
           console.log('SUCCESS: File transfer verified.');
           resolve();
        } else {
           reject(`FAILURE: Missing Chunks (Received: ${chunksReceived}/${TOTAL_CHUNKS}, Init: ${initReceived})`);
        }
      }
    });
  });

  pub.on('open', () => {
    pub.send(JSON.stringify({ type: 'init', sessionName: SESSION, password: PASS }));
  });

  pub.on('message', msg => {
    const data = JSON.parse(msg.toString());
    if (data.type === 'init_response' && data.success) {
      console.log('Publisher ready. Sending file...');
      
      // 1. Send Init
      pub.send(JSON.stringify({
        type: 'init_file',
        topic: TOPIC,
        fileId: FILE_ID,
        fileName: 'test.bin',
        fileSize: FILE_SIZE,
        totalChunks: TOTAL_CHUNKS
      }));

      // 2. Send Chunks
      for (let i = 0; i < TOTAL_CHUNKS; i++) {
        pub.send(JSON.stringify({
          type: 'file_chunk',
          topic: TOPIC,
          fileId: FILE_ID,
          chunkIndex: i,
          data: Buffer.alloc(10).toString('base64') // Dummy data
        }));
      }

      // 3. Send End
      pub.send(JSON.stringify({
        type: 'end_file',
        topic: TOPIC,
        fileId: FILE_ID,
        hash: 'dummyhash'
      }));
    }
  });

  await subPromise;
  process.exit(0);
}

testFileTransfer().catch(e => {
  console.error(e);
  process.exit(1);
});

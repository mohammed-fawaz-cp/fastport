import WebSocket from 'ws';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

class FastPortClient {
  constructor(serverUrl, sessionName, password, aesKey) {
    this.serverUrl = serverUrl;
    this.sessionName = sessionName;
    this.password = password;
    this.aesKey = Buffer.from(aesKey, 'base64');
    this.ws = null;
    this.subscriptions = {};
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          type: 'init',
          sessionName: this.sessionName,
          password: this.password,
        }));
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'init_response') {
          if (message.success) {
            resolve();
          } else {
            reject(new Error(message.error));
          }
        } else {
          this.handleMessage(message);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  handleMessage(message) {
    if (message.type === 'message') {
      const { topic, data, hash, timestamp, messageId } = message;
      
      // Verify hash
      const computedHash = crypto.createHash('sha256').update(data).digest('hex');
      if (computedHash !== hash) {
        console.error('Hash verification failed');
        return;
      }

      // Decrypt
      const [ivBase64, encryptedBase64] = data.split(':');
      const iv = Buffer.from(ivBase64, 'base64');
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, iv);
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');

      // Send ACK
      this.ws.send(JSON.stringify({
        type: 'ack',
        topic,
        messageId,
      }));

      // Call callbacks
      if (this.subscriptions[topic]) {
        this.subscriptions[topic].forEach(callback => {
          callback(decrypted, timestamp);
        });
      }
    }
  }

  emit(topic, message) {
    const messageId = uuidv4();
    const timestamp = Date.now();

    // Encrypt
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
    let encrypted = cipher.update(message, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const encryptedData = `${iv.toString('base64')}:${encrypted.toString('base64')}`;
    const hash = crypto.createHash('sha256').update(encryptedData).digest('hex');

    this.ws.send(JSON.stringify({
      type: 'publish',
      topic,
      data: encryptedData,
      hash,
      timestamp,
      messageId,
    }));
  }

  get(topic, callback) {
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = [];
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        topic,
      }));
    }
    this.subscriptions[topic].push(callback);
  }

  close() {
    this.ws.close();
  }
}

// Example usage
const client = new FastPortClient(
  'ws://localhost:3000',
  'mySession',
  'myPassword',
  'your-base64-encoded-32-byte-key-here=='
);

await client.init();
console.log('Connected!');

// Subscribe
client.get('test/topic', (message, timestamp) => {
  console.log('Received:', message, 'at', timestamp);
});

// Publish
client.emit('test/topic', 'Hello fastPort!');

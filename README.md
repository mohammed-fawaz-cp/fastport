# fastPort 🚀

A fully secure, scalable publish-subscribe communication system with multiple isolated virtual brokers (sessions).

## What is fastPort?

fastPort is like running multiple MQTT brokers on a single server, with each "session" acting as an independent virtual broker. It provides:

- **Multi-session isolation**: Each session is completely isolated
- **End-to-end encryption**: AES-256-CBC encryption, server never sees plaintext
- **Message integrity**: SHA256 verification
- **Guaranteed delivery**: Automatic retry with ACK confirmation
- **Auto-reconnect**: Seamless reconnection with subscription recovery
- **Pure WebSocket**: No socket.io dependency

## How It Works

```
┌─────────────┐                  ┌──────────────┐                  ┌─────────────┐
│  Publisher  │                  │    Server    │                  │ Subscriber  │
│             │                  │              │                  │             │
│  1. Encrypt │─────────────────>│  2. Cache    │─────────────────>│  3. Verify  │
│  2. Hash    │   Ciphertext     │  3. Forward  │   Ciphertext     │  4. Decrypt │
│  3. Send    │                  │  4. Retry    │                  │  5. ACK     │
│             │<─────────────────│  5. Wait ACK │<─────────────────│             │
│  6. Confirm │      ACK         │  6. Cleanup  │      ACK         │             │
└─────────────┘                  └──────────────┘                  └─────────────┘
```

## Quick Start

### 1. Install and Run Server

```bash
cd fastPort
npm install
npm start
```

Server runs on `http://localhost:3000`

### 2. Generate AES Key

```bash
node utils/generate_key.js
```

### 3. Create a Session

```bash
curl -X POST http://localhost:3000/api/createSession \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "mySession",
    "password": "myPassword",
    "retryInterval": 5000,
    "maxRetryLimit": 100
  }'
```

### 4. Use the Dart Client

```dart
import 'package:fastport_client/fastport_client.dart';

final fastPort = FastPort(
  serverUrl: 'ws://localhost:3000',
  sessionName: 'mySession',
  password: 'myPassword',
  aesKey: 'your-generated-key-here',
);

await fastPort.init();

// Subscribe
fastPort.get('sensors/temp', (message, timestamp) {
  print('Temperature: $message');
});

// Publish
await fastPort.emit('sensors/temp', '25.5');
```

## Features

### Multi-Session Isolation

Each session is a completely isolated virtual broker:
- Independent message routing
- Separate authentication
- No cross-session interference
- Perfect for multi-tenant applications

### End-to-End Encryption

- AES-256-CBC encryption
- Server never decrypts messages
- SHA256 integrity verification
- Client-side key management

### Guaranteed Delivery

- Server-side message caching
- Automatic retry mechanism
- ACK-based confirmation
- Configurable retry limits and intervals

### Auto-Reconnect

- Automatic reconnection on disconnect
- Subscription recovery
- Transparent to application code
- Configurable backoff

## Documentation

- [Quick Start Guide](QUICKSTART.md) - Get up and running in 5 minutes
- [API Reference](docs/API.md) - Complete API documentation
- [Architecture](ARCHITECTURE.md) - System design and internals
- [Project Structure](PROJECT_STRUCTURE.md) - Code organization

## Examples

- [Node.js Client](examples/node_client_example.js)
- [Dart Sender](dart_client/example/sender_example.dart)
- [Dart Receiver](dart_client/example/receiver_example.dart)
- [Session Management](examples/create_session.js)

## Use Cases

- **IoT Communication**: Sensor data collection and device control
- **Real-Time Notifications**: User-specific notification channels
- **Microservices**: Service-to-service messaging
- **Chat Applications**: Private encrypted channels
- **Multi-Tenant Systems**: Isolated communication per customer

## Tech Stack

**Server**: Node.js + Express + WebSocket (ws)  
**Client**: Dart with pointycastle encryption  
**Protocol**: Custom WebSocket-based pub-sub  

## License

MIT

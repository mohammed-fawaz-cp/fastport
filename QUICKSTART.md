# fastPort Quick Start Guide

## Installation

### Server Setup

1. Install dependencies:
```bash
cd fastPort
npm install
```

2. Start the server:
```bash
npm start
```

Server runs on `http://localhost:3000`

### Dart Client Setup

1. Add to your `pubspec.yaml`:
```yaml
dependencies:
  fastport_client:
    path: ../fastPort/dart_client
```

2. Install:
```bash
dart pub get
```

## Step-by-Step Tutorial

### Step 1: Generate an AES Key

```bash
node utils/generate_key.js
```

Save the output key - you'll need it for all clients.

### Step 2: Create a Session

```bash
curl -X POST http://localhost:3000/api/createSession \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "myFirstSession",
    "password": "securePassword123",
    "retryInterval": 5000,
    "maxRetryLimit": 100
  }'
```

Save the `secretKey` from the response.

### Step 3: Create a Receiver (Dart)

```dart
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final fastPort = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'myFirstSession',
    password: 'securePassword123',
    aesKey: 'YOUR_GENERATED_KEY_HERE',
  );

  await fastPort.init();
  print('Connected!');

  fastPort.get('test/topic', (message, timestamp) {
    print('Received: $message');
  });

  // Keep running
  await Future.delayed(Duration(hours: 1));
}
```

### Step 4: Create a Sender (Dart)

```dart
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final fastPort = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'myFirstSession',
    password: 'securePassword123',
    aesKey: 'YOUR_GENERATED_KEY_HERE',
  );

  await fastPort.init();
  print('Connected!');

  // Send a message
  await fastPort.emit('test/topic', 'Hello from Dart!');
  print('Message sent!');

  await Future.delayed(Duration(seconds: 2));
  fastPort.close();
}
```

### Step 5: Run

1. Start the receiver:
```bash
dart run receiver.dart
```

2. In another terminal, run the sender:
```bash
dart run sender.dart
```

You should see the message appear in the receiver!

## Testing with Node.js

You can also use Node.js clients:

```javascript
import { FastPortClient } from './examples/node_client_example.js';

const client = new FastPortClient(
  'ws://localhost:3000',
  'myFirstSession',
  'securePassword123',
  'YOUR_GENERATED_KEY_HERE'
);

await client.init();

// Receiver
client.get('test/topic', (message, timestamp) => {
  console.log('Received:', message);
});

// Sender
client.emit('test/topic', 'Hello from Node!');
```

## Common Operations

### Suspend a Session

```bash
curl -X POST http://localhost:3000/api/suspendSession \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "myFirstSession",
    "password": "securePassword123",
    "secretKey": "YOUR_SECRET_KEY",
    "suspend": true
  }'
```

### Drop a Session

```bash
curl -X POST http://localhost:3000/api/dropSession \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "myFirstSession",
    "password": "securePassword123",
    "secretKey": "YOUR_SECRET_KEY"
  }'
```

## Troubleshooting

### Connection Refused
- Make sure the server is running on port 3000
- Check firewall settings

### Authentication Failed
- Verify session name and password are correct
- Ensure the session exists (create it first)

### Messages Not Received
- Check that both sender and receiver use the same AES key
- Verify both are connected to the same session
- Check that the topic names match exactly

### Hash Verification Failed
- Ensure all clients use the same AES key
- Check for network corruption
- Verify encryption/decryption implementation

## Next Steps

- Read [API.md](docs/API.md) for complete API reference
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- Check [examples/](examples/) for more code samples
- Implement your own use case!

## Tips

1. **One AES key per session**: All clients in a session must share the same key
2. **Keep secret keys safe**: They allow admin operations
3. **Use meaningful topic names**: Like `sensors/temperature/room1`
4. **Handle reconnection**: The client does this automatically
5. **Monitor message expiry**: Set appropriate TTL for your use case

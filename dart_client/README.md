# fastport_client

[![pub package](https://img.shields.io/pub/v/fastport_client.svg)](https://pub.dev/packages/fastport_client)

**Secure, real-time messaging with end-to-end encryption and large file transfers.**

Perfect for building chat apps, IoT communication, file sharing platforms, and real-time collaboration tools.

## ✨ Features

- 🔐 **End-to-End Encryption** - AES-256-CBC encryption for all messages and files
- 📁 **Large File Transfers** - Send gigabyte-sized files efficiently (binary protocol, no Base64 overhead)
- 🔄 **Auto-Reconnection** - Automatic reconnection with message retry
- 📡 **Pub/Sub Pattern** - Topic-based publish-subscribe messaging
- 🚀 **High Performance** - Optimized binary protocol for minimal latency
- 💾 **Zero Data Retention** - Ephemeral storage with automatic cleanup
- 🎯 **Multi-Session** - Support for multiple isolated chat rooms/channels

## 📦 Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  fastport_client: ^1.0.0
```

Then run:

```bash
dart pub get
```

## 🚀 Quick Start

### 1. Start the Server

First, you need a fastPort server running. [Get the server here](https://github.com/fastport/fastport).

```bash
# Clone and start the server
git clone https://github.com/fastport/fastport
cd fastport
npm install
npm start
```

Server runs on `http://localhost:3000` by default.

### 2. Create a Session

Sessions are like chat rooms. Create one via the server API:

```dart
import 'dart:convert';
import 'dart:io';

Future<void> createSession() async {
  final client = HttpClient();
  final request = await client.postUrl(
    Uri.parse('http://localhost:3000/api/createSession')
  );
  
  request.headers.contentType = ContentType.json;
  request.write(jsonEncode({
    'sessionName': 'my_chat_room',
    'password': 'secure_password_123',
    'encryptionKey': base64Encode(List<int>.generate(32, (i) => i)),
    'retryInterval': 5000,
    'maxRetryLimit': 100,
    'messageExpiryTime': 3600000, // 1 hour
  }));
  
  final response = await request.close();
  print('Session created: ${response.statusCode}');
  client.close();
}
```

### 3. Send and Receive Messages

```dart
import 'package:fastport_client/fastport_client.dart';

void main() async {
  // Connect to the server
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'my_chat_room',
    password: 'secure_password_123',
    aesKey: base64Encode(List<int>.generate(32, (i) => i)), // Same key as session!
  );

  await client.init();
  print('✅ Connected!');

  // Subscribe to messages
  client.get('chat/general', (message, timestamp) {
    print('📨 Received: $message');
  });

  // Send a message
  await client.emit('chat/general', 'Hello, World!');
  
  // Keep the app running
  await Future.delayed(Duration(seconds: 5));
  client.close();
}
```

## 📁 File Transfer

Send and receive large files securely:

```dart
import 'dart:io';
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'my_session',
    password: 'password',
    aesKey: yourBase64Key,
  );
  
  await client.init();

  // Receive files
  client.onFile('files/shared', (fileName, fileData) {
    print('📥 Received: $fileName (${fileData.length} bytes)');
    File('downloads/$fileName').writeAsBytesSync(fileData);
  });

  // Send a file
  await client.sendFile('path/to/document.pdf', 'files/shared');
  print('📤 File sent!');
}
```

## 🔐 Security Best Practices

### 1. Generate Secure Keys

**Never** hardcode encryption keys! Generate them securely:

```dart
import 'dart:convert';
import 'dart:math';

String generateSecureKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(32, (_) => random.nextInt(256));
  return base64Encode(bytes);
}
```

### 2. Store Keys Securely

Use secure storage packages:

```yaml
dependencies:
  flutter_secure_storage: ^9.0.0  # For Flutter
```

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = FlutterSecureStorage();

// Save key
await storage.write(key: 'encryption_key', value: yourKey);

// Retrieve key
final key = await storage.read(key: 'encryption_key');
```

### 3. Use WSS in Production

Always use secure WebSocket (`wss://`) in production:

```dart
final client = FastPort(
  serverUrl: 'wss://your-domain.com',  // ✅ Secure
  // NOT: 'ws://your-domain.com'       // ❌ Insecure
  ...
);
```

## 📖 API Reference

### FastPort Class

#### Constructor

```dart
FastPort({
  required String serverUrl,      // WebSocket URL (ws:// or wss://)
  required String sessionName,    // Session/room name
  required String password,       // Session password
  required String aesKey,         // Base64-encoded 32-byte key
  int retryInterval = 5000,       // Retry interval in ms
  int maxRetries = 100,           // Max retry attempts
})
```

#### Methods

| Method | Description |
|--------|-------------|
| `init()` | Connect to server and authenticate |
| `emit(topic, message)` | Send encrypted message to topic |
| `get(topic, callback)` | Subscribe to topic and receive messages |
| `sendFile(filePath, topic)` | Send file to topic (encrypted) |
| `onFile(topic, callback)` | Receive files from topic |
| `unsubscribe(topic)` | Unsubscribe from topic |
| `close()` | Disconnect and cleanup |

## 🎯 Use Cases

### Chat Application

```dart
// User A (sender)
await client.emit('chat/room1', 'Hello everyone!');

// User B (receiver)
client.get('chat/room1', (msg, timestamp) {
  print('${DateTime.fromMillisecondsSinceEpoch(timestamp)}: $msg');
});
```

### IoT Sensor Data

```dart
// Sensor device
await client.emit('sensors/temperature', '{"value": 23.5, "unit": "C"}');

// Dashboard
client.get('sensors/temperature', (data, _) {
  final json = jsonDecode(data);
  print('Temperature: ${json['value']}°${json['unit']}');
});
```

### File Sharing

```dart
// Share a document
await client.sendFile('report.pdf', 'team/documents');

// Receive and save
client.onFile('team/documents', (name, bytes) {
  File('shared/$name').writeAsBytesSync(bytes);
  print('Saved: $name');
});
```

## 🔧 Troubleshooting

### Connection Timeout

```
Exception: Failed to connect: TimeoutException
```

**Solutions:**
- Verify server is running (`npm start` in server directory)
- Check server URL and port (default: `ws://localhost:3000`)
- Ensure firewall allows WebSocket connections

### Authentication Failed

```
Exception: Init failed: Invalid credentials
```

**Solutions:**
- Verify session exists (create it first via API)
- Check `sessionName` and `password` match
- Ensure `aesKey` matches the session's encryption key

### File Transfer Issues

**File receives 0 bytes:**
- Ensure both sender and receiver are connected
- Wait 1-2 seconds after subscribing before sending
- Check server logs for binary frame errors

## 🌟 Examples

See the [example/](https://github.com/fastport/fastport/tree/main/dart_client/example) directory for:
- `sender_example.dart` - Basic message sending
- `receiver_example.dart` - Basic message receiving
- Complete chat application example

## 📚 Additional Resources

- **Server Documentation**: [fastPort Server Docs](https://github.com/fastport/fastport/tree/main/docs)
- **API Reference**: [API.md](https://github.com/fastport/fastport/blob/main/docs/API.md)
- **Technical Guide**: [technical_documentation.md](https://github.com/fastport/fastport/blob/main/docs/technical_documentation.md)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](https://github.com/fastport/fastport/blob/main/CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/fastport/fastport/issues)
- **Discussions**: [GitHub Discussions](https://github.com/fastport/fastport/discussions)

---

**Made with ❤️ for secure, real-time communication**

# fastport_client

[![pub package](https://img.shields.io/pub/v/fastport_client.svg)](https://pub.dev/packages/fastport_client)

**Secure, real-time messaging with end-to-end encryption, large file transfers, and push notifications.**

Perfect for building chat apps, IoT communication, file sharing platforms, and real-time collaboration tools.

## ✨ Features

- 🔐 **End-to-End Encryption** - AES-256-CBC encryption for all messages and files
- 📁 **Large File Transfers** - Send gigabyte-sized files efficiently (binary protocol, no Base64 overhead)
- 🔄 **Auto-Reconnection** - Automatic reconnection with message retry and subscription recovery
- 📡 **Pub/Sub Pattern** - Topic-based publish-subscribe messaging
- 📱 **Push Notifications** - FCM integration for offline message delivery
- 🚀 **High Performance** - Optimized binary protocol for minimal latency
- 💾 **Zero Data Retention** - Ephemeral storage with automatic cleanup
- 🎯 **Multi-Session** - Support for multiple isolated chat rooms/channels
- 📲 **Multi-Device** - Manage multiple devices per user with automatic token sync

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

Sessions are like chat rooms. Create one via the server API or admin portal.

**Using HTTP API:**

```dart
import 'dart:convert';
import 'dart:io';

Future<Map<String, dynamic>> createSession() async {
  final client = HttpClient();
  final request = await client.postUrl(
    Uri.parse('http://localhost:3000/api/createSession')
  );
  
  request.headers.contentType = ContentType.json;
  request.write(jsonEncode({
    'sessionName': 'my_chat_room',
    'password': 'secure_password_123',
    'retryInterval': 5000,
    'maxRetryLimit': 100,
    'messageExpiryTime': 3600000, // 1 hour (optional)
    'sessionExpiry': 86400, // 24 hours (optional)
  }));
  
  final response = await request.close();
  final responseBody = await response.transform(utf8.decoder).join();
  final data = jsonDecode(responseBody);
  
  print('Session created!');
  print('Secret Key: ${data['secretKey']}'); // Save this for encryption!
  
  client.close();
  return data;
}
```

**Important:** Save the `secretKey` returned - you'll need it for encryption!

### 3. Initialize Client

```dart
import 'package:fastport_client/fastport_client.dart';

void main() async {
  // Create FastPort client
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'my_chat_room',
    password: 'secure_password_123',
    aesKey: 'your_secret_key_from_session_creation', // Base64 encoded
  );

  // Connect to server
  await client.init();
  print('✅ Connected!');

  // Your code here...
  
  // Cleanup when done
  client.close();
}
```

### 4. Send and Receive Messages

```dart
// Subscribe to messages (receiver)
client.get('chat/general', (message, timestamp) {
  print('📨 Received: $message');
  print('   Time: ${DateTime.fromMillisecondsSinceEpoch(timestamp)}');
});

// Send a message (sender)
await client.emit('chat/general', 'Hello, World!');
print('✅ Message sent!');
```

## 📖 Complete API Reference

### Constructor

```dart
FastPort({
  required String serverUrl,      // WebSocket URL (ws:// or wss://)
  required String sessionName,    // Session/room name
  required String password,       // Session password
  required String aesKey,         // Base64-encoded 32-byte encryption key
  int retryInterval = 5000,       // Message retry interval (ms)
  int maxRetries = 100,           // Max retry attempts per message
})
```

### Core Methods

#### `init()`
Connect to server and authenticate.

```dart
await client.init();
```

**Throws:** `Exception` if connection fails or authentication is rejected.

---

#### `emit(topic, message)`
Send encrypted message to a topic.

```dart
await client.emit('chat/room1', 'Hello!');
await client.emit('sensors/temp', '{"value": 23.5}');
```

**Parameters:**
- `topic` (String) - Topic name (e.g., 'chat/general', 'sensors/temperature')
- `message` (String) - Message content (will be encrypted automatically)

**Returns:** `Future<void>`

**Features:**
- Automatic encryption with AES-256-CBC
- Hash verification for integrity
- Automatic retry on failure (up to `maxRetries`)
- Guaranteed delivery with ACK mechanism

---

#### `get(topic, callback)`
Subscribe to a topic and receive messages.

```dart
client.get('chat/room1', (message, timestamp) {
  print('Message: $message');
  print('Time: ${DateTime.fromMillisecondsSinceEpoch(timestamp)}');
});
```

**Parameters:**
- `topic` (String) - Topic to subscribe to
- `callback` (Function) - Called when message arrives
  - `message` (String) - Decrypted message content
  - `timestamp` (int) - Unix timestamp in milliseconds

**Features:**
- Automatic decryption
- Hash verification
- Automatic ACK sent to server
- Multiple callbacks per topic supported
- Auto-resubscribe on reconnection

---

#### `unsubscribe(topic, [callback])`
Unsubscribe from a topic.

```dart
// Unsubscribe specific callback
client.unsubscribe('chat/room1', myCallback);

// Unsubscribe all callbacks for topic
client.unsubscribe('chat/room1');
```

**Parameters:**
- `topic` (String) - Topic to unsubscribe from
- `callback` (Function, optional) - Specific callback to remove

---

#### `close()`
Disconnect from server and cleanup resources.

```dart
client.close();
```

**Features:**
- Cancels all retry timers
- Closes WebSocket connection
- Clears pending acknowledgments
- Releases all resources

---

### File Transfer Methods

#### `sendFile(filePath, topic)`
Send a file to a topic (encrypted).

```dart
await client.sendFile('/path/to/document.pdf', 'files/shared');
```

**Parameters:**
- `filePath` (String) - Path to file on device
- `topic` (String) - Topic to send file to

**Features:**
- Automatic encryption (AES-256-CBC)
- Binary protocol (no Base64 overhead)
- Chunked transfer (64KB chunks)
- Progress logging
- Supports files of any size

**Throws:** `Exception` if file not found or transfer fails.

---

#### `onFile(topic, callback)`
Receive files from a topic.

```dart
client.onFile('files/shared', (fileName, fileData) {
  print('📥 Received: $fileName (${fileData.length} bytes)');
  
  // Save to device
  File('downloads/$fileName').writeAsBytesSync(fileData);
});
```

**Parameters:**
- `topic` (String) - Topic to receive files from
- `callback` (Function) - Called when file is fully received
  - `fileName` (String) - Original file name
  - `fileData` (List<int>) - Decrypted file bytes

**Features:**
- Automatic decryption
- Automatic chunk reassembly
- Preserves original filename
- Binary data (no encoding overhead)

---

### Push Notification Methods (FCM)

#### `registerFCMToken()`
Register device for push notifications.

```dart
await client.registerFCMToken(
  userId: 'alice',
  fcmToken: 'firebase_token_from_fcm_sdk',
  deviceId: 'unique_device_identifier',
  platform: 'android', // or 'ios', 'web'
);
```

**Parameters:**
- `userId` (String, required) - Unique user identifier
- `fcmToken` (String, required) - FCM token from Firebase SDK
- `deviceId` (String, required) - Unique device identifier
- `platform` (String, optional) - Platform type: 'android', 'ios', or 'web' (default: 'android')

**Features:**
- Automatic encryption of FCM token
- Hash verification
- Multi-device support (same user, multiple devices)
- Automatic token update (no duplicates)

**Use Cases:**
- App startup (register current device)
- FCM token refresh (update existing registration)
- Multi-device messaging

---

#### `unregisterFCMToken()`
Unregister device from push notifications.

```dart
await client.unregisterFCMToken(
  userId: 'alice',
  deviceId: 'unique_device_identifier',
);
```

**Parameters:**
- `userId` (String, required) - Unique user identifier
- `deviceId` (String, required) - Device to unregister

**Use Cases:**
- User logout (remove current device)
- Device removal from settings
- Account deletion

---

#### `getRegisteredDevices()`
Get list of registered devices for a user.

```dart
client.getRegisteredDevices(userId: 'alice');

// Listen for response
client.get('registered_devices_response', (response, _) {
  final data = jsonDecode(response);
  if (data['success']) {
    for (var device in data['devices']) {
      print('Device: ${device['deviceId']}');
      print('Platform: ${device['platform']}');
      print('Registered: ${DateTime.fromMillisecondsSinceEpoch(device['createdAt'])}');
    }
  }
});
```

**Parameters:**
- `userId` (String, required) - User to get devices for

**Response Format:**
```json
{
  "type": "registered_devices_response",
  "success": true,
  "devices": [
    {
      "deviceId": "iphone_123",
      "platform": "ios",
      "createdAt": 1734800000,
      "updatedAt": 1734800000
    }
  ]
}
```

**Note:** FCM tokens are NOT included in response (privacy/security).

---

## 💡 Complete Examples

### Example 1: Simple Chat Application

```dart
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'chat_room',
    password: 'password123',
    aesKey: 'your_base64_key_here',
  );

  await client.init();
  print('✅ Connected to chat!');

  // Receive messages
  client.get('chat/general', (message, timestamp) {
    final time = DateTime.fromMillisecondsSinceEpoch(timestamp);
    print('[$time] $message');
  });

  // Send messages
  await client.emit('chat/general', 'Alice: Hello everyone!');
  await client.emit('chat/general', 'Alice: How are you?');

  // Keep alive
  await Future.delayed(Duration(minutes: 5));
  client.close();
}
```

### Example 2: File Sharing

```dart
import 'dart:io';
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'file_share',
    password: 'password123',
    aesKey: 'your_base64_key_here',
  );

  await client.init();

  // Receive files
  client.onFile('files/documents', (fileName, fileData) {
    print('📥 Received: $fileName (${fileData.length} bytes)');
    
    // Save to downloads folder
    final file = File('downloads/$fileName');
    file.writeAsBytesSync(fileData);
    print('✅ Saved to: ${file.path}');
  });

  // Send a file
  print('📤 Sending file...');
  await client.sendFile('report.pdf', 'files/documents');
  print('✅ File sent!');

  await Future.delayed(Duration(seconds: 10));
  client.close();
}
```

### Example 3: IoT Sensor Data

```dart
import 'dart:convert';
import 'package:fastport_client/fastport_client.dart';

void main() async {
  final client = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'iot_sensors',
    password: 'password123',
    aesKey: 'your_base64_key_here',
  );

  await client.init();

  // Subscribe to sensor data
  client.get('sensors/temperature', (data, timestamp) {
    final json = jsonDecode(data);
    print('🌡️  Temperature: ${json['value']}°${json['unit']}');
  });

  client.get('sensors/humidity', (data, timestamp) {
    final json = jsonDecode(data);
    print('💧 Humidity: ${json['value']}${json['unit']}');
  });

  // Simulate sensor publishing data
  await Future.delayed(Duration(seconds: 1));
  
  await client.emit('sensors/temperature', 
    jsonEncode({'value': 23.5, 'unit': 'C'}));
  
  await client.emit('sensors/humidity', 
    jsonEncode({'value': 65, 'unit': '%'}));

  await Future.delayed(Duration(seconds: 5));
  client.close();
}
```

### Example 4: Flutter Chat App with FCM

```dart
import 'package:flutter/material.dart';
import 'package:fastport_client/fastport_client.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

class ChatService {
  late FastPort _client;
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  
  Future<void> initialize(String userId) async {
    // Initialize FastPort
    _client = FastPort(
      serverUrl: 'wss://your-server.com',
      sessionName: 'my_app',
      password: 'password',
      aesKey: 'your_key',
    );
    
    await _client.init();
    
    // Register for push notifications
    await _registerFCM(userId);
    
    // Subscribe to messages
    _client.get('chat/room1', (message, timestamp) {
      // Update UI with new message
      print('New message: $message');
    });
  }
  
  Future<void> _registerFCM(String userId) async {
    // Request permission
    final settings = await _fcm.requestPermission();
    if (settings.authorizationStatus != AuthorizationStatus.authorized) {
      return;
    }
    
    // Get FCM token
    final fcmToken = await _fcm.getToken();
    if (fcmToken == null) return;
    
    // Get device ID
    final deviceInfo = DeviceInfoPlugin();
    String deviceId;
    if (Platform.isAndroid) {
      final androidInfo = await deviceInfo.androidInfo;
      deviceId = androidInfo.id;
    } else {
      final iosInfo = await deviceInfo.iosInfo;
      deviceId = iosInfo.identifierForVendor ?? 'unknown';
    }
    
    // Register with FastPort
    await _client.registerFCMToken(
      userId: userId,
      fcmToken: fcmToken,
      deviceId: deviceId,
      platform: Platform.isAndroid ? 'android' : 'ios',
    );
    
    print('✅ FCM registered');
    
    // Handle token refresh
    _fcm.onTokenRefresh.listen((newToken) {
      _client.registerFCMToken(
        userId: userId,
        fcmToken: newToken,
        deviceId: deviceId,
        platform: Platform.isAndroid ? 'android' : 'ios',
      );
    });
  }
  
  Future<void> sendMessage(String message) async {
    await _client.emit('chat/room1', message);
  }
  
  Future<void> logout(String userId, String deviceId) async {
    // Unregister FCM token
    await _client.unregisterFCMToken(
      userId: userId,
      deviceId: deviceId,
    );
    
    _client.close();
  }
}
```

### Example 5: Multi-Device Management

```dart
import 'dart:convert';
import 'package:fastport_client/fastport_client.dart';

class DeviceManager {
  final FastPort client;
  final String userId;
  
  DeviceManager(this.client, this.userId);
  
  // Get all registered devices
  Future<List<Device>> getDevices() async {
    final completer = Completer<List<Device>>();
    
    // Listen for response
    client.get('registered_devices_response', (response, _) {
      final data = jsonDecode(response);
      if (data['success']) {
        final devices = (data['devices'] as List)
          .map((d) => Device.fromJson(d))
          .toList();
        completer.complete(devices);
      } else {
        completer.completeError(data['error']);
      }
    });
    
    // Request devices
    await client.getRegisteredDevices(userId: userId);
    
    return completer.future.timeout(Duration(seconds: 5));
  }
  
  // Remove a device
  Future<void> removeDevice(String deviceId) async {
    await client.unregisterFCMToken(
      userId: userId,
      deviceId: deviceId,
    );
    print('✅ Device removed: $deviceId');
  }
}

class Device {
  final String deviceId;
  final String platform;
  final DateTime createdAt;
  final DateTime updatedAt;
  
  Device({
    required this.deviceId,
    required this.platform,
    required this.createdAt,
    required this.updatedAt,
  });
  
  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      deviceId: json['deviceId'],
      platform: json['platform'],
      createdAt: DateTime.fromMillisecondsSinceEpoch(json['createdAt']),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(json['updatedAt']),
    );
  }
}

// Usage
void main() async {
  final client = FastPort(/* ... */);
  await client.init();
  
  final deviceManager = DeviceManager(client, 'alice');
  
  // List devices
  final devices = await deviceManager.getDevices();
  for (var device in devices) {
    print('${device.platform}: ${device.deviceId}');
    print('  Registered: ${device.createdAt}');
  }
  
  // Remove old device
  await deviceManager.removeDevice('old_device_id');
}
```

---

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

### 4. Handle FCM Tokens Securely

- Never log FCM tokens
- Always encrypt before sending to server
- Unregister tokens on logout
- Rotate tokens periodically

---

## 🔧 Advanced Features

### Auto-Reconnection

The client automatically reconnects on connection loss:

```dart
// Automatic features:
// - Reconnects after 2 seconds
// - Resubscribes to all topics
// - Retries pending messages
// - Maintains message order

// No configuration needed - works automatically!
```

### Message Retry Mechanism

Messages are automatically retried until acknowledged:

```dart
final client = FastPort(
  serverUrl: 'ws://localhost:3000',
  sessionName: 'my_session',
  password: 'password',
  aesKey: 'key',
  retryInterval: 5000,  // Retry every 5 seconds
  maxRetries: 100,      // Max 100 attempts
);

// If message fails:
// 1. Waits 5 seconds
// 2. Retries sending
// 3. Repeats up to 100 times
// 4. Throws error if all retries fail
```

### Multiple Callbacks Per Topic

You can register multiple callbacks for the same topic:

```dart
// Callback 1: Log messages
client.get('chat/room1', (msg, ts) {
  print('LOG: $msg');
});

// Callback 2: Update UI
client.get('chat/room1', (msg, ts) {
  updateUI(msg);
});

// Callback 3: Save to database
client.get('chat/room1', (msg, ts) {
  saveToDatabase(msg);
});

// All three callbacks will be called for each message!
```

### Unsubscribe Specific Callback

```dart
void myCallback(String msg, int ts) {
  print(msg);
}

client.get('chat/room1', myCallback);

// Later, remove only this callback
client.unsubscribe('chat/room1', myCallback);

// Other callbacks for 'chat/room1' still active!
```

---

## 🐛 Troubleshooting

### Connection Timeout

```
Exception: Failed to connect: TimeoutException
```

**Solutions:**
- Verify server is running (`npm start` in server directory)
- Check server URL and port (default: `ws://localhost:3000`)
- Ensure firewall allows WebSocket connections
- Check network connectivity

### Authentication Failed

```
Exception: Init failed: Invalid credentials
```

**Solutions:**
- Verify session exists (create it first via API)
- Check `sessionName` and `password` match exactly
- Ensure `aesKey` matches the session's secret key
- Check for typos in credentials

### Hash Verification Failed

```
Hash verification failed for message <id>
```

**Solutions:**
- Ensure sender and receiver use the same `aesKey`
- Check that session secret key hasn't changed
- Verify no man-in-the-middle attack

### File Transfer Issues

**File receives 0 bytes:**
- Ensure both sender and receiver are connected
- Wait 1-2 seconds after subscribing before sending
- Check server logs for binary frame errors
- Verify file exists at specified path

**File transfer slow:**
- Check network bandwidth
- Reduce chunk size if needed
- Ensure server has sufficient resources

### FCM Token Registration Failed

```
[FCM] Token registration failed: <error>
```

**Solutions:**
- Verify FCM is enabled on server session
- Check Firebase configuration on server
- Ensure FCM token is valid (not expired)
- Verify device ID is unique
- Check network connectivity

### Push Notifications Not Received

**Checklist:**
- ✅ FCM token registered successfully
- ✅ User is offline (online users don't get push)
- ✅ Firebase project configured correctly
- ✅ Server has valid Firebase credentials
- ✅ Device has notification permissions
- ✅ App is in background/closed

---

## 📚 Additional Resources

- **Server Documentation**: [fastPort Server Docs](https://github.com/fastport/fastport/tree/main/docs)
- **API Reference**: [API.md](https://github.com/fastport/fastport/blob/main/docs/API.md)
- **Technical Guide**: [technical_documentation.md](https://github.com/fastport/fastport/blob/main/docs/technical_documentation.md)
- **FCM Setup Guide**: [FCM_IMPLEMENTATION_ANALYSIS.md](https://github.com/fastport/fastport/blob/main/FCM_IMPLEMENTATION_ANALYSIS.md)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](https://github.com/fastport/fastport/blob/main/CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/fastport/fastport/issues)
- **Discussions**: [GitHub Discussions](https://github.com/fastport/fastport/discussions)

---

**Made with ❤️ for secure, real-time communication**

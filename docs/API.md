# fastPort API Documentation

## Server REST API

### Create Session

Creates a new isolated session (virtual broker).

**Endpoint:** `POST /api/createSession`

**Request Body:**
```json
{
  "sessionName": "string (required)",
  "password": "string (required)",
  "retryInterval": "number (optional, default: 5000ms)",
  "maxRetryLimit": "number (optional, default: 100)",
  "messageExpiryTime": "number (optional, default: null)",
  "sessionExpiry": "number (optional, default: null)"
}
```

**Response:**
```json
{
  "success": true,
  "sessionName": "string",
  "password": "string",
  "secretKey": "string"
}
```

### Drop Session

Permanently deletes a session and all its data.

**Endpoint:** `POST /api/dropSession`

**Request Body:**
```json
{
  "sessionName": "string",
  "password": "string",
  "secretKey": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

### Suspend/Unsuspend Session

Temporarily suspends or resumes a session.

**Endpoint:** `POST /api/suspendSession`

**Request Body:**
```json
{
  "sessionName": "string",
  "password": "string",
  "secretKey": "string",
  "suspend": true/false
}
```

**Response:**
```json
{
  "success": true,
  "suspended": true/false
}
```

## WebSocket Protocol

### Client → Server Messages

#### Init
```json
{
  "type": "init",
  "sessionName": "string",
  "password": "string"
}
```

#### Subscribe
```json
{
  "type": "subscribe",
  "topic": "string"
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "topic": "string"
}
```

#### Publish
```json
{
  "type": "publish",
  "topic": "string",
  "data": "encrypted-string",
  "hash": "sha256-hash",
  "timestamp": 1234567890,
  "messageId": "uuid"
}
```

#### ACK
```json
{
  "type": "ack",
  "topic": "string",
  "messageId": "uuid"
}
```

### Server → Client Messages

#### Init Response
```json
{
  "type": "init_response",
  "success": true/false,
  "sessionName": "string",
  "error": "string (if failed)"
}
```

#### Message
```json
{
  "type": "message",
  "topic": "string",
  "data": "encrypted-string",
  "hash": "sha256-hash",
  "timestamp": 1234567890,
  "messageId": "uuid",
  "retry": 0
}
```

#### ACK Received
```json
{
  "type": "ack_received",
  "messageId": "uuid",
  "topic": "string"
}
```

## Dart Client API

### Constructor

```dart
FastPort({
  required String serverUrl,
  required String sessionName,
  required String password,
  required String aesKey,
  int retryInterval = 5000,
  int maxRetries = 100,
})
```

### Methods

#### init()
```dart
Future<void> init()
```
Connects to server and authenticates the session.

#### emit()
```dart
Future<void> emit(String topic, String message)
```
Publishes an encrypted message to a topic.

#### get()
```dart
void get(String topic, MessageCallback callback)
```
Subscribes to a topic and registers a callback.

**Callback signature:**
```dart
typedef MessageCallback = void Function(String message, int timestamp);
```

#### unsubscribe()
```dart
void unsubscribe(String topic, [MessageCallback? callback])
```
Unsubscribes from a topic.

#### close()
```dart
void close()
```
Closes the connection and cleans up resources.

## Message Flow

### Publishing

1. Client encrypts message with AES
2. Client generates SHA256 hash
3. Client sends to server with messageId
4. Server caches message
5. Server forwards to all subscribers
6. Subscribers verify hash and decrypt
7. Subscribers send ACK
8. Server removes from cache on ACK
9. Server retries if no ACK received

### Subscribing

1. Client sends subscribe request
2. Server adds client to topic subscribers
3. Client receives encrypted messages
4. Client verifies hash
5. Client decrypts message
6. Client sends ACK
7. Client calls user callback

## Security

- All messages are encrypted end-to-end with AES-256-CBC
- Server never sees plaintext
- SHA256 ensures message integrity
- Session password required for authentication
- Secret key required for admin operations
- Each session is completely isolated

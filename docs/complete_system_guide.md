# fastPort Complete System Guide

This document provides a detailed technical summary of the `fastPort` project, covering both the Server (Node.js) and Client (Dart) implementations.

## 1. System Overview

**fastPort** is a secure, session-isolated, real-time message broker designed for high-stakes communication where data privacy and delivery guarantees are essential. It replaces traditional brokers (like MQTT) with a lightweight, multi-tenant solution that runs completely over WebSockets.

| Feature | Description |
| :--- | :--- |
| **Protocol** | Custom JSON-based protocol over WebSocket (`ws://`) |
| **Security** | AES-256-CBC End-to-End Encryption (E2EE) + SHA256 Integrity |
| **Reliability** | ACK-based guaranteed delivery with automatic retries |
| **Isolation** | Virtual brokers ("Sessions") completely separated by memory space |

---

## 2. Server-Side Architecture (Node.js)

The server acts as a "blind relay". It routes encrypted packets without ever being able to read them.

### Core Components

1.  **Session Manager (`sessionManager.js`)**
    -   **Multi-Tenancy**: Maintains a `Map<SessionName, SessionObject>` in memory.
    -   **Authentication**: Validates `sessionName` + `password` on client connection.
    -   **Routing Table**: Tracks subscribers per session: `Map<SessionName, Map<Topic, List<WebSocket>>>`.
    -   **Isolation**: A message sent to topic `T` in Session `A` is *only* routed to subscribers of `T` in Session `A`.

2.  **Message Cache (`messageCache.js`)**
    -   **Reliability Layer**: Stores every published message until an ACK is received.
    -   **Retry Loop**: Periodically re-sends messages to subscribers who haven't ACKed.
    -   **Expiry**: Automatically drops messages after `maxRetryLimit` or `messageExpiryTime`.

3.  **WebSocket Handler (`wsHandler.js`)**
    -   Handles raw socket events (`connection`, `message`, `close`).
    -   Parses the custom JSON protocol (types: `init`, `publish`, `subscribe`, `ack`).

### Server Message Flow
1.  **Receive**: Client sends encrypted payload.
2.  **Validate**: Server checks if sender is authorized in the session.
3.  **Route**: Server looks up active subscribers for the topic.
4.  **Cache**: Message is stored in RAM with a `pendingAck` status.
5.  **Forward**: Message is pushed to subscribers.
6.  **Wait**: Server waits for `type: 'ack'` from subscribers.
7.  **Cleanup**: On ACK, message is removed from cache.

---

## 3. Client-Side Architecture (Dart)

The client package (`fastport_client`) provides a robust, easy-to-use API that handles all encryption and reliability logic transparently.

### Core Class: `FastPort` (`fastport.dart`)
This is the main entry point for developers.

-   **State Machine**:
    -   `init()`: Establishes WebSocket connection and performs the `init` handshake.
    -   `_reconnect()`: automatically attempts to reconnect if the socket drops, including **re-subscribing** to all previous topics.
-   **Reliability**:
    -   **Outgoing**: `emit()` keeps a local retry timer. If the server doesn't ACK the publish, the client retries (up to 100 times by default).
    -   **Incoming**: On receiving a message, it *immediately* sends an ACK back to the server to stop the server's retry loop.

### Security Module: `CryptoUtils` (`crypto_utils.dart`)
The client handles 100% of the cryptographic operations using `pointycastle`.

-   **Encryption (AES-256-CBC)**:
    -   Generates a random 16-byte **IV** (Initialization Vector) for *every* message.
    -   Encrypts payload using the shared `aesKey`.
    -   Format: `base64(IV):base64(Ciphertext)`.
-   **Integrity (SHA256)**:
    -   Generates a hash of the encrypted string.
    -   Sends `{ hash: "..." }` along with data.
    -   Receiver recalculates hash to ensure data wasn't tampered with in transit.

### Usage Pattern
The client is designed to be "set and forget".

```dart
// 1. Initialize
final client = FastPort(
  serverUrl: 'ws://...',
  sessionName: 'my-device-fleet',
  password: 'secret-password',
  aesKey: 'shared-aes-key-32-bytes...',
);
await client.init();

// 2. Subscribe (Automatic decryption)
client.get('sensors/temp', (message, timestamp) {
  print('Decrypted message: $message'); // "24.5C"
});

// 3. Publish (Automatic encryption + Retry)
await client.emit('sensors/temp', '24.5C');
```

---

## 4. Why This Architecture?

1.  **Security**: By moving encryption to the edges (Clients), the Server becomes a "zero-knowledge" component. Even if the server is compromised, the data remains unreadable without the client-side AES keys.
2.  **Reliability**: The double-retry mechanism (Client retries publish, Server retries push) ensures high delivery success rates even on flaky mobile networks.
3.  **Simplicity**: Users don't need to manage certificates or complex broker configurations. It's just a simple 3-step handshake.

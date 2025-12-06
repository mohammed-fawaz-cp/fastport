# fastPort Architecture

## Overview

fastPort is a multi-session publish-subscribe broker system that provides MQTT-like functionality with enhanced security and session isolation.

## Core Concepts

### Sessions (Virtual Brokers)

Each session acts as an independent virtual broker:
- Isolated message routing
- Independent configuration (retry, expiry, limits)
- Separate authentication
- No cross-session message leakage

### Topics

Dynamic, MQTT-style topic strings:
- No pre-registration required
- Created on-demand when first subscriber connects
- Cleaned up when last subscriber disconnects
- Support hierarchical naming (e.g., `sensors/temperature/room1`)

### Message Flow

```
Publisher → Encrypt → Server → Cache → Forward → Subscribers
                                ↓
                            Retry Logic
                                ↓
                            ACK ← Decrypt ← Verify Hash
```

## Components

### Server (Node.js)

**SessionManager**
- Creates/drops/suspends sessions
- Validates credentials
- Manages subscriber lists per session/topic
- Enforces session isolation

**MessageCache**
- Stores unacknowledged messages
- Manages retry timers
- Handles message expiry
- Cleans up on ACK or timeout

**WebSocket Handler**
- Routes messages between clients
- Manages client lifecycle
- Handles reconnection
- Forwards encrypted payloads

### Client (Dart)

**FastPort Class**
- Connection management
- Auto-reconnect with subscription recovery
- Client-side retry logic
- Encryption/decryption
- Hash verification

**CryptoUtils**
- AES-256-CBC encryption
- SHA256 hashing
- Key management

## Security Model

### End-to-End Encryption

```
Client A                Server                Client B
   |                      |                      |
   |-- Encrypt(msg) ----->|                      |
   |                      |-- Forward(cipher) -->|
   |                      |                      |-- Decrypt(cipher)
   |                      |<----- ACK -----------|
   |<---- ACK ------------|                      |
```

- Server never sees plaintext
- AES key shared only between clients
- SHA256 ensures integrity
- No man-in-the-middle decryption possible

### Authentication Layers

1. **Session Password**: Required for client connection
2. **Secret Key**: Required for admin operations (drop/suspend)
3. **AES Key**: Required for message encryption/decryption

## Reliability Features

### Server-Side Retry

- Caches messages until ACK received
- Retries based on `retryInterval`
- Stops after `maxRetryLimit` or expiry
- Automatic cleanup on success

### Client-Side Retry

- Independent retry mechanism
- Handles network failures
- Configurable retry count
- Complements server retry

### Message Expiry

- Optional time-to-live per session
- Prevents infinite retry of stale messages
- Automatic cache cleanup

### Auto-Reconnect

- Detects disconnection
- Automatic reconnection with backoff
- Re-subscribes to all topics
- Transparent to application code

## Scalability

### In-Memory Design

- Fast message routing
- Low latency
- Suitable for real-time applications
- Optional Redis integration for persistence

### Session Isolation

- Each session is independent
- No cross-session interference
- Horizontal scaling possible by session

### Resource Management

- Automatic cleanup of closed connections
- Timer management for retries
- Memory-efficient caching

## Use Cases

1. **IoT Device Communication**
   - Sensors publishing data
   - Controllers subscribing to commands
   - Isolated per deployment/customer

2. **Real-Time Notifications**
   - User-specific notification channels
   - Guaranteed delivery with retry
   - End-to-end encryption

3. **Microservice Messaging**
   - Service-to-service communication
   - Topic-based routing
   - Session per environment (dev/staging/prod)

4. **Chat Applications**
   - Room-based messaging
   - Private encrypted channels
   - Presence detection

## Performance Characteristics

- **Latency**: < 10ms for local network
- **Throughput**: Thousands of messages/second per session
- **Connections**: Limited by system resources
- **Message Size**: Configurable, typically < 1MB

## Limitations

- In-memory only (no persistence by default)
- Single server (no built-in clustering)
- No message ordering guarantees across topics
- No transaction support

## Future Enhancements

- Redis persistence layer
- Clustering support
- Message ordering guarantees
- Quality of Service (QoS) levels
- Wildcard topic subscriptions
- Retained messages
- Last Will and Testament (LWT)

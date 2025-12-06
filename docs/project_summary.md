# fastPort Project Summary

## Overview
**fastPort** is a secure, scalable, multi-session publish-subscribe communication system. It functions as a custom message broker, conceptually similar to MQTT, but with a strong emphasis on **session isolation** and **end-to-end encryption**.

It allows multiple distinct "virtual brokers" (sessions) to coexist on a single server instance, ensuring that messages execution in one session do not leak into another.

## Key Features

1.  **Multi-Session Isolation**:
    -   Each session acts as an independent world with its own configuration (passwords, retry limits, expiry times).
    -   Subscribers are tracked per session and topic, preventing cross-session data leakage.
    -   Ideal for multi-tenant applications (e.g., `Agency A` has a session, `Agency B` has another).

2.  **End-to-End Encryption**:
    -   Payloads are encrypted **client-side** using AES-256-CBC before being sent to the server.
    -   The server **never** holds the decryption keys and cannot see the message content.
    -   It only forwards encrypted blobs (ciphertext) to verified subscribers.

3.  **Reliability**:
    -   **Guaranteed Delivery**: The server caches messages and retries delivery until it receives an acknowledgment (ACK) from the subscriber.
    -   **Auto-Reconnect**: Clients are designed to automatically reconnect and recover subscriptions if the connection drops.

4.  **No External Database**:
    -   The current implementation is primarily in-memory (using `Map` structures in `SessionManager`), making it fast but non-persistent across server restarts.

## Technology Stack

### Server
-   **Runtime**: [Node.js](https://nodejs.org/)
-   **Web Framework**: [Express](https://expressjs.com/) (Handles HTTP APIs for session management)
-   **WebSocket Library**: [ws](https://www.npmjs.com/package/ws) (Handles real-time message routing)

### Client
-   **Language**: [Dart](https://dart.dev/)
-   **Encryption**: `pointycastle` (for AES and Hashing)

## Architecture Deep Dive

### Core Components (`src/`)
-   **`server.js`**: The entry point. Sets up the Express app and the WebSocket server. Exposes HTTP endpoints like `/api/createSession`.
-   **`sessionManager.js`**: The "brain" of the isolation.
    -   Stores sessions in a `Map`.
    -   Manages `activeSubscribers` as `activeSubscribers[sessionName][topic]`.
    -   Handles authentication (password checks) and admin actions (suspend/drop session).
-   **`messageCache.js`**: Responsible for reliability. It holds sent messages and manages the retry loops until ACKs are received.
-   **`wsHandler.js`**: Bridges the WebSocket connection events (open, message, close) with the `SessionManager` and `MessageCache`.

### Message Flow
1.  **Publisher** encrypts data -> Sends to Server via WebSocket.
2.  **Server** authenticates the publisher's session.
3.  **Server** looks up subscribers for that `session + topic`.
4.  **Server** stores the message in `MessageCache` (for retry safety).
5.  **Server** forwards the *encrypted* message to subscribers.
6.  **Subscriber** receives -> Decrypts -> Verifies Hash -> Sends **ACK**.
7.  **Server** receives ACK -> Removes message from `MessageCache`.

## Potential Use Cases
-   **IoT**: Secure command and control for devices where the server implies no trust.
-   **Private Chat**: Real-time messaging where privacy is paramount.
-   **Microservices**: Lightweight, isolated signaling between services without setting up a full RabbitMQ/Kafka cluster.

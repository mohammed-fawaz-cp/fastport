# FastPort Failure Analysis & Resilience Design

## System Flow (Current)

1.  **Connection**: Client connects -> `wsHandler` -> `SessionManager` (Validate).
2.  **Publish**:
    *   Client sends `publish` payload.
    *   `wsHandler` receives.
    *   `wsHandler` checks Auth.
    *   **Critical Path**: `await messageCache.cacheMessage()` (Persist to DB/Memory).
    *   `wsHandler` retrieves subscribers (In-Memory).
    *   `wsHandler` iterates and sends to subscribers (`ws.send`).
    *   `wsHandler` schedules Retry (Async).
3.  **Subscribe**: Client sends `subscribe` -> Added to `activeSubscribers` (In-Memory).
4.  **Delivery**: Subscriber receives message -> Sends `ack`.
5.  **Ack**: `wsHandler` receives `ack` -> `messageCache.removeMessage()`.

## Failure Modes & Effects Analysis (FMEA)

### 1. Storage Failure / Latency (High Risk)
*   **Failure**: Database is down, slow, or unreachable.
*   **Current Effect**: `await messageCache.cacheMessage()` throws or hangs.
    *   **Result**: `handlePublish` aborts. **Message is NOT delivered to online subscribers.**
    *   **Impact**: Storage outage causes total service outage for real-time messaging.
*   **Design Fix**: **Optimistic Delivery / Decoupling**.
    *   Deliver to online subscribers *immediately* (in parallel or before caching).
    *   Cache in background (fire-and-forget or async await with catch).
    *   If Caching fails: Log error, notify publisher (optional), but *keep real-time flow alive*.

### 2. Subscriber Disconnect / Flakiness (Medium Risk)
*   **Failure**: Subscriber disconnects during `forEach` loop or `ws.send` fails.
*   **Current Effect**: `ws.send` is fire-and-forget (mostly). Logic continues.
*   **Risk**: If `forEach` throws (e.g. invalid object), subsequent subscribers don't get message.
*   **Design Fix**: Wrap each `subscriber.send` in `try/catch`. Ensure isolation.

### 3. Server Crash / Restart (High Risk)
*   **Failure**: Node.js process dies.
*   **Current Effect**:
    *   `activeSubscribers` (In-Memory) is **Wiped**.
    *   `MemoryStore` is **Wiped**. `PostgresStore` data persists.
*   **Recovery**:
    *   Clients must reconnect and **Re-subscribe**.
    *   Pending messages in `PostgresStore` need to be "Re-hydrated" or picked up by a clean-up job?
    *   **Gap**: Currently, `MessageCache` loads from DB only on *demand* or *retry*. On restart, the *Retry Timers* are lost.
    *   **Impact**: Messages stored in DB but not delivered before crash might sit in DB forever (Zombie messages) until someone calls `getPendingMessages` (not yet automated).
*   **Design Fix**: implement `MessageCache.hydrate()` on startup to load pending messages from DB and restart timers.

### 4. Port/Resource Exhaustion (Operational Risk)
*   **Failure**: `EADDRINUSE`.
*   **Current Effect**: Server fails to start.
*   **Design Fix**: robust startup script checking ports or dynamic port assignment.

## Design Improvements (Immediate Actions)

1.  **Decouple Delivery from Storage**: Move `cacheMessage` to be non-blocking or parallel to delivery to ensure high availability.
2.  **Safeguard Delivery Loop**: Robust error handling in subscriber loop.
3.  **Hydration**: (Phase 2) Auto-load pending messages on startup.
4.  **Test Reliability**: Use dynamic ports for testing to avoid conflict.


# fastPort API and Admin Guide

This guide explains how to manage sessions (virtual brokers) in **fastPort**. Since `fastPort` is multi-tenant by design, the concept of a "Service" maps to a **Session**.

## 1. Creating a Service (Session)

To start using fastPort, you first need to create a Session. This acts as your private broker instance.

**Endpoint**: `POST /api/createSession`

### Request Body
```json
{
  "sessionName": "my-service-prod",      // Unique identifier for your session
  "password": "secure-password-123",     // Used by CLIENTS to connect
  "retryInterval": 5000,                 // (Optional) Server retry delay in ms (default: 5000)
  "maxRetryLimit": 100,                  // (Optional) Max retries before dropping msg (default: 100)
  "messageExpiryTime": 3600000,          // (Optional) Msg TTL in ms (default: null/infinite)
  "sessionExpiry": null                  // (Optional) Session auto-cleanup time (default: null)
}
```

### Response (Success)
The server returns a **Secret Key**. You must save this key! It is required for administrative actions (suspending or deleting the session).

```json
{
  "success": true,
  "sessionName": "my-service-prod",
  "password": "secure-password-123",
  "secretKey": "a1b2c3d4..." // <--- IMPORTANT: SAVE THIS
}
```

## 2. Managing Your Service

Once a session is active, you can manage it using the administrative endpoints. These require the `secretKey` returned during creation.

### Suspend a Session
Temporarily block all authentication and message routing for a session.

**Endpoint**: `POST /api/suspendSession`

```json
{
  "sessionName": "my-service-prod",
  "password": "secure-password-123",
  "secretKey": "a1b2c3d4...",
  "suspend": true  // Set to false to unsuspend
}
```

### Delete (Drop) a Session
Permanently remove a session and disconnect all clients.

**Endpoint**: `POST /api/dropSession`

```json
{
  "sessionName": "my-service-prod",
  "password": "secure-password-123",
  "secretKey": "a1b2c3d4..."
}
```

## 3. Connecting Clients (User Flow)

After creating a session via the API, you configure your clients (Dart apps, IoT devices) to connect to it.

1.  **Distribute Credentials**: Provide the `sessionName` and `password` to your client application configuration.
2.  **Generate AES Key**: Run `node utils/generate_key.js` locally to create an AES-256 key.
3.  **Configure Client**:
    *   **Server URL**: `ws://<your-server-ip>:3000`
    *   **Session Name**: `my-service-prod`
    *   **Password**: `secure-password-123`
    *   **AES Key**: (The key you generated in step 2 - shared among trusted clients)

The clients will now auto-negotiate with the server. The server verifies the `sessionName` and `password`. If valid, the client joins the isolated "virtual broker".

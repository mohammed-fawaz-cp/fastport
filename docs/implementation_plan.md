# Implementation Plan - Phase 1: Optional PostgreSQL Integration & Resilience (COMPLETED)
# [Previous Sections Omitted for Brevity]

# Phase 8: Binary Protocol & Optimization (Binary + E2EE Fix)

## Goal
Optimize file transfer efficiency by 33% (using raw binary instead of Base64) and fix the Critical Security Flaw (Encryption Gap).

## User Review Required
> [!WARNING]
> **Breaking Change**: This update changes the WebSocket protocol. Old clients will **not** be compatible with the new server format for file transfers.
> **Security Fix**: File chunks will now be fully encrypted (AES-256-CBC) before transmission.

## Proposed Changes

### 1. Protocol Design (Hybrid)
- **Text Frames (JSON)**: `init`, `subscribe`, `ack`, `end_file`, `init_file` metadata.
- **Binary Frames (Raw Bytes)**: Used **ONLY** for file chunks.
    - **Header**: 1 byte (`0x02` = Chunk).
    - **File ID**: 36 bytes (UUID String) or 16 bytes (Raw UUID)? -> Use **36 bytes** (UUID String) for simplicity/compatibility with JS UUID libs, unless we parse UUID to bytes. Let's stick to 36 bytes for now to avoid parsing complexity (UUID is standard string usually).
    - **Chunk Index**: 4 bytes (UInt32BE)? Or assume ordered? Let's add 4-byte index for resilience.
    - **Payload**: Encrypted Bytes.

    **Frame Structure**:
    `[TYPE: 1B] [FILE_ID: 36B (ASCII)] [INDEX: 4B] [PAYLOAD: N Bytes]`

### 2. Client Updates (`dart_client`)
- **`CryptoUtils.dart`**:
    - Add `Uint8List encryptBytes(Uint8List data)`
    - Add `Uint8List decryptBytes(Uint8List encryptedData)`
- **`fastport.dart`**:
    - `sendFile`: Read file -> Encrypt Chunk -> Construct Binary Frame -> Send.
    - `listen`: Detect `List<int>` -> Parse Header -> Decrypt Payload -> append to file.

### 3. Server Updates (`wsHandler.js`)
- **`handleWebSocketConnection`**:
    - Detect `Buffer` or `ArrayBuffer`.
    - `message` event handler needs to split logic:
        - If String: JSON Parse -> Handle Control Messages.
        - If Buffer: Parse Header -> Forward to Subscribers (as Binary).

## Verification Plan
### Automated Tests
- **E2E Test**: Run `tests/e2e_test.dart` (updated for binary).
- **Correctness**: Validate SHA256 of transferred file.

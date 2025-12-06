# fastPort Project Structure

```
fastPort/
├── src/                          # Server source code
│   ├── server.js                 # Main server entry point
│   ├── sessionManager.js         # Session lifecycle management
│   ├── messageCache.js           # Message caching and retry logic
│   └── wsHandler.js              # WebSocket message handling
│
├── dart_client/                  # Dart client package
│   ├── lib/
│   │   ├── fastport_client.dart  # Package exports
│   │   └── src/
│   │       ├── fastport.dart     # Main client class
│   │       ├── crypto_utils.dart # Encryption utilities
│   │       └── key_generator.dart # AES key generation
│   ├── example/
│   │   ├── sender_example.dart   # Example sender
│   │   └── receiver_example.dart # Example receiver
│   ├── pubspec.yaml              # Dart dependencies
│   └── README.md                 # Client documentation
│
├── examples/                     # Example implementations
│   ├── node_client_example.js    # Node.js client
│   └── create_session.js         # Session creation example
│
├── utils/                        # Utility scripts
│   ├── generate_key.js           # AES key generator
│   └── test_session.js           # Session testing script
│
├── docs/                         # Documentation
│   └── API.md                    # Complete API reference
│
├── package.json                  # Node.js dependencies
├── README.md                     # Project overview
├── QUICKSTART.md                 # Getting started guide
├── ARCHITECTURE.md               # System architecture
└── PROJECT_STRUCTURE.md          # This file
```

## Key Files

### Server Components

**server.js**
- Express HTTP server for REST API
- WebSocket server initialization
- Session management endpoints
- Main entry point

**sessionManager.js**
- Session CRUD operations
- Authentication and validation
- Subscriber management
- Session isolation enforcement

**messageCache.js**
- Message storage and retrieval
- Retry timer management
- Expiry handling
- Cache cleanup

**wsHandler.js**
- WebSocket connection lifecycle
- Message routing
- Protocol implementation
- Client state management

### Client Components

**fastport.dart**
- Main client API
- Connection management
- Auto-reconnect logic
- Subscription handling
- Message encryption/decryption

**crypto_utils.dart**
- AES-256-CBC encryption
- SHA256 hashing
- Key validation

**key_generator.dart**
- Secure key generation
- Key validation utilities

## Dependencies

### Server (Node.js)
- `express`: HTTP server and REST API
- `ws`: WebSocket implementation
- `uuid`: Message ID generation

### Client (Dart)
- `web_socket_channel`: WebSocket client
- `crypto`: SHA256 hashing
- `uuid`: Message ID generation
- `pointycastle`: AES encryption

## Configuration

### Server
- Port: 3000 (default, configurable via PORT env var)
- No external configuration files needed
- All settings per-session via API

### Client
- Server URL: Configurable in constructor
- Session credentials: Passed to init()
- Retry settings: Configurable in constructor

## Development

### Running the Server
```bash
npm install
npm start
```

### Running Examples
```bash
# Node.js examples
node examples/create_session.js
node examples/node_client_example.js

# Dart examples
cd dart_client
dart pub get
dart run example/sender_example.dart
dart run example/receiver_example.dart
```

### Testing
```bash
# Test session creation
node utils/test_session.js

# Generate AES key
node utils/generate_key.js
```

## Deployment

### Server
- Single Node.js process
- Can run behind reverse proxy (nginx, etc.)
- Supports clustering via external load balancer
- No database required (in-memory)

### Client
- Dart package can be published to pub.dev
- Can be used in Flutter apps
- Can be used in Dart CLI tools
- Can be used in Dart web apps

## Extension Points

### Server
- Add Redis for persistence (messageCache.js)
- Add authentication middleware (server.js)
- Add rate limiting (wsHandler.js)
- Add metrics/monitoring (all files)

### Client
- Add offline queue (fastport.dart)
- Add message compression (crypto_utils.dart)
- Add custom serialization (fastport.dart)
- Add connection pooling (fastport.dart)

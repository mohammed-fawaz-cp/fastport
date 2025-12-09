import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import SessionManager from './sessionManager.js';
import MessageCache from './messageCache.js';
import FCMService from './fcmService.js';
import { handleWebSocketConnection } from './wsHandler.js';
import MemoryStore from './storage/MemoryStore.js';
import SQLStore from './storage/SQLStore.js';

const app = express();
const server = createServer(app);

// Security: WebSocket Payload Limit (configurable via MAX_PAYLOAD_SIZE)
// Protects against OOM Denial of Service
const maxPayloadSize = parseInt(process.env.MAX_PAYLOAD_SIZE) || (10 * 1024 * 1024);
const wss = new WebSocketServer({ 
  server,
  maxPayload: maxPayloadSize
});

// Security: API Rate Limiting (configurable via API_RATE_LIMIT)
const apiRateLimit = parseInt(process.env.API_RATE_LIMIT) || 100;
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: apiRateLimit,
	standardHeaders: true, 
	legacyHeaders: false,
});
app.use('/api/', limiter);

// HTTP JSON body limit (matches WebSocket payload size)
const jsonLimit = Math.floor(maxPayloadSize / (1024 * 1024)) + 'mb';
app.use(express.json({ limit: jsonLimit }));

// CORS Configuration (if CORS_ORIGINS is set)
if (process.env.CORS_ORIGINS) {
  const allowedOrigins = process.env.CORS_ORIGINS.split(',').map(o => o.trim());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    next();
  });
}

// Request Logging (if enabled)
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// Async startup wrapper
async function startServer() {
  let sessionManager;
  let storageProvider;
  const dbType = process.env.DB_TYPE || 'memory';

  // --- Web Admin Portal ---
  // --- Web Admin Portal ---
  if (process.env.ENABLE_WEB_PORTAL === 'true') {
     console.log('Admin Portal Enabled at /admin');
     // Serve Global Assets (like logo.svg)
     app.use(express.static('public'));
     
     app.use('/admin', express.static('public/admin'));

  // --- Test Portal (Playground) ---
  if (process.env.ENABLE_TEST_PORTAL === 'true') {
     console.log('Test Portal Enabled at /test');
     app.use('/test', express.static('public/test'));
  }


     // Simple Stats API
     app.get('/api/admin/stats', (req, res) => {
        // Basic Auth Check
        const auth = req.headers.authorization;
        const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString().split(':');
        // TODO: Move credentials check to shared helper or use proper middleware
        if (!auth || creds[0] !== process.env.ADMIN_USER || creds[1] !== process.env.ADMIN_PASS) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        // Removed spammy console log
        
        res.json({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connections: wss.clients.size,
            dbType
        });
     });
     
     // Login Validation Endpoint
     app.post('/api/admin/login', (req, res) => {
        const { username, password } = req.body;
        if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
             // Return a dummy token (in real app usage JWT)
             // For this simple version, client stores Basic Auth header value.
             const token = Buffer.from(`${username}:${password}`).toString('base64');
             res.json({ success: true, token });
        } else {
             res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
     });

     // List Sessions Endpoint
     app.get('/api/admin/sessions', async (req, res) => {
        // Basic Auth Check
        const auth = req.headers.authorization;
        const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString().split(':');
        
        if (!auth || creds[0] !== process.env.ADMIN_USER || creds[1] !== process.env.ADMIN_PASS) {
             return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const sessions = await sessionManager.getAllSessions();
            res.json({ success: true, sessions });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
     });

  }

  // --- Log Streaming (Monkey Patch console.log) ---
  const originalLog = console.log;
  const SYSTEM_LOG = process.env.SYSTEM_LOG === 'true'; // Default false
  
  if (process.env.DEBUG === 'true') {
      originalLog.call(console, '[DEBUG] Log Streaming Initialized. System Log:', SYSTEM_LOG);
  }

  console.log = (...args) => {
    originalLog.apply(console, args);
    
    // Broadcast to Admin Subscribers via 'admin_session' or specific session
    if (process.env.ENABLE_WEB_PORTAL === 'true' && sessionManager) {
        try {
            // Format log
            const logMsg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
            
            // 1. Check for Session Tag [Session:S1]
            const sessionMatch = logMsg.match(/\[Session:([^\]]+)\]/);
            
            if (sessionMatch && sessionMatch[1]) {
                // Route to Specific Session
                const targetSession = sessionMatch[1];
                sessionManager.publishLog(targetSession, logMsg);
            } else {
                // 2. Global System Log
                if (SYSTEM_LOG) {
                    sessionManager.publishLog('admin_session', logMsg);
                }
            }
        } catch (e) {
            // Ignore log errors to prevent loop
        }
    }
  };
  

  // Initialize Storage
  



  // Initialize Storage
  if (dbType === 'postgres') {
    const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/fastport';
    storageProvider = new SQLStore({ dialect: 'postgres', url: dbUrl });
    console.log('Using PostgreSQL Storage');
  } else if (dbType === 'sqlite') {
    const dbPath = process.env.SQLITE_PATH || process.env.DB_PATH; // SQLite database path
    storageProvider = new SQLStore({ dialect: 'sqlite', storage: dbPath });
     console.log('Using SQLite Storage (Ephemeral/Persisted)');
  } else {
    storageProvider = new MemoryStore();
    console.log('Using In-Memory Storage (Default)');
  }

  await storageProvider.init();

  sessionManager = new SessionManager(storageProvider);
  const messageCache = new MessageCache(storageProvider);
  const fcmService = new FCMService(sessionManager);

  // Create Admin Session Logic (After sessionManager init)
  if (process.env.ENABLE_WEB_PORTAL === 'true') {
      try {
          await sessionManager.createSession({
              sessionName: 'admin_session',
              password: process.env.ADMIN_PASS || 'admin',
              secretKey: 'sys_admin_key',
              sessionExpiry: null
          });
          console.log('Admin Session initialized.');
      } catch (e) {
          console.log('Admin Session Status:', e.message);
      }
  }

  // Background Cleanup Job (Ephemeral Logic)
  // Configurable via CLEANUP_INTERVAL (default: 60 seconds)
  if (storageProvider.cleanupExpired) {
    const cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL) || 60;
    console.log(`Starting Ephemeral Cleanup Job (${cleanupInterval}s interval)`);
    setInterval(async () => {
      try {
        await storageProvider.cleanupExpired();
      } catch (e) {
        console.error('Cleanup Job Failed:', e);
      }
    }, cleanupInterval * 1000);
  }

  // Middleware for Admin Authentication
  const checkAdminAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing Authorization Header' });
    
    const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString().split(':');
    if (creds[0] !== process.env.ADMIN_USER || creds[1] !== process.env.ADMIN_PASS) {
         return res.status(401).json({ error: 'Unauthorized: Invalid Admin Credentials' });
    }
    next();
  };

  // Session API endpoints
  app.post('/api/createSession', checkAdminAuth, async (req, res) => {
    try {
      const result = await sessionManager.createSession(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/dropSession', checkAdminAuth, async (req, res) => {
    try {
      const result = await sessionManager.dropSession(req.body);
      await messageCache.clearSession(req.body.sessionName);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/suspendSession', checkAdminAuth, async (req, res) => {
    try {
      const result = await sessionManager.suspendSession(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    handleWebSocketConnection(ws, sessionManager, messageCache, fcmService);
  });

  const PORT = process.env.PORT || 3000;
  
  // Debug mode logging
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG] Server configuration:');
    console.log(`  - Port: ${PORT}`);
    console.log(`  - DB Type: ${dbType}`);
    console.log(`  - Max Payload: ${Math.floor(maxPayloadSize / (1024 * 1024))}MB`);
    console.log(`  - API Rate Limit: ${apiRateLimit} req/15min`);
    console.log(`  - Web Portal: ${process.env.ENABLE_WEB_PORTAL === 'true' ? 'Enabled' : 'Disabled'}`);
  }
  
  server.listen(PORT, () => {
    console.log(`fastPort server running on port ${PORT}`);
    if (process.env.DEBUG === 'true') {
      console.log('[DEBUG] Server started successfully');
    }
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

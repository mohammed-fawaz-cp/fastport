import crypto from 'crypto';

class SessionManager {
  constructor(storageProvider) {
    if (!storageProvider) throw new Error('StorageProvider is required');
    this.storage = storageProvider;
    this.activeSubscribers = {}; // This remains in memory as it tracks active connections
    this.userConnections = {}; // sessionName -> { userId -> ws }
  }

  // --- Encryption Helpers ---

  encryptData(data, key) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
      let encrypted = cipher.update(data, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return iv.toString('base64') + ':' + encrypted;
    } catch (error) {
      console.error('[SessionManager] Encryption failed:', error.message);
      throw new Error('Encryption failed');
    }
  }

  decryptData(encryptedData, key) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }
      const iv = Buffer.from(parts[0], 'base64');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('[SessionManager] Decryption failed:', error.message);
      throw new Error('Decryption failed');
    }
  }

  async createSession({ sessionName, password, retryInterval, maxRetryLimit, messageExpiryTime, sessionExpiry, fcmConfig }) {
    if (!sessionName || !password) {
      throw new Error('sessionName and password are required');
    }

    const existing = await this.storage.getSession(sessionName);
    if (existing) {
      throw new Error('Session already exists');
    }

    const secretKey = crypto.randomBytes(32).toString('hex');
    
    const session = {
      sessionName,
      password,
      secretKey,
      retryInterval: retryInterval || 5000,
      maxRetryLimit: maxRetryLimit || 100,
      messageExpiryTime: messageExpiryTime || null,
      sessionExpiry: sessionExpiry || null,
      suspended: false,
      // FCM Configuration (optional)
      fcmProjectId: fcmConfig?.projectId || null,
      fcmPrivateKey: fcmConfig?.privateKey || null, // TODO: Encrypt before storing
      fcmClientEmail: fcmConfig?.clientEmail || null,
      fcmEnabled: fcmConfig?.enabled || false
    };

    // Save to storage
    await this.storage.createSession(session);

    // Initialize in-memory subscriber map
    this.activeSubscribers[sessionName] = {};

    return {
      success: true,
      sessionName,
      password,
      secretKey
    };
  }

  async dropSession({ sessionName, password, secretKey }) {
    const session = await this.storage.getSession(sessionName);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.password !== password || session.secretKey !== secretKey) {
      throw new Error('Invalid credentials');
    }

    // Close all connections (Memory operation)
    if (this.activeSubscribers[sessionName]) {
      Object.values(this.activeSubscribers[sessionName]).forEach(subscribers => {
        subscribers.forEach(ws => {
          if (ws.readyState === 1) {
            ws.close();
          }
        });
      });
      delete this.activeSubscribers[sessionName]; // Clear from memory
    }

    // Remove from storage
    await this.storage.deleteSession(sessionName);

    return { success: true };
  }

  async suspendSession({ sessionName, password, secretKey, suspend }) {
    const session = await this.storage.getSession(sessionName);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.password !== password || session.secretKey !== secretKey) {
      throw new Error('Invalid credentials');
    }

    await this.storage.updateSession(sessionName, { suspended: suspend });

    return { success: true, suspended: suspend };
  }

  async validateSession(sessionName, password) {
    const session = await this.storage.getSession(sessionName);
    
    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    if (session.password !== password) {
      return { valid: false, error: 'Invalid password' };
    }

    if (session.suspended) {
      return { valid: false, error: 'Session is suspended' };
    }

    return { valid: true, session };
  }

  // Subscriber management remains synchronous/in-memory 
  // because WebSocket objects cannot be stored in DB.
  subscribe(sessionName, topic, ws) {
    if (!this.activeSubscribers[sessionName]) {
      this.activeSubscribers[sessionName] = {};
    }

    if (!this.activeSubscribers[sessionName][topic]) {
      this.activeSubscribers[sessionName][topic] = [];
    }

    if (!this.activeSubscribers[sessionName][topic].includes(ws)) {
      this.activeSubscribers[sessionName][topic].push(ws);
    }
  }

  unsubscribe(sessionName, topic, ws) {
    if (this.activeSubscribers[sessionName]?.[topic]) {
      this.activeSubscribers[sessionName][topic] = 
        this.activeSubscribers[sessionName][topic].filter(client => client !== ws);
    }
  }

  getSubscribers(sessionName, topic) {
    return this.activeSubscribers[sessionName]?.[topic] || [];
  }

  async getSession(sessionName) {
    return this.storage.getSession(sessionName);
  }

  // --- Device Token Methods (FCM) ---

  async registerDeviceToken(sessionName, userId, fcmToken, deviceId, platform) {
    try {
      const session = await this.storage.getSession(sessionName);
      if (!session) throw new Error('Session not found');
      
      // Encrypt token using session secret key
      const encryptedToken = this.encryptData(fcmToken, session.secretKey);
      const now = Date.now();
      
      await this.storage.saveDeviceToken({
        sessionName,
        userId,
        fcmToken: encryptedToken,
        deviceId,
        platform,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      console.error('[SessionManager] registerDeviceToken failed:', error.message);
      // Don't throw - graceful degradation
    }
  }

  async getDeviceTokens(sessionName, userId) {
    try {
      const session = await this.storage.getSession(sessionName);
      if (!session) return [];
      
      const tokens = await this.storage.getDeviceTokens(sessionName, userId);
      // Decrypt tokens
      return tokens.map(t => ({
        ...t,
        fcmToken: this.decryptData(t.fcmToken, session.secretKey)
      }));
    } catch (error) {
      console.error('[SessionManager] getDeviceTokens failed:', error.message);
      return []; // Return empty array on error
    }
  }

  async deleteDeviceToken(sessionName, userId, deviceId) {
    try {
      await this.storage.deleteDeviceToken(sessionName, userId, deviceId);
    } catch (error) {
      console.error('[SessionManager] deleteDeviceToken failed:', error.message);
      // Silent failure - not critical
    }
  }

  // --- User Connection Tracking (for FCM offline detection) ---

  registerUserConnection(sessionName, userId, ws) {
    try {
      if (!this.userConnections[sessionName]) {
        this.userConnections[sessionName] = {};
      }
      this.userConnections[sessionName][userId] = ws;
    } catch (error) {
      console.error('[SessionManager] registerUserConnection failed:', error.message);
    }
  }

  unregisterUserConnection(sessionName, userId) {
    try {
      if (this.userConnections[sessionName]) {
        delete this.userConnections[sessionName][userId];
      }
    } catch (error) {
      console.error('[SessionManager] unregisterUserConnection failed:', error.message);
    }
  }

  isUserOnline(sessionName, userId) {
    try {
      const ws = this.userConnections[sessionName]?.[userId];
      return ws && ws.readyState === 1; // 1 = OPEN
    } catch (error) {
      console.error('[SessionManager] isUserOnline check failed:', error.message);
      return false; // Assume offline on error
    }
  }

  getOfflineSubscribers(sessionName, topic) {
    try {
      // Get all subscribers to this topic
      const allSubscribers = this.activeSubscribers[sessionName]?.[topic] || [];
      
      // Extract userIds from WebSocket objects (need to track this)
      // For now, return empty array - this requires ws.userId to be set
      // TODO: Set ws.userId in wsHandler during init
      const offlineUsers = [];
      
      return offlineUsers;
    } catch (error) {
      console.error('[SessionManager] getOfflineSubscribers failed:', error.message);
      return [];
    }
  }
}

export default SessionManager;

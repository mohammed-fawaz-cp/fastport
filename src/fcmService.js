import admin from 'firebase-admin';

class FCMService {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.fcmClients = new Map(); // sessionName → Firebase Messaging instance
    this.initPromises = new Map(); // Track initialization promises
  }

  /**
   * Initialize Firebase Admin SDK for a session
   * @param {string} sessionName 
   * @returns {Promise<boolean>} true if successful, false otherwise
   */
  async initializeForSession(sessionName) {
    // Check if already initialized
    if (this.fcmClients.has(sessionName)) {
      return true;
    }

    // Check if initialization is in progress
    if (this.initPromises.has(sessionName)) {
      return await this.initPromises.get(sessionName);
    }

    // Start initialization
    const initPromise = this._doInitialize(sessionName);
    this.initPromises.set(sessionName, initPromise);

    try {
      const result = await initPromise;
      return result;
    } finally {
      this.initPromises.delete(sessionName);
    }
  }

  async _doInitialize(sessionName) {
    try {
      const session = await this.sessionManager.getSession(sessionName);
      
      if (!session) {
        console.error(`[FCM] Session not found: ${sessionName}`);
        return false;
      }

      if (!session.fcmEnabled) {
        return false; // FCM not enabled for this session
      }

      if (!session.fcmProjectId || !session.fcmPrivateKey || !session.fcmClientEmail) {
        console.error(`[FCM] Invalid FCM config for session: ${sessionName}`);
        return false;
      }

      // Decrypt private key if encrypted
      let privateKey = session.fcmPrivateKey;
      // TODO: Add decryption logic here if fcmPrivateKey is stored encrypted
      // privateKey = decrypt(session.fcmPrivateKey);

      // Initialize Firebase Admin SDK
      const app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: session.fcmProjectId,
          privateKey: privateKey,
          clientEmail: session.fcmClientEmail
        })
      }, sessionName); // Use sessionName as app name

      const messaging = admin.messaging(app);
      this.fcmClients.set(sessionName, messaging);
      
      console.log(`[FCM] Initialized for session: ${sessionName}`);
      return true;
    } catch (error) {
      console.error(`[FCM] Initialization failed for ${sessionName}:`, error.message);
      return false;
    }
  }

  /**
   * Send FCM push notification to offline user
   * @param {string} sessionName 
   * @param {string} userId 
   * @param {object} messageData - { topic, messageId, preview, timestamp }
   */
  async sendPush(sessionName, userId, messageData) {
    try {
      // Get device tokens for user
      const tokens = await this.sessionManager.getDeviceTokens(sessionName, userId);
      
      if (!tokens || tokens.length === 0) {
        // No devices registered, skip silently
        return;
      }

      // Ensure FCM is initialized for this session
      let messaging = this.fcmClients.get(sessionName);
      if (!messaging) {
        const initialized = await this.initializeForSession(sessionName);
        if (!initialized) {
          // FCM not available for this session, skip
          return;
        }
        messaging = this.fcmClients.get(sessionName);
      }

      if (!messaging) {
        // Still no messaging instance, abort
        return;
      }

      // Prepare FCM payload
      const fcmTokens = tokens.map(t => t.fcmToken);
      const payload = {
        tokens: fcmTokens,
        notification: {
          title: 'New Message',
          body: messageData.preview || 'You have a new message'
        },
        data: {
          topic: messageData.topic || '',
          messageId: messageData.messageId || '',
          timestamp: String(messageData.timestamp || Date.now())
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      // Send with timeout (5 seconds)
      const sendPromise = messaging.sendMulticast(payload);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('FCM timeout')), 5000)
      );

      const response = await Promise.race([sendPromise, timeoutPromise]);

      // Log results
      if (response.successCount > 0) {
        console.log(`[FCM] Sent push to ${response.successCount}/${fcmTokens.length} devices for user: ${userId}`);
      }

      if (response.failureCount > 0) {
        console.warn(`[FCM] Failed to send to ${response.failureCount} devices`);
        
        // Clean up invalid tokens
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (errorCode === 'messaging/invalid-registration-token' || 
                errorCode === 'messaging/registration-token-not-registered') {
              // Token is invalid, remove it
              const deviceId = tokens[idx]?.deviceId;
              if (deviceId) {
                this.sessionManager.deleteDeviceToken(sessionName, userId, deviceId)
                  .catch(err => console.error('[FCM] Failed to delete invalid token:', err));
              }
            }
          }
        });
      }
    } catch (error) {
      // Graceful degradation - log error but don't throw
      if (error.message === 'FCM timeout') {
        console.warn(`[FCM] Push notification timed out for user: ${userId}`);
      } else {
        console.error(`[FCM] Push notification failed for user ${userId}:`, error.message);
      }
    }
  }

  /**
   * Cleanup Firebase app instance for a session
   * @param {string} sessionName 
   */
  async cleanup(sessionName) {
    try {
      const messaging = this.fcmClients.get(sessionName);
      if (messaging) {
        const app = admin.app(sessionName);
        await app.delete();
        this.fcmClients.delete(sessionName);
        console.log(`[FCM] Cleaned up for session: ${sessionName}`);
      }
    } catch (error) {
      console.error(`[FCM] Cleanup failed for ${sessionName}:`, error.message);
    }
  }

  /**
   * Cleanup all Firebase instances
   */
  async cleanupAll() {
    const sessionNames = Array.from(this.fcmClients.keys());
    await Promise.all(sessionNames.map(name => this.cleanup(name)));
  }
}

export default FCMService;

import crypto from 'crypto';

export function handleWebSocketConnection(ws, sessionManager, messageCache, fcmService) {
  let clientSession = null;
  let clientSubscriptions = new Set();
  // Keep explicit active flag
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (data) => {
    try {
      // Determine if text (JSON) or binary
      let isBinary = false;
      if (typeof data !== 'string') {
          // Node ws: data is Buffer (or ArrayBuffer)
          // Treat Buffer as binary
          isBinary = true;
      }
      
      if (isBinary) {
          // Binary Frame -> File Chunk
          await handleBinaryMessage(data);
      } else {
          // Text Frame -> JSON Control Message
          const message = JSON.parse(data.toString());
          switch (message.type) {
            case 'init': await handleInit(message); break;
            case 'subscribe': handleSubscribe(message); break;
            case 'unsubscribe': handleUnsubscribe(message); break;
            case 'publish': await handlePublish(message); break;
            case 'ack': await handleAck(message); break;
            
            // File Control Signals
            case 'init_file':
            case 'end_file':
                await handleFileSignal(message, message.type);
                break;
            // No 'file_chunk' case here anymore (it's binary)
            
            // FCM Token Registration
            case 'register_fcm_token':
                await handleFCMTokenRegistration(message);
                break;
            
            default:
              ws.send(JSON.stringify({ error: 'Unknown message type' }));
          }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  ws.on('close', () => {
    if (clientSession) {
      // Unregister user connection
      if (ws.userId) {
        sessionManager.unregisterUserConnection(clientSession, ws.userId);
      }

      clientSubscriptions.forEach(topic => {
        sessionManager.unsubscribe(clientSession, topic, ws);
      });
    }
  });

  // --- Handlers ---

  async function handleInit(message) {
    const { sessionName, password } = message;
    
    const validation = await sessionManager.validateSession(sessionName, password);

    if (!validation.valid) {
      ws.send(JSON.stringify({ 
        type: 'init_response', 
        success: false, 
        error: validation.error 
      }));
      return;
    }

    clientSession = sessionName;
    ws.sessionName = sessionName; 
    ws.userId = message.userId || null; // Track userId for FCM

    // Register user connection for offline detection
    if (ws.userId) {
      sessionManager.registerUserConnection(sessionName, ws.userId, ws);
    }

    ws.send(JSON.stringify({ 
      type: 'init_response', 
      success: true, 
      sessionName 
    }));
  }

  function handleSubscribe(message) {
    if (!clientSession) {
      ws.send(JSON.stringify({ error: 'Not initialized' }));
      return;
    }

    const { topic } = message;
    sessionManager.subscribe(clientSession, topic, ws);
    clientSubscriptions.add(topic);

    ws.send(JSON.stringify({ 
      type: 'subscribe_response', 
      success: true, 
      topic 
    }));
  }

  function handleUnsubscribe(message) {
    if (!clientSession) {
      ws.send(JSON.stringify({ error: 'Not initialized' }));
      return;
    }

    const { topic } = message;
    sessionManager.unsubscribe(clientSession, topic, ws);
    clientSubscriptions.delete(topic);

    ws.send(JSON.stringify({ 
      type: 'unsubscribe_response', 
      success: true, 
      topic 
    }));
  }

  // Stream-Through for Binary Chunks
  async function handleBinaryMessage(buffer) {
     if (!clientSession) {
         console.log('[Binary] Rejected: No session');
         return;
     }
     
     // Frame: [Type: 1B] [FileID: 36B] [Index: 4B] [Payload...]
     if (buffer.length < 41) {
         console.log('[Binary] Rejected: Too short', buffer.length);
         return;
     }
     
     const type = buffer[0];
     if (type !== 0x02) {
         console.log('[Binary] Rejected: Wrong type', type);
         return;
     }
     
     const fileId = buffer.toString('utf8', 1, 37); // UUID
     const topic = ws.activeUploads?.get(fileId);
     
     console.log(`[Binary] Chunk for fileId=${fileId}, topic=${topic}, size=${buffer.length}`);
     
     if (!topic) {
        console.warn('[Binary] No topic mapping for fileId:', fileId); 
        return; 
     }
     
     // Forward to subscribers
     const subscribers = sessionManager.getSubscribers(clientSession, topic);
     console.log(`[Binary] Forwarding to ${subscribers.length} subscribers`);
     
     // Forward raw buffer
     subscribers.forEach(subscriber => {
       if (subscriber !== ws && subscriber.readyState === 1) {
          subscriber.send(buffer, (err) => {
              if (err) console.error('[Stream] Binary send error:', err);
          });
       }
     });
  }

  // Unified Handler for File Signals (Stream-Through)
  async function handleFileSignal(message, type) {
    if (!clientSession) {
      return ws.send(JSON.stringify({ error: 'Not initialized' }));
    }
    
    // ... Session Validation ...
    let session;
    try {
      session = await sessionManager.getSession(clientSession);
    } catch(e) { 
      return ws.send(JSON.stringify({ type: 'error', error: 'Session Error' })); 
    }

    if (!session || session.suspended) {
      return ws.send(JSON.stringify({ type: 'error', error: 'Session Invalid or Suspended' }));
    }

    const { topic, fileId } = message;
    if (!topic || !fileId) {
      return ws.send(JSON.stringify({ type: 'error', error: 'Missing topic or fileId' }));
    }
    
    // Track fileId -> Topic for binary routing
    if (type === 'init_file') {
        if (!ws.activeUploads) ws.activeUploads = new Map();
        ws.activeUploads.set(fileId, topic);
    } else if (type === 'end_file') {
        if (ws.activeUploads) ws.activeUploads.delete(fileId);
    }

    // Stream-Through: Get subscribers and forward immediately
    const subscribers = sessionManager.getSubscribers(clientSession, topic);
    const payload = JSON.stringify(message); // Forward exact message

    let deliveredCount = 0;
    subscribers.forEach(subscriber => {
      if (subscriber !== ws && subscriber.readyState === 1) {
        try {
          subscriber.send(payload, (err) => {
            if (err) console.error(`[Stream] Send error for ${type}:`, err);
          });
          deliveredCount++;
        } catch (err) {
           console.error('[Stream] Sync send error:', err);
        }
      }
    });

    if (type !== 'file_chunk') {
      console.log(`[Stream] Forwarded ${type} for file ${fileId} to ${deliveredCount} subs.`);
    }
  }

  async function handlePublish(message) {
    if (!clientSession) {
      ws.send(JSON.stringify({ error: 'Not initialized' }));
      return;
    }

    const { topic, data, hash, timestamp, messageId } = message;
    
    let session;
    try {
      session = await sessionManager.getSession(clientSession);
    } catch (e) {
        console.error('Session retrieval failed', e);
        return ws.send(JSON.stringify({ type: 'publish_response', success: false, error: 'Internal Error' }));
    }

    if (!session || session.suspended) {
      ws.send(JSON.stringify({ 
        type: 'publish_response', 
        success: false, 
        error: 'Session suspended or invalid' 
      }));
      return;
    }

    // Optimistic Delivery
    const subscribers = sessionManager.getSubscribers(clientSession, topic);
    // console.log(`[DEBUG] Publishing to ${topic}, potential subscribers: ${subscribers.length}`);

    const payload = JSON.stringify({
      type: 'message',
      topic,
      data,
      hash,
      timestamp,
      messageId
    });

    let deliveredCount = 0;
    subscribers.forEach(subscriber => {
      if (subscriber !== ws && subscriber.readyState === 1) {
        try {
          subscriber.send(payload, (err) => {
             if (err) console.error(`[DEBUG] Send error to subscriber:`, err);
          });
          deliveredCount++;
        } catch (err) {
          console.error('[DEBUG] Sync send error:', err);
        }
      }
    });

    // console.log(`[DEBUG] Delivered to ${deliveredCount} subscribers`);

    // Persistence & Retry
    try {
       await messageCache.cacheMessage(clientSession, topic, messageId, {
        data,
        hash,
        timestamp,
        topic,
        type: 'publish'
      }, session);
      
      if (deliveredCount > 0) {
        await messageCache.scheduleRetry(clientSession, topic, messageId, session, retryMessage);
      } else {
        await messageCache.removeMessage(clientSession, topic, messageId);
      }

    } catch (dbError) {
      console.error('[CRITICAL] Storage failure for message', messageId, dbError);
    }

    // Send FCM push notifications to offline users (if FCM enabled)
    if (fcmService) {
      try {
        const session = await sessionManager.getSession(clientSession);
        if (session && session.fcmEnabled) {
          // Get all subscribers to this topic
          const subscribers = sessionManager.getSubscribers(clientSession, topic);
          
          // Find offline users (subscribers with userId but not online)
          const offlineUserIds = new Set();
          
          // Check each subscriber
          subscribers.forEach(sub => {
            if (sub.userId && !sessionManager.isUserOnline(clientSession, sub.userId)) {
              offlineUserIds.add(sub.userId);
            }
          });

          // Send FCM push to each offline user
          for (const userId of offlineUserIds) {
            await fcmService.sendPush(clientSession, userId, {
              topic,
              messageId,
              preview: data.substring(0, 100), // First 100 chars
              timestamp
            });
          }

          if (offlineUserIds.size > 0) {
            console.log(`[FCM] Sent push to ${offlineUserIds.size} offline users`);
          }
        }
      } catch (fcmError) {
        console.error('[FCM] Failed to send push notifications:', fcmError.message);
      }
    }

    ws.send(JSON.stringify({ 
      type: 'publish_response', 
      success: true, 
      messageId,
      deliveredTo: deliveredCount
    }));
  }

  async function handleAck(message) {
    if (!clientSession) return;
    const { topic, messageId } = message;
    await messageCache.removeMessage(clientSession, topic, messageId);
  }

  async function handleFCMTokenRegistration(message) {
    if (!clientSession) {
      return ws.send(JSON.stringify({ 
        type: 'fcm_token_response',
        success: false,
        error: 'Not initialized' 
      }));
    }

    const { userId, encryptedData, hash } = message;
    
    if (!userId || !encryptedData || !hash) {
      return ws.send(JSON.stringify({
        type: 'fcm_token_response',
        success: false,
        error: 'Missing required fields: userId, encryptedData, hash'
      }));
    }

    try {
      // Get session for crypto key
      const session = await sessionManager.getSession(clientSession);
      if (!session) {
        throw new Error('Session not found');
      }

      // Verify hash
      const computedHash = crypto.createHash('sha256').update(encryptedData).digest('hex');
      if (computedHash !== hash) {
        throw new Error('Hash verification failed');
      }

      // Decrypt payload using session secret key
      const decrypted = sessionManager.decryptData(encryptedData, session.secretKey);
      const { fcmToken, deviceId, platform } = JSON.parse(decrypted);

      if (!fcmToken || !deviceId) {
        throw new Error('Invalid payload: fcmToken and deviceId required');
      }

      // Store in DB (will be encrypted by sessionManager)
      await sessionManager.registerDeviceToken(
        clientSession,
        userId,
        fcmToken,
        deviceId,
        platform || 'unknown'
      );

      console.log(`[FCM] Token registered for user ${userId} on device ${deviceId}`);

      ws.send(JSON.stringify({
        type: 'fcm_token_response',
        success: true,
        message: 'Token registered successfully'
      }));
    } catch (error) {
      console.error('[FCM] Token registration failed:', error.message);
      ws.send(JSON.stringify({
        type: 'fcm_token_response',
        success: false,
        error: error.message
      }));
    }
  }

  async function retryMessage(sessionName, topic, messageId) {
    const message = await messageCache.getMessage(sessionName, topic, messageId);
    if (!message) return;

    const session = await sessionManager.getSession(sessionName);
    if (!session || session.suspended) {
      await messageCache.removeMessage(sessionName, topic, messageId);
      return;
    }

    const subscribers = sessionManager.getSubscribers(sessionName, topic);
    const payload = JSON.stringify({
      type: 'message',
      topic,
      data: message.data,
      hash: message.hash,
      timestamp: message.timestamp,
      messageId,
      retry: message.retryCount
    });

    let activeSubscribers = 0;
    subscribers.forEach(subscriber => {
      if (subscriber.readyState === 1) {
        try {
          subscriber.send(payload);
          activeSubscribers++;
        } catch (e) {
            console.error('Send failed', e);
        }
      }
    });

    if (activeSubscribers > 0) {
      await messageCache.scheduleRetry(sessionName, topic, messageId, session, retryMessage);
    } else {
      await messageCache.removeMessage(sessionName, topic, messageId);
    }
  }
}

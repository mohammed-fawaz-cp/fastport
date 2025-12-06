import { Sequelize, DataTypes, Op } from 'sequelize';
import StorageProvider from './StorageProvider.js';
import path from 'path';

class SQLStore extends StorageProvider {
  constructor(config = {}) {
    super();
    // Config: { dialect: 'postgres'|'sqlite', storage: 'path/to/db.sqlite', url: 'postgres://...' }
    
    this.dialect = config.dialect || 'sqlite';
    
    if (this.dialect === 'postgres') {
      this.sequelize = new Sequelize(config.url, {
        dialect: 'postgres',
        logging: false,
        pool: { max: 20, min: 0, acquire: 30000, idle: 10000 }
      });
    } else {
      // SQLite default
      const dbPath = config.storage || path.resolve(process.cwd(), 'fastport.sqlite');
      this.sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: dbPath,
        logging: false
      });
    }

    this.initModels();
  }

  initModels() {
    this.Session = this.sequelize.define('Session', {
      sessionName: { type: DataTypes.STRING, primaryKey: true },
      password: { type: DataTypes.STRING, allowNull: false },
      secretKey: { type: DataTypes.STRING, allowNull: false },
      retryInterval: { type: DataTypes.INTEGER, defaultValue: 5000 },
      maxRetryLimit: { type: DataTypes.INTEGER, defaultValue: 100 },
      messageExpiryTime: { type: DataTypes.INTEGER, allowNull: true },
      sessionExpiry: { type: DataTypes.DATE, allowNull: true },
      suspended: { type: DataTypes.BOOLEAN, defaultValue: false },
      // FCM Configuration (Optional)
      fcmProjectId: { type: DataTypes.STRING, allowNull: true },
      fcmPrivateKey: { type: DataTypes.TEXT, allowNull: true }, // Encrypted
      fcmClientEmail: { type: DataTypes.STRING, allowNull: true },
      fcmEnabled: { type: DataTypes.BOOLEAN, defaultValue: false }
    });

    this.Message = this.sequelize.define('Message', {
      messageId: { type: DataTypes.STRING, primaryKey: true },
      sessionName: { type: DataTypes.STRING, allowNull: false },
      topic: { type: DataTypes.STRING, allowNull: false },
      data: { type: DataTypes.TEXT, allowNull: false }, // Encrypted payload
      hash: { type: DataTypes.STRING, allowNull: false },
      timestamp: { type: DataTypes.BIGINT, allowNull: false },
      type: { type: DataTypes.STRING, defaultValue: 'publish' },
      retryCount: { type: DataTypes.INTEGER, defaultValue: 0 },
      expiryTime: { type: DataTypes.BIGINT, allowNull: true },
      maxRetryLimit: { type: DataTypes.INTEGER, allowNull: true },
      retryInterval: { type: DataTypes.INTEGER, allowNull: true }
    });

    // DeviceToken model for FCM push notifications
    this.DeviceToken = this.sequelize.define('DeviceToken', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sessionName: { type: DataTypes.STRING, allowNull: false },
      userId: { type: DataTypes.STRING, allowNull: false },
      fcmToken: { type: DataTypes.TEXT, allowNull: false }, // Encrypted
      deviceId: { type: DataTypes.STRING, allowNull: false },
      platform: { type: DataTypes.STRING, allowNull: true }, // 'android', 'ios', 'web'
      createdAt: { type: DataTypes.BIGINT, allowNull: false },
      updatedAt: { type: DataTypes.BIGINT, allowNull: false }
    }, {
      indexes: [
        { fields: ['sessionName'] },
        { fields: ['sessionName', 'userId'] },
        { unique: true, fields: ['sessionName', 'userId', 'deviceId'] }
      ],
      timestamps: false
    });
    
    // Index for faster queries
    // SessionName index is implicit via PK? No SessionName in Message is FK ideally.
    // For simplicity and loose coupling (sharding readiness), we don't enforce strict FK constraint here 
    // unless necessary, but indexing is good.
  }

  async init() {
    try {
      if (this.dialect === 'postgres') {
          await this.sequelize.authenticate();
      }
      // 'alter: true' updates tables if schema changes. Safe for dev, use migrations for prod.
      await this.sequelize.sync({ alter: true });
      console.log(`SQLStore initialized (${this.dialect})`);
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  // --- Session Methods ---

  async createSession(sessionData) {
    // sessionExpiry handling: if passed as relative ms, convert to Date?
    // SessionManager usually passes what is stored.
    // If sessionData.sessionExpiry is null, it means no expiry.
    await this.Session.create(sessionData);
  }

  async getSession(sessionName) {
    const session = await this.Session.findByPk(sessionName);
    return session ? session.toJSON() : null;
  }

  async deleteSession(sessionName) {
    await this.Session.destroy({ where: { sessionName } });
    // Also delete messages?
    // "Zero Retention" implies we should clean up.
    await this.Message.destroy({ where: { sessionName } });
  }

  async updateSession(sessionName, updates) {
    await this.Session.update(updates, { where: { sessionName } });
  }

  // --- Message Methods ---

  async saveMessage(messageId, messageData) {
    // messageData contains: { messageId, sessionName, topic, data, ... }
    // We use upsert to handle potential idempotency if needed, 
    // preventing valid duplicate messageId from crashing unique constraint.
    await this.Message.upsert(messageData);
  }

  async getMessage(messageId) {
    const msg = await this.Message.findByPk(messageId);
    return msg ? msg.toJSON() : null;
  }

  async removeMessage(messageId) {
    await this.Message.destroy({ where: { messageId } });
  }

  async getPendingMessages(sessionName) {
     return await this.Message.findAll({ where: { sessionName } });
  }

  // --- Ephemeral / Cleanup Methods (Phase 2) ---

  async cleanupExpired() {
    const now = Date.now();
    
    // 1. Delete Expired Messages
    const msgResult = await this.Message.destroy({
      where: {
        expiryTime: {
          [Op.ne]: null,
          [Op.lt]: now
        }
      }
    });

    if (msgResult > 0) {
      console.log(`[Cleanup] Removed ${msgResult} expired messages`);
    }

    // 2. Delete Expired Sessions
    const sessionResult = await this.Session.destroy({
      where: {
        sessionExpiry: {
          [Op.ne]: null,
          [Op.lt]: new Date(now)
        }
      }
    });

    if (sessionResult > 0) {
       console.log(`[Cleanup] Removed ${sessionResult} expired sessions`);
    }
    
    return { messagesRemoved: msgResult, sessionsRemoved: sessionResult };
  }

  // --- Device Token Methods (FCM) ---

  async saveDeviceToken(tokenData) {
    // tokenData: { sessionName, userId, fcmToken, deviceId, platform, createdAt, updatedAt }
    await this.DeviceToken.upsert(tokenData);
  }

  async getDeviceTokens(sessionName, userId) {
    const tokens = await this.DeviceToken.findAll({
      where: { sessionName, userId },
      attributes: ['fcmToken', 'deviceId', 'platform']
    });
    return tokens.map(t => t.toJSON());
  }

  async deleteDeviceToken(sessionName, userId, deviceId) {
    await this.DeviceToken.destroy({
      where: { sessionName, userId, deviceId }
    });
  }

  async deleteAllDeviceTokens(sessionName) {
    await this.DeviceToken.destroy({
      where: { sessionName }
    });
  }
}

export default SQLStore;

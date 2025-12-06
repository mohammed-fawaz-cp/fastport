import StorageProvider from './StorageProvider.js';

class MemoryStore extends StorageProvider {
  constructor() {
    super();
    this.sessions = new Map();
    this.messages = new Map();
  }

  async init() {
    console.log('MemoryStore initialized');
  }

  async createSession(sessionData) {
    this.sessions.set(sessionData.sessionName, sessionData);
    return sessionData;
  }

  async getSession(sessionName) {
    return this.sessions.get(sessionName);
  }

  async updateSession(sessionName, updates) {
    const session = this.sessions.get(sessionName);
    if (!session) return null;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(sessionName, updatedSession);
    return updatedSession;
  }

  async deleteSession(sessionName) {
    return this.sessions.delete(sessionName);
  }

  async saveMessage(messageId, messageData) {
    this.messages.set(messageId, messageData);
  }

  async getMessage(messageId) {
    return this.messages.get(messageId);
  }

  async removeMessage(messageId) {
    return this.messages.delete(messageId);
  }

  async getPendingMessages() {
    // Convert Map to array of values
    return Array.from(this.messages.values());
  }
}

export default MemoryStore;

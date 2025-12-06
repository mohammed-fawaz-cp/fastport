/**
 * Interface definition for Storage Providers.
 * All methods must return Promises (mostly) or follow the contract.
 */
class StorageProvider {
  async init() {
    throw new Error('Method not implemented');
  }

  async createSession(sessionData) {
    throw new Error('Method not implemented');
  }

  async getSession(sessionName) {
    throw new Error('Method not implemented');
  }

  async updateSession(sessionName, data) {
    throw new Error('Method not implemented');
  }

  async deleteSession(sessionName) {
    throw new Error('Method not implemented');
  }

  // Active Subscriber management remains in memory for now as it's connection-bound,
  // but session *data* moves to storage.
  
  // Message Persistence
  async saveMessage(messageId, messageData) {
    throw new Error('Method not implemented');
  }

  async getMessage(messageId) {
    throw new Error('Method not implemented');
  }

  async removeMessage(messageId) {
    throw new Error('Method not implemented');
  }

  async getPendingMessages() {
    throw new Error('Method not implemented');
  }
}

export default StorageProvider;

import { expect } from 'chai';
import sinon from 'sinon';

// Global Test Helpers
export const TEST_SESSION = {
    name: 'test_session',
    pass: 'password123',
    key: 'test_secret_key'
};

export const MOCK_SOCKET = {
    send: sinon.spy(),
    close: sinon.spy(),
    readyState: 1, // OPEN
    isAlive: true,
    subscriptions: new Set()
};

export { expect, sinon };

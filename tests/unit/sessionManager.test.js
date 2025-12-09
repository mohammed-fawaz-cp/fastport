import { expect, sinon, TEST_SESSION } from '../setup.js';
import SessionManager from '../../src/sessionManager.js';
import MemoryStore from '../../src/storage/MemoryStore.js';

describe('SessionManager Unit Tests', () => {
    let sessionManager;
    let store;

    beforeEach(async () => {
        store = new MemoryStore();
        await store.init();
        sessionManager = new SessionManager(store);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Session Management', () => {
        it('should create a new session successfully', async () => {
            const result = await sessionManager.createSession({
                sessionName: TEST_SESSION.name,
                password: TEST_SESSION.pass
            });

            expect(result.success).to.be.true;
            expect(result.sessionName).to.equal(TEST_SESSION.name);
            
            const session = await sessionManager.getSession(TEST_SESSION.name);
            expect(session).to.not.be.null;
            expect(session.password).to.equal(TEST_SESSION.pass);
        });

        it('should fail to create duplicate session', async () => {
            await sessionManager.createSession({ sessionName: 'dup', password: '123' });
            
            try {
                await sessionManager.createSession({ sessionName: 'dup', password: '456' });
                expect.fail('Should have thrown error');
            } catch (e) {
                expect(e.message).to.equal('Session already exists');
            }
        });

        it('should drop a session with correct credentials', async () => {
            const { secretKey } = await sessionManager.createSession({
                sessionName: 'drop_me',
                password: '123'
            });

            const result = await sessionManager.dropSession({
                sessionName: 'drop_me',
                password: '123',
                secretKey
            });

            expect(result.success).to.be.true;
            const session = await sessionManager.getSession('drop_me');
            expect(session).to.be.undefined;
        });

        it('should validate session credentials correctly', async () => {
            await sessionManager.createSession({
                 sessionName: 'auth_test',
                 password: 'secure'
            });

            const valid = await sessionManager.validateSession('auth_test', 'secure');
            expect(valid.valid).to.be.true;

            const invalidPass = await sessionManager.validateSession('auth_test', 'wrong');
            expect(invalidPass.valid).to.be.false;

            const invalidSess = await sessionManager.validateSession('non_existent', 'secure');
            expect(invalidSess.valid).to.be.false;
        });
    });

    describe('Pub/Sub Logic', () => {
        beforeEach(async () => {
            await sessionManager.createSession({ sessionName: 'pubsub', password: '123' });
        });

        it('should subscribe a client to a topic', () => {
            const ws = { id: 1 };
            sessionManager.subscribe('pubsub', 'topic/1', ws);
            
            const subs = sessionManager.getSubscribers('pubsub', 'topic/1');
            expect(subs).to.include(ws);
        });

        it('should unsubscribe a client', () => {
            const ws = { id: 1 };
            sessionManager.subscribe('pubsub', 'topic/1', ws);
            sessionManager.unsubscribe('pubsub', 'topic/1', ws);
            
            const subs = sessionManager.getSubscribers('pubsub', 'topic/1');
            expect(subs).to.not.include(ws);
        });

        it('should return empty list for unknown session', () => {
            const subs = sessionManager.getSubscribers('unknown', 'topic');
            expect(subs).to.be.an('array').that.is.empty;
        });
    });
});

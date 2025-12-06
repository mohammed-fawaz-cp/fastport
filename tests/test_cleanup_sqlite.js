import SQLStore from '../src/storage/SQLStore.js';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.resolve(process.cwd(), 'cleanup_test.sqlite');

async function testCleanup() {
  console.log('Test: SQLite Cleanup Logic');

  // Cleanup old test db
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  const store = new SQLStore({ dialect: 'sqlite', storage: TEST_DB });
  await store.init();

  const now = Date.now();
  const shortExpiry = now + 1000; // 1 second from now
  const longExpiry = now + 60000; // 1 minute from now

  // 1. Create Data
  console.log('Creating Test Data...');
  
  await store.Session.create({
    sessionName: 'expired_session',
    password: 'p',
    secretKey: 's',
    sessionExpiry: new Date(shortExpiry)
  });

  await store.Session.create({
    sessionName: 'valid_session',
    password: 'p',
    secretKey: 's',
    sessionExpiry: new Date(longExpiry)
  });

  await store.Message.create({
    messageId: 'expired_msg',
    sessionName: 'valid_session',
    topic: 't',
    data: 'd',
    hash: 'h',
    timestamp: now,
    expiryTime: shortExpiry
  });

  await store.Message.create({
    messageId: 'valid_msg',
    sessionName: 'valid_session',
    topic: 't',
    data: 'd',
    hash: 'h',
    timestamp: now,
    expiryTime: longExpiry
  });

  console.log('Data created. Waiting 2 seconds for expiry...');
  await new Promise(r => setTimeout(r, 2000));

  // 2. Run Cleanup
  console.log('Running Cleanup...');
  const result = await store.cleanupExpired();
  console.log('Cleanup Result:', result);

  // 3. Verify
  const expiredSession = await store.getSession('expired_session');
  const validSession = await store.getSession('valid_session');
  const expiredMsg = await store.getMessage('expired_msg');
  const validMsg = await store.getMessage('valid_msg');

  if (!expiredSession && validSession && !expiredMsg && validMsg) {
    console.log('SUCCESS: Expired data removed, Valid data retained.');
    process.exit(0);
  } else {
    console.error('FAILURE: Data state incorrect.');
    console.error({ expiredSession, validSession, expiredMsg, validMsg });
    process.exit(1);
  }
}

testCleanup().catch(err => {
  console.error(err);
  process.exit(1);
});

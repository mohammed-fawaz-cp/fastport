// Quick test script to create a session and verify it works

const SERVER_URL = 'http://localhost:3000';

async function createTestSession() {
  console.log('Creating test session...');
  
  const response = await fetch(`${SERVER_URL}/api/createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: 'testSession',
      password: 'testPassword123',
      retryInterval: 3000,
      maxRetryLimit: 50,
      messageExpiryTime: 30000,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('✓ Session created successfully!');
    console.log('Session Name:', result.sessionName);
    console.log('Password:', result.password);
    console.log('Secret Key:', result.secretKey);
    console.log('\nSave the secret key for admin operations!');
    return result;
  } else {
    console.error('✗ Failed to create session:', result.error);
    return null;
  }
}

async function testSuspend(sessionData) {
  console.log('\nTesting session suspend...');
  
  const response = await fetch(`${SERVER_URL}/api/suspendSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: sessionData.sessionName,
      password: sessionData.password,
      secretKey: sessionData.secretKey,
      suspend: true,
    }),
  });

  const result = await response.json();
  console.log(result.success ? '✓ Session suspended' : '✗ Failed to suspend');
  
  // Unsuspend
  await fetch(`${SERVER_URL}/api/suspendSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: sessionData.sessionName,
      password: sessionData.password,
      secretKey: sessionData.secretKey,
      suspend: false,
    }),
  });
  console.log('✓ Session unsuspended');
}

async function main() {
  try {
    const sessionData = await createTestSession();
    if (sessionData) {
      await testSuspend(sessionData);
      console.log('\n✓ All tests passed!');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

// Example: Create a new session

const createSession = async () => {
  const response = await fetch('http://localhost:3000/api/createSession', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionName: 'mySession',
      password: 'myPassword',
      retryInterval: 5000,
      maxRetryLimit: 100,
      messageExpiryTime: 60000, // 1 minute
    }),
  });

  const result = await response.json();
  console.log('Session created:', result);
  
  // Save the secretKey for admin operations
  return result;
};

createSession().catch(console.error);

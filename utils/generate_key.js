import crypto from 'crypto';

// Generate a random 32-byte (256-bit) AES key
const key = crypto.randomBytes(32);
const base64Key = key.toString('base64');

console.log('Generated AES-256 Key (Base64):');
console.log(base64Key);
console.log('\nUse this key in both your sender and receiver clients.');
console.log('Keep it secret and share it only with authorized clients in the same session.');

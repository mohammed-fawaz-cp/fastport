
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'securepass';

async function testCreateSession(name, authHeader, expectedStatus, caseName) {
    console.log(`\n--- Test Case: ${caseName} ---`);
    try {
        const res = await fetch(`${BASE_URL}/api/createSession`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader ? { 'Authorization': authHeader } : {})
            },
            body: JSON.stringify({ 
                sessionName: name, 
                password: 'test_pass',
                secretKey: 'test_key'
            })
        });

        console.log(`Status: ${res.status} (Expected: ${expectedStatus})`);
        
        if (res.status === expectedStatus) {
            console.log('Result: PASS ✅');
        } else {
            console.log('Result: FAIL ❌');
            const txt = await res.text();
            console.log('Response:', txt);
        }
    } catch (e) {
        console.log('Result: ERROR ❌', e.message);
    }
}

async function runTests() {
    console.log('Starting Security Checks...');

    // 1. No Auth
    await testCreateSession('sec_fail_1', null, 401, 'No Authentication');

    // 2. Bad Auth
    const badAuth = `Basic ${Buffer.from('admin:wrongpass').toString('base64')}`;
    await testCreateSession('sec_fail_2', badAuth, 401, 'Bad Password');

    // 3. Good Auth
    const goodAuth = `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64')}`;
    await testCreateSession('sec_pass_1', goodAuth, 200, 'Correct Authentication');
}

runTests();

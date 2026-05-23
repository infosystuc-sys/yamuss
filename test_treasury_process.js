import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

async function testTreasuryProcess() {
    console.log("Testing treasury process...");

    // Create a mock token for SUPERVISOR
    const token = jwt.sign(
        { id: 1, username: 'admin', role: 'SUPERVISOR', database: 'CENTRAL' },
        process.env.JWT_SECRET || 'finance_portal_secret_2024',
        { expiresIn: '8h' }
    );

    try {
        const res = await fetch('http://localhost:3002/api/treasury/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                opIds: ['0000000012741'],
                accountId: '1110',
                fileName: 'test_batch.txt'
            })
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

testTreasuryProcess();

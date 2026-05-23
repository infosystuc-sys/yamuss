import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import fs from 'fs';

async function testTreasuryProcess() {
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
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Success:", data.success);

        if (data.txtContent) {
            fs.writeFileSync('test_output.txt', data.txtContent);
            console.log("Written test_output.txt");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testTreasuryProcess();

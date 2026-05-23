import { spawn } from 'child_process';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

async function run() {
    console.log("Starting server...");
    const server = spawn('node', ['server/index.js'], { stdio: 'pipe' });

    server.stdout.on('data', () => { });
    server.stderr.on('data', () => { });

    await new Promise(r => setTimeout(r, 6000));

    console.log("Sending test request...");
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
        console.log("Test success:", data.success);
        console.log("Batch ID:", data.loteId);
        console.log("DEBUG OPS DATA LENGTH:", data._debugOpsData?.length);
        console.log("DEBUG OPS DATA:", data._debugOpsData);
        if (data.txtContent) {
            console.log("TXT content snippet:", data.txtContent.slice(0, 100));
        }
    } catch (e) {
        console.error("Test error:", e);
    }

    await new Promise(r => setTimeout(r, 2000));
    server.kill();
    console.log("Server killed.");
}

run();

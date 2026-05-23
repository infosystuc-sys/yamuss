
import fetch from 'node-fetch'; // Assumes node-fetch is available or using built-in fetch in newer Node
// If node-fetch is not available, I can use http module like before. 
// Given previous scripts used 'import http', I will stick to basic http or assume fetch if node >= 18.
// Let's use internal http helper or just node's fetch (available in Node 18+). The user is on Windows 2026, so simple fetch should work.

const API_URL = 'http://localhost:3002/api';

async function test() {
    console.log("--- Testing Filters ---");
    try {
        const res = await fetch(`${API_URL}/orders?status=PENDING`);
        const data = await res.json();
        console.log("PENDING Response (Preview):", JSON.stringify(data).substring(0, 100)); // Debug
        console.log(`PENDING Orders: ${data.length}`);
    } catch (e) { console.error("Filter PENDING Error:", e.message); }

    try {
        const res = await fetch(`${API_URL}/orders?status=PROCESSED`);
        const data = await res.json();
        console.log("PROCESSED Response (Preview):", JSON.stringify(data).substring(0, 100)); // Debug
        console.log(`PROCESSED Orders: ${data.length}`);
    } catch (e) { console.error("Filter PROCESSED Error:", e.message); }

    console.log("\n--- Testing CSV Export ---");
    try {
        const payload = { opIds: ['OP-0001'], accountId: 3 };
        const res = await fetch(`${API_URL}/treasury/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const json = await res.json();
            console.log("CSV Generation Success.");
            console.log("FileName:", json.fileName);
            console.log("Content Preview:\n", json.txtContent);
        } else {
            const err = await res.text();
            console.error("Export Failed:", err);
        }

    } catch (e) { console.error("CSV Error:", e.message); }
}

test();

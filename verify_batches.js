
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3002/api';

async function testHistory() {
    console.log("--- Testing Batch History ---");

    // 1. Create a Batch
    let createdBatchId = null;
    try {
        console.log("Creating Batch...");
        // Reuse OP-0001 (Assuming it exists and is valid from previous tests)
        // If not, we might need to rely on previously created data or just try.
        // The mock DB is memory/transient? No, verify_logic script populated real DB (or mock file). 
        // Verification script populated SQL Server tables. They persist.
        const payload = { opIds: ['OP-0001'], accountId: 55 };
        const res = await fetch(`${API_URL}/treasury/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const json = await res.json();
            console.log("Batch Created. Response:", json.message);
            // Parse ID from message or we should check the list next.
            // Message format: "Lote پردا... Lote #123 guardado."
        } else {
            console.error("Batch Creation Failed:", await res.text());
        }

    } catch (e) { console.error("Create Error:", e.message); }

    // 2. List Batches
    try {
        console.log("\nListing Batches...");
        const res = await fetch(`${API_URL}/batches`);
        const batches = await res.json();
        console.log(`Found ${batches.length} batches.`);
        if (batches.length > 0) {
            const lastBatch = batches[0];
            console.log("Most recent batch:", lastBatch);
            createdBatchId = lastBatch.ID;
        }
    } catch (e) { console.error("List Error:", e.message); }

    // 3. Get Batch Details
    if (createdBatchId) {
        try {
            console.log(`\nGetting details for Batch ID: ${createdBatchId}`);
            const res = await fetch(`${API_URL}/batches/${createdBatchId}`);
            const details = await res.json();
            console.log(`Batch ${createdBatchId} contains ${details.length} OPs.`);
            console.log("Details Preview:", details);
        } catch (e) { console.error("Details Error:", e.message); }
    }
}

testHistory();

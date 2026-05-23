
import 'dotenv/config';
import { DBAdapter } from './server/db/adapter.js';

async function checkPadron() {
    try {
        console.log("Connecting using Adapter...");
        const adapter = new DBAdapter();
        const db = await adapter.connect();

        console.log("Counting rows in APP_PADRON_RETENCIONES...");
        const countResult = await db.query("SELECT COUNT(*) as count FROM APP_PADRON_RETENCIONES");
        // Handle SQLite (where recordset might be different or count lowercase)
        const row = countResult.recordset ? countResult.recordset[0] : countResult[0];
        const count = row.count || row.COUNT || row['COUNT(*)'];

        console.log(`Total rows: ${count}`);

        if (count > 0) {
            console.log("Showing top 5 rows:");
            const sample = await db.query("SELECT TOP 5 * FROM APP_PADRON_RETENCIONES"); // TOP 5 specific to T-SQL, SQLite uses LIMIT
            const rows = sample.recordset || sample;
            console.table(rows);
        }

    } catch (e) {
        console.error("Error:", e);
    }
    // Adapter handles connection pool, scripts usually exit when event loop empties, 
    // or we might need to force exit if pool keeps open.
    setTimeout(() => process.exit(0), 2000);
}

checkPadron();


import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

async function findOrder() {
    try {
        console.log("Connecting...");
        const pool = await sql.connect(dbConfig);

        console.log("Searching for order...");
        const result = await pool.request()
            .query("SELECT N_COMP FROM CPA04 WHERE N_COMP LIKE '%A0008700017348%'");

        console.log("Results:");
        if (result.recordset.length > 0) {
            result.recordset.forEach(row => {
                console.log(`Found: '${row.N_COMP}' (Length: ${row.N_COMP.length})`);
                console.log(`Char codes: ${row.N_COMP.split('').map(c => c.charCodeAt(0)).join(',')}`);
            });
        } else {
            console.log("No partial match found.");
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.close();
    }
}

findOrder();

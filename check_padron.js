
import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

async function checkPadron() {
    try {
        console.log("Connecting...");
        const pool = await sql.connect(dbConfig);

        console.log("Counting rows in PADRON_RENTAS...");
        const countResult = await pool.request().query("SELECT COUNT(*) as count FROM PADRON_RENTAS");
        const count = countResult.recordset[0].count;
        console.log(`Total rows: ${count}`);

        if (count > 0) {
            console.log("Showing top 5 rows:");
            const sample = await pool.request().query("SELECT TOP 5 * FROM PADRON_RENTAS");
            console.table(sample.recordset);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.close();
    }
}

checkPadron();

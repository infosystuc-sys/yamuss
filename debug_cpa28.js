
import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

async function checkCPA28() {
    try {
        console.log("Connecting...");
        const pool = await sql.connect(dbConfig);

        console.log("Checking CPA28 for duplicates on COD_RETEN...");

        const result = await pool.request()
            .query("SELECT COD_RETEN, COUNT(*) as cnt FROM CPA28 GROUP BY COD_RETEN HAVING COUNT(*) > 1");

        if (result.recordset.length > 0) {
            console.log("DUPLICATES FOUND in CPA28:", result.recordset);

            // Inspect one of them
            const sampleCode = result.recordset[0].COD_RETEN;
            console.log(`Inspecting details for COD_RETEN = '${sampleCode}':`);
            const details = await pool.request()
                .input('code', sql.VarChar, sampleCode)
                .query("SELECT * FROM CPA28 WHERE COD_RETEN = @code");
            console.table(details.recordset);
        } else {
            console.log("No duplicates found in CPA28 (COD_RETEN is unique).");

            // Just to be sure, check '02' specifically
            const details = await pool.request()
                .query("SELECT * FROM CPA28 WHERE COD_RETEN = '02'");
            console.log("Rows for '02':", details.recordset.length);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.close();
    }
}

checkCPA28();

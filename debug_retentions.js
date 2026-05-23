
import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

// The ID from the screenshot (with leading space)
const id = ' 0000000012450';

async function inspectRetentions() {
    try {
        console.log("Connecting...");
        const pool = await sql.connect(dbConfig);

        console.log(`Querying CPA29 for N_COMP = '${id}'...`);

        const result = await pool.request()
            .input('id', sql.VarChar, id)
            .query("SELECT * FROM CPA29 WHERE N_COMP = @id");

        console.log(`Found ${result.recordset.length} rows.`);

        // Count by T_COMP
        const counts = {};
        result.recordset.forEach(row => {
            const t = row.T_COMP || 'NULL';
            counts[t] = (counts[t] || 0) + 1;
        });
        console.log("Counts by T_COMP:", counts);

        // Show detailed rows for O/P
        console.log("Rows with T_COMP = 'O/P':");
        const opRows = result.recordset.filter(r => r.T_COMP === 'O/P');
        opRows.forEach((r, i) => {
            console.log(`[${i}] Code: ${r.COD_RETEN}, Importe: ${r.IMP_RETEN}, Base: ${r.BASE_CALCULO}`);
        });

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.close();
    }
}

inspectRetentions();

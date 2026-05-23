
import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

async function inspectDB() {
    try {
        console.log("Connecting to DB...");
        const pool = await sql.connect(dbConfig);

        console.log("Querying CPA04 for suspicious ID...");

        // Try to find the number by the unique suffix '17348' seen in screenshot
        const result = await pool.request()
            .query("SELECT N_COMP, T_COMP, ESTADO, IMPORTE_TO FROM CPA04 WHERE N_COMP LIKE '%17348%'");

        console.log("Search Results (LIKE %17348%):");
        if (result.recordset.length > 0) {
            result.recordset.forEach(row => {
                console.log(`[FOUND] N_COMP: '${row.N_COMP}' | T_COMP: '${row.T_COMP}' | ESTADO: '${row.ESTADO}' | IMP: ${row.IMPORTE_TO}`);
                console.log(`Hex dump of N_COMP:`, Buffer.from(row.N_COMP).toString('hex'));
            });
        } else {
            console.log("No match for 17348.");

            // Fallback: Show random 5 rows starting with 'A'
            console.log("Sample rows starting with 'A':");
            const sample = await pool.request().query("SELECT TOP 5 N_COMP FROM CPA04 WHERE N_COMP LIKE 'A%'");
            sample.recordset.forEach(r => console.log(`'${r.N_COMP}'`));
        }

    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await sql.close();
    }
}

inspectDB();


import sql from 'mssql';
import { dbConfig } from './server/db/config.js';

async function checkSchema() {
    try {
        console.log("Connecting...");
        const pool = await sql.connect(dbConfig);

        console.log("Checking CPA29 columns...");
        const result = await pool.request()
            .query("SELECT TOP 1 * FROM CPA29");

        if (result.recordset.length > 0) {
            console.log("Columns:", Object.keys(result.recordset[0]));
            if (result.recordset[0].T_COMP) {
                console.log("T_COMP exists!");
            } else {
                console.log("T_COMP NOT found.");
            }
        } else {
            console.log("Table is empty, checking metadata not possible this way easily without permission to schema views.");
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await sql.close();
    }
}

checkSchema();


import { DBAdapter } from './server/db/adapter.js';

async function debug() {
    const adapter = new DBAdapter();
    const db = await adapter.connect();

    console.log("Checking RETENCION_COMPRAS_ESCALA columns:");
    try {
        const query = `
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'RETENCION_COMPRAS_ESCALA'
        `;
        const res = await db.query(query);
        console.table(res.recordset);

        console.log("Checking RETENCION_COMPRAS columns:");
        const res2 = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RETENCION_COMPRAS'");
        console.table(res2.recordset);

    } catch (e) {
        console.error("Error inspecting schema:", e);
    }
}

debug().then(() => console.log("Done"));

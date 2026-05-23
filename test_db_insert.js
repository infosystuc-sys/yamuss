import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function test() {
    try {
        await sql.connect(dbConfig);
        const q1 = `
            INSERT INTO APP_LOTES ([DATABASE], FECHA_CREACION, CANTIDAD_OPS, MONTO_TOTAL, NOMBRE_ARCHIVO)
            OUTPUT INSERTED.ID
            VALUES ('CENTRAL', GETDATE(), 1, 100, 'test.txt')
        `;
        const res1 = await sql.query(q1);
        console.log("Insert result:", res1.recordset);
    } catch (e) {
        console.error("Error with [DATABASE]:", e.message);
    } finally {
        sql.close();
    }
}
test();

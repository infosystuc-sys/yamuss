import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function test() {
    try {
        await sql.connect(dbConfig);
        const res = await sql.query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('APP_LOTES')`);
        console.log("APP_LOTES columns:", res.recordset);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        sql.close();
    }
}
test();

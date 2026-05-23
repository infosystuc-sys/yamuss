import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function test() {
    try {
        await sql.connect(dbConfig);
        const opId = '0000000012741';
        console.log("Updating OP estado...");
        const q2 = `UPDATE APP_OP_ESTADOS SET ESTADO = 'Transferida', FECHA_MODIFICACION = GETDATE() WHERE LTRIM(RTRIM(N_COMP)) = '${opId}'`;
        const res2 = await sql.query(q2);
        console.log("Update OP resultado:", res2.rowsAffected);
    } catch (e) {
        console.error("Error en Update OP:", e.message);
    } finally {
        sql.close();
    }
}
test();

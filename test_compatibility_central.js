import * as dotenv from 'dotenv';
dotenv.config();
import { dbConfig, getDbConfig } from './server/db/config.js';
import sql from 'mssql';

async function run() {
    try {
        const centralConfig = getDbConfig('CENTRAL');
        await sql.connect(centralConfig);
        console.log('Connected to DB:', centralConfig.database);

        const res = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('APP_USUARIOS', 'APP_OP_ESTADOS', 'PADRON_RENTAS')`);
        console.log('Custom tables in CENTRAL:', res.recordset.map(r => r.TABLE_NAME));

    } catch (e) {
        console.error(e);
    } finally {
        sql.close();
        process.exit();
    }
}
run();

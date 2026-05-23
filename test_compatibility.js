import * as dotenv from 'dotenv';
dotenv.config();
import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function run() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB:', dbConfig.database);

        const res1 = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CPA01'`);
        const cpa01 = res1.recordset.map(r => r.COLUMN_NAME);
        console.log('CPA01 columns:', cpa01.length,
            'Contains E_MAIL?', cpa01.includes('E_MAIL'),
            'Contains CUIT?', cpa01.includes('N_CUIT'),
            'Contains ING_BRUTOS?', cpa01.includes('ING_BRUTOS'),
            'Contains CBU?', cpa01.includes('CBU'));

        const res2 = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CPA04'`);
        const cpa04 = res2.recordset.map(r => r.COLUMN_NAME);
        console.log('CPA04 columns:', cpa04.length, 'Contains N_COMP?', cpa04.includes('N_COMP'));

    } catch (e) {
        console.error(e);
    } finally {
        sql.close();
    }
}
run();

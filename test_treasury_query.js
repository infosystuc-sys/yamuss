import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function test() {
    try {
        await sql.connect(dbConfig);
        const opIds = ['0000000012741'];
        console.log("opIds:", opIds);

        const opsQuery = `
            SELECT 
                op.N_COMP, 
                op.IMPORTE_TO, 
                prov.N_CUIT, 
                prov.NOM_PROVEE,
                prov.CBU,
                prov.E_MAIL,
                ISNULL((SELECT SUM(IMP_RETEN) FROM CPA29 WHERE N_COMP = op.N_COMP AND T_COMP = 'O/P'), 0) as TOTAL_RETENCIONES
            FROM CPA04 op 
            JOIN CPA01 prov ON op.COD_PROVEE = prov.COD_PROVEE
            WHERE LTRIM(RTRIM(op.N_COMP)) IN (${opIds.map(id => `'${id.trim().replace(/'/g, "''")}'`).join(',')})
        `;

        console.log("Query:", opsQuery);
        const result = await sql.query(opsQuery);
        console.log("Result rows:", result.recordset);

        // Also let's check exact in db:
        const checkQuery = `SELECT N_COMP, LEN(N_COMP) as len FROM CPA04 WHERE N_COMP LIKE '%12741%'`;
        const r2 = await sql.query(checkQuery);
        console.log("Exact n_comp:", r2.recordset);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        sql.close();
    }
}
test();

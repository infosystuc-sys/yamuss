import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function test() {
    try {
        await sql.connect(dbConfig);

        // Find empty batches
        const lotes = await sql.query(`SELECT ID, FECHA_CREACION FROM APP_LOTES WHERE CANTIDAD_OPS = 0 OR MONTO_TOTAL = 0 ORDER BY FECHA_CREACION DESC`);

        // Find transferida OPs
        const ops = await sql.query(`
            SELECT 
                oe.N_COMP, 
                oe.FECHA_MODIFICACION,
                op.IMPORTE_TO, 
                prov.NOM_PROVEE,
                ISNULL((SELECT SUM(IMP_RETEN) FROM CPA29 WHERE N_COMP = op.N_COMP COLLATE DATABASE_DEFAULT AND T_COMP = 'O/P'), 0) as TOTAL_RETENCIONES
            FROM APP_OP_ESTADOS oe
            JOIN CPA04 op ON LTRIM(RTRIM(oe.N_COMP)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(op.N_COMP)) COLLATE DATABASE_DEFAULT
            JOIN CPA01 prov ON op.COD_PROVEE COLLATE DATABASE_DEFAULT = prov.COD_PROVEE COLLATE DATABASE_DEFAULT
            WHERE oe.ESTADO = 'Transferida'
            ORDER BY oe.FECHA_MODIFICACION DESC
        `);

        console.log(`Found ${lotes.recordset.length} empty lotes and ${ops.recordset.length} transferida OPs.`);

        if (lotes.recordset.length > 0) {
            console.log("Sample Empty Lotes:");
            console.log(lotes.recordset.slice(0, 3));
        }
        if (ops.recordset.length > 0) {
            console.log("Sample Transferida OPs (recent):");
            console.log(ops.recordset.slice(0, 3));
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        sql.close();
    }
}
test();

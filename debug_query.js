
import { DBAdapter } from './server/db/adapter.js';

async function debug_query() {
    const adapter = new DBAdapter();
    const db = await adapter.connect();

    console.log("Running retention query...");
    try {
        const id = 'OP-0001';
        const retQuery = `
            SELECT 
                r.COD_RETEN as code,
                c.DESCRIPCIO as name,
                r.IMP_RETEN as amount,
                r.PORCENTAJE_RETENCION as appliedRate,
                r.BASE_CALCULO as baseAmount,
                rc.MINIMO_BASE_CALCULO as minBase
            FROM CPA29 r 
            LEFT JOIN (
                SELECT COD_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO 
                FROM CPA28 
                GROUP BY COD_RETEN
            ) c ON r.COD_RETEN = c.COD_RETEN
            LEFT JOIN RETENCION_COMPRAS rc ON r.COD_RETEN = rc.COD_RETEN
            WHERE r.N_COMP = @opNumber AND r.T_COMP = 'O/P'
        `;
        const result = await db.request()
            .input('opNumber', 'VarChar', id)
            .query(retQuery);

        console.table(result.recordset);

    } catch (e) {
        console.error("Error executing query:", e);
    }
}

debug_query().then(() => console.log("Done"));

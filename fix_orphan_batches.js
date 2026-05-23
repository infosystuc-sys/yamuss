import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function fixOrphanBatches() {
    console.log("Iniciando restauración de lotes y OPs...");
    try {
        await sql.connect(dbConfig);

        // 1. Eliminar lotes vacíos
        const deleteLotesQuery = `
            DELETE FROM APP_LOTES 
            WHERE CANTIDAD_OPS = 0 OR MONTO_TOTAL = 0
        `;
        const deleteRes = await sql.query(deleteLotesQuery);
        console.log(`Lotes vacíos eliminados: ${deleteRes.rowsAffected[0]}`);

        // 2. Revertir OPs "Transferidas" que no tienen registro en APP_LOTES_DETALLE
        const revertOpsQuery = `
            UPDATE APP_OP_ESTADOS 
            SET ESTADO = 'Revisada', 
                FECHA_MODIFICACION = GETDATE()
            WHERE ESTADO = 'Transferida' 
            AND LTRIM(RTRIM(N_COMP)) NOT IN (
                SELECT LTRIM(RTRIM(N_COMP_OP)) 
                FROM APP_LOTES_DETALLE
            )
        `;
        const revertRes = await sql.query(revertOpsQuery);
        console.log(`OPs huérfanas revertidas a 'Revisada': ${revertRes.rowsAffected[0]}`);

    } catch (e) {
        console.error("Error en el script de restauración:", e);
    } finally {
        sql.close();
        console.log("Proceso finalizado.");
    }
}

fixOrphanBatches();

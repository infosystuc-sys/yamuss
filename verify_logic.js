
import { DBAdapter } from './server/db/adapter.js';
import { initializeDatabase } from './server/db/init.js';

async function verify() {
    console.log("Starting Verification...");
    const adapter = new DBAdapter();
    const db = await adapter.connect();

    // Re-init to ensure new tables exist
    await initializeDatabase(adapter);

    console.log("Cleaning up test data...");
    if (adapter.type === 'sqlite') {
        await db.query("DELETE FROM PADRON_RENTAS WHERE CUIT = 'TEST_CUIT'");
        await db.query("DELETE FROM CPA04 WHERE N_COMP IN ('TEST_OP_1', 'TEST_OP_2')");
        // ... more cleanups
    }

    // 1. Insert Old Padron Entry (Last month)
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 1);
    const dateStr = oldDate.toISOString();

    // Cleanup first
    try {
        await db.query("DELETE FROM PADRON_RENTAS WHERE CUIT = '99112233445'");
    } catch (e) { console.log("Cleanup warning:", e.message); }

    // Using direct SQL might fail depending on adapter nuance with dates, assuming simple string/date handling
    // For PADRON_RENTAS FECHA_IMPORTACION
    // Note: init.js created FECHA_IMPORTACION as default GETDATE(). We need to update it manually to be old.

    console.log("Inserting Test Padron Data...");
    // Insert simple entry
    await db.query(`INSERT INTO PADRON_RENTAS (CUIT, EXENTO, CONVENIO, DENOMINACION, PORCENTAJE) VALUES ('99112233445', NULL, 'CM', 'TEST PROVIDER', 3.0)`);
    // Update date to be old
    // SQLite uses TEXT YYYY-MM-DD... MSSQL datetime.
    if (adapter.type === 'sqlite') {
        await db.query(`UPDATE PADRON_RENTAS SET FECHA_IMPORTACION = datetime('now', '-2 month') WHERE CUIT = '99112233445'`);
    } else {
        await db.query(`UPDATE PADRON_RENTAS SET FECHA_IMPORTACION = DATEADD(month, -2, GETDATE()) WHERE CUIT = '99112233445'`);
    }

    // 2. Insert Test CPA04/CPA29 Data
    // Case A: OP with low base amount (should be ignored due to minimum) (Config value 20000 in init.js)
    // We'll use mocked CPA04 data.

    // We reuse existing mocks but let's check what we have.
    // init.js inserts OP-0001

    // Let's ensure test data exists even if tables existed previously
    console.log("Seeding CPA01/CPA04 for OP-0001...");

    // CPA01 - PROV01
    const checkProv = await db.query("SELECT * FROM CPA01 WHERE COD_PROVEE = 'PROV01'");
    if (checkProv.recordset.length === 0) {
        await db.query(`INSERT INTO CPA01 (COD_PROVEE, NOM_PROVEE, N_CUIT, CBU) VALUES ('PROV01', 'TEST PROVIDER', '99-11223344-5', '0110000000000000000022')`);
    } else {
        // Ensure CUIT is correct for existing
        await db.query(`UPDATE CPA01 SET N_CUIT = '99-11223344-5' WHERE COD_PROVEE = 'PROV01'`);
    }

    // CPA04 - OP-0001
    const checkOP = await db.query("SELECT * FROM CPA04 WHERE N_COMP = 'OP-0001'");
    if (checkOP.recordset.length === 0) {
        // T_COMP, ESTADO defaults?
        await db.query(`INSERT INTO CPA04 (N_COMP, COD_PROVEE, FECHA_EMIS, IMPORTE_TO, T_COMP, ESTADO) VALUES ('OP-0001', 'PROV01', GETDATE(), 100000.00, 'O/P', ' ')`);
    }

    // 3. Link PROV01 (Already handled above)
    // console.log("Linking OP-0001 Provider to Test CUIT...");
    // await db.query(`UPDATE CPA01 SET N_CUIT = '99-11223344-5' WHERE COD_PROVEE = 'PROV01'`);

    // 4. Insert Test Retention (Case: Amount 0, Base 15000 < Min 20000)
    console.log("Inserting Test Retention for OP-0001...");
    // Ensure clean state
    await db.query(`DELETE FROM CPA29 WHERE N_COMP = 'OP-0001'`);

    // Insert: COD_RETEN 10 (IIBB), Amount 0, Base 15000
    await db.query(`
        INSERT INTO CPA29 (N_COMP, COD_RETEN, IMP_RETEN, PORCENTAJE_RETENCION, BASE_CALCULO, T_COMP) 
        VALUES ('OP-0001', '10', 0, 0, 15000.00, 'O/P')
    `);

    // 5. Update Config Minimo (Header Table) because creation logic skipped it (table existed)
    console.log("Updating RETENCION_COMPRAS Minimo...");
    try {
        await db.query("UPDATE RETENCION_COMPRAS SET MINIMO_BASE_CALCULO = 20000 WHERE COD_RETEN = '10'");
    } catch (e) { console.warn("Could not update config:", e.message); }

    console.log("Verification checks setup complete. Please run server and check API.");
}

verify().then(() => console.log("Done")).catch(console.error);

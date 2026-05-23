import * as dotenv from 'dotenv';
dotenv.config();
import { dbConfig } from './server/db/config.js';
import sql from 'mssql';

async function verifySchema() {
    try {
        await sql.connect(dbConfig);
        console.log(`Verifying schema for database: ${dbConfig.database}\n`);

        const requiredSchema = {
            'CPA04': ['N_COMP', 'COD_PROVEE', 'FECHA_EMIS', 'IMPORTE_TO', 'ESTADO', 'T_COMP'],
            'CPA01': ['COD_PROVEE', 'NOM_PROVEE', 'N_CUIT', 'E_MAIL', 'ING_BRUTOS', 'DOMICILIO', 'LOCALIDAD', 'CBU'],
            'SBA05': ['COD_CTA', 'LEYENDA', 'MONTO', 'COD_COMP', 'RENGLON', 'N_COMP', 'ID_SBA02'],
            'SBA01': ['COD_CTA', 'DESCRIPCIO'],
            'SBA04': ['N_COMP', 'ID_SBA02'],
            'CPA05': ['N_COMP_FAC', 'T_COMP_FAC', 'IMPORT_CAN', 'N_COMP_CAN'],
            'CPA29': ['COD_RETEN', 'IMP_RETEN', 'PORCENTAJE_RETENCION', 'IMP_PAGO', 'N_CERTIFIC', 'N_COMP', 'T_COMP'],
            'CPA28': ['COD_RETEN', 'DESCRIPCIO'],
            'RETENCION_COMPRAS': ['COD_RETEN', 'ID_RETENCION_COMPRAS'],
            'RETENCION_COMPRAS_ESCALA': ['ID_RETENCION_COMPRAS', 'MINIMO_BASE_CALCULO']
        };

        let totalMissing = 0;

        for (const [tableName, columns] of Object.entries(requiredSchema)) {
            const res = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`);
            const existingColumns = res.recordset.map(r => r.COLUMN_NAME);

            if (existingColumns.length === 0) {
                console.log(`❌ Table missing entirely: ${tableName}`);
                totalMissing++;
                continue;
            }

            const missingColumns = columns.filter(c => !existingColumns.includes(c));
            if (missingColumns.length > 0) {
                console.log(`⚠️ Table ${tableName} is MISSING columns: ${missingColumns.join(', ')}`);
                totalMissing++;
            } else {
                console.log(`✅ Table ${tableName} has all required columns.`);
            }
        }

        console.log(`\nVerification complete. Missing items found: ${totalMissing}`);

    } catch (e) {
        console.error("Verification failed:", e);
    } finally {
        sql.close();
    }
}

verifySchema();

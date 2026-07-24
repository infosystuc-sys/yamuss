/**
 * companyConfig.js
 * Datos de la empresa emisora según la base de datos activa.
 * Editar campos marcados con [COMPLETAR] antes de usar en producción.
 */
export const COMPANY_DATA = {
    CENTRAL: {
        name: 'Sanatorio CENTRAL S.R.L.',
        cuit: '30-56177226-2',
        iibb: '253.774',
        address: 'Av. Mitre 268 - CP 4000 - Tucumán',
        phone: '(0381) 4227971',
    },
    CIMSA: {
        name: 'CIMSA S.A.',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
    GALENO: {
        name: 'Galeno S.A.',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
    GALENORT: {
        name: 'Galeno Norte S.A.',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
    MITRE: {
        name: 'Sanatorio Mitre S.A.',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
    AST: {
        name: 'AST S.A.',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
    PRUEBA: {
        name: 'Base de Pruebas',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    },
};

/**
 * Retorna los datos de la empresa para la BD dada.
 * Si no existe, retorna un objeto genérico para no romper el PDF.
 */
export function getCompanyData(database) {
    return COMPANY_DATA[database] ?? {
        name: database ?? 'Empresa',
        cuit: '[COMPLETAR]',
        iibb: '[COMPLETAR]',
        address: '[COMPLETAR]',
        phone: '[COMPLETAR]',
    };
}

/**
 * Igual que getCompanyData, pero lee razón social, CUIT, domicilio (EMPRESA)
 * e ingresos brutos (CPA10) desde la base Tango de la empresa activa.
 * Cualquier dato no disponible en la base (tabla ausente, fila vacía, etc.)
 * cae al valor estático de COMPANY_DATA para no romper el PDF.
 */
export async function getCompanyDataFromDb(db, database) {
    const company = { ...getCompanyData(database) };

    try {
        const result = await db.query(
            `SELECT TOP 1 NOMBRE_LEGAL, CUIT, CALLE_LEGAL, NRO_DOMIC_LEGAL, LOCALIDAD_LEGAL FROM EMPRESA`
        );
        const row = result.recordset?.[0];
        if (row) {
            if (row.NOMBRE_LEGAL) company.name = String(row.NOMBRE_LEGAL).trim();
            if (row.CUIT) company.cuit = String(row.CUIT).trim();

            const calle = String(row.CALLE_LEGAL ?? '').trim();
            const nro = String(row.NRO_DOMIC_LEGAL ?? '').trim();
            const localidad = String(row.LOCALIDAD_LEGAL ?? '').trim();
            const calleConNro = `${calle} ${nro}`.trim();
            if (calleConNro || localidad) {
                company.address = [calleConNro, localidad, 'TUCUMAN - CP 4000'].filter(Boolean).join(' - ');
            }
        }
    } catch (e) {
        console.warn(`⚠️  No se pudo leer EMPRESA en ${database}, se usan datos estáticos: ${e.message}`);
    }

    try {
        const result = await db.query(`SELECT TOP 1 N_ING_BRUT FROM CPA10`);
        const row = result.recordset?.[0];
        if (row?.N_ING_BRUT) company.iibb = String(row.N_ING_BRUT).trim();
    } catch (e) {
        console.warn(`⚠️  No se pudo leer CPA10 en ${database}, se usa IIBB estático: ${e.message}`);
    }

    return company;
}

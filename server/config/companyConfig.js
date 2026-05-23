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


import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const isPkg = typeof process.pkg !== 'undefined';
let envPath;

if (isPkg) {
    // Si corre como .exe, buscar .env junto al ejecutable
    envPath = path.join(path.dirname(process.execPath), '.env');
    if (!fs.existsSync(envPath)) {
        // Fallback al directorio activo desde donde se ejecutó el .exe en consola
        envPath = path.join(process.cwd(), '.env');
    }
} else {
    // Si corre normal con Node, resolver ruta relativa
    const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    envPath = path.resolve(currentDir, '../../.env');
}

dotenv.config({ path: envPath });

// Parsear SERVER\INSTANCE
const dbServerRaw = process.env.DB_SERVER || 'localhost';
const [serverHost, instanceName] = dbServerRaw.split('\\');

/**
 * Retorna la configuración de mssql para una base de datos específica.
 * @param {string} database - Nombre de la BD (ej: 'CENTRAL', 'CIMSA', etc.)
 */
export function getDbConfig(database) {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: serverHost,
        database: database || process.env.DB_DATABASE || 'CENTRAL',
        port: parseInt(process.env.DB_PORT) || 1433,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            instanceName: instanceName,
            requestTimeout: 60000,
            useUTC: false
        },
        connectTimeout: 30000,
        requestTimeout: 60000,
        pool: {
            max: 20,
            min: 0,
            idleTimeoutMillis: 60000
        }
    };
}

// Config por defecto (compatibilidad hacia atrás)
export const dbConfig = getDbConfig(process.env.DB_DATABASE);

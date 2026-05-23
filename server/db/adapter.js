import sql from 'mssql';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { getDbConfig } from './config.js';

// ============================================================
// POOL CACHE — Un pool por empresa. Nunca se comparten.
// ============================================================
const poolCache = new Map();
let sqliteDb = null; // Fallback SQLite único (dev)
let globalType = 'mssql'; // Tipo activo

/**
 * Obtiene (o crea) el sql.ConnectionPool para la base de datos pedida.
 * Usa caché para no reconectar en cada request.
 * @param {string} database - Nombre de la BD (e.g. 'CENTRAL', 'CIMSA')
 */
async function getOrCreatePool(database) {
    const key = database || 'default';

    if (poolCache.has(key)) {
        const pool = poolCache.get(key);
        // Verificar que el pool sigue conectado
        if (pool.connected) {
            return pool;
        }
        // Si el pool se cayó, eliminarlo para reconectar
        poolCache.delete(key);
    }

    console.log(`🔌 Creando nuevo pool para base de datos: '${key}'`);
    const config = getDbConfig(database);
    const pool = new sql.ConnectionPool(config);

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Connection Timeout para '${key}'`)), 30000)
    );

    await Promise.race([pool.connect(), timeoutPromise]);

    poolCache.set(key, pool);

    const info = await pool.request().query(
        `SELECT @@SERVERNAME as name, DB_NAME() as db_name`
    );
    console.log(`✅ Pool listo: [${info.recordset[0].db_name}] en ${info.recordset[0].name}`);

    return pool;
}

/**
 * Ejecuta un callback dentro de una transacción SQL Server.
 * @param {string} database - Nombre de la BD
 * @param {Function} fn - (request) => Promise<result>
 * @returns {Promise<any>}
 */
export async function runMssqlTransaction(database, fn) {
    const pool = await getOrCreatePool(database);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const result = await fn(new sql.Request(transaction));
        await transaction.commit();
        return result;
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

// ============================================================
// DBSession — Wrapper aislado por request. NO es singleton.
// Cada getDb(req) retorna una instancia nueva con su pool.
// ============================================================
class DBSession {
    constructor(pool, type, sqlite) {
        this.pool = pool;      // sql.ConnectionPool o null
        this.type = type;      // 'mssql' | 'sqlite'
        this.sqliteDb = sqlite; // sqlite handle o null
    }

    request() {
        if (this.type === 'mssql') {
            return new MSSQLRequestBuilder(this.pool);
        }
        return new SQLiteRequestBuilder(this.sqliteDb);
    }

    async query(sqlString) {
        return this.request().query(sqlString);
    }
}

// ============================================================
// DBAdapter — Solo se usa para la conexión inicial (startServer)
// Las rutas usan createSession(database) directamente.
// ============================================================
export class DBAdapter {
    constructor() {
        this.type = 'mssql';
        this._session = null; // sesión actual para initializeDatabase
    }

    async connect(database) {
        try {
            const pool = await getOrCreatePool(database);
            globalType = 'mssql';
            this.type = 'mssql';
            this._session = new DBSession(pool, 'mssql', null);
            return this._session;
        } catch (error) {
            console.warn(`⚠️  Falló SQL Server (${database}): ${error.message}`);
            return this._switchToSQLite();
        }
    }

    async _switchToSQLite() {
        console.log('🔄 Cambiando a SQLite Fallback...');
        if (!sqliteDb) {
            sqliteDb = await open({ filename: './local.db', driver: sqlite3.Database });
            console.log('✅ Conectado a SQLite (local.db).');
        }
        globalType = 'sqlite';
        this.type = 'sqlite';
        this._session = new DBSession(null, 'sqlite', sqliteDb);
        return this._session;
    }

    // Proxy para que initializeDatabase pueda llamar adapter.query / adapter.type
    get type() { return this._type || 'mssql'; }
    set type(v) { this._type = v; }

    request() { return this._session?.request(); }
    async query(s) { return this._session?.query(s); }
}

/**
 * FUNCIÓN PRINCIPAL para los route handlers.
 * Retorna una DBSession aislada para la bd del usuario autenticado.
 * NO muta estado compartido.
 *
 * @param {string} database - Nombre de BD extraído del JWT
 */
export async function createSession(database) {
    if (globalType === 'sqlite' || !database) {
        // Fallback SQLite activo
        if (!sqliteDb) {
            sqliteDb = await open({ filename: './local.db', driver: sqlite3.Database });
        }
        return new DBSession(null, 'sqlite', sqliteDb);
    }

    try {
        const pool = await getOrCreatePool(database);
        return new DBSession(pool, 'mssql', null);
    } catch (err) {
        console.warn(`⚠️  No se pudo obtener pool para '${database}': ${err.message}`);
        if (!sqliteDb) {
            sqliteDb = await open({ filename: './local.db', driver: sqlite3.Database });
        }
        return new DBSession(null, 'sqlite', sqliteDb);
    }
}

// ============================================================
// Request Builders
// ============================================================
class MSSQLRequestBuilder {
    constructor(pool) {
        this.req = pool.request();
    }

    input(name, type, value) {
        let sqlType = type;
        if (typeof type === 'string') {
            const typeName = Object.keys(sql.TYPES).find(k => k.toLowerCase() === type.toLowerCase());
            sqlType = typeName ? sql[typeName] : sql.VarChar;
        }
        this.req.input(name, sqlType, value);
        return this;
    }

    async query(text) {
        return this.req.query(text);
    }
}

class SQLiteRequestBuilder {
    constructor(db) {
        this.db = db;
        this.params = {};
    }

    input(name, type, value) {
        this.params[`@${name}`] = value;
        return this;
    }

    async query(text) {
        try {
            let q = text
                .replace(/GETDATE\(\)/gi, "datetime('now', 'localtime')")
                .replace(/WITH \(NOLOCK\)/gi, '')
                .replace(/COLLATE Latin1_General_BIN/gi, '')
                .replace(/ISNULL\(([^,]+),\s*([^)]+)\)/gi, 'IFNULL($1, $2)')
                .replace(/OUTPUT INSERTED\.\w+/gi, '');

            const topMatch = q.match(/SELECT\s+TOP\s+(\d+)/i);
            if (topMatch) {
                const limit = topMatch[1];
                q = q.replace(/SELECT\s+TOP\s+\d+/i, 'SELECT');
                q += ` LIMIT ${limit}`;
            }

            if (q.trim().toUpperCase().startsWith('SELECT') || q.trim().toUpperCase().startsWith('PRAGMA')) {
                const rows = await this.db.all(q, this.params);
                return { recordset: rows };
            } else {
                const result = await this.db.run(q, this.params);
                if (q.includes('INSERT INTO SBA04')) {
                    return { recordset: [{ ID_SBA04: result.lastID }] };
                }
                return { rowsAffected: [result.changes] };
            }
        } catch (e) {
            console.error('SQLite Query Error:', e.message, '\nQuery:', text);
            throw e;
        }
    }
}

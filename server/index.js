import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { DBAdapter, createSession, runMssqlTransaction } from './db/adapter.js';
import { initializeDatabase } from './db/init.js';
import { importarPadron } from './controllers/importarPadron.js';
import { importarPadronTEM } from './controllers/importarPadronTEM.js';
import { authenticate, requireRole, generateToken } from './middleware/authMiddleware.js';
import { generateComprobantePDF } from './services/pdfService.js';
import { generateLotePDF } from './services/batchPdfService.js';
import { sendComprobante } from './services/emailService.js';
import { getCompanyDataFromDb } from './config/companyConfig.js';

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3002;

// BD maestra: donde viven APP_USUARIOS, APP_OP_ESTADOS, PADRON_RENTAS
// Las otras empresas solo tienen tablas Tango (CPA04, CPA01, etc.)
const MASTER_DB = process.env.DB_DATABASE || 'CENTRAL';

// Adapter global (maneja cache de pools internamente)
const adapter = new DBAdapter();

// -------------------------------------------------------------------------
// Middleware global
// -------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------------------
// Helper: sesión aislada por empresa (usa pool cache, no muta estado global)
// -------------------------------------------------------------------------
async function getDb(req) {
    const database = req.user?.database;
    if (!database) throw new Error('No hay base de datos en el token del usuario.');
    return createSession(database);
}

// Sesión separada para la BD maestra (APP_OP_ESTADOS, PADRON_RENTAS, etc.)
async function getMasterDb() {
    return createSession(MASTER_DB);
}

// Lookup rápido de estados desde la BD maestra dado un array de N_COMP
// Se consulta en lotes: SQL Server admite un máximo de 2100 parámetros por consulta.
const FETCH_ESTADOS_BATCH_SIZE = 1900;

async function fetchEstados(nComps) {
    if (!nComps || nComps.length === 0) return {};
    const masterDb = await getMasterDb();
    const map = {};

    for (let i = 0; i < nComps.length; i += FETCH_ESTADOS_BATCH_SIZE) {
        const chunk = nComps.slice(i, i + FETCH_ESTADOS_BATCH_SIZE);
        const placeholders = chunk.map((_, j) => `@comp${j}`).join(',');
        const req = masterDb.request();
        chunk.forEach((n, j) => req.input(`comp${j}`, 'VarChar', n));
        const result = await req.query(
            `SELECT N_COMP, ESTADO, ISNULL(EMAIL_ENVIADO, 0) as EMAIL_ENVIADO FROM APP_OP_ESTADOS WITH (NOLOCK) WHERE N_COMP IN (${placeholders})`
        );
        for (const row of result.recordset) {
            map[row.N_COMP] = { estado: row.ESTADO, emailEnviado: !!row.EMAIL_ENVIADO };
        }
    }

    return map;
}

import path from 'path';
import { fileURLToPath } from 'url';
import { exec as execProcess } from 'child_process';

// En pkg/CommonJS, __dirname funciona nativamente. 
// Para que funcione tanto en ESM (desarrollo) como en CJS (pkg), usamos un fallback robusto pero evitando error de import.meta
const isPkg = typeof process.pkg !== 'undefined';
let currentDir;
try {
    currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
    currentDir = process.cwd();
}

// -------------------------------------------------------------------------
// RUTAS PÚBLICAS (sin autenticación)
// -------------------------------------------------------------------------

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// Servir el frontend compilado (React)
// Buscamos la carpeta dist relativa al ejecutable real o al directorio actual
const basePath = isPkg ? path.dirname(process.execPath) : currentDir;
const distPath = path.join(basePath, isPkg ? 'dist' : '../dist');
app.use(express.static(distPath));

// Endpoint de Login
app.post('/api/login', async (req, res) => {
    const { username, password, database } = req.body;

    if (!username || !password || !database) {
        return res.status(400).json({ error: 'Usuario, contraseña y empresa son requeridos.' });
    }

    const VALID_DATABASES = ['CIMSA', 'CENTRAL', 'GALENO', 'GALENORT', 'MITRE', 'AST', 'PRUEBA'];
    if (!VALID_DATABASES.includes(database)) {
        return res.status(400).json({ error: 'Empresa no válida.' });
    }

    try {
        const masterDb = process.env.DB_DATABASE || 'CENTRAL';
        const db = await createSession(masterDb);

        // Autenticar contra la nueva tabla USUARIOS (con JOIN a ROLES)
        const result = await db.request()
            .input('usuario', 'VarChar', username.toUpperCase())
            .query(`
                SELECT u.ID, u.Usuario, u.Password, u.PrimerLogin, u.Activo, r.Nombre as Rol
                FROM USUARIOS u
                JOIN ROLES r ON u.RolId = r.ID
                WHERE u.Usuario = @usuario
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado.' });
        }

        const user = result.recordset[0];

        if (!user.Activo) {
            return res.status(401).json({ error: 'Usuario inactivo. Contacte al administrador.' });
        }

        if (user.Password !== password && user.Password !== password.toString()) {
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        const primerLogin = user.PrimerLogin === 1 || user.PrimerLogin === true;

        const token = generateToken({
            username: user.Usuario,
            role: user.Rol,
            database: database
        });

        console.log(`✅ Login: ${user.Usuario} | Rol: ${user.Rol} | Empresa: ${database} | PrimerLogin: ${primerLogin}`);

        return res.json({
            success: true,
            token,
            user: { username: user.Usuario, role: user.Rol, database, primerLogin }
        });

    } catch (e) {
        console.error("Login error:", e);
        res.status(500).json({ error: 'Error de servidor al autenticar.' });
    }
});

// -------------------------------------------------------------------------
// RUTAS PROTEGIDAS (requieren JWT)
// -------------------------------------------------------------------------

// Aplicar authenticate a TODAS las rutas de API siguientes
app.use('/api', authenticate);

// Cambiar contraseña (tabla USUARIOS en BD maestra)
app.post('/api/auth/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const { username } = req.user;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas.' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }

    try {
        const masterDb = process.env.DB_DATABASE || 'CENTRAL';
        const db = await createSession(masterDb);

        const result = await db.request()
            .input('usuario', 'VarChar', username)
            .query("SELECT Password FROM USUARIOS WHERE Usuario = @usuario");

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        if (result.recordset[0].Password !== currentPassword) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
        }

        await db.request()
            .input('newPass', 'VarChar', newPassword)
            .input('usuario', 'VarChar', username)
            .query("UPDATE USUARIOS SET Password = @newPass, PrimerLogin = 0 WHERE Usuario = @usuario");

        console.log(`🔑 Contraseña cambiada para: ${username}`);
        res.json({ success: true, message: 'Contraseña actualizada correctamente.' });

    } catch (e) {
        console.error("Change password error:", e);
        res.status(500).json({ error: 'Error al cambiar contraseña.' });
    }
});

// Cambiar de empresa
app.post('/api/auth/switch', async (req, res) => {
    const { database } = req.body;
    const { username, role } = req.user;

    if (!database) {
        return res.status(400).json({ error: 'La empresa es requerida.' });
    }

    const VALID_DATABASES = ['CIMSA', 'CENTRAL', 'GALENO', 'GALENORT', 'MITRE', 'AST', 'PRUEBA'];
    if (!VALID_DATABASES.includes(database)) {
        return res.status(400).json({ error: 'Empresa no válida.' });
    }

    try {
        const token = generateToken({
            username,
            role,
            database
        });

        console.log(`🔄 Cambio de empresa: ${username} a ${database}`);

        return res.json({
            success: true,
            token,
            user: { username, role, database }
        });
    } catch (e) {
        console.error("Switch company error:", e);
        res.status(500).json({ error: 'Error al cambiar de empresa.' });
    }
});

// Debug schema
app.get('/api/debug-schema', async (req, res) => {
    try {
        const db = await getDb(req);
        const result = await db.query("SELECT * FROM APP_USUARIOS");
        res.json(result.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Consultar Padrón por CUIT (Rentas + TEM)
app.get('/api/padron/consulta', async (req, res) => {
    const cuit = (req.query.cuit || '').trim().replace(/\D/g, '');
    if (!cuit || cuit.length !== 11) {
        return res.status(400).json({ error: 'El CUIT debe tener exactamente 11 dígitos.' });
    }
    try {
        const masterDb = await getMasterDb();

        const rentasResult = await masterDb.request()
            .input('cuit', 'VarChar', cuit)
            .query(`SELECT CUIT, EXENTO, CONVENIO, DENOMINACION, PORCENTAJE, PERIODO, FECHA_IMPORTACION FROM PADRON_RENTAS WHERE CUIT = @cuit`);

        let temResult = { recordset: [] };
        try {
            temResult = await masterDb.request()
                .input('cuit', 'VarChar', cuit)
                .query(`SELECT CUIT, NOMBRE, PERIODO, FECHA_IMPORTACION FROM PADRON_TEM WHERE CUIT = @cuit`);
        } catch (_) {}

        res.json({
            cuit,
            rentas: rentasResult.recordset[0] || null,
            tem: temResult.recordset[0] || null,
        });
    } catch (e) {
        console.error('Error consultando padrón:', e);
        res.status(500).json({ error: e.message });
    }
});

// ---- GESTIÓN DE USUARIOS Y ROLES (solo ADMINISTRADOR) ----

// Listar roles
app.get('/api/roles', requireRole('ADMINISTRADOR'), async (req, res) => {
    try {
        const db = await getMasterDb();
        const result = await db.query("SELECT ID, Nombre, Descripcion FROM ROLES ORDER BY Nombre");
        res.json(result.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Listar usuarios
app.get('/api/users', requireRole('ADMINISTRADOR'), async (req, res) => {
    try {
        const db = await getMasterDb();
        const result = await db.query(`
            SELECT u.ID, u.Usuario, u.Activo, u.PrimerLogin, u.FechaCreacion, r.Nombre as Rol, r.ID as RolId
            FROM USUARIOS u
            JOIN ROLES r ON u.RolId = r.ID
            ORDER BY u.Usuario
        `);
        res.json(result.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Crear usuario (password por defecto: 1234, PrimerLogin: 1)
app.post('/api/users', requireRole('ADMINISTRADOR'), async (req, res) => {
    const { usuario, rolId } = req.body;
    if (!usuario || !rolId) {
        return res.status(400).json({ error: 'Usuario y rol son requeridos.' });
    }
    const cleanUsuario = String(usuario).trim().toUpperCase();
    if (cleanUsuario.length < 3) {
        return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
    }
    try {
        const db = await getMasterDb();
        const check = await db.request()
            .input('usu', 'VarChar', cleanUsuario)
            .query("SELECT ID FROM USUARIOS WHERE Usuario = @usu");
        if (check.recordset.length > 0) {
            return res.status(409).json({ error: `El usuario '${cleanUsuario}' ya existe.` });
        }
        await db.request()
            .input('usu', 'VarChar', cleanUsuario)
            .input('rolId', 'Int', parseInt(rolId, 10))
            .query(`
                INSERT INTO USUARIOS (Usuario, Password, RolId, PrimerLogin, Activo)
                VALUES (@usu, '1234', @rolId, 1, 1)
            `);
        console.log(`👤 Usuario creado: ${cleanUsuario} | RolId: ${rolId}`);
        res.json({ success: true, message: `Usuario '${cleanUsuario}' creado con contraseña por defecto 1234.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Actualizar usuario (rol y/o estado activo)
app.put('/api/users/:id', requireRole('ADMINISTRADOR'), async (req, res) => {
    const { id } = req.params;
    const { rolId, activo } = req.body;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'ID inválido.' });
    try {
        const db = await getMasterDb();
        const sets = [];
        if (rolId !== undefined) sets.push(`RolId = ${parseInt(rolId, 10)}`);
        if (activo !== undefined) sets.push(`Activo = ${activo ? 1 : 0}`);
        if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });
        await db.query(`UPDATE USUARIOS SET ${sets.join(', ')} WHERE ID = ${userId}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Resetear contraseña a '1234' y activar primer login
app.post('/api/users/:id/reset-password', requireRole('ADMINISTRADOR'), async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'ID inválido.' });
    try {
        const db = await getMasterDb();
        await db.query(`UPDATE USUARIOS SET Password = '1234', PrimerLogin = 1 WHERE ID = ${userId}`);
        res.json({ success: true, message: 'Contraseña restablecida a 1234.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar usuario
app.delete('/api/users/:id', requireRole('ADMINISTRADOR'), async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'ID inválido.' });
    try {
        const db = await getMasterDb();
        // No permitir eliminar el propio usuario
        const selfCheck = await db.request()
            .input('id', 'Int', userId)
            .input('usu', 'VarChar', req.user.username)
            .query("SELECT ID FROM USUARIOS WHERE ID = @id AND Usuario = @usu");
        if (selfCheck.recordset.length > 0) {
            return res.status(400).json({ error: 'No puede eliminar su propio usuario.' });
        }
        await db.query(`DELETE FROM USUARIOS WHERE ID = ${userId}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---- PARÁMETROS INICIALES ----

app.get('/api/settings', requireRole('ADMINISTRADOR'), async (req, res) => {
    try {
        const masterDb = await getMasterDb();
        const result = await masterDb.request()
            .query(`SELECT CLAVE, VALOR, DESCRIPCION FROM ${MASTER_DB}.dbo.APP_CONFIG`);
        const settings = {};
        for (const row of result.recordset) {
            settings[row.CLAVE] = { valor: row.VALOR || '', descripcion: row.DESCRIPCION || '' };
        }
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/settings', requireRole('ADMINISTRADOR'), async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Payload inválido' });
        const masterDb = await getMasterDb();
        for (const [clave, valor] of Object.entries(settings)) {
            const valorStr = String(valor ?? '');
            const upd = await masterDb.request()
                .input('clave', 'VarChar', clave)
                .input('valor', 'VarChar', valorStr)
                .query(`UPDATE APP_CONFIG SET VALOR = @valor, FECHA_MODIFICACION = GETDATE() WHERE CLAVE = @clave`);
            if ((upd.rowsAffected?.[0] ?? 0) === 0) {
                await masterDb.request()
                    .input('clave', 'VarChar', clave)
                    .input('valor', 'VarChar', valorStr)
                    .query(`INSERT INTO APP_CONFIG (CLAVE, VALOR, DESCRIPCION) VALUES (@clave, @valor, '')`);
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Importar Padrón Rentas (ADMINISTRADOR u OPERADOR)
app.post('/api/padron/import', authenticate, requireRole('ADMINISTRADOR', 'OPERADOR'), upload.single('file'), (req, res) => {
    importarPadron(req, res, adapter);
});

// Importar Padrón TEM (ADMINISTRADOR u OPERADOR)
app.post('/api/padron-tem/import', authenticate, requireRole('ADMINISTRADOR', 'OPERADOR'), upload.single('file'), (req, res) => {
    importarPadronTEM(req, res, adapter);
});

// ---- ÓRDENES DE PAGO ----

app.get('/api/orders/:id', async (req, res) => {
    try {
        const id = req.params.id.trim();
        const db = await getDb(req);

        const query = `
            SELECT
                op.N_COMP as number,
                op.COD_PROVEE as providerId,
                prov.NOM_PROVEE as providerName,
                prov.N_CUIT as cuit,
                op.FECHA_EMIS as date,
                op.IMPORTE_TO as amount,
                op.ESTADO as tangoStatus
            FROM CPA04 op WITH (NOLOCK)
            LEFT JOIN CPA01 prov WITH (NOLOCK) ON op.COD_PROVEE = prov.COD_PROVEE
            WHERE LTRIM(RTRIM(op.N_COMP)) = LTRIM(RTRIM(@id))
        `;

        const result = await db.request()
            .input('id', 'VarChar', id)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Orden de pago no encontrada' });
        }

        const row = result.recordset[0];
        const cleanNumber = (row.number || '').trim();
        const estados = await fetchEstados([cleanNumber]);
        const appStatus = estados[cleanNumber]?.estado || 'Pendiente';

        // Diagnóstico: ver registros crudos en SBA05 para esta OP
        try {
            const testDB = await db.request()
                .input('id', 'VarChar', id)
                .query(`SELECT TOP 5 COD_COMP, N_COMP, COD_CTA, MONTO FROM SBA05 WITH (NOLOCK) WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`);
            console.log('>>> TEST SBA05 para OP', id, ':', JSON.stringify(testDB.recordset, null, 2));
        } catch (testErr) {
            console.log('>>> TEST SBA05 error:', testErr.message);
        }

        let treasuryMovements = [];
        try {
            const treasuryQuery = `
                SELECT
                    s5.COD_CTA as cuenta,
                    ISNULL(s1.DESCRIPCIO, 'Sin descripción') as descripcion,
                    s5.LEYENDA as leyenda,
                    s5.MONTO as importe
                FROM SBA05 s5 WITH (NOLOCK)
                LEFT JOIN SBA01 s1 WITH (NOLOCK) ON s5.COD_CTA = s1.COD_CTA
                WHERE LTRIM(RTRIM(s5.N_COMP)) = LTRIM(RTRIM(@id))
                  AND REPLACE(s5.COD_COMP, '/', '') LIKE '%OP%'
                  AND s5.RENGLON > 0
            `;
            const treasuryResult = await db.request()
                .input('id', 'VarChar', id)
                .query(treasuryQuery);
            console.log('>>> [DEBUG BACKEND] Resultado Tesorería para OP', id, ':', treasuryResult.recordset);
            treasuryMovements = (treasuryResult.recordset || []).map(r => ({
                cuenta: String(r.cuenta ?? '').trim(),
                descripcion: String(r.descripcion ?? '').trim(),
                leyenda: String(r.leyenda ?? '').trim(),
                monto: Number(r.importe ?? r.monto) || 0,
            }));
        } catch (treasuryErr) {
            console.warn(`⚠️ No se pudieron obtener movimientos de tesorería para OP ${id}:`, treasuryErr.message);
        }

        res.json({
            id: cleanNumber,
            number: cleanNumber,
            provider: row.providerName || row.providerId,
            cuit: row.cuit,
            date: row.date ? (() => { const d = new Date(row.date); const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); const yyyy = d.getFullYear(); return `${dd}/${mm}/${yyyy}`; })() : null,
            grossAmount: row.amount,
            netAmount: row.amount,
            status: appStatus,
            initials: (row.providerName || row.providerId).substring(0, 2).toUpperCase(),
            treasuryMovements,
        });
    } catch (e) {
        console.error("Error fetching single order:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { status } = req.query;
        const db = await getDb(req);

        // 1. Traer órdenes de CPA04+CPA01 sin cross-DB join (rápido)
        const query = `
            SELECT TOP 300
                op.N_COMP as number,
                op.COD_PROVEE as providerId,
                prov.COD_PROVEE as providerCode,
                prov.NOM_PROVEE as providerName,
                ISNULL(prov.N_CUIT, '') as cuit,
                ISNULL(prov.CBU, '') as cbu,
                ISNULL(prov.E_MAIL, '') as email,
                op.FECHA_EMIS as date,
                op.IMPORTE_TO as amount
            FROM CPA04 op WITH (NOLOCK)
            LEFT JOIN CPA01 prov WITH (NOLOCK) ON op.COD_PROVEE = prov.COD_PROVEE
            WHERE op.ESTADO <> 'ANU' AND op.T_COMP = 'O/P'
            ORDER BY op.FECHA_EMIS DESC
        `;

        const result = await db.query(query);
        const rows = result.recordset;

        if (rows.length === 0) return res.json([]);

        // 2. Lookup de estados en BD maestra (query separada, sin COLLATE)
        const nComps = rows.map(r => (r.number || '').trim());
        const estadosMap = await fetchEstados(nComps);

        // 3. Combinar y filtrar por status si hay filtro
        let orders = rows.map(row => {
            const num = (row.number || '').trim();
            return {
                id: num,
                number: num,
                provider: row.providerName || row.providerId,
                providerCode: String(row.providerCode ?? row.providerId ?? '').trim(),
                cuit: (row.cuit || '').trim(),
                cbu: (row.cbu || '').trim(),
                email: (row.email || '').trim(),
                date: new Date(row.date).toISOString().split('T')[0],
                grossAmount: row.amount,
                netAmount: row.amount,
                status: estadosMap[num]?.estado || 'Pendiente',
                emailEnviado: estadosMap[num]?.emailEnviado || false,
                initials: (row.providerName || row.providerId || '?').substring(0, 2).toUpperCase()
            };
        });

        if (status === 'PENDING') orders = orders.filter(o => o.status === 'Pendiente');
        if (status === 'REVISED') orders = orders.filter(o => o.status === 'Revisada');
        if (status === 'PROCESSED') orders = orders.filter(o => o.status === 'Transferida');

        res.json(orders);
    } catch (e) {
        console.error("Error fetching orders:", e);
        res.status(500).json({ error: e.message });
    }
});

// Facturas de una OP
app.get('/api/orders/:id/invoices', async (req, res) => {
    try {
        const id = req.params.id.trim();
        const db = await getDb(req);

        const query = `
            SELECT 
                imp.N_COMP_FAC as invoiceNumber,
                imp.T_COMP_FAC as invoiceType,
                imp.IMPORT_CAN as amountPaid
            FROM CPA05 imp WITH (NOLOCK)
            WHERE LTRIM(RTRIM(imp.N_COMP_CAN)) = LTRIM(RTRIM(@opNumber))
        `;

        const result = await db.request()
            .input('opNumber', 'VarChar', id)
            .query(query);

        res.json(result.recordset);
    } catch (e) {
        console.error("Error fetching invoices:", e);
        res.status(500).json({ error: e.message });
    }
});

// Retenciones y validación padrón
app.get('/api/orders/:id/retentions', async (req, res) => {
    try {
        const id = req.params.id.trim();
        const db = await getDb(req);

        // Query INDEPENDIENTE: solo CPA29 + CPA28. Sin JOIN con facturas (CPA05).
        let retResult;
        try {
            const retQuery = `
                SELECT 
                    r.COD_RETEN as code,
                    MAX(ISNULL(c.DESCRIPCIO, r.COD_RETEN)) as name,
                    SUM(r.IMP_RETEN) as amount,
                    MAX(r.PORCENTAJE_RETENCION) as appliedRate,
                    SUM(r.IMP_PAGO) as baseAmount,
                    MAX(rc.MINIMO_BASE_CALCULO) as minBase,
                    MAX(r.N_CERTIFIC) as certificado
                FROM CPA29 r WITH (NOLOCK)
                LEFT JOIN (
                    SELECT COD_RETEN, TIPO_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO
                    FROM CPA28 WITH (NOLOCK)
                    GROUP BY COD_RETEN, TIPO_RETEN
                ) c ON r.COD_RETEN = c.COD_RETEN AND r.TIPO_RETEN = c.TIPO_RETEN
                LEFT JOIN (
                    SELECT rc2.COD_RETEN, MAX(rce.MINIMO_BASE_CALCULO) as MINIMO_BASE_CALCULO
                    FROM RETENCION_COMPRAS rc2
                    INNER JOIN RETENCION_COMPRAS_ESCALA rce ON rc2.ID_RETENCION_COMPRAS = rce.ID_RETENCION_COMPRAS
                    GROUP BY rc2.COD_RETEN
                ) rc ON r.COD_RETEN = rc.COD_RETEN
                WHERE LTRIM(RTRIM(r.N_COMP)) = LTRIM(RTRIM(@opNumber)) AND r.T_COMP = 'O/P'
                GROUP BY r.COD_RETEN
            `;
            retResult = await db.request().input('opNumber', 'VarChar', id).query(retQuery);
        } catch (rcErr) {
            const retQuerySimple = `
                SELECT 
                    r.COD_RETEN as code,
                    MAX(ISNULL(c.DESCRIPCIO, r.COD_RETEN)) as name,
                    SUM(r.IMP_RETEN) as amount,
                    MAX(r.PORCENTAJE_RETENCION) as appliedRate,
                    SUM(r.IMP_PAGO) as baseAmount,
                    MAX(r.N_CERTIFIC) as certificado
                FROM CPA29 r WITH (NOLOCK)
                LEFT JOIN (
                    SELECT COD_RETEN, TIPO_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO
                    FROM CPA28 WITH (NOLOCK)
                    GROUP BY COD_RETEN, TIPO_RETEN
                ) c ON r.COD_RETEN = c.COD_RETEN AND r.TIPO_RETEN = c.TIPO_RETEN
                WHERE LTRIM(RTRIM(r.N_COMP)) = LTRIM(RTRIM(@opNumber)) AND r.T_COMP = 'O/P'
                GROUP BY r.COD_RETEN
            `;
            retResult = await db.request().input('opNumber', 'VarChar', id).query(retQuerySimple);
        }

        // Consolidación final en JS: una fila por impuesto con suma correcta (idéntico al PDF)
        const rawRows = retResult.recordset || [];
        const consolidatedMap = new Map();
        for (const row of rawRows) {
            const key = (row.code || '').trim();
            if (!key) continue;
            const existing = consolidatedMap.get(key);
            const amount = Number(row.amount) || 0;
            const baseAmount = Number(row.baseAmount) || 0;
            if (existing) {
                existing.amount += amount;
                existing.baseAmount += baseAmount;
            } else {
                consolidatedMap.set(key, {
                    code: row.code,
                    name: row.name || row.code,
                    amount,
                    appliedRate: row.appliedRate,
                    baseAmount,
                    minBase: row.minBase,
                    certificado: row.certificado ? String(row.certificado).trim() : '',
                });
            }
        }
        const retentions = Array.from(consolidatedMap.values());

        const provQuery = `
            SELECT REPLACE(REPLACE(prov.N_CUIT, '-', ''), ' ', '') as CUIT 
            FROM CPA04 op WITH (NOLOCK)
            JOIN CPA01 prov WITH (NOLOCK) ON op.COD_PROVEE = prov.COD_PROVEE
            WHERE LTRIM(RTRIM(op.N_COMP)) = LTRIM(RTRIM(@opNumber))
        `;
        const provResult = await db.request()
            .input('opNumber', 'VarChar', id)
            .query(provQuery);

        const cuit = provResult.recordset[0]?.CUIT;

        let padronData = null;
        let convenio = '';
        let validation = { status: 'OK', message: 'Coincide con padrón' };
        let temValidation = null;

        if (cuit) {
            const cleanCuit = cuit.trim();

            const padronQuery = `SELECT PORCENTAJE as ALICUOTA, CONVENIO, FECHA_IMPORTACION FROM ${MASTER_DB}.dbo.PADRON_RENTAS WHERE CUIT = @cuit`;
            const padronResult = await db.request()
                .input('cuit', 'VarChar', cleanCuit)
                .query(padronQuery);

            if (padronResult.recordset.length > 0) {
                padronData = padronResult.recordset[0];
                const padronRate = padronData.ALICUOTA;
                convenio = (padronData.CONVENIO || '').trim().toUpperCase();
                // Convenio Multilateral (CM): la retención de IIBB se aplica sobre la mitad de la alícuota
                const expectedIIBBRate = convenio === 'CM' ? padronRate / 2 : padronRate;
                const importDate = padronData.FECHA_IMPORTACION ? new Date(padronData.FECHA_IMPORTACION) : null;

                if (importDate) {
                    const now = new Date();
                    const isOld = (importDate.getMonth() < now.getMonth() && importDate.getFullYear() === now.getFullYear()) || (importDate.getFullYear() < now.getFullYear());

                    if (isOld) {
                        validation = {
                            status: 'WARNING',
                            message: `Atención: El padrón fue importado en ${importDate.toLocaleDateString()}. Puede estar desactualizado.`
                        };
                    }
                }

                const iibbRet = retentions.find(r => {
                    const name = (r.name || '').toUpperCase();
                    return name.includes('BRUTOS') || name.includes('IIBB') || name.includes('IB') || name.includes('RENTAS');
                });

                const convenioLabel = convenio === 'CM' ? ` (CM: ${padronRate}% ÷ 2)` : '';

                if (iibbRet) {
                    if (iibbRet.amount > 0) {
                        const effectiveRate = (iibbRet.amount / iibbRet.baseAmount) * 100;
                        const rateMatch = Math.abs(effectiveRate - expectedIIBBRate) < 0.05;

                        if (rateMatch && validation.status !== 'WARNING') {
                            validation = { status: 'OK', message: `Coincide: ${expectedIIBBRate}%${convenioLabel} (IIBB Detectado)` };
                        } else if (!rateMatch) {
                            validation = {
                                status: 'ERROR',
                                message: `Discrepancia: se esperaba ${expectedIIBBRate}%${convenioLabel}, pero se retuvo efectivamente un ${effectiveRate.toFixed(2)}%`
                            };
                        }
                    } else {
                        const minBase = iibbRet.minBase || 0;
                        if (iibbRet.baseAmount < minBase) {
                            if (validation.status !== 'WARNING') {
                                validation = { status: 'OK', message: `Correcto: Base (${iibbRet.baseAmount}) inferior al mínimo (${minBase}). No corresponde retener.` };
                            }
                        } else {
                            validation = {
                                status: 'ERROR',
                                message: `Error: Base (${iibbRet.baseAmount}) supera el mínimo (${minBase}) pero se retuvo $0.`
                            };
                        }
                    }
                } else {
                    if (expectedIIBBRate > 0) {
                        validation = {
                            status: 'ERROR',
                            message: `Falta Retención: se esperaba ${expectedIIBBRate}%${convenioLabel}. No se encontró retención de IIBB.`
                        };
                    }
                }

            } else {
                validation = {
                    status: 'UNKNOWN',
                    message: 'Proveedor no encontrado en Padrón. Verifique si corresponde alícuota general.'
                };
            }
        }

        // Verificar PADRON_TEM
        if (cuit) {
            try {
                const cleanCuit = cuit.trim();
                const temResult = await db.request()
                    .input('cuit', 'VarChar', cleanCuit)
                    .query(`SELECT NOMBRE, PERIODO FROM ${MASTER_DB}.dbo.PADRON_TEM WHERE CUIT = @cuit`);

                const inPadronTEM = temResult.recordset.length > 0;

                // Tasa TEM esperada según padrón TEM y convenio IIBB:
                // - No figura en padrón TEM           → 2.5%
                // - Figura en padrón TEM, convenio CM → 0.625%
                // - Figura en padrón TEM, otro conv.  → 1.25%
                let expectedTEMRate;
                if (!inPadronTEM) {
                    expectedTEMRate = 2.5;
                } else if (convenio === 'CM') {
                    expectedTEMRate = 0.625;
                } else {
                    expectedTEMRate = 1.25;
                }

                const temRet = retentions.find(r => {
                    const n = (r.name || '').toUpperCase();
                    return n.includes('TEM') || n.includes('MUNIC') || n.includes('TASAS');
                });
                const hasTEMRetention = !!(temRet && temRet.amount > 0);

                let temStatus, temMessage;
                if (hasTEMRetention) {
                    const effectiveTEMRate = (temRet.amount / temRet.baseAmount) * 100;
                    const rateMatch = Math.abs(effectiveTEMRate - expectedTEMRate) < 0.01;
                    if (rateMatch) {
                        temStatus = 'OK';
                        temMessage = `Correcto: ${expectedTEMRate}% aplicado. Tasa efectiva: ${effectiveTEMRate.toFixed(3)}%`;
                    } else {
                        temStatus = 'ERROR';
                        temMessage = `Discrepancia TEM: se esperaba ${expectedTEMRate}%, se retuvo efectivamente ${effectiveTEMRate.toFixed(3)}%`;
                    }
                } else {
                    temStatus = 'ERROR';
                    temMessage = `Falta retención TEM: corresponde ${expectedTEMRate}%${inPadronTEM ? ' (figura en padrón TEM)' : ' (tasa general)'}`;
                }

                if (inPadronTEM) {
                    const temRow = temResult.recordset[0];
                    temValidation = {
                        found: true,
                        nombre: temRow.NOMBRE,
                        periodo: temRow.PERIODO,
                        hasRetention: hasTEMRetention,
                        expectedRate: expectedTEMRate,
                        status: temStatus,
                        message: temMessage,
                    };
                } else {
                    temValidation = {
                        found: false,
                        hasRetention: hasTEMRetention,
                        expectedRate: expectedTEMRate,
                        status: temStatus,
                        message: temMessage,
                    };
                }
            } catch (temErr) {
                console.warn('No se pudo verificar PADRON_TEM:', temErr.message);
            }
        }

        res.json({
            retentions,
            padron: padronData,
            validation,
            temValidation,
            providerCuit: cuit
        });

    } catch (e) {
        console.error("Error fetching retentions:", e);
        res.status(500).json({ error: e.message });
    }
});

// Cambio masivo de estado de OPs
app.post('/api/orders/bulk-status',
    requireRole('ADMINISTRADOR'),
    async (req, res) => {
        try {
            const { opIds, status } = req.body;
            if (!Array.isArray(opIds) || opIds.length === 0) return res.status(400).json({ error: 'opIds requerido' });
            const allowed = ['Revisada', 'Transferida'];
            if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado no válido. Use Revisada o Transferida.' });

            const username = req.user.username;
            const masterDb = await getMasterDb();
            let updated = 0;

            for (const opId of opIds) {
                const id = String(opId).trim();
                const exists = await masterDb.request()
                    .input('id', 'VarChar', id)
                    .query(`SELECT N_COMP FROM ${MASTER_DB}.dbo.APP_OP_ESTADOS WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`);

                if (exists.recordset.length > 0) {
                    await masterDb.request()
                        .input('id', 'VarChar', id)
                        .input('status', 'VarChar', status)
                        .input('user', 'VarChar', username)
                        .query(`UPDATE ${MASTER_DB}.dbo.APP_OP_ESTADOS SET ESTADO = @status, FECHA_MODIFICACION = GETDATE(), USUARIO_MODIFICACION = @user WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`);
                } else {
                    await masterDb.request()
                        .input('id', 'VarChar', id)
                        .input('status', 'VarChar', status)
                        .input('user', 'VarChar', username)
                        .query(`INSERT INTO ${MASTER_DB}.dbo.APP_OP_ESTADOS (N_COMP, ESTADO, USUARIO_MODIFICACION) VALUES (@id, @status, @user)`);
                }
                updated++;
            }

            res.json({ success: true, updated });
        } catch (e) {
            console.error('Error en bulk-status:', e);
            res.status(500).json({ error: e.message });
        }
    }
);

// Confirmar Revisión — genera PDF comprobante (sin enviar email)
app.post('/api/orders/:id/review',
    requireRole('ADMINISTRADOR'),
    async (req, res) => {
        try {
            const id = req.params.id.trim();
            const username = req.user.username;
            const database = req.user.database;
            const db = await getDb(req);

            // ----------------------------------------------------------------
            // 1. Validar que la OP no esté ya TRANSFERIDA
            // ----------------------------------------------------------------
            const masterDb = await getMasterDb();
            const statusCheck = await masterDb.request().input('id', 'VarChar', id).query(
                `SELECT ESTADO FROM APP_OP_ESTADOS WITH (NOLOCK) WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`
            );
            const currentStatus = statusCheck.recordset[0]?.ESTADO?.trim();

            if (currentStatus) {
                const upperStatus = String(currentStatus).toUpperCase();
                if (upperStatus === 'TRANSFERIDA') {
                    return res.status(400).json({ error: 'No se puede modificar una OP que ya fue transferida.' });
                }
                if (upperStatus === 'REVISADA') {
                    return res.status(400).json({ error: 'La orden de pago ya fue revisada.' });
                }
            }

            // ----------------------------------------------------------------
            // 2. UPSERT estado — persistir en BD maestra (APP_OP_ESTADOS)
            // ----------------------------------------------------------------
            const checkQuery = `SELECT 1 FROM APP_OP_ESTADOS WITH (NOLOCK) WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`;
            const check = await masterDb.request().input('id', 'VarChar', id).query(checkQuery);

            if (check.recordset.length > 0) {
                await masterDb.request()
                    .input('id', 'VarChar', id)
                    .input('user', 'VarChar', username)
                    .query(`UPDATE APP_OP_ESTADOS SET ESTADO = 'Revisada', FECHA_MODIFICACION = GETDATE(), USUARIO_MODIFICACION = @user WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`);
            } else {
                await masterDb.request()
                    .input('id', 'VarChar', id)
                    .input('user', 'VarChar', username)
                    .query(`INSERT INTO APP_OP_ESTADOS (N_COMP, ESTADO, FECHA_MODIFICACION, USUARIO_MODIFICACION) VALUES (@id, 'Revisada', GETDATE(), @user)`);
            }

            // ----------------------------------------------------------------
            // 2. EXTRACCIÓN DE DATOS para el comprobante PDF
            // ----------------------------------------------------------------

            // 2a. OP principal + proveedor — solo columnas confirmadas en todas las versiones de Tango
            const opQuery = `
                SELECT
                    op.N_COMP           as opNumber,
                    op.FECHA_EMIS       as opDate,
                    op.IMPORTE_TO       as grossAmount,
                    prov.NOM_PROVEE     as provName,
                    ISNULL(prov.N_CUIT, '')  as provCuit,
                    ISNULL(prov.E_MAIL, '')  as provEmail
                FROM CPA04 op
                JOIN CPA01 prov ON op.COD_PROVEE = prov.COD_PROVEE
                WHERE LTRIM(RTRIM(op.N_COMP)) = LTRIM(RTRIM(@id))
            `;
            const opResult = await db.request().input('id', 'VarChar', id).query(opQuery);

            if (!opResult.recordset.length) {
                return res.json({ success: true, emailSent: false, pdfBase64: null, reason: 'op-not-found' });
            }
            const opRow = opResult.recordset[0];

            // 2a-ext. Columnas opcionales de Tango (varían según versión: ING_BRUTOS, DOMICILIO, LOCALIDAD, CBU)
            let provIibb = '', provAddress = '', provProvince = '', provCbu = '';
            try {
                const extQuery = `
                    SELECT
                        ISNULL(prov.ING_BRUTOS, '') as provIibb,
                        ISNULL(prov.DOMICILIO, '')  as provAddress,
                        ISNULL(prov.LOCALIDAD, '')  as provProvince,
                        ISNULL(prov.CBU, '')        as provCbu
                    FROM CPA01 prov
                    WHERE prov.COD_PROVEE = (
                        SELECT COD_PROVEE FROM CPA04
                        WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))
                    )
                `;
                const extResult = await db.request().input('id', 'VarChar', id).query(extQuery);
                if (extResult.recordset.length) {
                    provIibb    = extResult.recordset[0].provIibb    || '';
                    provAddress = extResult.recordset[0].provAddress  || '';
                    provProvince= extResult.recordset[0].provProvince || '';
                    provCbu     = extResult.recordset[0].provCbu      || '';
                }
            } catch (extErr) {
                console.warn(`⚠️  Columnas opcionales de CPA01 no disponibles en este Tango: ${extErr.message}`);
            }

            // 2b. Facturas imputadas
            const invQuery = `
                SELECT
                    imp.T_COMP_FAC  as invoiceType,
                    imp.N_COMP_FAC  as invoiceNumber,
                    imp.IMPORT_CAN  as amountPaid
                FROM CPA05 imp
                WHERE LTRIM(RTRIM(imp.N_COMP_CAN)) = LTRIM(RTRIM(@id))
            `;
            const invResult = await db.request().input('id', 'VarChar', id).query(invQuery);

            // 2c. Retenciones (con descripción) — IMP_PAGO como base, N_CERTIFIC para certificado
            const retQuery = `
                SELECT
                    r.COD_RETEN                 as code,
                    ISNULL(c.DESCRIPCIO, r.COD_RETEN) as name,
                    r.IMP_PAGO                   as baseAmount,
                    r.IMP_RETEN                  as amount,
                    r.N_CERTIFIC                 as certificado
                FROM CPA29 r
                LEFT JOIN (
                    SELECT COD_RETEN, TIPO_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO
                    FROM CPA28
                    GROUP BY COD_RETEN, TIPO_RETEN
                ) c ON r.COD_RETEN = c.COD_RETEN AND r.TIPO_RETEN = c.TIPO_RETEN
                WHERE LTRIM(RTRIM(r.N_COMP)) = LTRIM(RTRIM(@id)) AND r.T_COMP = 'O/P'
            `;
            const retResult = await db.request().input('id', 'VarChar', id).query(retQuery);

            // Separar IIBB vs TEM
            const allRetentions = retResult.recordset;
            const retentionsIB = allRetentions.filter(r => {
                const n = (r.name || '').toUpperCase();
                return n.includes('BRUTO') || n.includes('IIBB') || n.includes('IB ') || n.includes('RENTA');
            });
            const retentionsTEM = allRetentions.filter(r => {
                const n = (r.name || '').toUpperCase();
                return n.includes('TEM') || n.includes('MUNIC') || n.includes('TASAS');
            });
            // Retenciones que no encajan en ninguna categoría → las ponemos en IIBB
            const categorized = new Set([...retentionsIB, ...retentionsTEM]);
            allRetentions.forEach(r => {
                if (!categorized.has(r)) retentionsIB.push(r);
            });

            // 2d. Cuenta (SBA05 + SBA01 para descripción)
            // Nota: SBA01 es la tabla maestra de cuentas de tesorería en Tango.
            // Si la descripción no existe, usar NOM_CTA en lugar de DESCRIPCIO.
            let account = { code: '', description: '' };
            try {
                let accountQuery = `
                    SELECT TOP 1
                        ISNULL(s05.COD_CTA, '')           as accountCode,
                        ISNULL(cta.DESCRIPCIO, '')        as accountDesc
                    FROM SBA04 s04
                    JOIN SBA05 s05 ON s04.N_COMP = s05.N_COMP AND s04.ID_SBA02 = s05.ID_SBA02
                    LEFT JOIN SBA01 cta ON LTRIM(RTRIM(s05.COD_CTA)) = LTRIM(RTRIM(cta.COD_CTA))
                    WHERE LTRIM(RTRIM(s04.N_COMP)) = LTRIM(RTRIM(@id))
                `;
                let accountResult = await db.request().input('id', 'VarChar', id).query(accountQuery);
                if (accountResult.recordset.length) {
                    const row = accountResult.recordset[0];
                    account = {
                        code: (row.accountCode || '').trim(),
                        description: (row.accountDesc || '').trim(),
                    };
                }
            } catch (accErr) {
                try {
                    const fallbackQuery = `
                        SELECT TOP 1 ISNULL(s05.COD_CTA, '') as accountCode
                        FROM SBA04 s04
                        JOIN SBA05 s05 ON s04.N_COMP = s05.N_COMP AND s04.ID_SBA02 = s05.ID_SBA02
                        WHERE LTRIM(RTRIM(s04.N_COMP)) = LTRIM(RTRIM(@id))
                    `;
                    const fallbackResult = await db.request().input('id', 'VarChar', id).query(fallbackQuery);
                    if (fallbackResult.recordset.length) {
                        account.code = (fallbackResult.recordset[0].accountCode || '').trim();
                    }
                } catch (_) { }
                console.warn(`⚠️  No se pudo obtener cuenta para OP ${id}: ${accErr.message}`);
            }

            // 2e. Movimientos de tesorería (SBA05 filtrado por N_COMP + COD_COMP tipo OP)
            let treasuryMovements = [];
            try {
                const treasuryQuery = `
                    SELECT
                        s5.COD_CTA as cuenta,
                        ISNULL(s1.DESCRIPCIO, 'Sin descripción') as descripcion,
                        s5.LEYENDA as leyenda,
                        s5.MONTO as importe
                    FROM SBA05 s5 WITH (NOLOCK)
                    LEFT JOIN SBA01 s1 WITH (NOLOCK) ON s5.COD_CTA = s1.COD_CTA
                    WHERE LTRIM(RTRIM(s5.N_COMP)) = LTRIM(RTRIM(@id))
                      AND REPLACE(s5.COD_COMP, '/', '') LIKE '%OP%'
                      AND s5.RENGLON > 0
                `;
                const treasuryResult = await db.request()
                    .input('id', 'VarChar', id)
                    .query(treasuryQuery);
                treasuryMovements = (treasuryResult.recordset || []).map(r => ({
                    cuenta: String(r.cuenta ?? '').trim(),
                    descripcion: String(r.descripcion ?? '').trim(),
                    leyenda: String(r.leyenda ?? '').trim(),
                    monto: Number(r.importe ?? r.monto) || 0,
                }));
            } catch (treasuryErr) {
                console.warn(`⚠️  No se pudieron obtener movimientos de tesorería para OP ${id}:`, treasuryErr.message);
            }

            // ----------------------------------------------------------------
            // 3. GENERAR PDF
            // ----------------------------------------------------------------
            const company = await getCompanyDataFromDb(db, database);
            const provider = {
                name: opRow.provName,
                cuit: opRow.provCuit,
                iibb: provIibb,
                address: provAddress,
                province: provProvince,
                email: opRow.provEmail,
                cbu: provCbu,
            };
            const op = {
                number: opRow.opNumber,
                date: opRow.opDate,
                grossAmount: opRow.grossAmount,
            };

            let pdfBuffer = null;
            let pdfBase64 = null;
            try {
                pdfBuffer = await generateComprobantePDF({
                    company,
                    provider,
                    op,
                    invoices: invResult.recordset,
                    retentionsIB,
                    retentionsTEM,
                    account,
                    treasuryMovements,
                });
                pdfBase64 = pdfBuffer.toString('base64');
                console.log(`📄 PDF generado para OP ${id} (${pdfBuffer.length} bytes)`);
            } catch (pdfErr) {
                console.error(`❌ Error generando PDF para OP ${id}:`, pdfErr.message);
            }

            // ----------------------------------------------------------------
            // 4. RESPUESTA (sin envío de email — se envía desde Consultar Lotes)
            // ----------------------------------------------------------------
            return res.json({
                success: true,
                status: 'REVISADA',
                pdfBase64,
            });

        } catch (e) {
            console.error("Error marking as reviewed:", e);
            res.status(500).json({ error: e.message });
        }
    }
);


// ---- COMPROBANTE PDF (sin cambiar estado) ----

app.get('/api/orders/:id/comprobante',
    authenticate,
    async (req, res) => {
        try {
            const id = (req.params.id || '').trim();
            const database = req.user?.database || MASTER_DB;
            const db = await getDb(req);

            // OP + proveedor
            const opResult = await db.request().input('id', 'VarChar', id).query(`
                SELECT op.N_COMP as opNumber, op.FECHA_EMIS as opDate, op.IMPORTE_TO as grossAmount,
                       prov.NOM_PROVEE as provName, ISNULL(prov.N_CUIT,'') as provCuit,
                       ISNULL(prov.E_MAIL,'') as provEmail
                FROM CPA04 op JOIN CPA01 prov ON op.COD_PROVEE = prov.COD_PROVEE
                WHERE LTRIM(RTRIM(op.N_COMP)) = LTRIM(RTRIM(@id))
            `);
            if (!opResult.recordset.length) return res.status(404).json({ error: 'OP no encontrada' });
            const opRow = opResult.recordset[0];

            // Columnas opcionales (CBU incluido)
            let provIibb = '', provAddress = '', provProvince = '', provCbu = '';
            try {
                const extResult = await db.request().input('id', 'VarChar', id).query(`
                    SELECT ISNULL(prov.ING_BRUTOS,'') as provIibb, ISNULL(prov.DOMICILIO,'') as provAddress,
                           ISNULL(prov.LOCALIDAD,'') as provProvince, ISNULL(prov.CBU,'') as provCbu
                    FROM CPA01 prov WHERE prov.COD_PROVEE = (SELECT COD_PROVEE FROM CPA04 WHERE LTRIM(RTRIM(N_COMP))=LTRIM(RTRIM(@id)))
                `);
                if (extResult.recordset.length) {
                    provIibb     = extResult.recordset[0].provIibb     || '';
                    provAddress  = extResult.recordset[0].provAddress  || '';
                    provProvince = extResult.recordset[0].provProvince || '';
                    provCbu      = extResult.recordset[0].provCbu      || '';
                }
            } catch (_) { }

            // Facturas (con vencimiento)
            const invResult = await db.request().input('id', 'VarChar', id).query(`
                SELECT imp.T_COMP_FAC as invoiceType, imp.N_COMP_FAC as invoiceNumber,
                       imp.IMPORT_CAN as amountPaid, imp.FECHA_VTO as invoiceVto
                FROM CPA05 imp WHERE LTRIM(RTRIM(imp.N_COMP_CAN))=LTRIM(RTRIM(@id))
            `);

            // Retenciones
            const retResult = await db.request().input('id', 'VarChar', id).query(`
                SELECT r.COD_RETEN as code, ISNULL(c.DESCRIPCIO, r.COD_RETEN) as name,
                       r.IMP_PAGO as baseAmount, r.IMP_RETEN as amount, r.N_CERTIFIC as certificado
                FROM CPA29 r
                LEFT JOIN (SELECT COD_RETEN, TIPO_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO FROM CPA28 GROUP BY COD_RETEN, TIPO_RETEN) c ON r.COD_RETEN=c.COD_RETEN AND r.TIPO_RETEN=c.TIPO_RETEN
                WHERE LTRIM(RTRIM(r.N_COMP))=LTRIM(RTRIM(@id)) AND r.T_COMP='O/P'
            `);
            const allRet = retResult.recordset;
            const retentionsIB  = allRet.filter(r => { const n=(r.name||'').toUpperCase(); return n.includes('BRUTO')||n.includes('IIBB')||n.includes('IB ')||n.includes('RENTA'); });
            const retentionsTEM = allRet.filter(r => { const n=(r.name||'').toUpperCase(); return n.includes('TEM')||n.includes('MUNIC')||n.includes('TASAS'); });
            const categorized = new Set([...retentionsIB, ...retentionsTEM]);
            allRet.forEach(r => { if (!categorized.has(r)) retentionsIB.push(r); });

            // Cuenta
            let account = { code: '', description: '' };
            try {
                const accResult = await db.request().input('id', 'VarChar', id).query(`
                    SELECT TOP 1 ISNULL(s05.COD_CTA,'') as accountCode, ISNULL(cta.DESCRIPCIO,'') as accountDesc
                    FROM SBA04 s04 JOIN SBA05 s05 ON s04.N_COMP=s05.N_COMP AND s04.ID_SBA02=s05.ID_SBA02
                    LEFT JOIN SBA01 cta ON LTRIM(RTRIM(s05.COD_CTA))=LTRIM(RTRIM(cta.COD_CTA))
                    WHERE LTRIM(RTRIM(s04.N_COMP))=LTRIM(RTRIM(@id))
                `);
                if (accResult.recordset.length) {
                    account = { code: (accResult.recordset[0].accountCode||'').trim(), description: (accResult.recordset[0].accountDesc||'').trim() };
                }
            } catch (_) { }

            // Tesorería
            let treasuryMovements = [];
            try {
                const tResult = await db.request().input('id', 'VarChar', id).query(`
                    SELECT s5.COD_CTA as cuenta, ISNULL(s1.DESCRIPCIO,'Sin descripción') as descripcion,
                           s5.LEYENDA as leyenda, s5.MONTO as importe
                    FROM SBA05 s5 WITH (NOLOCK) LEFT JOIN SBA01 s1 WITH (NOLOCK) ON s5.COD_CTA=s1.COD_CTA
                    WHERE LTRIM(RTRIM(s5.N_COMP))=LTRIM(RTRIM(@id)) AND REPLACE(s5.COD_COMP,'/','') LIKE '%OP%' AND s5.RENGLON>0
                `);
                treasuryMovements = (tResult.recordset||[]).map(r => ({
                    cuenta: String(r.cuenta??'').trim(), descripcion: String(r.descripcion??'').trim(),
                    leyenda: String(r.leyenda??'').trim(), monto: Number(r.importe??r.monto)||0,
                }));
            } catch (_) { }

            const company  = await getCompanyDataFromDb(db, database);
            const provider = { name: opRow.provName, cuit: opRow.provCuit, iibb: provIibb, address: provAddress, province: provProvince, email: opRow.provEmail, cbu: provCbu };
            const op       = { number: opRow.opNumber, date: opRow.opDate, grossAmount: opRow.grossAmount };

            const pdfBuffer = await generateComprobantePDF({ company, provider, op, invoices: invResult.recordset, retentionsIB, retentionsTEM, account, treasuryMovements });

            res.json({ pdfBase64: pdfBuffer.toString('base64') });

        } catch (e) {
            console.error('Error generando comprobante:', e);
            res.status(500).json({ error: e.message });
        }
    }
);

// ---- TESORERÍA (solo ADMINISTRADOR) ----

app.post('/api/treasury/process',
    requireRole('ADMINISTRADOR'),
    async (req, res) => {
        try {
            const { opIds, accountId, fileName: customFileName } = req.body;

            if (!opIds || opIds.length === 0) {
                return res.status(400).json({ error: 'No se seleccionaron órdenes de pago.' });
            }

            const db = await getDb(req);
            const database = req.user?.database || MASTER_DB;

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

            // JSON stringify debug data for API response
            const opsResult = await db.query(opsQuery);
            const opsData = opsResult.recordset;

            const sinCbu = opsData.filter(op => !String(op.CBU || '').replace(/[^0-9]/g, ''));
            if (sinCbu.length > 0) {
                const nros = sinCbu.map(op => String(op.N_COMP || '').trim()).join(', ');
                return res.status(400).json({
                    error: `Las siguientes OPs no tienen CBU cargado y no pueden transferirse: ${nros}. Completá el CBU del proveedor en Tango antes de procesar.`
                });
            }

            let txtContent = '';

            for (const op of opsData) {
                const montoNeto = (op.IMPORTE_TO || 0) - (op.TOTAL_RETENCIONES || 0);

                // Formato de Ancho Fijo (Fixed-Width) según "Diseño de Registro" del banco:
                // CBU_CREDITO(22) + IMPORTE(12, centavos sin punto) + CONCEPTO(3) + REFERENCIA(12) + EMAIL(50) + CRLF
                const cbu = (op.CBU || '').replace(/[^0-9]/g, '').padStart(22, '0').substring(0, 22);
                const importeCentavos = Math.round(montoNeto * 100);
                const importeStr = String(importeCentavos).padStart(12, '0');
                const concepto = 'FAC'; // Uno de: VAR, ALQ, CUO, EXP, FAC, PRE, SEG, HON
                const nComp = (op.N_COMP || '').trim().replace(/[^a-zA-Z0-9]/g, '');
                const referencia = nComp.slice(-12).padEnd(12, ' ');
                const email = (op.E_MAIL || '').padEnd(50, ' ').substring(0, 50);

                txtContent += `${cbu}${importeStr}${concepto}${referencia}${email}\r\n`;
            }

            const masterDb = await getMasterDb();
            const updateReq = masterDb.request();
            opIds.forEach((opId, i) => updateReq.input(`op${i}`, 'VarChar', opId));
            const opPlaceholders = opIds.map((_, i) => `LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@op${i}))`).join(' OR ');
            await updateReq.query(`UPDATE APP_OP_ESTADOS SET ESTADO = 'Transferida', FECHA_MODIFICACION = GETDATE() WHERE ${opPlaceholders}`);

            const totalAmount = opsData.reduce((sum, op) => sum + ((op.IMPORTE_TO || 0) - (op.TOTAL_RETENCIONES || 0)), 0);
            const fileName = customFileName || `transferencias_${Date.now()}.txt`;

            let loteId = 0;
            let usedTransaction = false;

            // APP_LOTES se guarda en BD maestra (CENTRAL) para persistir entre reinicios
            const dbNameEscaped = (database || MASTER_DB).replace(/'/g, "''");

            if (adapter.type !== 'sqlite') {
                try {
                    await runMssqlTransaction(MASTER_DB, async (txRequest) => {
                        const insertLote = await txRequest.query(`
                            INSERT INTO APP_LOTES ([DATABASE], FECHA_CREACION, CANTIDAD_OPS, MONTO_TOTAL, NOMBRE_ARCHIVO)
                            OUTPUT INSERTED.ID
                            VALUES ('${dbNameEscaped}', GETDATE(), ${opsData.length}, ${totalAmount}, '${fileName.replace(/'/g, "''")}')
                        `);
                        loteId = insertLote.recordset[0].ID;

                        for (const op of opsData) {
                            const montoNeto = (op.IMPORTE_TO || 0) - (op.TOTAL_RETENCIONES || 0);
                            const prov = String(op.NOM_PROVEE ?? '').replace(/'/g, "''");
                            const nComp = String(op.N_COMP ?? '').trim().replace(/'/g, "''");
                            try {
                                await txRequest.query(`
                                    INSERT INTO APP_LOTES_DETALLE (LOTE_ID, N_COMP, N_COMP_OP, PROVEEDOR, MONTO_PAGO)
                                    VALUES (${loteId}, '${nComp}', '${nComp}', '${prov}', ${montoNeto})
                                `);
                            } catch (detErr) {
                                await txRequest.query(`
                                    INSERT INTO APP_LOTES_DETALLE (LOTE_ID, N_COMP_OP)
                                    VALUES (${loteId}, '${nComp}')
                                `);
                            }
                        }
                    });
                    usedTransaction = true;
                } catch (txErr) {
                    console.warn('⚠️ Transacción MSSQL fallida, usando inserción directa:', txErr.message);
                }
            }

            if (!usedTransaction || loteId === 0) {
                if (adapter.type === 'sqlite') {
                    await masterDb.query(`
                        INSERT INTO APP_LOTES ([DATABASE], FECHA_CREACION, CANTIDAD_OPS, MONTO_TOTAL, NOMBRE_ARCHIVO)
                        VALUES ('${dbNameEscaped}', datetime('now'), ${opsData.length}, ${totalAmount}, '${fileName.replace(/'/g, "''")}')
                    `);
                    const idRes = await masterDb.query("SELECT last_insert_rowid() as ID");
                    loteId = idRes.recordset[0].ID;
                } else {
                    const resLote = await masterDb.query(`
                        INSERT INTO APP_LOTES ([DATABASE], FECHA_CREACION, CANTIDAD_OPS, MONTO_TOTAL, NOMBRE_ARCHIVO)
                        OUTPUT INSERTED.ID
                        VALUES ('${dbNameEscaped}', GETDATE(), ${opsData.length}, ${totalAmount}, '${fileName.replace(/'/g, "''")}')
                    `);
                    loteId = resLote.recordset[0].ID;
                }
                for (const op of opsData) {
                    const montoNeto = (op.IMPORTE_TO || 0) - (op.TOTAL_RETENCIONES || 0);
                    const prov = String(op.NOM_PROVEE ?? '').replace(/'/g, "''");
                    const nComp = String(op.N_COMP ?? '').trim().replace(/'/g, "''");
                    await masterDb.query(`
                        INSERT INTO APP_LOTES_DETALLE (LOTE_ID, N_COMP, N_COMP_OP, PROVEEDOR, MONTO_PAGO)
                        VALUES (${loteId}, '${nComp}', '${nComp}', '${prov}', ${montoNeto})
                    `);
                }
            }

            let pdfBase64 = null;
            try {
                const company = await getCompanyDataFromDb(db, database);
                const pdfItems = opsData.map(op => ({
                    nComp: op.N_COMP,
                    proveedor: op.NOM_PROVEE,
                    monto: (op.IMPORTE_TO || 0) - (op.TOTAL_RETENCIONES || 0),
                }));
                const pdfBuffer = await generateLotePDF({
                    company,
                    loteId,
                    fileName,
                    items: pdfItems,
                    montoTotal: totalAmount,
                });
                pdfBase64 = pdfBuffer.toString('base64');
            } catch (pdfErr) {
                console.warn('⚠️ No se pudo generar PDF del lote:', pdfErr.message);
            }

            res.json({
                success: true,
                message: `Lote procesado. ${opsData.length} pagos generados. Lote N° ${loteId} guardado.`,
                loteId,
                txtContent: txtContent,
                fileName: fileName,
                pdfBase64: pdfBase64,
                movementId: `Lote ${new Date().toLocaleDateString()} (ID: ${loteId})`,
                _debugOpsData: opsData
            });

        } catch (e) {
            console.error("Error processing treasury batch:", e);
            res.status(500).json({ error: e.message, stack: e.stack });
        }
    }
);

// ---- HISTORIAL DE LOTES (desde BD maestra CENTRAL) ----

app.get('/api/batches', async (req, res) => {
    try {
        const db = await getMasterDb();
        const userDb = (req.user?.database || MASTER_DB).replace(/'/g, "''");
        const query = `
            SELECT 
                ID,
                FECHA_CREACION,
                CANTIDAD_OPS,
                MONTO_TOTAL,
                NOMBRE_ARCHIVO
            FROM APP_LOTES WITH (NOLOCK)
            WHERE ISNULL([DATABASE], 'CENTRAL') = '${userDb}'
            ORDER BY FECHA_CREACION DESC, ID DESC
        `;
        const result = await db.query(query);
        const rows = result.recordset || [];
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/batches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const loteId = parseInt(id, 10);
        if (isNaN(loteId)) return res.status(400).json({ error: 'ID inválido' });
        const masterDb = await getMasterDb();
        const userDb = (req.user?.database || MASTER_DB).replace(/'/g, "''");

        // Detalle desde BD maestra (PROVEEDOR y MONTO_PAGO ya guardados al crear el lote)
        const query = `
            SELECT
                ISNULL(d.N_COMP, d.N_COMP_OP) as number,
                ISNULL(d.MONTO_PAGO, 0) as amount,
                ISNULL(d.PROVEEDOR, '-') as providerName,
                ISNULL(e.EMAIL_ENVIADO, 0) as emailEnviado
            FROM APP_LOTES_DETALLE d WITH (NOLOCK)
            INNER JOIN APP_LOTES l WITH (NOLOCK) ON d.LOTE_ID = l.ID
            LEFT JOIN APP_OP_ESTADOS e WITH (NOLOCK) ON LTRIM(RTRIM(e.N_COMP)) = LTRIM(RTRIM(ISNULL(d.N_COMP, d.N_COMP_OP)))
            WHERE d.LOTE_ID = ${loteId} AND ISNULL(l.[DATABASE], 'CENTRAL') = '${userDb}'
        `;
        const result = await masterDb.query(query);
        res.json((result.recordset || []).map(r => ({ ...r, emailEnviado: !!r.emailEnviado })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---- ENVÍO DE EMAILS POR LOTE ----

app.post('/api/batches/:id/send-emails',
    requireRole('ADMINISTRADOR'),
    async (req, res) => {
        try {
            const loteId = parseInt(req.params.id, 10);
            if (isNaN(loteId)) return res.status(400).json({ error: 'ID de lote inválido' });

            const database = req.user?.database || MASTER_DB;
            const db = await getDb(req);
            const masterDb = await getMasterDb();
            const userDb = (database).replace(/'/g, "''");

            // 1. Obtener OPs del lote
            // Si el body incluye opNumbers, usar solo esas; si no, enviar todas las del lote
            const selectedOpNumbers = Array.isArray(req.body?.opNumbers) && req.body.opNumbers.length > 0
                ? req.body.opNumbers.map(s => String(s).trim()).filter(Boolean)
                : null;

            const detailQuery = `
                SELECT ISNULL(d.N_COMP, d.N_COMP_OP) as N_COMP
                FROM APP_LOTES_DETALLE d WITH (NOLOCK)
                INNER JOIN APP_LOTES l WITH (NOLOCK) ON d.LOTE_ID = l.ID
                WHERE d.LOTE_ID = ${loteId} AND ISNULL(l.[DATABASE], 'CENTRAL') = '${userDb}'
            `;
            const detailResult = await masterDb.query(detailQuery);
            let opNumbers = (detailResult.recordset || []).map(r => (r.N_COMP || '').trim()).filter(Boolean);

            if (opNumbers.length === 0) {
                return res.status(404).json({ error: 'No se encontraron OPs en este lote.' });
            }

            // Filtrar si vino selección específica
            if (selectedOpNumbers) {
                opNumbers = opNumbers.filter(n => selectedOpNumbers.includes(n));
                if (opNumbers.length === 0) {
                    return res.status(400).json({ error: 'Ninguna de las OPs seleccionadas pertenece a este lote.' });
                }
            }

            // 2. Para cada OP: extraer datos, generar PDF, enviar email
            const results = [];
            const company = await getCompanyDataFromDb(db, database);

            for (const opId of opNumbers) {
                const opResult = { opNumber: opId, sent: false, recipient: null, reason: '' };
                try {
                    // Datos de la OP + proveedor
                    const opQuery = `
                        SELECT
                            op.N_COMP as opNumber, op.FECHA_EMIS as opDate, op.IMPORTE_TO as grossAmount,
                            prov.NOM_PROVEE as provName, ISNULL(prov.N_CUIT, '') as provCuit,
                            ISNULL(prov.E_MAIL, '') as provEmail
                        FROM CPA04 op JOIN CPA01 prov ON op.COD_PROVEE = prov.COD_PROVEE
                        WHERE LTRIM(RTRIM(op.N_COMP)) = LTRIM(RTRIM(@id))
                    `;
                    const opData = await db.request().input('id', 'VarChar', opId).query(opQuery);
                    if (!opData.recordset.length) { opResult.reason = 'OP no encontrada'; results.push(opResult); continue; }
                    const opRow = opData.recordset[0];

                    // Columnas opcionales (iibb, domicilio, localidad, CBU)
                    let provIibb = '', provAddress = '', provProvince = '', provCbu = '';
                    try {
                        const extResult = await db.request().input('id', 'VarChar', opId).query(`
                            SELECT ISNULL(prov.ING_BRUTOS,'') as provIibb,
                                   ISNULL(prov.DOMICILIO,'') as provAddress,
                                   ISNULL(prov.LOCALIDAD,'') as provProvince,
                                   ISNULL(prov.CBU,'') as provCbu
                            FROM CPA01 prov WHERE prov.COD_PROVEE = (SELECT COD_PROVEE FROM CPA04 WHERE LTRIM(RTRIM(N_COMP))=LTRIM(RTRIM(@id)))
                        `);
                        if (extResult.recordset.length) {
                            provIibb    = extResult.recordset[0].provIibb    || '';
                            provAddress = extResult.recordset[0].provAddress || '';
                            provProvince= extResult.recordset[0].provProvince|| '';
                            provCbu     = extResult.recordset[0].provCbu     || '';
                        }
                    } catch (_) { }

                    // Facturas (incluye fecha de vencimiento)
                    const invResult = await db.request().input('id', 'VarChar', opId).query(`
                        SELECT imp.T_COMP_FAC as invoiceType, imp.N_COMP_FAC as invoiceNumber,
                               imp.IMPORT_CAN as amountPaid, imp.FECHA_VTO as invoiceVto
                        FROM CPA05 imp WHERE LTRIM(RTRIM(imp.N_COMP_CAN))=LTRIM(RTRIM(@id))
                    `);

                    // Retenciones
                    const retResult = await db.request().input('id', 'VarChar', opId).query(`
                        SELECT r.COD_RETEN as code, ISNULL(c.DESCRIPCIO, r.COD_RETEN) as name,
                            r.IMP_PAGO as baseAmount, r.IMP_RETEN as amount, r.N_CERTIFIC as certificado
                        FROM CPA29 r LEFT JOIN (SELECT COD_RETEN, TIPO_RETEN, MAX(DESCRIPCIO) as DESCRIPCIO FROM CPA28 GROUP BY COD_RETEN, TIPO_RETEN) c ON r.COD_RETEN=c.COD_RETEN AND r.TIPO_RETEN=c.TIPO_RETEN
                        WHERE LTRIM(RTRIM(r.N_COMP))=LTRIM(RTRIM(@id)) AND r.T_COMP='O/P'
                    `);
                    const allRetentions = retResult.recordset;
                    const retentionsIB = allRetentions.filter(r => { const n=(r.name||'').toUpperCase(); return n.includes('BRUTO')||n.includes('IIBB')||n.includes('IB ')||n.includes('RENTA'); });
                    const retentionsTEM = allRetentions.filter(r => { const n=(r.name||'').toUpperCase(); return n.includes('TEM')||n.includes('MUNIC')||n.includes('TASAS'); });
                    const categorized = new Set([...retentionsIB, ...retentionsTEM]);
                    allRetentions.forEach(r => { if (!categorized.has(r)) retentionsIB.push(r); });

                    // Cuenta
                    let account = { code: '', description: '' };
                    try {
                        const accResult = await db.request().input('id', 'VarChar', opId).query(`
                            SELECT TOP 1 ISNULL(s05.COD_CTA,'') as accountCode, ISNULL(cta.DESCRIPCIO,'') as accountDesc
                            FROM SBA04 s04 JOIN SBA05 s05 ON s04.N_COMP=s05.N_COMP AND s04.ID_SBA02=s05.ID_SBA02
                            LEFT JOIN SBA01 cta ON LTRIM(RTRIM(s05.COD_CTA))=LTRIM(RTRIM(cta.COD_CTA))
                            WHERE LTRIM(RTRIM(s04.N_COMP))=LTRIM(RTRIM(@id))
                        `);
                        if (accResult.recordset.length) {
                            account = { code: (accResult.recordset[0].accountCode||'').trim(), description: (accResult.recordset[0].accountDesc||'').trim() };
                        }
                    } catch (_) { }

                    // Movimientos de tesorería
                    let treasuryMovements = [];
                    try {
                        const tResult = await db.request().input('id', 'VarChar', opId).query(`
                            SELECT s5.COD_CTA as cuenta, ISNULL(s1.DESCRIPCIO,'Sin descripción') as descripcion, s5.LEYENDA as leyenda, s5.MONTO as importe
                            FROM SBA05 s5 WITH (NOLOCK) LEFT JOIN SBA01 s1 WITH (NOLOCK) ON s5.COD_CTA=s1.COD_CTA
                            WHERE LTRIM(RTRIM(s5.N_COMP))=LTRIM(RTRIM(@id)) AND REPLACE(s5.COD_COMP,'/','') LIKE '%OP%' AND s5.RENGLON>0
                        `);
                        treasuryMovements = (tResult.recordset||[]).map(r => ({ cuenta: String(r.cuenta??'').trim(), descripcion: String(r.descripcion??'').trim(), leyenda: String(r.leyenda??'').trim(), monto: Number(r.importe??r.monto)||0 }));
                    } catch (_) { }

                    // Generar PDF
                    const provider = { name: opRow.provName, cuit: opRow.provCuit, iibb: provIibb, address: provAddress, province: provProvince, email: opRow.provEmail, cbu: provCbu };
                    const op = { number: opRow.opNumber, date: opRow.opDate, grossAmount: opRow.grossAmount };

                    const pdfBuffer = await generateComprobantePDF({ company, provider, op, invoices: invResult.recordset, retentionsIB, retentionsTEM, account, treasuryMovements });
                    console.log(`📄 [Lote ${loteId}] PDF generado para OP ${opId} (${pdfBuffer.length} bytes)`);

                    // Leer credenciales SMTP y EMAIL_FROM desde APP_CONFIG (con fallback a .env)
                    let emailFrom, smtpUser, smtpPass;
                    try {
                        const cfgResult = await masterDb.request().query(`SELECT CLAVE, VALOR FROM APP_CONFIG WHERE CLAVE IN ('EMAIL_FROM','SMTP_USER','SMTP_PASS')`);
                        const cfg = Object.fromEntries((cfgResult.recordset || []).map(r => [r.CLAVE, r.VALOR?.trim() || undefined]));
                        emailFrom = cfg['EMAIL_FROM'];
                        smtpUser  = cfg['SMTP_USER'];
                        smtpPass  = cfg['SMTP_PASS'];
                    } catch { emailFrom = smtpUser = smtpPass = undefined; }

                    // Enviar email
                    const emailRes = await sendComprobante({ providerEmail: provider.email, providerName: provider.name, opNumber: op.number, pdfBuffer, from: emailFrom, smtpUser, smtpPass });
                    opResult.sent = emailRes.sent;
                    opResult.recipient = emailRes.recipient;
                    opResult.reason = emailRes.reason || '';

                    // Persistir flag de email enviado
                    if (emailRes.sent) {
                        try {
                            await masterDb.request()
                                .input('id', 'VarChar', String(opId).trim())
                                .query(`UPDATE ${MASTER_DB}.dbo.APP_OP_ESTADOS SET EMAIL_ENVIADO = 1 WHERE LTRIM(RTRIM(N_COMP)) = LTRIM(RTRIM(@id))`);
                        } catch (_) {}
                    }

                } catch (opErr) {
                    opResult.reason = opErr.message;
                    console.error(`❌ [Lote ${loteId}] Error procesando OP ${opId}:`, opErr.message);
                }
                results.push(opResult);
            }

            const sent = results.filter(r => r.sent).length;
            const failed = results.filter(r => !r.sent).length;
            console.log(`📧 [Lote ${loteId}] Envío completado: ${sent} enviados, ${failed} fallidos de ${opNumbers.length} OPs`);

            res.json({
                success: true,
                totalOps: opNumbers.length,
                sent,
                failed,
                details: results,
            });

        } catch (e) {
            console.error('Error sending batch emails:', e);
            res.status(500).json({ error: e.message });
        }
    }
);

// Fallback para React Router (debe ir al final de todas las rutas de API)
app.get(/(.*)/, (req, res) => {
    // Si la ruta solicitada es de API pero no existe, devolver 404 en JSON
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
    // De lo contrario, devolver index.html de React
    res.sendFile(path.join(distPath, 'index.html'));
});

// -------------------------------------------------------------------------
// Iniciar servidor
// -------------------------------------------------------------------------
async function startServer() {
    try {
        console.log("Iniciando servidor Gestión de Pagos...");

        // Conectar a BD por defecto (para initializeDatabase)
        const db = await adapter.connect(process.env.DB_DATABASE);

        // Inicializar esquema (si cayó a SQLite, getSqliteDb() ya lo inicializó)
        if (db.type !== 'sqlite') {
            await initializeDatabase(db);
        }

        app.listen(PORT, () => {
            console.log(`\n✅ Servidor listo en puerto ${PORT}.`);
            console.log(`   API disponible en: http://localhost:${PORT}`);
            console.log(`   Usuario por defecto: ADMIN / admin (Administrador)`);
            console.log(`   Gestión de usuarios disponible desde la aplicación.`);

            // Autoabrir el navegador en Windows si estamos corriendo como ejecutable
            if (process.platform === 'win32') {
                setTimeout(() => {
                    try {
                        execProcess(`start http://localhost:${PORT}`);
                    } catch (err) {
                        console.error('No se pudo abrir el navegador:', err.message);
                    }
                }, 1000);
            }
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n❌ ERROR: El puerto ${PORT} ya está en uso. ¿Hay otro servidor de Gestión de Pagos ejecutándose? Cierralo primero.`);
                process.exit(1);
            }
            throw err;
        });

    } catch (err) {
        console.error("Error al iniciar la aplicación:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        process.exit(1);
    }
}

startServer();
